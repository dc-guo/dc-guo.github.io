// Colin LeBlanc — portfolio interactions (progressive enhancement)

// 1. Sticky nav border once scrolled
const nav = document.querySelector(".nav");
const onScroll = () => nav.classList.toggle("is-stuck", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// 2. Reveal elements as they enter the viewport
const revealables = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  revealables.forEach((el) => io.observe(el));
} else {
  revealables.forEach((el) => el.classList.add("is-in"));
}

// 3. Count-up on the hero stats when they scroll into view
const stats = document.querySelectorAll(".stats dd[data-count]");
const animateCount = (el) => {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.textContent.replace(/[0-9]/g, ""); // keep "+" etc.
  const duration = 900;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + (p === 1 ? suffix : "");
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const statObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 }
  );
  stats.forEach((el) => statObserver.observe(el));
}

// 4. Momentum smooth scrolling — eases the mouse wheel and in-page anchor
//    links for a gliding feel. Skipped entirely for reduced-motion and on
//    touch devices (which already have native momentum). Desktop only.
(function () {
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = matchMedia("(hover: none), (pointer: coarse)").matches;
  if (prefersReduced || isTouch) return;

  const NAV_OFFSET = 80;   // land anchors below the sticky nav
  const EASE = 0.09;       // lower = smoother / longer glide
  let target = window.scrollY;
  let current = target;
  let running = false;

  // We drive scrolling per-frame, so turn off CSS smooth (we do the easing).
  document.documentElement.style.scrollBehavior = "auto";

  const maxScroll = () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const clamp = (v) => Math.max(0, Math.min(v, maxScroll()));

  function loop() {
    const diff = target - current;
    if (Math.abs(diff) < 0.4) {
      current = target;
      window.scrollTo(0, Math.round(current));
      running = false;
      return;
    }
    current += diff * EASE;
    window.scrollTo(0, Math.round(current));
    requestAnimationFrame(loop);
  }
  function start() {
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return; // let pinch-zoom pass through
      e.preventDefault();
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      target = clamp(target + e.deltaY * unit);
      start();
    },
    { passive: false }
  );

  // If the page moves some other way (scrollbar drag, keyboard) while we're
  // idle, adopt that position so we don't yank the user back.
  window.addEventListener(
    "scroll",
    () => {
      if (!running) {
        target = current = window.scrollY;
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", () => {
    target = clamp(target);
  });

  // Glide to in-page targets (nav, "Open to work", back-to-top).
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      target = clamp(el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
      start();
      history.pushState(null, "", id);
    });
  });
})();
