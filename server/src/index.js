require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { WebSocketServer } = require("ws");
const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const adminRoutes = require("./routes/admin.routes");
const orderRoutes = require("./routes/order.routes");
const reviewRoutes = require("./routes/review.routes");
const { setBroadcaster } = require("./realtime");

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const shouldAutoOpenBrowser = String(process.env.AUTO_OPEN_BROWSER || (!isProduction ? "1" : "0")) === "1";
const webRoot = path.resolve(__dirname, "..", "..");
const landingPagePath = path.join(webRoot, "landing.html");
const fs = require("fs");
console.log("webRoot:", webRoot);
console.log("landing exists:", fs.existsSync(landingPagePath));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/", (_req, res) => {
  return res.sendFile(landingPagePath);
});

app.use(
  express.static(webRoot, {
    etag: true,
    lastModified: true,
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".html") {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }
      if ([".js", ".css", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2"].includes(ext)) {
        res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
      }
    },
  })
);
app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);

// Resolve pretty URLs like /profile -> /profile.html when file exists.
app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
  const normalizedPath = decodeURIComponent(String(req.path || "/")).replace(/\\/g, "/");
  const safePath = normalizedPath.replace(/^\/+/, "");
  if (safePath) {
    const htmlCandidate = path.resolve(webRoot, `${safePath}.html`);
    if (htmlCandidate.startsWith(webRoot) && fs.existsSync(htmlCandidate)) {
      return res.sendFile(htmlCandidate);
    }
  }
  return res.sendFile(landingPagePath);
});

app.use((err, _req, res, _next) => {
  if (err?.message?.includes("STL, OBJ, AMF, 3MF, FBX")) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
  }
  if (err?.message?.includes("Разрешены файлы:")) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: err.message });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Размер файла не должен превышать 100 МБ." });
  }
  // eslint-disable-next-line no-console
  console.error(err.stack || err);
  return res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "Внутренняя ошибка сервера.",
  });
});

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Site started at http://localhost:${port}`);

  if (shouldAutoOpenBrowser) {
    // автоматически открываем сайт только при локальном запуске
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

    openUrl(`http://localhost:${port}`);
  }
});

const wsServer = new WebSocketServer({
  server,
  path: "/ws",
});

function broadcast(message) {
  const serialized = JSON.stringify(message);
  wsServer.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(serialized);
    }
  });
}

setBroadcaster((message) => {
  broadcast(message);
});

wsServer.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      event: "connected",
      timestamp: new Date().toISOString(),
    })
  );
});

if (!isProduction) {
  // In some Windows/PowerShell setups the process may terminate right after start.
  // Keep an explicit referenced timer so the server stays alive in local development.
  const keepAliveTimer = setInterval(() => {}, 60 * 60 * 1000);
  if (typeof keepAliveTimer.ref === "function") {
    keepAliveTimer.ref();
  }
  if (typeof server.ref === "function") {
    server.ref();
  }
}
