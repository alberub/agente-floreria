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
      name: "solicitar_confirmacion_direccion",
      description:
        "Pide al cliente confirmar la direccion encontrada por Google Maps.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          direccionEntrega: {
            type: "string",
            description: "Direccion normalizada encontrada por Google Maps.",
          },
          locationType: {
            type: "string",
            description: "Nivel de precision devuelto por Google Maps.",
          },
          partialMatch: {
            type: "boolean",
            description:
              "Indica si Google Maps solo encontro una coincidencia parcial.",
          },
        },
        required: ["direccionEntrega"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirmar_direccion_entrega",
      description:
        "Confirma al cliente la direccion ya validada para su pedido.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          direccionEntrega: {
            type: "string",
            description: "Direccion confirmada por el cliente.",
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

function buildRequestDeliveryAddressConfirmationMessage({
  direccionEntrega,
  locationType,
  partialMatch,
}) {
  const precisionWarning =
    partialMatch || (locationType && locationType !== "ROOFTOP")
      ? " Google Maps la marco como aproximada, asi que necesito tu confirmacion."
      : "";

  return (
    `Encontre esta direccion en Google Maps: ${direccionEntrega}.` +
    `${precisionWarning} ` +
    'Si es correcta, responde "si". Si no, responde "no" y comparteme la direccion otra vez.'
  );
}

async function handleToolCall(toolName, args) {
  if (toolName === "solicitar_direccion_entrega") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryAddressMessage(args.nombreProducto),
    };
  }

  if (toolName === "solicitar_confirmacion_direccion") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryAddressConfirmationMessage({
        direccionEntrega: args.direccionEntrega,
        locationType: args.locationType,
        partialMatch: args.partialMatch,
      }),
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
