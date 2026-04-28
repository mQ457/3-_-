(function () {
  const API = window.AdminCommon;
  const refreshBtn = document.getElementById("warehouse-refresh");
  const techSearchEl = document.getElementById("warehouse-tech-search");
  const materialSearchEl = document.getElementById("warehouse-material-search");
  const techBody = document.getElementById("warehouse-tech-body");
  const materialBody = document.getElementById("warehouse-material-body");
  const addTechBtn = document.getElementById("warehouse-tech-add");
  const addMaterialBtn = document.getElementById("warehouse-material-add");
  const addTechCodeEl = document.getElementById("warehouse-tech-code");
  const addTechNameEl = document.getElementById("warehouse-tech-name");
  const addMaterialCodeEl = document.getElementById("warehouse-material-code");
  const addMaterialNameEl = document.getElementById("warehouse-material-name");
  const pricingBody = document.getElementById("warehouse-pricing-body");

  let options = [];
  let pricingRules = [];
  const SERVICE_ORDER = ["print", "modeling", "scan"];
  const SERVICE_LABELS = {
    print: "3Д печать",
    modeling: "Моделирование",
    scan: "Сканирование",
  };
  const PRICING_FIELDS = [
    { key: "baseFee", label: "Базовая стоимость, ₽", step: "1", min: "0" },
    { key: "minPrice", label: "Минимальный чек, ₽", step: "1", min: "0" },
    { key: "hourRate", label: "Работа сотрудника / час, ₽", step: "1", min: "0" },
    { key: "machineHourRate", label: "Электроэнергия / час, ₽", step: "1", min: "0" },
    { key: "wastePercent", label: "Процент брака, %", step: "0.1", min: "0" },
    { key: "supportPercent", label: "Маржа, %", step: "0.1", min: "0" },
    { key: "setupFee", label: "Подготовка заказа, ₽", step: "1", min: "0" },
    { key: "defaultModelVolumeCm3", label: "Базовый объем модели, см3", step: "0.1", min: "0" },
  ];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function byType(type) {
    return options.filter((row) => row.type === type);
  }

  function getByDataAttr(container, attr, id) {
    return Array.from(container.querySelectorAll(`[${attr}]`)).find((node) => node.getAttribute(attr) === id) || null;
  }

  function parseNumInput(value, fallback = 0) {
    const normalized = String(value ?? "").replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
  }

  async function withPending(button, pendingText, fn) {
    if (!button) return fn();
    const initial = button.textContent;
    button.disabled = true;
    button.textContent = pendingText;
    try {
      await fn();
      button.textContent = "Готово";
      setTimeout(() => {
        button.textContent = initial;
        button.disabled = false;
      }, 500);
    } catch (error) {
      button.textContent = "Ошибка";
      setTimeout(() => {
        button.textContent = initial;
        button.disabled = false;
      }, 900);
      if (error?.message) {
        window.alert(`Ошибка: ${error.message}`);
      } else {
        window.alert("Ошибка сохранения. Попробуйте еще раз.");
      }
    }
  }

  function renderTechnologies() {
    const text = String(techSearchEl?.value || "").trim().toLowerCase();
    const technologies = byType("technology").filter((row) =>
      !text || [row.code, row.name].join(" ").toLowerCase().includes(text)
    );
    if (!technologies.length) {
      techBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
      return;
    }
    techBody.innerHTML = technologies
      .map(
        (row) => `<tr>
          <td>${esc(row.code)}</td>
          <td><input data-tech-name="${row.id}" value="${esc(row.name)}"></td>
          <td><button class="btn-secondary" data-tech-save="${row.id}">Сохранить</button></td>
          <td><button class="btn-secondary" data-tech-delete="${row.id}">Удалить</button></td>
        </tr>`
      )
      .join("");
  }

  function renderMaterials() {
    const text = String(materialSearchEl?.value || "").trim().toLowerCase();
    const materials = byType("material").filter((row) =>
      !text || [row.code, row.name].join(" ").toLowerCase().includes(text)
    );
    if (!materials.length) {
      materialBody.innerHTML = '<tr><td colspan="5">Нет данных</td></tr>';
      return;
    }
    materialBody.innerHTML = materials
      .map((row) => {
        return `<tr>
          <td>${esc(row.code)}</td>
          <td><input data-material-name="${row.id}" value="${esc(row.name)}"></td>
          <td><input type="number" step="0.1" data-material-price="${row.id}" value="${Number(row.priceDelta || 0).toFixed(2)}"></td>
          <td><button class="btn-secondary" data-material-save="${row.id}">Сохранить</button></td>
          <td><button class="btn-secondary" data-material-delete="${row.id}">Удалить</button></td>
        </tr>`
      })
      .join("");
  }

  function renderPricingRules() {
    if (!pricingBody) return;
    const rows = [];
    SERVICE_ORDER.forEach((serviceType) => {
      const rule = pricingRules.find((item) => item.serviceType === serviceType) || { serviceType };
      PRICING_FIELDS.forEach((field, idx) => {
        rows.push(`<tr>
          <td>${idx === 0 ? esc(SERVICE_LABELS[serviceType] || serviceType) : ""}</td>
          <td>${esc(field.label)}</td>
          <td><input type="number" step="${field.step}" min="${field.min}" data-pricing-input="${serviceType}:${field.key}" value="${Number(rule[field.key] || 0)}"></td>
          <td>${idx === 0 ? `<button class="btn-secondary" data-pricing-save="${serviceType}">Сохранить</button>` : ""}</td>
        </tr>`);
      });
    });
    pricingBody.innerHTML = rows.join("");
  }

  function render() {
    renderTechnologies();
    renderMaterials();
    renderPricingRules();
  }

  async function load() {
    const [optionsData, pricingData] = await Promise.all([API.request("/admin/options"), API.request("/admin/pricing-rules")]);
    options = optionsData.options || [];
    pricingRules = pricingData.rules || [];
    render();
  }

  addTechBtn?.addEventListener("click", async () => {
    await withPending(addTechBtn, "Добавление...", async () => {
      const code = String(addTechCodeEl?.value || "").trim().toLowerCase();
      const name = String(addTechNameEl?.value || "").trim();
      if (!code || !name) return;
      await API.request("/admin/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "technology", code, name, priceDelta: 0, active: true }),
      });
      addTechCodeEl.value = "";
      addTechNameEl.value = "";
      await load();
    });
  });

  addMaterialBtn?.addEventListener("click", async () => {
    await withPending(addMaterialBtn, "Добавление...", async () => {
      const code = String(addMaterialCodeEl?.value || "").trim().toLowerCase();
      const name = String(addMaterialNameEl?.value || "").trim();
      if (!code || !name) return;
      await API.request("/admin/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "material", code, name, priceDelta: 0, active: true }),
      });
      addMaterialCodeEl.value = "";
      addMaterialNameEl.value = "";
      await load();
    });
  });

  techBody?.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest("[data-tech-save]");
    if (saveBtn) {
      await withPending(saveBtn, "Сохранение...", async () => {
        const id = saveBtn.getAttribute("data-tech-save");
        const nameInput = getByDataAttr(techBody, "data-tech-name", id);
        const name = String(nameInput?.value || "").trim();
        if (!name) return;
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        await load();
      });
      return;
    }
    const deleteBtn = event.target.closest("[data-tech-delete]");
    if (deleteBtn) {
      await withPending(deleteBtn, "Удаление...", async () => {
        const id = deleteBtn.getAttribute("data-tech-delete");
        await API.request(`/admin/options/${id}`, { method: "DELETE" });
        await load();
      });
    }
  });

  materialBody?.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest("[data-material-save]");
    if (saveBtn) {
      await withPending(saveBtn, "Сохранение...", async () => {
        const id = saveBtn.getAttribute("data-material-save");
        const nameInput = getByDataAttr(materialBody, "data-material-name", id);
        const priceInput = getByDataAttr(materialBody, "data-material-price", id);
        const name = String(nameInput?.value || "").trim();
        const nextPrice = parseNumInput(priceInput?.value, 0);
        if (!Number.isFinite(nextPrice)) {
          throw new Error("Цена должна быть числом.");
        }
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            priceDelta: nextPrice,
          }),
        });
        await load();
      });
      return;
    }
    const deleteBtn = event.target.closest("[data-material-delete]");
    if (deleteBtn) {
      await withPending(deleteBtn, "Удаление...", async () => {
        const id = deleteBtn.getAttribute("data-material-delete");
        await API.request(`/admin/options/${id}`, { method: "DELETE" });
        await load();
      });
    }
  });

  pricingBody?.addEventListener("click", async (event) => {
    const saveBtn = event.target.closest("[data-pricing-save]");
    if (!saveBtn) return;
    await withPending(saveBtn, "Сохранение...", async () => {
      const serviceType = String(saveBtn.getAttribute("data-pricing-save") || "").trim();
      if (!serviceType) return;
      const payload = {};
      PRICING_FIELDS.forEach((field) => {
        const input = getByDataAttr(pricingBody, "data-pricing-input", `${serviceType}:${field.key}`);
        payload[field.key] = parseNumInput(input?.value, 0);
      });
      await API.request(`/admin/pricing-rules/${serviceType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
    });
  });

  [techSearchEl, materialSearchEl].forEach((node) => node?.addEventListener("input", render));
  refreshBtn?.addEventListener("click", load);

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      await load();
    } catch (error) {
      if (error.status === 401 || error.status === 403) window.location.href = "admin.html";
    }
  }

  init();
})();
