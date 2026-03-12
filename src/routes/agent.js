const express = require("express");
const { buildGreetingReply } = require("../agent/openaiAgent");

const router = express.Router();

router.post("/agent/respond", async (req, res) => {
  try {
    const { message, nombreCliente } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "El campo message es requerido y debe ser texto.",
      });
    }

    const reply = await buildGreetingReply(message, nombreCliente);

    return res.status(200).json({
      ok: true,
      reply,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

module.exports = router;
