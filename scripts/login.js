(function () {
  const API_BASE = "/api";
  const loginPanel = document.getElementById("login-panel");
  const registerPanel = document.getElementById("register-panel");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginPhoneInput = loginForm?.elements?.phone;
  const registerPhoneInput = registerForm?.elements?.phone;
  const loginPasswordInput = loginForm?.elements?.password;
  const registerPasswordInput = registerForm?.elements?.password;
  const loginPasswordPeekBtn = document.getElementById("login-password-peek-btn");
  const registerPasswordPeekBtn = document.getElementById("register-password-peek-btn");
  const goRegisterBtn = document.getElementById("go-register-btn");
  const backToLoginBtn = document.getElementById("back-to-login-btn");
  const loginStatusEl = document.getElementById("login-status");
  const registerStatusEl = document.getElementById("register-status");
  const LOGOUT_FLAG_KEY = "app.loggedOut";
  const POST_LOGIN_REDIRECT_KEY = "app.postLoginRedirect";
  const registerConsentEl = document.getElementById("policy-consent");
  const ALLOWED_REDIRECTS = new Set([
    "checkout.html",
    "profile.html",
    "orders.html",
    "delivery-address.html",
    "payment.html",
    "admin.html",
  ]);

  function setStatus(target, message, isError) {
    if (!target) return;
    target.textContent = message || "";
    target.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function request(path, method, payload) {
    const options = {
      method,
      credentials: "include",
      cache: "no-store",
    };
    if (method !== "GET") {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(payload || {});
    }
    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Ошибка запроса");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function getPayload(formNode) {
    const formData = new FormData(formNode);
    return {
      phone: normalizePhoneInput(formData.get("phone")),
      password: String(formData.get("password") || ""),
      lastName: String(formData.get("lastName") || "").trim(),
      firstName: String(formData.get("firstName") || "").trim(),
      middleName: String(formData.get("middleName") || "").trim(),
      email: String(formData.get("email") || "").trim(),
    };
  }

  function normalizePhoneInput(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function setupPhoneInput(input) {
    if (!input) return;
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "tel");
    input.setAttribute("pattern", "^[+]?[0-9]{10,15}$");
    input.maxLength = 16;
    input.addEventListener("input", () => {
      input.value = normalizePhoneInput(input.value);
    });
  }

  function setupPasswordPeek(passwordInput, passwordPeekBtn) {
    if (!passwordInput || !passwordPeekBtn) return;
    const showPassword = () => {
      passwordInput.type = "text";
    };
    const hidePassword = () => {
      passwordInput.type = "password";
    };

    passwordPeekBtn.addEventListener("mousedown", showPassword);
    passwordPeekBtn.addEventListener("mouseup", hidePassword);
    passwordPeekBtn.addEventListener("mouseleave", hidePassword);
    passwordPeekBtn.addEventListener("touchstart", (event) => {
      event.preventDefault();
      showPassword();
    }, { passive: false });
    passwordPeekBtn.addEventListener("touchend", hidePassword);
    passwordPeekBtn.addEventListener("touchcancel", hidePassword);
    passwordPeekBtn.addEventListener("blur", hidePassword);
  }

  function isValidPhone(value) {
    return /^[+]?\d{10,15}$/.test(String(value || ""));
  }

  function sanitizeRedirect(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/^\//, "");
    if (!ALLOWED_REDIRECTS.has(normalized)) return "";
    return normalized;
  }

  function consumePostAuthTarget(role) {
    let target = "";
    try {
      const queryTarget = new URLSearchParams(window.location.search).get("next");
      const storedTarget = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      target = sanitizeRedirect(queryTarget) || sanitizeRedirect(storedTarget);
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    } catch (_error) {
      target = "";
    }

    if (role === "admin") {
      return "admin.html";
    }
    return target || "profile.html";
  }

  function validateCredentials(payload) {
    if (!isValidPhone(payload.phone)) {
      return "Введите номер телефона в формате +79991234567 или 79991234567.";
    }
    if (String(payload.password || "").length < 6) {
      return "Пароль должен содержать минимум 6 символов.";
    }
    return "";
  }

  function validateLogin(payload) {
    const credentialError = validateCredentials(payload);
    if (credentialError) {
      setStatus(loginStatusEl, credentialError, true);
      return false;
    }
    return true;
  }

  function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateRegisterProfile(payload) {
    const credentialError = validateCredentials(payload);
    if (credentialError) {
      setStatus(registerStatusEl, credentialError, true);
      return false;
    }
    if (!payload.lastName || !payload.firstName || !payload.middleName) {
      setStatus(registerStatusEl, "Заполните Фамилию, Имя и Отчество.", true);
      return false;
    }
    if (!isValidEmail(payload.email)) {
      setStatus(registerStatusEl, "Введите корректный email.", true);
      return false;
    }
    return true;
  }

  function showLoginPanel() {
    if (loginPanel) loginPanel.style.display = "block";
    if (registerPanel) registerPanel.style.display = "none";
    setStatus(loginStatusEl, "", false);
    setStatus(registerStatusEl, "", false);
  }

  function showRegisterPanel() {
    if (loginPanel) loginPanel.style.display = "none";
    if (registerPanel) registerPanel.style.display = "block";
    setStatus(loginStatusEl, "", false);
    setStatus(registerStatusEl, "", false);
  }

  function hasConsent() {
    if (registerConsentEl?.checked) return true;
    setStatus(registerStatusEl, "Подтвердите согласие на обработку персональных данных.", true);
    return false;
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = getPayload(loginForm);
    if (!validateLogin(payload)) return;
    setStatus(loginStatusEl, "Выполняется вход...", false);
    try {
      const data = await request("/auth/login", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      setStatus(loginStatusEl, "Успешный вход. Переходим...", false);
      setTimeout(() => {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      }, 300);
    } catch (error) {
      setStatus(loginStatusEl, error.message, true);
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasConsent()) return;
    const payload = getPayload(registerForm);
    if (!validateRegisterProfile(payload)) return;
    setStatus(registerStatusEl, "Создаём аккаунт...", false);
    try {
      const data = await request("/auth/register", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      setStatus(registerStatusEl, "Аккаунт создан. Переходим дальше...", false);
      setTimeout(() => {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      }, 300);
    } catch (error) {
      setStatus(registerStatusEl, error.message, true);
    }
  });

  goRegisterBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    showRegisterPanel();
  });

  backToLoginBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    showLoginPanel();
  });

  request("/auth/me", "GET")
    .then((data) => {
      window.location.href = consumePostAuthTarget(data?.user?.role);
    })
    .catch(() => {});

  setupPhoneInput(loginPhoneInput);
  setupPhoneInput(registerPhoneInput);
  setupPasswordPeek(loginPasswordInput, loginPasswordPeekBtn);
  setupPasswordPeek(registerPasswordInput, registerPasswordPeekBtn);
  showLoginPanel();
})();
