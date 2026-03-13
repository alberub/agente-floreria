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
      VALUES ($1, $2, $3, NOW())
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

module.exports = {
  saveMessage,
};
