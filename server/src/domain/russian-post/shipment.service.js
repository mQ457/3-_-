const { getConfig } = require("./config");
const { pochtaRequest } = require("./http");
const { getWarehouse } = require("./warehouse");

function pickBarcode(payload) {
  if (!payload || typeof payload !== "object") return "";
  return String(
    payload.barcode ||
      payload["bar-code"] ||
      payload["track-number"] ||
      payload.trackNumber ||
      payload["mail-id"] ||
      ""
  ).trim();
}

function buildBacklogOrder({
  orderNumber,
  recipientName,
  recipientPhone,
  indexTo,
  weightG,
  comment,
}) {
  const config = getConfig();
  return {
    "order-num": String(orderNumber || "").slice(0, 30),
    "recipient-name": String(recipientName || "Получатель").slice(0, 160),
    teladdress: String(recipientPhone || "").replace(/\D/g, "").slice(0, 20),
    "index-to": String(indexTo || "").trim(),
    "mail-type": config.mailType,
    "mail-category": config.mailCategory,
    "dimension-type": config.dimensionType,
    mass: Math.max(1, Number(weightG || config.minWeightG)),
    comment: String(comment || "").slice(0, 255),
  };
}

async function createBacklogOrder(orderPayload) {
  const payload = await pochtaRequest("/1.0/user/backlog", {
    method: "PUT",
    body: [orderPayload],
  });
  const first = Array.isArray(payload) ? payload[0] : payload?.orders?.[0] || payload;
  const errors = first?.errors || first?.["error-codes"] || [];
  if (Array.isArray(errors) && errors.length) {
    const message = errors.map((item) => item?.description || item?.code || String(item)).join("; ");
    throw new Error(message || "Ошибка создания отправления в Почте России.");
  }
  return {
    pochtaOrderId: String(first?.["result-id"] || first?.id || first?.["order-id"] || "").trim(),
    barcode: pickBarcode(first),
    raw: first,
  };
}

async function createShipmentForOrderContext(context) {
  const warehouse = await getWarehouse();
  const config = getConfig();
  const indexFrom = String(warehouse?.postalCode || config.warehouseIndexFallback || "").trim();
  if (!indexFrom) {
    throw new Error("Настройте ОПС склада отправления в админке.");
  }
  const orderPayload = buildBacklogOrder(context);
  orderPayload["index-from"] = indexFrom;
  return createBacklogOrder(orderPayload);
}

async function fetchBarcodeForms(pochtaOrderId) {
  if (!pochtaOrderId) return null;
  try {
    return await pochtaRequest(`/1.0/forms/${pochtaOrderId}/forms`, { method: "GET" });
  } catch (error) {
    console.warn("[pochta] forms fetch failed:", error.message);
    return null;
  }
}

module.exports = {
  buildBacklogOrder,
  createShipmentForOrderContext,
  fetchBarcodeForms,
  pickBarcode,
};
