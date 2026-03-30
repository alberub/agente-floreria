const db = require("../db");

function mapConversationRow(row) {
  return {
    id: Number(row.id),
    clienteId: Number(row.cliente_id),
    estadoId: row.estado_id
      ? Number(row.estado_id)
      : null,
    intencionId: row.intencion_id
      ? Number(row.intencion_id)
      : null,
    categoriaId: row.categoria_id
      ? Number(row.categoria_id)
      : null,
    activa: Boolean(row.activa),
    controlOwner: row.control_owner || "bot",
    humanTakenAt: row.human_taken_at || null,
    humanAgentId: row.human_agent_id || null,
    botPaused: Boolean(row.bot_paused),
  };
}

function getConversationSelectFields() {
  return [
    "id",
    "cliente_id",
    "estado_id",
    "intencion_id",
    "categoria_id",
    "activa",
    "control_owner",
    "human_taken_at",
    "human_agent_id",
    "bot_paused",
  ].join(", ");
}

async function findActiveConversationByCustomerId(customerId) {
  const result = await db.query(
    `
      SELECT ${getConversationSelectFields()}
      FROM public.conversaciones
      WHERE cliente_id = $1
        AND activa = TRUE
      ORDER BY id DESC
      LIMIT 1
    `,
    [customerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapConversationRow(result.rows[0]);
}

async function findConversationById(conversationId) {
  const result = await db.query(
    `
      SELECT ${getConversationSelectFields()}
      FROM public.conversaciones
      WHERE id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapConversationRow(result.rows[0]);
}

async function findConversationStateIdByName(name) {
  const result = await db.query(
    `
      SELECT id
      FROM public.cat_estados_conversacion
      WHERE nombre = $1
      LIMIT 1
    `,
    [name]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe el estado de conversacion: ${name}`);
  }

  return Number(result.rows[0].id);
}

async function createConversationForCustomer(customerId) {
  const initialStateId = await findConversationStateIdByName("inicio");

  const result = await db.query(
    `
      INSERT INTO public.conversaciones (
        cliente_id,
        estado,
        estado_id,
        ultima_interaccion,
        activa
      )
      VALUES ($1, $2, $3, timezone('America/Monterrey', now()), TRUE)
      RETURNING ${getConversationSelectFields()}
    `,
    [customerId, "inicio", initialStateId]
  );

  return {
    ...mapConversationRow(result.rows[0]),
    wasCreated: true,
  };
}

async function findOrCreateActiveConversation(customerId) {
  const activeConversation = await findActiveConversationByCustomerId(customerId);

  if (activeConversation) {
    return {
      ...activeConversation,
      wasCreated: false,
    };
  }

  return createConversationForCustomer(customerId);
}

async function updateConversationIntent({
  conversationId,
  intentionId,
  stateName,
}) {
  const stateId = await findConversationStateIdByName(stateName);

  const result = await db.query(
    `
      UPDATE public.conversaciones
      SET intencion_id = $2,
          estado = $3,
          estado_id = $4,
          ultima_interaccion = timezone('America/Monterrey', now())
      WHERE id = $1
      RETURNING ${getConversationSelectFields()}
    `,
    [conversationId, intentionId, stateName, stateId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return mapConversationRow(result.rows[0]);
}

async function updateConversationCategory({
  conversationId,
  categoryId,
  stateName,
}) {
  const stateId = await findConversationStateIdByName(stateName);

  const result = await db.query(
    `
      UPDATE public.conversaciones
      SET categoria_id = $2,
          estado = $3,
          estado_id = $4,
          ultima_interaccion = timezone('America/Monterrey', now())
      WHERE id = $1
      RETURNING ${getConversationSelectFields()}
    `,
    [conversationId, categoryId, stateName, stateId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return mapConversationRow(result.rows[0]);
}

async function updateConversationState({
  conversationId,
  stateName,
}) {
  const stateId = await findConversationStateIdByName(stateName);

  const result = await db.query(
    `
      UPDATE public.conversaciones
      SET estado = $2,
          estado_id = $3,
          ultima_interaccion = timezone('America/Monterrey', now())
      WHERE id = $1
      RETURNING ${getConversationSelectFields()}
    `,
    [conversationId, stateName, stateId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return mapConversationRow(result.rows[0]);
}

async function takeConversationByHuman({
  conversationId,
  humanAgentId = null,
  pauseBot = true,
}) {
  const result = await db.query(
    `
      UPDATE public.conversaciones
      SET control_owner = 'human',
          human_taken_at = timezone('America/Monterrey', now()),
          human_agent_id = $2,
          bot_paused = $3,
          ultima_interaccion = timezone('America/Monterrey', now())
      WHERE id = $1
      RETURNING ${getConversationSelectFields()}
    `,
    [conversationId, humanAgentId, pauseBot]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return mapConversationRow(result.rows[0]);
}

async function resumeConversationByBot(conversationId) {
  const result = await db.query(
    `
      UPDATE public.conversaciones
      SET control_owner = 'bot',
          human_taken_at = NULL,
          human_agent_id = NULL,
          bot_paused = FALSE,
          ultima_interaccion = timezone('America/Monterrey', now())
      WHERE id = $1
      RETURNING ${getConversationSelectFields()}
    `,
    [conversationId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return mapConversationRow(result.rows[0]);
}

function isBotResponseEnabled(conversation) {
  return Boolean(
    conversation &&
      conversation.controlOwner === "bot" &&
      conversation.botPaused === false
  );
}

module.exports = {
  findActiveConversationByCustomerId,
  findConversationById,
  findConversationStateIdByName,
  createConversationForCustomer,
  findOrCreateActiveConversation,
  updateConversationIntent,
  updateConversationCategory,
  updateConversationState,
  takeConversationByHuman,
  resumeConversationByBot,
  isBotResponseEnabled,
};
