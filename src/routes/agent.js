const express = require("express");
const { runFloristAgent } = require("../agent/openaiAgent");
const {
  findOrCreateCustomerByPhone,
} = require("../repositories/customerRepository");
const {
  findActiveConversationByCustomerId,
  findOrCreateActiveConversation,
} = require("../repositories/conversationRepository");
const { saveMessage } = require("../repositories/messageRepository");

const router = express.Router();

router.post("/agent/respond", async (req, res) => {
  try {
    const { message, nombreCliente, telefono } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo message es requerido y debe ser texto.",
      });
    }

    let customer = null;
    let conversation = null;

    if (telefono) {
      customer = await findOrCreateCustomerByPhone(telefono);
      conversation = await findOrCreateActiveConversation(customer.id);
      await saveMessage({
        conversacionId: conversation.id,
        rol: "user",
        mensaje: message,
      });
    }

    const reply = await runFloristAgent({
      message,
      nombreCliente: customer?.nombre || nombreCliente,
      telefono: customer?.telefono || telefono,
      customerId: customer?.id || null,
      conversationId: conversation?.id || null,
      conversationStateId: conversation?.estadoId || null,
      conversationCategoryId: conversation?.categoriaId || null,
    });

    if (conversation) {
      await saveMessage({
        conversacionId: conversation.id,
        rol: "bot",
        mensaje: reply,
      });
    }

    if (customer) {
      conversation = await findActiveConversationByCustomerId(customer.id);
    }

    return res.status(200).json({
      ok: true,
      customer,
      conversation,
      reply,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
