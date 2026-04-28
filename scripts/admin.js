(function () {
  const loginBlock = document.getElementById("admin-login");
  const appBlock = document.getElementById("admin-app");
  const loginForm = document.getElementById("admin-login-form");
  const loginStatus = document.getElementById("admin-login-status");
  const phoneInput = loginForm?.elements?.phone;
  const statsRoot = document.getElementById("dashboard-stats");
  const ordersRoot = document.getElementById("dashboard-orders");
  const refreshBtn = document.getElementById("refresh-dashboard");
  const directorEmailInput = document.getElementById("dashboard-director-email-input");
  const directorEmailSaveBtn = document.getElementById("dashboard-director-email-save");
  const directorReportSendBtn = document.getElementById("dashboard-director-report-send");
  const directorReportDaysInput = document.getElementById("dashboard-director-report-days");
  const directorEmailStatus = document.getElementById("dashboard-director-email-status");
  const API = window.AdminCommon;
  let reportCooldownUntil = 0;

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("ru-RU");
  }

  function normalizePhone(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function setupPhoneValidation() {
    if (!phoneInput) return;
    phoneInput.setAttribute("inputmode", "numeric");
    phoneInput.setAttribute("pattern", "^[+]?[0-9]{10,15}$");
    phoneInput.maxLength = 16;
    phoneInput.addEventListener("input", () => {
      phoneInput.value = normalizePhone(phoneInput.value);
    });
  }

  function setEmailStatus(message, isError = false) {
    if (!directorEmailStatus) return;
    directorEmailStatus.textContent = message || "";
    directorEmailStatus.style.color = isError ? "#ff7676" : "#16a34a";
  }

  function updateReportButtonState() {
    if (!directorReportSendBtn) return;
    const leftMs = Math.max(0, reportCooldownUntil - Date.now());
    if (!leftMs) {
      directorReportSendBtn.disabled = false;
      directorReportSendBtn.textContent = "Отправить отчет директору";
      return;
    }
    directorReportSendBtn.disabled = true;
    directorReportSendBtn.textContent = `Повтор через ${Math.ceil(leftMs / 1000)}с`;
  }

  function pulseButton(button) {
    if (!button) return;
    button.classList.add("is-pressed");
    setTimeout(() => button.classList.remove("is-pressed"), 140);
  }

  async function runWithButtonFeedback(button, loadingText, action) {
    if (!button) return action();
    const originalText = button.textContent;
    pulseButton(button);
    button.classList.add("is-busy");
    button.disabled = true;
    if (loadingText) button.textContent = loadingText;
    try {
      return await action();
    } finally {
      button.classList.remove("is-busy");
      if (reportCooldownUntil <= Date.now() || button !== directorReportSendBtn) {
        button.disabled = false;
      }
      button.textContent = originalText;
    }
  }

  async function loadEmailSettings() {
    const data = await API.request("/admin/email-settings");
    if (directorEmailInput) {
      directorEmailInput.value = data.directorEmail || "";
    }
  }

  async function renderDashboard() {
    const [dashboard, orders] = await Promise.all([API.request("/admin/dashboard"), API.request("/admin/orders")]);
    statsRoot.innerHTML = `
      <div class="stat"><div class="label">Пользователи</div><div class="value">${dashboard.totalUsers}</div></div>
      <div class="stat"><div class="label">Заказы</div><div class="value">${dashboard.totalOrders}</div></div>
      <div class="stat"><div class="label">Открытых чатов</div><div class="value">${dashboard.openThreads}</div></div>
      <div class="stat"><div class="label">Обновлено</div><div class="value">${new Date().toLocaleTimeString("ru-RU")}</div></div>
    `;
    ordersRoot.innerHTML = (orders.orders || [])
      .slice(0, 12)
      .map(
        (order) => `
      <tr>
        <td>${order.orderNumber || order.id.slice(0, 8)}</td>
        <td>${order.user?.fullName || order.user?.phone || "—"}</td>
        <td>${order.serviceName || "—"}</td>
        <td><span class="pill">${order.status}</span></td>
        <td>${order.totalAmount || 0} ₽</td>
        <td>${formatDate(order.createdAt)}</td>
      </tr>`
      )
      .join("");
  }

  async function tryOpenAdmin() {
    try {
      await API.ensureAdmin();
      loginBlock.style.display = "none";
      appBlock.style.display = "grid";
      API.wireLogout();
      await renderDashboard();
      await loadEmailSettings();
    } catch {
      loginBlock.style.display = "block";
      appBlock.style.display = "none";
    }
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginStatus.textContent = "Вход...";
    loginStatus.style.color = "#99a2be";
    try {
      const fd = new FormData(loginForm);
      const phone = normalizePhone(fd.get("phone"));
      if (!/^[+]?\d{10,15}$/.test(phone)) {
        loginStatus.textContent = "Введите корректный номер телефона.";
        loginStatus.style.color = "#ff7676";
        return;
      }
      await API.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          password: String(fd.get("password") || ""),
        }),
      });
      await tryOpenAdmin();
    } catch (error) {
      loginStatus.textContent = error.message;
      loginStatus.style.color = "#ff7676";
    }
  });

  refreshBtn?.addEventListener("click", () => runWithButtonFeedback(refreshBtn, "Обновляем...", renderDashboard));
  directorEmailSaveBtn?.addEventListener("click", async () => {
    await runWithButtonFeedback(directorEmailSaveBtn, "Сохраняем...", async () => {
      try {
        const directorEmail = String(directorEmailInput?.value || "").trim().toLowerCase();
        if (!directorEmail) {
          setEmailStatus("Введите email директора.", true);
          return;
        }
        await API.request("/admin/email-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directorEmail }),
        });
        setEmailStatus("Email директора сохранен.");
      } catch (error) {
        setEmailStatus(error.message || "Ошибка сохранения email.", true);
      }
    });
  });
  directorReportSendBtn?.addEventListener("click", async () => {
    await runWithButtonFeedback(directorReportSendBtn, "Отправляем...", async () => {
      try {
        if (Date.now() < reportCooldownUntil) return;
        const periodDays = Math.max(1, Math.min(30, Number(directorReportDaysInput?.value || 1)));
        setEmailStatus("Отправляем отчет...");
        const response = await API.request("/admin/email-report/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodDays }),
        });
        reportCooldownUntil = Date.now() + 60000;
        updateReportButtonState();
        if (response.duplicate) {
          setEmailStatus("Отчет уже отправлялся недавно, дубль заблокирован.");
        } else if (response.disabled) {
          setEmailStatus("EMAIL_ENABLED выключен, отправка пропущена.", true);
        } else {
          setEmailStatus("Отчет отправлен на email директора.");
        }
      } catch (error) {
        reportCooldownUntil = 0;
        directorReportSendBtn.disabled = false;
        setEmailStatus(error.message || "Не удалось отправить отчет.", true);
      }
    });
  });
  setInterval(updateReportButtonState, 1000);
  setupPhoneValidation();
  tryOpenAdmin();
})();
