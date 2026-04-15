(function () {
  const API = window.AppBootstrap;
  const cardsRoot = document.getElementById("payment-cards");
  const addCardForm = document.getElementById("add-card-form");
  const newCardTrigger = document.getElementById("new-card-trigger");
  const statusEl = document.getElementById("payment-status");
  const ordersRoot = document.getElementById("payment-orders");

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function loadCards() {
    const data = await API.request("/profile/payment-methods", { method: "GET" });
    const cards = data.paymentMethods || [];
    const addNode = cardsRoot.querySelector("#new-card-trigger");
    cardsRoot.querySelectorAll(".bank-card[data-card-id]").forEach((node) => node.remove());
    cards.forEach((card) => {
      const node = document.createElement("div");
      node.className = `bank-card ${card.isDefault ? "is-active" : ""}`;
      node.dataset.cardId = card.id;
      node.innerHTML = `
        <div class="brand">
          <span aria-hidden="true">💳</span>
          <span class="hint">${String(card.expMonth || "").padStart(2, "0")}/${String(card.expYear || "").slice(-2)}</span>
        </div>
        <div class="num">${card.cardMask}</div>
        <div class="hint">${card.holderName || "Карта клиента"}</div>
      `;
      node.addEventListener("click", async () => {
        await API.request(`/profile/payment-methods/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        });
        await loadCards();
      });
      cardsRoot.insertBefore(node, addNode);
    });
  }

  async function loadOrders() {
    const data = await API.request("/orders", { method: "GET" });
    const orders = (data.orders || []).filter((order) => order.status !== "Оплачен");
    if (orders.length === 0) {
      ordersRoot.innerHTML = '<div class="muted-small">Нет заказов, ожидающих оплаты.</div>';
      return;
    }
    ordersRoot.innerHTML = orders
      .map(
        (order) => `
        <div class="pay-item">
          <div class="pay-item-row">
            <div class="left">
              <div class="ico" aria-hidden="true"></div>
              <div class="meta">Заказ #${order.orderNumber || order.id.slice(0, 8)}<span class="sub">${order.serviceName}</span></div>
            </div>
            <div class="right">
              <div class="sum">${order.totalAmount} руб.</div>
              <span class="link">${order.status}</span>
            </div>
          </div>
        </div>`
      )
      .join("");
  }

  newCardTrigger?.addEventListener("click", () => {
    addCardForm.style.display = addCardForm.style.display === "none" ? "block" : "none";
  });

  addCardForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Сохранение карты...", false);
    try {
      await API.request("/profile/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardNumber: String(addCardForm.elements.cardNumber.value || "").trim(),
          holderName: String(addCardForm.elements.holderName.value || "").trim(),
          expMonth: Number(addCardForm.elements.expMonth.value || 0),
          expYear: Number(addCardForm.elements.expYear.value || 0),
          isDefault: true,
        }),
      });
      addCardForm.reset();
      setStatus("Карта сохранена.", false);
      await loadCards();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      return Promise.all([loadCards(), loadOrders()]);
    })
    .catch((error) => {
      if (error.status === 401) window.location.replace("login.html");
    });
})();
