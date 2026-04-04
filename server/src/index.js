require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const adminRoutes = require("./routes/admin.routes");
const orderRoutes = require("./routes/order.routes");

const app = express();
const port = Number(process.env.PORT || 3000);
const webRoot = path.resolve(__dirname, "..", "..");
const fs = require("fs");
console.log("webRoot:", webRoot);
console.log("landing exists:", fs.existsSync(path.join(webRoot, "landing.html")));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.redirect("/landing.html");
});

app.use(express.static(webRoot));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err.stack || err);
  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "Внутренняя ошибка сервера.",
  });
});

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API started at http://localhost:${port}`);

  // автоматически открываем сайт после старта
  const openUrl = (url) => {
    const { exec } = require("child_process");
    const platform = process.platform;
    if (platform === "win32") {
      exec(`start "" "${url}"`);
    } else if (platform === "darwin") {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  };

  openUrl(`http://localhost:${port}/landing.html`);
});

// In some Windows/PowerShell setups the process may terminate right after start.
// Keep an explicit referenced timer so the server stays alive.
const keepAliveTimer = setInterval(() => {}, 60 * 60 * 1000);
if (typeof keepAliveTimer.ref === "function") {
  keepAliveTimer.ref();
}
if (typeof server.ref === "function") {
  server.ref();
}
