const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required. Set Postgres connection string in environment variables.");
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

function normalizeSql(sql) {
  let normalized = String(sql || "");
  normalized = normalized.replace(/datetime\('now'\)/g, "NOW()");
  normalized = normalized.replace(/datetime\(([^,()]+),\s*'localtime'\)/g, "($1)");
  normalized = normalized.replace(/datetime\(([^()]+)\)/g, "($1)");
  return normalized;
}

function splitSqlStatements(sql) {
  return String(sql || "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function runSchemaInit(client) {
  const schemaPath = path.resolve(__dirname, "..", "sql", "init.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(schemaSql);
  for (const statement of statements) {
    await client.query(statement);
  }
}

async function seedServiceOptions(client) {
  const defaults = [
    { type: "material", code: "pla", name: "PLA", priceDelta: 0, sortOrder: 1 },
    { type: "material", code: "abs", name: "ABS", priceDelta: 400, sortOrder: 2 },
    { type: "material", code: "petg", name: "PETG", priceDelta: 600, sortOrder: 3 },
    { type: "material", code: "resin", name: "Смола", priceDelta: 1200, sortOrder: 4 },
    { type: "material", code: "nylon", name: "Nylon", priceDelta: 900, sortOrder: 5 },
    { type: "technology", code: "fdm", name: "FDM", priceDelta: 0, sortOrder: 1 },
    { type: "technology", code: "sla", name: "SLA", priceDelta: 1000, sortOrder: 2 },
    { type: "technology", code: "sls", name: "SLS", priceDelta: 1300, sortOrder: 3 },
    { type: "color", code: "red", name: "Красный", priceDelta: 120, sortOrder: 1 },
    { type: "color", code: "orange", name: "Оранжевый", priceDelta: 120, sortOrder: 2 },
    { type: "color", code: "yellow", name: "Желтый", priceDelta: 120, sortOrder: 3 },
    { type: "color", code: "green", name: "Зеленый", priceDelta: 120, sortOrder: 4 },
    { type: "color", code: "blue", name: "Синий", priceDelta: 120, sortOrder: 5 },
    { type: "color", code: "indigo", name: "Индиго", priceDelta: 120, sortOrder: 6 },
    { type: "color", code: "violet", name: "Фиолетовый", priceDelta: 120, sortOrder: 7 },
    { type: "thickness", code: "0.1", name: "0.1 мм", priceDelta: 600, sortOrder: 1 },
    { type: "thickness", code: "0.2", name: "0.2 мм", priceDelta: 300, sortOrder: 2 },
    { type: "thickness", code: "0.3", name: "0.3 мм", priceDelta: 0, sortOrder: 3 },
  ];

  for (const option of defaults) {
    await client.query(
      `INSERT INTO service_options (id, type, code, name, price_delta, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       ON CONFLICT (type, code)
       DO UPDATE SET
         name = EXCLUDED.name,
         price_delta = EXCLUDED.price_delta,
         sort_order = EXCLUDED.sort_order,
         active = EXCLUDED.active`,
      [randomUUID(), option.type, option.code, option.name, option.priceDelta, option.sortOrder]
    );
  }
}

async function seedPrintInventory(client) {
  const technologyDefs = [
    { code: "fdm", name: "FDM", defaultSpeedCm3h: 22, sortOrder: 1 },
    { code: "sla", name: "SLA", defaultSpeedCm3h: 18, sortOrder: 2 },
    { code: "sls", name: "SLS", defaultSpeedCm3h: 15, sortOrder: 3 },
  ];
  const colorDefs = [
    { code: "red", name: "Красный" },
    { code: "orange", name: "Оранжевый" },
    { code: "yellow", name: "Желтый" },
    { code: "green", name: "Зеленый" },
    { code: "blue", name: "Синий" },
    { code: "indigo", name: "Индиго" },
    { code: "violet", name: "Фиолетовый" },
  ];
  const thicknesses = [0.1, 0.2, 0.3];
  const materialDefs = [
    { code: "pla", name: "PLA", unit: "g", densityGcm3: 1.24, basePricePerCm3: 36 },
    { code: "abs", name: "ABS", unit: "g", densityGcm3: 1.04, basePricePerCm3: 46 },
    { code: "petg", name: "PETG", unit: "g", densityGcm3: 1.27, basePricePerCm3: 52 },
    { code: "resin", name: "Resin", unit: "ml", densityGcm3: 1.1, basePricePerCm3: 92 },
    { code: "nylon", name: "Nylon", unit: "g", densityGcm3: 1.15, basePricePerCm3: 64 },
  ];

  const techPriceK = { fdm: 1.0, sla: 1.35, sls: 1.55 };
  const techStockK = { fdm: 1.2, sla: 1.0, sls: 0.8 };
  const thicknessDelta = { 0.1: 1.18, 0.2: 1.0, 0.3: 0.88 };

  const rows = [];

  technologyDefs.forEach((tech) => {
    rows.push({
      itemType: "technology",
      code: `tech-${tech.code}`,
      name: tech.name,
      technologyCode: tech.code,
      unit: "service",
      stockQty: 0,
      pricePerCm3: 0,
      lowStockThreshold: 0,
      stopStockThreshold: 0,
      sortOrder: tech.sortOrder,
      meta: { defaultSpeedCm3h: tech.defaultSpeedCm3h },
    });
  });

  let sort = 10;
  technologyDefs.forEach((tech) => {
    materialDefs.forEach((material) => {
      colorDefs.forEach((color) => {
        thicknesses.forEach((thickness) => {
          const price = Math.round(material.basePricePerCm3 * (techPriceK[tech.code] || 1) * (thicknessDelta[String(thickness)] || 1));
          const baseStock = Math.round(9000 * (techStockK[tech.code] || 1));
          rows.push({
            itemType: "material_variant",
            code: `${tech.code}-${material.code}-${color.code}-${String(thickness).replace(".", "")}`,
            name: `${tech.name} ${color.name} ${String(thickness).replace(".", ".")}мм`,
            technologyCode: tech.code,
            materialCode: material.code,
            colorCode: color.code,
            thicknessMm: thickness,
            unit: material.unit,
            stockQty: baseStock,
            pricePerCm3: price,
            lowStockThreshold: Math.round(baseStock * 0.4),
            stopStockThreshold: Math.round(baseStock * 0.2),
            sortOrder: sort++,
            meta: {
              displayName: `${tech.name} / ${material.name} / ${color.name} / ${thickness} мм`,
              materialName: material.name,
              colorName: color.name,
              densityGcm3: material.densityGcm3,
              defaultSpeedCm3h: tech.defaultSpeedCm3h,
            },
          });
        });
      });
    });
  });

  for (const row of rows) {
    await client.query(
      `INSERT INTO print_inventory (
        id, item_type, code, name, technology_code, material_code, color_code, thickness_mm,
        unit, stock_qty, reserved_qty, consumed_qty, price_per_cm3, low_stock_threshold, stop_stock_threshold,
        active, sort_order, meta_json, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, 0, 0, $11, $12, $13, 1, $14, $15, NOW(), NOW()
      )
      ON CONFLICT (code)
      DO UPDATE SET
        item_type = EXCLUDED.item_type,
        name = EXCLUDED.name,
        technology_code = EXCLUDED.technology_code,
        material_code = EXCLUDED.material_code,
        color_code = EXCLUDED.color_code,
        thickness_mm = EXCLUDED.thickness_mm,
        unit = EXCLUDED.unit,
        price_per_cm3 = EXCLUDED.price_per_cm3,
        low_stock_threshold = EXCLUDED.low_stock_threshold,
        stop_stock_threshold = EXCLUDED.stop_stock_threshold,
        sort_order = EXCLUDED.sort_order,
        meta_json = EXCLUDED.meta_json,
        active = EXCLUDED.active,
        updated_at = NOW()`,
      [
        randomUUID(),
        row.itemType,
        row.code,
        row.name,
        row.technologyCode || null,
        row.materialCode || null,
        row.colorCode || null,
        row.thicknessMm ?? null,
        row.unit || "g",
        Number(row.stockQty || 0),
        Number(row.pricePerCm3 || 0),
        Number(row.lowStockThreshold || 1000),
        Number(row.stopStockThreshold || 300),
        Number(row.sortOrder || 0),
        row.meta ? JSON.stringify(row.meta) : null,
      ]
    );
  }
}

async function seedServicePricingRules(client) {
  const defaults = [
    {
      serviceType: "print",
      baseFee: 250,
      minPrice: 700,
      hourRate: 0,
      setupFee: 180,
      wastePercent: 8,
      supportPercent: 5,
      machineHourRate: 260,
      defaultModelVolumeCm3: 28,
    },
    {
      serviceType: "modeling",
      baseFee: 900,
      minPrice: 1800,
      hourRate: 1200,
      setupFee: 0,
      wastePercent: 0,
      supportPercent: 0,
      machineHourRate: 0,
      defaultModelVolumeCm3: 0,
    },
    {
      serviceType: "scan",
      baseFee: 1200,
      minPrice: 1500,
      hourRate: 1000,
      setupFee: 0,
      wastePercent: 0,
      supportPercent: 0,
      machineHourRate: 0,
      defaultModelVolumeCm3: 0,
    },
  ];

  for (const row of defaults) {
    await client.query(
      `INSERT INTO service_pricing_rules (
         service_type, base_fee, min_price, hour_rate, setup_fee, waste_percent, support_percent,
         machine_hour_rate, default_model_volume_cm3, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       ON CONFLICT (service_type)
       DO UPDATE SET
         base_fee = EXCLUDED.base_fee,
         min_price = EXCLUDED.min_price,
         hour_rate = EXCLUDED.hour_rate,
         setup_fee = EXCLUDED.setup_fee,
         waste_percent = EXCLUDED.waste_percent,
         support_percent = EXCLUDED.support_percent,
         machine_hour_rate = EXCLUDED.machine_hour_rate,
         default_model_volume_cm3 = EXCLUDED.default_model_volume_cm3,
         updated_at = NOW()`,
      [
        row.serviceType,
        row.baseFee,
        row.minPrice,
        row.hourRate,
        row.setupFee,
        row.wastePercent,
        row.supportPercent,
        row.machineHourRate,
        row.defaultModelVolumeCm3,
      ]
    );
  }
}

async function ensureAdminUser(client) {
  const adminPhone = process.env.ADMIN_PHONE || "+79990000000";
  const adminPasswordHash =
    process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Admin12345!", 12);

  await client.query(
    `INSERT INTO users (id, phone, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'admin', 1, NOW(), NOW())
     ON CONFLICT (phone)
     DO UPDATE SET
       role = 'admin',
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       updated_at = NOW()`,
    [randomUUID(), adminPhone, adminPasswordHash, "Администратор"]
  );
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await runSchemaInit(client);
    await seedServiceOptions(client);
    await seedPrintInventory(client);
    await seedServicePricingRules(client);
    await ensureAdminUser(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const initPromise = initDb().catch((error) => {
  console.error("Database initialization failed:", error);
  throw error;
});

async function query(sql, params = []) {
  await initPromise;
  const result = await pool.query(normalizeSql(sql), params);
  return {
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
  };
}

module.exports = { query, pool };
