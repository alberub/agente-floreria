const db = require("../db");

function normalizeProductText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getActiveProductsByCategoryId(categoryId) {
  const result = await db.query(
    `
      SELECT id, nombre, descripcion, precio, categoria_id
      FROM public.productos
      WHERE categoria_id = $1
        AND activo = TRUE
      ORDER BY precio ASC, id ASC
    `,
    [categoryId]
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    nombre: String(row.nombre || "").trim(),
    descripcion: row.descripcion ? String(row.descripcion).trim() : null,
    precio: Number(row.precio || 0),
    categoriaId: Number(row.categoria_id),
  }));
}

async function findActiveProductSelection(categoryId, message) {
  const products = await getActiveProductsByCategoryId(categoryId);
  const normalizedMessage = normalizeProductText(message);
  const compactMessage = normalizedMessage.replace(/\s+/g, "");
  const selectionByNumber = Number.parseInt(String(message || "").trim(), 10);
  const affirmativeSelectionPatterns = [
    /\bla quiero\b/,
    /\blo quiero\b/,
    /\bquiero esa\b/,
    /\bquiero ese\b/,
    /\bme gusta esa\b/,
    /\bme agrada esa\b/,
    /\besa opcion\b/,
    /\besa opción\b/,
    /\bla opcion\b/,
    /\bla opción\b/,
    /\besa\b/,
    /\bese\b/,
  ];

  if (Number.isInteger(selectionByNumber) && selectionByNumber > 0) {
    const byIndex = products[selectionByNumber - 1];

    if (byIndex) {
      return byIndex;
    }
  }

  if (
    products.length === 1 &&
    affirmativeSelectionPatterns.some((pattern) => pattern.test(normalizedMessage))
  ) {
    return products[0];
  }

  return (
    products.find((product) => {
      const normalizedName = normalizeProductText(product.nombre);
      const compactName = normalizedName.replace(/\s+/g, "");

      return (
        normalizedName === normalizedMessage ||
        compactName === compactMessage ||
        compactName.includes(compactMessage) ||
        compactMessage.includes(compactName)
      );
    }) || null
  );
}

module.exports = {
  getActiveProductsByCategoryId,
  findActiveProductSelection,
  normalizeProductText,
};
