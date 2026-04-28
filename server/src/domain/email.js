const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../db");

const EMAIL_ENABLED = String(process.env.EMAIL_ENABLED || "1") === "1";
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "0") === "1";
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "")
  .trim()
  .replace(/\s+/g, "");
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "no-reply@example.com").trim();

const rateBucket = new Map();
let schemaEnsured = false;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function cleanHeader(value, limit = 180) {
  return String(value || "")
    .replace(/[\r\n\t]/g, " ")
    .trim()
    .slice(0, limit);
}

function canPassRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const row = rateBucket.get(key);
  if (!row || row.resetAt <= now) {
    rateBucket.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function ensureEmailSchema() {
  if (schemaEnsured) return;
  await db.query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS email_delivery_log (
      id TEXT PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      recipient TEXT NOT NULL,
      template_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actor_id TEXT,
      error_message TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await db.query("CREATE INDEX IF NOT EXISTS idx_email_delivery_recipient ON email_delivery_log(recipient)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_email_delivery_status ON email_delivery_log(status)");
  schemaEnsured = true;
}

async function createDelivery({ eventKey, recipient, templateType, actorId }) {
  await ensureEmailSchema();
  const rowId = crypto.randomUUID();
  const result = await db.query(
    `INSERT INTO email_delivery_log (id, event_key, recipient, template_type, status, actor_id, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, NOW())
     ON CONFLICT (event_key) DO NOTHING`,
    [rowId, eventKey, recipient, templateType, actorId || null]
  );
  return result.rowCount > 0;
}

async function markDeliverySuccess(eventKey) {
  await ensureEmailSchema();
  await db.query(
    `UPDATE email_delivery_log
     SET status = 'sent',
         sent_at = NOW(),
         error_message = NULL
     WHERE event_key = $1`,
    [eventKey]
  );
}

async function markDeliveryFailed(eventKey, errorMessage) {
  await ensureEmailSchema();
  await db.query(
    `UPDATE email_delivery_log
     SET status = 'failed',
         error_message = $2
     WHERE event_key = $1`,
    [eventKey, cleanHeader(errorMessage, 400)]
  );
}

async function sendEmailOnce({ eventKey, to, subject, text, html, templateType, actorId, rateLimitKey, rateLimitCount = 8, rateLimitWindowMs = 60000 }) {
  const recipient = String(to || "").trim().toLowerCase();
  if (!isValidEmail(recipient)) return { ok: false, skipped: true, reason: "invalid_recipient" };
  if (!String(eventKey || "").trim()) return { ok: false, skipped: true, reason: "missing_event_key" };
  if (!String(subject || "").trim()) return { ok: false, skipped: true, reason: "missing_subject" };
  if (!String(text || "").trim() && !String(html || "").trim()) return { ok: false, skipped: true, reason: "missing_body" };

  if (rateLimitKey && !canPassRateLimit(rateLimitKey, rateLimitCount, rateLimitWindowMs)) {
    return { ok: false, skipped: true, reason: "rate_limited" };
  }

  const inserted = await createDelivery({
    eventKey: String(eventKey),
    recipient,
    templateType: String(templateType || "generic"),
    actorId: actorId || null,
  });
  if (!inserted) return { ok: true, duplicate: true };
  if (!EMAIL_ENABLED) return { ok: true, disabled: true };

  const tx = getTransporter();
  if (!tx) {
    await markDeliveryFailed(eventKey, "SMTP is not configured");
    return { ok: false, skipped: true, reason: "smtp_not_configured" };
  }

  try {
    await tx.sendMail({
      from: SMTP_FROM,
      to: recipient,
      subject: cleanHeader(subject, 180),
      text: String(text || "").slice(0, 12000),
      html: String(html || "").slice(0, 20000) || undefined,
    });
    await markDeliverySuccess(eventKey);
    return { ok: true };
  } catch (error) {
    const reason = cleanHeader(
      [error?.code, error?.responseCode, error?.message].filter(Boolean).join(" | ") || "send_failed",
      400
    );
    await markDeliveryFailed(eventKey, reason);
    return { ok: false, error: "send_failed", reason };
  }
}

async function getAppSetting(key, fallbackValue = "") {
  await ensureEmailSchema();
  const result = await db.query("SELECT value FROM app_settings WHERE key = $1 LIMIT 1", [String(key)]);
  return String(result.rows[0]?.value || fallbackValue || "");
}

async function setAppSetting(key, value) {
  await ensureEmailSchema();
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [String(key), String(value || "")]
  );
}

module.exports = {
  isValidEmail,
  sendEmailOnce,
  getAppSetting,
  setAppSetting,
};
