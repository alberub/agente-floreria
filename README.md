# Agente de floreria

Proyecto base en `Node.js` y `Express` para una floreria. Por ahora incluye una sola tool de saludo conectada a OpenAI.

## Requisitos

- Node.js 20+
- `OPENAI_API_KEY`

## Variables de entorno

```env
PORT=3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

## Ejecutar

```bash
npm install
npm run dev
```

## Endpoint

`POST /agent/respond`

## Webhook de Meta

- `GET /webhook`: verificacion del webhook de Meta.
- `POST /webhook`: recibe mensajes entrantes de WhatsApp y responde con el agente.

En Render, la URL para pegar en Meta seria:

`https://agente-floreria.onrender.com/webhook`

Body de ejemplo:

```json
{
  "message": "Hola",
  "nombreCliente": "Andrea"
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "reply": "Hola, Andrea. Bienvenida a Floreria Botanic. Estoy para ayudarte con flores, arreglos y pedidos."
}
```
