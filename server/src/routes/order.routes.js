const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT o.*, u.phone, u.full_name, u.email
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.auth.userId]
    );

    const orders = result.rows.map((order) => ({
      id: order.id,
      status: order.status,
      createdAt: order.created_at,
      totalAmount: order.total_amount,
      serviceName: order.service_name || "Услуга",
      cardNumber: order.card_number || null,
      details: order.details || "",
      user: {
        id: order.user_id,
        phone: order.phone,
        fullName: order.full_name || "",
        email: order.email || "",
      },
    }));

    res.json({ ok: true, orders });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { serviceName, totalAmount, cardNumber, exp, cvc } = req.body || {};
    const normalizedCard = String(cardNumber || "").replace(/\D/g, "");
    const amount = Number(totalAmount);

    if (!normalizedCard || normalizedCard.length < 12) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите корректный номер карты." });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Неверная сумма заказа." });
    }

    const userRes = await db.query(
      `SELECT phone, full_name, email
       FROM users
       WHERE id = $1`,
      [req.auth.userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Пользователь не найден." });
    }

    const orderId = randomUUID();
    await db.query(
      `INSERT INTO orders (id, user_id, status, total_amount, service_name, card_number, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderId,
        req.auth.userId,
        "Оплачен",
        Number(totalAmount || 0),
        String(serviceName || "Услуга"),
        normalizedCard,
        `Срок: ${String(exp || "").trim()}, CVC: ${String(cvc || "").trim()}`,
      ]
    );

    res.status(201).json({ ok: true, orderId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
