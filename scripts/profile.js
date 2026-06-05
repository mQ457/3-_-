(function () {
  const API = window.AppBootstrap;
  const form = document.getElementById("profile-form");
  const statusEl = document.getElementById("profile-status");
  const supportForm = document.getElementById("support-form");
  const supportStatus = document.getElementById("support-status");
  const supportChat = document.getElementById("support-chat");
  const supportMessages = document.getElementById("support-messages");
  const supportReplyForm = document.getElementById("support-reply-form");
  const supportChatClosedNote = document.getElementById("support-chat-closed-note");
  let activeThreadId = "";
  let activeThreadStatus = "";
  let realtimeSocket = null;
  let reconnectTimer = null;
  let pollingTimer = null;

  function senderMeta(senderType) {
    if (senderType === "admin") return { name: "Поддержка", roleClass: "is-admin" };
    if (senderType === "bot") return { name: "ИИ-помощник", roleClass: "is-bot" };
    return { name: "Вы", roleClass: "is-user" };
  }

  /**
   * Показывает/скрывает форму ответа и подсказку о закрытом чате в зависимости от статуса треда.
   */
  function syncReplyFormVisibility() {
    if (supportChatClosedNote) {
      const showClosedHint = Boolean(activeThreadId) && activeThreadStatus === "closed";
      supportChatClosedNote.style.display = showClosedHint ? "block" : "none";
    }
    if (supportChat && activeThreadStatus === "closed") {
      supportChat.style.display = "none";
    }
    if (!supportReplyForm) return;
    const canReply = Boolean(activeThreadId) && activeThreadStatus !== "closed";
    supportReplyForm.style.display = canReply ? "block" : "none";
  }

  const sidebarName = document.getElementById("sidebar-name");
  const emailInput = form?.elements?.email;
  const phoneInput = form?.elements?.phone;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function fillProfile(profile) {
    if (!form) return;
    form.elements.fullName.value = profile.fullName || "";
    form.elements.phone.value = profile.phone || "";
    form.elements.email.value = profile.email || "";
    sidebarName.textContent = profile.fullName || "Пользователь";
  }

  function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function normalizePhoneInput(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function normalizeRussianPhone(value) {
    const raw = normalizePhoneInput(value);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
    if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
    if (digits.length === 10) return `+7${digits}`;
    if (raw.startsWith("+")) return `+${digits}`;
    return digits ? `+${digits}` : "";
  }

  function isValidPhone(value) {
    return /^\+7\d{10}$/.test(normalizeRussianPhone(value));
  }

  function setupProfileValidation() {
    if (phoneInput) {
      phoneInput.setAttribute("inputmode", "numeric");
      phoneInput.setAttribute("autocomplete", "tel");
      phoneInput.setAttribute("pattern", "^[+]?[0-9]{10,15}$");
      phoneInput.maxLength = 16;
      phoneInput.addEventListener("input", () => {
        phoneInput.value = normalizePhoneInput(phoneInput.value);
      });
    }
    if (emailInput) {
      emailInput.setAttribute("inputmode", "email");
      emailInput.setAttribute("autocomplete", "email");
      emailInput.addEventListener("blur", () => {
        const value = String(emailInput.value || "").trim();
        emailInput.value = value;
      });
    }
  }

  async function loadProfile() {
    setStatus("Загружаем профиль...", false);
    try {
      const data = await API.request("/profile/me", { method: "GET" });
      fillProfile(data.profile || {});
      setStatus("", false);
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("login.html");
        return;
      }
      setStatus(error.message, true);
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = normalizeRussianPhone(form.elements.phone.value || "");
    const email = String(form.elements.email.value || "").trim();
    if (!isValidPhone(phone)) {
      setStatus("Введите российский номер: +79991234567, 79991234567 или 89991234567.", true);
      return;
    }
    if (!isValidEmail(email)) {
      setStatus("Введите корректный email.", true);
      return;
    }
    setStatus("Сохраняем данные...", false);
    try {
      const payload = {
        fullName: String(form.elements.fullName.value || "").trim(),
        phone,
        email,
      };
      const data = await API.request("/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fillProfile(data.profile || {});
      API.setCachedUser?.({
        ...(window.__APP_USER__ || {}),
        ...(data.profile || {}),
      });
      setStatus("Данные сохранены.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  async function loadThreads() {
    supportMessages.innerHTML = '<div class="support-loading"><span class="inline-spinner" aria-hidden="true"></span><span>Загружаем обращения...</span></div>';
    try {
      const data = await API.request("/profile/support/threads", { method: "GET" });
      const threads = data.threads || [];
      if (threads.length === 0) {
        activeThreadId = "";
        activeThreadStatus = "";
        supportMessages.innerHTML = '<div class="muted-small">Обращений пока нет. Напишите вопрос выше, и чат появится здесь.</div>';
        supportChat.style.display = "none";
        syncReplyFormVisibility();
        return;
      }
      if (!activeThreadId) {
        activeThreadId = threads[0].id;
      }
      if (!threads.some((thread) => thread.id === activeThreadId)) {
        activeThreadId = threads[0].id;
      }
      const activeThread = threads.find((thread) => thread.id === activeThreadId) || threads[0];
      activeThreadStatus = String(activeThread?.status || "");
      syncReplyFormVisibility();
      supportChat.style.display = activeThreadStatus === "closed" ? "none" : "block";
      await loadMessages();
    } catch (_error) {
      supportMessages.innerHTML = "";
    }
  }

  function startFallbackPolling() {
    if (pollingTimer) return;
    pollingTimer = setInterval(() => {
      loadThreads().catch(() => {});
    }, 25000);
  }

  function stopFallbackPolling() {
    if (!pollingTimer) return;
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  function queueReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectRealtime();
    }, 2000);
  }

  function connectRealtime() {
    try {
      if (realtimeSocket && (realtimeSocket.readyState === WebSocket.OPEN || realtimeSocket.readyState === WebSocket.CONNECTING)) {
        return;
      }
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      realtimeSocket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      realtimeSocket.addEventListener("open", () => {
        stopFallbackPolling();
      });
      realtimeSocket.addEventListener("message", (event) => {
        let data = null;
        try {
          data = JSON.parse(event.data || "{}");
        } catch (_error) {
          data = null;
        }
        if (!data || data.event !== "support:updated") return;
        loadThreads().catch(() => {});
      });
      realtimeSocket.addEventListener("close", () => {
        startFallbackPolling();
        queueReconnect();
      });
      realtimeSocket.addEventListener("error", () => {
        startFallbackPolling();
      });
    } catch (_error) {
      startFallbackPolling();
      queueReconnect();
    }
  }

  async function loadMessages() {
    if (!activeThreadId) return;
    supportMessages.innerHTML = '<div class="support-loading"><span class="inline-spinner" aria-hidden="true"></span><span>Загружаем переписку...</span></div>';
    try {
      const data = await API.request(`/profile/support/threads/${activeThreadId}/messages`, { method: "GET" });
      const messages = data.messages || [];
      supportChat.style.display = activeThreadStatus === "closed" ? "none" : "block";
      supportMessages.innerHTML = messages
        .map((msg) => {
          const sender = senderMeta(msg.senderType);
          return `
          <div class="support-chat__message ${sender.roleClass}">
            <div class="support-chat__meta">${sender.name} • ${new Date(msg.createdAt).toLocaleString("ru-RU")}</div>
            <div class="support-chat__text">${msg.message}</div>
          </div>`;
        })
        .join("");
      supportMessages.scrollTop = supportMessages.scrollHeight;
    } catch (_error) {}
  }

  supportForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    supportStatus.textContent = "Отправка...";
    supportStatus.style.color = "#16a34a";
    try {
      const payload = {
        subject: String(supportForm.elements.subject.value || "").trim(),
        message: String(supportForm.elements.message.value || "").trim(),
      };
      await API.request("/profile/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      supportStatus.textContent = "Сообщение отправлено.";
      supportForm.reset();
      await loadThreads();
    } catch (error) {
      supportStatus.textContent = error.message;
      supportStatus.style.color = "#dc2626";
    }
  });

  supportReplyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeThreadId || activeThreadStatus === "closed") return;
    const message = String(supportReplyForm.elements.message.value || "").trim();
    if (!message) return;
    try {
      await API.request(`/profile/support/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      supportReplyForm.reset();
      await loadMessages();
    } catch (_error) {}
  });

  supportReplyForm?.elements?.message?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    supportReplyForm.requestSubmit();
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      loadProfile();
      loadThreads();
      connectRealtime();
      startFallbackPolling();
    })
    .catch((error) => {
      if (error.status === 401) {
        window.location.replace("login.html");
      }
    });

  setupProfileValidation();
})();
