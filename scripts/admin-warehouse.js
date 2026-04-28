(function () {
  const API = window.AdminCommon;
  const refreshBtn = document.getElementById("warehouse-refresh");
  const techSearchEl = document.getElementById("warehouse-tech-search");
  const materialSearchEl = document.getElementById("warehouse-material-search");
  const variantSearchEl = document.getElementById("warehouse-variant-search");
  const techBody = document.getElementById("warehouse-tech-body");
  const materialBody = document.getElementById("warehouse-material-body");
  const variantBody = document.getElementById("warehouse-variant-body");
  const addTechBtn = document.getElementById("warehouse-tech-add");
  const addMaterialBtn = document.getElementById("warehouse-material-add");
  const addTechCodeEl = document.getElementById("warehouse-tech-code");
  const addTechNameEl = document.getElementById("warehouse-tech-name");
  const addMaterialCodeEl = document.getElementById("warehouse-material-code");
  const addMaterialNameEl = document.getElementById("warehouse-material-name");

  let options = [];
  let items = [];

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

  function renderTechnologies() {
    const text = String(techSearchEl?.value || "").trim().toLowerCase();
    const technologies = byType("technology").filter((row) =>
      !text || [row.code, row.name].join(" ").toLowerCase().includes(text)
    );
    if (!technologies.length) {
      techBody.innerHTML = '<tr><td colspan="3">Нет данных</td></tr>';
      return;
    }
    techBody.innerHTML = technologies
      .map(
        (row) => `<tr>
          <td>${esc(row.code)}</td>
          <td>${esc(row.name)}</td>
          <td><input type="checkbox" data-toggle-option="${row.id}" ${row.active ? "checked" : ""}></td>
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
      materialBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
      return;
    }
    materialBody.innerHTML = materials
      .map(
        (row) => `<tr>
          <td>${esc(row.code)}</td>
          <td>${esc(row.name)}</td>
          <td>${Number(row.priceDelta || 0)}</td>
          <td><input type="checkbox" data-toggle-option="${row.id}" ${row.active ? "checked" : ""}></td>
        </tr>`
      )
      .join("");
  }

  function renderVariants() {
    const text = String(variantSearchEl?.value || "").trim().toLowerCase();
    const variants = items.filter((row) => {
      if (row.itemType !== "material_variant") return false;
      return !text || [row.technologyCode, row.materialCode, row.colorCode, row.code].join(" ").toLowerCase().includes(text);
    });
    if (!variants.length) {
      variantBody.innerHTML = '<tr><td colspan="12">Нет данных</td></tr>';
      return;
    }
    variantBody.innerHTML = variants
      .map(
        (row) => `<tr>
          <td>${esc(row.shortId || row.id)}</td>
          <td>${esc(row.technologyCode)}</td>
          <td>${esc(row.materialCode)}</td>
          <td>${esc(row.colorCode)}</td>
          <td>${esc(row.thicknessMm)}</td>
          <td>${esc(row.stockQty)}</td>
          <td>${esc(row.reservedQty)}</td>
          <td>${esc(row.consumedQty)}</td>
          <td>${esc(row.availableQty)}</td>
          <td>${esc(row.unit)}</td>
          <td>${esc(row.pricePerCm3)}</td>
          <td><span class="stock-dot stock-dot--${row.stockStatus || "ok"}"></span></td>
        </tr>`
      )
      .join("");
  }

  function wireOptionToggles() {
    document.querySelectorAll("[data-toggle-option]").forEach((node) => {
      node.addEventListener("change", async () => {
        const id = node.getAttribute("data-toggle-option");
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: node.checked }),
        });
        await load();
      });
    });
  }

  function render() {
    renderTechnologies();
    renderMaterials();
    renderVariants();
    wireOptionToggles();
  }

  async function load() {
    const [optionsData, itemsData] = await Promise.all([API.request("/admin/options"), API.request("/admin/warehouse/items")]);
    options = optionsData.options || [];
    items = itemsData.items || [];
    render();
  }

  addTechBtn?.addEventListener("click", async () => {
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

  addMaterialBtn?.addEventListener("click", async () => {
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

  [techSearchEl, materialSearchEl, variantSearchEl].forEach((node) => node?.addEventListener("input", render));
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
