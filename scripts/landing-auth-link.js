(function () {
  const cabinetLink = document.getElementById("cabinet-link");
  if (!cabinetLink) return;

  const profileUrl = "profile.html";
  const authUrl = "login.html";
  let resolvedHref = authUrl;
  let authCheckPromise = null;

  cabinetLink.setAttribute("href", authUrl);

  async function isAuthorizedOnce() {
    if (authCheckPromise) return authCheckPromise;
    authCheckPromise = (async () => {
      if (!window.AppBootstrap || typeof window.AppBootstrap.request !== "function") {
        return false;
      }
      try {
        await window.AppBootstrap.request("/auth/me", { method: "GET", cache: "no-store" });
        return true;
      } catch (_error) {
        return false;
      }
    })();
    try {
      return await authCheckPromise;
    } catch (_error) {
      return false;
    }
  }

  async function warmCabinetTarget() {
    const authorized = await isAuthorizedOnce();
    resolvedHref = authorized ? profileUrl : authUrl;
    cabinetLink.setAttribute("href", resolvedHref);
  }

  warmCabinetTarget().catch(() => {
    resolvedHref = authUrl;
    cabinetLink.setAttribute("href", resolvedHref);
  });
})();
