(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("warehouse-body");
  const typeEl = document.getElementById("warehouse-type");
  const searchEl = document.getElementById("warehouse-search");
  const refreshBtn = document.getElementById("warehouse-refresh");
  const addBtn = document.getElementById("warehouse-add");
  let options = [];

  function render() {
    const type = String(typeEl?.value || "");
    const text = String(searchEl?.value || "").trim().toLowerCase();
    const items = options.filter((option) => {
      const byType = !type || option.type === type;
      const byText = !text || [option.code, option.name].join(" ").toLowerCase().includes(text);
      return byType && byText;
    });
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(
        (option) => `
      <tr>
        <td>${option.type}</td>
        <td>${option.code}</td>
        <td><input value="${option.name}" data-name-id="${option.id}" /></td>
        <td><input type="number" value="${option.priceDelta || 0}" data-price-id="${option.id}" /></td>
        <td><input type="checkbox" data-active-id="${option.id}" ${option.active ? "checked" : ""} /></td>
        <td><input type="number" value="${option.sortOrder || 0}" data-sort-id="${option.id}" /></td>
        <td>
          <button class="btn-secondary" data-save-id="${option.id}">Сохранить</button>
          <button class="btn-secondary" data-delete-id="${option.id}">Удалить</button>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-save-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-save-id");
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tbody.querySelector(`[data-name-id="${id}"]`)?.value || "",
            priceDelta: Number(tbody.querySelector(`[data-price-id="${id}"]`)?.value || 0),
            active: tbody.querySelector(`[data-active-id="${id}"]`)?.checked,
            sortOrder: Number(tbody.querySelector(`[data-sort-id="${id}"]`)?.value || 0),
          }),
        });
      });
    });

    tbody.querySelectorAll("[data-delete-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-delete-id");
        await API.request(`/admin/options/${id}`, { method: "DELETE" });
        await load();
      });
    });
  }

  async function load() {
    const data = await API.request("/admin/options");
    options = data.options || [];
    render();
  }

  addBtn?.addEventListener("click", async () => {
    const type = prompt("Тип (material/technology/color/thickness):", "material");
    const code = prompt("Код:", "new_code");
    const name = prompt("Название:", "Новая опция");
    if (!type || !code || !name) return;
    await API.request("/admin/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, code, name, priceDelta: 0, active: true, sortOrder: 100 }),
    });
    await load();
  });

  [typeEl, searchEl].forEach((el) => el?.addEventListener("input", render));
  refreshBtn?.addEventListener("click", load);

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
  init();
})();
