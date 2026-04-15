(function () {
  const API_BASE = "/api";
  const form = document.getElementById("auth-form");
  const registerBtn = document.getElementById("register-btn");
  const statusEl = document.getElementById("auth-status");
  const LOGOUT_FLAG_KEY = "app.loggedOut";
  const consentEl = document.getElementById("policy-consent");

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function request(path, method, payload) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Ошибка запроса");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function getPayload() {
    const formData = new FormData(form);
    return {
      phone: String(formData.get("phone") || "").trim(),
      password: String(formData.get("password") || ""),
    };
  }

  function hasConsent() {
    if (consentEl?.checked) return true;
    setStatus("Подтвердите согласие на обработку персональных данных.", true);
    return false;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasConsent()) return;
    setStatus("Выполняется вход...", false);
    try {
      const payload = getPayload();
      const data = await request("/auth/login", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      setStatus("Успешный вход. Переходим...", false);
      setTimeout(() => {
        window.location.href = data?.user?.role === "admin" ? "admin.html" : "profile.html";
      }, 300);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  registerBtn?.addEventListener("click", async () => {
    if (!hasConsent()) return;
    setStatus("Создаём аккаунт...", false);
    try {
      const payload = getPayload();
      await request("/auth/register", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      setStatus("Аккаунт создан. Переходим в профиль...", false);
      setTimeout(() => {
        window.location.href = "profile.html";
      }, 300);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  request("/auth/me", "GET")
    .then((data) => {
      if (data?.user?.role === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "profile.html";
      }
    })
    .catch(() => {});
})();
