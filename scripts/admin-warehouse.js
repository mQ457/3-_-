(function () {
  const API_BASE = "http://localhost:3000/api";

  function adminLogout() {
    localStorage.removeItem("isAdminLoggedIn");
    window.location.href = "admin.html";
  }

  window.adminLogout = adminLogout;

  async function loadMaterials() {
    const container = document.getElementById("materials-container");
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
        <div class="material-card">
          <h3>${mat.name || "Материал"}</h3>
          <p class="material-description">${mat.description || ""}</p>
          <div class="material-details">
            <div class="detail-row">
              <span>Цена:</span>
              <strong>${mat.price || 0} ₽ / г</strong>
            </div>
            <div class="detail-row">
              <span>В наличии:</span>
              <strong class="${mat.stock > 0 ? "in-stock" : "out-of-stock"}">${mat.stock || 0} г</strong>
            </div>
            <div class="detail-row">
              <span>Статус:</span>
              <strong>${mat.active ? "✅ Активен" : "❌ Неактивен"}</strong>
            </div>
          </div>
          <div class="material-actions">
            <button class="action-btn">Редактировать</button>
            <button class="action-btn">Удалить</button>
          </div>
        </div>
      `
        )
        .join("");
    } catch (error) {
      container.innerHTML = `<div class="error-state">Ошибка загрузки: ${error.message}</div>`;
    }
  }

  async function loadTechnologies() {
    const container = document.getElementById("technologies-container");
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
        <div class="technology-item">
          <div class="tech-header">
            <h3>${tech.name || "Технология"}</h3>
            <span class="tech-status">${tech.active ? "✅" : "❌"}</span>
          </div>
          <p class="tech-description">${tech.description || ""}</p>
          <div class="tech-specs">
            <span class="tech-spec">Мин. размер: ${tech.minSize || "—"}</span>
            <span class="tech-spec">Макс. размер: ${tech.maxSize || "—"}</span>
            <span class="tech-spec">Точность: ${tech.precision || "—"}</span>
          </div>
          <div class="tech-actions">
            <button class="action-btn">Редактировать</button>
            <button class="action-btn">Удалить</button>
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
  document.querySelectorAll(".warehouse-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".warehouse-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".warehouse-tab-content").forEach((c) => c.classList.add("hidden"));
      tab.classList.add("active");
      const tabName = tab.getAttribute("data-tab");
      document.getElementById(`${tabName}-tab`).classList.remove("hidden");

      if (tabName === "materials") {
        loadMaterials();
      } else if (tabName === "technologies") {
        loadTechnologies();
      }
    });
  });

  document.getElementById("refresh-warehouse-btn")?.addEventListener("click", () => {
    loadMaterials();
    loadTechnologies();
  });

  document.getElementById("new-material-btn")?.addEventListener("click", () => {
    alert("Добавление материала (функция в разработке)");
  });

  loadMaterials();
})();
