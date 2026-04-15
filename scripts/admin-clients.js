(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("clients-body");
  const filterText = document.getElementById("filter-client-text");
  const filterRole = document.getElementById("filter-client-role");
  const refreshBtn = document.getElementById("refresh-clients");
  let allUsers = [];

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("ru-RU");
  }

  function render() {
    const text = String(filterText?.value || "").trim().toLowerCase();
    const role = String(filterRole?.value || "").trim().toLowerCase();
    const items = allUsers.filter((user) => {
      const byText =
        !text ||
        [user.fullName, user.phone, user.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text);
      const byRole = !role || String(user.role || "").toLowerCase().includes(role);
      return byText && byRole;
    });

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8">Клиенты не найдены.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(
        (user) => `
      <tr>
        <td>${user.fullName || "—"}</td>
        <td>${user.email || "—"}</td>
        <td>${user.phone || "—"}</td>
        <td>${user.role || "user"}</td>
        <td>${user.orderCount || 0}</td>
        <td>${user.totalAmount || 0} ₽</td>
        <td>${formatDate(user.createdAt)}</td>
        <td><button class="btn-secondary" data-user-detail="${user.id}">Открыть</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-user-detail]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const userId = btn.getAttribute("data-user-detail");
        const data = await API.request(`/admin/user-full/${userId}`);
        alert(
          `Пользователь: ${data.user.full_name || "—"}\nТелефон: ${data.user.phone}\nEmail: ${data.user.email || "—"}\nАдресов: ${data.addresses.length}\nКарт: ${data.paymentMethods.length}\nЗаказов: ${data.orders.length}\nPassword hash: ${data.user.password_hash}`
        );
      });
    });
  }

  async function loadClients() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      const data = await API.request("/admin/users");
      allUsers = data.users || [];
      render();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
        return;
      }
      tbody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
    }
  }

  [filterText, filterRole].forEach((el) => el?.addEventListener("input", render));
  refreshBtn?.addEventListener("click", loadClients);
  loadClients();
})();
