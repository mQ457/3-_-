const express = require("express");
const { getConfig, isConfigured } = require("../domain/russian-post/config");
const { resolveCityCenterInRussia } = require("../domain/geocode-city");

const router = express.Router();

router.get("/config", (_req, res) => {
  const config = getConfig();
  res.json({
    ok: true,
    pochtaEnabled: isConfigured(),
    yandexMapsApiKey: config.yandexMapsApiKey,
  });
});

router.get("/geocode-city", async (req, res, next) => {
  try {
    const city = String(req.query.city || "").trim();
    if (!city) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите город." });
    }
    const center = await resolveCityCenterInRussia(city);
    if (!center) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Не удалось определить координаты города. Уточните название (например: Оренбург).",
      });
    }
    res.json({ ok: true, city, ...center });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
