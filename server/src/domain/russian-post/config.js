function readBool(name, defaultValue) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes";
}

function sanitizeEnv(value) {
  let normalized = String(value || "").trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function sanitizeToken(value) {
  return sanitizeEnv(value).replace(/^accesstoken\s+/i, "").trim();
}

function sanitizeUserAuth(value) {
  return sanitizeEnv(value).replace(/^basic\s+/i, "").trim();
}

function getConfig() {
  return {
    enabled: readBool("POCHTA_ENABLED", true),
    baseUrl: String(process.env.POCHTA_OTPRAVKA_BASE_URL || "https://otpravka-api.pochta.ru").replace(/\/+$/, ""),
    token: sanitizeToken(process.env.POCHTA_OTPRAVKA_TOKEN),
    userAuth: sanitizeUserAuth(process.env.POCHTA_OTPRAVKA_USER_AUTH),
    timeoutMs: Math.max(5000, Number(process.env.POCHTA_OTPRAVKA_TIMEOUT_MS || 30000)),
    warehouseIndexFallback: String(process.env.POCHTA_WAREHOUSE_INDEX || "").trim(),
    mailType: String(process.env.POCHTA_MAIL_TYPE || "POSTAL_PARCEL").trim(),
    mailCategory: String(process.env.POCHTA_MAIL_CATEGORY || "ORDINARY").trim(),
    dimensionType: String(process.env.POCHTA_DIMENSION_TYPE || "S").trim(),
    defaultDensityGPerCm3: Number(process.env.POCHTA_DEFAULT_DENSITY_G_CM3 || 1.24),
    minWeightG: Math.max(1, Number(process.env.POCHTA_MIN_WEIGHT_G || 100)),
    maxWeightG: Math.max(100, Number(process.env.POCHTA_MAX_WEIGHT_G || 20000)),
    yandexMapsApiKey: String(process.env.YANDEX_MAPS_API_KEY || "").trim(),
  };
}

function isConfigured(config = getConfig()) {
  return Boolean(config.enabled && config.token && config.userAuth);
}

module.exports = {
  getConfig,
  isConfigured,
};
