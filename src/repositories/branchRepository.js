const db = require("../db");

async function findClosestBranchCoverage({ lat, lng }) {
  const result = await db.query(
    `
      SELECT
        id,
        nombre,
        radio_entrega_metros,
        ST_Distance(
          ubicacion,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS distancia_metros,
        ST_DWithin(
          ubicacion,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          radio_entrega_metros
        ) AS dentro_de_cobertura
      FROM public.sucursales
      ORDER BY distancia_metros ASC
      LIMIT 1
    `,
    [lng, lat]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: Number(row.id),
    nombre: String(row.nombre || "").trim(),
    radioEntregaMetros: Number(row.radio_entrega_metros || 0),
    distanciaMetros: Number(row.distancia_metros || 0),
    dentroDeCobertura: Boolean(row.dentro_de_cobertura),
  };
}

module.exports = {
  findClosestBranchCoverage,
};
