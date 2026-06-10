const express = require("express");
const { getConfig, isConfigured } = require("../domain/russian-post/config");
const {
  resolveCityCenterInRussia,
  resolveAddressInRussia,
  resolveReverseGeocodeInRussia,
} = require("../domain/geocode-city");

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

router.get("/geocode-address", async (req, res, next) => {
  try {
    const address = String(req.query.address || "").trim();
    const city = String(req.query.city || "").trim();
    if (!address) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите адрес." });
    }
    const result = await resolveAddressInRussia(address, city);
    if (!result) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Адрес не найден. Уточните улицу и номер дома.",
      });
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.get("/reverse-geocode", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите координаты." });
    }
    const result = await resolveReverseGeocodeInRussia(lat, lng);
    if (!result) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Не удалось определить адрес по точке на карте.",
      });
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
