(function () {
  const API = window.AppBootstrap;
  const form = document.querySelector("form.card-form-grid");
  const statusEl = document.createElement("div");
  statusEl.style.color = "#f87171";
  statusEl.style.marginTop = "12px";
  form?.appendChild(statusEl);

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#f87171" : "#34d399";
  }

  function getPayload() {
    try {
      return JSON.parse(sessionStorage.getItem("checkout_payload") || "{}");
    } catch {
      return {};
    }
  }

  function syncSummary() {
    const payload = getPayload();
    const total = Number(payload.totalAmount || 0);
    const sumEl = document.querySelector(".sum");
    const rows = document.querySelectorAll(".summary-row span:last-child");
    if (rows[0]) rows[0].textContent = `${Math.max(0, total - 500)} ₽`;
    if (rows[1]) rows[1].textContent = "500 ₽";
    if (sumEl && total) sumEl.textContent = `${total} ₽`;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Обрабатываем оплату...", false);
    const cardNumber = String(form.elements.card.value || "").replace(/\D/g, "").trim();
    const exp = String(form.elements.exp.value || "").trim();
    const expParts = exp.split("/").map((item) => Number(item.trim() || 0));
    const payload = getPayload();

    if (!cardNumber) {
      setStatus("Введите номер карты.", true);
      return;
    }

    try {
      const bootstrap = await API.request("/profile/bootstrap", { method: "GET" });
      let defaultCard = (bootstrap.paymentMethods || []).find((item) => item.isDefault);
      if (!defaultCard) {
        const created = await API.request("/profile/payment-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardNumber,
            holderName: "CARD HOLDER",
            expMonth: expParts[0] || null,
            expYear: expParts[1] ? 2000 + expParts[1] : null,
            isDefault: true,
          }),
        });
        defaultCard = { id: created.id };
      }
      const defaultAddress = (bootstrap.addresses || []).find((item) => item.isDefault) || bootstrap.addresses?.[0];
      await API.request("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          paymentMethodId: defaultCard?.id || null,
          addressId: defaultAddress?.id || null,
        }),
      });
      sessionStorage.removeItem("checkout_payload");
      window.location.href = "orders.html";
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "login.html";
        return;
      }
      setStatus(error.message, true);
    }
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      syncSummary();
    })
    .catch((error) => {
      if (error.status === 401) window.location.href = "login.html";
    });
})();
