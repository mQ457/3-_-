const { getConfig } = require("./russian-post/config");

async function geocodeWithYandex(city) {
  const apiKey = getConfig().yandexMapsApiKey;
  if (!apiKey) return null;
  const query = encodeURIComponent(`${String(city || "").trim()}, Россия`);
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(apiKey)}&geocode=${query}&format=json&lang=ru_RU&results=1`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = await response.json();
  const member = payload?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
  const pos = String(member?.Point?.pos || "").trim();
  if (!pos) return null;
  const [lng, lat] = pos.split(/\s+/).map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, source: "yandex" };
}

async function geocodeWithNominatim(city) {
  const query = encodeURIComponent(`${String(city || "").trim()}, Россия`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ru`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "print-service-3d/1.0 (delivery-city-geocode)",
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const list = await response.json();
  const first = Array.isArray(list) ? list[0] : null;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, source: "nominatim" };
}

async function resolveCityCenterInRussia(city) {
  const normalized = String(city || "").trim();
  if (!normalized) return null;
  try {
    const yandex = await geocodeWithYandex(normalized);
    if (yandex) return yandex;
  } catch (error) {
    console.warn("[geocode] yandex failed:", error.message);
  }
  try {
    const nominatim = await geocodeWithNominatim(normalized);
    if (nominatim) return nominatim;
  } catch (error) {
    console.warn("[geocode] nominatim failed:", error.message);
  }
  return null;
}

module.exports = {
  resolveCityCenterInRussia,
};
