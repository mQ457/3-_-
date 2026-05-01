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
    const safeName = (order.user?.fullName || "—").replace(/</g, "&lt;");
    const safePhone = (order.user?.phone || "—").replace(/</g, "&lt;");
    const safeEmail = (order.user?.email || "—").replace(/</g, "&lt;");
    const safeOrderId = (order.id || "—").replace(/</g, "&lt;");
    const safeServiceType = (order.serviceType || "—").replace(/</g, "&lt;");
    const safeCardMask = (order.cardMask || "—").replace(/</g, "&lt;");
    const safeFileName = (order.fileName || "Не указано").replace(/</g, "&lt;");
    const safeFileSize = Number(order.fileSize || 0) > 0 ? `${Number(order.fileSize).toLocaleString("ru-RU")} Б` : "Не указано";
    const details = order.details || {};
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
          <div class="admin-order-details-panel">
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Контактные данные</div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">ФИО</span><span class="admin-order-kv__value">${safeName}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Телефон</span><span class="admin-order-kv__value">${safePhone}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Email</span><span class="admin-order-kv__value">${safeEmail}</span></div>
            </section>
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Заказ и доставка</div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">ID заказа</span><span class="admin-order-kv__value">${safeOrderId}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Тип услуги</span><span class="admin-order-kv__value">${safeServiceType}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Адрес доставки</span><span class="admin-order-kv__value">${safeAddress || "Не указано"}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Карта оплаты</span><span class="admin-order-kv__value">${safeCardMask}</span></div>
            </section>
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Параметры производства</div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Количество</span><span class="admin-order-kv__value">${safeQty}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Технология</span><span class="admin-order-kv__value">${safeTechnology}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Материал</span><span class="admin-order-kv__value">${safeMaterial}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Цвет</span><span class="admin-order-kv__value">${safeColor}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Толщина</span><span class="admin-order-kv__value">${safeThickness}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Объем модели</span><span class="admin-order-kv__value">${safeVolume}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Сложность</span><span class="admin-order-kv__value">${safeComplexity}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Оценка часов</span><span class="admin-order-kv__value">${safeHours}</span></div>
            </section>
            <section class="admin-order-details-block">
              <div class="admin-order-details__title">Файл и комментарий</div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Файл</span><span class="admin-order-kv__value">${safeFileName}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">Размер файла</span><span class="admin-order-kv__value">${safeFileSize}</span></div>
              <div class="admin-order-kv"><span class="admin-order-kv__key">ТЗ</span><span class="admin-order-kv__value">${safeTask || "Не указано"}</span></div>
            </section>
            <section class="admin-order-details-block admin-order-details-block--actions">
              <div class="admin-order-details__title">Действия</div>
              <button class="btn-secondary" data-order-user="${order.user?.id || ""}">Профиль</button>
              <button class="btn-secondary" data-open-order-notify="${order.orderNumber || order.id}">Уведомить клиента</button>
              ${
                safeFilePath
                  ? `<a class="admin-order-details__link" href="${safeFilePath}" target="_blank" rel="noopener noreferrer">Скачать файл</a>`
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
