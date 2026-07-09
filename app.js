/* Burn Journal — everything lives in RAM, nothing is ever saved or sent. */
(() => {
  "use strict";

  const stage    = document.getElementById("stage");
  const jitter   = document.getElementById("jitter");
  const paper    = document.getElementById("paper");
  const letter   = document.getElementById("letter");
  const dateEl   = document.getElementById("paperDate");
  const btn      = document.getElementById("burnBtn");
  const ringFill = document.getElementById("ringFill");
  const btnLabel = document.getElementById("btnLabel");
  const canvas   = document.getElementById("fx");
  const ctx      = canvas.getContext("2d");

  const RING_C        = 194.8;   // ring circumference (2π·31)
  const HOLD_MS       = 1000;    // press-and-hold time to ignite
  const BURN_MS       = 4800;    // bottom-to-top burn duration
  const PAD           = 60;      // canvas overflow around the paper (for sparks)
  const FRONT_AMP     = 26;      // jaggedness of the burn front, px
  const SAMPLES       = 34;      // burn-front resolution

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let state = "idle";            // idle | holding | burning | renewing
  let holdStart = 0;
  let holdProgress = 0;
  let holdRAF = 0;
  let burnRAF = 0;
  let noiseFn = null;
  let sparks = [];
  let box = { w: 0, h: 0 };      // paper size at ignition

  /* ————— Date ————— */
  function setDate() {
    const now = new Date();
    const month = now.toLocaleString("en-US", { month: "long" });
    dateEl.textContent = `${month}, ${now.getDate()}`;
  }

  /* ————— Button enable/disable ————— */
  function refreshButton() {
    const hasText = letter.value.trim().length > 0;
    btn.setAttribute("aria-disabled", hasText ? "false" : "true");
    btn.classList.toggle("armed", hasText);
  }
  function autoGrow() {
    letter.style.height = "auto";
    letter.style.height = `${letter.scrollHeight}px`;
  }
  letter.addEventListener("input", () => {
    refreshButton();
    autoGrow();
  });

  /* ————— Canvas sizing ————— */
  function fitCanvas() {
    const r = paper.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    box.w = r.width;
    box.h = r.height;
    canvas.style.left = `${r.left - s.left - PAD}px`;
    canvas.style.top = `${r.top - s.top - PAD}px`;
    canvas.style.width = `${box.w + PAD * 2}px`;
    canvas.style.height = `${box.h + PAD * 2}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round((box.w + PAD * 2) * dpr);
    canvas.height = Math.round((box.h + PAD * 2) * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ————— Layered-sine noise for the burn front ————— */
  function makeNoise() {
    const comps = Array.from({ length: 4 }, (_, i) => ({
      f: 1.6 + Math.random() * 2.2 + i * 2.3,   // spatial frequency
      p: Math.random() * Math.PI * 2,           // phase
      s: (Math.random() * 2 - 1) * 2.2,         // temporal drift
      w: 1 / (i + 1),                           // weight
    }));
    const wsum = comps.reduce((a, c) => a + c.w, 0);
    return (x, t) =>
      comps.reduce((a, c) => a + Math.sin(x * c.f * Math.PI * 2 + c.p + t * c.s) * c.w, 0) / wsum;
  }

  const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

  /* Burn-front y for a normalized x at eased progress f and time t (seconds).
     Starts just below the paper (f=0) and finishes flat at the paper's top
     edge (f=1) — never traveling above the page into the header. The jagged
     amplitude fades to zero as the front arrives, so the last sliver clears
     cleanly right at y=0. */
  function frontAt(xn, f, t) {
    const startY = box.h + FRONT_AMP + 20;   // begins below the paper bottom
    const base = startY * (1 - f);           // reaches 0 (paper top) at f=1
    const amp = FRONT_AMP * (1 - f);         // jaggedness collapses at the top
    return base + noiseFn(xn, t) * amp;
  }

  /* ————— Hold-to-ignite ————— */
  function setRing(p) {
    ringFill.style.strokeDashoffset = String(RING_C * (1 - p));
  }

  function drawPreGlow(p) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (p <= 0) return;
    const cx = PAD + box.w / 2;
    const cy = PAD + box.h;
    const rad = Math.max(20, box.w * 0.55 * p);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
    g.addColorStop(0, `rgba(255, 170, 80, ${0.55 * p})`);
    g.addColorStop(0.45, `rgba(226, 72, 42, ${0.28 * p})`);
    g.addColorStop(1, "rgba(226, 72, 42, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, box.w + PAD * 2, box.h + PAD * 2);
  }

  function holdLoop(now) {
    if (state !== "holding") return;
    holdProgress = Math.min(1, (now - holdStart) / HOLD_MS);
    setRing(holdProgress);
    if (!reducedMotion.matches) {
      drawPreGlow(holdProgress);
      const j = holdProgress * 1.4;
      jitter.style.transform =
        `translate(${(Math.random() - 0.5) * j}px, ${(Math.random() - 0.5) * j}px)`;
    }
    if (holdProgress >= 0.55) btn.classList.add("hot");
    if (holdProgress >= 1) { ignite(); return; }
    holdRAF = requestAnimationFrame(holdLoop);
  }

  function fizzle() {
    // Released too soon: the ember dies back down.
    cancelAnimationFrame(holdRAF);
    btn.classList.remove("hot");
    state = "idle";
    const from = holdProgress;
    const t0 = performance.now();
    const decay = (now) => {
      if (state !== "idle") return;
      const p = Math.max(0, from * (1 - (now - t0) / 320));
      setRing(p);
      drawPreGlow(p);
      jitter.style.transform = "";
      if (p > 0) requestAnimationFrame(decay);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    requestAnimationFrame(decay);
  }

  function startHold(e) {
    if (state !== "idle") return;
    if (btn.getAttribute("aria-disabled") === "true") return;
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    fitCanvas();
    state = "holding";
    holdStart = performance.now();
    holdRAF = requestAnimationFrame(holdLoop);
  }

  function endHold() {
    if (state === "holding") fizzle();
  }

  btn.addEventListener("pointerdown", startHold);
  btn.addEventListener("pointerup", endHold);
  btn.addEventListener("pointercancel", endHold);
  btn.addEventListener("pointerleave", endHold);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());

  // Keyboard: hold Space/Enter down to ignite, mirroring the pointer gesture.
  btn.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && state === "idle" && !e.repeat) {
      if (btn.getAttribute("aria-disabled") === "true") return;
      e.preventDefault();
      fitCanvas();
      state = "holding";
      holdStart = performance.now();
      holdRAF = requestAnimationFrame(holdLoop);
    }
  });
  btn.addEventListener("keyup", endHold);
  window.addEventListener("blur", endHold);

  /* ————— The burn ————— */
  function ignite() {
    cancelAnimationFrame(holdRAF);
    state = "burning";
    btn.classList.remove("hot");
    setRing(0);
    jitter.style.transform = "";
    letter.blur();
    letter.readOnly = true;
    btnLabel.textContent = "Letting go…";

    if (reducedMotion.matches) {
      // Gentle fade instead of flames.
      paper.style.transition = "opacity 500ms ease";
      paper.style.opacity = "0";
      setTimeout(renew, 560);
      return;
    }

    noiseFn = makeNoise();
    sparks = [];
    // Lock the stage height so the layout doesn't jump as the paper burns away.
    stage.style.minHeight = `${stage.getBoundingClientRect().height}px`;

    const t0 = performance.now();
    const loop = (now) => {
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / BURN_MS);
      const f = easeInOut(p);
      const t = elapsed / 1000;
      renderBurn(f, t);
      if (p < 1) {
        burnRAF = requestAnimationFrame(loop);
      } else {
        finishBurn(t);
      }
    };
    burnRAF = requestAnimationFrame(loop);
  }

  function samplesFront(f, t) {
    const pts = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const xn = i / SAMPLES;
      pts.push([xn * box.w, frontAt(xn, f, t)]);
    }
    return pts;
  }

  function renderBurn(f, t) {
    const pts = samplesFront(f, t);

    // 1 — Clip the paper to everything above the burn front.
    // Polygon: top-left → top-right → down the right edge → right-to-left
    // along the jagged front → close back at top-left.
    const frontRTL = [...pts].reverse()
      .map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`);
    const clip = `polygon(${["0px 0px", `${box.w}px 0px`, ...frontRTL].join(", ")})`;
    paper.style.clipPath = clip;
    paper.style.webkitClipPath = clip;

    // 2 — Draw the ember front, char band, and sparks on the canvas.
    ctx.clearRect(0, 0, box.w + PAD * 2, box.h + PAD * 2);
    ctx.save();
    ctx.translate(PAD, 0); // x offset; y already matches (canvas top = paper top - PAD)
    const oy = PAD;        // y offset applied per point

    // Confine every ember, spark, and char stroke to the page — nothing is
    // allowed to paint above the paper's top edge, up into the header.
    ctx.beginPath();
    ctx.rect(-PAD, oy, box.w + PAD * 2, box.h + PAD * 2);
    ctx.clip();

    const tracePath = (dy = 0) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const yy = y + oy + dy;
        i === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      });
    };

    // Char band — scorched paper just above the ember line.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(34, 23, 9, 0.92)";
    ctx.lineWidth = 16;
    tracePath(-9);
    ctx.stroke();
    ctx.strokeStyle = "rgba(12, 7, 3, 0.85)";
    ctx.lineWidth = 8;
    tracePath(-3);
    ctx.stroke();

    // Ember line — flickering, glowing.
    const flick = 0.75 + Math.sin(t * 37) * 0.12 + Math.random() * 0.13;
    const grad = ctx.createLinearGradient(0, 0, box.w, 0);
    grad.addColorStop(0, "#e2482a");
    grad.addColorStop(0.35, "#ff8a3d");
    grad.addColorStop(0.62, "#ffd873");
    grad.addColorStop(1, "#ff8a3d");
    ctx.shadowColor = "rgba(255, 138, 61, 0.9)";
    ctx.shadowBlur = 20 * flick;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.4 * flick;
    tracePath(0);
    ctx.stroke();

    // Bright molten core.
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(255, 216, 115, 0.9)";
    ctx.strokeStyle = `rgba(255, 240, 190, ${0.55 * flick})`;
    ctx.lineWidth = 1.4;
    tracePath(0.5);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3 — Sparks & rising embers.
    const spawn = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < spawn; s++) {
      const i = Math.floor(Math.random() * pts.length);
      const [x, y] = pts[i];
      sparks.push({
        x, y: y + oy,
        vx: (Math.random() - 0.5) * 26,
        vy: -(24 + Math.random() * 70),
        life: 0.45 + Math.random() * 0.75,
        age: 0,
        r: 0.7 + Math.random() * 1.7,
        hue: Math.random() < 0.75 ? "ember" : "ash",
      });
    }
    ctx.globalCompositeOperation = "lighter";
    const dt = 1 / 60;
    sparks = sparks.filter((sp) => (sp.age += dt) < sp.life);
    for (const sp of sparks) {
      sp.x += sp.vx * dt + Math.sin((sp.age + sp.x) * 9) * 0.4;
      sp.y += sp.vy * dt;
      sp.vy *= 0.985;
      const k = 1 - sp.age / sp.life;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
      ctx.fillStyle =
        sp.hue === "ember"
          ? `rgba(255, ${Math.round(150 + 90 * k)}, 70, ${0.85 * k})`
          : `rgba(150, 140, 130, ${0.4 * k})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  function finishBurn(tEnd) {
    cancelAnimationFrame(burnRAF);
    // Let the last sparks drift out before the fresh page arrives.
    const t0 = performance.now();
    const after = (now) => {
      const t = tEnd + (now - t0) / 1000;
      ctx.clearRect(0, 0, box.w + PAD * 2, box.h + PAD * 2);
      ctx.save();
      ctx.translate(PAD, 0);
      // Keep the drifting embers within the page, same as during the burn.
      ctx.beginPath();
      ctx.rect(-PAD, PAD, box.w + PAD * 2, box.h + PAD * 2);
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      const dt = 1 / 60;
      sparks = sparks.filter((sp) => (sp.age += dt) < sp.life);
      for (const sp of sparks) {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        const k = 1 - sp.age / sp.life;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r * k, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 170, 80, ${0.7 * k})`;
        ctx.fill();
      }
      ctx.restore();
      if (sparks.length > 0 && now - t0 < 900) requestAnimationFrame(after);
      else renew();
    };
    requestAnimationFrame(after);
  }

  /* ————— A fresh page ————— */
  function renew() {
    state = "renewing";
    // The entry is gone for good: it only ever existed in this textarea.
    letter.value = "";
    letter.style.height = "";
    letter.readOnly = false;
    setDate();
    refreshButton();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paper.style.clipPath = "none";
    paper.style.webkitClipPath = "none";
    paper.style.transition = "";
    paper.style.opacity = "";
    stage.style.minHeight = "";
    btnLabel.textContent = "Hold to burn";

    paper.classList.remove("renew");
    void paper.offsetWidth; // restart the entrance animation
    paper.classList.add("renew");

    const done = () => {
      paper.classList.remove("renew");
      state = "idle";
      letter.focus({ preventScroll: true });
      paper.removeEventListener("animationend", done);
    };
    if (reducedMotion.matches) {
      state = "idle";
      letter.focus({ preventScroll: true });
    } else {
      paper.addEventListener("animationend", done);
    }
  }

  window.addEventListener("resize", () => {
    if (state === "idle") fitCanvas();
  });

  /* ————— Init ————— */
  setDate();
  refreshButton();
  fitCanvas();
})();
