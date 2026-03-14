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
          sucursalNombre: {
            type: "string",
            description: "Sucursal que cubre la direccion encontrada.",
          },
          distanciaMetros: {
            type: "number",
            description: "Distancia estimada entre la sucursal y la direccion.",
          },
          radioEntregaMetros: {
            type: "number",
            description: "Radio de cobertura configurado para la sucursal.",
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
  {
    type: "function",
    function: {
      name: "solicitar_confirmacion_pedido",
      description:
        "Resume el producto y la direccion para pedir la confirmacion final del pedido.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombreProducto: {
            type: "string",
            description: "Nombre del producto seleccionado.",
          },
          precioProducto: {
            type: "string",
            description: "Precio formateado del producto.",
          },
          direccionEntrega: {
            type: "string",
            description: "Direccion de entrega confirmada.",
          },
        },
        required: ["nombreProducto", "precioProducto", "direccionEntrega"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "direccion_fuera_de_cobertura",
      description:
        "Informa al cliente que la direccion esta fuera del radio de entrega.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          direccionEntrega: {
            type: "string",
            description: "Direccion encontrada por Google Maps.",
          },
          sucursalNombre: {
            type: "string",
            description: "Sucursal mas cercana a la direccion.",
          },
          distanciaMetros: {
            type: "number",
            description: "Distancia estimada a la sucursal mas cercana.",
          },
          radioEntregaMetros: {
            type: "number",
            description: "Radio de cobertura de la sucursal mas cercana.",
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
    `${direccionEntrega}.`
  );
}

function buildFinalOrderConfirmationMessage({
  nombreProducto,
  precioProducto,
  direccionEntrega,
}) {
  return (
    "Corrobora tu pedido:\n" +
    `Producto: ${nombreProducto} - ${precioProducto}\n` +
    `Direccion de entrega: ${direccionEntrega}\n\n` +
    'Si todo es correcto, responde "si". Si deseas cambiar algo, responde "no".'
  );
}

function buildRequestDeliveryAddressConfirmationMessage({
  direccionEntrega,
  sucursalNombre,
  distanciaMetros,
  radioEntregaMetros,
  locationType,
  partialMatch,
}) {
  const precisionWarning =
    partialMatch || (locationType && locationType !== "ROOFTOP")
      ? " Google Maps la marco como aproximada, asi que necesito tu confirmacion."
      : "";
  const coverageMessage =
    sucursalNombre && Number.isFinite(distanciaMetros)
      ? ` La sucursal ${sucursalNombre} puede entregarte ahi. Distancia estimada: ${Math.round(
          distanciaMetros
        )} m de ${Math.round(radioEntregaMetros || 0)} m disponibles.`
      : "";

  return (
    `Encontre esta direccion en Google Maps: ${direccionEntrega}.` +
    `${coverageMessage}` +
    `${precisionWarning} ` +
    'Si es correcta, responde "si". Si no, responde "no" y comparteme la direccion otra vez.'
  );
}

function buildOutOfCoverageMessage({
  direccionEntrega,
  sucursalNombre,
  distanciaMetros,
  radioEntregaMetros,
}) {
  const branchMessage = sucursalNombre
    ? ` La sucursal mas cercana es ${sucursalNombre}, a ${Math.round(
        distanciaMetros || 0
      )} m.`
    : "";

  return (
    `La direccion ${direccionEntrega} esta fuera de nuestra zona de envio.` +
    `${branchMessage} ` +
    `Nuestro radio actual es de ${Math.round(radioEntregaMetros || 0)} m. ` +
    "Comparteme otra direccion dentro de cobertura, por favor."
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
        sucursalNombre: args.sucursalNombre,
        distanciaMetros: args.distanciaMetros,
        radioEntregaMetros: args.radioEntregaMetros,
        locationType: args.locationType,
        partialMatch: args.partialMatch,
      }),
    };
  }

  if (toolName === "direccion_fuera_de_cobertura") {
    return {
      ok: true,
      mensaje: buildOutOfCoverageMessage({
        direccionEntrega: args.direccionEntrega,
        sucursalNombre: args.sucursalNombre,
        distanciaMetros: args.distanciaMetros,
        radioEntregaMetros: args.radioEntregaMetros,
      }),
    };
  }

  if (toolName === "solicitar_confirmacion_pedido") {
    return {
      ok: true,
      mensaje: buildFinalOrderConfirmationMessage({
        nombreProducto: args.nombreProducto,
        precioProducto: args.precioProducto,
        direccionEntrega: args.direccionEntrega,
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
