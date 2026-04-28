(function () {
  const API = window.AppBootstrap;
  const CHECKOUT_CONTEXT_KEY = "checkout_processing_context";
  const errorEl = document.getElementById("processing-error");

  function showError(message) {
    if (!errorEl) return;
    errorEl.hidden = false;
    errorEl.textContent = message || "Не удалось обработать оплату.";
  }

  function loadContext() {
    try {
      return JSON.parse(sessionStorage.getItem(CHECKOUT_CONTEXT_KEY) || "{}");
    } catch {
      return {};
    }
  }

  async function run() {
    const context = loadContext();
    const payload = context.payload || {};
    if (!payload.serviceType) {
      window.location.replace("checkout.html");
      return;
    }
    try {
      const bootstrap = await API.request("/profile/bootstrap", { method: "GET" });
      let paymentMethodId = context.selectedPaymentMethodId || null;
      if (!paymentMethodId && context.manualCard?.cardNumber) {
        const created = await API.request("/profile/payment-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardNumber: context.manualCard.cardNumber,
            holderName: "CARD HOLDER",
            expMonth: Number(context.manualCard.expMonth || 1),
            expYear: Number(context.manualCard.expYear || 2030),
            isDefault: true,
          }),
        });
        paymentMethodId = created.id;
      }
      if (!paymentMethodId) {
        paymentMethodId = (bootstrap.paymentMethods || []).find((item) => item.isDefault)?.id || bootstrap.paymentMethods?.[0]?.id || null;
      }
      const addressId = (bootstrap.addresses || []).find((item) => item.isDefault)?.id || bootstrap.addresses?.[0]?.id || null;

      await API.request("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          paymentMethodId,
          addressId,
          initialStatus: "Не оплачено",
        }),
      });
      sessionStorage.removeItem("checkout_payload");
      sessionStorage.removeItem(CHECKOUT_CONTEXT_KEY);
      window.location.replace("orders.html");
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("login.html?next=checkout.html");
        return;
      }
      showError(error.message || "Ошибка обработки оплаты.");
      setTimeout(() => {
        window.location.replace("checkout.html");
      }, 1800);
    }
  }

  API.bootstrapUser()
    .then(run)
    .catch((error) => {
      if (error.status === 401) {
        window.location.replace("login.html?next=checkout.html");
        return;
      }
      showError(error.message || "Ошибка авторизации.");
    });
})();
