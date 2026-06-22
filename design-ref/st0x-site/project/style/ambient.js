/* ============================================================
   st0x · ambient motion + theme
   - soft drifting aurora (CSS) + flowing line field (canvas)
   - retints on theme change; respects reduced-motion
   ============================================================ */
(function () {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- theme ---------- */
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('st0x-theme', t); } catch (e) {}
    document.querySelectorAll('[data-theme-btn]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-theme-btn') === t);
    });
    // let the canvas pick up fresh CSS vars
    window.dispatchEvent(new Event('st0x-retint'));
  }
  let saved = 'dark';
  try { saved = localStorage.getItem('st0x-theme') || 'dark'; } catch (e) {}
  applyTheme(saved);

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-theme-btn]');
    if (btn) applyTheme(btn.getAttribute('data-theme-btn'));
  });

  /* ---------- aurora blobs ---------- */
  const amb = document.getElementById('ambient');
  function readVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }
  function buildAuras() {
    if (!amb) return;
    amb.querySelectorAll('.aura').forEach(n => n.remove());
    const specs = [
      { v: '--aura-a', w: 620, h: 560, x: '8%',  y: '-12%', anim: 'drift1', dur: 26 },
      { v: '--aura-b', w: 540, h: 520, x: '62%', y: '4%',   anim: 'drift2', dur: 32 },
      { v: '--aura-c', w: 700, h: 640, x: '30%', y: '38%',  anim: 'drift3', dur: 38 },
    ];
    specs.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'aura';
      d.style.width = s.w + 'px';
      d.style.height = s.h + 'px';
      d.style.left = s.x;
      d.style.top = s.y;
      d.style.background = 'radial-gradient(circle at 50% 50%, var(' + s.v + '), transparent 70%)';
      if (!reduce) d.style.animation = `${s.anim} ${s.dur}s ease-in-out infinite`;
      amb.appendChild(d);
    });
  }
  buildAuras();

  /* ---------- flowing line field (canvas) ---------- */
  const cv = document.getElementById('flow');
  if (cv) {
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stroke = readVar('--line-field') || 'rgba(120,200,170,0.10)';

    function resize() {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('st0x-retint', () => { stroke = readVar('--line-field'); });

    // a set of soft horizontal sine "currents"
    const LINES = 7;
    const lines = Array.from({ length: LINES }, (_, i) => ({
      base: 0.16 + (i / (LINES - 1)) * 0.68,   // vertical position fraction
      amp: 18 + Math.random() * 26,            // wave amplitude
      len: 0.7 + Math.random() * 0.7,          // wavelength factor
      speed: 0.12 + Math.random() * 0.16,      // drift speed
      phase: Math.random() * Math.PI * 2,
    }));

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1.2;
      for (const l of lines) {
        const y0 = H * l.base;
        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += 14) {
          const k = (x / W) * Math.PI * 2 * l.len;
          const y = y0 + Math.sin(k + t * 0.001 * l.speed * 6 + l.phase) * l.amp
                       + Math.sin(k * 2.3 + t * 0.0006) * (l.amp * 0.25);
          if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        // fade lines toward edges via gradient stroke
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'transparent');
        g.addColorStop(0.5, stroke);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.stroke();
      }
    }

    if (reduce) {
      draw(0);
    } else {
      let raf;
      const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      // pause when tab hidden
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else raf = requestAnimationFrame(loop);
      });
    }
  }

  /* ---------- tiny count-up for the APY / earned figures ---------- */
  window.st0xCountUp = function (el) {
    const target = parseFloat(el.getAttribute('data-to'));
    const dec = parseInt(el.getAttribute('data-dec') || '2', 10);
    const pre = el.getAttribute('data-pre') || '';
    const fmt = v => pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    // write the final value SYNCHRONOUSLY so the number is never blank
    el.textContent = fmt(target);
    if (reduce) return;
    const dur = 1100; let start;
    function tick(ts) {
      if (!start) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(target * e);
      if (k < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);
    }
    requestAnimationFrame(tick);
  };
  function runCountUps() { document.querySelectorAll('[data-countup]').forEach(el => window.st0xCountUp(el)); }
  if (document.readyState === 'complete') runCountUps();
  else window.addEventListener('load', runCountUps);
})();
