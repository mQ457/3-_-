(function () {
  const API = window.AppBootstrap;
  const tbody = document.querySelector(".orders-table tbody");
  const doneStatuses = new Set(["Завершен", "Готов к выдаче", "Модель готова", "Отправлен"]);
  const progressStatuses = new Set(["В очереди", "Печатается", "Пост-обработка", "В работе", "Сканирование", "Печать", "Посылка в пути"]);

  function formatDate(value) {
    try {
      return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return value || "—";
    }
  }

  function getStatusClass(status) {
    if (doneStatuses.has(status)) return "ok";
    if (progressStatuses.has(status)) return "progress";
    return "wait";
  }

  function createRow(order) {
    const safeTask = (order.modelingTask || "").replace(/</g, "&lt;");
    const safeFile = order.fileName ? order.fileName.replace(/</g, "&lt;") : "—";
    const safeDetails = order.details ? JSON.stringify(order.details).replace(/</g, "&lt;") : "—";
    const safeAddress = (order.deliveryAddress || "").replace(/</g, "&lt;");
    const safeName = (order.user?.fullName || "—").replace(/</g, "&lt;");
    const safePhone = (order.user?.phone || "—").replace(/</g, "&lt;");
    const safeEmail = (order.user?.email || "—").replace(/</g, "&lt;");
    const orderKey = order.orderNumber || order.id.slice(0, 8);
    return `
      <tr class="orders-row-main">
        <td>#${orderKey}</td>
        <td>${order.serviceName || "Услуга"}</td>
        <td>${safeFile}</td>
        <td>
          <span class="status-badge ${getStatusClass(order.status)}">${order.status}</span>
        </td>
        <td>${formatDate(order.createdAt)}</td>
        <td>${order.totalAmount || 0} руб.</td>
        <td>
          <button class="btn btn-ghost js-toggle-order orders-toggle-btn" type="button" data-order-id="${order.id}" aria-label="Развернуть">⌄</button>
        </td>
      </tr>
      <tr class="js-order-details orders-row-details" data-order-id="${order.id}" style="display:none;">
        <td colspan="7">
          <div class="order-details-panel">
            <section class="order-details-block">
              <div class="order-details-title">Полная информация</div>
              <div class="order-details-line">${safeName}</div>
              <div class="order-details-line">${safePhone}</div>
              <div class="order-details-line">${safeEmail}</div>
            </section>
            <section class="order-details-block">
              <div class="order-details-title">Адрес доставки</div>
              <div class="order-details-line">${safeAddress || "Не указан"}</div>
              <div class="order-details-sub">ТЗ: ${safeTask || "—"}</div>
              <div class="order-details-sub">Настройки: ${safeDetails}</div>
            </section>
            <section class="order-details-block">
              <div class="order-details-title">Действия</div>
              <a class="order-details-link" href="${order.filePath || "#"}" ${order.filePath ? "target=\"_blank\" rel=\"noopener noreferrer\"" : ""}>Скачать файл</a>
              <button class="order-details-link order-details-link--btn" type="button" data-open-order-chat="${order.id}">Задать вопрос</button>
            </section>
          </div>
        </td>
      </tr>`;
  }

  async function loadOrders() {
    try {
      const data = await API.request("/orders");
      if (!data.orders || data.orders.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center; color:#9aa1b6;">У вас пока нет заказов.</td>
          </tr>`;
        return;
      }
      tbody.innerHTML = data.orders.map(createRow).join("");
      tbody.querySelectorAll(".js-toggle-order").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-order-id");
          const row = tbody.querySelector(`.js-order-details[data-order-id="${id}"]`);
          if (!row) return;
          const opened = row.style.display !== "none";
          row.style.display = opened ? "none" : "table-row";
          button.textContent = opened ? "⌄" : "⌃";
        });
      });
      tbody.querySelectorAll("[data-open-order-chat]").forEach((button) => {
        button.addEventListener("click", () => {
          const orderId = button.getAttribute("data-open-order-chat");
          if (!orderId) return;
          window.dispatchEvent(new CustomEvent("order-chat:open", { detail: { orderId } }));
        });
      });
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("login.html");
        return;
      }
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; color:#f87171;">${error.message}</td>
        </tr>`;
    }
  }

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      loadOrders();
    })
    .catch((error) => {
      if (error.status === 401) {
        window.location.replace("login.html");
      }
    });
})();
