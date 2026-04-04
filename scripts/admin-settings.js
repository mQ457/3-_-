(function () {
  const API_BASE = "http://localhost:3000/api";

  function adminLogout() {
    localStorage.removeItem("isAdminLoggedIn");
    window.location.href = "admin.html";
  }

  window.adminLogout = adminLogout;

  async function loadTechnologiesSettings() {
    const container = document.getElementById("technologies-settings");
    if (!container) return;

    container.innerHTML = '<div class="empty-state">Загрузка технологий...</div>';

    try {
      const response = await fetch(`${API_BASE}/admin/technologies`, {
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.href = "admin.html";
        return;
      }
      const data = await response.json();
      const techs = data.technologies || [];

      if (techs.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет технологий печати</div>';
        return;
      }

      container.innerHTML = techs
        .map(
          (tech) => `
        <div class="settings-item">
          <div class="settings-item-header">
            <h3>${tech.name || "Технология"}</h3>
            <label class="toggle-switch">
              <input type="checkbox" ${tech.active ? "checked" : ""} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <p>${tech.description || ""}</p>
          <div class="settings-item-details">
            <div class="input-group">
              <label>Минимальный размер</label>
              <input type="text" value="${tech.minSize || ""}" />
            </div>
            <div class="input-group">
              <label>Максимальный размер</label>
              <input type="text" value="${tech.maxSize || ""}" />
            </div>
            <div class="input-group">
              <label>Точность (мкм)</label>
              <input type="number" value="${tech.precision || 0}" />
            </div>
          </div>
          <div class="settings-item-actions">
            <button class="btn-secondary">Сохранить</button>
            <button class="btn-secondary">Отменить</button>
          </div>
        </div>
      `
        )
        .join("");
    } catch (error) {
      container.innerHTML = `<div class="error-state">Ошибка загрузки: ${error.message}</div>`;
    }
  }

  async function loadMaterialsSettings() {
    const container = document.getElementById("materials-settings");
    if (!container) return;

    container.innerHTML = '<div class="empty-state">Загрузка материалов...</div>';

    try {
      const response = await fetch(`${API_BASE}/admin/materials`, {
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.href = "admin.html";
        return;
      }
      const data = await response.json();
      const materials = data.materials || [];

      if (materials.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет материалов</div>';
        return;
      }

      container.innerHTML = materials
        .map(
          (mat) => `
        <div class="settings-item">
          <div class="settings-item-header">
            <h3>${mat.name || "Материал"}</h3>
            <label class="toggle-switch">
              <input type="checkbox" ${mat.active ? "checked" : ""} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <p>${mat.description || ""}</p>
          <div class="settings-item-details">
            <div class="input-group">
              <label>Цена за грамм (₽)</label>
              <input type="number" value="${mat.price || 0}" step="0.01" />
            </div>
            <div class="input-group">
              <label>Количество в наличии (г)</label>
              <input type="number" value="${mat.stock || 0}" />
            </div>
            <div class="input-group">
              <label>Мин. количество для заказа (г)</label>
              <input type="number" value="${mat.minOrder || 1}" />
            </div>
          </div>
          <div class="settings-item-actions">
            <button class="btn-secondary">Сохранить</button>
            <button class="btn-secondary">Отменить</button>
          </div>
        </div>
      `
        )
        .join("");
    } catch (error) {
      container.innerHTML = `<div class="error-state">Ошибка загрузки: ${error.message}</div>`;
    }
  }

  // Tab switching
  document.querySelectorAll(".settings-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".settings-tab-content").forEach((c) => c.classList.add("hidden"));
      tab.classList.add("active");
      const tabName = tab.getAttribute("data-tab");
      document.getElementById(`${tabName}-tab`).classList.remove("hidden");

      if (tabName === "technologies") {
        loadTechnologiesSettings();
      } else if (tabName === "materials") {
        loadMaterialsSettings();
      }
    });
  });

  document.getElementById("add-technology-btn")?.addEventListener("click", () => {
    alert("Добавление технологии печати (функция в разработке)");
  });

  document.getElementById("add-material-btn")?.addEventListener("click", () => {
    alert("Добавление материала (функция в разработке)");
  });

  loadTechnologiesSettings();
})();
