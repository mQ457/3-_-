(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("orders-body");
  const filterText = document.getElementById("filter-order-text");
  const filterStatus = document.getElementById("filter-order-status");
  const filterDate = document.getElementById("filter-order-date");
  const refreshBtn = document.getElementById("refresh-orders");
  let allOrders = [];
  const doneStatuses = new Set(["Завершен", "Готов к выдаче", "Модель готова", "Отправлен"]);
  const progressStatuses = new Set(["В очереди", "Печатается", "Пост-обработка", "В работе", "Сканирование", "Печать", "Посылка в пути"]);

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("ru-RU");
  }

  function getStatusClass(status) {
    if (doneStatuses.has(status)) return "ok";
    if (progressStatuses.has(status)) return "progress";
    return "wait";
  }

  function createRow(order) {
    const statuses = Array.isArray(order.allowedStatuses) && order.allowedStatuses.length ? order.allowedStatuses : [order.status];
    const safeAddress = (order.address || "").replace(/</g, "&lt;");
    const safeTask = (order.modelingTask || "").replace(/</g, "&lt;");
    const safeFilePath = (order.filePath || "").replace(/"/g, "&quot;");
    return `
      <tr class="admin-orders-row-main">
        <td>${order.orderNumber || order.id.slice(0, 8)}</td>
        <td>${order.user?.fullName || order.user?.phone || "—"}</td>
        <td>${order.serviceName || "—"}</td>
        <td>${order.fileName || "—"}</td>
        <td>
          <span class="admin-status-badge ${getStatusClass(order.status)}">${order.status}</span>
          <select data-order-status="${order.id}">
            ${statuses
              .map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>`)
              .join("")}
          </select>
        </td>
        <td>${order.totalAmount || 0} ₽</td>
        <td>${formatDate(order.createdAt)}</td>
        <td><button class="btn-secondary" data-toggle-order="${order.id}">⌄</button></td>
      </tr>
      <tr class="admin-orders-row-details" data-order-id="${order.id}" style="display:none;">
        <td colspan="8">
          <div class="admin-order-details">
            <div>
              <div class="admin-order-details__title">Полная информация</div>
              <div>${order.user?.fullName || "—"}</div>
              <div>${order.user?.phone || "—"}</div>
              <div>${order.user?.email || "—"}</div>
            </div>
            <div>
              <div class="admin-order-details__title">Адрес доставки</div>
              <div>${safeAddress || "<span class=\"admin-order-warning\">Адрес не указан</span>"}</div>
              <div class="admin-order-details__sub">Карта: ${order.cardMask || "—"}</div>
              <div class="admin-order-details__sub">ТЗ: ${safeTask || "—"}</div>
            </div>
            <div>
              <div class="admin-order-details__title">Действия</div>
              <button class="btn-secondary" data-order-user="${order.user?.id || ""}">Профиль</button>
              <button class="btn-secondary" data-open-order-notify="${order.orderNumber || order.id}">Уведомить клиента</button>
              ${safeFilePath ? `<a class="admin-order-details__link" href="${safeFilePath}" target="_blank" rel="noopener noreferrer">Скачать файл</a>` : ""}
            </div>
          </div>
        </td>
      </tr>`;
  }

  function applyFilter() {
    const text = String(filterText?.value || "").trim().toLowerCase();
    const status = String(filterStatus?.value || "").trim().toLowerCase();
    const date = String(filterDate?.value || "");
    const items = allOrders.filter((order) => {
      const byText =
        !text ||
        [order.orderNumber, order.serviceName, order.user?.fullName, order.user?.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text);
      const byStatus = !status || String(order.status || "").toLowerCase().includes(status);
      const byDate = !date || String(order.createdAt || "").slice(0, 10) === date;
      return byText && byStatus && byDate;
    });

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">Нет заказов по фильтру.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(createRow).join("");

    tbody.querySelectorAll("[data-order-status]").forEach((select) => {
      select.addEventListener("change", async () => {
        const orderId = select.getAttribute("data-order-status");
        try {
          await API.request(`/admin/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: select.value }),
          });
          await loadOrders();
        } catch (error) {
          alert(error.message || "Не удалось обновить статус");
        }
      });
    });

    tbody.querySelectorAll("[data-toggle-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-toggle-order");
        const row = tbody.querySelector(`.admin-orders-row-details[data-order-id="${id}"]`);
        if (!row) return;
        const opened = row.style.display !== "none";
        row.style.display = opened ? "none" : "table-row";
        btn.textContent = opened ? "⌄" : "⌃";
      });
    });

    tbody.querySelectorAll("[data-order-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-order-user");
        if (!userId) return;
        const data = await API.request(`/admin/user-full/${userId}`);
        alert(`Клиент: ${data.user.full_name || "—"}\nТелефон: ${data.user.phone || "—"}\nАдресов: ${data.addresses.length}\nКарт: ${data.paymentMethods.length}`);
      });
    });

    tbody.querySelectorAll("[data-open-order-notify]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const orderRef = btn.getAttribute("data-open-order-notify");
        if (!orderRef) return;
        window.location.href = `admin-notifications.html?query=${encodeURIComponent(orderRef)}`;
      });
    });
  }

  async function loadOrders() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      const data = await API.request("/admin/orders");
      allOrders = data.orders || [];
      applyFilter();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
        return;
      }
      tbody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
    }
  }

  [filterText, filterStatus, filterDate].forEach((el) => el?.addEventListener("input", applyFilter));
  refreshBtn?.addEventListener("click", loadOrders);
  loadOrders();
})();
