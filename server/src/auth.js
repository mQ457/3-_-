const crypto = require("crypto");
const bcrypt = require("bcrypt");

function normalizePhone(phone) {
  const raw = String(phone || "").replace(/[^\d+]/g, "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }
  if (raw.startsWith("+")) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : "";
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function generateSessionToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getSessionExpiryDate() {
  const ttlDays = Number(process.env.SESSION_TTL_DAYS || 7);
  const date = new Date();
  date.setDate(date.getDate() + ttlDays);
  return date;
}

module.exports = {
  normalizePhone,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  getSessionExpiryDate,
};
