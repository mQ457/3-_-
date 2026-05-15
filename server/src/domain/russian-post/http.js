const { getConfig } = require("./config");

function buildUserAuthHeader(rawValue) {
  let value = String(rawValue || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  value = value.replace(/^basic\s+/i, "").trim();
  if (!value) return "";
  if (value.includes(":")) {
    return `Basic ${Buffer.from(value, "utf8").toString("base64")}`;
  }
  return `Basic ${value}`;
}

async function pochtaRequest(pathname, options = {}) {
  const config = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `AccessToken ${config.token}`,
    "X-User-Authorization": buildUserAuthHeader(config.userAuth),
    ...(options.headers || {}),
  };
  const url = `${config.baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const contentType = String(response.headers.get("content-type") || "");
    let payload = null;
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    } else {
      const text = await response.text();
      payload = text || null;
    }
    if (!response.ok) {
      const message =
        (payload && typeof payload === "object" && (payload.message || payload.error || payload.desc)) ||
        (typeof payload === "string" ? payload : "") ||
        `HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  pochtaRequest,
  buildUserAuthHeader,
};
