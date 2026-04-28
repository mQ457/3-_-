const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const requireAdmin = require("../middleware/requireAdmin");
const { normalizeServiceType, getAllowedStatuses, isAllowedStatus } = require("../domain/order-statuses");
const {
  orderChatUpload,
  ensureOrderThread,
  listMessagesWithAttachments,
  appendThreadMessage,
} = require("../domain/order-chat");
const { notificationUpload } = require("../domain/notification-upload");
const { publish } = require("../realtime");
const { sendEmailOnce, isValidEmail, getAppSetting, setAppSetting } = require("../domain/email");

const router = express.Router();

router.use(requireAdmin);

const localRateStore = new Map();
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAllowedByRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const row = localRateStore.get(key);
  if (!row || row.resetAt <= now) {
    localRateStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

function normalizeMessage(value, max = 2000) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

router.get("/dashboard", async (_req, res, next) => {
  try {
    const [orders, users, openThreads] = await Promise.all([
      db.query("SELECT count(*) AS count FROM orders"),
      db.query("SELECT count(*) AS count FROM users WHERE role = 'user'"),
      db.query("SELECT count(*) AS count FROM support_threads WHERE status = 'open'"),
    ]);

    return res.json({
      ok: true,
      totalOrders: Number(orders.rows[0]?.count || 0),
      totalUsers: Number(users.rows[0]?.count || 0),
      openThreads: Number(openThreads.rows[0]?.count || 0),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/nav-updates", async (req, res, next) => {
  try {
    const sinceOrders = String(req.query.sinceOrders || "1970-01-01T00:00:00.000Z");
    const sinceSupport = String(req.query.sinceSupport || "1970-01-01T00:00:00.000Z");
    const sinceReviews = String(req.query.sinceReviews || "1970-01-01T00:00:00.000Z");
    const sinceNotifications = String(req.query.sinceNotifications || "1970-01-01T00:00:00.000Z");

    const [ordersRes, supportRes, reviewsRes, notificationsRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS count
         FROM orders
         WHERE datetime(created_at) > datetime($1)`,
        [sinceOrders]
      ),
      db.query(
        `SELECT COUNT(*) AS count
         FROM support_threads t
         WHERE datetime(t.last_message_at) > datetime($1)
           AND t.status = 'open'
           AND (
             SELECT sm.sender_type
             FROM support_messages sm
             WHERE sm.thread_id = t.id
             ORDER BY datetime(sm.created_at) DESC
             LIMIT 1
           ) = 'user'`,
        [sinceSupport]
      ),
      db.query(
        `SELECT COUNT(*) AS count
         FROM reviews
         WHERE datetime(created_at) > datetime($1)`,
        [sinceReviews]
      ),
      db.query(
        `SELECT COUNT(*) AS count
         FROM user_notifications
         WHERE sender_type = 'user'
           AND datetime(created_at) > datetime($1)`,
        [sinceNotifications]
      ),
    ]);

    return res.json({
      ok: true,
      counts: {
        orders: Number(ordersRes.rows[0]?.count || 0),
        support: Number(supportRes.rows[0]?.count || 0),
        reviews: Number(reviewsRes.rows[0]?.count || 0),
        notifications: Number(notificationsRes.rows[0]?.count || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/email-settings", async (_req, res, next) => {
  try {
    const directorEmail = await getAppSetting("director_email", "");
    res.json({ ok: true, directorEmail });
  } catch (error) {
    next(error);
  }
});

router.patch("/email-settings", async (req, res, next) => {
  try {
    const directorEmail = String(req.body?.directorEmail || "").trim().toLowerCase();
    if (!directorEmail || !isValidEmail(directorEmail)) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите корректный email директора." });
    }
    await setAppSetting("director_email", directorEmail);
    return res.json({ ok: true, directorEmail });
  } catch (error) {
    return next(error);
  }
});

router.post("/email-report/send", async (req, res, next) => {
  try {
    const rateKey = `report:${req.auth.userId || "admin"}`;
    const directorEmail = String(await getAppSetting("director_email", "")).trim().toLowerCase();
    if (!directorEmail || !isValidEmail(directorEmail)) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Сначала укажите email директора в настройках." });
    }

    const periodDays = Math.max(1, Math.min(30, Number(req.body?.periodDays || 1)));
    const [ordersRes, revenueRes, usersRes, supportRes] = await Promise.all([
      db.query("SELECT COUNT(*) AS count FROM orders WHERE created_at >= NOW() - ($1::text || ' days')::interval", [String(periodDays)]),
      db.query("SELECT COALESCE(SUM(total_amount), 0) AS amount FROM orders WHERE created_at >= NOW() - ($1::text || ' days')::interval", [String(periodDays)]),
      db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'user' AND created_at >= NOW() - ($1::text || ' days')::interval", [String(periodDays)]),
      db.query("SELECT COUNT(*) AS count FROM support_threads WHERE created_at >= NOW() - ($1::text || ' days')::interval", [String(periodDays)]),
    ]);

    const stats = {
      orders: Number(ordersRes.rows[0]?.count || 0),
      revenue: Number(revenueRes.rows[0]?.amount || 0),
      users: Number(usersRes.rows[0]?.count || 0),
      support: Number(supportRes.rows[0]?.count || 0),
    };
    const periodLabel = periodDays === 1 ? "за сегодня" : `за ${periodDays} дн.`;
    const html = `
      <h2>Отчет для директора ${escapeHtml(periodLabel)}</h2>
      <ul>
        <li>Заказы: <b>${stats.orders}</b></li>
        <li>Выручка: <b>${stats.revenue} RUB</b></li>
        <li>Новые пользователи: <b>${stats.users}</b></li>
        <li>Обращения в поддержку: <b>${stats.support}</b></li>
      </ul>
    `;
    const text = `Отчет ${periodLabel}: заказы ${stats.orders}, выручка ${stats.revenue} RUB, новые пользователи ${stats.users}, обращения ${stats.support}.`;
    const minuteBucket = new Date().toISOString().slice(0, 16);
    const eventKey = `director_report:${periodDays}:${minuteBucket}:${req.auth.userId || "admin"}`;
    const mailResult = await sendEmailOnce({
      eventKey,
      to: directorEmail,
      subject: `Отчет 3Д Печать ${periodLabel}`,
      html,
      text,
      templateType: "director_report",
      actorId: req.auth.userId,
      rateLimitKey: rateKey,
      rateLimitCount: 999,
      rateLimitWindowMs: 60000,
    });

    if (!mailResult.ok && !mailResult.duplicate && !mailResult.disabled) {
      const reason = String(mailResult.reason || mailResult.error || "unknown_error");
      return res.status(502).json({
        error: "EMAIL_SEND_FAILED",
        message: `Не удалось отправить отчет на email директора (${reason}).`,
      });
    }
    return res.json({
      ok: true,
      duplicate: Boolean(mailResult.duplicate),
      disabled: Boolean(mailResult.disabled),
      reason: mailResult.reason || "",
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/users", async (_req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(_req.query.limit || 200)));
    const users = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.created_at, u.updated_at,
              (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE user_id = u.id) AS total_amount
       FROM users u
       ORDER BY u.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({
      ok: true,
      users: users.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name || "",
        email: row.email || "",
        phone: row.phone || "",
        role: row.role || "user",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        orderCount: Number(row.order_count || 0),
        totalAmount: Number(row.total_amount || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/orders", async (_req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(_req.query.limit || 300)));
    const result = await db.query(
      `SELECT o.*, u.phone, u.full_name, u.email, p.card_mask, a.address_line, a.city
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN payment_methods p ON p.id = o.payment_method_id
       LEFT JOIN user_addresses a ON a.id = o.address_id
       ORDER BY o.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({
      ok: true,
      orders: result.rows.map((row) => {
        let details = {};
        try {
          details = row.details_json ? JSON.parse(row.details_json) : {};
        } catch {
          details = {};
        }
        return {
          id: row.id,
          orderNumber: row.order_number || "",
          status: row.status,
          serviceType: normalizeServiceType(row.service_type || ""),
          allowedStatuses: getAllowedStatuses(row.service_type || ""),
          serviceName: row.service_name || "",
          totalAmount: Number(row.total_amount || 0),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          details,
          modelingTask: row.modeling_task || "",
          fileName: row.file_name || "",
          filePath: row.file_path || "",
          cardMask: row.card_mask || "",
          address: [row.city, row.address_line].filter(Boolean).join(", "),
          user: {
            id: row.user_id,
            phone: row.phone || "",
            fullName: row.full_name || "",
            email: row.email || "",
          },
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/orders/:id", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const normalizedStatus = String(status || "").trim();
    if (!normalizedStatus) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите статус." });
    }
    const orderRes = await db.query(
      `SELECT o.id, o.user_id, o.order_number, o.service_type, o.status, o.details_json, u.email, u.full_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1
       LIMIT 1`,
      [req.params.id]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const serviceType = normalizeServiceType(order.service_type);
    if (!isAllowedStatus(serviceType, normalizedStatus)) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: `Статус недоступен для услуги ${serviceType || "unknown"}.`,
        allowedStatuses: getAllowedStatuses(serviceType),
      });
    }
    let details = {};
    try {
      details = order.details_json ? JSON.parse(order.details_json) : {};
    } catch {
      details = {};
    }
    const reservation = details.inventoryReservation || null;
    const fromStatus = String(order.status || "");
    const toStatus = normalizedStatus;
    const finishStatuses = new Set(["Завершен", "Готов к выдаче", "Отправлен", "Модель готова"]);
    const cancelStatuses = new Set(["Отменен", "Отмена"]);
    if (reservation?.inventoryId && reservation?.reservedQty) {
      const reservedQty = Math.max(0, Number(reservation.reservedQty || 0));
      const state = String(reservation.state || "reserved");
      const goesFinish = finishStatuses.has(toStatus);
      const goesCancel = cancelStatuses.has(toStatus);
      const wasFinish = finishStatuses.has(fromStatus);
      const wasCancel = cancelStatuses.has(fromStatus);
      if (state === "reserved" && goesFinish && !wasFinish) {
        await db.query(
          `UPDATE print_inventory
           SET reserved_qty = GREATEST(0, reserved_qty - $1),
               consumed_qty = consumed_qty + $1,
               stock_qty = GREATEST(0, stock_qty - $1),
               updated_at = datetime('now')
           WHERE id = $2`,
          [reservedQty, reservation.inventoryId]
        );
        details.inventoryReservation = { ...reservation, state: "consumed", consumedAtStatus: toStatus };
      } else if (state === "reserved" && goesCancel && !wasCancel) {
        await db.query(
          `UPDATE print_inventory
           SET reserved_qty = GREATEST(0, reserved_qty - $1),
               updated_at = datetime('now')
           WHERE id = $2`,
          [reservedQty, reservation.inventoryId]
        );
        details.inventoryReservation = { ...reservation, state: "released", releasedAtStatus: toStatus };
      }
    }
    await db.query(
      `UPDATE orders
       SET status = $1,
           details_json = $2,
           updated_at = datetime('now')
       WHERE id = $3`,
      [normalizedStatus, JSON.stringify(details), req.params.id]
    );
    if (fromStatus !== toStatus && isValidEmail(order.email || "")) {
      await sendEmailOnce({
        eventKey: `order:${order.id}:status:${toStatus}`,
        to: order.email,
        subject: `Статус заказа ${order.order_number || order.id} обновлен`,
        text: `Здравствуйте, ${order.full_name || "клиент"}.\nСтатус вашего заказа изменен: ${fromStatus} -> ${toStatus}.\nПроверьте детали в личном кабинете: http://localhost:3000/orders.html`,
        html: `<p>Здравствуйте, ${escapeHtml(order.full_name || "клиент")}.</p><p>Статус вашего заказа обновлен: <b>${escapeHtml(fromStatus)}</b> → <b>${escapeHtml(toStatus)}</b>.</p><p><a href="http://localhost:3000/orders.html">Открыть мои заказы</a></p>`,
        templateType: "order_status",
        actorId: req.auth.userId,
        rateLimitKey: `order-mail:${order.id}`,
        rateLimitCount: 20,
        rateLimitWindowMs: 60000,
      });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/user-full/:userId", async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const [userRes, addressRes, paymentRes, ordersRes] = await Promise.all([
      db.query("SELECT id, phone, full_name, email, role, password_hash FROM users WHERE id = $1 LIMIT 1", [userId]),
      db.query(
        "SELECT id, label, recipient_name, phone, address_line, city, lat, lng, is_default, created_at FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC",
        [userId]
      ),
      db.query(
        "SELECT id, card_mask, card_token, holder_name, exp_month, exp_year, is_default, created_at FROM payment_methods WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC",
        [userId]
      ),
      db.query(
        "SELECT id, order_number, service_name, status, total_amount, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      ),
    ]);
    if (!userRes.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Пользователь не найден." });
    }
    res.json({
      ok: true,
      user: userRes.rows[0],
      addresses: addressRes.rows,
      paymentMethods: paymentRes.rows,
      orders: ordersRes.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications/recipients", async (req, res, next) => {
  try {
    const query = String(req.query.query || "").trim();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const normalized = query.toLowerCase();
    const digits = query.replace(/\D/g, "");
    const [result, unreadResult] = await Promise.all([
      db.query(
        `SELECT
           u.id,
           u.full_name,
           u.phone,
           u.email,
           o.id AS order_id,
           o.order_number
         FROM users u
         LEFT JOIN orders o ON o.user_id = u.id
         WHERE u.role = 'user'
         ORDER BY datetime(u.created_at) DESC
         LIMIT 1000`,
        []
      ),
      db.query(
        `SELECT user_id, COUNT(*) AS unread_count
         FROM user_notifications
         WHERE sender_type = 'user' AND is_read = 0
         GROUP BY user_id`,
        []
      ),
    ]);
    const unreadByUserId = new Map(
      unreadResult.rows.map((row) => [String(row.user_id || ""), Number(row.unread_count || 0)])
    );
    const byUser = new Map();
    result.rows.forEach((row) => {
      const userId = String(row.id || "");
      if (!userId) return;
      if (!byUser.has(userId)) {
        byUser.set(userId, {
          id: userId,
          fullName: row.full_name || "",
          phone: row.phone || "",
          email: row.email || "",
          orderNumber: "",
          orderIds: [],
        });
      }
      const user = byUser.get(userId);
      if (row.order_number && !user.orderNumber) user.orderNumber = row.order_number;
      if (row.order_id) user.orderIds.push(String(row.order_id));
    });
    const recipients = Array.from(byUser.values())
      .filter((user) => {
        const unreadIncoming = unreadByUserId.get(String(user.id || "")) || 0;
        if (!query) {
          return unreadIncoming > 0;
        }
        const fullName = String(user.fullName || "").toLowerCase();
        const phone = String(user.phone || "").toLowerCase();
        const email = String(user.email || "").toLowerCase();
        const userId = String(user.id || "").toLowerCase();
        const orderNumber = String(user.orderNumber || "").toLowerCase();
        const phoneDigits = phone.replace(/\D/g, "");
        const byMain =
          fullName.includes(normalized) ||
          phone.includes(normalized) ||
          email.includes(normalized) ||
          userId.includes(normalized) ||
          orderNumber.includes(normalized);
        const byDigits = Boolean(digits) && phoneDigits.includes(digits);
        const byOrderId = user.orderIds.some((id) => id.toLowerCase().includes(normalized));
        return byMain || byDigits || byOrderId;
      })
      .slice(0, limit);
    res.json({
      ok: true,
      recipients: recipients.map((row) => ({
        id: row.id,
        fullName: row.fullName || "",
        phone: row.phone || "",
        email: row.email || "",
        orderNumber: row.orderNumber || "",
        unreadIncoming: unreadByUserId.get(String(row.id || "")) || 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/send", notificationUpload.single("attachment"), async (req, res, next) => {
  try {
    const userId = String(req.body?.userId || "").trim();
    const message = normalizeMessage(req.body?.message, 2000);
    if (!userId) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите получателя." });
    }
    if (!message) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите текст уведомления." });
    }
    if (!isAllowedByRateLimit(`promo:${req.auth.userId}:${userId}`, 5, 60000)) {
      return res.status(429).json({ error: "RATE_LIMITED", message: "Слишком много отправок. Попробуйте позже." });
    }
    const userRes = await db.query("SELECT id, email, full_name FROM users WHERE id = $1 AND role = 'user' LIMIT 1", [userId]);
    if (!userRes.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Получатель не найден." });
    }
    const user = userRes.rows[0];
    const file = req.file;
    const notificationId = crypto.randomUUID();
    await db.query(
      `INSERT INTO user_notifications (
        id, user_id, admin_id, sender_type, message, file_name, file_path, file_mime, file_size, is_read, created_at
      )
      VALUES ($1, $2, $3, 'admin', $4, $5, $6, $7, $8, 0, datetime('now'))`,
      [
        notificationId,
        userId,
        req.auth.userId,
        message,
        file?.originalname || null,
        file ? `/uploads/${file.filename}` : null,
        file?.mimetype || null,
        file?.size || null,
      ]
    );
    if (isValidEmail(user.email || "")) {
      const promoBucket = Math.floor(Date.now() / 30000);
      const promoDigest = crypto.createHash("sha1").update(`${userId}:${message}`).digest("hex").slice(0, 16);
      await sendEmailOnce({
        eventKey: `promo:${userId}:${promoDigest}:${promoBucket}`,
        to: user.email,
        subject: "Новое уведомление от 3Д Печать",
        text: `${message}\n\nОткройте личный кабинет: http://localhost:3000/profile.html`,
        html: `<p>${escapeHtml(user.full_name || "Клиент")}, вам пришло новое уведомление:</p><p>${escapeHtml(message)}</p><p><a href="http://localhost:3000/profile.html">Перейти в личный кабинет</a></p>`,
        templateType: "promo_notification",
        actorId: req.auth.userId,
        rateLimitKey: `promo-mail:${req.auth.userId}:${userId}`,
        rateLimitCount: 5,
        rateLimitWindowMs: 60000,
      });
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications/user/:userId", async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите пользователя." });
    }
    const userRes = await db.query("SELECT id, full_name, phone, email FROM users WHERE id = $1 LIMIT 1", [userId]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Пользователь не найден." });
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const notificationsRes = await db.query(
      `SELECT id, sender_type, message, file_name, file_path, file_mime, file_size, is_read, created_at
       FROM user_notifications
       WHERE user_id = $1
       ORDER BY datetime(created_at) DESC
       LIMIT $2`,
      [userId, limit]
    );
    res.json({
      ok: true,
      user: {
        id: user.id,
        fullName: user.full_name || "",
        phone: user.phone || "",
        email: user.email || "",
      },
      notifications: notificationsRes.rows.map((row) => ({
        id: row.id,
        senderType: row.sender_type || "admin",
        message: row.message || "",
        fileName: row.file_name || "",
        filePath: row.file_path || "",
        fileMime: row.file_mime || "",
        fileSize: Number(row.file_size || 0),
        isRead: Boolean(row.is_read),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/user/:userId/read", async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите пользователя." });
    }
    await db.query(
      `UPDATE user_notifications
       SET is_read = 1
       WHERE user_id = $1 AND sender_type = 'user'`,
      [userId]
    );
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/support/threads", async (_req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(_req.query.limit || 200)));
    const result = await db.query(
      `SELECT t.id, t.user_id, t.subject, t.status, t.user_visible, t.created_at, t.updated_at, t.last_message_at,
              u.full_name, u.phone, u.email,
              (
                SELECT sm.sender_type
                FROM support_messages sm
                WHERE sm.thread_id = t.id
                ORDER BY datetime(sm.created_at) DESC
                LIMIT 1
              ) AS last_sender_type
       FROM support_threads t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.last_message_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({
      ok: true,
      threads: result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        subject: row.subject,
        status: row.status,
        userVisible: Boolean(row.user_visible),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        lastSenderType: row.last_sender_type || "",
        needsAdminReply: row.status === "open" && row.last_sender_type === "user",
        user: {
          fullName: row.full_name || "",
          phone: row.phone || "",
          email: row.email || "",
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/support/threads/:threadId/messages", async (req, res, next) => {
  try {
    const messages = await db.query(
      `SELECT id, sender_type, sender_id, message, created_at
       FROM support_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [req.params.threadId]
    );
    res.json({
      ok: true,
      messages: messages.rows.map((row) => ({
        id: row.id,
        senderType: row.sender_type,
        senderId: row.sender_id,
        message: row.message,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/support/threads/:threadId/messages", async (req, res, next) => {
  try {
    const message = normalizeMessage(req.body?.message, 2000);
    if (!message) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение." });
    }
    if (!isAllowedByRateLimit(`support-admin:${req.auth.userId}:${req.params.threadId}`, 10, 60000)) {
      return res.status(429).json({ error: "RATE_LIMITED", message: "Слишком много сообщений. Подождите немного." });
    }
    const threadMetaRes = await db.query(
      `SELECT t.user_id, u.email, u.full_name
       FROM support_threads t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = $1
       LIMIT 1`,
      [req.params.threadId]
    );
    const threadMeta = threadMetaRes.rows[0];
    const supportMessageId = crypto.randomUUID();
    await db.query(
      `INSERT INTO support_messages (id, thread_id, sender_type, sender_id, message, created_at)
       VALUES ($1, $2, 'admin', $3, $4, datetime('now'))`,
      [supportMessageId, req.params.threadId, req.auth.userId, message]
    );
    await db.query(
      `UPDATE support_threads
       SET updated_at = datetime('now'),
           last_message_at = datetime('now')
       WHERE id = $1`,
      [req.params.threadId]
    );
    publish("support:updated", { threadId: req.params.threadId });
    if (isValidEmail(threadMeta?.email || "")) {
      const supportBucket = Math.floor(Date.now() / 20000);
      const supportDigest = crypto.createHash("sha1").update(`${req.params.threadId}:${message}`).digest("hex").slice(0, 16);
      await sendEmailOnce({
        eventKey: `support:${req.params.threadId}:${supportDigest}:${supportBucket}`,
        to: threadMeta.email,
        subject: "Новый ответ поддержки",
        text: `Поддержка ответила: ${message}\n\nОткройте кабинет: http://localhost:3000/profile.html`,
        html: `<p>${escapeHtml(threadMeta?.full_name || "Клиент")}, поддержка ответила:</p><p>${escapeHtml(message)}</p><p><a href="http://localhost:3000/profile.html">Открыть личный кабинет</a></p>`,
        templateType: "support_reply",
        actorId: req.auth.userId,
        rateLimitKey: `support-mail:${req.params.threadId}`,
        rateLimitCount: 20,
        rateLimitWindowMs: 60000,
      });
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/support/threads/:threadId", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    const normalizedStatus = String(status || "open");
    await db.query(
      `UPDATE support_threads
       SET status = $1,
           user_visible = CASE WHEN $1 = 'closed' THEN 0 ELSE user_visible END,
           updated_at = datetime('now')
       WHERE id = $2`,
      [normalizedStatus, req.params.threadId]
    );
    publish("support:updated", { threadId: req.params.threadId, status: normalizedStatus });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function loadOrderById(orderId) {
  const result = await db.query(
    `SELECT o.id, o.user_id, o.order_number, o.service_name, o.service_type, o.status, o.created_at,
            u.full_name, u.phone, u.email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1
     LIMIT 1`,
    [orderId]
  );
  return result.rows[0] || null;
}

router.get("/order-chats", async (_req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(_req.query.limit || 200)));
    const result = await db.query(
      `SELECT t.id, t.order_id, t.status, t.unread_user, t.unread_admin, t.last_message_at, t.updated_at,
              o.order_number, o.service_name, o.service_type, o.status AS order_status, o.created_at AS order_created_at,
              u.full_name, u.phone, u.email
       FROM order_threads t
       JOIN orders o ON o.id = t.order_id
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY t.last_message_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({
      ok: true,
      threads: result.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        status: row.status,
        unreadUser: Number(row.unread_user || 0),
        unreadAdmin: Number(row.unread_admin || 0),
        lastMessageAt: row.last_message_at,
        updatedAt: row.updated_at,
        user: {
          fullName: row.full_name || "",
          phone: row.phone || "",
          email: row.email || "",
        },
        order: {
          orderNumber: row.order_number || "",
          serviceName: row.service_name || "",
          serviceType: row.service_type || "",
          status: row.order_status || "",
          createdAt: row.order_created_at,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/order-chats/unread", async (_req, res, next) => {
  try {
    const result = await db.query("SELECT COALESCE(SUM(unread_admin), 0) AS unread_count FROM order_threads");
    res.json({ ok: true, unreadCount: Number(result.rows[0]?.unread_count || 0) });
  } catch (error) {
    next(error);
  }
});

router.get("/order-chats/:orderId/messages", async (req, res, next) => {
  try {
    const order = await loadOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const threadId = await ensureOrderThread(order.id, order.user_id);
    const messages = await listMessagesWithAttachments(threadId);
    await db.query(
      `UPDATE order_threads
       SET unread_admin = 0,
           updated_at = datetime('now')
       WHERE id = $1`,
      [threadId]
    );
    res.json({
      ok: true,
      thread: {
        id: threadId,
        orderId: order.id,
        userId: order.user_id,
        user: {
          fullName: order.full_name || "",
          phone: order.phone || "",
          email: order.email || "",
        },
        order: {
          orderNumber: order.order_number || "",
          serviceName: order.service_name || "",
          serviceType: order.service_type || "",
          status: order.status || "",
          createdAt: order.created_at,
        },
      },
      messages,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/order-chats/:orderId/messages", orderChatUpload.array("attachments", 10), async (req, res, next) => {
  try {
    const order = await loadOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const message = String(req.body?.message || "").trim();
    const files = req.files || [];
    if (!message && files.length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение или добавьте вложение." });
    }
    const threadId = await ensureOrderThread(order.id, order.user_id);
    await appendThreadMessage({
      threadId,
      senderType: "admin",
      senderId: req.auth.userId,
      message,
      files,
      unreadTarget: "user",
    });
    res.status(201).json({ ok: true, threadId });
  } catch (error) {
    next(error);
  }
});

router.patch("/order-chats/:orderId/read", async (req, res, next) => {
  try {
    const order = await loadOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const threadId = await ensureOrderThread(order.id, order.user_id);
    await db.query(
      `UPDATE order_threads
       SET unread_admin = 0,
           updated_at = datetime('now')
       WHERE id = $1`,
      [threadId]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/order-chats/:orderId", async (req, res, next) => {
  try {
    const order = await loadOrderById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const status = String(req.body?.status || "open").trim() || "open";
    const threadId = await ensureOrderThread(order.id, order.user_id);
    await db.query(
      `UPDATE order_threads
       SET status = $1,
           updated_at = datetime('now')
       WHERE id = $2`,
      [status, threadId]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/reviews", async (_req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(_req.query.limit || 300)));
    const result = await db.query(
      `SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, u.full_name, u.phone
       FROM reviews r
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY datetime(r.created_at) DESC
       LIMIT $1`,
      [limit]
    );
    res.json({
      ok: true,
      reviews: result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        rating: Number(row.rating || 0),
        comment: row.comment || "",
        createdAt: row.created_at,
        user: {
          fullName: row.full_name || "",
          phone: row.phone || "",
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/reviews/:id", async (req, res, next) => {
  try {
    const reviewId = req.params.id;
    const exists = await db.query("SELECT id FROM reviews WHERE id = $1 LIMIT 1", [reviewId]);
    if (!exists.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Отзыв не найден." });
    }
    await db.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/options", async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, type, code, name, price_delta, active, sort_order, meta_json
       FROM service_options
       ORDER BY type ASC, sort_order ASC, name ASC`
    );
    res.json({
      ok: true,
      options: result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        code: row.code,
        name: row.name,
        priceDelta: Number(row.price_delta || 0),
        active: Boolean(row.active),
        sortOrder: Number(row.sort_order || 0),
        meta: row.meta_json ? JSON.parse(row.meta_json) : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/options", async (req, res, next) => {
  try {
    const { type, code, name, priceDelta, active, sortOrder, meta } = req.body || {};
    if (!String(type || "").trim() || !String(code || "").trim() || !String(name || "").trim()) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "type, code и name обязательны." });
    }
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO service_options (id, type, code, name, price_delta, active, sort_order, meta_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
      [
        id,
        String(type).trim(),
        String(code).trim(),
        String(name).trim(),
        Math.round(Number(priceDelta || 0)),
        active === false ? 0 : 1,
        Number(sortOrder || 0),
        meta ? JSON.stringify(meta) : null,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    next(error);
  }
});

router.patch("/options/:id", async (req, res, next) => {
  try {
    const { name, priceDelta, active, sortOrder, meta } = req.body || {};
    await db.query(
      `UPDATE service_options
       SET name = COALESCE($1, name),
           price_delta = COALESCE($2, price_delta),
           active = COALESCE($3, active),
           sort_order = COALESCE($4, sort_order),
           meta_json = COALESCE($5, meta_json)
       WHERE id = $6`,
      [
        name != null ? String(name) : null,
        priceDelta != null ? Math.round(Number(priceDelta)) : null,
        active != null ? (active ? 1 : 0) : null,
        sortOrder != null ? Number(sortOrder) : null,
        meta != null ? JSON.stringify(meta) : null,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/options/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM service_options WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

function parseMetaJsonSafe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (!String(value).trim()) return null;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

router.get("/warehouse/items", async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, item_type, code, name, technology_code, material_code, color_code, thickness_mm,
              unit, stock_qty, reserved_qty, consumed_qty, price_per_cm3, low_stock_threshold, stop_stock_threshold,
              active, sort_order, meta_json, created_at, updated_at
       FROM print_inventory
       ORDER BY item_type ASC, sort_order ASC, name ASC`
    );
    res.json({
      ok: true,
      items: result.rows.map((row) => ({
        ...(function compute() {
          const stockQty = Number(row.stock_qty || 0);
          const reservedQty = Number(row.reserved_qty || 0);
          const availableQty = Math.max(0, stockQty - reservedQty);
          const stockPercent = stockQty > 0 ? (availableQty / stockQty) * 100 : 0;
          const stockStatus = stockPercent >= 60 ? "ok" : stockPercent >= 20 ? "low" : "critical";
          return {
            stockQty,
            reservedQty,
            availableQty,
            stockPercent: Math.round(stockPercent * 100) / 100,
            stockStatus,
          };
        })(),
        id: row.id,
        shortId: String(row.code || row.id || "").slice(0, 20),
        itemType: row.item_type,
        code: row.code,
        name: row.name,
        technologyCode: row.technology_code || "",
        materialCode: row.material_code || "",
        colorCode: row.color_code || "",
        thicknessMm: row.thickness_mm != null ? Number(row.thickness_mm) : null,
        unit: row.unit || "g",
        consumedQty: Number(row.consumed_qty || 0),
        pricePerCm3: Number(row.price_per_cm3 || 0),
        lowStockThreshold: Number(row.low_stock_threshold || 0),
        stopStockThreshold: Number(row.stop_stock_threshold || 0),
        active: Boolean(row.active),
        sortOrder: Number(row.sort_order || 0),
        meta: parseMetaJsonSafe(row.meta_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/warehouse/items", async (req, res, next) => {
  try {
    const body = req.body || {};
    const itemType = String(body.itemType || "").trim();
    const code = String(body.code || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    if (!itemType || !code || !name) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "itemType, code и name обязательны." });
    }
    if (!["technology", "material_variant"].includes(itemType)) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "itemType должен быть technology или material_variant." });
    }
    const technologyCode = String(body.technologyCode || "").trim().toLowerCase();
    const materialCode = String(body.materialCode || "").trim().toLowerCase();
    const colorCode = String(body.colorCode || "").trim().toLowerCase();
    const thicknessMm = body.thicknessMm != null && body.thicknessMm !== "" ? Number(body.thicknessMm) : null;
    if (itemType === "material_variant" && (!technologyCode || !materialCode || !colorCode || !Number.isFinite(thicknessMm))) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Для material_variant нужны technologyCode, materialCode, colorCode и thicknessMm.",
      });
    }
    const stockQty = itemType === "material_variant" ? Number(body.stockQty || 0) : 0;
    const unit = itemType === "material_variant" ? String(body.unit || "g").trim() : "service";
    const pricePerCm3 = itemType === "material_variant" ? Math.round(Number(body.pricePerCm3 || 0)) : 0;
    const meta = body.meta != null ? body.meta : null;
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO print_inventory (
         id, item_type, code, name, technology_code, material_code, color_code, thickness_mm,
         unit, stock_qty, reserved_qty, consumed_qty, price_per_cm3, low_stock_threshold, stop_stock_threshold,
         active, sort_order, meta_json, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, 0, 0, $11, $12, $13, $14, $15, $16, datetime('now'), datetime('now')
       )`,
      [
        id,
        itemType,
        code,
        name,
        technologyCode || null,
        materialCode || null,
        colorCode || null,
        Number.isFinite(thicknessMm) ? thicknessMm : null,
        unit || "g",
        Number.isFinite(stockQty) ? stockQty : 0,
        Number.isFinite(pricePerCm3) ? pricePerCm3 : 0,
        Number(body.lowStockThreshold || 1000),
        Number(body.stopStockThreshold || 300),
        body.active === false ? 0 : 1,
        Number(body.sortOrder || 0),
        meta != null ? JSON.stringify(meta) : null,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    if (String(error.message || "").includes("print_inventory_code_key")) {
      return res.status(409).json({ error: "ALREADY_EXISTS", message: "Код уже используется." });
    }
    next(error);
  }
});

router.patch("/warehouse/items/:id", async (req, res, next) => {
  try {
    const body = req.body || {};
    const meta = body.meta != null ? JSON.stringify(body.meta) : null;
    await db.query(
      `UPDATE print_inventory
       SET name = COALESCE($1, name),
           technology_code = COALESCE($2, technology_code),
           material_code = COALESCE($3, material_code),
           color_code = COALESCE($4, color_code),
           thickness_mm = COALESCE($5, thickness_mm),
           unit = COALESCE($6, unit),
           stock_qty = COALESCE($7, stock_qty),
           reserved_qty = COALESCE($8, reserved_qty),
           consumed_qty = COALESCE($9, consumed_qty),
           price_per_cm3 = COALESCE($10, price_per_cm3),
           low_stock_threshold = COALESCE($11, low_stock_threshold),
           stop_stock_threshold = COALESCE($12, stop_stock_threshold),
           active = COALESCE($13, active),
           sort_order = COALESCE($14, sort_order),
           meta_json = COALESCE($15, meta_json),
           updated_at = datetime('now')
       WHERE id = $16`,
      [
        body.name != null ? String(body.name) : null,
        body.technologyCode != null ? String(body.technologyCode || "").toLowerCase() : null,
        body.materialCode != null ? String(body.materialCode || "").toLowerCase() : null,
        body.colorCode != null ? String(body.colorCode || "").toLowerCase() : null,
        body.thicknessMm != null && body.thicknessMm !== "" ? Number(body.thicknessMm) : null,
        body.unit != null ? String(body.unit || "g") : null,
        body.stockQty != null ? Number(body.stockQty) : null,
        body.reservedQty != null ? Number(body.reservedQty) : null,
        body.consumedQty != null ? Number(body.consumedQty) : null,
        body.pricePerCm3 != null ? Math.round(Number(body.pricePerCm3)) : null,
        body.lowStockThreshold != null ? Number(body.lowStockThreshold) : null,
        body.stopStockThreshold != null ? Number(body.stopStockThreshold) : null,
        body.active != null ? (body.active ? 1 : 0) : null,
        body.sortOrder != null ? Number(body.sortOrder) : null,
        meta,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/warehouse/materials/:materialCode/sync", async (req, res, next) => {
  const materialCode = String(req.params.materialCode || "").trim().toLowerCase();
  if (!materialCode) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Не указан materialCode." });
  }
  const body = req.body || {};
  const hasTotalStock = body.totalStock != null && body.totalStock !== "";
  const hasPrice = body.pricePerCm3 != null && body.pricePerCm3 !== "";
  if (!hasTotalStock && !hasPrice) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите totalStock и/или pricePerCm3." });
  }
  const totalStock = hasTotalStock ? Math.max(0, Number(body.totalStock || 0)) : null;
  const nextPrice = hasPrice ? Math.max(0, Math.round(Number(body.pricePerCm3 || 0))) : null;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const variantsRes = await client.query(
      `SELECT id, stock_qty
       FROM print_inventory
       WHERE item_type = 'material_variant' AND material_code = $1`,
      [materialCode]
    );
    const variants = variantsRes.rows || [];
    if (!variants.length) {
      await client.query("COMMIT");
      return res.json({ ok: true, updated: 0 });
    }

    if (hasTotalStock) {
      const currentStock = variants.reduce((sum, row) => sum + Number(row.stock_qty || 0), 0);
      if (currentStock > 0) {
        const multiplier = totalStock / currentStock;
        await client.query(
          `UPDATE print_inventory
           SET stock_qty = GREATEST(0, ROUND((stock_qty * $1)::numeric, 2)),
               updated_at = datetime('now')
           WHERE item_type = 'material_variant' AND material_code = $2`,
          [multiplier, materialCode]
        );
      } else {
        const perVariant = variants.length ? Number((totalStock / variants.length).toFixed(2)) : 0;
        await client.query(
          `UPDATE print_inventory
           SET stock_qty = $1,
               updated_at = datetime('now')
           WHERE item_type = 'material_variant' AND material_code = $2`,
          [perVariant, materialCode]
        );
      }
    }

    if (hasPrice) {
      await client.query(
        `UPDATE print_inventory
         SET price_per_cm3 = $1,
             updated_at = datetime('now')
         WHERE item_type = 'material_variant' AND material_code = $2`,
        [nextPrice, materialCode]
      );
    }

    await client.query("COMMIT");
    return res.json({ ok: true, updated: variants.length });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

router.delete("/warehouse/items/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM print_inventory WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/pricing-rules", async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT service_type, base_fee, min_price, hour_rate, setup_fee, waste_percent, support_percent,
              machine_hour_rate, default_model_volume_cm3, created_at, updated_at
       FROM service_pricing_rules
       ORDER BY service_type ASC`
    );
    res.json({
      ok: true,
      rules: result.rows.map((row) => ({
        serviceType: row.service_type,
        baseFee: Number(row.base_fee || 0),
        minPrice: Number(row.min_price || 0),
        hourRate: Number(row.hour_rate || 0),
        setupFee: Number(row.setup_fee || 0),
        wastePercent: Number(row.waste_percent || 0),
        supportPercent: Number(row.support_percent || 0),
        machineHourRate: Number(row.machine_hour_rate || 0),
        defaultModelVolumeCm3: Number(row.default_model_volume_cm3 || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/pricing-rules/:serviceType", async (req, res, next) => {
  try {
    const body = req.body || {};
    const serviceType = String(req.params.serviceType || "").trim();
    if (!serviceType) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Не указан serviceType." });
    }
    await db.query(
      `INSERT INTO service_pricing_rules (
         service_type, base_fee, min_price, hour_rate, setup_fee, waste_percent, support_percent,
         machine_hour_rate, default_model_volume_cm3, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, datetime('now'), datetime('now'))
       ON CONFLICT (service_type)
       DO UPDATE SET
         base_fee = COALESCE(EXCLUDED.base_fee, service_pricing_rules.base_fee),
         min_price = COALESCE(EXCLUDED.min_price, service_pricing_rules.min_price),
         hour_rate = COALESCE(EXCLUDED.hour_rate, service_pricing_rules.hour_rate),
         setup_fee = COALESCE(EXCLUDED.setup_fee, service_pricing_rules.setup_fee),
         waste_percent = COALESCE(EXCLUDED.waste_percent, service_pricing_rules.waste_percent),
         support_percent = COALESCE(EXCLUDED.support_percent, service_pricing_rules.support_percent),
         machine_hour_rate = COALESCE(EXCLUDED.machine_hour_rate, service_pricing_rules.machine_hour_rate),
         default_model_volume_cm3 = COALESCE(EXCLUDED.default_model_volume_cm3, service_pricing_rules.default_model_volume_cm3),
         updated_at = datetime('now')`,
      [
        serviceType,
        body.baseFee != null ? Number(body.baseFee) : 0,
        body.minPrice != null ? Number(body.minPrice) : 0,
        body.hourRate != null ? Number(body.hourRate) : 0,
        body.setupFee != null ? Number(body.setupFee) : 0,
        body.wastePercent != null ? Number(body.wastePercent) : 0,
        body.supportPercent != null ? Number(body.supportPercent) : 0,
        body.machineHourRate != null ? Number(body.machineHourRate) : 0,
        body.defaultModelVolumeCm3 != null ? Number(body.defaultModelVolumeCm3) : 0,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
