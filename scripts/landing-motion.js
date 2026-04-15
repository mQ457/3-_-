(function () {
  const header =
    document.getElementById("landing-header") || document.querySelector("header.landing-header");
  const revealNodes = document.querySelectorAll(".landing-reveal");

  function scrollY() {
    return (
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  function updateHeader() {
    if (!header) return;
    if (scrollY() > 12) header.classList.add("landing-header--scrolled");
    else header.classList.remove("landing-header--scrolled");
  }

  window.addEventListener("scroll", updateHeader, { passive: true });
  document.addEventListener("scroll", updateHeader, { passive: true });
  updateHeader();
  window.addEventListener("load", updateHeader);

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    revealNodes.forEach((node) => io.observe(node));
  } else {
    revealNodes.forEach((node) => node.classList.add("is-visible"));
  }
})();
