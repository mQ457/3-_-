console.log("Starting application...", {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  cwd: process.cwd(),
});

try {
  require("./server/src/index.js");
} catch (error) {
  console.error("Startup failed:", error);
  process.exit(1);
}
