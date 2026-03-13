const OpenAI = require("openai");
const { openAiApiKey, openAiModel } = require("../config/env");
const { handleToolCall } = require("../tools/greetingTools");
const { getActiveIntentions } = require("../repositories/intentionRepository");
const {
  findActiveCategoryByName,
  getActiveCategories,
} = require("../repositories/categoryRepository");
const {
  findActiveProductSelection,
  getActiveProductsByCategoryId,
} = require("../repositories/productRepository");
const { createOrder } = require("../repositories/orderRepository");
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

function buildProductSelectedReply(product) {
  return `Perfecto, elegiste ${product.nombre} por ${formatMoney(
    product.precio
  )}. Ahora comparteme la direccion de entrega, por favor.`;
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
  }) => {
    const waitingCategoryStateId =
      await findConversationStateIdByName("esperando_categoria");
    const waitingProductStateId =
      await findConversationStateIdByName("esperando_producto");

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
    const detectedIntentionName = await detectIntentionWithOpenAI(
      message,
      activeIntentions
    );
    const isInitialConversation =
      !conversationStateId || Number(conversationStateId) === 1;

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

    if (isGreetingMessage(message) || !detectedIntentionName) {
      return buildGreetingReply(message, nombreCliente);
    }

    return buildGreetingReply(message, nombreCliente);
  },
};
