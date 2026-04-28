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
    { type: "material", code: "tpu", name: "TPU", priceDelta: 700, sortOrder: 4 },
    { type: "material", code: "nylon", name: "Nylon", priceDelta: 900, sortOrder: 5 },
    { type: "material", code: "resin_standard", name: "Стандартная фотополимерная смола", priceDelta: 1200, sortOrder: 6 },
    { type: "material", code: "resin_engineering", name: "Инженерная смола", priceDelta: 1500, sortOrder: 7 },
    { type: "material", code: "resin_dental", name: "Стоматологическая смола", priceDelta: 1900, sortOrder: 8 },
    { type: "material", code: "resin_jewelry", name: "Ювелирная смола", priceDelta: 2100, sortOrder: 9 },
    { type: "material", code: "resin_flexible", name: "Гибкая смола", priceDelta: 1700, sortOrder: 10 },
    { type: "material", code: "pa12", name: "PA12", priceDelta: 1300, sortOrder: 11 },
    { type: "material", code: "pa11", name: "PA11", priceDelta: 1400, sortOrder: 12 },
    { type: "material", code: "tpi_powder", name: "TPI порошок", priceDelta: 1500, sortOrder: 13 },
    { type: "material", code: "pa_glass", name: "Стеклонаполненный полиамид", priceDelta: 1700, sortOrder: 14 },
    { type: "material", code: "pa_carbon", name: "Углеродонаполненный полиамид", priceDelta: 1900, sortOrder: 15 },
    { type: "material", code: "steel316l", name: "Нержавеющая сталь 316L", priceDelta: 2800, sortOrder: 16 },
    { type: "material", code: "alsi10mg", name: "Алюминий AlSi10Mg", priceDelta: 3000, sortOrder: 17 },
    { type: "material", code: "ti6al4v", name: "Титан Ti6Al4V", priceDelta: 3600, sortOrder: 18 },
    { type: "material", code: "cobalt_chrome", name: "Кобальт-хром", priceDelta: 3200, sortOrder: 19 },
    { type: "material", code: "inconel718", name: "Инконель 718", priceDelta: 3900, sortOrder: 20 },
    { type: "material", code: "powder_steel", name: "Металлический порошок (сталь)", priceDelta: 2500, sortOrder: 21 },
    { type: "material", code: "sand", name: "Песок", priceDelta: 700, sortOrder: 22 },
    { type: "material", code: "gypsum", name: "Гипс", priceDelta: 850, sortOrder: 23 },
    { type: "material", code: "powder_polymer", name: "Полимерный порошок", priceDelta: 1100, sortOrder: 24 },
    { type: "material", code: "photopolymer_multi", name: "Многокомпонентный фотополимер", priceDelta: 2300, sortOrder: 25 },
    { type: "material", code: "photopolymer_elastic", name: "Эластичный фотополимер", priceDelta: 2200, sortOrder: 26 },
    { type: "material", code: "photopolymer_transparent", name: "Прозрачный фотополимер", priceDelta: 2400, sortOrder: 27 },
    { type: "material", code: "photopolymer_biocompatible", name: "Биосовместимый фотополимер", priceDelta: 2700, sortOrder: 28 },
    { type: "material", code: "paper", name: "Бумага", priceDelta: 300, sortOrder: 29 },
    { type: "material", code: "pvc", name: "Пластик (PVC)", priceDelta: 800, sortOrder: 30 },
    { type: "material", code: "metal_foil", name: "Металлическая фольга", priceDelta: 1200, sortOrder: 31 },
    { type: "technology", code: "fdm", name: "FDM / FFF", priceDelta: 0, sortOrder: 1 },
    { type: "technology", code: "sla", name: "SLA", priceDelta: 1000, sortOrder: 2 },
    { type: "technology", code: "dlp", name: "DLP", priceDelta: 1100, sortOrder: 3 },
    { type: "technology", code: "lcd_msla", name: "LCD / MSLA", priceDelta: 1100, sortOrder: 4 },
    { type: "technology", code: "sls", name: "SLS", priceDelta: 1300, sortOrder: 5 },
    { type: "technology", code: "dmls_slm", name: "DMLS / SLM", priceDelta: 2200, sortOrder: 6 },
    { type: "technology", code: "binder_jetting", name: "Binder Jetting", priceDelta: 1600, sortOrder: 7 },
    { type: "technology", code: "material_jetting", name: "Material Jetting", priceDelta: 2000, sortOrder: 8 },
    { type: "technology", code: "lom", name: "LOM", priceDelta: 900, sortOrder: 9 },
    { type: "color", code: "red", name: "Красный", priceDelta: 120, sortOrder: 1 },
    { type: "color", code: "orange", name: "Оранжевый", priceDelta: 120, sortOrder: 2 },
    { type: "color", code: "yellow", name: "Желтый", priceDelta: 120, sortOrder: 3 },
    { type: "color", code: "green", name: "Зеленый", priceDelta: 120, sortOrder: 4 },
    { type: "color", code: "blue", name: "Синий", priceDelta: 120, sortOrder: 5 },
    { type: "color", code: "indigo", name: "Индиго", priceDelta: 120, sortOrder: 6 },
    { type: "color", code: "violet", name: "Фиолетовый", priceDelta: 120, sortOrder: 7 },
    { type: "color", code: "black", name: "Черный", priceDelta: 100, sortOrder: 8 },
    { type: "color", code: "white", name: "Белый", priceDelta: 80, sortOrder: 9 },
    { type: "color", code: "natural", name: "Не применяется", priceDelta: 0, sortOrder: 10 },
    { type: "thickness", code: "0.025", name: "0.025 мм", priceDelta: 700, sortOrder: 1 },
    { type: "thickness", code: "0.035", name: "0.035 мм", priceDelta: 650, sortOrder: 2 },
    { type: "thickness", code: "0.05", name: "0.05 мм", priceDelta: 600, sortOrder: 3 },
    { type: "thickness", code: "0.06", name: "0.06 мм", priceDelta: 560, sortOrder: 4 },
    { type: "thickness", code: "0.08", name: "0.08 мм", priceDelta: 520, sortOrder: 5 },
    { type: "thickness", code: "0.1", name: "0.1 мм", priceDelta: 500, sortOrder: 6 },
    { type: "thickness", code: "0.15", name: "0.15 мм", priceDelta: 300, sortOrder: 7 },
    { type: "thickness", code: "0.2", name: "0.2 мм", priceDelta: 180, sortOrder: 8 },
    { type: "thickness", code: "0.3", name: "0.3 мм", priceDelta: 0, sortOrder: 9 },
    { type: "thickness", code: "0.5", name: "0.5 мм", priceDelta: 0, sortOrder: 10 },
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
    { code: "fdm", name: "FDM / FFF", defaultSpeedCm3h: 24, sortOrder: 1 },
    { code: "sla", name: "SLA", defaultSpeedCm3h: 18, sortOrder: 2 },
    { code: "dlp", name: "DLP", defaultSpeedCm3h: 20, sortOrder: 3 },
    { code: "lcd_msla", name: "LCD / MSLA", defaultSpeedCm3h: 20, sortOrder: 4 },
    { code: "sls", name: "SLS", defaultSpeedCm3h: 16, sortOrder: 5 },
    { code: "dmls_slm", name: "DMLS / SLM", defaultSpeedCm3h: 10, sortOrder: 6 },
    { code: "binder_jetting", name: "Binder Jetting", defaultSpeedCm3h: 14, sortOrder: 7 },
    { code: "material_jetting", name: "Material Jetting", defaultSpeedCm3h: 22, sortOrder: 8 },
    { code: "lom", name: "LOM", defaultSpeedCm3h: 18, sortOrder: 9 },
  ];
  const colorDefs = [
    { code: "red", name: "Красный" },
    { code: "orange", name: "Оранжевый" },
    { code: "yellow", name: "Желтый" },
    { code: "green", name: "Зеленый" },
    { code: "blue", name: "Синий" },
    { code: "indigo", name: "Индиго" },
    { code: "violet", name: "Фиолетовый" },
    { code: "black", name: "Черный" },
    { code: "white", name: "Белый" },
    { code: "natural", name: "Не применяется" },
  ];
  const materialDefs = {
    pla: { name: "PLA", unit: "g", densityGcm3: 1.24, basePricePerCm3: 36, colorable: true },
    abs: { name: "ABS", unit: "g", densityGcm3: 1.05, basePricePerCm3: 44, colorable: true },
    petg: { name: "PETG", unit: "g", densityGcm3: 1.27, basePricePerCm3: 52, colorable: true },
    tpu: { name: "TPU", unit: "g", densityGcm3: 1.2, basePricePerCm3: 58, colorable: true },
    nylon: { name: "Nylon", unit: "g", densityGcm3: 1.15, basePricePerCm3: 64, colorable: true },
    resin_standard: { name: "Стандартная смола", unit: "ml", densityGcm3: 1.1, basePricePerCm3: 92, colorable: false },
    resin_engineering: { name: "Инженерная смола", unit: "ml", densityGcm3: 1.12, basePricePerCm3: 118, colorable: false },
    resin_dental: { name: "Стоматологическая смола", unit: "ml", densityGcm3: 1.13, basePricePerCm3: 132, colorable: false },
    resin_jewelry: { name: "Ювелирная смола", unit: "ml", densityGcm3: 1.14, basePricePerCm3: 140, colorable: false },
    resin_flexible: { name: "Гибкая смола", unit: "ml", densityGcm3: 1.08, basePricePerCm3: 126, colorable: false },
    pa12: { name: "PA12", unit: "g", densityGcm3: 1.01, basePricePerCm3: 82, colorable: false },
    pa11: { name: "PA11", unit: "g", densityGcm3: 1.03, basePricePerCm3: 86, colorable: false },
    tpi_powder: { name: "TPI порошок", unit: "g", densityGcm3: 1.02, basePricePerCm3: 90, colorable: false },
    pa_glass: { name: "Стеклонаполненный полиамид", unit: "g", densityGcm3: 1.18, basePricePerCm3: 98, colorable: false },
    pa_carbon: { name: "Углеродонаполненный полиамид", unit: "g", densityGcm3: 1.2, basePricePerCm3: 106, colorable: false },
    steel316l: { name: "Нерж. сталь 316L", unit: "g", densityGcm3: 7.9, basePricePerCm3: 240, colorable: false },
    alsi10mg: { name: "AlSi10Mg", unit: "g", densityGcm3: 2.65, basePricePerCm3: 260, colorable: false },
    ti6al4v: { name: "Ti6Al4V", unit: "g", densityGcm3: 4.43, basePricePerCm3: 320, colorable: false },
    cobalt_chrome: { name: "Кобальт-хром", unit: "g", densityGcm3: 8.3, basePricePerCm3: 300, colorable: false },
    inconel718: { name: "Инконель 718", unit: "g", densityGcm3: 8.19, basePricePerCm3: 340, colorable: false },
    powder_steel: { name: "Металл. порошок (сталь)", unit: "g", densityGcm3: 7.7, basePricePerCm3: 210, colorable: false },
    sand: { name: "Песок", unit: "g", densityGcm3: 1.6, basePricePerCm3: 42, colorable: false },
    gypsum: { name: "Гипс", unit: "g", densityGcm3: 2.3, basePricePerCm3: 52, colorable: false },
    powder_polymer: { name: "Полимерный порошок", unit: "g", densityGcm3: 1.12, basePricePerCm3: 74, colorable: false },
    photopolymer_multi: { name: "Многокомп. фотополимер", unit: "ml", densityGcm3: 1.11, basePricePerCm3: 152, colorable: true },
    photopolymer_elastic: { name: "Эластичный фотополимер", unit: "ml", densityGcm3: 1.08, basePricePerCm3: 144, colorable: true },
    photopolymer_transparent: { name: "Прозрачный фотополимер", unit: "ml", densityGcm3: 1.1, basePricePerCm3: 158, colorable: true },
    photopolymer_biocompatible: { name: "Биосовместимый фотополимер", unit: "ml", densityGcm3: 1.12, basePricePerCm3: 172, colorable: true },
    paper: { name: "Бумага", unit: "sheet", densityGcm3: 0.9, basePricePerCm3: 20, colorable: false },
    pvc: { name: "Пластик (PVC)", unit: "g", densityGcm3: 1.35, basePricePerCm3: 48, colorable: false },
    metal_foil: { name: "Металлическая фольга", unit: "sheet", densityGcm3: 2.7, basePricePerCm3: 66, colorable: false },
  };

  const techMaterialTemplates = [
    { tech: "fdm", materials: ["pla", "abs", "petg", "tpu", "nylon"], thicknesses: [0.05, 0.1, 0.2, 0.3, 0.5] },
    { tech: "sla", materials: ["resin_standard", "resin_engineering", "resin_dental", "resin_jewelry", "resin_flexible"], thicknesses: [0.025, 0.05, 0.1] },
    { tech: "dlp", materials: ["resin_standard", "resin_engineering", "resin_dental", "resin_flexible"], thicknesses: [0.035, 0.05, 0.1, 0.15] },
    { tech: "lcd_msla", materials: ["resin_standard", "resin_engineering", "resin_dental", "resin_flexible"], thicknesses: [0.035, 0.05, 0.1, 0.15] },
    { tech: "sls", materials: ["pa12", "pa11", "tpi_powder", "pa_glass", "pa_carbon"], thicknesses: [0.08, 0.1, 0.15, 0.2] },
    { tech: "dmls_slm", materials: ["steel316l", "alsi10mg", "ti6al4v", "cobalt_chrome", "inconel718"], thicknesses: [0.02, 0.03, 0.05, 0.1] },
    { tech: "binder_jetting", materials: ["powder_steel", "sand", "gypsum", "powder_polymer"], thicknesses: [0.1, 0.2, 0.3] },
    { tech: "material_jetting", materials: ["photopolymer_multi", "photopolymer_elastic", "photopolymer_transparent", "photopolymer_biocompatible"], thicknesses: [0.016, 0.02, 0.03, 0.04, 0.06] },
    { tech: "lom", materials: ["paper", "pvc", "metal_foil"], thicknesses: [0.06, 0.1, 0.2, 0.3] },
  ];

  const techPriceK = {
    fdm: 1.0,
    sla: 1.35,
    dlp: 1.3,
    lcd_msla: 1.25,
    sls: 1.55,
    dmls_slm: 2.6,
    binder_jetting: 1.8,
    material_jetting: 2.0,
    lom: 1.1,
  };
  const techStockK = { fdm: 1.2, sla: 1.0, dlp: 1.0, lcd_msla: 0.95, sls: 0.85, dmls_slm: 0.6, binder_jetting: 0.7, material_jetting: 0.8, lom: 0.9 };

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
  techMaterialTemplates.forEach((tpl) => {
    const tech = technologyDefs.find((item) => item.code === tpl.tech);
    if (!tech) return;
    tpl.materials.forEach((materialCode) => {
      const material = materialDefs[materialCode];
      if (!material) return;
      const variantColors = material.colorable ? colorDefs.filter((color) => color.code !== "natural") : colorDefs.filter((color) => color.code === "natural");
      variantColors.forEach((color) => {
        tpl.thicknesses.forEach((thickness) => {
          const thicknessDelta = thickness <= 0.05 ? 1.25 : thickness <= 0.1 ? 1.1 : thickness <= 0.2 ? 1.0 : 0.9;
          const price = Math.round(material.basePricePerCm3 * (techPriceK[tech.code] || 1) * thicknessDelta);
          const baseStock = Math.round(9000 * (techStockK[tech.code] || 1));
          rows.push({
            itemType: "material_variant",
            code: `${tech.code}-${materialCode}-${color.code}-${String(thickness).replace(".", "")}`,
            name: `${tech.name} ${material.name} ${color.name} ${thickness}мм`,
            technologyCode: tech.code,
            materialCode,
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
