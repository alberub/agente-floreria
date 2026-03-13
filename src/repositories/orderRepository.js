const db = require("../db");

async function createOrder({
  customerId,
  productId,
  conversationId,
  total,
}) {
  const result = await db.query(
    `
      INSERT INTO public.pedidos (
        cliente_id,
        producto_id,
        conversacion_id,
        direccion_entrega,
        total,
        estado,
        fecha_creacion
      )
      VALUES ($1, $2, $3, NULL, $4, 'pendiente', NOW())
      RETURNING id, cliente_id, producto_id, conversacion_id, direccion_entrega, total, estado, fecha_creacion
    `,
    [customerId, productId, conversationId, total]
  );

  return {
    id: Number(result.rows[0].id),
    clienteId: Number(result.rows[0].cliente_id),
    productoId: Number(result.rows[0].producto_id),
    conversacionId: Number(result.rows[0].conversacion_id),
    direccionEntrega: result.rows[0].direccion_entrega,
    total: Number(result.rows[0].total || 0),
    estado: result.rows[0].estado,
    fechaCreacion: result.rows[0].fecha_creacion,
  };
}

module.exports = {
  createOrder,
};
