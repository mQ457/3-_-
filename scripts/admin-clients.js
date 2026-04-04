(function () {
  const API_BASE = "http://localhost:3000/api";

  function adminLogout() {
    localStorage.removeItem("isAdminLoggedIn");
    window.location.href = "admin.html";
  }

  window.adminLogout = adminLogout;

  async function loadClients() {
    const tbody = document.getElementById("clients-body");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Загрузка...</td></tr>';

    try {
      const response = await fetch(`${API_BASE}/admin/clients`, {
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.href = "admin.html";
        return;
      }
      const data = await response.json();
      const clients = data.clients || [];

      if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Нет клиентов</td></tr>';
        return;
      }

      tbody.innerHTML = clients
        .map((client) => {
          const statusClass = client.status?.toLowerCase() || "active";
          return `
            <tr>
              <td>${client.fullName || "—"}</td>
              <td>${client.email || "—"}</td>
              <td>${client.phone || "—"}</td>
              <td>${client.orderCount || 0}</td>
              <td>${client.totalAmount || 0} ₽</td>
              <td>${formatDate(client.createdAt) || "—"}</td>
              <td><span class="status-badge status-${statusClass}">${client.status || "—"}</span></td>
              <td>
                <button class="action-btn" title="Просмотр">👁️</button>
                <button class="action-btn" title="Редакт.">✏️</button>
                <button class="action-btn" title="Удалить">🗑️</button>
              </td>
            </tr>
          `;
        })
        .join("");
    } catch (error) {
      tbody.innerHTML = `<tr><td colspan="8" class="error-state">Ошибка загрузки: ${error.message}</td></tr>`;
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ru-RU");
  }

  document.getElementById("refresh-clients-btn")?.addEventListener("click", loadClients);
  document.getElementById("export-clients-btn")?.addEventListener("click", () => {
    alert("Экспорт в CSV (функция в разработке)");
  });
  document.getElementById("new-client-btn")?.addEventListener("click", () => {
    alert("Создание нового клиента (функция в разработке)");
  });

  loadClients();
})();
