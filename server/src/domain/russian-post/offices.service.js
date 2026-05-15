const crypto = require("crypto");
const db = require("../../db");
const { pochtaRequest } = require("./http");

function normalizeOffice(raw) {
  const postalCode = String(raw?.["postal-code"] || raw?.postalCode || raw?.index || raw?.postal_code || "").trim();
  const address = String(raw?.address || raw?.["address-source"] || raw?.location || "").trim();
  const city = String(raw?.settlement || raw?.city || raw?.region || "").trim();
  const lat = Number(raw?.latitude ?? raw?.lat);
  const lng = Number(raw?.longitude ?? raw?.longitude ?? raw?.lng);
  const officeType = String(raw?.type || raw?.["type-code"] || "OPS").trim();
  const workTime = String(raw?.["working-hours"] || raw?.workTime || "").trim();
  return {
    id: postalCode || crypto.randomUUID(),
    postalCode,
    address: address || city,
    city,
    region: String(raw?.region || "").trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    officeType,
    workTime,
    officeCode: postalCode,
    label: [postalCode, address].filter(Boolean).join(" — "),
  };
}

async function cacheOffices(offices, city) {
  for (const office of offices) {
    if (!office.postalCode) continue;
    await db.query(
      `INSERT INTO post_offices_cache (id, postal_code, address, city, region, lat, lng, office_type, work_time, meta_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (id) DO UPDATE SET
         postal_code = EXCLUDED.postal_code,
         address = EXCLUDED.address,
         city = EXCLUDED.city,
         region = EXCLUDED.region,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         office_type = EXCLUDED.office_type,
         work_time = EXCLUDED.work_time,
         meta_json = EXCLUDED.meta_json,
         updated_at = NOW()`,
      [
        office.id,
        office.postalCode,
        office.address,
        city || office.city,
        office.region,
        office.lat,
        office.lng,
        office.officeType,
        office.workTime,
        JSON.stringify(office),
      ]
    );
  }
}

async function searchOfficesFromCache(city, limit = 80) {
  const pattern = `%${String(city || "").trim()}%`;
  const result = await db.query(
    `SELECT postal_code, address, city, region, lat, lng, office_type, work_time, meta_json
     FROM post_offices_cache
     WHERE city ILIKE $1 OR address ILIKE $1 OR region ILIKE $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [pattern, limit]
  );
  return result.rows.map((row) => {
    try {
      const parsed = row.meta_json ? JSON.parse(row.meta_json) : null;
      if (parsed?.postalCode) return parsed;
    } catch {
      // ignore
    }
    return normalizeOffice({
      "postal-code": row.postal_code,
      address: row.address,
      settlement: row.city,
      region: row.region,
      latitude: row.lat,
      longitude: row.lng,
      type: row.office_type,
      "working-hours": row.work_time,
    });
  });
}

async function searchOfficesByAddress(city, top = 50) {
  const queryCity = String(city || "").trim();
  if (!queryCity) return [];
  const encoded = encodeURIComponent(queryCity);
  const payload = await pochtaRequest(`/postoffice/1.0/by-address?address=${encoded}&top=${top}`);
  const list = Array.isArray(payload) ? payload : payload?.postoffices || payload?.offices || [];
  const offices = list.map(normalizeOffice).filter((item) => item.postalCode);
  await cacheOffices(offices, queryCity);
  return offices;
}

async function searchOffices(city) {
  try {
    const live = await searchOfficesByAddress(city);
    if (live.length) return live;
  } catch (error) {
    console.warn("[pochta] offices live search failed:", error.message);
  }
  return searchOfficesFromCache(city);
}

module.exports = {
  searchOffices,
  normalizeOffice,
};
