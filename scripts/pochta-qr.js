(function (root) {
  function qrImageUrl(text, size) {
    const value = String(text || "").trim();
    if (!value) return "";
    const px = Math.max(120, Number(size || 220));
    return `https://quickchart.io/qr?size=${px}&text=${encodeURIComponent(value)}`;
  }

  function ensureModal() {
    let modal = document.getElementById("pochta-qr-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "pochta-qr-modal";
    modal.className = "pochta-qr-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="pochta-qr-modal__backdrop" data-pochta-qr-close></div>
      <div class="pochta-qr-modal__panel" role="dialog" aria-modal="true" aria-labelledby="pochta-qr-title">
        <h3 id="pochta-qr-title" class="pochta-qr-modal__title">QR / штрихкод</h3>
        <img class="pochta-qr-modal__img" id="pochta-qr-image" alt="QR код" width="220" height="220" />
        <p class="pochta-qr-modal__code" id="pochta-qr-code"></p>
        <div class="pochta-qr-modal__actions">
          <button type="button" class="btn-secondary" data-pochta-qr-print>Печать</button>
          <button type="button" class="btn-secondary" data-pochta-qr-close>Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-pochta-qr-close]").forEach((node) => {
      node.addEventListener("click", () => {
        modal.hidden = true;
      });
    });
    modal.querySelector("[data-pochta-qr-print]")?.addEventListener("click", () => {
      const img = document.getElementById("pochta-qr-image");
      const code = document.getElementById("pochta-qr-code")?.textContent || "";
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<html><head><title>QR</title></head><body style="text-align:center;font-family:sans-serif"><img src="${img?.src || ""}" alt="qr"/><p>${code}</p></body></html>`);
      win.document.close();
      win.focus();
      win.print();
    });
    return modal;
  }

  function openPochtaQrModal({ title, code }) {
    const value = String(code || "").trim();
    if (!value) return;
    const modal = ensureModal();
    const img = document.getElementById("pochta-qr-image");
    const codeEl = document.getElementById("pochta-qr-code");
    const titleEl = document.getElementById("pochta-qr-title");
    if (titleEl) titleEl.textContent = title || "QR / штрихкод";
    if (img) img.src = qrImageUrl(value, 240);
    if (codeEl) codeEl.textContent = value;
    modal.hidden = false;
  }

  root.PochtaQr = {
    qrImageUrl,
    openPochtaQrModal,
  };
})(window);
