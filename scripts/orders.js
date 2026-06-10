(function () {
  const API = window.AppBootstrap;
  const tbody = document.querySelector(".orders-table tbody");
  const ORDER_TOGGLE_SRC = "image/Frame_1_1179.png";
  const doneStatuses = new Set(["Завершен", "Готов к выдаче", "Модель готова", "Отправлен"]);
  const progressStatuses = new Set(["Ожидает оценки", "Ожидание звонка", "В очереди", "Печатается", "Пост-обработка", "В работе", "Сканирование", "Печать", "Посылка в пути"]);

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
    if (!Number.isFinite(amount) || amount <= 0) return "Цена уточняется";
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

  function detailRow(label, value) {
    return `<div class="order-kv"><span class="order-kv__key">${escapeHtml(label)}</span><span class="order-kv__value">${escapeHtml(notEmpty(value))}</span></div>`;
  }

  function buildServiceBriefRows(order) {
    const brief = order.details?.serviceBrief || {};
    if (!brief || typeof brief !== "object" || Object.keys(brief).length === 0) {
      return detailRow("Анкета", "Не заполнена");
    }
    if (order.serviceType === "modeling") {
      return [
        detailRow("Что нужно сделать", brief.kindLabel),
        detailRow("Тип модели", brief.objectTypeLabel),
        detailRow("Точность", brief.accuracyLabel),
        detailRow("Печатать после моделирования", brief.printAfterModeling ? "Да" : "Нет"),
        detailRow("Описание", brief.description),
      ].join("");
    }
    if (order.serviceType === "scan") {
      const dimensions = [brief.lengthMm, brief.widthMm, brief.heightMm].filter((value) => Number(value) > 0);
      return [
        detailRow("Что сканируем", brief.objectTypeLabel),
        detailRow("Размер", brief.objectSizeLabel),
        detailRow("Габариты", dimensions.length ? `${dimensions.join(" × ")} мм` : ""),
        detailRow("Поверхность", brief.surfaceTypeLabel),
        detailRow("Результат", brief.resultTypeLabel),
        detailRow("Точность", brief.accuracyLabel),
        detailRow("Передача объекта", brief.transferMethodLabel),
        detailRow("Комментарий", brief.description),
      ].join("");
    }
    return detailRow("Анкета", "Для 3Д-печати не требуется");
  }

  function getStatusClass(status) {
    if (doneStatuses.has(status)) return "ok";
    if (progressStatuses.has(status)) return "progress";
    return "wait";
  }

  function buildDeliveryBlock(order) {
    const d = order.delivery || {};
    const address = d.deliveryPointAddress || order.deliveryAddress;
    const lines = [
      `<div class="order-kv"><span class="order-kv__key">Тип</span><span class="order-kv__value">${escapeHtml(d.deliveryType === "russian_post" ? "Почта России" : "Без доставки / вручную")}</span></div>`,
      `<div class="order-kv"><span class="order-kv__key">ПВЗ / адрес</span><span class="order-kv__value">${escapeHtml(notEmpty(address))}</span></div>`,
      `<div class="order-kv"><span class="order-kv__key">Индекс</span><span class="order-kv__value">${escapeHtml(notEmpty(d.deliveryPointIndex))}</span></div>`,
      `<div class="order-kv"><span class="order-kv__key">Стоимость доставки</span><span class="order-kv__value">${d.deliveryPrice > 0 ? `${d.deliveryPrice} ₽` : "—"}</span></div>`,
    ];
    if (d.showClientPickup && (d.trackingNumber || d.clientPickupQrData)) {
      lines.push(
        `<div class="order-kv"><span class="order-kv__key">Трек-номер</span><span class="order-kv__value">${escapeHtml(notEmpty(d.trackingNumber || d.shipmentBarcode))}</span></div>`,
        `<button type="button" class="btn btn-ghost" data-show-pickup-qr="${escapeHtml(order.id)}">QR для получения</button>`
      );
    }
    return lines.join("");
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
    const serviceBriefHtml = buildServiceBriefRows(order);
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
          <button class="btn btn-ghost js-toggle-order orders-toggle-btn" type="button" data-order-id="${escapeHtml(order.id)}" aria-expanded="false" aria-label="Развернуть детали заказа">
            <span class="orders-toggle-icon" aria-hidden="true"></span>
          </button>
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
              ${buildDeliveryBlock(order)}
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
            <section class="order-details-block">
              <div class="order-details-title">Анкета услуги</div>
              ${serviceBriefHtml}
            </section>
            <section class="order-details-block order-details-block--actions">
              <div class="order-details-title">Действия</div>
              <a class="order-details-link ${hasFile ? "" : "is-disabled"}" href="${fileHref}" ${hasFile ? "target=\"_blank\" rel=\"noopener noreferrer\" download" : "aria-disabled=\"true\""}>Скачать файл</a>
              <a class="order-details-link order-details-link--btn" href="profile.html#support-form">Задать вопрос</a>
            </section>
          </div>
        </td>
      </tr>`;
  }

  async function loadOrders() {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="table-loading-cell">
          <span class="inline-spinner" aria-hidden="true"></span>
          <span>Загружаем заказы...</span>
        </td>
      </tr>`;
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
      tbody.querySelectorAll("[data-show-pickup-qr]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-show-pickup-qr");
          const order = data.orders.find((row) => row.id === id);
          const code = order?.delivery?.clientPickupQrData || order?.delivery?.trackingNumber || "";
          window.PochtaQr?.openPochtaQrModal({ title: "QR для получения", code });
        });
      });
      tbody.querySelectorAll(".js-toggle-order").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-order-id");
          const row = tbody.querySelector(`.js-order-details[data-order-id="${id}"]`);
          if (!row) return;
          const opened = row.style.display !== "none";
          row.style.display = opened ? "none" : "table-row";
          const nowOpen = row.style.display !== "none";
          row.classList.toggle("is-open", nowOpen);
          button.classList.toggle("is-expanded", nowOpen);
          button.setAttribute("aria-expanded", nowOpen ? "true" : "false");
          button.setAttribute("aria-label", nowOpen ? "Свернуть детали заказа" : "Развернуть детали заказа");
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

  let realtimeSocket = null;

  function connectRealtime() {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      realtimeSocket = new WebSocket(`${protocol}
      realtimeSocket.addEventListener("message", (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data || "{}");
        } catch {
          payload = null;
        }
        if (payload?.event === "order:updated") loadOrders();
      });
    } catch {

    }
  }

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      loadOrders();
      connectRealtime();
    })
    .catch((error) => {
      if (error.status === 401) {
        window.location.replace("login.html");
      }
    });
})();
