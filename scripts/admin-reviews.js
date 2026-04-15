(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("reviews-body");
  const filterText = document.getElementById("reviews-filter-text");
  const filterRating = document.getElementById("reviews-filter-rating");
  const filterDate = document.getElementById("reviews-filter-date");
  const refreshBtn = document.getElementById("reviews-refresh");
  let allReviews = [];

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("ru-RU");
  }

  function formatAuthor(review) {
    return review.user?.fullName || review.user?.phone || "Клиент";
  }

  function createStars(rating) {
    return Array.from({ length: 5 }, (_, index) => (index < rating ? "★" : "☆")).join("");
  }

  function createRow(review) {
    return `
      <tr>
        <td>${formatAuthor(review)}</td>
        <td>${createStars(Number(review.rating || 0))}</td>
        <td class="admin-review-comment">${review.comment || "—"}</td>
        <td>${formatDate(review.createdAt)}</td>
        <td>
          <button class="btn-secondary admin-btn-danger" data-review-delete="${review.id}">Удалить</button>
        </td>
      </tr>`;
  }

  function applyFilter() {
    const text = String(filterText?.value || "").trim().toLowerCase();
    const rating = Number(filterRating?.value || 0);
    const date = String(filterDate?.value || "");

    const items = allReviews.filter((review) => {
      const byText =
        !text ||
        [formatAuthor(review), review.comment]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text);
      const byRating = !rating || Number(review.rating || 0) === rating;
      const byDate = !date || String(review.createdAt || "").slice(0, 10) === date;
      return byText && byRating && byDate;
    });

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Отзывы не найдены.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(createRow).join("");
    tbody.querySelectorAll("[data-review-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const reviewId = btn.getAttribute("data-review-delete");
        if (!reviewId) return;
        const ok = window.confirm("Удалить отзыв? Это действие нельзя отменить.");
        if (!ok) return;
        try {
          await API.request(`/admin/reviews/${reviewId}`, { method: "DELETE" });
          await loadReviews();
        } catch (error) {
          window.alert(error.message || "Не удалось удалить отзыв.");
        }
      });
    });
  }

  async function loadReviews() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      const data = await API.request("/admin/reviews");
      allReviews = data.reviews || [];
      applyFilter();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
        return;
      }
      tbody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    }
  }

  [filterText, filterRating, filterDate].forEach((node) => node?.addEventListener("input", applyFilter));
  refreshBtn?.addEventListener("click", loadReviews);
  loadReviews();
})();
