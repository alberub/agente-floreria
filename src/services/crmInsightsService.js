function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesAny(source, tokens) {
  return tokens.some((token) => source.includes(token));
}

function buildCrmInsights({
  customerName = null,
  stageCode = null,
  latestMessage = "",
  recentMessages = [],
  hasOrder = false,
  estimatedValue = null,
}) {
  const normalizedStage = normalize(stageCode);
  const normalizedLatest = normalize(latestMessage);
  const userMessages = recentMessages
    .filter((item) => normalize(item?.rol) === "user")
    .map((item) => normalize(item?.mensaje))
    .join(" ");

  const objections = [];
  const scoreReasons = [];
  let score = 35;

  if (estimatedValue && Number(estimatedValue) > 0) {
    score += 18;
    scoreReasons.push("ya existe valor potencial en la oportunidad");
  }

  if (hasOrder) {
    score += 20;
    scoreReasons.push("hay pedido vinculado");
  }

  if (includesAny(userMessages, ["precio", "costo", "pago", "disponible"])) {
    score += 10;
    scoreReasons.push("el lead esta validando precio o disponibilidad");
  }

  if (includesAny(userMessages, ["quiero", "me interesa", "confirmo", "agendo"])) {
    score += 16;
    scoreReasons.push("el lead expresa intencion de compra");
  }

  if (includesAny(userMessages, ["caro", "despues", "luego", "te aviso", "pensar"])) {
    score -= 16;
    objections.push("objecion de precio o postergacion");
  }

  if (includesAny(normalizedLatest, ["comprobante", "transferencia"]) && !hasOrder) {
    objections.push("falta cierre de pago");
  }

  if (includesAny(normalizedStage, ["entregado", "venta_cerrada"])) {
    score = 98;
  }

  score = Math.max(0, Math.min(Math.round(score), 100));

  const scoreBand = score >= 70 ? "alto" : score >= 45 ? "medio" : "bajo";
  const nextBestAction =
    normalizedStage.includes("pendiente")
      ? "Pedir comprobante y cerrar validacion de pago hoy."
      : normalizedStage.includes("cotizacion")
      ? "Dar seguimiento a la cotizacion y resolver objeciones puntuales."
      : objections.length
      ? "Responder la objecion principal y proponer un siguiente paso con fecha."
      : "Confirmar siguiente paso comercial con fecha de seguimiento.";
  const summary =
    score >= 70
      ? "Lead caliente con alta probabilidad de cierre cercano."
      : score >= 45
      ? "Lead activo con avance comercial, requiere seguimiento oportuno."
      : "Lead en etapa temprana o con friccion, conviene reforzar calificacion.";
  const prospectName = String(customerName || "cliente").trim() || "cliente";
  const replySuggestion = `Hola ${prospectName}, te ayudo a avanzar hoy. Si te parece, confirmamos el siguiente paso para dejarlo listo sin retrasos.`;

  return {
    summary,
    score,
    scoreBand,
    scoreReasons: scoreReasons.slice(0, 4),
    objections: objections.slice(0, 3),
    nextBestAction,
    replySuggestion,
  };
}

module.exports = {
  buildCrmInsights,
};
