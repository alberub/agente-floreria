const express = require("express");
const {
  findConversationById,
  takeConversationByHuman,
  resumeConversationByBot,
  isBotResponseEnabled,
} = require("../repositories/conversationRepository");
const { findCustomerById } = require("../repositories/customerRepository");
const {
  saveMessage,
  getRecentMessagesByConversation,
} = require("../repositories/messageRepository");
const { createConversationEvent } = require("../repositories/conversationEventRepository");
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

    const existingConversation = await findConversationById(conversationId);

    if (!existingConversation) {
      return res.status(404).json({
        ok: false,
        error: "No existe la conversacion solicitada.",
      });
    }

    const conversation = await takeConversationByHuman({
      conversationId,
      humanAgentId,
    });

    if (existingConversation.controlOwner !== "human") {
      await createConversationEvent({
        conversationId: conversation.id,
        eventCode: "conversation_taken_by_human",
        actorType: "human",
        actorRef: humanAgentId ? String(humanAgentId) : null,
        payload: {
          humanAgentId: conversation.humanAgentId,
          source: "human_takeover_api",
        },
      });
    }

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

    const existingConversation = await findConversationById(conversationId);

    if (!existingConversation) {
      return res.status(404).json({
        ok: false,
        error: "No existe la conversacion solicitada.",
      });
    }

    const conversation = await resumeConversationByBot(conversationId);

    if (existingConversation.controlOwner !== "bot") {
      await createConversationEvent({
        conversationId: conversation.id,
        eventCode: "conversation_released_to_bot",
        actorType: "human",
        actorRef: null,
        payload: {
          source: "human_release_api",
        },
      });
    }

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

    if (existingConversation.controlOwner !== "human") {
      await createConversationEvent({
        conversationId: conversation.id,
        eventCode: "conversation_taken_by_human",
        actorType: "human",
        actorRef: humanAgentId ? String(humanAgentId) : null,
        payload: {
          humanAgentId: conversation.humanAgentId,
          source: "human_respond_api",
        },
      });
    }

    const previousMessages = await getRecentMessagesByConversation(conversation.id, 1);
    const storedMessage = await saveMessage({
      conversacionId: conversation.id,
      rol: "asesor",
      mensaje: message.trim(),
    });

    if (!previousMessages.length) {
      await createConversationEvent({
        conversationId: conversation.id,
        eventCode: "conversation_opened_by_human",
        actorType: "human",
        actorRef: humanAgentId ? String(humanAgentId) : null,
        payload: {
          messageId: storedMessage.id,
          notifyCustomer: Boolean(notifyCustomer),
          source: "human_respond_api",
        },
        occurredAt: storedMessage.fecha,
      });
    }

    await createConversationEvent({
      conversationId: conversation.id,
      eventCode: "manual_reply_sent",
      actorType: "human",
      actorRef: humanAgentId ? String(humanAgentId) : null,
      payload: {
        messageId: storedMessage.id,
        notifyCustomer: Boolean(notifyCustomer),
        source: "human_respond_api",
      },
      occurredAt: storedMessage.fecha,
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
