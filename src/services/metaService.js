const {
  metaAccessToken,
  metaPhoneNumberId,
} = require("../config/env");

function normalizeWhatsAppRecipient(value) {
  return String(value || "").replace(/\D/g, "");
}

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

module.exports = {
  sendWhatsAppTextMessage,
};
