(function () {
  const API_BASE = "/api";
  const NAV_SEEN_KEY = "admin_nav_seen_v1";
  const NAV_SECTION_BY_PAGE = {
    "admin-orders.html": "orders",
    "admin-support.html": "support",
    "admin-reviews.html": "reviews",
    "admin-notifications.html": "notifications",
  };
  let navUpdatesInitialized = false;

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
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

  async function ensureAdmin() {
    const data = await request("/auth/me");
    if (data?.user?.role !== "admin") {
      const error = new Error("Нет доступа к админке.");
      error.status = 403;
      throw error;
    }
    document.querySelectorAll("[data-admin-name]").forEach((node) => {
      node.textContent = data.user.fullName || data.user.phone || "Администратор";
    });
    return data.user;
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (_error) {}
    window.location.href = "login.html";
  }

  function wireLogout() {
    document.querySelectorAll("[data-admin-logout]").forEach((node) => node.addEventListener("click", logout));
  }

  function wireResponsiveSidebar() {
    const sidebar = document.querySelector(".admin-sidebar");
    const main = document.querySelector(".admin-main");
    if (!sidebar || !main) return;
    let toggleBtn = document.querySelector(".admin-nav-toggle");
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "admin-nav-toggle";
      toggleBtn.textContent = "Меню";
      const top = main.querySelector(".admin-top");
      if (top) {
        top.prepend(toggleBtn);
      } else {
        main.prepend(toggleBtn);
      }
    }

    let backdrop = document.querySelector(".admin-sidebar-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "admin-sidebar-backdrop";
      backdrop.setAttribute("aria-label", "Закрыть меню");
      document.body.appendChild(backdrop);
    }

    const closeMenu = () => document.body.classList.remove("admin-sidebar-open");
    const openMenu = () => document.body.classList.add("admin-sidebar-open");
    const toggleMenu = () => {
      if (document.body.classList.contains("admin-sidebar-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    toggleBtn.addEventListener("click", toggleMenu);
    backdrop.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });

    document.querySelectorAll(".admin-nav a[href]").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    const media = window.matchMedia("(min-width: 981px)");
    const onDesktop = () => {
      if (media.matches) closeMenu();
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onDesktop);
    } else if (typeof media.addListener === "function") {
      media.addListener(onDesktop);
    }
  }

  function getSeenMap() {
    try {
      const raw = window.localStorage.getItem(NAV_SEEN_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  }

  function setSeenMap(nextMap) {
    try {
      window.localStorage.setItem(NAV_SEEN_KEY, JSON.stringify(nextMap || {}));
    } catch (_error) {}
  }

  function markSectionSeen(section) {
    if (!section) return;
    const seen = getSeenMap();
    seen[section] = new Date().toISOString();
    setSeenMap(seen);
  }

  async function markSectionSeenAndRefresh(section) {
    markSectionSeen(section);
    await loadNavCounts();
  }

  function currentPageName() {
    const pathname = String(window.location.pathname || "");
    const normalized = pathname.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    return (segments[segments.length - 1] || "").toLowerCase();
  }

  function currentSection() {
    return NAV_SECTION_BY_PAGE[currentPageName()] || "";
  }

  function ensureBadge(linkNode) {
    if (!linkNode) return null;
    let badge = linkNode.querySelector(".admin-nav-badge");
    if (badge) return badge;
    badge = document.createElement("span");
    badge.className = "admin-nav-badge";
    badge.style.display = "none";
    linkNode.appendChild(badge);
    return badge;
  }

  function renderNavBadges(counts) {
    const navLinks = document.querySelectorAll(".admin-nav a[href]");
    navLinks.forEach((link) => {
      const href = String(link.getAttribute("href") || "").toLowerCase();
      const section = NAV_SECTION_BY_PAGE[href];
      const badge = ensureBadge(link);
      if (!section || !badge) return;
      const count = Number(counts?.[section] || 0);
      badge.textContent = String(count);
      badge.style.display = count > 0 ? "inline-flex" : "none";
    });
  }

  async function loadNavCounts() {
    const seen = getSeenMap();
    const query = new URLSearchParams({
      sinceOrders: seen.orders || "1970-01-01T00:00:00.000Z",
      sinceSupport: seen.support || "1970-01-01T00:00:00.000Z",
      sinceReviews: seen.reviews || "1970-01-01T00:00:00.000Z",
      sinceNotifications: seen.notifications || "1970-01-01T00:00:00.000Z",
    });
    const data = await request(`/admin/nav-updates?${query.toString()}`);
    renderNavBadges(data.counts || {});
  }

  function wireNavClicks() {
    const navLinks = document.querySelectorAll(".admin-nav a[href]");
    navLinks.forEach((link) => {
      const href = String(link.getAttribute("href") || "").toLowerCase();
      const section = NAV_SECTION_BY_PAGE[href];
      if (!section) return;
      link.addEventListener("click", () => {
        markSectionSeen(section);
      });
    });
  }

  function initNavUpdates() {
    if (navUpdatesInitialized) return;
    navUpdatesInitialized = true;
    const section = currentSection();
    if (section) {
      markSectionSeen(section);
    }
    wireNavClicks();
    wireResponsiveSidebar();
    loadNavCounts().catch(() => {});
  }

  async function ensureAdminAndInit() {
    const user = await ensureAdmin();
    initNavUpdates();
    return user;
  }

  window.AdminCommon = {
    request,
    ensureAdmin: ensureAdminAndInit,
    logout,
    wireLogout,
    refreshNavUpdates: loadNavCounts,
    markNavSectionSeen: markSectionSeenAndRefresh,
  };
})();
