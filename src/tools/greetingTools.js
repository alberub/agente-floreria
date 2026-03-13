const { getActiveCategories } = require("../repositories/categoryRepository");
const { getActiveIntentions } = require("../repositories/intentionRepository");

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "saludar_con_categorias",
      description:
        "Genera un saludo amable para la floreria y muestra las categorias activas disponibles.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombreCliente: {
            type: "string",
            description: "Nombre del cliente si fue proporcionado.",
          }
        },
        required: []
      }
    }
  }
];

const STORE_NAME = "Floreria Deisy";
const NO_CATEGORIES_MESSAGE =
  "En este momento no tengo categorias disponibles para mostrarte. Si quieres, puedo ayudarte en cuanto las actualicen.";
const CATEGORY_REQUIRED_INTENT = "comprar_flores";

function getCategoryEmoji(categoryName) {
  const normalized = String(categoryName || "").toLowerCase();

  if (normalized.includes("anivers")) {
    return "💐";
  }

  if (normalized.includes("cumple")) {
    return "🎂";
  }

  if (normalized.includes("solo porque")) {
    return "🌷";
  }

  if (
    normalized.includes("condolen") ||
    normalized.includes("funeral") ||
    normalized.includes("pesame")
  ) {
    return "🤍";
  }

  return "🌸";
}

function shouldOfferCategories(intentions) {
  return intentions.some(
    (intention) => intention.nombre.toLowerCase() === CATEGORY_REQUIRED_INTENT
  );
}

function buildGreetingMessage(categories, intentions, nombreCliente) {
  const categoryLines = categories
    .map(
      (category) => `${getCategoryEmoji(category.tipoCategoria)} ${category.tipoCategoria}`
    )
    .join("\n");
  const greetingLine = nombreCliente
    ? `¡Hola ${nombreCliente}! 🌸 Bienvenido a ${STORE_NAME}.`
    : `¡Hola! 🌸 Bienvenido a ${STORE_NAME}.`;
  const offerCategories = shouldOfferCategories(intentions);

  if (!offerCategories) {
    return (
      `${greetingLine}\n\n` +
      "Estoy lista para ayudarte con tu pedido, productos, precios, envios o metodos de pago."
    );
  }

  if (categories.length === 0) {
    return `${greetingLine}\n\n${NO_CATEGORIES_MESSAGE}`;
  }

  return (
    `${greetingLine}\n\n` +
    "Me encantaría ayudarte a elegir el detalle perfecto.\n\n" +
    "¿Para qué ocasión buscas flores hoy?\n\n" +
    categoryLines
  );
}

async function handleToolCall(toolName, args) {
  if (toolName !== "saludar_con_categorias") {
    throw new Error(`Tool no soportada: ${toolName}`);
  }

  const categories = await getActiveCategories();
  const intentions = await getActiveIntentions();

  return {
    ok: true,
    nombreCliente: args.nombreCliente || null,
    categorias: categories,
    intenciones: intentions,
    saludo: buildGreetingMessage(categories, intentions, args.nombreCliente),
  };
}

module.exports = {
  toolDefinitions,
  handleToolCall,
};
