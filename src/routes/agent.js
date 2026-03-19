const express = require("express");
const { runFloristAgent } = require("../agent/openaiAgent");
const {
  findOrCreateCustomerByPhone,
} = require("../repositories/customerRepository");
const {
  findActiveConversationByCustomerId,
  findOrCreateActiveConversation,
  takeConversationByHuman,
  isBotResponseEnabled,
} = require("../repositories/conversationRepository");
const {
  getRecentMessagesByConversation,
  saveMessage,
} = require("../repositories/messageRepository");

const router = express.Router();
const HUMAN_HANDOFF_PATTERNS = [
  /asesor/i,
  /humano/i,
  /persona/i,
  /agente/i,
  /representante/i,
];

function isHumanHandoffRequest(message) {
  const normalized = String(message || "").trim();

  return (
    normalized.length > 0 &&
    HUMAN_HANDOFF_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function buildHumanHandoffReply() {
  return (
    "Claro, voy a pausar al asistente y canalizar tu chat con un asesor humano."
  );
}

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

      if (isHumanHandoffRequest(message)) {
        conversation = await takeConversationByHuman({
          conversationId: conversation.id,
          humanAgentId: null,
        });

        const handoffReply = buildHumanHandoffReply();
        await saveMessage({
          conversacionId: conversation.id,
          rol: "bot",
          mensaje: handoffReply,
        });

        return res.status(200).json({
          ok: true,
          customer,
          conversation,
          reply: handoffReply,
        });
      }

      const freshConversation = await findActiveConversationByCustomerId(
        customer.id
      );

      if (!isBotResponseEnabled(freshConversation)) {
        return res.status(200).json({
          ok: true,
          customer,
          conversation: freshConversation,
          reply: null,
          skipped: "human_control",
        });
      }
    }

    const recentMessages = conversation
      ? await getRecentMessagesByConversation(conversation.id)
      : [];

    const reply = await runFloristAgent({
      message,
      nombreCliente: customer?.nombre || nombreCliente,
      telefono: customer?.telefono || telefono,
      customerId: customer?.id || null,
      conversationId: conversation?.id || null,
      conversationStateId: conversation?.estadoId || null,
      conversationCategoryId: conversation?.categoriaId || null,
      recentMessages,
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

      if (!isBotResponseEnabled(conversation)) {
        return res.status(200).json({
          ok: true,
          customer,
          conversation,
          reply: null,
          skipped: "human_control",
        });
      }
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
