(function () {
  const API_BASE = "/api";
  const LOGOUT_FLAG_KEY = "app.loggedOut";
  const USER_CACHE_KEY = "app.userCache";
  const USER_CACHE_TTL_MS = 5 * 60 * 1000;
  const PROTECTED_PATHS = new Set(["/profile.html", "/orders.html", "/delivery-address.html", "/payment.html"]);

  function setText(selectors, value, fallback) {
    selectors.forEach((selector) => {
      const nodeList = document.querySelectorAll(selector);
      nodeList.forEach((node) => {
        node.textContent = value || fallback;
      });
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Ошибка запроса");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function normalizeUser(rawUser) {
    if (!rawUser || typeof rawUser !== "object") return null;
    return {
      id: rawUser.id || "",
      role: rawUser.role || "user",
      fullName: rawUser.fullName || "",
      phone: rawUser.phone || "",
      email: rawUser.email || "",
    };
  }

  function applyUserToUi(user) {
    const safeUser = normalizeUser(user);
    if (!safeUser) return null;
    const displayName = safeUser.fullName || safeUser.phone || "Пользователь";
    setText(["#sidebar-name", ".side-user .name", "[data-user-name]"], displayName, "Пользователь");
    setText(["[data-user-phone]"], safeUser.phone || "", "");
    setText(["[data-user-email]"], safeUser.email || "", "");
    document.body.dataset.authRole = safeUser.role || "user";
    document.body.dataset.authUserId = safeUser.id || "";
    window.__APP_USER__ = safeUser;
    return safeUser;
  }

  function readUserCache() {
    try {
      const raw = sessionStorage.getItem(USER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const cachedAt = Number(parsed?.cachedAt || 0);
      const user = normalizeUser(parsed?.user);
      if (!user || !cachedAt) return null;
      return { user, cachedAt };
    } catch (_error) {
      return null;
    }
  }

  function clearUserCache() {
    try {
      sessionStorage.removeItem(USER_CACHE_KEY);
    } catch (_error) {
      // noop
    }
  }

  function setCachedUser(user) {
    const normalized = normalizeUser(user);
    if (!normalized) return null;
    applyUserToUi(normalized);
    try {
      sessionStorage.setItem(
        USER_CACHE_KEY,
        JSON.stringify({
          user: normalized,
          cachedAt: Date.now(),
        })
      );
    } catch (_error) {
      // noop
    }
    return normalized;
  }

  async function bootstrapUser() {
    try {
      const cached = readUserCache();
      if (cached && Date.now() - cached.cachedAt <= USER_CACHE_TTL_MS) {
        applyUserToUi(cached.user);
        try {
          sessionStorage.removeItem(LOGOUT_FLAG_KEY);
        } catch (_error) {
          // noop
        }
        return cached.user;
      }
      const data = await request("/auth/me");
      const user = setCachedUser(data.user || {});
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      return user;
    } catch (error) {
      if (error.status === 401) {
        window.__APP_USER__ = null;
        clearUserCache();
      }
      throw error;
    }
  }

  function isProtectedPage() {
    try {
      const path = (window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
      return PROTECTED_PATHS.has(path);
    } catch (_error) {
      return false;
    }
  }

  function redirectToLogin() {
    window.location.replace("login.html");
  }

  async function validateAuthForProtectedPage() {
    if (!isProtectedPage()) return;
    try {
      const forcedLogout = sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1";
      if (forcedLogout) {
        redirectToLogin();
        return;
      }
    } catch (_error) {
      // noop
    }
    try {
      await request("/auth/me", { method: "GET", cache: "no-store" });
    } catch (error) {
      if (error.status === 401) {
        redirectToLogin();
      }
    }
  }

  async function logoutAndRedirect() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (_error) {
      // noop
    } finally {
      window.__APP_USER__ = null;
      clearUserCache();
      try {
        sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
      } catch (_storageError) {
        // noop
      }
      redirectToLogin();
    }
  }

  function wireLogout() {
    const targets = document.querySelectorAll("#logout-btn, .side-exit");
    targets.forEach((node) => {
      node.addEventListener("click", logoutAndRedirect);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          logoutAndRedirect();
        }
      });
    });
  }

  window.AppBootstrap = {
    request,
    bootstrapUser,
    setCachedUser,
    wireLogout,
    logoutAndRedirect,
    validateAuthForProtectedPage,
  };

  window.addEventListener("pageshow", () => {
    validateAuthForProtectedPage();
  });
  validateAuthForProtectedPage();
})();
