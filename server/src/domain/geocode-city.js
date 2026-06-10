const { getConfig } = require("./russian-post/config");

function normalizeAddressText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;]+/g, " ")
    .trim();
}

function buildAddressQueries(address, city) {
  const queries = [];
  const seen = new Set();
  const baseAddress = normalizeAddressText(address);
  const normalizedCity = normalizeAddressText(city);

  const variants = [];
  if (baseAddress) {
    variants.push(baseAddress);
    variants.push(baseAddress.replace(/^(ул\.?|улица|пр\.?|проспект|пр-кт|пер\.?|переулок|б-р|бульвар|наб\.?|набережная|ш\.?|шоссе)\s+/i, ""));
    variants.push(baseAddress.replace(/(\D)\s+(\d)/, "$1, $2"));
    variants.push(baseAddress.replace(/(\d)\s+([а-я])/i, "$1, $2"));
    const tokens = baseAddress.split(" ").filter(Boolean);
    const lastToken = tokens[tokens.length - 1];
    if (tokens.length > 1 && /\d/.test(lastToken)) {
      const street = tokens.slice(0, -1).join(" ");
      if (street) {
        variants.push(`${street}, ${lastToken}`);
        variants.push(`${street} ${lastToken}`);
        variants.push(`ул ${street}, ${lastToken}`);
        variants.push(`улица ${street}, ${lastToken}`);
      }
    }
  }

  const addressVariants = [...new Set(variants.filter(Boolean))];
  const withCity = [];
  const withoutCity = [];

  addressVariants.forEach((variant) => {
    if (normalizedCity) {
      [
        `Россия, ${normalizedCity}, ${variant}`,
        `${normalizedCity}, ${variant}`,
        `${variant}, ${normalizedCity}`,
        `${normalizedCity}, ${variant}, Россия`,
      ].forEach((query) => {
        const cleanedQuery = normalizeAddressText(query);
        if (cleanedQuery && !seen.has(cleanedQuery.toLowerCase())) {
          seen.add(cleanedQuery.toLowerCase());
          withCity.push(cleanedQuery);
        }
      });
    }
    [variant, `${variant}, Россия`, `Россия, ${variant}`].forEach((query) => {
      const cleanedQuery = normalizeAddressText(query);
      if (cleanedQuery && !seen.has(cleanedQuery.toLowerCase())) {
        seen.add(cleanedQuery.toLowerCase());
        withoutCity.push(cleanedQuery);
      }
    });
  });

  if (normalizedCity) {
    queries.push(...withCity, ...withoutCity);
  } else {
    queries.push(...withoutCity);
  }

  if (!queries.length && baseAddress) {
    queries.push(baseAddress);
  }
  return queries;
}

function parseYandexGeoObject(geoObject) {
  const pos = String(geoObject?.Point?.pos || "").trim();
  if (!pos) return null;
  const [lng, lat] = pos.split(/\s+/).map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const meta = geoObject?.metaDataProperty?.GeocoderMetaData || {};
  const addressLine = String(meta?.text || geoObject?.name || "").trim();
  const components = meta?.Address?.Components;
  let city = "";
  if (Array.isArray(components)) {
    const locality = components.find((item) => item.kind === "locality");
    city = locality?.name || "";
  }
  if (!city || /федеральный округ/i.test(city)) {
    const fromLine = addressLine.match(/Россия,\s*([^,]+),/i);
    if (fromLine?.[1]) city = fromLine[1].trim();
  }
  return {
    lat,
    lng,
    address: addressLine,
    city,
    kind: String(meta?.kind || "").trim(),
    source: "yandex",
  };
}

function citiesMatch(expectedCity, actualCity) {
  const expected = normalizeAddressText(expectedCity).toLowerCase();
  const actual = normalizeAddressText(actualCity).toLowerCase();
  if (!expected || !actual) return false;
  return actual.includes(expected) || expected.includes(actual);
}

function scoreAddressMatch(item, address, city) {
  const normalizedLine = normalizeAddressText(item.address || "");
  const normalizedAddress = normalizeAddressText(address);
  const normalizedCity = normalizeAddressText(city);
  const normalizedParsedCity = normalizeAddressText(item.city || "");
  const addressTokens = normalizedAddress.split(" ").filter(Boolean);
  let score = 0;

  if (normalizedLine.includes(normalizedAddress)) score += 25;
  if (addressTokens.some((token) => normalizedLine.includes(token))) score += 8;
  if (normalizedCity) {
    const cityInLine = normalizedLine.toLowerCase().includes(normalizedCity.toLowerCase());
    if (citiesMatch(normalizedCity, normalizedParsedCity) || cityInLine) score += 20;
    else score -= 40;
  }
  if (item.kind === "house") score += 15;
  if (normalizedLine.includes("Россия")) score += 5;
  return score;
}

async function fetchYandexGeocode(query, results = 5) {
  const apiKey = getConfig().yandexMapsApiKey;
  if (!apiKey) return [];
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(apiKey)}&geocode=${encodeURIComponent(query)}&format=json&lang=ru_RU&results=${results}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Геокодер Яндекса вернул ошибку ${response.status}`);
  }
  const payload = await response.json();
  const members = payload?.response?.GeoObjectCollection?.featureMember || [];
  return members
    .map((row) => parseYandexGeoObject(row?.GeoObject))
    .filter(Boolean);
}

async function geocodeWithYandex(city) {
  const items = await fetchYandexGeocode(`${String(city || "").trim()}, Россия`, 1);
  const first = items[0];
  if (!first) return null;
  return { lat: first.lat, lng: first.lng, source: "yandex" };
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

async function resolveAddressInRussia(address, city) {
  const normalizedAddress = String(address || "").trim();
  const normalizedCity = String(city || "").trim();
  if (!normalizedAddress) return null;

  const queries = buildAddressQueries(normalizedAddress, normalizedCity);
  let bestMatch = null;
  let bestScore = -Infinity;

  for (const query of queries) {
    let items = [];
    try {
      items = await fetchYandexGeocode(query, 5);
    } catch (error) {
      console.warn("[geocode] address query failed:", query, error.message);
      continue;
    }

    for (const item of items) {
      const score = scoreAddressMatch(item, normalizedAddress, normalizedCity);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && bestScore >= 20) {
      break;
    }
  }

  if (!bestMatch || bestScore < 5) return null;
  return {
    lat: bestMatch.lat,
    lng: bestMatch.lng,
    address: bestMatch.address || normalizedAddress,
    city: normalizedCity || bestMatch.city,
    source: bestMatch.source,
  };
}

async function resolveReverseGeocodeInRussia(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    const items = await fetchYandexGeocode(`${longitude},${latitude}`, 1);
    const first = items[0];
    if (!first) return null;
    return {
      lat: first.lat,
      lng: first.lng,
      address: first.address,
      city: first.city,
      source: first.source,
    };
  } catch (error) {
    console.warn("[geocode] reverse failed:", error.message);
    return null;
  }
}

module.exports = {
  resolveCityCenterInRussia,
  resolveAddressInRussia,
  resolveReverseGeocodeInRussia,
};
