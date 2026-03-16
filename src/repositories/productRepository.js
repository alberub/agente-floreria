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

function extractSelectionByNumber(message) {
  const rawMessage = String(message || "").trim();
  const directSelection = Number.parseInt(rawMessage, 10);

  if (Number.isInteger(directSelection) && directSelection > 0) {
    return directSelection;
  }

  const normalizedMessage = normalizeProductText(message);
  const optionMatch = normalizedMessage.match(
    /\b(?:opcion|opcion numero|numero|num|no)\s+(\d+)\b/
  );

  if (optionMatch) {
    return Number.parseInt(optionMatch[1], 10);
  }

  const standaloneNumbers = normalizedMessage.match(/\b\d+\b/g);

  if (!standaloneNumbers || standaloneNumbers.length !== 1) {
    return null;
  }

  return Number.parseInt(standaloneNumbers[0], 10);
}

async function getActiveProductsByCategoryId(categoryId) {
  const result = await db.query(
    `
      SELECT id, nombre, descripcion, precio, categoria_id, tiempo_preparacion_min, permite_entrega_mismo_dia
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
    tiempoPreparacionMin: Number(row.tiempo_preparacion_min || 60),
    permiteEntregaMismoDia:
      row.permite_entrega_mismo_dia === null
        ? true
        : Boolean(row.permite_entrega_mismo_dia),
  }));
}

async function findActiveProductSelection(categoryId, message) {
  const products = await getActiveProductsByCategoryId(categoryId);
  const normalizedMessage = normalizeProductText(message);
  const compactMessage = normalizedMessage.replace(/\s+/g, "");
  const selectionByNumber = extractSelectionByNumber(message);
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
