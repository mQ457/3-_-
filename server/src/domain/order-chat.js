const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");

const uploadDir = path.resolve(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_ATTACHMENT_EXTS = new Set([
  "stl",
  "obj",
  "amf",
  "3mf",
  "fbx",
  "pdf",
  "doc",
  "docx",
  "txt",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

function fileExt(name) {
  return String(path.extname(name || "")).toLowerCase().replace(".", "");
}

const orderChatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = fileExt(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext ? `.${ext}` : ""}`);
  },
});

const orderChatUpload = multer({
  storage: orderChatStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = fileExt(file.originalname);
    if (!ext || !ALLOWED_ATTACHMENT_EXTS.has(ext)) {
      cb(
        new Error(
          "Разрешены вложения: STL, OBJ, AMF, 3MF, FBX, PDF, DOC, DOCX, TXT, JPG, PNG, WEBP."
        )
      );
      return;
    }
    cb(null, true);
  },
});

async function ensureOrderThread(orderId, userId) {
  const found = await db.query("SELECT id FROM order_threads WHERE order_id = $1 LIMIT 1", [orderId]);
  if (found.rows[0]) return found.rows[0].id;
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO order_threads (
      id, order_id, user_id, status, unread_user, unread_admin, created_at, updated_at, last_message_at
    )
    VALUES ($1, $2, $3, 'open', 0, 0, datetime('now'), datetime('now'), datetime('now'))`,
    [id, orderId, userId]
  );
  return id;
}

async function listMessagesWithAttachments(threadId) {
  const [messagesRes, attachmentsRes] = await Promise.all([
    db.query(
      `SELECT id, thread_id, sender_type, sender_id, message, created_at
       FROM order_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [threadId]
    ),
    db.query(
      `SELECT a.id, a.message_id, a.file_name, a.file_path, a.mime, a.size, a.ext
       FROM order_message_attachments a
       JOIN order_messages m ON m.id = a.message_id
       WHERE m.thread_id = $1
       ORDER BY a.created_at ASC`,
      [threadId]
    ),
  ]);

  const attachmentsByMessage = new Map();
  attachmentsRes.rows.forEach((row) => {
    if (!attachmentsByMessage.has(row.message_id)) attachmentsByMessage.set(row.message_id, []);
    attachmentsByMessage.get(row.message_id).push({
      id: row.id,
      fileName: row.file_name,
      filePath: row.file_path,
      mime: row.mime || "",
      size: Number(row.size || 0),
      ext: row.ext || "",
    });
  });

  return messagesRes.rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    message: row.message || "",
    createdAt: row.created_at,
    attachments: attachmentsByMessage.get(row.id) || [],
  }));
}

async function appendThreadMessage({ threadId, senderType, senderId, message, files, unreadTarget }) {
  const messageId = crypto.randomUUID();
  await db.query(
    `INSERT INTO order_messages (id, thread_id, sender_type, sender_id, message, created_at)
     VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
    [messageId, threadId, senderType, senderId, String(message || "").trim()]
  );

  for (const file of files || []) {
    const ext = fileExt(file.originalname);
    await db.query(
      `INSERT INTO order_message_attachments (id, message_id, file_name, file_path, mime, size, ext, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
      [
        crypto.randomUUID(),
        messageId,
        file.originalname,
        `/uploads/${path.basename(file.path)}`,
        file.mimetype || null,
        Number(file.size || 0),
        ext || null,
      ]
    );
  }

  const unreadSql = unreadTarget === "admin" ? "unread_admin = unread_admin + 1" : "unread_user = unread_user + 1";
  await db.query(
    `UPDATE order_threads
     SET ${unreadSql},
         updated_at = datetime('now'),
         last_message_at = datetime('now')
     WHERE id = $1`,
    [threadId]
  );
}

module.exports = {
  orderChatUpload,
  ensureOrderThread,
  listMessagesWithAttachments,
  appendThreadMessage,
};
