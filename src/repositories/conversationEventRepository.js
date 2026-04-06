const db = require("../db");

async function createConversationEvent({
  conversationId,
  eventCode,
  actorType = null,
  actorRef = null,
  payload = {},
  occurredAt = null,
}) {
  if (!conversationId || !eventCode) {
    throw new Error("conversationId y eventCode son requeridos para registrar un evento.");
  }

  const result = await db.query(
    `
      INSERT INTO public.conversation_event (
        conversation_id,
        event_code,
        actor_type,
        actor_ref,
        payload_json,
        occurred_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW()))
      RETURNING id
    `,
    [
      conversationId,
      eventCode,
      actorType,
      actorRef,
      JSON.stringify(payload || {}),
      occurredAt,
    ]
  );

  return Number(result.rows[0].id);
}

module.exports = {
  createConversationEvent,
};
