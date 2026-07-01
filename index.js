try {
  require("./server/src/index.js");
} catch (error) {
  console.error("Startup failed:", error);
  process.exit(1);
}
