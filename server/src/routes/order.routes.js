const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { normalizeServiceType, getAllowedStatuses } = require("../domain/order-statuses");

const router = express.Router();

const uploadDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedExts = new Set(["stl", "obj", "amf", "3mf", "fbx"]);

function modelExtFromFilename(name) {
  const lower = String(name || "").toLowerCase();
  const ordered = ["3mf", "amf", "stl", "obj", "fbx"];
  for (const ext of ordered) {
    if (lower.endsWith(`.${ext}`)) return ext;
  }
  return "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extFromName = modelExtFromFilename(file.originalname);
    const ext = extFromName ? `.${extFromName}` : path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = modelExtFromFilename(file.originalname);
    if (!ext || !allowedExts.has(ext)) {
      cb(new Error("Поддерживаются только STL, OBJ, AMF, 3MF, FBX."));
      return;
    }
    cb(null, true);
  },
});

function normalizeOrderNumber(index) {
  return `A-${String(index).padStart(3, "0")}`;
}

async function generateOrderNumber() {
  const result = await db.query("SELECT COUNT(*) AS count FROM orders");
  const next = Number(result.rows[0]?.count || 0) + 1;
  return normalizeOrderNumber(next);
}

async function loadPriceMap() {
  const result = await db.query(
    `SELECT type, code, price_delta
     FROM service_options
     WHERE active = 1`
  );
  const map = new Map();
  result.rows.forEach((row) => {
    map.set(`${row.type}:${row.code}`, Number(row.price_delta || 0));
  });
  return map;
}

async function calculateOrderPrice({ serviceType, material, technology, color, thickness, qty }) {
  const priceMap = await loadPriceMap();
  const baseByType = {
    scan: 3000,
    modeling: 4500,
    print: 2500,
  };
  const base = baseByType[serviceType] || 2500;
  const quantity = Math.max(1, Number(qty || 1));
  const extras =
    (priceMap.get(`material:${material}`) || 0) +
    (priceMap.get(`technology:${technology}`) || 0) +
    (priceMap.get(`color:${color}`) || 0) +
    (priceMap.get(`thickness:${thickness}`) || 0);
  return Math.max(500, Math.round((base + extras) * quantity));
}

router.get("/options", async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, type, code, name, price_delta, active, sort_order, meta_json
       FROM service_options
       ORDER BY type ASC, sort_order ASC, name ASC`
    );
    const grouped = { material: [], technology: [], color: [], thickness: [] };
    result.rows.forEach((row) => {
      const item = {
        id: row.id,
        code: row.code,
        name: row.name,
        priceDelta: Number(row.price_delta || 0),
        active: Boolean(row.active),
        meta: row.meta_json ? JSON.parse(row.meta_json) : null,
      };
      if (!grouped[row.type]) grouped[row.type] = [];
      grouped[row.type].push(item);
    });
    res.json({ ok: true, options: grouped });
  } catch (error) {
    next(error);
  }
});

router.post("/price-preview", async (req, res, next) => {
  try {
    const amount = await calculateOrderPrice(req.body || {});
    res.json({ ok: true, totalAmount: amount });
  } catch (error) {
    next(error);
  }
});

router.post("/upload", requireAuth, upload.single("modelFile"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Файл не загружен." });
    }
    const ext = modelExtFromFilename(req.file.originalname) || path.extname(req.file.originalname || "").slice(1).toLowerCase();
    const fileInfo = {
      name: req.file.originalname,
      path: `/uploads/${path.basename(req.file.path)}`,
      size: req.file.size,
      ext,
    };
    res.status(201).json({ ok: true, file: fileInfo });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const result = await db.query(
      `SELECT o.*,
              u.phone,
              u.full_name,
              u.email,
              a.address_line,
              a.city,
              p.card_mask
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN user_addresses a ON a.id = o.address_id
       LEFT JOIN payment_methods p ON p.id = o.payment_method_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [req.auth.userId, limit]
    );

    const orders = result.rows.map((order) => {
      let details = {};
      try {
        details = order.details_json ? JSON.parse(order.details_json) : {};
      } catch {
        details = {};
      }
      return {
        id: order.id,
        orderNumber: order.order_number || "",
        status: order.status,
        allowedStatuses: getAllowedStatuses(order.service_type),
        createdAt: order.created_at,
        totalAmount: Number(order.total_amount || 0),
        serviceType: order.service_type || "",
        serviceName: order.service_name || "Услуга",
        fileName: order.file_name || "",
        filePath: order.file_path || "",
        modelingTask: order.modeling_task || "",
        details,
        paymentCardMask: order.card_mask || "",
        deliveryAddress: [order.city, order.address_line].filter(Boolean).join(", "),
        user: {
          id: order.user_id,
          phone: order.phone,
          fullName: order.full_name || "",
          email: order.email || "",
        },
      };
    });

    res.json({ ok: true, orders });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const {
      serviceType,
      serviceName,
      qty,
      material,
      technology,
      color,
      thickness,
      modelingTask,
      uploadedFile,
      addressId,
      paymentMethodId,
      totalAmount,
    } = req.body || {};

    const normalizedServiceType = normalizeServiceType(serviceType);
    if (!normalizedServiceType) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите тип услуги." });
    }
    if (getAllowedStatuses(normalizedServiceType).length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Неизвестный тип услуги." });
    }

    let finalAmount = Number(totalAmount);
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      finalAmount = await calculateOrderPrice({
        serviceType: normalizedServiceType,
        material,
        technology,
        color,
        thickness,
        qty,
      });
    }

    let savedAddressId = null;
    if (addressId) {
      const addressRes = await db.query("SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2 LIMIT 1", [
        addressId,
        req.auth.userId,
      ]);
      if (addressRes.rows[0]) savedAddressId = addressRes.rows[0].id;
    } else {
      const addressRes = await db.query(
        "SELECT id FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1",
        [req.auth.userId]
      );
      savedAddressId = addressRes.rows[0]?.id || null;
    }

    let savedPaymentMethodId = null;
    if (paymentMethodId) {
      const paymentRes = await db.query(
        "SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2 LIMIT 1",
        [paymentMethodId, req.auth.userId]
      );
      if (paymentRes.rows[0]) savedPaymentMethodId = paymentRes.rows[0].id;
    } else {
      const paymentRes = await db.query(
        "SELECT id FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1",
        [req.auth.userId]
      );
      savedPaymentMethodId = paymentRes.rows[0]?.id || null;
    }

    const orderId = crypto.randomUUID();
    const orderNumber = await generateOrderNumber();
    const detailsJson = JSON.stringify({
      qty: Number(qty || 1),
      material: String(material || ""),
      technology: String(technology || ""),
      color: String(color || ""),
      thickness: String(thickness || ""),
    });
    await db.query(
      `INSERT INTO orders (
          id, user_id, order_number, service_type, service_name, status, total_amount, currency,
          details_json, modeling_task, address_id, payment_method_id, file_name, file_path, file_size, file_ext,
          created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, 'Оплачен', $6, 'RUB',
         $7, $8, $9, $10, $11, $12, $13, $14,
         datetime('now'), datetime('now')
       )`,
      [
        orderId,
        req.auth.userId,
        orderNumber,
        normalizedServiceType,
        String(serviceName || "Услуга").trim(),
        finalAmount,
        detailsJson,
        String(modelingTask || "").trim() || null,
        savedAddressId,
        savedPaymentMethodId,
        uploadedFile?.name || null,
        uploadedFile?.path || null,
        uploadedFile?.size || null,
        uploadedFile?.ext || null,
      ]
    );

    res.status(201).json({ ok: true, orderId, orderNumber });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
