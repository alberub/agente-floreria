const db = require("../db");

function mapOrder(row) {
  return {
    id: Number(row.id),
    clienteId: Number(row.cliente_id),
    productoId: Number(row.producto_id),
    conversacionId: Number(row.conversacion_id),
    direccionEntrega: row.direccion_entrega,
    total: Number(row.total || 0),
    estado: row.estado,
    fechaCreacion: row.fecha_creacion,
  };
}

async function createOrder({
  customerId,
  productId,
  conversationId,
  deliveryAddress = null,
  branchId = null,
  deliveryDate = null,
  deliveryStartTime = null,
  deliveryEndTime = null,
  deliveryStatus = "programado",
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
        fecha_creacion,
        sucursal_id,
        fecha_entrega,
        hora_entrega_inicio,
        hora_entrega_fin,
        fecha_confirmacion,
        estatus_entrega
      )
      VALUES ($1, $2, $3, $4, $5, 'pendiente', NOW(), $6, $7, $8, $9, NOW(), $10)
      RETURNING id, cliente_id, producto_id, conversacion_id, direccion_entrega, total, estado, fecha_creacion
    `,
    [
      customerId,
      productId,
      conversationId,
      deliveryAddress,
      total,
      branchId,
      deliveryDate,
      deliveryStartTime,
      deliveryEndTime,
      deliveryStatus,
    ]
  );

  return mapOrder(result.rows[0]);
}

async function findLatestPendingOrderByConversationId(conversationId) {
  const result = await db.query(
    `
      SELECT id, cliente_id, producto_id, conversacion_id, direccion_entrega, total, estado, fecha_creacion
      FROM public.pedidos
      WHERE conversacion_id = $1
        AND direccion_entrega IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    [conversationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapOrder(result.rows[0]);
}

async function updateOrderDeliveryAddress({ orderId, deliveryAddress }) {
  const result = await db.query(
    `
      UPDATE public.pedidos
      SET direccion_entrega = $2
      WHERE id = $1
      RETURNING id, cliente_id, producto_id, conversacion_id, direccion_entrega, total, estado, fecha_creacion
    `,
    [orderId, deliveryAddress]
  );

  if (result.rows.length === 0) {
    throw new Error(`No existe el pedido: ${orderId}`);
  }

  return mapOrder(result.rows[0]);
}

module.exports = {
  createOrder,
  findLatestPendingOrderByConversationId,
  updateOrderDeliveryAddress,
};
