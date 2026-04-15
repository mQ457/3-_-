(function () {
  const API = window.AdminCommon;
  const queryEl = document.getElementById("notify-recipient-query");
  const searchBtn = document.getElementById("notify-recipient-search");
  const listEl = document.getElementById("notify-recipient-list");
  const formEl = document.getElementById("notify-form");
  const recipientEl = document.getElementById("notify-recipient");
  const textEl = document.getElementById("notify-text");
  const fileEl = document.getElementById("notify-file");
  const statusEl = document.getElementById("notify-status");
  const messagesEl = document.getElementById("notify-messages");
  const initialQuery = new URLSearchParams(window.location.search).get("query") || "";
  let selectedRecipientId = "";
  let recipients = [];
  let messages = [];

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#ff9d9d" : "#93d5ae";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function renderMessages() {
    if (!messagesEl) return;
    if (!selectedRecipientId) {
      messagesEl.innerHTML = '<div class="muted-small">Выберите клиента, чтобы увидеть историю уведомлений.</div>';
      return;
    }
    if (!messages.length) {
      messagesEl.innerHTML = '<div class="muted-small">Диалог пока пуст.</div>';
      return;
    }
    messagesEl.innerHTML = messages
      .map((item) => {
        const title = item.senderType === "user" ? "Клиент" : "Консультант";
        const file = item.filePath
          ? `<a class="order-message-file" href="${escapeHtml(item.filePath)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              item.fileName || "Файл"
            )}</a>`
          : "";
        return `
          <article class="msg ${item.senderType === "user" ? "" : "admin"}">
            <b>${title}</b>
            <div>${escapeHtml(item.message || "")}</div>
            ${file}
            <small>${escapeHtml(formatTime(item.createdAt))}</small>
          </article>
        `;
      })
      .join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function clearRecipientUnread(userId) {
    if (!userId) return;
    recipients = recipients.map((item) => {
      if (item.id !== userId) return item;
      return { ...item, unreadIncoming: 0 };
    });
  }

  async function loadConversation() {
    if (!selectedRecipientId) {
      messages = [];
      renderMessages();
      return;
    }
    try {
      const data = await API.request(`/admin/notifications/user/${encodeURIComponent(selectedRecipientId)}?limit=100`);
      messages = Array.isArray(data.notifications) ? data.notifications : [];
      renderMessages();
    } catch (error) {
      messages = [];
      messagesEl.innerHTML = `<div class="muted-small" style="color:#ff9d9d;">${escapeHtml(
        error.message || "Не удалось загрузить историю."
      )}</div>`;
    }
  }

  function renderRecipients() {
    if (!recipients.length) {
      listEl.innerHTML = '<div class="muted-small">Получатели не найдены.</div>';
      return;
    }
    listEl.innerHTML = recipients
      .map((user) => {
        const active = user.id === selectedRecipientId ? " active" : "";
        const name = user.fullName || user.phone || "Клиент";
        const unreadIncoming = Number(user.unreadIncoming || 0);
        const unreadDot = unreadIncoming > 0 ? '<span class="chat-unread-dot" aria-label="Есть новый ответ клиента"></span>' : "";
        const hint = [`ID ${user.id}`, user.phone, user.email, user.orderNumber ? `Заказ ${user.orderNumber}` : ""]
          .filter(Boolean)
          .join(" · ");
        return `
          <div class="chat-item${active}" data-recipient-id="${user.id}">
            <div class="chat-item__title-row">
              <b>${name}</b>
              ${unreadDot}
            </div>
            <div style="font-size:12px;color:#99a2be;">${hint}</div>
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll("[data-recipient-id]").forEach((node) => {
      node.addEventListener("click", () => {
        selectedRecipientId = node.getAttribute("data-recipient-id") || "";
        const user = recipients.find((item) => item.id === selectedRecipientId);
        recipientEl.value = user ? `${user.fullName || "Клиент"} (${user.phone || "без телефона"})` : "";
        clearRecipientUnread(selectedRecipientId);
        renderRecipients();
        loadConversation().then(markCurrentRecipientRead);
      });
    });
  }

  async function markCurrentRecipientRead() {
    if (!selectedRecipientId) return;
    try {
      await API.request(`/admin/notifications/user/${encodeURIComponent(selectedRecipientId)}/read`, { method: "PATCH" });
      clearRecipientUnread(selectedRecipientId);
      renderRecipients();
      if (typeof API.refreshNavUpdates === "function") {
        await API.refreshNavUpdates();
      }
    } catch (_error) {}
  }

  async function searchRecipients() {
    const query = String(queryEl?.value || "").trim();
    try {
      const data = await API.request(`/admin/notifications/recipients?query=${encodeURIComponent(query)}`);
      recipients = data.recipients || [];
      if (selectedRecipientId && !recipients.some((item) => item.id === selectedRecipientId)) {
        selectedRecipientId = "";
        recipientEl.value = "";
      }
      setStatus("", false);
      renderRecipients();
      if (!selectedRecipientId && recipients[0]) {
        selectedRecipientId = recipients[0].id;
        recipientEl.value = `${recipients[0].fullName || "Клиент"} (${recipients[0].phone || "без телефона"})`;
        clearRecipientUnread(selectedRecipientId);
        renderRecipients();
        await loadConversation();
        await markCurrentRecipientRead();
      }
    } catch (error) {
      if (error.status === 404) {
        try {
          const [usersData, ordersData] = await Promise.all([
            API.request("/admin/users?limit=500"),
            API.request("/admin/orders?limit=500"),
          ]);
          const q = query.toLowerCase();
          const qDigits = query.replace(/\D/g, "");
          const users = Array.isArray(usersData.users) ? usersData.users : [];
          const orders = Array.isArray(ordersData.orders) ? ordersData.orders : [];
          const orderByUserId = new Map();
          orders.forEach((order) => {
            if (!order?.user?.id) return;
            if (!orderByUserId.has(order.user.id)) orderByUserId.set(order.user.id, []);
            orderByUserId.get(order.user.id).push(order);
          });
          recipients = users
            .filter((user) => {
              const fullName = String(user.fullName || "").toLowerCase();
              const phone = String(user.phone || "").toLowerCase();
              const email = String(user.email || "").toLowerCase();
              const userId = String(user.id || "").toLowerCase();
              const phoneDigits = phone.replace(/\D/g, "");
              const byUser = fullName.includes(q) || phone.includes(q) || email.includes(q) || userId.includes(q);
              const byDigits = qDigits && phoneDigits.includes(qDigits);
              const userOrders = orderByUserId.get(user.id) || [];
              const byOrder = userOrders.some((order) => {
                const orderNumber = String(order.orderNumber || "").toLowerCase();
                const orderId = String(order.id || "").toLowerCase();
                return orderNumber.includes(q) || orderId.includes(q);
              });
              return byUser || byDigits || byOrder;
            })
            .map((user) => {
              const userOrders = orderByUserId.get(user.id) || [];
              return {
                id: user.id,
                fullName: user.fullName || "",
                phone: user.phone || "",
                email: user.email || "",
                orderNumber: userOrders[0]?.orderNumber || "",
              };
            });
          if (selectedRecipientId && !recipients.some((item) => item.id === selectedRecipientId)) {
            selectedRecipientId = "";
            recipientEl.value = "";
          }
          setStatus("", false);
          renderRecipients();
          if (!selectedRecipientId && recipients[0]) {
            selectedRecipientId = recipients[0].id;
            recipientEl.value = `${recipients[0].fullName || "Клиент"} (${recipients[0].phone || "без телефона"})`;
            clearRecipientUnread(selectedRecipientId);
            renderRecipients();
            await loadConversation();
            await markCurrentRecipientRead();
          }
          return;
        } catch (fallbackError) {
          setStatus(fallbackError.message || "Ошибка резервного поиска получателя.", true);
          return;
        }
      }
      setStatus(error.message || "Ошибка поиска получателя.", true);
    }
  }

  async function sendNotification(event) {
    event.preventDefault();
    if (!selectedRecipientId) {
      setStatus("Сначала выберите получателя.", true);
      return;
    }
    const message = String(textEl?.value || "").trim();
    if (!message) {
      setStatus("Введите текст уведомления.", true);
      return;
    }
    const body = new FormData();
    body.append("userId", selectedRecipientId);
    body.append("message", message);
    const file = fileEl?.files?.[0];
    if (file) body.append("attachment", file);
    try {
      await API.request("/admin/notifications/send", {
        method: "POST",
        body,
      });
      textEl.value = "";
      if (fileEl) fileEl.value = "";
      setStatus("Уведомление отправлено.", false);
      await loadConversation();
      await markCurrentRecipientRead();
      if (typeof API.markNavSectionSeen === "function") {
        await API.markNavSectionSeen("notifications");
      } else if (typeof API.refreshNavUpdates === "function") {
        await API.refreshNavUpdates();
      }
    } catch (error) {
      setStatus(error.message || "Не удалось отправить уведомление.", true);
    }
  }

  searchBtn?.addEventListener("click", searchRecipients);
  queryEl?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchRecipients();
  });
  formEl?.addEventListener("submit", sendNotification);

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      renderRecipients();
      renderMessages();
      await searchRecipients();
      if (initialQuery) {
        queryEl.value = initialQuery;
        await searchRecipients();
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
      }
    }
  }

  init();
})();
