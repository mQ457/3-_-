const { getConfig } = require("./config");
const { pochtaRequest } = require("./http");
const { getWarehouse } = require("./warehouse");

async function calculateTariff({ indexTo, weightG }) {
  const config = getConfig();
  const warehouse = await getWarehouse();
  const indexFrom = String(warehouse?.postalCode || config.warehouseIndexFallback || "").trim();
  const destinationIndex = String(indexTo || "").trim();
  const mass = Math.max(1, Number(weightG || config.minWeightG));
  if (!indexFrom || !destinationIndex) {
    throw new Error("Не настроен склад отправления или индекс пункта выдачи.");
  }
  const body = {
    "index-from": indexFrom,
    "index-to": destinationIndex,
    "mail-category": config.mailCategory,
    "mail-type": config.mailType,
    "dimension-type": config.dimensionType,
    mass,
  };
  const payload = await pochtaRequest("/1.0/tariff", { method: "POST", body });
  const totalRub =
    Number(payload?.["total-rate"] ?? payload?.totalRate ?? payload?.["ground-rate"] ?? payload?.groundRate ?? 0) / 100;
  const deliveryPrice = Math.max(0, Math.round(totalRub || Number(payload?.total || 0)));
  return {
    deliveryPrice,
    currency: "RUB",
    weightG: mass,
    indexFrom,
    indexTo: destinationIndex,
    raw: payload,
  };
}

module.exports = {
  calculateTariff,
};
