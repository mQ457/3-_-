const requireAuth = require("./requireAuth");

async function requireAdmin(req, res, next) {
  return requireAuth(req, res, (authErr) => {
    if (authErr) {
      next(authErr);
      return;
    }
    if (req.auth?.role !== "admin") {
      res.status(403).json({ error: "FORBIDDEN", message: "Недостаточно прав." });
      return;
    }
    next();
  });
}

module.exports = requireAdmin;
