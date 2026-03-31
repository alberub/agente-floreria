const express = require("express");
const { buildCrmInsights } = require("../services/crmInsightsService");

const router = express.Router();

router.get("/crm/capabilities", (_req, res) => {
  res.status(200).json({
    capabilities: [
      "summary",
      "scoring",
      "objections",
      "next_best_action",
      "reply_suggestion",
    ],
  });
});

router.post("/crm/insights", (req, res) => {
  try {
    const payload = req.body || {};
    const insights = buildCrmInsights({
      customerName: payload.customerName || null,
      stageCode: payload.stageCode || null,
      latestMessage: payload.latestMessage || "",
      recentMessages: Array.isArray(payload.recentMessages) ? payload.recentMessages : [],
      hasOrder: Boolean(payload.hasOrder),
      estimatedValue: payload.estimatedValue ?? null,
    });

    res.status(200).json({ insights });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No fue posible construir insights CRM.",
    });
  }
});

module.exports = router;
