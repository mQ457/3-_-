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

router.post("/register", async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || String(password || "").length < 6) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Введите корректный телефон и пароль (минимум 6 символов).",
      });
    }

    const existing = await db.query("SELECT id FROM users WHERE phone = $1 LIMIT 1", [normalizedPhone]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: "ALREADY_EXISTS", message: "Аккаунт с таким номером уже существует." });
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    await db.query(
      `INSERT INTO users (id, phone, password_hash)
       VALUES ($1, $2, $3)`,
      [userId, normalizedPhone, passwordHash]
    );

    const session = await createSession(userId);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.status(201).json({
      ok: true,
      user: {
        id: userId,
        phone: normalizedPhone,
        fullName: null,
        email: null,
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
      `SELECT id, phone, password_hash, full_name, email
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

    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    return res.json({
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name,
        email: user.email,
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

module.exports = router;
