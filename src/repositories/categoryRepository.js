const db = require("../db");

async function getActiveCategories() {
  const result = await db.query(
    `
      SELECT id, tipo_categoria, orden
      FROM cat_categorias
      WHERE activo = true
      ORDER BY orden ASC, id ASC
    `
  );

  const uniqueNames = new Set();

  return result.rows
    .map((row) => ({
      id: Number(row.id),
      tipoCategoria: String(row.tipo_categoria || "").trim(),
      orden: Number(row.orden || 0),
    }))
    .filter((row) => row.tipoCategoria.length > 0)
    .filter((row) => {
      const key = row.tipoCategoria.toLowerCase();

      if (uniqueNames.has(key)) {
        return false;
      }

      uniqueNames.add(key);
      return true;
    });
}

module.exports = {
  getActiveCategories,
};
