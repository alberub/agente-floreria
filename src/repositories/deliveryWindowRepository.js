const db = require("../db");

function formatDateValue(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return String(value || "").slice(0, 10);
}

function formatTimeValue(value) {
  if (value instanceof Date) {
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const seconds = String(value.getSeconds()).padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  }

  return String(value || "").slice(0, 8);
}

function mapWindow(row) {
  return {
    id: Number(row.id),
    sucursalId: Number(row.sucursal_id),
    fecha: formatDateValue(row.fecha),
    horaInicio: formatTimeValue(row.hora_inicio),
    horaFin: formatTimeValue(row.hora_fin),
    capacidadMaxima: Number(row.capacidad_maxima || 0),
    capacidadReservada: Number(row.capacidad_reservada || 0),
    estado: row.estado,
  };
}

async function findAvailableDeliveryWindows({
  sucursalId,
  earliestDate,
  earliestTime,
  limit = 3,
}) {
  const result = await db.query(
    `
      SELECT id, sucursal_id, fecha, hora_inicio, hora_fin, capacidad_maxima, capacidad_reservada, estado
      FROM public.ventanas_entrega
      WHERE sucursal_id = $1
        AND estado IN ('disponible', 'seed')
        AND capacidad_reservada < capacidad_maxima
        AND (
          fecha > $2
          OR (fecha = $2 AND hora_inicio >= $3)
        )
      ORDER BY fecha ASC, hora_inicio ASC
      LIMIT $4
    `,
    [sucursalId, earliestDate, earliestTime, limit]
  );

  return result.rows.map(mapWindow);
}

async function reserveDeliveryWindow(windowId) {
  const result = await db.query(
    `
      UPDATE public.ventanas_entrega
      SET capacidad_reservada = capacidad_reservada + 1
      WHERE id = $1
        AND capacidad_reservada < capacidad_maxima
      RETURNING id, sucursal_id, fecha, hora_inicio, hora_fin, capacidad_maxima, capacidad_reservada, estado
    `,
    [windowId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapWindow(result.rows[0]);
}

module.exports = {
  findAvailableDeliveryWindows,
  reserveDeliveryWindow,
};
