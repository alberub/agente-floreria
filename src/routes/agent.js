const express = require("express");
const { runFloristAgent } = require("../agent/openaiAgent");
const {
  findOrCreateCustomerByPhone,
  findCustomerById,
} = require("../repositories/customerRepository");
const {
  findActiveConversationByCustomerId,
  findConversationById,
  findOrCreateActiveConversation,
  takeConversationByHuman,
  isBotResponseEnabled,
} = require("../repositories/conversationRepository");
const {
  getRecentMessagesByConversation,
  saveMessage,
} = require("../repositories/messageRepository");
const {
  createConversationEvent,
} = require("../repositories/conversationEventRepository");
const { sendWhatsAppTextMessage } = require("../services/metaService");

const router = express.Router();
const HUMAN_HANDOFF_PATTERNS = [
  /asesor/i,
  /humano/i,
  /persona/i,
  /agente/i,
  /representante/i,
];
const HUMAN_MESSAGE_ROLES = new Set(["assistant", "agent", "human", "asesor"]);
const CUSTOMER_MESSAGE_ROLES = new Set([
  "user",
  "customer",
  "cliente",
  "contact",
  "contacto",
  "usuario",
  "inbound",
  "incoming",
]);

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

function isCustomerMessageRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();

  if (!normalizedRole) {
    return false;
  }

  if (CUSTOMER_MESSAGE_ROLES.has(normalizedRole)) {
    return true;
  }

  if (normalizedRole === "bot") {
    return false;
  }

  if (HUMAN_MESSAGE_ROLES.has(normalizedRole)) {
    return false;
  }

  if (normalizedRole === "system" || normalizedRole === "evento" || normalizedRole === "event") {
    return false;
  }

  return (
    normalizedRole.includes("user") ||
    normalizedRole.includes("client") ||
    normalizedRole.includes("cliente") ||
    normalizedRole.includes("contact")
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
      const storedMessage = await saveMessage({
        conversacionId: conversation.id,
        rol: "user",
        mensaje: message,
      });

      if (conversation.wasCreated) {
        await createConversationEvent({
          conversationId: conversation.id,
          eventCode: "conversation_opened_by_contact",
          actorType: "contact",
          actorRef: customer.telefono || telefono,
          payload: {
            customerId: customer.id,
          },
          occurredAt: storedMessage.fecha,
        });
      }

      if (isHumanHandoffRequest(message)) {
        conversation = await takeConversationByHuman({
          conversationId: conversation.id,
          humanAgentId: null,
        });
        await createConversationEvent({
          conversationId: conversation.id,
          eventCode: "conversation_taken_by_human",
          actorType: "system",
          actorRef: null,
          payload: {
            humanAgentId: conversation.humanAgentId,
            source: "agent_handoff_request",
          },
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

router.post("/agent/reply-last-customer", async (req, res) => {
  try {
    const {
      conversationId,
      deliverToCustomer = true,
      forceReply = false,
    } = req.body || {};
    const normalizedConversationId = Number(conversationId);

    if (!Number.isInteger(normalizedConversationId) || normalizedConversationId <= 0) {
      return res.status(400).json({
        ok: false,
        error: "El campo conversationId es requerido y debe ser entero positivo.",
      });
    }

    const conversation = await findConversationById(normalizedConversationId);

    if (!conversation) {
      return res.status(404).json({
        ok: false,
        error: "No existe la conversacion solicitada.",
      });
    }

    if (!forceReply && !isBotResponseEnabled(conversation)) {
      return res.status(200).json({
        ok: true,
        skipped: "bot_disabled_or_human_control",
      });
    }

    const recentMessages = await getRecentMessagesByConversation(conversation.id);
    const lastMessage = recentMessages.at(-1) || null;
    const lastCustomerMessage =
      [...recentMessages].reverse().find(
        (message) => isCustomerMessageRole(message?.rol)
      ) || null;

    if (!lastCustomerMessage) {
      return res.status(200).json({
        ok: true,
        skipped: "no_customer_message",
      });
    }

    if (!isCustomerMessageRole(lastMessage?.rol)) {
      return res.status(200).json({
        ok: true,
        skipped: "last_message_not_customer",
      });
    }

    const customer = await findCustomerById(conversation.clienteId);

    if (!customer?.telefono) {
      return res.status(400).json({
        ok: false,
        error: "La conversacion no tiene un cliente con telefono valido.",
      });
    }

    const reply = await runFloristAgent({
      message: lastCustomerMessage.mensaje,
      nombreCliente: customer.nombre || null,
      telefono: customer.telefono,
      customerId: customer.id,
      conversationId: conversation.id,
      conversationStateId: conversation.estadoId,
      conversationCategoryId: conversation.categoriaId,
      recentMessages,
    });

    const storedReply = await saveMessage({
      conversacionId: conversation.id,
      rol: "bot",
      mensaje: reply,
    });

    if (deliverToCustomer) {
      await sendWhatsAppTextMessage(customer.telefono, reply);
    }

    return res.status(200).json({
      ok: true,
      conversationId: conversation.id,
      reply,
      delivered: Boolean(deliverToCustomer),
      messageId: storedReply.id,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
