const { getActiveCategories } = require("../repositories/categoryRepository");

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

const STORE_NAME = "Floreria Rosabel";
const NO_CATEGORIES_MESSAGE =
  "En este momento no tengo categorias disponibles para mostrarte. Si quieres, puedo ayudarte en cuanto las actualicen.";

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

function buildGreetingMessage(categories, nombreCliente) {
  const categoryLines = categories
    .map(
      (category) => `${getCategoryEmoji(category.tipoCategoria)} ${category.tipoCategoria}`
    )
    .join("\n");
  const greetingLine = nombreCliente
    ? `¡Hola ${nombreCliente}! 🌸 Bienvenido a ${STORE_NAME}.`
    : `¡Hola! 🌸 Bienvenido a ${STORE_NAME}.`;

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

  return {
    ok: true,
    nombreCliente: args.nombreCliente || null,
    categorias: categories,
    saludo: buildGreetingMessage(categories, args.nombreCliente),
  };
}

module.exports = {
  toolDefinitions,
  handleToolCall,
};
