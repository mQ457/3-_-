(function () {
  const cabinetLink = document.getElementById("cabinet-link");
  if (!cabinetLink) return;

  const profileUrl = "profile.html";
  const authUrl = "login.html";

  async function isAuthorized() {
    try {
      await window.AppBootstrap.request("/auth/me", { method: "GET", cache: "no-store" });
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function resolveCabinetTarget() {
    const authorized = await isAuthorized();
    return authorized ? profileUrl : authUrl;
  }

  resolveCabinetTarget().then((target) => {
    cabinetLink.setAttribute("href", target);
  });

  cabinetLink.addEventListener("click", async (event) => {
    event.preventDefault();
    const target = await resolveCabinetTarget();
    window.location.href = target;
  });
})();
