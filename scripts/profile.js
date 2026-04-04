(function () {
  const API_BASE = "http://localhost:3000/api";
  const form = document.getElementById("profile-form");
  const statusEl = document.getElementById("profile-status");
  const logoutBtn = document.getElementById("logout-btn");
  const sidebarName = document.getElementById("sidebar-name");

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function request(path, options) {
    const response = await fetch(`${API_BASE}${path}`, {
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

  function fillProfile(profile) {
    if (!form) return;
    form.elements.fullName.value = profile.fullName || "";
    form.elements.phone.value = profile.phone || "";
    form.elements.email.value = profile.email || "";
    sidebarName.textContent = profile.fullName || "Пользователь";
  }

  async function loadProfile() {
    try {
      const data = await request("/profile/me", { method: "GET" });
      fillProfile(data.profile || {});
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "login.html";
        return;
      }
      setStatus(error.message, true);
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Сохраняем данные...", false);
    try {
      const payload = {
        fullName: String(form.elements.fullName.value || "").trim(),
        email: String(form.elements.email.value || "").trim(),
      };
      const data = await request("/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fillProfile(data.profile || {});
      setStatus("Данные сохранены.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await request("/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "login.html";
    }
  });

  loadProfile();
})();
