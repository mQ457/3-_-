const { getConfig } = require("./config");

const MATERIAL_DENSITY_G_CM3 = {
  pla: 1.24,
  abs: 1.04,
  petg: 1.27,
  tpu: 1.2,
  nylon: 1.14,
  pa12: 1.01,
  pa11: 1.03,
  resin_standard: 1.12,
  resin_engineering: 1.15,
  resin_dental: 1.18,
  resin_jewelry: 1.2,
  resin_flexible: 1.1,
  steel316l: 7.9,
  alsi10mg: 2.67,
  ti6al4v: 4.43,
  powder_steel: 7.8,
  sand: 1.6,
  gypsum: 2.3,
  paper: 0.8,
  pvc: 1.38,
};

function estimatePackageWeightG({ modelVolumeCm3, materialCode, qty }) {
  const config = getConfig();
  const volume = Math.max(0, Number(modelVolumeCm3 || 0));
  const count = Math.max(1, Number(qty || 1));
  const code = String(materialCode || "").trim().toLowerCase();
  const density = MATERIAL_DENSITY_G_CM3[code] || config.defaultDensityGPerCm3;
  const raw = Math.ceil(volume * density * count + 50);
  return Math.min(config.maxWeightG, Math.max(config.minWeightG, raw));
}

module.exports = {
  estimatePackageWeightG,
  MATERIAL_DENSITY_G_CM3,
};
