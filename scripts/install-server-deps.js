const { execSync } = require("child_process");
const path = require("path");

if (process.env.SKIP_SERVER_INSTALL === "1") {
  process.exit(0);
}

const serverDir = path.resolve(__dirname, "..", "server");

execSync("npm install --omit=dev", {
  cwd: serverDir,
  stdio: "inherit",
  env: { ...process.env, SKIP_SERVER_INSTALL: "1" },
});
