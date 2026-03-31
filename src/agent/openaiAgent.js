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
  findAvailableDeliveryWindows,
  reserveDeliveryWindow,
} = require("../repositories/deliveryWindowRepository");
const {
  createOrder,
} = require("../repositories/orderRepository");
const {
  findClosestBranchCoverage,
  findDefaultPickupBranch,
} = require("../repositories/branchRepository");
const { geocodeAddress } = require("../services/mapsService");
const {
  findConversationStateIdByName,
  updateConversationCategory,
  updateConversationIntent,
  updateConversationState,
} = require("../repositories/conversationRepository");

const client = new OpenAI({ apiKey: openAiApiKey });
const REQUEST_DELIVERY_TYPE_PREFIX =
  "Perfecto. Antes de seguir, dime si lo necesitas a domicilio o si prefieres recoger en tienda.";
const REQUEST_ZONE_PREFIX =
  "Para comenzar, comparteme la colonia y municipio de entrega o el codigo postal.";
const REQUEST_DATE_PREFIX = "Perfecto, si tenemos cobertura en esa zona.";
const REQUEST_PICKUP_DATE_PREFIX =
  "Perfecto, lo preparamos para recoger en tienda.";
const DELIVERY_OPTIONS_PREFIX = "Estas son las opciones de entrega disponibles:";
const DELIVERY_OPTIONS_REMINDER_PREFIX =
  "Responde con el numero de la opcion de entrega que prefieras.";
const REQUEST_EXACT_ADDRESS_PREFIX = "Perfecto, apartaremos el horario ";
const FINAL_ORDER_PREFIX = "Corrobora tu pedido:";
const PRODUCT_LIST_MARKER = "Estas son las opciones disponibles:";
const DATE_RETRY_PREFIX = "No pude identificar la fecha deseada.";
const BUSINESS_TIME_ZONE = "America/Mexico_City";
const MONTHS_ES = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};
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

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getBusinessDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return values;
}

function createBusinessDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatLocalDate(date) {
  const parts = getBusinessDateParts(date);

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function startOfLocalDay(date) {
  const parts = getBusinessDateParts(date);
  return createBusinessDate(
    Number(parts.year),
    Number(parts.month),
    Number(parts.day)
  );
}

function formatHumanDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function formatBusinessTime(date) {
  const parts = getBusinessDateParts(date);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatClockLabel(value) {
  const normalized = String(value || "").slice(0, 5);

  if (!normalized) {
    return null;
  }

  const [hours, minutes] = normalized.split(":");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (Number.isNaN(parsedHours) || Number.isNaN(parsedMinutes)) {
    return normalized;
  }

  const suffix = parsedHours >= 12 ? "p.m." : "a.m.";
  const displayHours = parsedHours % 12 || 12;
  return `${displayHours}:${String(parsedMinutes).padStart(2, "0")} ${suffix}`;
}

function addBusinessDays(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function getBusinessTodayYearMonth() {
  const parts = getBusinessDateParts(new Date());
  return {
    year: Number(parts.year),
    month: Number(parts.month),
  };
}

function parseRequestedDeliveryDate(message) {
  const normalized = normalizeText(message)
    .replace(/\bpara\s+el\b/g, "")
    .replace(/\bpara\b/g, "")
    .replace(/\bel\s+dia\b/g, "")
    .replace(/\bel\b/g, "")
    .replace(/\bde\s+este\s+mes\b/g, "")
    .replace(/\beste\s+mes\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const today = startOfLocalDay(new Date());
  const businessToday = getBusinessTodayYearMonth();

  if (!normalized) {
    return null;
  }

  if (normalized.includes("pasado manana")) {
    const date = addBusinessDays(today, 2);
    return { date, label: formatHumanDate(date) };
  }

  if (normalized.includes("manana")) {
    const date = addBusinessDays(today, 1);
    return { date, label: formatHumanDate(date) };
  }

  if (normalized.includes("hoy")) {
    return { date: today, label: formatHumanDate(today) };
  }

  const isoMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = createBusinessDate(
      Number(year),
      Number(month),
      Number(day)
    );
    return Number.isNaN(date.getTime())
      ? null
      : { date: startOfLocalDay(date), label: formatHumanDate(date) };
  }

  const slashMatch = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);

  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const date = createBusinessDate(
      Number(year || today.getUTCFullYear()),
      Number(month),
      Number(day)
    );
    return Number.isNaN(date.getTime())
      ? null
      : { date: startOfLocalDay(date), label: formatHumanDate(date) };
  }

  const monthMatch = normalized.match(
    /\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b|\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\b/
  );

  if (monthMatch) {
    const day = monthMatch[1] || monthMatch[4];
    const monthName = monthMatch[2] || monthMatch[5];
    const year = monthMatch[3] || monthMatch[6] || today.getFullYear();
    const monthIndex = MONTHS_ES[monthName];

    if (monthIndex !== undefined) {
      const date = createBusinessDate(Number(year), monthIndex + 1, Number(day));
      return Number.isNaN(date.getTime())
        ? null
        : { date: startOfLocalDay(date), label: formatHumanDate(date) };
    }
  }

  const weekdayDayMatch = normalized.match(
    /\b(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+(\d{1,2})(?:\s+de\s+([a-z]+)|\s+([a-z]+)|)\b/
  );

  if (weekdayDayMatch) {
    const day = Number(weekdayDayMatch[1]);
    const monthName = weekdayDayMatch[2] || weekdayDayMatch[3] || null;

    if (monthName && MONTHS_ES[monthName] !== undefined) {
      const date = createBusinessDate(
        businessToday.year,
        MONTHS_ES[monthName] + 1,
        day
      );
      return Number.isNaN(date.getTime())
        ? null
        : { date: startOfLocalDay(date), label: formatHumanDate(date) };
    }

    const date = createBusinessDate(businessToday.year, businessToday.month, day);
    return Number.isNaN(date.getTime())
      ? null
      : { date: startOfLocalDay(date), label: formatHumanDate(date) };
  }

  const dayOnlyMatch = normalized.match(/\b(\d{1,2})\b/);

  if (dayOnlyMatch) {
    const date = createBusinessDate(
      businessToday.year,
      businessToday.month,
      Number(dayOnlyMatch[1])
    );
    return Number.isNaN(date.getTime())
      ? null
      : { date: startOfLocalDay(date), label: formatHumanDate(date) };
  }

  return null;
}

function parseWindowDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDeliveryWindowLabel(window) {
  const date = parseWindowDate(window.fecha);

  if (!date) {
    return `de ${String(window.horaInicio).slice(0, 5)} a ${String(
      window.horaFin
    ).slice(0, 5)}`;
  }

  const dateLabel = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);

  return `${dateLabel}, de ${String(window.horaInicio).slice(0, 5)} a ${String(
    window.horaFin
  ).slice(0, 5)}`;
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

function buildProductListForRequestedDateReply(category, products, requestedDate) {
  const baseReply = buildProductListReply(category, products);

  if (!requestedDate?.label) {
    return baseReply;
  }

  return `Perfecto, entonces la entrega seria para ${requestedDate.label}. Trabajaremos con la categoria ${category.tipoCategoria}. Estas son las opciones disponibles:\n\n${products
    .map((product, index) => {
      const description = product.descripcion ? ` - ${product.descripcion}` : "";
      return `${index + 1}. ${product.nombre} - ${formatMoney(product.precio)}${description}`;
    })
    .join("\n")}`;
}

async function buildCoverageZoneRequestReply() {
  const result = await handleDeliveryToolCall("solicitar_zona_entrega", {});

  return result.mensaje;
}

async function buildDeliveryTypeRequestReply() {
  const result = await handleDeliveryToolCall("solicitar_tipo_entrega", {});

  return result.mensaje;
}

async function buildDeliveryDateRequestReply() {
  const result = await handleDeliveryToolCall("solicitar_fecha_entrega", {
    tipoEntrega: "domicilio",
  });

  return result.mensaje;
}

async function buildPickupDateRequestReply() {
  const result = await handleDeliveryToolCall("solicitar_fecha_entrega", {
    tipoEntrega: "pickup",
  });

  return result.mensaje;
}

async function buildExactAddressRequestReply(windowLabel) {
  const result = await handleDeliveryToolCall("solicitar_horario_entrega", {
    horarioEntrega: windowLabel,
  });

  return result.mensaje;
}

function getLastBotMessage(recentMessages) {
  return [...(recentMessages || [])].reverse().find((item) => item.rol === "bot");
}

function getLastUserMessage(recentMessages) {
  return [...(recentMessages || [])].reverse().find((item) => item.rol === "user");
}

function getLatestUserReplyAfterBotPrefix(recentMessages, prefix) {
  const messages = [...(recentMessages || [])];
  let latestReply = null;
  let waitingReply = false;

  for (const item of messages) {
    if (
      item.rol === "bot" &&
      typeof item.mensaje === "string" &&
      item.mensaje.startsWith(prefix)
    ) {
      waitingReply = true;
      continue;
    }

    if (waitingReply && item.rol === "user") {
      latestReply = item.mensaje;
      waitingReply = false;
    }
  }

  return latestReply;
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
      item.mensaje.includes(PRODUCT_LIST_MARKER)
    ) {
      for (let lookup = index + 1; lookup < messages.length; lookup += 1) {
        if (messages[lookup].rol === "user") {
          return messages[lookup].mensaje;
        }
      }
    }
  }

  return null;
}

function getLatestBotMessageByPrefix(recentMessages, prefix) {
  return [...(recentMessages || [])]
    .reverse()
    .find(
      (item) =>
        item.rol === "bot" &&
        typeof item.mensaje === "string" &&
        item.mensaje.startsWith(prefix)
    );
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

  return `Si alguna opcion te gusta, comparteme el numero o el nombre. Si ninguna te convence, tambien puedo ayudarte a ver otras opciones o ponerte con un asesor.`;
}

function isProductRejectionMessage(message) {
  const normalized = normalizeText(message);

  return (
    normalized.includes("no me interesa ninguna") ||
    normalized.includes("ninguna me interesa") ||
    normalized.includes("no me gusta ninguna") ||
    normalized.includes("no quiero ninguna") ||
    normalized.includes("ninguna opcion") ||
    normalized.includes("ninguna") ||
    normalized.includes("no me convence") ||
    normalized.includes("no me convencen") ||
    normalized.includes("quiero otras opciones") ||
    normalized.includes("tienes otras opciones") ||
    normalized.includes("busco otra opcion")
  );
}

function buildProductRejectionReply(category) {
  return (
    `No pasa nada. Si quieres, puedo mostrarte otras opciones de ${category.tipoCategoria} ` +
    'o te comunico con un asesor para ayudarte a elegir. Si prefieres hablar con una persona, escribe "quiero hablar con un asesor".'
  );
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


function isNegativeMessage(message) {
  return /^(no|incorrecto|no es correcto|cambiar|corrijo)$/i.test(
    String(message || "").trim()
  );
}

function isFlexibleAffirmativeMessage(message) {
  return /^(si|s[ií]|si es correcto|s[ií],?\s*es correcto|correcto|es correcto|confirmo|ok|okay)$/i.test(
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
  const prefix = `${FINAL_ORDER_PREFIX}\n`;
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

function extractFinalOrderWindowFromBotMessage(message) {
  const normalized = String(message || "").trim();
  const prefix = `${FINAL_ORDER_PREFIX}\n`;
  const windowLinePrefix = "Horario de entrega: ";
  const confirmationLine =
    'Si todo es correcto, responde "si". Si deseas cambiar algo, responde "no".';

  if (!normalized.startsWith(prefix) || !normalized.includes(confirmationLine)) {
    return null;
  }

  const windowLine = normalized
    .split("\n")
    .find((line) => line.startsWith(windowLinePrefix));

  if (!windowLine) {
    return null;
  }

  return windowLine.slice(windowLinePrefix.length).trim();
}

function extractSelectedWindowFromBotMessage(message) {
  const normalized = String(message || "").trim();

  if (!normalized.startsWith(REQUEST_EXACT_ADDRESS_PREFIX)) {
    return null;
  }

  const withoutPrefix = normalized.slice(REQUEST_EXACT_ADDRESS_PREFIX.length);
  const [windowLabel] = withoutPrefix.split(". Ahora comparteme la direccion completa", 1);
  return windowLabel ? windowLabel.trim() : null;
}

function extractDeliveryWindowSelection(message) {
  const normalized = String(message || "").toLowerCase().trim();
  const optionMatch = normalized.match(
    /\b(?:opcion|opción)\s*#?\s*(\d+)\b|\b(\d+)\b/
  );

  if (!optionMatch) {
    return null;
  }

  const rawIndex = optionMatch[1] || optionMatch[2];
  const index = Number.parseInt(rawIndex, 10);
  return Number.isInteger(index) && index > 0 ? index - 1 : null;
}

function getLatestFinalOrderAddressFromRecentMessages(recentMessages) {
  const botMessage = getLatestBotMessageByPrefix(recentMessages, FINAL_ORDER_PREFIX);

  if (!botMessage) {
    return null;
  }

  return extractFinalOrderAddressFromBotMessage(botMessage.mensaje);
}

function getLatestFinalOrderWindowFromRecentMessages(recentMessages) {
  const botMessage = getLatestBotMessageByPrefix(recentMessages, FINAL_ORDER_PREFIX);

  if (!botMessage) {
    return null;
  }

  return extractFinalOrderWindowFromBotMessage(botMessage.mensaje);
}

function getLatestSelectedWindowFromRecentMessages(recentMessages) {
  const botMessage = getLatestBotMessageByPrefix(
    recentMessages,
    REQUEST_EXACT_ADDRESS_PREFIX
  );

  if (!botMessage) {
    return null;
  }

  return extractSelectedWindowFromBotMessage(botMessage.mensaje);
}

function getLatestDeliveryWindowSelectionIndexFromRecentMessages(recentMessages) {
  const messages = [...(recentMessages || [])];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];

    if (item.rol !== "bot" || typeof item.mensaje !== "string") {
      continue;
    }

    if (
      item.mensaje.startsWith(DELIVERY_OPTIONS_PREFIX) ||
      item.mensaje.startsWith(DELIVERY_OPTIONS_REMINDER_PREFIX)
    ) {
      for (let lookup = index + 1; lookup < messages.length; lookup += 1) {
        if (messages[lookup].rol === "user") {
          return extractDeliveryWindowSelection(messages[lookup].mensaje);
        }
      }

      return null;
    }
  }

  return null;
}

function getLatestRequestedDateFromRecentMessages(recentMessages) {
  const reply =
    getLatestUserReplyAfterBotPrefix(recentMessages, REQUEST_DATE_PREFIX) ||
    getLatestUserReplyAfterBotPrefix(recentMessages, REQUEST_PICKUP_DATE_PREFIX);
  return reply ? parseRequestedDeliveryDate(reply) : null;
}

function getLatestPreliminaryZoneFromRecentMessages(recentMessages) {
  return getLatestUserReplyAfterBotPrefix(recentMessages, REQUEST_ZONE_PREFIX);
}

function detectDeliveryTypeChoice(message) {
  const normalized = normalizeText(message);

  if (
    normalized === "1" ||
    normalized.includes("a domicilio") ||
    normalized.includes("domicilio") ||
    normalized.includes("envio")
  ) {
    return "domicilio";
  }

  if (
    normalized === "2" ||
    normalized.includes("recoger") ||
    normalized.includes("tienda") ||
    normalized.includes("sucursal") ||
    normalized.includes("pickup")
  ) {
    return "pickup";
  }

  return null;
}

function getLatestDeliveryTypeFromRecentMessages(recentMessages) {
  const reply = getLatestUserReplyAfterBotPrefix(
    recentMessages,
    REQUEST_DELIVERY_TYPE_PREFIX
  );

  return reply ? detectDeliveryTypeChoice(reply) : null;
}

function buildEarliestDeliveryDateTime({ product, coverage, requestedDate }) {
  const now = new Date();
  const prepMinutes =
    Number(product?.tiempoPreparacionMin || 60) +
    Number(coverage?.bufferLogisticoMin || 30);
  const earliest = new Date(now.getTime() + prepMinutes * 60 * 1000);
  const todayKey = formatLocalDate(now);
  const requestedDateKey = requestedDate ? formatLocalDate(requestedDate) : null;
  let datePart = formatLocalDate(earliest);
  let timePart = formatBusinessTime(earliest);

  if (product?.permiteEntregaMismoDia === false) {
    const nextBusinessDay = addBusinessDays(startOfLocalDay(now), 1);
    datePart = formatLocalDate(nextBusinessDay);
    timePart = "00:00:00";
  }

  if (requestedDateKey && requestedDateKey > todayKey) {
    datePart = requestedDateKey;
    timePart = "00:00:00";
  }

  return {
    date: datePart,
    time: timePart,
  };
}

async function buildDeliveryOptionsFromContext({
  recentMessages,
  conversationCategoryId,
  deliveryAddress,
  requestedDate,
}) {
  const selectedProduct = await getSelectedProductFromRecentMessages(
    recentMessages,
    conversationCategoryId
  );

  if (!selectedProduct) {
    return null;
  }

  const geocodedAddress = await geocodeAddress(deliveryAddress);

  if (!geocodedAddress.ok || !geocodedAddress.result?.location) {
    return null;
  }

  const coverage = await findClosestBranchCoverage({
    lat: geocodedAddress.result.location.lat,
    lng: geocodedAddress.result.location.lng,
  });

  if (!coverage || !coverage.dentroDeCobertura) {
    return null;
  }

  const earliest = buildEarliestDeliveryDateTime({
    product: selectedProduct,
    coverage,
    requestedDate,
  });
  const windows = await findAvailableDeliveryWindows({
    sucursalId: coverage.id,
    earliestDate: earliest.date,
    earliestTime: earliest.time,
    limit: 3,
    exactDate: Boolean(requestedDate),
  });

  return {
    selectedProduct,
    coverage,
    windows,
  };
}

async function buildDeliveryOptionsFromRecentSelections({
  recentMessages,
  conversationCategoryId,
}) {
  const preliminaryZone = getLatestPreliminaryZoneFromRecentMessages(recentMessages);
  const requestedDate = getLatestRequestedDateFromRecentMessages(recentMessages);

  if (!preliminaryZone || !requestedDate?.date) {
    return null;
  }

  return buildDeliveryOptionsFromContext({
    recentMessages,
    conversationCategoryId,
    deliveryAddress: preliminaryZone,
    requestedDate: requestedDate.date,
  });
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

async function buildAddressConfirmedReply() {
  const result = await handleDeliveryToolCall("confirmar_direccion_entrega", {
    direccionEntrega: null,
  });

  return result.mensaje;
}

async function buildFinalOrderConfirmationReply({
  product,
  deliveryAddress,
  deliveryWindowLabel,
}) {
  const result = await handleDeliveryToolCall("solicitar_confirmacion_pedido", {
    nombreProducto: product.nombre,
    precioProducto: formatMoney(product.precio),
    direccionEntrega: deliveryAddress,
    horarioEntrega: deliveryWindowLabel,
  });

  return result.mensaje;
}

async function buildPickupOrderConfirmationReply({
  product,
  requestedDateLabel,
}) {
  const result = await handleDeliveryToolCall("solicitar_confirmacion_pedido", {
    nombreProducto: product.nombre,
    precioProducto: formatMoney(product.precio),
    tipoEntrega: "pickup",
    fechaRecolecta: requestedDateLabel,
  });

  return result.mensaje;
}

function buildPickupRegisteredReply({
  order,
  branch,
  requestedDateLabel,
}) {
  const pickupWindow =
    branch?.horaApertura && branch?.horaCierre
      ? `${formatClockLabel(branch.horaApertura)} y ${formatClockLabel(
          branch.horaCierre
        )}`
      : "el horario habitual de la tienda";
  const readyAt = branch?.horaApertura
    ? `a partir de las ${formatClockLabel(branch.horaApertura)}`
    : "a partir de la apertura";
  const locationLine = branch?.direccion
    ? `${branch.nombre}, ${branch.direccion}`
    : branch?.nombre || "nuestra sucursal";

  return (
    `Excelente. Tu pedido #${order.id} ya quedo registrado.\n\n` +
    `Recogida en: ${locationLine}\n` +
    `Maps: ${branch?.mapsUrl || "Ubicacion disponible al confirmar con un asesor"}\n` +
    `Horario: Puedes pasar ${requestedDateLabel || "en la fecha acordada"} ${pickupWindow}. ` +
    `Tu pedido estara listo ${readyAt}.\n` +
    "Pago: Podras liquidarlo directamente en caja al recoger (efectivo o tarjeta).\n" +
    "Ayuda: Si te retrasas o necesitas apoyo, responde a este chat y te conectamos con un agente."
  );
}

async function buildDeliveryOptionsReply(windows) {
  const result = await handleDeliveryToolCall("mostrar_opciones_entrega", {
    opciones: windows.map((window) => ({
      etiqueta: formatDeliveryWindowLabel(window),
    })),
  });

  return result.mensaje;
}

async function tryFindConversationStateIdByName(name) {
  try {
    return await findConversationStateIdByName(name);
  } catch (_error) {
    return null;
  }
}

function isGratitudeMessage(message) {
  return /^(gracias|muchas gracias|te lo agradezco|mil gracias|perfecto gracias)$/i.test(
    String(message || "").trim()
  );
}

function buildPostPurchaseReply() {
  return (
    "Con gusto. Tu pedido ya quedo confirmado y en breve te compartiremos el seguimiento. " +
    'Si deseas hacer otro pedido, escribe "nuevo pedido".'
  );
}

function hasRecentPurchaseConfirmation(recentMessages) {
  return [...(recentMessages || [])]
    .reverse()
    .some(
      (item) =>
        item.rol === "bot" &&
        typeof item.mensaje === "string" &&
        item.mensaje.startsWith("Gracias por tu compra. Tu pedido ha sido registrado")
    );
}

function isLikelyNewPurchaseMessage(message) {
  const normalized = normalizeText(message);

  return (
    normalized.includes("nuevo pedido") ||
    normalized.includes("otro pedido") ||
    normalized.includes("quiero otro") ||
    normalized.includes("quiero comprar") ||
    normalized.includes("comprar flores") ||
    normalized.includes("busco flores") ||
    normalized.includes("necesito flores") ||
    normalized.includes("aniversario") ||
    normalized.includes("cumpleanos") ||
    normalized.includes("solo porque si")
  );
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
    const postPurchaseStateId =
      await tryFindConversationStateIdByName("pedido_confirmado");
    const hasRecentConfirmedPurchase =
      hasRecentPurchaseConfirmation(recentMessages);

    if (Number(conversationStateId) === Number(waitingAddressStateId)) {
      if (!conversationId) {
        return "No pude ubicar la conversacion activa para registrar la direccion.";
      }

      const previousBotMessage = getPreviousBotMessage(recentMessages, message);
      const previousUserMessage = getPreviousUserMessage(recentMessages, message);
      const pendingFinalOrderAddress = extractFinalOrderAddressFromBotMessage(
        previousBotMessage?.mensaje
      );
      const pendingFinalOrderWindow = extractFinalOrderWindowFromBotMessage(
        previousBotMessage?.mensaje
      );
      const pendingConfirmedAddress = extractConfirmedAddressFromBotMessage(
        previousBotMessage?.mensaje
      );
      const pendingSelectedWindow = extractSelectedWindowFromBotMessage(
        previousBotMessage?.mensaje
      );
      const pendingPickupConfirmation =
        previousBotMessage?.mensaje?.startsWith(
          "Corrobora tu pedido para recoger en tienda:"
        ) || false;

      if (
        previousBotMessage?.mensaje?.startsWith(DELIVERY_OPTIONS_PREFIX) ||
        previousBotMessage?.mensaje?.startsWith(DELIVERY_OPTIONS_REMINDER_PREFIX)
      ) {
        const optionIndex = extractDeliveryWindowSelection(message);

        if (optionIndex === null) {
          return 'Responde con el numero de la opcion de entrega que prefieras.';
        }

        const deliveryContext = await buildDeliveryOptionsFromRecentSelections({
          recentMessages,
          conversationCategoryId,
        });

        if (!deliveryContext || deliveryContext.windows.length === 0) {
          return "Por ahora no encontre horarios disponibles para la fecha solicitada. Intenta con otra fecha o mas tarde.";
        }

        const selectedWindow = deliveryContext.windows[optionIndex];

        if (!selectedWindow) {
          return 'No reconoci esa opcion. Responde con el numero de una de las opciones de entrega disponibles.';
        }

        return buildExactAddressRequestReply(
          formatDeliveryWindowLabel(selectedWindow)
        );
      }

      if (pendingFinalOrderAddress && isFlexibleAffirmativeMessage(message)) {
        const deliveryContext = await buildDeliveryOptionsFromRecentSelections({
          recentMessages,
          conversationCategoryId,
        });

        if (!deliveryContext || deliveryContext.windows.length === 0) {
          return "Por ahora no encontre horarios disponibles para la fecha solicitada. Intenta con otra fecha o mas tarde.";
        }

        const selectedWindow = deliveryContext.windows.find(
          (window) => formatDeliveryWindowLabel(window) === pendingFinalOrderWindow
        );

        if (!selectedWindow) {
          return "El horario que habias elegido ya no esta disponible. Voy a mostrarte las opciones actualizadas.\n\n" +
            (await buildDeliveryOptionsReply(deliveryContext.windows));
        }

        const reservedWindow = await reserveDeliveryWindow(selectedWindow.id);

        if (!reservedWindow) {
          return "Esa opcion ya se ocupo. Voy a mostrarte las opciones disponibles de nuevo.\n\n" +
            (await buildDeliveryOptionsReply(deliveryContext.windows));
        }

        if (!customerId) {
          throw new Error(
            "Faltan datos del cliente para crear el pedido programado."
          );
        }

        await createOrder({
          customerId,
          productId: deliveryContext.selectedProduct.id,
          conversationId,
          deliveryAddress: pendingFinalOrderAddress,
          branchId: deliveryContext.coverage.id,
          deliveryDate: reservedWindow.fecha,
          deliveryStartTime: reservedWindow.horaInicio,
          deliveryEndTime: reservedWindow.horaFin,
          total: deliveryContext.selectedProduct.precio,
        });

        await updateConversationState({
          conversationId,
          stateName: postPurchaseStateId ? "pedido_confirmado" : "inicio",
        });

        return buildAddressConfirmedReply();
      }

      if (pendingFinalOrderAddress && isNegativeMessage(message)) {
        return "De acuerdo. Comparteme la direccion corregida para continuar.";
      }

      if (pendingPickupConfirmation && isFlexibleAffirmativeMessage(message)) {
        const selectedProduct = await getSelectedProductFromRecentMessages(
          recentMessages,
          conversationCategoryId
        );
        const requestedDate = getLatestRequestedDateFromRecentMessages(recentMessages);
        const pickupBranch = await findDefaultPickupBranch();

        if (!selectedProduct || !customerId || !conversationId) {
          throw new Error("Faltan datos para confirmar el pedido de recoleccion.");
        }

        const order = await createOrder({
          customerId,
          productId: selectedProduct.id,
          conversationId,
          branchId: pickupBranch?.id || null,
          deliveryDate: requestedDate?.date || null,
          total: selectedProduct.precio,
          deliveryStatus: "pendiente_recoleccion",
        });

        await updateConversationState({
          conversationId,
          stateName: postPurchaseStateId ? "pedido_confirmado" : "inicio",
        });

        return buildPickupRegisteredReply({
          order,
          branch: pickupBranch,
          requestedDateLabel: requestedDate?.label || "en la fecha acordada",
        });
      }

      if (pendingPickupConfirmation && isNegativeMessage(message)) {
        await updateConversationState({
          conversationId,
          stateName: "esperando_producto",
        });

        return "De acuerdo. Dime que producto prefieres o si deseas cambiar la fecha estimada de recoleccion.";
      }

      if (pendingConfirmedAddress && isFlexibleAffirmativeMessage(message)) {
        const selectedProduct = await getSelectedProductFromRecentMessages(
          recentMessages,
          conversationCategoryId
        );

        if (!selectedProduct) {
          return "No pude recuperar el producto seleccionado para corroborar el pedido.";
        }

        let selectedWindowLabel =
          getLatestSelectedWindowFromRecentMessages(recentMessages);

        if (!selectedWindowLabel) {
          const deliveryContext = await buildDeliveryOptionsFromRecentSelections({
            recentMessages,
            conversationCategoryId,
          });
          const selectedWindowIndex =
            getLatestDeliveryWindowSelectionIndexFromRecentMessages(recentMessages);

          if (
            deliveryContext &&
            Number.isInteger(selectedWindowIndex) &&
            deliveryContext.windows[selectedWindowIndex]
          ) {
            selectedWindowLabel = formatDeliveryWindowLabel(
              deliveryContext.windows[selectedWindowIndex]
            );
          }
        }

        if (!selectedWindowLabel) {
          return "No pude recuperar el horario seleccionado. Voy a mostrarte las opciones disponibles de nuevo.";
        }

        return buildFinalOrderConfirmationReply({
          product: selectedProduct,
          deliveryAddress: pendingConfirmedAddress,
          deliveryWindowLabel: selectedWindowLabel,
        });
      }

      if (pendingSelectedWindow && isNegativeMessage(message)) {
        return "De acuerdo. Responde con el numero del horario que prefieras.";
      }

      if (pendingConfirmedAddress && isNegativeMessage(message)) {
        return buildAddressRetryReply();
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

    if (
      postPurchaseStateId &&
      Number(conversationStateId) === Number(postPurchaseStateId)
    ) {
      const activeIntentions = await getActiveIntentions();
      const matchedCategoryFromFreeText = await detectCategoryInMessage(message);
      const detectedIntentionName = await detectIntentionWithOpenAI(
        message,
        activeIntentions
      );

      if (
        isGratitudeMessage(message) ||
        isGreetingMessage(message) ||
        !isLikelyNewPurchaseMessage(message)
      ) {
        return buildPostPurchaseReply();
      }

      if (conversationId && matchedCategoryFromFreeText) {
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

        return buildDeliveryTypeRequestReply();
      }

      if (
        conversationId &&
        detectedIntentionName === "comprar_flores"
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

      return buildPostPurchaseReply();
    }

    if (hasRecentConfirmedPurchase && !isLikelyNewPurchaseMessage(message)) {
      return buildPostPurchaseReply();
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
      const previousBotMessage = getPreviousBotMessage(recentMessages, message);

      if (previousBotMessage?.mensaje?.startsWith(REQUEST_DELIVERY_TYPE_PREFIX)) {
        const deliveryType = detectDeliveryTypeChoice(message);

        if (!deliveryType) {
          return buildDeliveryTypeRequestReply();
        }

        return deliveryType === "pickup"
          ? buildPickupDateRequestReply()
          : buildCoverageZoneRequestReply();
      }

      if (previousBotMessage?.mensaje?.startsWith(REQUEST_ZONE_PREFIX)) {
        if (isGreetingMessage(message) || String(message || "").trim().length < 3) {
          return buildCoverageZoneRequestReply();
        }

        const geocodedZone = await geocodeAddress(message);

        if (!geocodedZone.ok || !geocodedZone.result?.formattedAddress) {
          return "No pude validar esa zona. Comparteme la colonia y municipio o el codigo postal de entrega.";
        }

        if (!geocodedZone.result.withinMonterreyMetro) {
          return buildAddressOutsideMetroReply(geocodedZone.result.municipality);
        }

        const coverage = await findClosestBranchCoverage({
          lat: geocodedZone.result.location.lat,
          lng: geocodedZone.result.location.lng,
        });

        if (!coverage || !coverage.dentroDeCobertura) {
          geocodedZone.result.coverage = coverage;
          return buildAddressOutOfCoverageReply(geocodedZone.result);
        }

        return buildDeliveryDateRequestReply();
      }

      if (
        previousBotMessage?.mensaje?.startsWith(REQUEST_DATE_PREFIX) ||
        previousBotMessage?.mensaje?.startsWith(REQUEST_PICKUP_DATE_PREFIX) ||
        previousBotMessage?.mensaje?.startsWith(DATE_RETRY_PREFIX)
      ) {
        const requestedDate = parseRequestedDeliveryDate(message);

        if (!requestedDate) {
          return "No pude identificar la fecha deseada. Responde solo con hoy, manana o una fecha como 20/03/2026.";
        }

        return buildProductListForRequestedDateReply(
          selectedCategory,
          products,
          requestedDate
        );
      }

      const selectedProduct = await findActiveProductSelection(
        selectedCategory.id,
        message
      );

      if (selectedProduct) {
        if (!customerId || !conversationId) {
          throw new Error(
            "Faltan datos de cliente o conversacion para continuar con la compra."
          );
        }

        const deliveryType = getLatestDeliveryTypeFromRecentMessages(recentMessages);

        await updateConversationState({
          conversationId,
          stateName: "esperando_direccion",
        });

        if (deliveryType === "pickup") {
          const requestedDate = getLatestRequestedDateFromRecentMessages(recentMessages);

          return buildPickupOrderConfirmationReply({
            product: selectedProduct,
            requestedDateLabel: requestedDate?.label || "la fecha solicitada",
          });
        }

        const deliveryContext = await buildDeliveryOptionsFromRecentSelections({
          recentMessages,
          conversationCategoryId,
        });

        if (!deliveryContext || deliveryContext.windows.length === 0) {
          await updateConversationState({
            conversationId,
            stateName: "esperando_producto",
          });

          return "Por ahora no encontre horarios disponibles para la fecha solicitada con ese producto. Comparteme otra fecha para intentar de nuevo.";
        }

        return buildDeliveryOptionsReply(deliveryContext.windows);
      }

      if (!selectedProduct) {
        if (isProductRejectionMessage(message)) {
          return buildProductRejectionReply(selectedCategory);
        }

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

        const requestedDate = getLatestRequestedDateFromRecentMessages(recentMessages);

        return requestedDate
          ? buildProductListForRequestedDateReply(
              selectedCategory,
              products,
              requestedDate
            )
          : buildDeliveryTypeRequestReply();
      }
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

      return buildDeliveryTypeRequestReply();
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

      return buildDeliveryTypeRequestReply();
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

