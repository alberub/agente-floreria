# Agente de floreria

Proyecto base en `Node.js` y `Express` para una floreria. Por ahora incluye una sola tool de saludo conectada a OpenAI.

## Requisitos

- Node.js 20+
- `OPENAI_API_KEY`
- PostgreSQL

## Variables de entorno

```env
PORT=3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
DATABASE_URL=
USER=
HOST=
PASSWORD=
DATABASE=
PORTDB=5432
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
  "reply": "¡Hola! 🌸 Bienvenido a Florería Rosabel.\n\nMe encantaría ayudarte a elegir el detalle perfecto.\n\n¿Para qué ocasión buscas flores hoy?\n\n💐 Aniversario\n🎂 Cumpleaños\n🌷 Solo porque sí"
}
```
