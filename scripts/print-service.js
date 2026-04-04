(function () {
  const serviceMap = {
    "print-step-1.html": { name: "Сканирование", amount: 6000 },
    "print-step-2.html": { name: "Моделирование", amount: 6000 },
    "print-step-3.html": { name: "3D печать", amount: 6000 },
  };

  const page = window.location.pathname.split("/").pop();
  const service = serviceMap[page] || { name: "Услуга", amount: 6000 };
  const checkoutLinks = document.querySelectorAll('a[href="checkout.html"]');

  checkoutLinks.forEach((link) => {
    link.addEventListener("click", () => {
      sessionStorage.setItem("checkout_service_name", service.name);
      sessionStorage.setItem("checkout_total_amount", String(service.amount));
    });
  });
})();
