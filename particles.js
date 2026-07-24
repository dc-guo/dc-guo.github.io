// ============================================================
// Hero centerpiece — a dense field of particles that morphs
// between shapes: the name → a simple cat → PRODUCT MANAGER,
// and loops. Dense & legible when formed; scatters under the
// cursor; morphs gradually with a per-particle staggered ease.
//
// Progressive enhancement: no JS or reduced-motion falls back
// to the static <h1>. Same-origin sampling, DPR-aware, paused
// when off-screen.
// ============================================================
(function () {
  const stage = document.getElementById("hero-stage");
  const canvas = document.getElementById("hero-canvas");
  if (!stage || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COLORS = { ink: "#22314c", accent: "#ef7a5e", pine: "#6f97e8", honey: "#f2c14e" };
  const SPRING = 0.045;        // pull toward home — gentle so scatter lingers
  const SPRING_STRAY = 0.012;
  const FRICTION = 0.9;        // low damping → repelled grains coast & spread
  const JITTER = 1.3;          // small offset → texture without blur
  const DWELL = 5200;          // ms between morphs
  const MORPH_MS = 1800;       // per-particle travel time
  const STAGGER = 1000;        // spread of morph start times
  const REPEL_R = 48;          // tight hover radius — only nearby grains
  const REPEL_F = 7;           // gentle push strength
  const BOW = 0.6;             // how far the morph path arcs off the straight line
  const HOLD_MS = 180;         // brief coast before springing back

  let W = 0, H = 0, dpr = 1;
  let N = 0, strayCount = 0;
  let particles = [];
  let shapes = [];
  let shapeIndex = 0;
  let raf = null, running = false, morphTimer = null;
  const pointer = { x: -9999, y: -9999, active: false, r: REPEL_R };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- sizing ----------
  function resize() {
    const rect = stage.getBoundingClientRect();
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Build shapes first, then size the pool to the densest-coverage
    // shape so every formation reads solid (not just the short ones).
    buildShapes();
    let maxM = 0;
    for (const s of shapes) maxM = Math.max(maxM, s.pts.length / 2);
    N = clamp(Math.round(maxM * 1.7), 2500, 11000);

    buildParticles();
    assignShape(shapeIndex, true);
  }

  // ---------- particle pool ----------
  function buildParticles() {
    strayCount = Math.round(N * 0.03);
    if (particles.length > N) particles.length = N;
    for (let i = 0; i < N; i++) {
      let p = particles[i];
      if (!p) {
        const roll = Math.random();
        const color = roll < 0.10 ? COLORS.accent : roll < 0.16 ? COLORS.pine : roll < 0.21 ? COLORS.honey : COLORS.ink;
        p = particles[i] = {
          x: Math.random() * W, y: Math.random() * H,
          vx: 0, vy: 0,
          hx: undefined, hy: undefined,   // current home
          hx0: 0, hy0: 0, hx1: 0, hy1: 0, // morph endpoints
          mstart: 0, morphing: false,
          holdUntil: 0,                    // coast (no pull home) until this time
          cx: 0, cy: 0,                    // morph path control point (bezier)
          tx: 0, ty: 0,                    // stray wander target
          jx: (Math.random() * 2 - 1) * JITTER,
          jy: (Math.random() * 2 - 1) * JITTER,
          size: 0.55 + Math.random() * 1.1,
          alpha: 0.75 + Math.random() * 0.25,
          color,
          ph: Math.random() * Math.PI * 2,
          stray: false,
        };
      }
      p.stray = i < strayCount;
      if (p.stray) {
        p.tx = Math.random() * W; p.ty = Math.random() * H;
        p.alpha = 0.3 + Math.random() * 0.3;
      }
    }
  }

  // ---------- shape sources ----------
  function buildShapes() {
    const nameLines = W < 680 ? ["DIANE", "GUO"] : ["DIANE GUO"];
    shapes = [
      { pts: samplePoints((o) => drawText(o, nameLines)) },
      { pts: samplePoints(drawCat) },
      { pts: samplePoints((o) => drawText(o, ["PRODUCT", "MANAGER"])) },
    ];
  }

  function samplePoints(drawFn) {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d");
    o.fillStyle = "#000";
    o.strokeStyle = "#000";
    drawFn(o);
    const data = o.getImageData(0, 0, W, H).data;
    const gap = Math.max(2, Math.round(W / 520));
    const pts = [];
    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (data[(y * W + x) * 4 + 3] > 128) pts.push(x, y);
      }
    }
    return new Float32Array(pts);
  }

  function drawText(o, lines) {
    o.textAlign = "center";
    o.textBaseline = "middle";
    const maxW = W * 0.92;
    let size = H * (lines.length > 1 ? 0.42 : 0.62);
    for (let i = 0; i < 48; i++) {
      o.font = `900 ${size}px "Fraunces", Georgia, serif`;
      let widest = 0;
      for (const ln of lines) widest = Math.max(widest, o.measureText(ln).width);
      if (widest <= maxW && size * lines.length * 1.05 <= H * 0.9) break;
      size *= 0.94;
    }
    o.font = `900 ${size}px "Fraunces", Georgia, serif`;
    const lineH = size * 1.02;
    const startY = H / 2 - (lineH * (lines.length - 1)) / 2;
    lines.forEach((ln, i) => o.fillText(ln, W / 2, startY + i * lineH));
  }

  // Cute line-art cat head — thick rounded strokes, ears, whisker nubs.
  function drawCat(o) {
    const boxW = 100, boxH = 96;
    const s = Math.min((W * 0.5) / boxW, (H * 0.76) / boxH);
    o.save();
    o.translate((W - boxW * s) / 2, (H - boxH * s) / 2);
    o.scale(s, s);
    o.lineJoin = "round";
    o.lineCap = "round";

    // Continuous head outline with short triangular ears + soft chin
    o.lineWidth = 10;
    o.stroke(new Path2D(
      "M44 32 " +
      "L28 14 L18 28 L26 36 " +
      "C12 42 4 56 8 72 " +
      "C12 88 30 96 50 96 " +
      "C70 96 88 88 92 72 " +
      "C96 56 88 42 74 36 " +
      "L82 28 L72 14 L56 32 " +
      "C52 28 48 28 44 32 Z"
    ));

    // Side markings: upper nub, longer mid whisker, shorter lower whisker
    o.lineWidth = 8;
    o.stroke(new Path2D(
      "M22 40 L14 37 M18 54 L4 54 M22 68 L12 73 " +
      "M78 40 L86 37 M82 54 L96 54 M78 68 L88 73"
    ));

    // Eyes — large vertical ovals, spaced apart
    o.beginPath();
    o.ellipse(36, 54, 5.2, 9.5, 0, 0, Math.PI * 2);
    o.ellipse(64, 54, 5.2, 9.5, 0, 0, Math.PI * 2);
    o.fill();

    // Nose — horizontal oval under the eyes
    o.beginPath();
    o.ellipse(50, 68, 5.5, 3.4, 0, 0, Math.PI * 2);
    o.fill();
    o.restore();
  }

  // ---------- assign a shape to the pool (gradual morph) ----------
  function assignShape(idx, immediate) {
    shapeIndex = ((idx % shapes.length) + shapes.length) % shapes.length;
    const pts = shapes[shapeIndex].pts;
    const m = pts.length / 2;
    if (m === 0) return;
    const now = performance.now();
    const nn = N - strayCount;

    let ni = 0;
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      if (p.stray) continue;
      // even mapping keeps density uniform and regions coherent
      const j = Math.floor((ni / nn) * m);
      ni++;
      const gx = pts[j * 2] + p.jx;
      const gy = pts[j * 2 + 1] + p.jy;

      if (immediate || p.hx === undefined) {
        p.hx0 = p.x; p.hy0 = p.y;
      } else {
        p.hx0 = p.hx; p.hy0 = p.hy;
      }
      p.hx1 = gx; p.hy1 = gy;

      // Bend the path off the straight line so particles take a long,
      // arcing route to their new spot instead of the shortest one.
      const mx = (p.hx0 + p.hx1) / 2, my = (p.hy0 + p.hy1) / 2;
      const ddx = p.hx1 - p.hx0, ddy = p.hy1 - p.hy0;
      const len = Math.hypot(ddx, ddy) || 1;
      const bow = (len * BOW + 90) * (Math.random() < 0.5 ? -1 : 1);
      p.cx = mx + (-ddy / len) * bow;
      p.cy = my + (ddx / len) * bow;

      p.mstart = now + Math.random() * STAGGER;
      p.morphing = true;
    }
  }

  function advance() { assignShape(shapeIndex + 1, false); scheduleMorph(); }
  function scheduleMorph() {
    clearTimeout(morphTimer);
    morphTimer = setTimeout(advance, DWELL);
  }

  // ---------- animation ----------
  function tick(now) {
    const time = now * 0.001;
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      let ax = 0, ay = 0;

      if (p.stray) {
        if (Math.random() < 0.004) { p.tx = Math.random() * W; p.ty = Math.random() * H; }
        ax = (p.tx - p.x) * SPRING_STRAY;
        ay = (p.ty - p.y) * SPRING_STRAY;
      } else {
        // A morph in progress keeps advancing toward its target; a settled
        // shape just holds. Either way the particle is always pulled home,
        // so any disturbance falls back into the current formation.
        if (p.morphing) {
          const mp = (now - p.mstart) / MORPH_MS;
          const e = easeInOut(clamp(mp, 0, 1));
          const u = 1 - e;
          // quadratic bezier through the arcing control point
          p.hx = u * u * p.hx0 + 2 * u * e * p.cx + e * e * p.hx1;
          p.hy = u * u * p.hy0 + 2 * u * e * p.cy + e * e * p.hy1;
          if (mp >= 1) p.morphing = false;
        }
        if (!p.morphing && now < p.holdUntil) {
          // recently repelled — coast freely so the return is delayed
          ax += (Math.random() - 0.5) * 0.04;
          ay += (Math.random() - 0.5) * 0.04;
        } else {
          const homeX = p.hx + Math.cos(time * 0.8 + p.ph) * 0.5;
          const homeY = p.hy + Math.sin(time * 0.9 + p.ph) * 0.5;
          ax = (homeX - p.x) * SPRING;
          ay = (homeY - p.y) * SPRING;
        }
      }

      // Soft hover repel — cubic falloff so the push eases in near the
      // cursor and fades at the edge; brief coast, then spring home.
      if (pointer.active && !p.stray) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const r = pointer.r;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 0.001;
          const t = 1 - d / r;
          const f = t * t * t * REPEL_F;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
          p.holdUntil = now + HOLD_MS;
        }
      }

      p.vx = (p.vx + ax) * FRICTION;
      p.vy = (p.vy + ay) * FRICTION;
      p.x += p.vx;
      p.y += p.vy;

      const s = p.size;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      if (p.stray) continue;
      const s = p.size;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.hx1 - s * 0.5, p.hy1 - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(tick);
    scheduleMorph();
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    clearTimeout(morphTimer);
  }

  // ---------- interaction ----------
  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onMove(e) { const p = toLocal(e); pointer.x = p.x; pointer.y = p.y; pointer.active = true; }
  function onLeave() { pointer.active = false; }
  function burst(cx, cy) {
    const reach = Math.max(W, H) * 0.55;
    for (const p of particles) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 0.001;
      const power = Math.max(0, 1 - d / reach);
      const imp = 5 + power * 22;
      p.vx += (dx / d) * imp;
      p.vy += (dy / d) * imp;
    }
  }
  function onDown(e) { const p = toLocal(e); burst(p.x, p.y); advance(); }

  function debounce(fn, ms) {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  // ---------- init ----------
  function init() {
    stage.classList.add("has-canvas");
    resize();

    if (reduceMotion) {
      // settle instantly for a crisp static render
      for (const p of particles) if (!p.stray) { p.hx = p.hx1; p.hy = p.hy1; p.morphing = false; }
      drawStatic();
      return;
    }

    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave, { passive: true });
    canvas.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("resize", debounce(resize, 200));

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.01 }).observe(stage);
    } else {
      start();
    }
  }

  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]).then(init);
  } else {
    init();
  }
})();
