const OpenAI = require("openai");
const { openAiApiKey, openAiModel } = require("../config/env");
const { handleToolCall } = require("../tools/greetingTools");
const {
  handleToolCall: handleDeliveryToolCall,
} = require("../tools/deliveryTools");
const { getActiveIntentions } = require("../repositories/intentionRepository");
const {
  findActiveCategoryByName,
  getActiveCategories,
} = require("../repositories/categoryRepository");
const {
  findActiveProductSelection,
  getActiveProductsByCategoryId,
} = require("../repositories/productRepository");
const {
  createOrder,
} = require("../repositories/orderRepository");
const { findClosestBranchCoverage } = require("../repositories/branchRepository");
const { geocodeAddress } = require("../services/mapsService");
const {
  findConversationStateIdByName,
  updateConversationCategory,
  updateConversationIntent,
  updateConversationState,
} = require("../repositories/conversationRepository");

const client = new OpenAI({ apiKey: openAiApiKey });

const GREETING_PATTERNS = [
  /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)[!. ]*$/i,
];

function isGreetingMessage(message) {
  const normalized = String(message || "").trim();
  return GREETING_PATTERNS.some((pattern) => pattern.test(normalized));
}

async function detectIntentionWithOpenAI(message, intentions) {
  const allowedIntentions = intentions.map((item) => item.nombre);

  const completion = await client.chat.completions.create({
    model: openAiModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Clasifica la intencion del cliente usando solamente una de las intenciones permitidas. Si el mensaje no coincide claramente con una intencion, devuelve null. Responde solo JSON con la forma {\"intencion\": string|null}. No inventes nombres fuera de la lista.",
      },
      {
        role: "user",
        content: `Intenciones permitidas: ${allowedIntentions.join(
          ", "
        )}\nMensaje del cliente: ${message}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    return null;
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch (_error) {
    return null;
  }

  const detectedName =
    typeof parsed.intencion === "string" ? parsed.intencion.trim() : null;

  if (!detectedName) {
    return null;
  }

  return allowedIntentions.includes(detectedName) ? detectedName : null;
}

async function buildGreetingReply(message, nombreCliente) {
  const result = await handleToolCall("saludar_con_categorias", {
    nombreCliente,
    mensajeCliente: message,
  });

  return result.saludo;
}

async function detectCategoryInMessage(message) {
  return findActiveCategoryByName(message);
}

function buildCategoryConfirmedReply(category) {
  return `Perfecto, trabajaremos con la categoria ${category.tipoCategoria}. Ahora te mostrare las opciones disponibles.`;
}

async function buildCategoryRetryReply(nombreCliente) {
  return buildGreetingReply("Hola", nombreCliente);
}

function formatMoney(amount) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildProductListReply(category, products) {
  if (products.length === 0) {
    return `Ya elegiste la categoria ${category.tipoCategoria}, pero por ahora no tengo productos activos disponibles en esa categoria.`;
  }

  const productLines = products
    .map((product, index) => {
      const description = product.descripcion ? ` - ${product.descripcion}` : "";
      return `${index + 1}. ${product.nombre} - ${formatMoney(product.precio)}${description}`;
    })
    .join("\n");

  return `Perfecto, trabajaremos con la categoria ${category.tipoCategoria}. Estas son las opciones disponibles:\n\n${productLines}`;
}

async function buildProductSelectedReply(product) {
  const result = await handleDeliveryToolCall("solicitar_direccion_entrega", {
    nombreProducto: `${product.nombre} por ${formatMoney(product.precio)}`,
  });

  return result.mensaje;
}

function getLastBotMessage(recentMessages) {
  return [...(recentMessages || [])].reverse().find((item) => item.rol === "bot");
}

function getLastUserMessage(recentMessages) {
  return [...(recentMessages || [])].reverse().find((item) => item.rol === "user");
}

function getPreviousBotMessage(recentMessages, currentMessage) {
  const messages = [...(recentMessages || [])];
  let skippedCurrentUser = false;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];

    if (
      !skippedCurrentUser &&
      item.rol === "user" &&
      item.mensaje === currentMessage
    ) {
      skippedCurrentUser = true;
      continue;
    }

    if (item.rol === "bot") {
      return item;
    }
  }

  return null;
}

function getPreviousUserMessage(recentMessages, currentMessage) {
  const messages = [...(recentMessages || [])];
  let skippedCurrentUser = false;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];

    if (
      !skippedCurrentUser &&
      item.rol === "user" &&
      item.mensaje === currentMessage
    ) {
      skippedCurrentUser = true;
      continue;
    }

    if (item.rol === "user") {
      return item;
    }
  }

  return null;
}

function getProductSelectionMessage(recentMessages) {
  const messages = [...(recentMessages || [])];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];

    if (
      item.rol === "bot" &&
      typeof item.mensaje === "string" &&
      item.mensaje.includes("Ahora comparteme la direccion completa de entrega")
    ) {
      for (let lookup = index - 1; lookup >= 0; lookup -= 1) {
        if (messages[lookup].rol === "user") {
          return messages[lookup].mensaje;
        }
      }
    }
  }

  return null;
}

async function getSelectedProductFromRecentMessages(
  recentMessages,
  conversationCategoryId
) {
  if (!conversationCategoryId) {
    return null;
  }

  const selectedProductMessage = getProductSelectionMessage(recentMessages);

  if (!selectedProductMessage) {
    return null;
  }

  return findActiveProductSelection(conversationCategoryId, selectedProductMessage);
}

function isAvailabilityQuestion(message) {
  const normalized = String(message || "").toLowerCase();

  return (
    normalized.includes("disponible") ||
    normalized.includes("tienen") ||
    normalized.includes("hay") ||
    normalized.includes("esta disponible") ||
    normalized.includes("están disponibles") ||
    normalized.includes("estan disponibles")
  );
}

function buildProductSelectionHelpReply(category, products) {
  if (products.length === 0) {
    return `No tengo productos activos para la categoria ${category.tipoCategoria} en este momento.`;
  }

  if (products.length === 1) {
    return `Sí, está disponible ${products[0].nombre} por ${formatMoney(
      products[0].precio
    )}. Si lo deseas, responde "la quiero" para continuar con la direccion de entrega.`;
  }

  return `Si deseas continuar, responde con el numero o el nombre de una opcion de ${category.tipoCategoria}.`;
}

function looksLikeDeliveryAddress(message) {
  const normalized = String(message || "").trim();

  if (normalized.length < 10) {
    return false;
  }

  return /[0-9]/.test(normalized) || normalized.split(/\s+/).length >= 4;
}

function isAddressCorrectionMessage(message) {
  return /^(no|era|quise decir|corrijo|me equivoque|me equivoqué)\b/i.test(
    String(message || "").trim()
  );
}

function extractLocalityHint(message) {
  const normalized = String(message || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const directHints = [
    "san nicolas",
    "san nicolas de los garza",
    "apodaca",
    "monterrey",
    "guadalupe",
    "escobedo",
    "nuevo leon",
  ];

  const matchedHint = directHints.find((hint) => normalized.includes(hint));

  if (matchedHint) {
    return matchedHint;
  }

  const genericMatch = normalized.match(/\b(?:de|en)\s+([a-z\s]+)$/);

  if (!genericMatch) {
    return null;
  }

  return genericMatch[1].trim();
}

function cleanAddressCorrection(message) {
  return String(message || "")
    .replace(/^(no[,.\s]*)/i, "")
    .replace(/^(era\s+)/i, "")
    .replace(/^(quise decir\s+)/i, "")
    .replace(/^(corrijo\s*:?\s*)/i, "")
    .replace(/^(me equivoque[,.\s]*)/i, "")
    .replace(/^(me equivoqué[,.\s]*)/i, "")
    .trim();
}

function buildAddressSearchQuery({ message, previousUserMessage }) {
  const cleanedMessage = cleanAddressCorrection(message);
  const localityHint = extractLocalityHint(message);
  const previousAddress = String(previousUserMessage?.mensaje || "").trim();

  if (looksLikeDeliveryAddress(cleanedMessage)) {
    return `${cleanedMessage}, Nuevo Leon, Mexico`;
  }

  if (previousAddress && localityHint) {
    return `${previousAddress}, ${localityHint}, Nuevo Leon, Mexico`;
  }

  if (previousAddress && cleanedMessage) {
    return `${previousAddress}, ${cleanedMessage}, Nuevo Leon, Mexico`;
  }

  return null;
}

function isAffirmativeMessage(message) {
  return /^(si|sí|correcto|es correcto|confirmo|ok|okay)$/i.test(
    String(message || "").trim()
  );
}

function isNegativeMessage(message) {
  return /^(no|incorrecto|no es correcto|cambiar|corrijo)$/i.test(
    String(message || "").trim()
  );
}

function extractConfirmedAddressFromBotMessage(message) {
  const normalized = String(message || "").trim();
  const prefix = "Encontre esta direccion en Google Maps: ";
  const suffix = ". Si es correcta, responde \"si\". Si no, responde \"no\" y comparteme la direccion otra vez.";
  const coverageMarker = ". La sucursal ";
  const coverageConfirmationMarker =
    ". Tenemos cobertura de envio para esta direccion.";
  const warningMarker = ". Google Maps la marco como aproximada, asi que necesito tu confirmacion.";

  if (!normalized.startsWith(prefix)) {
    return null;
  }

  if (normalized.includes(coverageMarker)) {
    const [addressPart] = normalized
      .slice(prefix.length)
      .split(coverageMarker, 1);

    return addressPart ? addressPart.trim() : null;
  }

  if (normalized.includes(warningMarker)) {
    const [addressPart] = normalized
      .slice(prefix.length)
      .split(warningMarker, 1);

    return addressPart ? addressPart.trim() : null;
  }

  if (normalized.includes(coverageConfirmationMarker)) {
    const [addressPart] = normalized
      .slice(prefix.length)
      .split(coverageConfirmationMarker, 1);

    return addressPart ? addressPart.trim() : null;
  }

  if (!normalized.endsWith(suffix)) {
    return null;
  }

  return normalized.slice(prefix.length, -suffix.length).trim();
}

function extractFinalOrderAddressFromBotMessage(message) {
  const normalized = String(message || "").trim();
  const prefix = "Corrobora tu pedido:\n";
  const addressLinePrefix = "Direccion de entrega: ";
  const confirmationLine =
    'Si todo es correcto, responde "si". Si deseas cambiar algo, responde "no".';

  if (!normalized.startsWith(prefix) || !normalized.includes(confirmationLine)) {
    return null;
  }

  const addressLine = normalized
    .split("\n")
    .find((line) => line.startsWith(addressLinePrefix));

  if (!addressLine) {
    return null;
  }

  return addressLine.slice(addressLinePrefix.length).trim();
}

async function buildAddressRetryReply() {
  const result = await handleDeliveryToolCall("solicitar_direccion_entrega", {
    nombreProducto: "tu pedido",
  });

  return (
    "Aun necesito una direccion valida para continuar. " +
    result.mensaje.replace("Perfecto, elegiste tu pedido. ", "")
  );
}

async function buildAddressGeocodeRetryReply() {
  return "No pude validar esa direccion en Google Maps. Compartemela de nuevo con calle, numero, colonia y municipio.";
}

async function buildAddressOutsideMetroReply(municipality) {
  const municipalityLabel = municipality
    ? ` en ${municipality}`
    : "";

  return (
    "Por el momento solo realizamos entregas dentro del area metropolitana de Monterrey. " +
    `La direccion encontrada queda${municipalityLabel}. ` +
    "Comparteme otra direccion dentro de cobertura, por favor."
  );
}

async function buildAddressConfirmationRequestReply(geocodedAddress) {
  const result = await handleDeliveryToolCall("solicitar_confirmacion_direccion", {
    direccionEntrega: geocodedAddress.formattedAddress,
    sucursalNombre: geocodedAddress.coverage?.nombre,
    distanciaMetros: geocodedAddress.coverage?.distanciaMetros,
    radioEntregaMetros: geocodedAddress.coverage?.radioEntregaMetros,
    locationType: geocodedAddress.locationType,
    partialMatch: geocodedAddress.partialMatch,
  });

  return result.mensaje;
}

async function buildAddressOutOfCoverageReply(geocodedAddress) {
  const result = await handleDeliveryToolCall("direccion_fuera_de_cobertura", {
    direccionEntrega: geocodedAddress.formattedAddress,
    sucursalNombre: geocodedAddress.coverage?.nombre,
    distanciaMetros: geocodedAddress.coverage?.distanciaMetros,
    radioEntregaMetros: geocodedAddress.coverage?.radioEntregaMetros,
  });

  return result.mensaje;
}

async function buildAddressConfirmedReply(deliveryAddress) {
  const result = await handleDeliveryToolCall("confirmar_direccion_entrega", {
    direccionEntrega: deliveryAddress,
  });

  return result.mensaje;
}

async function buildFinalOrderConfirmationReply({ product, deliveryAddress }) {
  const result = await handleDeliveryToolCall("solicitar_confirmacion_pedido", {
    nombreProducto: product.nombre,
    precioProducto: formatMoney(product.precio),
    direccionEntrega: deliveryAddress,
  });

  return result.mensaje;
}

module.exports = {
  buildGreetingReply,
  runFloristAgent: async ({
    message,
    nombreCliente,
    customerId,
    conversationId,
    conversationStateId,
    conversationCategoryId,
    recentMessages = [],
  }) => {
    const waitingCategoryStateId =
      await findConversationStateIdByName("esperando_categoria");
    const waitingProductStateId =
      await findConversationStateIdByName("esperando_producto");
    const waitingAddressStateId =
      await findConversationStateIdByName("esperando_direccion");
    const initialStateId = await findConversationStateIdByName("inicio");

    if (Number(conversationStateId) === Number(waitingAddressStateId)) {
      if (!conversationId) {
        return "No pude ubicar la conversacion activa para registrar la direccion.";
      }

      const previousBotMessage = getPreviousBotMessage(recentMessages, message);
      const previousUserMessage = getPreviousUserMessage(recentMessages, message);
      const pendingFinalOrderAddress = extractFinalOrderAddressFromBotMessage(
        previousBotMessage?.mensaje
      );
      const pendingConfirmedAddress = extractConfirmedAddressFromBotMessage(
        previousBotMessage?.mensaje
      );

      if (pendingFinalOrderAddress && isAffirmativeMessage(message)) {
        if (!customerId || !conversationCategoryId) {
          throw new Error(
            "Faltan datos de cliente o categoria para crear el pedido confirmado."
          );
        }

        const selectedProduct = await getSelectedProductFromRecentMessages(
          recentMessages,
          conversationCategoryId
        );

        if (!selectedProduct) {
          return "No pude recuperar el producto seleccionado para generar tu pedido.";
        }

        await createOrder({
          customerId,
          productId: selectedProduct.id,
          conversationId,
          deliveryAddress: pendingFinalOrderAddress,
          total: selectedProduct.precio,
        });

        await updateConversationState({
          conversationId,
          stateName: "inicio",
        });

        return buildAddressConfirmedReply(pendingFinalOrderAddress);
      }

      if (pendingFinalOrderAddress && isNegativeMessage(message)) {
        return (
          "De acuerdo. Comparteme la direccion corregida o el numero/nombre del producto que deseas cambiar."
        );
      }

      if (pendingConfirmedAddress && isNegativeMessage(message)) {
        return buildAddressRetryReply();
      }

      if (pendingConfirmedAddress && isAffirmativeMessage(message)) {
        const selectedProduct = await getSelectedProductFromRecentMessages(
          recentMessages,
          conversationCategoryId
        );

        if (!selectedProduct) {
          return "No pude recuperar el producto seleccionado para corroborar el pedido.";
        }

        return buildFinalOrderConfirmationReply({
          product: selectedProduct,
          deliveryAddress: pendingConfirmedAddress,
        });
      }

      if (conversationCategoryId) {
        const replacementProduct = await findActiveProductSelection(
          conversationCategoryId,
          message
        );

        if (replacementProduct) {
          return buildProductSelectedReply(replacementProduct);
        }
      }

      const addressSearchQuery = isAddressCorrectionMessage(message)
        ? buildAddressSearchQuery({
            message,
            previousUserMessage,
          })
        : null;
      const shouldTryCorrectionQuery =
        typeof addressSearchQuery === "string" && addressSearchQuery.length > 0;

      if (
        isGreetingMessage(message) ||
        (!looksLikeDeliveryAddress(message) && !shouldTryCorrectionQuery)
      ) {
        return buildAddressRetryReply();
      }

      const geocodedAddress = await geocodeAddress(
        shouldTryCorrectionQuery ? addressSearchQuery : message
      );

      if (!geocodedAddress.ok || !geocodedAddress.result?.formattedAddress) {
        return buildAddressGeocodeRetryReply();
      }

      if (!geocodedAddress.result.withinMonterreyMetro) {
        return buildAddressOutsideMetroReply(
          geocodedAddress.result.municipality
        );
      }

      const coverage = await findClosestBranchCoverage({
        lat: geocodedAddress.result.location.lat,
        lng: geocodedAddress.result.location.lng,
      });

      if (!coverage) {
        return "No encontre una sucursal configurada para validar la zona de envio.";
      }

      geocodedAddress.result.coverage = coverage;

      if (!coverage.dentroDeCobertura) {
        return buildAddressOutOfCoverageReply(geocodedAddress.result);
      }

      return buildAddressConfirmationRequestReply(geocodedAddress.result);
    }

    if (Number(conversationStateId) === Number(waitingProductStateId)) {
      if (!conversationCategoryId) {
        return "Ya tengo la categoria seleccionada, pero aun no pude identificar sus productos disponibles.";
      }
      const categories = await getActiveCategories();
      const selectedCategory =
        categories.find(
          (category) => Number(category.id) === Number(conversationCategoryId)
        ) || null;

      if (!selectedCategory) {
        return "No pude identificar la categoria activa de esta conversacion.";
      }

      const products = await getActiveProductsByCategoryId(selectedCategory.id);
      const selectedProduct = await findActiveProductSelection(
        selectedCategory.id,
        message
      );

      if (!selectedProduct) {
        if (isGreetingMessage(message) || isAvailabilityQuestion(message)) {
          return buildProductSelectionHelpReply(selectedCategory, products);
        }

        const lastBotMessage = getLastBotMessage(recentMessages);
        const lastUserMessage = getLastUserMessage(recentMessages);

        if (
          lastBotMessage?.mensaje &&
          lastBotMessage.mensaje.includes("Estas son las opciones disponibles") &&
          lastUserMessage?.mensaje === message
        ) {
          return buildProductSelectionHelpReply(selectedCategory, products);
        }

        return buildProductListReply(selectedCategory, products);
      }

      if (!customerId || !conversationId) {
        throw new Error(
          "Faltan datos de cliente o conversacion para continuar con la compra."
        );
      }

      await updateConversationState({
        conversationId,
        stateName: "esperando_direccion",
      });

      return buildProductSelectedReply(selectedProduct);
    }

    if (
      conversationId &&
      Number(conversationStateId) === Number(waitingCategoryStateId)
    ) {
      const matchedCategory = await findActiveCategoryByName(message);

      if (!matchedCategory) {
        return buildCategoryRetryReply(nombreCliente);
      }

      await updateConversationCategory({
        conversationId,
        categoryId: matchedCategory.id,
        stateName: "esperando_producto",
      });

      const products = await getActiveProductsByCategoryId(matchedCategory.id);

      return buildProductListReply(matchedCategory, products);
    }

    const activeIntentions = await getActiveIntentions();
    const matchedCategoryFromFreeText = await detectCategoryInMessage(message);
    const detectedIntentionName = await detectIntentionWithOpenAI(
      message,
      activeIntentions
    );
    const isInitialConversation =
      !conversationStateId ||
      Number(conversationStateId) === Number(initialStateId);

    if (
      isInitialConversation &&
      conversationId &&
      matchedCategoryFromFreeText
    ) {
      const matchedIntention = activeIntentions.find(
        (item) => item.nombre === "comprar_flores"
      );

      if (matchedIntention) {
        await updateConversationIntent({
          conversationId,
          intentionId: matchedIntention.id,
          stateName: "esperando_categoria",
        });
      }

      await updateConversationCategory({
        conversationId,
        categoryId: matchedCategoryFromFreeText.id,
        stateName: "esperando_producto",
      });

      const products = await getActiveProductsByCategoryId(
        matchedCategoryFromFreeText.id
      );

      return buildProductListReply(matchedCategoryFromFreeText, products);
    }

    if (
      isInitialConversation &&
      detectedIntentionName === "comprar_flores" &&
      conversationId
    ) {
      const matchedIntention = activeIntentions.find(
        (item) => item.nombre === detectedIntentionName
      );

      if (matchedIntention) {
        await updateConversationIntent({
          conversationId,
          intentionId: matchedIntention.id,
          stateName: "esperando_categoria",
        });
      }

      return buildGreetingReply(message, nombreCliente);
    }

    if (isGreetingMessage(message) || !detectedIntentionName) {
      return isInitialConversation
        ? buildGreetingReply(message, nombreCliente)
        : "Seguimos con tu proceso actual. Responde con la opcion correspondiente para continuar.";
    }

    return buildGreetingReply(message, nombreCliente);
  },
};
