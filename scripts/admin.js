(function () {
  const adminLoginForm = document.getElementById("admin-login-form");
  const loginScreen = document.getElementById("login-screen");
  const dashboardScreen = document.getElementById("dashboard-screen");
  const loginMessage = document.getElementById("login-message");
  const logoutButton = document.getElementById("logout-button");
  const totalOrdersEl = document.getElementById("total-orders");
  const totalUsersEl = document.getElementById("total-users");
  const lastUpdatedEl = document.getElementById("last-updated");
  const ordersList = document.getElementById("orders-list");
  const refreshButton = document.getElementById("refresh-button");
  const createOrderButton = document.getElementById("create-order-button");

  const ADMIN_CREDENTIALS = { phone: "123456", name: "admin123" };
  const STORAGE_KEY = "isAdminLoggedIn";

  function setLoginMessage(message, isError) {
    if (!loginMessage) return;
    loginMessage.textContent = message || "";
    loginMessage.style.color = isError ? "#ff7c63" : "#9aa1b6";
  }

  function isLoggedIn() {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  }

  function showDashboard() {
    if (loginScreen) loginScreen.classList.add("hidden");
    if (dashboardScreen) dashboardScreen.classList.remove("hidden");
    if (logoutButton) logoutButton.classList.remove("hidden");
    loadDashboard();
  }

  function showLogin() {
    if (loginScreen) loginScreen.classList.remove("hidden");
    if (dashboardScreen) dashboardScreen.classList.add("hidden");
    if (logoutButton) logoutButton.classList.add("hidden");
    setLoginMessage("Введите данные для доступа.", false);
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Ошибка при загрузке данных.");
    }
    return data;
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return value || "—";
    }
  }

  function renderOrders(orders) {
    if (!ordersList) return;
    if (!orders || orders.length === 0) {
      ordersList.innerHTML = "<div class='order-card'><p>Заказы пока не созданы.</p></div>";
      return;
    }

    ordersList.innerHTML = orders
      .map((order) => {
        return `
          <article class="order-card">
            <div class="order-top">
              <div>
                <div class="order-id">Заказ #${order.id.slice(0, 8)}</div>
                <div class="order-status">${order.status}</div>
              </div>
              <div>${formatDate(order.createdAt)}</div>
            </div>
            <div class="order-body">
              <div class="order-body-item">
                <strong>Клиент</strong>
                <span>${order.user.fullName || order.user.phone}</span>
              </div>
              <div class="order-body-item">
                <strong>Телефон</strong>
                <span>${order.user.phone}</span>
              </div>
              <div class="order-body-item">
                <strong>Сумма</strong>
                <span>${order.totalAmount || 0} ₽</span>
              </div>
              <div class="order-body-item">
                <strong>Адрес</strong>
                <span>${order.deliveryAddress || "Не указан"}</span>
              </div>
            </div>
            <div class="order-bottom">
              <span>Почта: ${order.user.email || "—"}</span>
              <span>Обновлено: ${formatDate(order.updatedAt)}</span>
            </div>
          </article>`;
      })
      .join("");
  }

  async function loadDashboard() {
    try {
      const dashboard = await fetchJson("/api/admin/dashboard");
      if (totalOrdersEl) totalOrdersEl.textContent = String(dashboard.totalOrders || 0);
      if (totalUsersEl) totalUsersEl.textContent = String(dashboard.totalUsers || 0);
      if (lastUpdatedEl) lastUpdatedEl.textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const orders = await fetchJson("/api/admin/orders");
      renderOrders(orders.orders);
    } catch (error) {
      if (ordersList) ordersList.innerHTML = `<div class='order-card'><p>${error.message}</p></div>`;
    }
  }

  async function createSampleOrder() {
    const userPhone = prompt("Введите телефон пользователя для тестового заказа:", "3456708457");
    if (!userPhone) {
      return;
    }
    try {
      await fetchJson("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPhone,
          status: "В работе",
          totalAmount: 2500,
          deliveryAddress: "г. Москва, ул. Ленина 15, кв 42",
          details: "Тестовый заказ для администратора",
        }),
      });
      loadDashboard();
    } catch (error) {
      alert(error.message);
    }
  }

  adminLoginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(adminLoginForm);
    const phone = String(formData.get("phone") || "").trim();
    const name = String(formData.get("name") || "").trim();

    if (phone === ADMIN_CREDENTIALS.phone && name.toLowerCase() === ADMIN_CREDENTIALS.name) {
      window.localStorage.setItem(STORAGE_KEY, "true");
      showDashboard();
      return;
    }

    setLoginMessage("Неверные данные. Проверьте телефон и имя.", true);
  });

  logoutButton?.addEventListener("click", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.href = "landing.html";
  });

  refreshButton?.addEventListener("click", loadDashboard);
  createOrderButton?.addEventListener("click", createSampleOrder);

  // Global logout function for other pages
  window.adminLogout = function () {
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.href = "admin.html";
  };

  // Check if logged in and redirect if not on other pages
  const pathName = window.location.pathname;
  if (pathName.includes("admin") && !pathName.includes("login") && !isLoggedIn()) {
    window.location.href = "admin.html";
  }

  if (isLoggedIn()) {
    showDashboard();
  } else if (pathName.includes("admin.html")) {
    showLogin();
  }
})();
