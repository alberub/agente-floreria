const db = require("../db");

async function saveMessage({ conversacionId, rol, mensaje }) {
  const result = await db.query(
    `
      INSERT INTO public.mensajes (
        conversacion_id,
        rol,
        mensaje,
        fecha
      )
      VALUES ($1, $2, $3, timezone('America/Monterrey', now()))
      RETURNING id, conversacion_id, rol, mensaje, fecha
    `,
    [conversacionId, rol, mensaje]
  );

  return {
    id: Number(result.rows[0].id),
    conversacionId: Number(result.rows[0].conversacion_id),
    rol: result.rows[0].rol,
    mensaje: result.rows[0].mensaje,
    fecha: result.rows[0].fecha,
  };
}

async function getRecentMessagesByConversation(conversacionId, limit = 120) {
  const result = await db.query(
    `
      SELECT id, conversacion_id, rol, mensaje, fecha
      FROM public.mensajes
      WHERE conversacion_id = $1
      ORDER BY id DESC
      LIMIT $2
    `,
    [conversacionId, limit]
  );

  return result.rows
    .reverse()
    .map((row) => ({
      id: Number(row.id),
      conversacionId: Number(row.conversacion_id),
      rol: row.rol,
      mensaje: row.mensaje,
      fecha: row.fecha,
    }));
}

module.exports = {
  saveMessage,
  getRecentMessagesByConversation,
};
