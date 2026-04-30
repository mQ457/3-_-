(function () {
  const API = window.AppBootstrap;
  const tbody = document.querySelector(".orders-table tbody");
  const doneStatuses = new Set(["Завершен", "Готов к выдаче", "Модель готова", "Отправлен"]);
  const progressStatuses = new Set(["В очереди", "Печатается", "Пост-обработка", "В работе", "Сканирование", "Печать", "Посылка в пути"]);

  function formatDate(value) {
    try {
      return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return value || "Не указано";
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function notEmpty(value) {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : "Не указано";
  }

  function formatAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Не указано";
    return `${amount.toLocaleString("ru-RU")} руб.`;
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "Не указано";
    if (size < 1024) return `${size} Б`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1).replace(".", ",")} КБ`;
    return `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
  }

  function formatDetailValue(rawValue, key) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return "Не указано";
    if (key === "modelVolumeCm3") {
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? `${value.toLocaleString("ru-RU")} см3` : "Не указано";
    }
    if (key === "thickness") {
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? `${String(value).replace(".", ",")} мм` : "Не указано";
    }
    if (key === "qty" || key === "complexity" || key === "estimatedHours") {
      const value = Number(rawValue);
      return Number.isFinite(value) && value > 0 ? value.toLocaleString("ru-RU") : "Не указано";
    }
    if (typeof rawValue === "object") return "Не указано";
    return notEmpty(rawValue);
  }

  function buildDetailRows(details) {
    const labels = [
      ["qty", "Количество"],
      ["technology", "Технология"],
      ["material", "Материал"],
      ["color", "Цвет"],
      ["thickness", "Толщина"],
      ["modelVolumeCm3", "Объем модели"],
      ["complexity", "Сложность"],
      ["estimatedHours", "Оценка часов"],
    ];
    return labels
      .map(([key, label]) => {
        const value = formatDetailValue(details?.[key], key);
        return `<div class="order-kv"><span class="order-kv__key">${label}</span><span class="order-kv__value">${escapeHtml(value)}</span></div>`;
      })
      .join("");
  }

  function getStatusClass(status) {
    if (doneStatuses.has(status)) return "ok";
    if (progressStatuses.has(status)) return "progress";
    return "wait";
  }

  function createRow(order) {
    const safeTask = escapeHtml(notEmpty(order.modelingTask));
    const safeFile = escapeHtml(notEmpty(order.fileName));
    const safeAddress = escapeHtml(notEmpty(order.deliveryAddress));
    const safeName = escapeHtml(notEmpty(order.user?.fullName));
    const safePhone = escapeHtml(notEmpty(order.user?.phone));
    const safeEmail = escapeHtml(notEmpty(order.user?.email));
    const safeCardMask = escapeHtml(notEmpty(order.paymentCardMask));
    const safeServiceType = escapeHtml(notEmpty(order.serviceType));
    const safeServiceName = escapeHtml(notEmpty(order.serviceName));
    const safeOrderId = escapeHtml(notEmpty(order.id));
    const safeOrderStatus = escapeHtml(notEmpty(order.status));
    const safeOrderDate = escapeHtml(formatDate(order.createdAt));
    const safeAmount = escapeHtml(formatAmount(order.totalAmount));
    const safeFileSize = escapeHtml(formatFileSize(order.fileSize));
    const safeOrderNumber = escapeHtml(notEmpty(order.orderNumber || order.id?.slice(0, 8)));
    const detailsHtml = buildDetailRows(order.details || {});
    const hasFile = Boolean(order.filePath);
    const fileHref = hasFile ? escapeHtml(order.filePath) : "#";
    return `
      <tr class="orders-row-main">
        <td>#${safeOrderNumber}</td>
        <td>${safeServiceName}</td>
        <td>${safeFile}</td>
        <td>
          <span class="status-badge ${getStatusClass(order.status)}">${safeOrderStatus}</span>
        </td>
        <td>${safeOrderDate}</td>
        <td>${safeAmount}</td>
        <td>
          <button class="btn btn-ghost js-toggle-order orders-toggle-btn" type="button" data-order-id="${escapeHtml(order.id)}" aria-label="Развернуть"><img src="image/Frame_1_829.png" alt="exit"></button>
        </td>
      </tr>
      <tr class="js-order-details orders-row-details" data-order-id="${escapeHtml(order.id)}" style="display:none;">
        <td colspan="7">
          <div class="order-details-panel">
            <section class="order-details-block">
              <div class="order-details-title">Контактные данные</div>
              <div class="order-kv"><span class="order-kv__key">ФИО</span><span class="order-kv__value">${safeName}</span></div>
              <div class="order-kv"><span class="order-kv__key">Телефон</span><span class="order-kv__value">${safePhone}</span></div>
              <div class="order-kv"><span class="order-kv__key">Email</span><span class="order-kv__value">${safeEmail}</span></div>
            </section>
            <section class="order-details-block">
              <div class="order-details-title">Заказ и доставка</div>
              <div class="order-kv"><span class="order-kv__key">ID заказа</span><span class="order-kv__value">${safeOrderId}</span></div>
              <div class="order-kv"><span class="order-kv__key">Тип услуги</span><span class="order-kv__value">${safeServiceType}</span></div>
              <div class="order-kv"><span class="order-kv__key">Адрес доставки</span><span class="order-kv__value">${safeAddress}</span></div>
              <div class="order-kv"><span class="order-kv__key">Карта оплаты</span><span class="order-kv__value">${safeCardMask}</span></div>
            </section>
            <section class="order-details-block">
              <div class="order-details-title">Параметры производства</div>
              ${detailsHtml}
            </section>
            <section class="order-details-block">
              <div class="order-details-title">Файл и комментарий</div>
              <div class="order-kv"><span class="order-kv__key">Файл</span><span class="order-kv__value">${safeFile}</span></div>
              <div class="order-kv"><span class="order-kv__key">Размер файла</span><span class="order-kv__value">${safeFileSize}</span></div>
              <div class="order-kv"><span class="order-kv__key">ТЗ</span><span class="order-kv__value">${safeTask}</span></div>
            </section>
            <section class="order-details-block order-details-block--actions">
              <div class="order-details-title">Действия</div>
              <a class="order-details-link ${hasFile ? "" : "is-disabled"}" href="${fileHref}" ${hasFile ? "target=\"_blank\" rel=\"noopener noreferrer\"" : "aria-disabled=\"true\""}>Скачать файл</a>
              <button class="order-details-link order-details-link--btn" type="button" data-open-order-chat="${escapeHtml(order.id)}">Задать вопрос</button>
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
