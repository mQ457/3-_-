(function () {
  const API_BASE = "http://localhost:3000/api";

  function adminLogout() {
    localStorage.removeItem("isAdminLoggedIn");
    window.location.href = "admin.html";
  }

  window.adminLogout = adminLogout;

  async function loadSupport() {
    const container = document.getElementById("support-tickets");
    if (!container) return;

    container.innerHTML = '<div class="empty-state">Загрузка обращений...</div>';

    try {
      const response = await fetch(`${API_BASE}/admin/support`, {
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.href = "admin.html";
        return;
      }
      const data = await response.json();
      const tickets = data.tickets || [];

      if (tickets.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет обращений в поддержку</div>';
        return;
      }

      container.innerHTML = tickets
        .map((ticket) => {
          const statusClass = (ticket.status || "новое").toLowerCase();
          const statusLabel = {
            новое: "Новое",
            в_обработке: "В обработке",
            решено: "Решено",
            закрыто: "Закрыто",
          }[statusClass] || ticket.status;

          return `
            <div class="support-ticket">
              <div class="ticket-header">
                <span class="ticket-id">${ticket.id || "T-00"}</span>
                <span class="ticket-date">${formatDate(ticket.createdAt)}</span>
              </div>
              <div class="ticket-title">${ticket.title || "Без названия"}</div>
              <div class="ticket-client">${ticket.clientName || "—"}</div>
              <div class="ticket-status">
                <span class="status-badge status-${statusClass}">${statusLabel}</span>
              </div>
              <div class="ticket-actions">
                <button class="action-btn">Открыть</button>
                <button class="action-btn">Ответить</button>
                <button class="action-btn">Закрыть</button>
              </div>
            </div>
          `;
        })
        .join("");
    } catch (error) {
      container.innerHTML = `<div class="error-state">Ошибка загрузки: ${error.message}</div>`;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ru-RU");
  }

  document.getElementById("refresh-support-btn")?.addEventListener("click", loadSupport);
  document.getElementById("export-support-btn")?.addEventListener("click", () => {
    alert("Экспорт в CSV (функция в разработке)");
  });

  loadSupport();
})();
