(function () {
  const API = window.AppBootstrap;
  if (!API || typeof API.request !== "function") return;
  const protectedPaths = ["/profile.html", "/orders.html", "/delivery-address.html", "/payment.html"];
  const pathname = String(window.location.pathname || "").toLowerCase().replace(/\\/g, "/");
  if (!protectedPaths.includes(pathname)) return;

  let notifications = [];
  let pollTimer = null;

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

  const root = document.createElement("div");
  root.className = "order-notify-root";
  root.innerHTML = `
    <button class="order-notify-bell" type="button" aria-label="Уведомления">
      <img src="image/bell(1).png" alt="Уведомления" />
      <span class="order-notify-badge" style="display:none;">0</span>
    </button>
    <section class="order-notify-panel" style="display:none;">
      <div class="order-notify-panel__head">
        <b>Уведомления</b>
        <button type="button" class="order-notify-close">×</button>
      </div>
      <div class="order-notify-list"></div>
      <form class="order-notify-reply" novalidate>
        <textarea class="order-notify-reply__text" rows="3" placeholder="Ответить консультанту"></textarea>
        <div class="order-notify-reply__actions">
          <input class="order-notify-reply__file" type="file" />
          <button type="submit" class="btn-primary order-notify-reply__send" style="width: 50%; padding: 12px 12px; border-radius: 12px; display: block; font-size: 12px; font-weight: 600; color: #fff; background: #ea4d3a; border: none; cursor: pointer; transition: background 0.3s ease;">Отправить</button>
        </div>
        <div class="order-notify-reply__status"></div>
      </form>
    </section>
  `;
  document.body.appendChild(root);

  const bellBtn = root.querySelector(".order-notify-bell");
  const badge = root.querySelector(".order-notify-badge");
  const panel = root.querySelector(".order-notify-panel");
  const closeBtn = root.querySelector(".order-notify-close");
  const listRoot = root.querySelector(".order-notify-list");
  const replyForm = root.querySelector(".order-notify-reply");
  const replyText = root.querySelector(".order-notify-reply__text");
  const replyFile = root.querySelector(".order-notify-reply__file");
  const replyStatus = root.querySelector(".order-notify-reply__status");

  function setUnread(value) {
    const count = Number(value || 0);
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "inline-flex" : "none";
  }

  async function loadUnread() {
    try {
      const data = await API.request("/profile/notifications/unread");
      setUnread(data.unreadCount || 0);
    } catch (_error) {}
  }

  function renderNotifications() {
    if (!notifications.length) {
      listRoot.innerHTML = '<div class="order-notify-empty">0 Уведомлений</div>';
      return;
    }
    listRoot.innerHTML = notifications
      .map((item) => {
        const file = item.filePath
          ? `<a class="order-message-file" href="${escapeHtml(item.filePath)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              item.fileName || "Файл"
            )}</a>`
          : "";
        const title = item.senderType === "user" ? "Вы" : "Консультант";
        return `
          <article class="notify-item">
            <div class="notify-item__content">
              <div class="notify-item__title">${title}</div>
              <div class="notify-item__text">${escapeHtml(item.message || "")}</div>
              ${file}
              <div class="notify-item__time">${escapeHtml(formatTime(item.createdAt))}</div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function setReplyStatus(message, isError) {
    if (!replyStatus) return;
    replyStatus.textContent = message || "";
    replyStatus.style.color = isError ? "#bb1f31" : "#0f7a2a";
  }

  async function sendReply(event) {
    event.preventDefault();
    const message = String(replyText?.value || "").trim();
    const file = replyFile?.files?.[0];
    if (!message && !file) {
      setReplyStatus("Введите текст или добавьте файл.", true);
      return;
    }
    const body = new FormData();
    body.append("message", message);
    if (file) body.append("attachment", file);
    try {
      await API.request("/profile/notifications/reply", { method: "POST", body });
      if (replyText) replyText.value = "";
      if (replyFile) replyFile.value = "";
      setReplyStatus("Ответ отправлен.", false);
      await loadNotifications();
      await loadUnread();
    } catch (error) {
      setReplyStatus(error.message || "Не удалось отправить ответ.", true);
    }
  }

  async function loadNotifications() {
    try {
      const data = await API.request("/profile/notifications?limit=20");
      notifications = data.notifications || [];
      renderNotifications();
    } catch (_error) {
      listRoot.innerHTML = '<div class="order-notify-empty">Не удалось загрузить уведомления.</div>';
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      await loadUnread();
      await loadNotifications();
    }, 8000);
  }

  bellBtn.addEventListener("click", async () => {
    const isHidden = panel.style.display === "none" || !panel.style.display;
    panel.style.display = isHidden ? "flex" : "none";
    if (isHidden) {
      await loadNotifications();
      await API.request("/profile/notifications/read", { method: "PATCH" }).catch(() => {});
      await loadUnread();
    }
  });
  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
  });
  replyForm?.addEventListener("submit", sendReply);

  loadUnread();
  loadNotifications();
  startPolling();
})();
