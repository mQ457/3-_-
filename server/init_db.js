require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

function shouldUseSsl(url) {
  try {
    const host = new URL(url).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch (_error) {
    return true;
  }
}

const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
});

const sql = fs.readFileSync(path.resolve(__dirname, "sql", "init.sql"), "utf8");
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    console.log("Postgres schema initialized successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Schema initialization failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
