require("./src/load-env");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const { randomUUID } = require("crypto");

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

const COUNT_TABLES = [
  "users",
  "orders",
  "reviews",
  "support_threads",
  "support_messages",
  "user_notifications",
  "sessions",
  "user_addresses",
  "payment_methods",
  "order_threads",
  "order_messages",
  "order_message_attachments",
];

async function countRows(client, table) {
  const result = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return result.rows[0].c;
}

(async () => {
  const client = await pool.connect();
  try {
    const before = {};
    for (const table of COUNT_TABLES) {
      before[table] = await countRows(client, table);
    }
    console.log("Before:", before);

    await client.query("BEGIN");
    await client.query("DELETE FROM users");

    const adminPhone = process.env.ADMIN_PHONE || "+79990000000";
    const adminPasswordHash =
      process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Admin12345!", 12);

    await client.query(
      `INSERT INTO users (id, phone, password_hash, full_name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'admin', 1, NOW(), NOW())`,
      [randomUUID(), adminPhone, adminPasswordHash, "Администратор"]
    );
    await client.query("COMMIT");

    const after = {};
    for (const table of COUNT_TABLES) {
      after[table] = await countRows(client, table);
    }
    console.log("After:", after);
    console.log(`Done. Admin recreated: ${adminPhone}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
