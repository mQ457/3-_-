const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const {
  normalizePhone,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  getSessionExpiryDate,
} = require("../auth");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

function setSessionCookie(res, token, expiresAt) {
  const cookieName = process.env.SESSION_COOKIE_NAME || "session_token";
  const isProd = process.env.NODE_ENV === "production";

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    expires: expiresAt,
    path: "/",
  });
}

async function createSession(userId) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = getSessionExpiryDate();

  await db.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), userId, tokenHash, expiresAt.toISOString()]
  );

  return { token, expiresAt };
}

async function clearUserSessions(userId) {
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

router.post("/register", async (req, res, next) => {
  try {
    const { phone, password, fullName, email } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = String(email || "").trim();

    if (!normalizedPhone || String(password || "").length < 6) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Введите корректный телефон и пароль (минимум 6 символов).",
      });
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Введите корректный email.",
      });
    }

    const existing = await db.query("SELECT id FROM users WHERE phone = $1 LIMIT 1", [normalizedPhone]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: "ALREADY_EXISTS", message: "Аккаунт с таким номером уже существует." });
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    await db.query(
      `INSERT INTO users (id, phone, password_hash, full_name, email, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', datetime('now'), datetime('now'))`,
      [userId, normalizedPhone, passwordHash, String(fullName || "").trim() || null, normalizedEmail || null]
    );

    await clearUserSessions(userId);
    const session = await createSession(userId);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.status(201).json({
      ok: true,
      user: {
        id: userId,
        phone: normalizedPhone,
        fullName: String(fullName || "").trim() || null,
        email: normalizedEmail || null,
        role: "user",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || !password) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите телефон и пароль." });
    }

    const userRes = await db.query(
      `SELECT id, phone, password_hash, full_name, email, role
       FROM users
       WHERE phone = $1
       LIMIT 1`,
      [normalizedPhone]
    );
    const user = userRes.rows[0];

    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Аккаунт не найден." });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Неверный пароль." });
    }

    await clearUserSessions(user.id);
    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.json({
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        email: user.email,
        role: user.role || "user",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await db.query("DELETE FROM sessions WHERE id = $1", [req.auth.sessionId]);
    const cookieName = process.env.SESSION_COOKIE_NAME || "session_token";
    res.clearCookie(cookieName, { path: "/" });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.auth.userId,
      phone: req.auth.phone,
      fullName: req.auth.fullName || "",
      email: req.auth.email || "",
      role: req.auth.role || "user",
    },
  });
});

module.exports = router;
