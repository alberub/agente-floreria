const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "saludar_floreria",
      description:
        "Genera un saludo breve, amable y profesional para un cliente de una floreria.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombreCliente: {
            type: "string",
            description: "Nombre del cliente si fue proporcionado.",
          },
          momento: {
            type: "string",
            enum: ["dia", "tarde", "noche", "general"],
            description: "Momento del dia para personalizar el saludo.",
          }
        },
        required: ["momento"]
      }
    }
  }
];

function getGreetingPrefix(momento) {
  switch (momento) {
    case "dia":
      return "Buenos dias";
    case "tarde":
      return "Buenas tardes";
    case "noche":
      return "Buenas noches";
    default:
      return "Hola";
  }
}

async function handleToolCall(toolName, args) {
  if (toolName !== "saludar_floreria") {
    throw new Error(`Tool no soportada: ${toolName}`);
  }

  const prefix = getGreetingPrefix(args.momento);
  const namePart = args.nombreCliente ? `, ${args.nombreCliente}` : "";

  return {
    ok: true,
    saludo: `${prefix}${namePart}. Bienvenido a Floreria Botanic. Estoy para ayudarte con flores, arreglos y pedidos.`
  };
}

module.exports = {
  toolDefinitions,
  handleToolCall,
};
