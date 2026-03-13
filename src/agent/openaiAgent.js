const { handleToolCall } = require("../tools/greetingTools");

async function buildGreetingReply(message, nombreCliente) {
  const result = await handleToolCall("saludar_con_categorias", {
    nombreCliente,
    mensajeCliente: message,
  });

  return result.saludo;
}

module.exports = {
  buildGreetingReply,
  runFloristAgent: async ({ message, nombreCliente }) =>
    buildGreetingReply(message, nombreCliente),
};
