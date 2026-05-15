const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { getConfig, isConfigured } = require("../domain/russian-post/config");
const { searchOffices } = require("../domain/russian-post/offices.service");
const { calculateTariff } = require("../domain/russian-post/rates.service");
const { estimatePackageWeightG } = require("../domain/russian-post/weight");

const router = express.Router();

router.get("/config", (_req, res) => {
  const config = getConfig();
  res.json({
    ok: true,
    pochtaEnabled: isConfigured(),
    yandexMapsApiKey: config.yandexMapsApiKey,
  });
});

router.get("/russian-post/offices", async (req, res, next) => {
  try {
    const city = String(req.query.city || "").trim();
    if (!city) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите город." });
    }
    if (!isConfigured()) {
      return res.status(503).json({
        error: "POCHTA_NOT_CONFIGURED",
        message: "Почта России не настроена. Заполните POCHTA_* в .env.",
      });
    }
    const offices = await searchOffices(city);
    res.json({ ok: true, offices });
  } catch (error) {
    next(error);
  }
});

router.post("/russian-post/calculate", requireAuth, async (req, res, next) => {
  try {
    const { indexTo, modelVolumeCm3, material, qty } = req.body || {};
    if (!isConfigured()) {
      return res.status(503).json({
        error: "POCHTA_NOT_CONFIGURED",
        message: "Почта России не настроена.",
      });
    }
    const weightG = estimatePackageWeightG({ modelVolumeCm3, materialCode: material, qty });
    const tariff = await calculateTariff({ indexTo, weightG });
    res.json({ ok: true, ...tariff, weightG });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
