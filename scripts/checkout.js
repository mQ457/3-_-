(function () {
  const API = window.AppBootstrap;
  const POST_LOGIN_REDIRECT_KEY = "app.postLoginRedirect";
  const CHECKOUT_CONTEXT_KEY = "checkout_processing_context";
  const form = document.querySelector("form.card-form-grid");
  const cardInput = form?.elements?.card;
  const expInput = form?.elements?.exp;
  const cvcInput = form?.elements?.cvc;
  const cardsTrack = document.getElementById("checkout-cards-track");
  const cardsPrev = document.getElementById("checkout-cards-prev");
  const cardsNext = document.getElementById("checkout-cards-next");
  const submitBtn = form?.querySelector("[data-checkout-submit]");
  const statusEl = document.createElement("div");
  statusEl.style.color = "#f87171";
  statusEl.style.marginTop = "12px";
  form?.appendChild(statusEl);
  let paymentMethods = [];
  let selectedPaymentMethodId = "";

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#f87171" : "#34d399";
  }

  function refreshSubmitState() {
    if (!submitBtn) return;
    const usingSavedCard = Boolean(selectedPaymentMethodId);
    const validManualCard = validateCardForm().ok;
    submitBtn.disabled = !(usingSavedCard || validManualCard);
  }

  function getPayload() {
    try {
      const stored = JSON.parse(sessionStorage.getItem("checkout_payload") || "{}");
      const params = new URLSearchParams(window.location.search || "");
      const amountFromQuery = Number(params.get("totalAmount") || 0);
      const serviceTypeFromQuery = String(params.get("serviceType") || "").trim();
      const serviceNameFromQuery = String(params.get("serviceName") || "").trim();
      const merged = { ...stored };
      if (Number.isFinite(amountFromQuery) && amountFromQuery > 0) {
        merged.totalAmount = amountFromQuery;
      }
      if (serviceTypeFromQuery) merged.serviceType = serviceTypeFromQuery;
      if (serviceNameFromQuery) merged.serviceName = serviceNameFromQuery;
      return merged;
    } catch {
      return {};
    }
  }

  function computeDeliveryCost() {
    // Future: Russian Post API integration
    return 0;
  }

  function normalizeServiceType(payload) {
    const current = String(payload?.serviceType || "").trim().toLowerCase();
    if (current) return current;
    const serviceName = String(payload?.serviceName || "").toLowerCase();
    if (serviceName.includes("скан")) return "scan";
    if (serviceName.includes("модел")) return "modeling";
    if (serviceName.includes("печат")) return "print";
    return "";
  }

  function rememberPostLoginRedirect(target) {
    try {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, String(target || "checkout.html"));
    } catch (_error) {
      // noop
    }
  }

  function redirectToLoginForCheckout() {
    rememberPostLoginRedirect("checkout.html");
    window.location.replace("login.html?next=checkout.html");
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCardNumber(value) {
    const digits = normalizeDigits(value).slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function formatExpValue(value) {
    const digits = normalizeDigits(value).slice(0, 4);
    if (digits.length < 3) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function setupCardInputs() {
    if (cardInput) {
      cardInput.setAttribute("inputmode", "numeric");
      cardInput.setAttribute("autocomplete", "cc-number");
      cardInput.maxLength = 19;
      cardInput.addEventListener("input", () => {
        cardInput.value = formatCardNumber(cardInput.value);
        if (selectedPaymentMethodId) {
          selectedPaymentMethodId = "";
          renderSavedCards();
        }
        refreshSubmitState();
      });
    }
    if (expInput) {
      expInput.setAttribute("inputmode", "numeric");
      expInput.setAttribute("autocomplete", "cc-exp");
      expInput.maxLength = 5;
      expInput.addEventListener("input", () => {
        expInput.value = formatExpValue(expInput.value);
        if (selectedPaymentMethodId) {
          selectedPaymentMethodId = "";
          renderSavedCards();
        }
        refreshSubmitState();
      });
    }
    if (cvcInput) {
      cvcInput.setAttribute("inputmode", "numeric");
      cvcInput.setAttribute("autocomplete", "cc-csc");
      cvcInput.maxLength = 3;
      cvcInput.addEventListener("input", () => {
        cvcInput.value = normalizeDigits(cvcInput.value).slice(0, 3);
        if (selectedPaymentMethodId) {
          selectedPaymentMethodId = "";
          renderSavedCards();
        }
        refreshSubmitState();
      });
    }
  }

  function renderSavedCards() {
    if (!cardsTrack) return;
    if (!paymentMethods.length) {
      cardsTrack.innerHTML = '<div class="muted-small">Нет привязанных карт. Введите новую карту выше.</div>';
      return;
    }
    cardsTrack.innerHTML = paymentMethods
      .map((card) => {
        const active = card.id === selectedPaymentMethodId ? " is-active" : "";
        const exp = `${String(card.expMonth || "").padStart(2, "0")}/${String(card.expYear || "").slice(-2)}`;
        return `<button type="button" class="checkout-card-chip${active}" data-card-id="${card.id}">
          <span class="checkout-card-chip__mask">${card.cardMask}</span>
          <span class="checkout-card-chip__meta">${exp}</span>
        </button>`;
      })
      .join("");
    cardsTrack.querySelectorAll("[data-card-id]").forEach((node) => {
      node.addEventListener("click", () => {
        selectedPaymentMethodId = node.getAttribute("data-card-id") || "";
        renderSavedCards();
        refreshSubmitState();
      });
    });
  }

  async function loadSavedCards() {
    const data = await API.request("/profile/payment-methods", { method: "GET" });
    paymentMethods = data.paymentMethods || [];
    selectedPaymentMethodId = paymentMethods.find((item) => item.isDefault)?.id || paymentMethods[0]?.id || "";
    renderSavedCards();
    refreshSubmitState();
  }

  function validateCardForm() {
    const cardNumber = normalizeDigits(cardInput?.value || "");
    const expDigits = normalizeDigits(expInput?.value || "");
    const cvc = normalizeDigits(cvcInput?.value || "");

    if (cardNumber.length !== 16) {
      return { ok: false, message: "Введите корректный номер карты (16 цифр)." };
    }
    if (expDigits.length !== 4) {
      return { ok: false, message: "Введите срок действия карты в формате ММ/ГГ." };
    }
    const month = Number(expDigits.slice(0, 2));
    const year = Number(expDigits.slice(2));
    if (month < 1 || month > 12) {
      return { ok: false, message: "Месяц срока действия должен быть от 01 до 12." };
    }
    const now = new Date();
    const currentYear = Number(String(now.getFullYear()).slice(-2));
    const currentMonth = now.getMonth() + 1;
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      return { ok: false, message: "Срок действия карты истек." };
    }
    if (cvc.length !== 3) {
      return { ok: false, message: "Введите корректный CVC (3 цифры)." };
    }
    return { ok: true, cardNumber, month, year };
  }

  function syncSummary() {
    const payload = getPayload();
    const serviceAmount = Number(payload.totalAmount || 0);
    const delivery = computeDeliveryCost();
    const total = serviceAmount + delivery;
    const sumEl = document.querySelector(".sum");
    const serviceEl = document.querySelector("[data-checkout-service-price]");
    const deliveryEl = document.querySelector("[data-checkout-delivery-price]");
    if (serviceEl) serviceEl.textContent = `${serviceAmount} ₽`;
    if (deliveryEl) deliveryEl.textContent = `${delivery} ₽`;
    if (sumEl) sumEl.textContent = `${total} ₽`;
    payload.deliveryAmount = delivery;
    payload.totalAmount = total;
    sessionStorage.setItem("checkout_payload", JSON.stringify(payload));
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Переходим к обработке оплаты...", false);
    let validation = null;
    const payload = getPayload();

    const usingSavedCard = Boolean(selectedPaymentMethodId);
    if (!usingSavedCard) {
      validation = validateCardForm();
      if (!validation.ok) {
        setStatus(validation.message, true);
        return;
      }
    }
    const serviceType = normalizeServiceType(payload);
    if (!serviceType) {
      setStatus("Не выбран тип услуги. Вернитесь на шаг услуги и нажмите «Перейти к оплате» снова.", true);
      return;
    }
    payload.serviceType = serviceType;
    sessionStorage.setItem(
      CHECKOUT_CONTEXT_KEY,
      JSON.stringify({
        payload,
        selectedPaymentMethodId: selectedPaymentMethodId || null,
        manualCard: usingSavedCard
          ? null
          : {
              cardNumber: validation.cardNumber,
              expMonth: validation.month,
              expYear: 2000 + validation.year,
            },
      })
    );
    window.location.href = "processing.html";
  });

  cardsPrev?.addEventListener("click", () => {
    cardsTrack?.scrollBy({ left: -220, behavior: "smooth" });
  });
  cardsNext?.addEventListener("click", () => {
    cardsTrack?.scrollBy({ left: 220, behavior: "smooth" });
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      syncSummary();
      return loadSavedCards();
    })
    .catch((error) => {
      if (error.status === 401) redirectToLoginForCheckout();
    });

  setupCardInputs();
  refreshSubmitState();
})();
