(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("orders-body");
  const filterText = document.getElementById("filter-order-text");
  const filterStatus = document.getElementById("filter-order-status");
  const filterDate = document.getElementById("filter-order-date");
  const refreshBtn = document.getElementById("refresh-orders");
  let allOrders = [];
  const doneStatuses = new Set(["Завершен", "Готов к выдаче", "Модель готова", "Отправлен"]);
  const progressStatuses = new Set(["Ожидает оценки", "Ожидание звонка", "В очереди", "Печатается", "Пост-обработка", "В работе", "Сканирование", "Печать", "Посылка в пути"]);
  const ORDER_TOGGLE_SRC = "image/Frame_1_1179.png";

  /**
   * Экранирует значение для подстановки в HTML-атрибут.
   * @param {string} value
   * @returns {string}
   */
  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  /**
   * Имя файла для атрибута download у ссылки на модель заказа.
   * @param {{ fileName?: string, filePath?: string }} order
   * @returns {string}
   */
  function downloadFileName(order) {
    const raw = String(order.fileName || "").trim();
    if (raw) return raw.split(/[/\\]/).pop() || "model.stl";
    const fromPath = String(order.filePath || "").split("/").pop() || "";
    return fromPath || "model.stl";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("ru-RU");
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

  function detailRow(label, value) {
    return `<div class="admin-order-kv"><span class="admin-order-kv__key">${escapeHtml(label)}</span><span class="admin-order-kv__value">${escapeHtml(notEmpty(value))}</span></div>`;
  }

  function yesNo(value) {
    return value ? "Да" : "Нет";
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
        detailRow("Печатать после моделирования", yesNo(brief.printAfterModeling)),
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

  function formatAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Цена уточняется";
    return `${amount.toLocaleString("ru-RU")} ₽`;
  }

  function createRow(order) {
    const statuses = Array.isArray(order.allowedStatuses) && order.allowedStatuses.length ? order.allowedStatuses : [order.status];
    const isPrintService = order.serviceType === "print";
    const isQuoteService = order.serviceType === "scan" || order.serviceType === "modeling";
    const safeAddress = (order.address || "").replace(/</g, "&lt;");
    const safeTask = escapeHtml(order.modelingTask || "");
    const safeFilePath = (order.filePath || "").replace(/"/g, "&quot;");
    const dlName = escapeAttr(downloadFileName(order));
    const safeName = escapeHtml(order.user?.fullName || "—");
    const safePhone = escapeHtml(order.user?.phone || "—");
    const safeEmail = escapeHtml(order.user?.email || "—");
    const safeOrderId = escapeHtml(order.id || "—");
    const safeServiceType = escapeHtml(order.serviceType || "—");
    const safeCardMask = escapeHtml(order.cardMask || "—");
    const safeFileName = escapeHtml(order.fileName || "Не указано");
    const safeFileSize = Number(order.fileSize || 0) > 0 ? `${Number(order.fileSize).toLocaleString("ru-RU")} Б` : "Не указано";
    const details = order.details || {};
    const brief = details.serviceBrief || {};
    const safeServiceLabel = escapeHtml(order.serviceName || order.serviceType || "—");
    const safeStatus = escapeHtml(order.status || "—");
    const safeCreatedAt = escapeHtml(formatDate(order.createdAt));
    const safeAmount = escapeHtml(formatAmount(order.totalAmount));
    const hasBrief = brief && typeof brief === "object" && Object.keys(brief).length > 0;
    const hasFile = Boolean(order.fileName || order.filePath);
    const safeQty = Number(details.qty || 0) > 0 ? Number(details.qty).toLocaleString("ru-RU") : "Не указано";
    const safeTechnology = String(details.technology || "Не указано").replace(/</g, "&lt;");
    const safeMaterial = String(details.material || "Не указано").replace(/</g, "&lt;");
    const safeColor = String(details.color || "Не указано").replace(/</g, "&lt;");
    const safeThickness =
      Number(details.thickness || 0) > 0 ? `${String(details.thickness).replace(".", ",")} мм` : "Не указано";
    const safeVolume =
      Number(details.modelVolumeCm3 || 0) > 0 ? `${Number(details.modelVolumeCm3).toLocaleString("ru-RU")} см3` : "Не указано";
    const safeComplexity = Number(details.complexity || 0) > 0 ? Number(details.complexity).toLocaleString("ru-RU") : "Не указано";
    const safeHours =
      Number(details.estimatedHours || 0) > 0 ? Number(details.estimatedHours).toLocaleString("ru-RU") : "Не указано";
    const orderMetaSection = isQuoteService
      ? `<section class="admin-order-details-block">
          <div class="admin-order-details__title">Заявка</div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">ID заявки</span><span class="admin-order-kv__value">${safeOrderId}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Тип заявки</span><span class="admin-order-kv__value">${safeServiceLabel}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Статус</span><span class="admin-order-kv__value">${safeStatus}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Создана</span><span class="admin-order-kv__value">${safeCreatedAt}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Цена</span><span class="admin-order-kv__value">${safeAmount}</span></div>
        </section>`
      : `<section class="admin-order-details-block">
          <div class="admin-order-details__title">Заказ и доставка</div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">ID заказа</span><span class="admin-order-kv__value">${safeOrderId}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Тип услуги</span><span class="admin-order-kv__value">${safeServiceType}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">ПВЗ / адрес</span><span class="admin-order-kv__value">${(order.delivery?.deliveryPointAddress || safeAddress) || "Не указано"}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Индекс</span><span class="admin-order-kv__value">${order.delivery?.deliveryPointIndex || "—"}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Доставка</span><span class="admin-order-kv__value">${order.delivery?.deliveryPrice > 0 ? `${order.delivery.deliveryPrice} ₽` : "—"}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">ШПИ</span><span class="admin-order-kv__value">${order.delivery?.shipmentBarcode || order.delivery?.trackingNumber || "—"}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Карта оплаты</span><span class="admin-order-kv__value">${safeCardMask}</span></div>
        </section>`;
    const productionOrQuoteSection = isPrintService
      ? `<section class="admin-order-details-block">
          <div class="admin-order-details__title">Параметры производства</div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Количество</span><span class="admin-order-kv__value">${safeQty}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Технология</span><span class="admin-order-kv__value">${safeTechnology}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Материал</span><span class="admin-order-kv__value">${safeMaterial}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Цвет</span><span class="admin-order-kv__value">${safeColor}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Толщина</span><span class="admin-order-kv__value">${safeThickness}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Объем модели</span><span class="admin-order-kv__value">${safeVolume}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Сложность</span><span class="admin-order-kv__value">${safeComplexity}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Оценка часов</span><span class="admin-order-kv__value">${safeHours}</span></div>
        </section>`
      : `<section class="admin-order-details-block">
          <div class="admin-order-details__title">Данные заявки</div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Тип заявки</span><span class="admin-order-kv__value">${safeServiceLabel}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Цена</span><span class="admin-order-kv__value">${safeAmount}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Файл</span><span class="admin-order-kv__value">${hasFile ? "Есть" : "Нет"}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Анкета</span><span class="admin-order-kv__value">${hasBrief ? "Заполнена" : "Не заполнена"}</span></div>
          <div class="admin-order-kv"><span class="admin-order-kv__key">Комментарий</span><span class="admin-order-kv__value">${safeTask || "Не указано"}</span></div>
        </section>`;
    const priceSetterHtml = isQuoteService
      ? `<div class="admin-order-price-setter">
          <input class="input" type="number" min="1" step="1" placeholder="Назначить цену, ₽" data-order-price-input="${order.id}" value="${Number(order.totalAmount || 0) > 0 ? Number(order.totalAmount || 0) : ""}">
          <button class="btn-secondary" type="button" data-order-price-save="${order.id}">Сохранить цену</button>
        </div>`
      : `<div class="admin-order-kv">
          <span class="admin-order-kv__key">Цена</span>
          <span class="admin-order-kv__value">${safeAmount}</span>
        </div>`;
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
        <td>${formatAmount(order.totalAmount)}</td>
        <td>${formatDate(order.createdAt)}</td>
        <td><button class="btn-secondary admin-orders-toggle" type="button" data-toggle-order="${order.id}" aria-expanded="false" aria-label="Показать детали заказа"><img class="admin-orders-toggle__icon" src="${ORDER_TOGGLE_SRC}" width="18" height="18" alt=""></button></td>
      </tr>
      <tr class="admin-orders-row-details" data-order-id="${order.id}" style="display:none;">
        <td colspan="8">
          <div class="admin-order-details-panel">
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Контактные данные</div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">ФИО</span><span class="admin-order-kv__value">${safeName}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Телефон</span><span class="admin-order-kv__value">${safePhone}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Email</span><span class="admin-order-kv__value">${safeEmail}</span></div>
            </section>
            ${orderMetaSection}
            ${productionOrQuoteSection}
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Файл и комментарий</div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Файл</span><span class="admin-order-kv__value">${safeFileName}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Размер файла</span><span class="admin-order-kv__value">${safeFileSize}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">ТЗ</span><span class="admin-order-kv__value">${safeTask || "Не указано"}</span></div>
            </section>
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Анкета услуги</div>
              ${buildServiceBriefRows(order)}
            </section>
            <section class="admin-order-details-block admin-order-details-block--actions">
              <div class="admin-order-details__title">Действия</div>
              ${priceSetterHtml}
              <button class="btn-secondary" data-order-user="${order.user?.id || ""}">Профиль</button>
              <button class="btn-secondary" data-open-order-notify="${order.orderNumber || order.id}">Уведомить клиента</button>
              ${
                order.delivery?.shipmentBarcode || order.delivery?.shipmentQrData
                  ? `<button type="button" class="btn-secondary" data-admin-pochta-qr="${order.id}">QR отправления</button>`
                  : ""
              }
              ${
                order.delivery?.deliveryType === "russian_post" && !order.delivery?.shipmentBarcode
                  ? `<button type="button" class="btn-secondary" data-admin-pochta-create="${order.id}">Создать в Почте</button>`
                  : ""
              }
              ${
                safeFilePath
                  ? `<a class="admin-order-details__link" href="${safeFilePath}" download="${dlName}" rel="noopener noreferrer">Скачать файл</a>`
                  : ""
              }
            </section>
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
        const nowOpen = row.style.display !== "none";
        btn.classList.toggle("is-expanded", nowOpen);
        btn.setAttribute("aria-expanded", nowOpen ? "true" : "false");
        btn.setAttribute("aria-label", nowOpen ? "Скрыть детали заказа" : "Показать детали заказа");
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

    tbody.querySelectorAll("[data-order-price-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-order-price-save");
        const input = tbody.querySelector(`[data-order-price-input="${orderId}"]`);
        const amount = Math.round(Number(input?.value || 0));
        if (!orderId || !Number.isFinite(amount) || amount <= 0) {
          alert("Введите сумму больше 0.");
          return;
        }
        try {
          await API.request(`/admin/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ totalAmount: amount }),
          });
          await loadOrders();
        } catch (error) {
          alert(error.message || "Не удалось сохранить цену");
        }
      });
    });

    tbody.querySelectorAll("[data-admin-pochta-qr]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-admin-pochta-qr");
        const order = allOrders.find((row) => row.id === id);
        const code = order?.delivery?.shipmentQrData || order?.delivery?.shipmentBarcode || "";
        window.PochtaQr?.openPochtaQrModal({ title: "QR для печати (админ)", code });
      });
    });

    tbody.querySelectorAll("[data-admin-pochta-create]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-admin-pochta-create");
        try {
          await API.request(`/admin/orders/${id}/russian-post/shipment`, { method: "POST" });
          await loadOrders();
        } catch (error) {
          alert(error.message || "Не удалось создать отправление");
        }
      });
    });

    tbody.querySelectorAll("[data-open-order-notify]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const orderRef = btn.getAttribute("data-open-order-notify");
        if (!orderRef) return;
        window.location.href = `admin-notifications.html?query=${encodeURIComponent(orderRef)}`;
      });
    });

    tbody.querySelectorAll("a.admin-order-details__link[download]").forEach((anchor) => {
      anchor.addEventListener("click", async (event) => {
        const href = anchor.getAttribute("href");
        const suggestedName = anchor.getAttribute("download") || "model.stl";
        if (!href || href.startsWith("http")) return;
        event.preventDefault();
        try {
          const absoluteUrl = new URL(href, window.location.origin).href;
          const response = await fetch(absoluteUrl, { credentials: "same-origin" });
          if (!response.ok) throw new Error("fetch_failed");
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const temp = document.createElement("a");
          temp.href = objectUrl;
          temp.download = suggestedName;
          temp.rel = "noopener noreferrer";
          document.body.appendChild(temp);
          temp.click();
          temp.remove();
          URL.revokeObjectURL(objectUrl);
        } catch (_err) {
          window.location.href = href;
        }
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
