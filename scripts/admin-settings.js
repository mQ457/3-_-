(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("settings-body");
  const techBody = document.getElementById("settings-tech-body");
  const materialBody = document.getElementById("settings-material-body");
  const colorBody = document.getElementById("settings-color-body");
  const refreshBtn = document.getElementById("settings-refresh");
  let rules = [];
  let options = [];
  let warehouseItems = [];

  function stockIndicatorClass(status) {
    if (status === "critical") return "critical";
    if (status === "low") return "low";
    return "ok";
  }

  function byType(type) {
    return options.filter((item) => item.type === type);
  }

  function materialSummaryRows() {
    const materialOptions = byType("material");
    return materialOptions.map((material) => {
      const variants = warehouseItems.filter(
        (item) => item.itemType === "material_variant" && item.materialCode === material.code
      );
      const availableQty = variants.reduce((sum, item) => sum + Number(item.availableQty || 0), 0);
      const stockQty = variants.reduce((sum, item) => sum + Number(item.stockQty || 0), 0);
      const status = stockQty > 0 ? (availableQty / stockQty >= 0.6 ? "ok" : availableQty / stockQty >= 0.2 ? "low" : "critical") : "critical";
      const firstVariant = variants[0] || {};
      return {
        material,
        variants,
        avgPrice: variants.length
          ? variants.reduce((sum, item) => sum + Number(item.pricePerCm3 || 0), 0) / variants.length
          : Number(material.priceDelta || 0),
        unit: firstVariant.unit || "g",
        availableQty,
        status,
      };
    });
  }

  function render() {
    if (!rules.length) {
      tbody.innerHTML = '<tr><td colspan="10">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = rules
      .map(
        (rule) => `
      <tr>
        <td>${rule.serviceType}</td>
        <td><input data-base="${rule.serviceType}" type="number" value="${rule.baseFee || 0}" /></td>
        <td><input data-min="${rule.serviceType}" type="number" value="${rule.minPrice || 0}" /></td>
        <td><input data-hour="${rule.serviceType}" type="number" value="${rule.hourRate || 0}" /></td>
        <td><input data-setup="${rule.serviceType}" type="number" value="${rule.setupFee || 0}" /></td>
        <td><input data-waste="${rule.serviceType}" type="number" step="0.1" value="${rule.wastePercent || 0}" /></td>
        <td><input data-support="${rule.serviceType}" type="number" step="0.1" value="${rule.supportPercent || 0}" /></td>
        <td><input data-machine="${rule.serviceType}" type="number" value="${rule.machineHourRate || 0}" /></td>
        <td><input data-volume="${rule.serviceType}" type="number" step="0.1" value="${rule.defaultModelVolumeCm3 || 0}" /></td>
        <td><button class="btn-secondary" data-save="${rule.serviceType}">Сохранить</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const serviceType = button.getAttribute("data-save");
        await API.request(`/admin/pricing-rules/${serviceType}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseFee: Number(tbody.querySelector(`[data-base="${serviceType}"]`)?.value || 0),
            minPrice: Number(tbody.querySelector(`[data-min="${serviceType}"]`)?.value || 0),
            hourRate: Number(tbody.querySelector(`[data-hour="${serviceType}"]`)?.value || 0),
            setupFee: Number(tbody.querySelector(`[data-setup="${serviceType}"]`)?.value || 0),
            wastePercent: Number(tbody.querySelector(`[data-waste="${serviceType}"]`)?.value || 0),
            supportPercent: Number(tbody.querySelector(`[data-support="${serviceType}"]`)?.value || 0),
            machineHourRate: Number(tbody.querySelector(`[data-machine="${serviceType}"]`)?.value || 0),
            defaultModelVolumeCm3: Number(tbody.querySelector(`[data-volume="${serviceType}"]`)?.value || 0),
          }),
        });
        await load();
      });
    });

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

    const materialRows = materialSummaryRows();
    if (!materialRows.length) {
      materialBody.innerHTML = '<tr><td colspan="7">Нет данных</td></tr>';
    } else {
      materialBody.innerHTML = materialRows
        .map(
          (row) => `
      <tr>
        <td>${row.material.name}</td>
        <td><input type="number" step="0.1" data-material-price="${row.material.code}" value="${Number(row.avgPrice || 0).toFixed(2)}"></td>
        <td>${row.unit}</td>
        <td>${Math.round(row.availableQty)}</td>
        <td><span class="stock-dot stock-dot--${stockIndicatorClass(row.status)}"></span></td>
        <td><input type="checkbox" data-option-active="${row.material.id}" ${row.material.active ? "checked" : ""}></td>
        <td><button class="btn-secondary" data-material-save="${row.material.code}">Сохранить</button></td>
      </tr>`
        )
        .join("");
      materialBody.querySelectorAll("[data-material-save]").forEach((button) => {
        button.addEventListener("click", async () => {
          const materialCode = button.getAttribute("data-material-save");
          const input = materialBody.querySelector(`[data-material-price="${materialCode}"]`);
          const nextPrice = Number(input?.value || 0);
          const materialRow = materialRows.find((row) => row.material.code === materialCode);
          if (!materialRow) return;
          await Promise.all(
            materialRow.variants.map((variant) =>
              API.request(`/admin/warehouse/items/${variant.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pricePerCm3: nextPrice }),
              })
            )
          );
          await load();
        });
      });
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
        const id = node.getAttribute("data-option-active");
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: node.checked }),
        });
        await load();
      });
    });
  }

  async function load() {
    const [rulesData, optionsData, warehouseData] = await Promise.all([
      API.request("/admin/pricing-rules"),
      API.request("/admin/options"),
      API.request("/admin/warehouse/items"),
    ]);
    rules = rulesData.rules || [];
    options = optionsData.options || [];
    warehouseItems = warehouseData.items || [];
    render();
  }

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      await load();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
      }
    }
  }
  refreshBtn?.addEventListener("click", load);
  init();
})();
