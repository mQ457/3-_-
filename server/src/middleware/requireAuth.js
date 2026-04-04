const db = require("../db");
const { hashSessionToken } = require("../auth");

async function requireAuth(req, res, next) {
  try {
    const cookieName = process.env.SESSION_COOKIE_NAME || "session_token";
    const token = req.cookies[cookieName];

    if (!token) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Требуется вход в аккаунт." });
    }

    const tokenHash = hashSessionToken(token);
    const result = await db.query(
      `SELECT s.id, s.user_id, u.phone, u.full_name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > datetime('now')
       LIMIT 1`,
      [tokenHash]
    );

    const session = result.rows[0];

    if (!session) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Сессия истекла. Войдите заново." });
    }

    req.auth = {
      sessionId: session.id,
      userId: session.user_id,
      phone: session.phone,
      fullName: session.full_name,
      email: session.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireAuth;
