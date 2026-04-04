const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");

const router = express.Router();

function formatOrder(order) {
  return {
    id: order.id,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    totalAmount: order.total_amount,
    deliveryAddress: order.delivery_address,
    details: order.details,
    serviceName: order.service_name,
    cardNumber: order.card_number,
    user: {
      id: order.user_id,
      phone: order.phone || "Не задан",
      fullName: order.full_name || "Не задан",
      email: order.email || "Не задан",
    },
  };
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const orders = await db.query("SELECT count(*) AS count FROM orders");
    const users = await db.query("SELECT count(*) AS count FROM users");

    return res.json({
      ok: true,
      totalOrders: Number(orders.rows[0]?.count || 0),
      totalUsers: Number(users.rows[0]?.count || 0),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/orders", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT o.*, u.phone, u.full_name, u.email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC`
    );

    return res.json({
      ok: true,
      orders: result.rows.map(formatOrder),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/clients", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
              (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as orderCount,
              (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = u.id) as totalAmount
       FROM users u
       ORDER BY u.created_at DESC`
    );

    return res.json({
      ok: true,
      clients: result.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name || "Клиент",
        email: row.email || "",
        phone: row.phone || "",
        orderCount: Number(row.orderCount || 0),
        totalAmount: Number(row.totalAmount || 0),
        createdAt: row.created_at,
        status: "ACTIVE",
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/support", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, title, description, status, created_at, user_id
       FROM support_tickets
       ORDER BY created_at DESC
       LIMIT 50`
    );

    return res.json({
      ok: true,
      tickets: result.rows.map((row) => ({
        id: row.id,
        title: row.title || "Обращение",
        description: row.description || "",
        status: row.status || "новое",
        createdAt: row.created_at,
        clientName: "Клиент",
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/materials", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, price, stock, min_order, active
       FROM materials
       ORDER BY name ASC`
    );

    return res.json({
      ok: true,
      materials: result.rows.map((row) => ({
        id: row.id,
        name: row.name || "Материал",
        description: row.description || "",
        price: Number(row.price || 0),
        stock: Number(row.stock || 0),
        minOrder: Number(row.min_order || 1),
        active: row.active ? Boolean(row.active) : true,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/technologies", async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, min_size, max_size, precision, active
       FROM technologies
       ORDER BY name ASC`
    );

    return res.json({
      ok: true,
      technologies: result.rows.map((row) => ({
        id: row.id,
        name: row.name || "Технология",
        description: row.description || "",
        minSize: row.min_size || "",
        maxSize: row.max_size || "",
        precision: Number(row.precision || 0),
        active: row.active ? Boolean(row.active) : true,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/orders", async (req, res, next) => {
  try {
    const { userPhone, status, totalAmount, deliveryAddress, details } = req.body || {};
    if (!userPhone || !status) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите телефон клиента и статус заказа." });
    }

    const userRes = await db.query("SELECT id FROM users WHERE phone = ? LIMIT 1", [String(userPhone).trim()]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Пользователь с таким телефоном не найден." });
    }

    const orderId = randomUUID();
    await db.query(
      `INSERT INTO orders (id, user_id, status, total_amount, delivery_address, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, user.id, String(status).trim(), Number(totalAmount || 0), String(deliveryAddress || ""), String(details || "")]
    );

    return res.status(201).json({ ok: true, orderId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
