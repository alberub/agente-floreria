const OpenAI = require("openai");
const { openAiApiKey, openAiModel } = require("../config/env");
const { toolDefinitions, handleToolCall } = require("../tools/greetingTools");

const client = new OpenAI({ apiKey: openAiApiKey });

function detectMoment(text) {
  const normalized = String(text || "").toLowerCase();

  if (normalized.includes("buenos dias")) {
    return "dia";
  }

  if (normalized.includes("buenas tardes")) {
    return "tarde";
  }

  if (normalized.includes("buenas noches")) {
    return "noche";
  }

  return "general";
}

async function buildGreetingReply(message, nombreCliente) {
  const messages = [
    {
      role: "system",
      content:
        "Eres un agente para una floreria llamado Floreria Botanic. Debes responder en espanol. Cuando el cliente salude o inicie conversacion, usa la tool saludar_floreria. Mantente breve y amable. No inventes catalogo, precios ni promociones."
    },
    {
      role: "user",
      content: `Mensaje del cliente: ${message}\nNombre del cliente: ${nombreCliente || "No proporcionado"}\nMomento detectado: ${detectMoment(message)}`
    }
  ];

  const firstResponse = await client.chat.completions.create({
    model: openAiModel,
    messages,
    tools: toolDefinitions,
    tool_choice: "auto",
    temperature: 0.3,
  });

  const assistantMessage = firstResponse.choices[0]?.message;

  if (!assistantMessage) {
    throw new Error("OpenAI no devolvio un mensaje.");
  }

  const toolCalls = assistantMessage.tool_calls || [];

  if (toolCalls.length === 0) {
    return assistantMessage.content?.trim() || "Hola, bienvenida a la floreria.";
  }

  messages.push(assistantMessage);

  for (const toolCall of toolCalls) {
    const args = JSON.parse(toolCall.function.arguments || "{}");
    const result = await handleToolCall(toolCall.function.name, args);

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  }

  const finalResponse = await client.chat.completions.create({
    model: openAiModel,
    messages,
    temperature: 0.3,
  });

  return (
    finalResponse.choices[0]?.message?.content?.trim() ||
    "Hola, bienvenida a Floreria Botanic."
  );
}

module.exports = {
  buildGreetingReply,
};
