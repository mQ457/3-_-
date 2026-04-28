(function () {
  const API = window.AdminCommon;
  const techBody = document.getElementById("settings-tech-body");
  const materialBody = document.getElementById("settings-material-body");
  const colorBody = document.getElementById("settings-color-body");
  const refreshBtn = document.getElementById("settings-refresh");
  const directorEmailInput = document.getElementById("director-email-input");
  const directorEmailSaveBtn = document.getElementById("director-email-save");
  const directorReportSendBtn = document.getElementById("director-report-send");
  const directorReportDaysInput = document.getElementById("director-report-days");
  const directorEmailStatus = document.getElementById("director-email-status");
  let options = [];
  let reportCooldownUntil = 0;

  function byType(type) {
    return options.filter((item) => item.type === type);
  }

  function render() {
    const technologies = byType("technology");
    if (!technologies.length) {
      techBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    } else {
      techBody.innerHTML = technologies
        .map(
          (item) => `
      <tr>
        <td>${item.shortId || item.id}</td>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td><input type="checkbox" data-option-active="${item.id}" ${item.active ? "checked" : ""}></td>
      </tr>`
        )
        .join("");
    }

    const materials = byType("material");
    if (!materials.length) {
      materialBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    } else {
      materialBody.innerHTML = materials
        .map(
          (item) => `
      <tr>
        <td>${item.shortId || item.id}</td>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td><input type="checkbox" data-option-active="${item.id}" ${item.active ? "checked" : ""}></td>
      </tr>`
        )
        .join("");
    }

    const colors = byType("color");
    if (!colors.length) {
      colorBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    } else {
      colorBody.innerHTML = colors
        .map(
          (item) => `
      <tr>
        <td>${item.shortId || item.id}</td>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td><input type="checkbox" data-option-active="${item.id}" ${item.active ? "checked" : ""}></td>
      </tr>`
        )
        .join("");
    }

    document.querySelectorAll("[data-option-active]").forEach((node) => {
      node.addEventListener("change", async () => {
        try {
          const id = node.getAttribute("data-option-active");
          await API.request(`/admin/options/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: node.checked }),
          });
          await load();
        } catch (error) {
          node.checked = !node.checked;
          window.alert(`Ошибка переключения: ${error?.message || "не удалось сохранить"}`);
        }
      });
    });
  }

  async function load() {
    const optionsData = await API.request("/admin/options");
    options = optionsData.options || [];
    render();
  }

  function setEmailStatus(message, isError = false) {
    if (!directorEmailStatus) return;
    directorEmailStatus.textContent = message || "";
    directorEmailStatus.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function updateReportButtonState() {
    if (!directorReportSendBtn) return;
    const now = Date.now();
    const leftMs = Math.max(0, reportCooldownUntil - now);
    if (leftMs <= 0) {
      directorReportSendBtn.disabled = false;
      directorReportSendBtn.textContent = "Отправить отчет директору";
      return;
    }
    directorReportSendBtn.disabled = true;
    directorReportSendBtn.textContent = `Повтор через ${Math.ceil(leftMs / 1000)}с`;
  }

  async function loadEmailSettings() {
    const data = await API.request("/admin/email-settings");
    if (directorEmailInput) directorEmailInput.value = data.directorEmail || "";
  }

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      await load();
      await loadEmailSettings();
      setInterval(updateReportButtonState, 1000);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
      }
    }
  }
  refreshBtn?.addEventListener("click", load);
  directorEmailSaveBtn?.addEventListener("click", async () => {
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
      setEmailStatus(error.message || "Не удалось сохранить email.", true);
    }
  });
  directorReportSendBtn?.addEventListener("click", async () => {
    try {
      if (Date.now() < reportCooldownUntil) return;
      const periodDays = Math.max(1, Math.min(30, Number(directorReportDaysInput?.value || 1)));
      directorReportSendBtn.disabled = true;
      setEmailStatus("Отправляем отчет...");
      await API.request("/admin/email-report/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodDays }),
      });
      reportCooldownUntil = Date.now() + 60000;
      setEmailStatus("Отчет отправлен на email директора.");
      updateReportButtonState();
    } catch (error) {
      reportCooldownUntil = 0;
      directorReportSendBtn.disabled = false;
      setEmailStatus(error.message || "Не удалось отправить отчет.", true);
    }
  });
  init();
})();
