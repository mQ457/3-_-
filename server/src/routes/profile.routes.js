const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    ok: true,
    profile: {
      phone: req.auth.phone,
      fullName: req.auth.fullName || "",
      email: req.auth.email || "",
    },
  });
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const { fullName, email } = req.body || {};
    const normalizedEmail = String(email || "").trim();

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Введите корректный email.",
      });
    }

    await db.query(
      `UPDATE users
       SET full_name = $1,
           email = $2,
           updated_at = datetime('now')
       WHERE id = $3`,
      [String(fullName || "").trim() || null, normalizedEmail || null, req.auth.userId]
    );

    const updated = await db.query(
      `SELECT phone, full_name, email
       FROM users
       WHERE id = $1`,
      [req.auth.userId]
    );

    const user = updated.rows[0];
    res.json({
      ok: true,
      profile: {
        phone: user.phone,
        fullName: user.full_name || "",
        email: user.email || "",
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
