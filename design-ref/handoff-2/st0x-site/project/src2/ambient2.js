/* ============================================================
   st0x · v2 ambient motion — slow & calm, no wave-lines
   - drifting aurora blooms (very slow)
   - a sparse field of soft "bokeh" orbs that float upward,
     parallaxed by size, with a gentle breathing twinkle
   - respects prefers-reduced-motion
   Mount: a fixed <canvas id="amb2-canvas"> + aurora divs sit
   behind everything (z-index 0). The app renders above (z 1).
   ============================================================ */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.getElementById('amb2-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');

  const MINT = [45, 227, 166];
  const IRIS = [125, 139, 255];

  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // soft floating orbs — large + few, so it reads as calm depth, not snow
  const COUNT = Math.max(14, Math.min(26, Math.round((W * H) / 90000)));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const orbs = Array.from({ length: COUNT }, () => {
    const r = rnd(26, 120);                 // big soft blooms
    return {
      x: rnd(0, W), y: rnd(0, H),
      r,
      vy: -rnd(2, 7) / 1000 * (140 / r),    // bigger = slower (parallax), all very slow upward
      vx: rnd(-1, 1) / 1000 * (60 / r),
      tint: Math.random() < 0.62 ? MINT : IRIS,
      baseA: rnd(0.05, 0.14) * (60 / r + 0.5),
      tw: rnd(0.0004, 0.0011),              // twinkle speed (slow)
      ph: rnd(0, Math.PI * 2),
    };
  });

  function paint(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const o of orbs) {
      const a = Math.max(0.02, o.baseA * (0.6 + 0.4 * Math.sin(t * o.tw + o.ph)));
      const [r, g, b] = o.tint;
      const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function step(t, dt) {
    for (const o of orbs) {
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      const m = o.r;
      if (o.y < -m) { o.y = H + m; o.x = rnd(0, W); }
      if (o.x < -m) o.x = W + m;
      if (o.x > W + m) o.x = -m;
    }
  }

  if (reduce) {
    paint(0);
    return;
  }

  let last = performance.now(), raf;
  function loop(now) {
    const dt = Math.min(50, now - last); last = now;
    step(now, dt);
    paint(now);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = performance.now(); raf = requestAnimationFrame(loop); }
  });
})();
