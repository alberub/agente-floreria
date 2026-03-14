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
  findLatestPendingOrderByConversationId,
  updateOrderDeliveryAddress,
} = require("../repositories/orderRepository");
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

async function buildAddressRetryReply() {
  const result = await handleDeliveryToolCall("solicitar_direccion_entrega", {
    nombreProducto: "tu pedido",
  });

  return (
    "Aun necesito una direccion valida para continuar. " +
    result.mensaje.replace("Perfecto, elegiste tu pedido. ", "")
  );
}

async function buildAddressConfirmedReply(deliveryAddress) {
  const result = await handleDeliveryToolCall("confirmar_direccion_entrega", {
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

      const pendingOrder =
        await findLatestPendingOrderByConversationId(conversationId);

      if (!pendingOrder) {
        return "No encontre un pedido pendiente para registrar la direccion de entrega.";
      }

      if (isGreetingMessage(message) || !looksLikeDeliveryAddress(message)) {
        return buildAddressRetryReply();
      }

      const deliveryAddress = String(message || "").trim();

      await updateOrderDeliveryAddress({
        orderId: pendingOrder.id,
        deliveryAddress,
      });

      await updateConversationState({
        conversationId,
        stateName: "inicio",
      });

      return buildAddressConfirmedReply(deliveryAddress);
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
          "Faltan datos de cliente o conversacion para crear el pedido."
        );
      }

      await createOrder({
        customerId,
        productId: selectedProduct.id,
        conversationId,
        total: selectedProduct.precio,
      });

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
