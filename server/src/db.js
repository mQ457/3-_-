const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { randomUUID } = require("crypto");

const dbFile = process.env.DATABASE_FILE || path.resolve(__dirname, "..", "data", "app.db");
const dbDir = path.dirname(dbFile);
const fs = require("fs");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("SQLite open error:", err);
    throw err;
  }
});

// Ensure order table exists and seed sample orders when needed.
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS orders (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       status TEXT NOT NULL,
       service_name TEXT,
       card_number TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       total_amount INTEGER NOT NULL DEFAULT 0,
       delivery_address TEXT,
       details TEXT,
       FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
     )`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`);

  db.all("PRAGMA table_info(orders)", [], (pragmaErr, rows) => {
    if (pragmaErr) {
      console.error("Failed to read orders schema:", pragmaErr);
      return;
    }

    const cols = rows.map((row) => row.name);
    if (!cols.includes("service_name")) {
      db.run(`ALTER TABLE orders ADD COLUMN service_name TEXT`);
    }
    if (!cols.includes("card_number")) {
      db.run(`ALTER TABLE orders ADD COLUMN card_number TEXT`);
    }
  });

  db.run("DELETE FROM orders", (deleteErr) => {
    if (deleteErr) {
      console.error("Failed to clear orders table:", deleteErr);
    }
  });

  // Materials table
  db.run(
    `CREATE TABLE IF NOT EXISTS materials (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT,
       price REAL NOT NULL DEFAULT 0,
       stock INTEGER NOT NULL DEFAULT 0,
       min_order INTEGER NOT NULL DEFAULT 1,
       active INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  );

  // Technologies table
  db.run(
    `CREATE TABLE IF NOT EXISTS technologies (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       description TEXT,
       min_size TEXT,
       max_size TEXT,
       precision REAL NOT NULL DEFAULT 0,
       active INTEGER NOT NULL DEFAULT 1,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  );

  // Support tickets table
  db.run(
    `CREATE TABLE IF NOT EXISTS support_tickets (
       id TEXT PRIMARY KEY,
       user_id TEXT,
       title TEXT NOT NULL,
       description TEXT,
       status TEXT NOT NULL DEFAULT 'новое',
       created_at TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at TEXT NOT NULL DEFAULT (datetime('now')),
       FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
     )`
  );

  // Seed default materials if not exist
  db.get("SELECT COUNT(*) as cnt FROM materials", [], (err, row) => {
    if (err) return;
    if (row && row.cnt === 0) {
      const materials = [
        { name: "PLA (Биопластик)", description: "Биоразлагаемый пластик, идеален для прототипирования", price: 5.0, stock: 1000 },
        { name: "ABS (Технический)", description: "Прочный технический пластик", price: 7.0, stock: 800 },
        { name: "PETG (Прочный)", description: "Прочный и гибкий материал", price: 6.0, stock: 600 },
        { name: "Смола (Высокая детализация)", description: "Для высокодетализированных моделей", price: 25.0, stock: 200 },
      ];
      materials.forEach((mat) => {
        db.run(
          `INSERT INTO materials (id, name, description, price, stock, active) VALUES (?, ?, ?, ?, ?, 1)`,
          [randomUUID(), mat.name, mat.description, mat.price, mat.stock]
        );
      });
    }
  });

  // Seed default technologies if not exist
  db.get("SELECT COUNT(*) as cnt FROM technologies", [], (err, row) => {
    if (err) return;
    if (row && row.cnt === 0) {
      const techs = [
        { name: "FDM Печать", description: "Послойное напыление пластика", minSize: "0.5 мм", maxSize: "300x300 мм", precision: 0.2 },
        { name: "SLA Печать", description: "Фотополимерная печать", minSize: "0.05 мм", maxSize: "200x200 мм", precision: 0.05 },
        { name: "SLS Печать", description: "Селективное лазерное спекание", minSize: "1 мм", maxSize: "250x250 мм", precision: 0.3 },
      ];
      techs.forEach((tech) => {
        db.run(
          `INSERT INTO technologies (id, name, description, min_size, max_size, precision, active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [randomUUID(), tech.name, tech.description, tech.minSize, tech.maxSize, tech.precision]
        );
      });
    }
  });
});

function prepareQuery(sql) {
  // Преобразование $1, $2... в ? для sqlite3
  return sql.replace(/\$\d+/g, "?");
}

function query(sql, params = []) {
  const normalizedSql = prepareQuery(sql);
  return new Promise((resolve, reject) => {
    const sqlTrim = normalizedSql.trim().toUpperCase();
    if (sqlTrim.startsWith("SELECT")) {
      db.all(normalizedSql, params, (err, rows) => {
        if (err) return reject(err);
        resolve({ rows });
      });
    } else {
      db.run(normalizedSql, params, function (err) {
        if (err) return reject(err);
        resolve({ rowCount: this.changes, lastID: this.lastID });
      });
    }
  });
}

module.exports = {
  query,
  db,
};
