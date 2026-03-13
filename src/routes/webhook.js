const express = require("express");
const { metaVerifyToken } = require("../config/env");
const { runFloristAgent } = require("../agent/openaiAgent");
const { sendWhatsAppTextMessage } = require("../services/metaService");
const {
  findOrCreateCustomerByPhone,
} = require("../repositories/customerRepository");
const {
  findOrCreateActiveConversation,
} = require("../repositories/conversationRepository");
const {
  getRecentMessagesByConversation,
  saveMessage,
} = require("../repositories/messageRepository");

const router = express.Router();

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
        from,
        text,
        nombreCliente: contactName,
      });
    }
  }

  return messages;
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
      await saveMessage({
        conversacionId: conversation.id,
        rol: "user",
        mensaje: incomingMessage.text,
      });
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

      await sendWhatsAppTextMessage(incomingMessage.from, reply);
    } catch (error) {
      console.error("Error procesando mensaje de Meta:", error.message);
    }
  }
});

module.exports = router;
