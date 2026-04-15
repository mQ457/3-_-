const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { randomUUID } = require("crypto");
const bcrypt = require("bcrypt");

const dbFile = process.env.DATABASE_FILE || path.resolve(__dirname, "..", "data", "app.db");
const dbDir = path.dirname(dbFile);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("SQLite open error:", err);
    throw err;
  }
});

function seedServiceOptions() {
  db.get("SELECT COUNT(*) AS count FROM service_options", [], (countErr, row) => {
    if (countErr || Number(row?.count || 0) > 0) return;

    const defaults = [
      { type: "material", code: "pla", name: "PLA", priceDelta: 0, sortOrder: 1 },
      { type: "material", code: "abs", name: "ABS", priceDelta: 400, sortOrder: 2 },
      { type: "material", code: "petg", name: "PETG", priceDelta: 600, sortOrder: 3 },
      { type: "material", code: "resin", name: "Смола", priceDelta: 1200, sortOrder: 4 },
      { type: "technology", code: "fdm", name: "FDM", priceDelta: 0, sortOrder: 1 },
      { type: "technology", code: "sla", name: "SLA", priceDelta: 1000, sortOrder: 2 },
      { type: "technology", code: "sls", name: "SLS", priceDelta: 1300, sortOrder: 3 },
      { type: "color", code: "white", name: "Белый", priceDelta: 0, sortOrder: 1 },
      { type: "color", code: "black", name: "Черный", priceDelta: 100, sortOrder: 2 },
      { type: "color", code: "green", name: "Зеленый", priceDelta: 150, sortOrder: 3 },
      { type: "thickness", code: "0.1", name: "0.1 мм", priceDelta: 600, sortOrder: 1 },
      { type: "thickness", code: "0.2", name: "0.2 мм", priceDelta: 300, sortOrder: 2 },
      { type: "thickness", code: "0.3", name: "0.3 мм", priceDelta: 0, sortOrder: 3 },
    ];

    defaults.forEach((option) => {
      db.run(
        `INSERT INTO service_options (id, type, code, name, price_delta, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [randomUUID(), option.type, option.code, option.name, option.priceDelta, option.sortOrder]
      );
    });
  });
}

function ensureAdminUser() {
  const adminPhone = process.env.ADMIN_PHONE || "123456";
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync("admin123", 12);
  db.get("SELECT id, role FROM users WHERE phone = ? LIMIT 1", [adminPhone], (err, row) => {
    if (err) return;
    if (!row) {
      db.run(
        `INSERT INTO users (id, phone, password_hash, full_name, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', datetime('now'), datetime('now'))`,
        [randomUUID(), adminPhone, adminPasswordHash, "Администратор"]
      );
      return;
    }
    db.run(
      `UPDATE users
       SET role = 'admin',
           password_hash = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [adminPasswordHash, row.id]
    );
  });
}

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS user_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT,
      recipient_name TEXT,
      phone TEXT,
      address_line TEXT NOT NULL,
      city TEXT,
      lat REAL,
      lng REAL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      card_token TEXT NOT NULL,
      card_mask TEXT NOT NULL,
      holder_name TEXT,
      exp_month INTEGER,
      exp_year INTEGER,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS service_options (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      price_delta INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_number TEXT UNIQUE,
      service_type TEXT NOT NULL,
      service_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Новый',
      total_amount INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'RUB',
      details_json TEXT,
      modeling_task TEXT,
      address_id TEXT,
      payment_method_id TEXT,
      file_name TEXT,
      file_path TEXT,
      file_size INTEGER,
      file_ext TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(address_id) REFERENCES user_addresses(id) ON DELETE SET NULL,
      FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS support_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS order_threads (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      unread_user INTEGER NOT NULL DEFAULT 0,
      unread_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS order_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_id TEXT,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(thread_id) REFERENCES order_threads(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS order_message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      ext TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(message_id) REFERENCES order_messages(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS user_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      admin_id TEXT,
      sender_type TEXT NOT NULL DEFAULT 'admin',
      message TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      file_mime TEXT,
      file_size INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(admin_id) REFERENCES users(id) ON DELETE SET NULL
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)");
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON user_addresses(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_payment_user_id ON payment_methods(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_support_threads_user_id ON support_threads(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_support_messages_thread_id ON support_messages(thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_order_threads_user_id ON order_threads(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_order_threads_last_message_at ON order_threads(last_message_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_order_messages_thread_id ON order_messages(thread_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_order_attachments_message_id ON order_message_attachments(message_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_user_notifications_unread ON user_notifications(user_id, is_read)");
  db.run("CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id)");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_service_options_unique ON service_options(type, code)");

  db.all("PRAGMA table_info(users)", [], (pragmaErr, rows) => {
    if (pragmaErr) return;
    const cols = rows.map((row) => row.name);
    if (!cols.includes("role")) db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
    if (!cols.includes("is_active")) db.run("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  });

  db.all("PRAGMA table_info(orders)", [], (pragmaErr, rows) => {
    if (pragmaErr) return;
    const cols = rows.map((row) => row.name);
    const maybeAdd = (name, type) => {
      if (!cols.includes(name)) db.run(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
    };
    maybeAdd("order_number", "TEXT");
    maybeAdd("service_type", "TEXT DEFAULT 'print'");
    maybeAdd("service_name", "TEXT DEFAULT 'Услуга'");
    maybeAdd("currency", "TEXT DEFAULT 'RUB'");
    maybeAdd("details_json", "TEXT");
    maybeAdd("modeling_task", "TEXT");
    maybeAdd("address_id", "TEXT");
    maybeAdd("payment_method_id", "TEXT");
    maybeAdd("file_name", "TEXT");
    maybeAdd("file_path", "TEXT");
    maybeAdd("file_size", "INTEGER");
    maybeAdd("file_ext", "TEXT");
  });

  db.all("PRAGMA table_info(user_notifications)", [], (pragmaErr, rows) => {
    if (pragmaErr) return;
    const cols = rows.map((row) => row.name);
    if (!cols.includes("sender_type")) {
      db.run("ALTER TABLE user_notifications ADD COLUMN sender_type TEXT NOT NULL DEFAULT 'admin'");
    }
  });

  seedServiceOptions();
  ensureAdminUser();
});

function prepareQuery(sql) {
  return sql.replace(/\$\d+/g, "?");
}

function query(sql, params = []) {
  const normalizedSql = prepareQuery(sql);
  return new Promise((resolve, reject) => {
    const sqlTrim = normalizedSql.trim().toUpperCase();
    if (sqlTrim.startsWith("SELECT") || sqlTrim.startsWith("PRAGMA")) {
      db.all(normalizedSql, params, (err, rows) => {
        if (err) return reject(err);
        resolve({ rows });
      });
      return;
    }
    db.run(normalizedSql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ rowCount: this.changes, lastID: this.lastID });
    });
  });
}

module.exports = { query, db };
