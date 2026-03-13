const db = require("../db");

function normalizeCategoryText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

async function findActiveCategoryByName(categoryName) {
  const categories = await getActiveCategories();
  const normalizedInput = normalizeCategoryText(categoryName);
  const compactInput = normalizedInput.replace(/\s+/g, "");
  const inputTokens = normalizedInput.split(" ").filter((token) => token.length >= 5);

  if (!normalizedInput) {
    return null;
  }

  return (
    categories.find(
      (category) => {
        const normalizedCategory = normalizeCategoryText(category.tipoCategoria);
        const compactCategory = normalizedCategory.replace(/\s+/g, "");

        return (
          normalizedCategory === normalizedInput ||
          compactCategory === compactInput ||
          compactCategory.includes(compactInput) ||
          compactInput.includes(compactCategory) ||
          inputTokens.some((token) => compactCategory.includes(token))
        );
      }
    ) || null
  );
}

module.exports = {
  getActiveCategories,
  findActiveCategoryByName,
  normalizeCategoryText,
};
