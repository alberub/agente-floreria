const express = require("express");
const { port, validateEnv } = require("./config/env");
const agentRouter = require("./routes/agent");
const crmRouter = require("./routes/crm");
const humanRouter = require("./routes/human");
const webhookRouter = require("./routes/webhook");

validateEnv();

const app = express();

app.use(express.json());
app.use(agentRouter);
app.use(crmRouter);
app.use(humanRouter);
app.use(webhookRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
