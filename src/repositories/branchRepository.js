const db = require("../db");

function pickString(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function buildBranchAddress(payload) {
  const fullAddress = pickString(payload, [
    "direccion_completa",
    "direccion",
    "domicilio",
  ]);

  if (fullAddress) {
    return fullAddress;
  }

  const parts = [
    pickString(payload, ["calle", "street"]),
    pickString(payload, ["numero", "numero_exterior", "num_ext"]),
    pickString(payload, ["colonia"]),
    pickString(payload, ["municipio", "ciudad"]),
  ].filter(Boolean);

  return parts.join(", ");
}

async function findClosestBranchCoverage({ lat, lng }) {
  const result = await db.query(
    `
      SELECT
        id,
        nombre,
        radio_entrega_metros,
        buffer_logistico_min,
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
    bufferLogisticoMin: Number(row.buffer_logistico_min || 30),
    distanciaMetros: Number(row.distancia_metros || 0),
    dentroDeCobertura: Boolean(row.dentro_de_cobertura),
  };
}

async function findDefaultPickupBranch() {
  const result = await db.query(
    `
      SELECT
        s.id,
        s.nombre,
        s.hora_apertura,
        s.hora_cierre,
        s.tiempo_preparacion_min,
        ST_Y(s.ubicacion::geometry) AS latitud,
        ST_X(s.ubicacion::geometry) AS longitud,
        to_jsonb(s) AS payload
      FROM public.sucursales s
      WHERE COALESCE(s.activo, TRUE) = TRUE
      ORDER BY s.id ASC
      LIMIT 1
    `
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const payload = row.payload || {};
  const address = buildBranchAddress(payload);
  const latitude = Number(row.latitud || 0);
  const longitude = Number(row.longitud || 0);
  const mapsUrl =
    latitude && longitude
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          address || row.nombre
        )}`;

  return {
    id: Number(row.id),
    nombre: String(row.nombre || "").trim(),
    direccion: address || null,
    horaApertura: row.hora_apertura || null,
    horaCierre: row.hora_cierre || null,
    tiempoPreparacionMin: Number(row.tiempo_preparacion_min || 60),
    mapsUrl,
  };
}

module.exports = {
  findClosestBranchCoverage,
  findDefaultPickupBranch,
};
