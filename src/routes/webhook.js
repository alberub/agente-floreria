const express = require("express");
const { metaVerifyToken } = require("../config/env");
const { runFloristAgent } = require("../agent/openaiAgent");
const {
  sendWhatsAppTextMessage,
  sendWhatsAppTypingIndicator,
  sendWhatsAppImageMessage,
} = require("../services/metaService");
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
  getActiveProductsByCategoryId,
} = require("../repositories/productRepository");
const {
  getRecentMessagesByConversation,
  saveMessage,
} = require("../repositories/messageRepository");
const {
  createConversationEvent,
} = require("../repositories/conversationEventRepository");

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
    "Claro, voy a pausar al asistente y canalizar tu chat con un asesor humano. " +
    "En cuanto uno tome la conversacion te atendera por este mismo medio."
  );
}

function getTextMessages(changes) {
  const messages = [];

  for (const change of changes) {
    const incomingMessages = change.value?.messages || [];
    const contacts = change.value?.contacts || [];
    const contactName =
      contacts[0]?.profile?.name || contacts[0]?.wa_id || null;

    for (const incomingMessage of incomingMessages) {
      if (incomingMessage.type !== "text") {
        continue;
      }

      const from = incomingMessage.from;
      const text = incomingMessage.text?.body?.trim();

      if (!from || !text) {
        continue;
      }

      messages.push({
        messageId: incomingMessage.id || null,
        from,
        text,
        nombreCliente: contactName,
      });
    }
  }

  return messages;
}

function isCatalogReply(reply) {
  return (
    typeof reply === "string" &&
    reply.includes("Estas son las opciones disponibles:")
  );
}

function formatMoney(amount) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildProductImageCaption(product, index) {
  return `${index + 1}. ${product.nombre}\n${formatMoney(product.precio)}`;
}

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!metaVerifyToken) {
    return res.status(500).send("META_VERIFY_TOKEN no esta configurado.");
  }

  if (mode === "subscribe" && token === metaVerifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const changes = req.body?.entry?.flatMap((entry) => entry.changes || []) || [];
  const messages = getTextMessages(changes);

  for (const incomingMessage of messages) {
    try {
      const customer = await findOrCreateCustomerByPhone(incomingMessage.from);
      const conversation = await findOrCreateActiveConversation(customer.id);
      const storedMessage = await saveMessage({
        conversacionId: conversation.id,
        rol: "user",
        mensaje: incomingMessage.text,
      });

      if (conversation.wasCreated) {
        await createConversationEvent({
          conversationId: conversation.id,
          eventCode: "conversation_opened_by_contact",
          actorType: "contact",
          actorRef: customer.telefono || incomingMessage.from,
          payload: {
            customerId: customer.id,
          },
          occurredAt: storedMessage.fecha,
        });
      }

      if (isHumanHandoffRequest(incomingMessage.text)) {
        const updatedConversation = await takeConversationByHuman({
          conversationId: conversation.id,
          humanAgentId: null,
        });
        await createConversationEvent({
          conversationId: conversation.id,
          eventCode: "conversation_taken_by_human",
          actorType: "system",
          actorRef: null,
          payload: {
            humanAgentId: updatedConversation.humanAgentId,
            source: "webhook_handoff_request",
          },
        });

        const handoffReply = buildHumanHandoffReply();
        await saveMessage({
          conversacionId: conversation.id,
          rol: "bot",
          mensaje: handoffReply,
        });
        await sendWhatsAppTextMessage(incomingMessage.from, handoffReply);
        continue;
      }

      const freshConversation = await findActiveConversationByCustomerId(
        customer.id
      );

      if (!isBotResponseEnabled(freshConversation)) {
        continue;
      }

      if (incomingMessage.messageId) {
        try {
          await sendWhatsAppTypingIndicator(incomingMessage.messageId);
        } catch (error) {
          console.error(
            "No se pudo enviar typing indicator a Meta:",
            error.message
          );
        }
      }

      const recentMessages = await getRecentMessagesByConversation(
        conversation.id
      );
      const reply = await runFloristAgent({
        message: incomingMessage.text,
        nombreCliente: customer.nombre || incomingMessage.nombreCliente,
        telefono: customer.telefono,
        customerId: customer.id,
        conversationId: conversation.id,
        conversationStateId: conversation.estadoId,
        conversationCategoryId: conversation.categoriaId,
        recentMessages,
      });
      await saveMessage({
        conversacionId: conversation.id,
        rol: "bot",
        mensaje: reply,
      });

      const updatedConversation = await findActiveConversationByCustomerId(
        customer.id
      );

      if (!isBotResponseEnabled(updatedConversation)) {
        continue;
      }

      if (isCatalogReply(reply) && updatedConversation?.categoriaId) {
        const products = await getActiveProductsByCategoryId(
          updatedConversation.categoriaId
        );
        const productsWithImage = products
          .filter((product) => product.imagenPrincipalUrl)
          .slice(0, 5);

        for (const [index, product] of productsWithImage.entries()) {
          await sendWhatsAppImageMessage(
            incomingMessage.from,
            product.imagenPrincipalUrl,
            buildProductImageCaption(product, index)
          );
        }
      }

      await sendWhatsAppTextMessage(incomingMessage.from, reply);
    } catch (error) {
      console.error("Error procesando mensaje de Meta:", error.message);
    }
  }
});

module.exports = router;
