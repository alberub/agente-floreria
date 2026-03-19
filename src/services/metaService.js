const {
  metaAccessToken,
  metaPhoneNumberId,
} = require("../config/env");
const { normalizeWhatsAppRecipient } = require("../utils/phone");

async function sendWhatsAppTextMessage(to, body) {
  if (!metaAccessToken || !metaPhoneNumberId) {
    throw new Error(
      "Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID para enviar mensajes."
    );
  }

  const recipient = normalizeWhatsAppRecipient(to);

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        text: { body },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al enviar mensaje a Meta: ${errorText}`);
  }

  return response.json();
}

async function sendWhatsAppTypingIndicator(messageId) {
  if (!metaAccessToken || !metaPhoneNumberId) {
    throw new Error(
      "Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID para enviar typing indicator."
    );
  }

  const normalizedMessageId = String(messageId || "").trim();

  if (!normalizedMessageId) {
    throw new Error("El messageId es requerido para enviar typing indicator.");
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: normalizedMessageId,
        typing_indicator: {
          type: "text",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al enviar typing indicator a Meta: ${errorText}`);
  }

  return response.json();
}

async function sendWhatsAppImageMessage(to, imageUrl, caption = "") {
  if (!metaAccessToken || !metaPhoneNumberId) {
    throw new Error(
      "Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID para enviar mensajes."
    );
  }

  const recipient = normalizeWhatsAppRecipient(to);
  const payload = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "image",
    image: {
      link: imageUrl,
    },
  };

  if (caption) {
    payload.image.caption = caption;
  }

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${metaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al enviar imagen a Meta: ${errorText}`);
  }

  return response.json();
}

module.exports = {
  sendWhatsAppTextMessage,
  sendWhatsAppTypingIndicator,
  sendWhatsAppImageMessage,
};
