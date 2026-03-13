const db = require("../db");

async function getActiveIntentions() {
  const result = await db.query(
    `
      SELECT id, nombre, descripcion
      FROM cat_intenciones
      WHERE activo = true
      ORDER BY id ASC
    `
  );

  const uniqueNames = new Set();

  return result.rows
    .map((row) => ({
      id: Number(row.id),
      nombre: String(row.nombre || "").trim(),
      descripcion: String(row.descripcion || "").trim(),
    }))
    .filter((row) => row.nombre.length > 0)
    .filter((row) => {
      const key = row.nombre.toLowerCase();

      if (uniqueNames.has(key)) {
        return false;
      }

      uniqueNames.add(key);
      return true;
    });
}

async function findActiveIntentionByName(name) {
  const result = await db.query(
    `
      SELECT id, nombre, descripcion
      FROM cat_intenciones
      WHERE nombre = $1
        AND activo = true
      LIMIT 1
    `,
    [name]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: Number(result.rows[0].id),
    nombre: String(result.rows[0].nombre || "").trim(),
    descripcion: String(result.rows[0].descripcion || "").trim(),
  };
}

module.exports = {
  getActiveIntentions,
  findActiveIntentionByName,
};
