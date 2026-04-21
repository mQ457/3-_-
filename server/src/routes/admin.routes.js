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

const router = express.Router();

router.use(requireAdmin);

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
    const orderRes = await db.query("SELECT id, service_type FROM orders WHERE id = $1 LIMIT 1", [req.params.id]);
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
    await db.query(
      `UPDATE orders
       SET status = $1,
           updated_at = datetime('now')
       WHERE id = $2`,
      [normalizedStatus, req.params.id]
    );
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
    const message = String(req.body?.message || "").trim();
    if (!userId) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите получателя." });
    }
    if (!message) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите текст уведомления." });
    }
    const userRes = await db.query("SELECT id FROM users WHERE id = $1 AND role = 'user' LIMIT 1", [userId]);
    if (!userRes.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Получатель не найден." });
    }
    const file = req.file;
    await db.query(
      `INSERT INTO user_notifications (
        id, user_id, admin_id, sender_type, message, file_name, file_path, file_mime, file_size, is_read, created_at
      )
      VALUES ($1, $2, $3, 'admin', $4, $5, $6, $7, $8, 0, datetime('now'))`,
      [
        crypto.randomUUID(),
        userId,
        req.auth.userId,
        message,
        file?.originalname || null,
        file ? `/uploads/${file.filename}` : null,
        file?.mimetype || null,
        file?.size || null,
      ]
    );
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
      `SELECT t.id, t.user_id, t.subject, t.status, t.created_at, t.updated_at, t.last_message_at,
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
    const { message } = req.body || {};
    if (!String(message || "").trim()) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение." });
    }
    await db.query(
      `INSERT INTO support_messages (id, thread_id, sender_type, sender_id, message, created_at)
       VALUES ($1, $2, 'admin', $3, $4, datetime('now'))`,
      [crypto.randomUUID(), req.params.threadId, req.auth.userId, String(message).trim()]
    );
    await db.query(
      `UPDATE support_threads
       SET updated_at = datetime('now'),
           last_message_at = datetime('now')
       WHERE id = $1`,
      [req.params.threadId]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/support/threads/:threadId", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    await db.query(
      `UPDATE support_threads
       SET status = $1,
           updated_at = datetime('now')
       WHERE id = $2`,
      [String(status || "open"), req.params.threadId]
    );
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
        Number(priceDelta || 0),
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
        priceDelta != null ? Number(priceDelta) : null,
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

module.exports = router;
