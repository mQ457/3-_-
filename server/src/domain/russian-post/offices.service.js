const crypto = require("crypto");
const db = require("../../db");
const { pochtaRequest } = require("./http");

function extractOfficeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const keys = ["postoffices", "offices", "post-offices", "pasportelements", "data", "items"];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function readCoordinate(raw, latKeys, lngKeys) {
  for (const key of latKeys) {
    const value = raw?.[key];
    if (value != null && value !== "") {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function normalizeOffice(raw) {
  const postalCode = String(
    raw?.["postal-code"] || raw?.postalCode || raw?.index || raw?.postal_code || raw?.postalCode || ""
  ).trim();
  const address = String(
    raw?.address || raw?.["address-source"] || raw?.["address-source"] || raw?.location || raw?.["address-guid"] || ""
  ).trim();
  const city = String(raw?.settlement || raw?.city || raw?.region || raw?.area || "").trim();
  const lat =
    readCoordinate(raw, ["latitude", "lat", "geo-lat", "geoLat", "y"]) ??
    readCoordinate(raw?.location, ["latitude", "lat"]) ??
    readCoordinate(raw?.coordinates, ["latitude", "lat"]);
  const lng =
    readCoordinate(raw, ["longitude", "lng", "geo-lon", "geoLon", "x"]) ??
    readCoordinate(raw?.location, ["longitude", "lng"]) ??
    readCoordinate(raw?.coordinates, ["longitude", "lng"]);
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

async function searchOfficesByAddress(address, top = 50) {
  const queryAddress = String(address || "").trim();
  if (!queryAddress) return [];
  const encoded = encodeURIComponent(queryAddress);
  const payload = await pochtaRequest(`/postoffice/1.0/by-address?address=${encoded}&top=${top}`);
  const list = extractOfficeList(payload);
  const offices = list.map(normalizeOffice).filter((item) => item.postalCode);
  await cacheOffices(offices, queryAddress);
  return offices;
}

async function searchOfficesNearby(lat, lng, top = 50) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const payload = await pochtaRequest(
    `/postoffice/1.0/nearby?latitude=${latitude}&longitude=${longitude}&top=${top}`
  );
  const list = extractOfficeList(payload);
  const offices = list.map(normalizeOffice).filter((item) => item.postalCode);
  await cacheOffices(offices, `${latitude},${longitude}`);
  return offices;
}

function mergeOffices(...lists) {
  const map = new Map();
  lists.flat().forEach((office) => {
    if (!office?.postalCode) return;
    const prev = map.get(office.postalCode);
    if (!prev) {
      map.set(office.postalCode, office);
      return;
    }
    if ((prev.lat == null || prev.lng == null) && office.lat != null && office.lng != null) {
      map.set(office.postalCode, { ...prev, lat: office.lat, lng: office.lng });
    }
  });
  return Array.from(map.values());
}

async function searchOffices(city, options = {}) {
  const queryCity = String(city || "").trim();
  const lat = options.lat != null ? Number(options.lat) : null;
  const lng = options.lng != null ? Number(options.lng) : null;
  const collected = [];

  const addressQueries = [queryCity, `${queryCity}, Россия`].filter(Boolean);
  for (const address of addressQueries) {
    try {
      const live = await searchOfficesByAddress(address);
      if (live.length) collected.push(...live);
    } catch (error) {
      console.warn("[pochta] offices by-address failed:", address, error.message);
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const nearby = await searchOfficesNearby(lat, lng);
      if (nearby.length) collected.push(...nearby);
    } catch (error) {
      console.warn("[pochta] offices nearby failed:", error.message);
    }
  }

  const merged = mergeOffices(collected);
  if (merged.length) return merged;

  return searchOfficesFromCache(queryCity);
}

module.exports = {
  searchOffices,
  searchOfficesByAddress,
  searchOfficesNearby,
  normalizeOffice,
};
