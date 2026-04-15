const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

function looksLikePatronymic(word) {
  const w = String(word || "").toLowerCase();
  if (!w) return false;
  if (w.length === 1) return true;
  return /(ович|евич|ич|оглы|улы|овна|евна|ична)$/.test(w);
}

function formatReviewAuthorName(fullName) {
  const raw = String(fullName || "").trim();
  if (!raw) return "Клиент";

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Клиент";

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    const [first, second] = parts;
    if (looksLikePatronymic(second)) {
      const initial = second[0].toUpperCase();
      return `${first} ${initial}.`;
    }
    return second;
  }

  const name = parts[parts.length - 2];
  const patronymic = parts[parts.length - 1];
  const initial = patronymic[0] ? patronymic[0].toUpperCase() : "";
  return initial ? `${name} ${initial}.` : name;
}

router.get("/", async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.id, r.rating, r.comment, datetime(r.created_at, 'localtime') AS created_at_local, u.full_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       ORDER BY datetime(r.created_at) DESC
       LIMIT 60`
    );
    res.json({
      ok: true,
      reviews: result.rows.map((row) => ({
        id: row.id,
        rating: Number(row.rating || 0),
        comment: row.comment || "",
        createdAt: row.created_at_local,
        authorName: formatReviewAuthorName(row.full_name),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const rating = Number(req.body?.rating || 0);
    const comment = String(req.body?.comment || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Выберите оценку от 1 до 5." });
    }
    if (comment.length < 5) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Напишите отзыв минимум из 5 символов." });
    }

    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO reviews (id, user_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, datetime('now'))`,
      [id, req.auth.userId, rating, comment]
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
