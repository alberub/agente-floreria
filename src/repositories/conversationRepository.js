const db = require("../db");

async function findActiveConversationByCustomerId(customerId) {
  const result = await db.query(
    `
      SELECT id, cliente_id, estado_id, intencion_id, categoria_id, activa
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

  return {
    id: Number(result.rows[0].id),
    clienteId: Number(result.rows[0].cliente_id),
    estadoId: result.rows[0].estado_id
      ? Number(result.rows[0].estado_id)
      : null,
    intencionId: result.rows[0].intencion_id
      ? Number(result.rows[0].intencion_id)
      : null,
    categoriaId: result.rows[0].categoria_id
      ? Number(result.rows[0].categoria_id)
      : null,
    activa: Boolean(result.rows[0].activa),
  };
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
      VALUES ($1, $2, $3, NOW(), TRUE)
      RETURNING id, cliente_id, estado_id, intencion_id, categoria_id, activa
    `,
    [customerId, "inicio", initialStateId]
  );

  return {
    id: Number(result.rows[0].id),
    clienteId: Number(result.rows[0].cliente_id),
    estadoId: result.rows[0].estado_id
      ? Number(result.rows[0].estado_id)
      : null,
    intencionId: result.rows[0].intencion_id
      ? Number(result.rows[0].intencion_id)
      : null,
    categoriaId: result.rows[0].categoria_id
      ? Number(result.rows[0].categoria_id)
      : null,
    activa: Boolean(result.rows[0].activa),
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
          ultima_interaccion = NOW()
      WHERE id = $1
      RETURNING id, cliente_id, estado_id, intencion_id, categoria_id, activa
    `,
    [conversationId, intentionId, stateName, stateId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return {
    id: Number(result.rows[0].id),
    clienteId: Number(result.rows[0].cliente_id),
    estadoId: result.rows[0].estado_id
      ? Number(result.rows[0].estado_id)
      : null,
    intencionId: result.rows[0].intencion_id
      ? Number(result.rows[0].intencion_id)
      : null,
    categoriaId: result.rows[0].categoria_id
      ? Number(result.rows[0].categoria_id)
      : null,
    activa: Boolean(result.rows[0].activa),
  };
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
          ultima_interaccion = NOW()
      WHERE id = $1
      RETURNING id, cliente_id, estado_id, intencion_id, categoria_id, activa
    `,
    [conversationId, categoryId, stateName, stateId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return {
    id: Number(result.rows[0].id),
    clienteId: Number(result.rows[0].cliente_id),
    estadoId: result.rows[0].estado_id
      ? Number(result.rows[0].estado_id)
      : null,
    intencionId: result.rows[0].intencion_id
      ? Number(result.rows[0].intencion_id)
      : null,
    categoriaId: result.rows[0].categoria_id
      ? Number(result.rows[0].categoria_id)
      : null,
    activa: Boolean(result.rows[0].activa),
  };
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
          ultima_interaccion = NOW()
      WHERE id = $1
      RETURNING id, cliente_id, estado_id, intencion_id, categoria_id, activa
    `,
    [conversationId, stateName, stateId]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe la conversacion: ${conversationId}`);
  }

  return {
    id: Number(result.rows[0].id),
    clienteId: Number(result.rows[0].cliente_id),
    estadoId: result.rows[0].estado_id
      ? Number(result.rows[0].estado_id)
      : null,
    intencionId: result.rows[0].intencion_id
      ? Number(result.rows[0].intencion_id)
      : null,
    categoriaId: result.rows[0].categoria_id
      ? Number(result.rows[0].categoria_id)
      : null,
    activa: Boolean(result.rows[0].activa),
  };
}

module.exports = {
  findActiveConversationByCustomerId,
  findConversationStateIdByName,
  createConversationForCustomer,
  findOrCreateActiveConversation,
  updateConversationIntent,
  updateConversationCategory,
  updateConversationState,
};
