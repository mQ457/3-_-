(function () {
  const API_BASE = "/api";
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const showRegisterBtn = document.getElementById("show-register-btn");
  const showLoginBtn = document.getElementById("show-login-btn");
  const loginStatusEl = document.getElementById("login-status");
  const registerStatusEl = document.getElementById("register-status");
  const LOGOUT_FLAG_KEY = "app.loggedOut";
  const POST_LOGIN_REDIRECT_KEY = "app.postLoginRedirect";
  const consentEl = document.getElementById("policy-consent");
  let authMode = "login";
  const ALLOWED_REDIRECTS = new Set([
    "checkout.html",
    "profile.html",
    "orders.html",
    "delivery-address.html",
    "payment.html",
    "print-step-1.html",
    "print-step-2.html",
    "print-step-3.html",
    "admin.html",
  ]);

  function setStatus(message, isError, mode = authMode) {
    const statusEl = mode === "register" ? registerStatusEl : loginStatusEl;
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function request(path, method, payload) {
    const options = {
      method,
      credentials: "include",
      headers: {},
    };
    if (payload !== undefined && method !== "GET" && method !== "HEAD") {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(payload);
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

  function getCredentialsPayload(form) {
    const formData = new FormData(form);
    return {
      phone: normalizePhoneInput(formData.get("phone")),
      password: String(formData.get("password") || ""),
    };
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function getRegistrationPayload() {
    const formData = new FormData(registerForm);
    const lastName = normalizeName(formData.get("lastName"));
    const firstName = normalizeName(formData.get("firstName"));
    const middleName = normalizeName(formData.get("middleName"));
    return {
      ...getCredentialsPayload(registerForm),
      lastName,
      firstName,
      middleName,
      fullName: [lastName, firstName, middleName].filter(Boolean).join(" "),
    };
  }

  function normalizePhoneInput(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function normalizeRussianPhone(value) {
    const raw = normalizePhoneInput(value);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
    if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
    if (digits.length === 10) return `+7${digits}`;
    if (raw.startsWith("+")) return `+${digits}`;
    return digits ? `+${digits}` : "";
  }

  function setupPhoneInput() {
    document.querySelectorAll('#login-form input[name="phone"], #register-form input[name="phone"]').forEach((phoneInput) => {
      phoneInput.setAttribute("inputmode", "numeric");
      phoneInput.setAttribute("autocomplete", "tel");
      phoneInput.setAttribute("pattern", "^[+]?[0-9]{10,15}$");
      phoneInput.maxLength = 16;
      phoneInput.addEventListener("input", () => {
        phoneInput.value = normalizePhoneInput(phoneInput.value);
      });
    });
  }

  function isValidPhone(value) {
    return /^\+7\d{10}$/.test(normalizeRussianPhone(value));
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
    if (target === "admin.html") {
      const error = new Error("У этого аккаунта нет прав администратора.");
      error.code = "ADMIN_FORBIDDEN";
      throw error;
    }
    return target || "profile.html";
  }

  function setFormDisabled(form, disabled) {
    if (!form) return;
    Array.from(form.elements || []).forEach((element) => {
      element.disabled = disabled;
    });
  }

  function setAuthMode(nextMode, options = {}) {
    authMode = nextMode === "register" ? "register" : "login";
    document.body.dataset.authMode = authMode;
    setFormDisabled(loginForm, authMode !== "login");
    setFormDisabled(registerForm, authMode !== "register");
    if (registerForm) {
      ["lastName", "firstName"].forEach((name) => {
        if (registerForm.elements?.[name]) registerForm.elements[name].required = true;
      });
    }
    if (consentEl) consentEl.required = true;
    if (!options.keepStatus) {
      setStatus("", false, "login");
      setStatus("", false, "register");
    }
  }

  function validateCredentials(payload) {
    if (!isValidPhone(payload.phone)) {
      setStatus("Введите российский номер: +79991234567, 79991234567 или 89991234567.", true);
      return false;
    }
    payload.phone = normalizeRussianPhone(payload.phone);
    if (String(payload.password || "").length < 6) {
      setStatus("Пароль должен содержать минимум 6 символов.", true);
      return false;
    }
    return true;
  }

  function validateRegistration(payload) {
    if (!payload.lastName || !payload.firstName) {
      setStatus("Введите фамилию и имя.", true);
      return false;
    }
    if (payload.fullName.length < 3) {
      setStatus("Проверьте ФИО: имя слишком короткое.", true);
      return false;
    }
    return validateCredentials(payload) && hasConsent();
  }

  function hasConsent() {
    if (consentEl?.checked) return true;
    setStatus("Подтвердите согласие на обработку персональных данных.", true);
    return false;
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = getCredentialsPayload(loginForm);
    if (!validateCredentials(payload)) return;
    setStatus("Выполняется вход...", false, "login");
    try {
      const data = await request("/auth/login", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {

      }
      setStatus("Успешный вход. Переходим...", false, "login");
      try {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      } catch (redirectError) {
        setStatus(redirectError.message || "Нет доступа.", true, "login");
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = getRegistrationPayload();
    if (!validateRegistration(payload)) return;
    setStatus("Создаём аккаунт...", false, "register");
    try {
      const data = await request("/auth/register", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {

      }
      setStatus("Аккаунт создан. Переходим дальше...", false, "register");
      try {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      } catch (redirectError) {
        setStatus(redirectError.message || "Нет доступа.", true, "register");
      }
    } catch (error) {
      setStatus(error.message, true, "register");
    }
  });

  showRegisterBtn?.addEventListener("click", () => {
    setAuthMode("register");
  });

  showLoginBtn?.addEventListener("click", () => {
    setAuthMode("login");
  });

  request("/auth/me", "GET")
    .then((data) => {
      try {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      } catch (error) {
        setStatus(error.message || "Нет доступа.", true, "login");
      }
    })
    .catch(() => {});

  setupPhoneInput();
  setAuthMode(new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login", { keepStatus: true });
})();
