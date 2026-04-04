(function () {
  const tbody = document.querySelector(".orders-table tbody");

  function formatDate(value) {
    try {
      return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return value || "—";
    }
  }

  function createRow(order) {
    return `
      <tr>
        <td>#${order.id.slice(0, 8)}</td>
        <td>${order.serviceName || "Услуга"}</td>
        <td>${order.details ? order.details.replace(/</g, "&lt;") : "—"}</td>
        <td>
          <span class="status-badge ${order.status === "Оплачен" ? "ok" : "wait"}">${order.status}</span>
        </td>
        <td>${formatDate(order.createdAt)}</td>
        <td>${order.totalAmount || 0} руб.</td>
        <td>
          <button class="btn btn-ghost" style="padding:6px 10px; border-radius:12px;" type="button" aria-label="Развернуть">⌄</button>
        </td>
      </tr>`;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Ошибка запроса");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadOrders() {
    try {
      const data = await request("/api/orders");
      if (!data.orders || data.orders.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; color:#9aa1b6;">У вас пока нет заказов.</td>
          </tr>`;
        return;
      }
      tbody.innerHTML = data.orders.map(createRow).join("");
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "login.html";
        return;
      }
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; color:#f87171;">${error.message}</td>
        </tr>`;
    }
  }

  loadOrders();
})();
