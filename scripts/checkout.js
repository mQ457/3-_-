(function () {
  const form = document.querySelector("form.card-form-grid");
  const statusEl = document.createElement("div");
  statusEl.style.color = "#f87171";
  statusEl.style.marginTop = "12px";
  form?.appendChild(statusEl);

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#f87171" : "#34d399";
  }

  function getCurrentService() {
    const stored = sessionStorage.getItem("checkout_service_name");
    return stored || "Услуга";
  }

  function getTotalAmount() {
    const stored = sessionStorage.getItem("checkout_total_amount");
    if (stored) {
      const value = String(stored).replace(/[^\d]/g, "");
      return Number(value) || 0;
    }
    const sumEl = document.querySelector(".sum");
    if (sumEl) {
      const value = sumEl.textContent.replace(/[^\d]/g, "");
      return Number(value) || 0;
    }
    return 0;
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
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

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Обрабатываем оплату...", false);
    const cardNumber = String(form.elements.card.value || "").replace(/\D/g, "").trim();
    const exp = String(form.elements.exp.value || "").trim();
    const cvc = String(form.elements.cvc.value || "").trim();
    const serviceName = getCurrentService();
    const totalAmount = getTotalAmount();

    if (!cardNumber) {
      setStatus("Введите номер карты.", true);
      return;
    }

    try {
      await request("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName, totalAmount, cardNumber, exp, cvc }),
      });
      sessionStorage.removeItem("checkout_service_name");
      sessionStorage.removeItem("checkout_total_amount");
      window.location.href = "orders.html";
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "login.html";
        return;
      }
      setStatus(error.message, true);
    }
  });
})();
