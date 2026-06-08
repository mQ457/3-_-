const path = require("path");
const fs = require("fs");

const envPath = path.resolve(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}
