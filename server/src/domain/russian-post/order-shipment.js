const db = require("../../db");
const { isConfigured } = require("./config");
const { estimatePackageWeightG } = require("./weight");
const { createShipmentForOrderContext } = require("./shipment.service");
const { publish } = require("../../realtime");

const CLIENT_VISIBLE_STATUSES = new Set(["Отправлен", "Готов к выдаче", "Завершен"]);

async function loadOrderForShipment(orderId) {
  const result = await db.query(
    `SELECT o.*,
            u.full_name,
            u.phone,
            u.email,
            a.recipient_name,
            a.phone AS address_phone,
            a.postal_code AS address_postal_code,
            a.office_code AS address_office_code,
            a.address_line,
            a.city
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_addresses a ON a.id = o.address_id
     WHERE o.id = $1
     LIMIT 1`,
    [orderId]
  );
  return result.rows[0] || null;
}

function mapOrderDeliveryFields(order) {
  return {
    deliveryType: order.delivery_type || null,
    deliveryPointId: order.delivery_point_id || null,
    deliveryPointAddress: order.delivery_point_address || null,
    deliveryPointIndex: order.delivery_point_index || null,
    deliveryPrice: Number(order.delivery_price || 0),
    subtotalAmount: Number(order.subtotal_amount || 0),
    packageWeightG: order.package_weight_g != null ? Number(order.package_weight_g) : null,
    trackingNumber: order.tracking_number || null,
    shipmentStatus: order.shipment_status || null,
    shipmentBarcode: order.shipment_barcode || null,
    shipmentQrData: order.shipment_qr_data || null,
    clientPickupQrData: order.client_pickup_qr_data || null,
    pochtaOrderId: order.pochta_order_id || null,
    shipmentCreatedAt: order.shipment_created_at || null,
    showClientPickup:
      CLIENT_VISIBLE_STATUSES.has(String(order.status || "")) && Boolean(order.client_pickup_qr_data || order.tracking_number),
    showAdminShipment: Boolean(order.shipment_qr_data || order.shipment_barcode),
  };
}

async function tryCreatePochtaShipment(orderId) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "POCHTA_NOT_CONFIGURED" };
  }
  const order = await loadOrderForShipment(orderId);
  if (!order) return { ok: false, reason: "NOT_FOUND" };
  if (String(order.delivery_type || "") !== "russian_post") {
    return { ok: false, skipped: true, reason: "NO_DELIVERY" };
  }
  if (order.shipment_barcode || order.pochta_order_id) {
    return { ok: true, skipped: true, reason: "ALREADY_CREATED" };
  }
  const indexTo = String(order.delivery_point_index || order.address_postal_code || "").trim();
  if (!indexTo) {
    return { ok: false, reason: "NO_DELIVERY_INDEX" };
  }
  let details = {};
  try {
    details = order.details_json ? JSON.parse(order.details_json) : {};
  } catch {
    details = {};
  }
  const weightG =
    Number(order.package_weight_g || 0) ||
    estimatePackageWeightG({
      modelVolumeCm3: details.modelVolumeCm3,
      materialCode: details.material,
      qty: details.qty,
    });
  const recipientName = order.recipient_name || order.full_name || "Получатель";
  const recipientPhone = order.address_phone || order.phone || "";
  const created = await createShipmentForOrderContext({
    orderNumber: order.order_number,
    recipientName,
    recipientPhone,
    indexTo,
    weightG,
    comment: `Заказ ${order.order_number}`,
  });
  const qrData = created.barcode || created.pochtaOrderId || "";
  await db.query(
    `UPDATE orders
     SET package_weight_g = $1,
         tracking_number = COALESCE(NULLIF($2, ''), tracking_number),
         shipment_barcode = $2,
         shipment_qr_data = $3,
         pochta_order_id = $4,
         shipment_status = 'created',
         shipment_created_at = NOW(),
         updated_at = NOW()
     WHERE id = $5`,
    [weightG, created.barcode || null, qrData || null, created.pochtaOrderId || null, orderId]
  );
  publish("order:updated", { orderId, userId: order.user_id });
  return { ok: true, barcode: created.barcode, pochtaOrderId: created.pochtaOrderId };
}

async function syncClientPickupOnSent(orderId) {
  const order = await loadOrderForShipment(orderId);
  if (!order) return;
  const pickupData = order.shipment_barcode || order.tracking_number || order.shipment_qr_data || "";
  if (!pickupData) return;
  await db.query(
    `UPDATE orders
     SET client_pickup_qr_data = $1,
         tracking_number = COALESCE(NULLIF(tracking_number, ''), $2),
         updated_at = NOW()
     WHERE id = $3`,
    [pickupData, order.shipment_barcode || order.tracking_number || pickupData, orderId]
  );
  publish("order:updated", { orderId, userId: order.user_id });
}

module.exports = {
  loadOrderForShipment,
  mapOrderDeliveryFields,
  tryCreatePochtaShipment,
  syncClientPickupOnSent,
  CLIENT_VISIBLE_STATUSES,
};
