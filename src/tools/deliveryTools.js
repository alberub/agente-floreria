const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "solicitar_direccion_entrega",
      description:
        "Solicita al cliente la direccion completa de entrega despues de elegir un producto.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombreProducto: {
            type: "string",
            description: "Nombre del producto seleccionado por el cliente.",
          },
        },
        required: ["nombreProducto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirmar_direccion_entrega",
      description:
        "Confirma al cliente la direccion recibida para su pedido.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          direccionEntrega: {
            type: "string",
            description: "Direccion compartida por el cliente.",
          },
        },
        required: ["direccionEntrega"],
      },
    },
  },
];

function buildRequestDeliveryAddressMessage(nombreProducto) {
  return (
    `Perfecto, elegiste ${nombreProducto}. ` +
    "Ahora comparteme la direccion completa de entrega, por favor. " +
    "Incluye calle, numero, colonia y referencias si las tienes."
  );
}

function buildDeliveryAddressConfirmationMessage(direccionEntrega) {
  return (
    "Gracias. Ya recibi la direccion de entrega: " +
    `${direccionEntrega}. ` +
    "En el siguiente paso validare la cobertura de envio."
  );
}

async function handleToolCall(toolName, args) {
  if (toolName === "solicitar_direccion_entrega") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryAddressMessage(args.nombreProducto),
    };
  }

  if (toolName === "confirmar_direccion_entrega") {
    return {
      ok: true,
      mensaje: buildDeliveryAddressConfirmationMessage(args.direccionEntrega),
    };
  }

  throw new Error(`Tool no soportada: ${toolName}`);
}

module.exports = {
  toolDefinitions,
  handleToolCall,
};
