const crypto = require("crypto");
const bcrypt = require("bcrypt");

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
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
