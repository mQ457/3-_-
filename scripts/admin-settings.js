(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("settings-body");
  const refreshBtn = document.getElementById("settings-refresh");
  let options = [];

  function render() {
    if (!options.length) {
      tbody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = options
      .map(
        (option) => `
      <tr>
        <td>${option.type}</td>
        <td>${option.code}</td>
        <td><input data-name="${option.id}" value="${option.name}" /></td>
        <td><input data-price="${option.id}" type="number" value="${option.priceDelta || 0}" /></td>
        <td><input data-meta="${option.id}" value='${option.meta ? JSON.stringify(option.meta).replace(/'/g, "&#39;") : ""}' /></td>
        <td><input data-active="${option.id}" type="checkbox" ${option.active ? "checked" : ""} /></td>
        <td><input data-sort="${option.id}" type="number" value="${option.sortOrder || 0}" /></td>
        <td><button class="btn-secondary" data-save="${option.id}">Сохранить</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-save");
        let meta = null;
        const rawMeta = tbody.querySelector(`[data-meta="${id}"]`)?.value || "";
        if (rawMeta.trim()) {
          try {
            meta = JSON.parse(rawMeta);
          } catch {
            alert("Некорректный JSON в meta.");
            return;
          }
        }
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tbody.querySelector(`[data-name="${id}"]`)?.value || "",
            priceDelta: Number(tbody.querySelector(`[data-price="${id}"]`)?.value || 0),
            active: tbody.querySelector(`[data-active="${id}"]`)?.checked,
            sortOrder: Number(tbody.querySelector(`[data-sort="${id}"]`)?.value || 0),
            meta,
          }),
        });
      });
    });
  }

  async function load() {
    const data = await API.request("/admin/options");
    options = data.options || [];
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
