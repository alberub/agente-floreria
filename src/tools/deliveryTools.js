const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "solicitar_tipo_entrega",
      description:
        "Pregunta al cliente si prefiere entrega a domicilio o recoger en tienda antes de validar cobertura.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "solicitar_zona_entrega",
      description:
        "Solicita al cliente una zona preliminar de entrega para validar cobertura inicial.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "solicitar_fecha_entrega",
      description:
        "Solicita al cliente el dia deseado de entrega despues de validar la zona preliminar.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          tipoEntrega: {
            type: "string",
            description: "domicilio o pickup segun el flujo actual.",
          },
        },
      },
    },
  },
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
      name: "solicitar_horario_entrega",
      description:
        "Confirma el horario seleccionado y solicita la direccion final de entrega.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          horarioEntrega: {
            type: "string",
            description: "Horario de entrega seleccionado por el cliente.",
          },
        },
        required: ["horarioEntrega"],
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
          horarioEntrega: {
            type: "string",
            description: "Horario de entrega confirmado.",
          },
          tipoEntrega: {
            type: "string",
            description: "domicilio o pickup segun el flujo actual.",
          },
          fechaRecolecta: {
            type: "string",
            description: "Dia estimado de recoleccion si el pedido sera para recoger en tienda.",
          },
        },
        required: ["nombreProducto", "precioProducto"],
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
  {
    type: "function",
    function: {
      name: "mostrar_opciones_entrega",
      description:
        "Muestra al cliente las opciones disponibles de fecha y horario de entrega.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          opciones: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                etiqueta: { type: "string" },
              },
              required: ["etiqueta"],
            },
          },
        },
        required: ["opciones"],
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

function buildRequestCoverageZoneMessage() {
  return (
    "Para comenzar, comparteme la colonia y municipio de entrega o el codigo postal. " +
    "Responde solo con ese dato para validar primero si tenemos cobertura en tu zona."
  );
}

function buildRequestDeliveryTypeMessage() {
  return (
    "Perfecto. Antes de seguir, dime si lo necesitas a domicilio o si prefieres recoger en tienda.\n" +
    "Responde solo con una opcion:\n" +
    "1. A domicilio\n" +
    "2. Recoger en tienda"
  );
}

function buildRequestDeliveryDateMessage(tipoEntrega = "domicilio") {
  if (tipoEntrega === "pickup") {
    return (
      "Perfecto, lo preparamos para recoger en tienda. " +
      "Ahora indicame para que dia lo necesitas. Responde solo con hoy, manana o una fecha especifica."
    );
  }

  return (
    "Perfecto, si tenemos cobertura en esa zona. " +
    "Ahora indicame para que dia deseas la entrega. Responde solo con hoy, manana o una fecha especifica."
  );
}

function buildRequestDeliveryWindowAddressMessage(horarioEntrega) {
  return (
    `Perfecto, apartaremos el horario ${horarioEntrega}. ` +
    "Ahora comparteme la direccion completa de entrega, por favor. Incluye calle, numero, colonia y referencias si las tienes."
  );
}

function buildDeliveryAddressConfirmationMessage() {
  return (
    "Gracias por tu compra. " +
    "Tu pedido ha sido registrado correctamente. " +
    "En breve te compartiremos el seguimiento."
  );
}

function buildFinalOrderConfirmationMessage({
  nombreProducto,
  precioProducto,
  direccionEntrega,
  horarioEntrega,
}) {
  return (
    "Corrobora tu pedido:\n" +
    `Producto: ${nombreProducto} - ${precioProducto}\n` +
    `Horario de entrega: ${horarioEntrega}\n` +
    `Direccion de entrega: ${direccionEntrega}\n\n` +
    'Si todo es correcto, responde "si". Si deseas cambiar algo, responde "no".'
  );
}

function buildPickupOrderConfirmationMessage({
  nombreProducto,
  precioProducto,
  fechaRecolecta,
}) {
  return (
    "Corrobora tu pedido para recoger en tienda:\n" +
    `Producto: ${nombreProducto} - ${precioProducto}\n` +
    `Dia estimado de recoleccion: ${fechaRecolecta}\n\n` +
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
  return (
    `Encontre esta direccion en Google Maps: ${direccionEntrega}.` +
    " Tenemos cobertura de envio para esta direccion. " +
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
    ? ` La sucursal mas cercana es ${sucursalNombre}.`
    : "";

  return (
    `La direccion ${direccionEntrega} esta fuera de nuestra zona de envio.` +
    `${branchMessage} ` +
    "Comparteme otra direccion dentro de cobertura, por favor."
  );
}

function buildDeliveryOptionsMessage(opciones) {
  const lines = opciones
    .map((opcion, index) => `${index + 1}. ${opcion.etiqueta}`)
    .join("\n");

  return (
    "Estas son las opciones de entrega disponibles:\n\n" +
    `${lines}\n\n` +
    'Responde con el numero de la opcion que prefieras.'
  );
}

async function handleToolCall(toolName, args) {
  if (toolName === "solicitar_tipo_entrega") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryTypeMessage(),
    };
  }

  if (toolName === "solicitar_zona_entrega") {
    return {
      ok: true,
      mensaje: buildRequestCoverageZoneMessage(),
    };
  }

  if (toolName === "solicitar_fecha_entrega") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryDateMessage(args.tipoEntrega),
    };
  }

  if (toolName === "solicitar_direccion_entrega") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryAddressMessage(args.nombreProducto),
    };
  }

  if (toolName === "solicitar_horario_entrega") {
    return {
      ok: true,
      mensaje: buildRequestDeliveryWindowAddressMessage(args.horarioEntrega),
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
      mensaje:
        args.tipoEntrega === "pickup"
          ? buildPickupOrderConfirmationMessage({
              nombreProducto: args.nombreProducto,
              precioProducto: args.precioProducto,
              fechaRecolecta: args.fechaRecolecta,
            })
          : buildFinalOrderConfirmationMessage({
              nombreProducto: args.nombreProducto,
              precioProducto: args.precioProducto,
              direccionEntrega: args.direccionEntrega,
              horarioEntrega: args.horarioEntrega,
            }),
    };
  }

  if (toolName === "mostrar_opciones_entrega") {
    return {
      ok: true,
      mensaje: buildDeliveryOptionsMessage(args.opciones || []),
    };
  }

  if (toolName === "confirmar_direccion_entrega") {
    return {
      ok: true,
      mensaje: buildDeliveryAddressConfirmationMessage(),
    };
  }

  throw new Error(`Tool no soportada: ${toolName}`);
}

module.exports = {
  toolDefinitions,
  handleToolCall,
};
