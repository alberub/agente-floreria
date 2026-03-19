const express = require("express");
const {
  findConversationById,
  takeConversationByHuman,
  resumeConversationByBot,
  isBotResponseEnabled,
} = require("../repositories/conversationRepository");
const { findCustomerById } = require("../repositories/customerRepository");
const { saveMessage } = require("../repositories/messageRepository");
const { sendWhatsAppTextMessage } = require("../services/metaService");

const router = express.Router();

async function getConversationWithCustomer(conversationId) {
  const conversation = await findConversationById(conversationId);

  if (!conversation) {
    return {
      conversation: null,
      customer: null,
    };
  }

  const customer = await findCustomerById(conversation.clienteId);

  return {
    conversation,
    customer,
  };
}

router.post("/human/takeover", async (req, res) => {
  try {
    const { conversationId, humanAgentId = null } = req.body || {};

    if (!conversationId) {
      return res.status(400).json({
        ok: false,
        error: "El campo conversationId es requerido.",
      });
    }

    const conversation = await takeConversationByHuman({
      conversationId,
      humanAgentId,
    });

    return res.status(200).json({
      ok: true,
      conversation,
      botEnabled: isBotResponseEnabled(conversation),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/human/release", async (req, res) => {
  try {
    const { conversationId } = req.body || {};

    if (!conversationId) {
      return res.status(400).json({
        ok: false,
        error: "El campo conversationId es requerido.",
      });
    }

    const conversation = await resumeConversationByBot(conversationId);

    return res.status(200).json({
      ok: true,
      conversation,
      botEnabled: isBotResponseEnabled(conversation),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

router.post("/human/respond", async (req, res) => {
  try {
    const {
      conversationId,
      message,
      humanAgentId = null,
      notifyCustomer = true,
    } = req.body || {};

    if (!conversationId) {
      return res.status(400).json({
        ok: false,
        error: "El campo conversationId es requerido.",
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo message es requerido y debe ser texto.",
      });
    }

    const { conversation: existingConversation, customer } =
      await getConversationWithCustomer(conversationId);

    if (!existingConversation) {
      return res.status(404).json({
        ok: false,
        error: "No existe la conversacion solicitada.",
      });
    }

    if (!customer?.telefono) {
      return res.status(400).json({
        ok: false,
        error: "La conversacion no tiene un cliente con telefono valido.",
      });
    }

    const conversation = await takeConversationByHuman({
      conversationId,
      humanAgentId,
    });

    await saveMessage({
      conversacionId: conversation.id,
      rol: "asesor",
      mensaje: message.trim(),
    });

    if (notifyCustomer) {
      await sendWhatsAppTextMessage(customer.telefono, message.trim());
    }

    return res.status(200).json({
      ok: true,
      conversation,
      delivered: Boolean(notifyCustomer),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
