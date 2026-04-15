(function () {
  const API_BASE = "/api";
  const LOGOUT_FLAG_KEY = "app.loggedOut";
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

  async function bootstrapUser() {
    try {
      const data = await request("/auth/me");
      const user = data.user || {};
      const displayName = user.fullName || user.phone || "Пользователь";

      setText(["#sidebar-name", ".side-user .name", "[data-user-name]"], displayName, "Пользователь");
      setText(["[data-user-phone]"], user.phone || "", "");
      setText(["[data-user-email]"], user.email || "", "");

      document.body.dataset.authRole = user.role || "user";
      document.body.dataset.authUserId = user.id || "";
      window.__APP_USER__ = user;
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      return user;
    } catch (error) {
      if (error.status === 401) {
        window.__APP_USER__ = null;
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
    wireLogout,
    logoutAndRedirect,
    validateAuthForProtectedPage,
  };

  window.addEventListener("pageshow", () => {
    validateAuthForProtectedPage();
  });
  validateAuthForProtectedPage();
})();
