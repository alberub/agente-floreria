const db = require("../db");
const { normalizePhone } = require("../utils/phone");

async function findCustomerByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  const result = await db.query(
    `
      SELECT id, telefono, nombre
      FROM public.clientes_floreria
      WHERE telefono = $1
      LIMIT 1
    `,
    [normalizedPhone]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: Number(result.rows[0].id),
    telefono: result.rows[0].telefono,
    nombre: result.rows[0].nombre,
  };
}

async function findCustomerById(customerId) {
  const result = await db.query(
    `
      SELECT id, telefono, nombre
      FROM public.clientes_floreria
      WHERE id = $1
      LIMIT 1
    `,
    [customerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: Number(result.rows[0].id),
    telefono: result.rows[0].telefono,
    nombre: result.rows[0].nombre,
  };
}

async function createCustomer({ phone, nombre = null }) {
  const normalizedPhone = normalizePhone(phone);

  const result = await db.query(
    `
      INSERT INTO public.clientes_floreria (telefono, nombre)
      VALUES ($1, $2)
      RETURNING id, telefono, nombre
    `,
    [normalizedPhone, nombre]
  );

  return {
    id: Number(result.rows[0].id),
    telefono: result.rows[0].telefono,
    nombre: result.rows[0].nombre,
  };
}

async function findOrCreateCustomerByPhone(phone) {
  const existingCustomer = await findCustomerByPhone(phone);

  if (existingCustomer) {
    return {
      ...existingCustomer,
      wasCreated: false,
    };
  }

  const createdCustomer = await createCustomer({
    phone,
    nombre: null,
  });

  return {
    ...createdCustomer,
    wasCreated: true,
  };
}

module.exports = {
  findCustomerById,
  findCustomerByPhone,
  createCustomer,
  findOrCreateCustomerByPhone,
};
