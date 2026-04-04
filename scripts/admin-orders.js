(function () {
  const API_BASE = "http://localhost:3000/api";

  function adminLogout() {
    localStorage.removeItem("isAdminLoggedIn");
    window.location.href = "admin.html";
  }

  window.adminLogout = adminLogout;

  async function loadOrders() {
    const tbody = document.getElementById("orders-body");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Загрузка...</td></tr>';

    try {
      const response = await fetch(`${API_BASE}/admin/orders`, {
        credentials: "include",
      });
      if (response.status === 401) {
        window.location.href = "admin.html";
        return;
      }
      const data = await response.json();
      const orders = data.orders || [];

      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Нет заказов</td></tr>';
        return;
      }

      tbody.innerHTML = orders
        .map((order, idx) => {
          const statusClass = order.status?.toLowerCase().replace(/[^\w]/g, "_") || "unknown";
          return `
            <tr>
              <td>${order.id?.substring(0, 8) || "—"}</td>
              <td>${order.user?.fullName || "—"}</td>
              <td>${order.user?.phone || "—"}</td>
              <td>${order.serviceName || "Услуга"}</td>
              <td><span class="status-badge status-${statusClass}">${order.status || "—"}</span></td>
              <td>${order.totalAmount || 0} ₽</td>
              <td>${formatDate(order.createdAt) || "—"}</td>
              <td>
                <button class="action-btn" title="Просмотр">👁️</button>
                <button class="action-btn" title="Редакт.">✏️</button>
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

  document.getElementById("refresh-orders-btn")?.addEventListener("click", loadOrders);
  document.getElementById("export-orders-btn")?.addEventListener("click", () => {
    alert("Экспорт в CSV (функция в разработке)");
  });
  document.getElementById("new-order-btn")?.addEventListener("click", () => {
    alert("Создание нового заказа (функция в разработке)");
  });

  loadOrders();
})();
