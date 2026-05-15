const db = require("../../db");
const { getConfig } = require("./config");

const WAREHOUSE_KEY = "pochta_warehouse";

async function getAppSetting(key, fallback = "") {
  const result = await db.query("SELECT value FROM app_settings WHERE key = $1 LIMIT 1", [String(key)]);
  return result.rows[0]?.value ?? fallback;
}

async function setAppSetting(key, value) {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [String(key), String(value ?? "")]
  );
}

async function getWarehouse() {
  const config = getConfig();
  const raw = await getAppSetting(WAREHOUSE_KEY, "");
  if (!raw) {
    if (config.warehouseIndexFallback) {
      return {
        postalCode: config.warehouseIndexFallback,
        address: "",
        city: "",
        lat: null,
        lng: null,
        officeCode: "",
        label: "Склад (env)",
      };
    }
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.postalCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setWarehouse(payload) {
  const postalCode = String(payload?.postalCode || "").trim();
  if (!postalCode) {
    throw new Error("Укажите индекс ОПС склада отправления.");
  }
  const warehouse = {
    postalCode,
    address: String(payload?.address || "").trim(),
    city: String(payload?.city || "").trim(),
    lat: payload?.lat != null ? Number(payload.lat) : null,
    lng: payload?.lng != null ? Number(payload.lng) : null,
    officeCode: String(payload?.officeCode || "").trim(),
    label: String(payload?.label || "Склад отправления").trim(),
  };
  await setAppSetting(WAREHOUSE_KEY, JSON.stringify(warehouse));
  return warehouse;
}

module.exports = {
  getWarehouse,
  setWarehouse,
  WAREHOUSE_KEY,
};
