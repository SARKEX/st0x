/* ============================================================
   st0x · SVG chart generators (theme-token aware)
   All return SVG strings sized to fill their container.
   ============================================================ */
(function () {
  const S = window.ST0X;

  // unique id counter so multiple gradients coexist
  let _gid = 0;
  const gid = () => 'g' + (++_gid);

  // ---------- smooth area / line chart ----------
  // opts: { color, w, h, fill (bool), dash (bool) }
  function area(series, opts) {
    opts = opts || {};
    const W = opts.w || 600, H = opts.h || 220, pad = opts.pad != null ? opts.pad : 6;
    const color = opts.color || 'var(--accent)';
    const lo = Math.min(...series), hi = Math.max(...series);
    const span = (hi - lo) || 1;
    const n = series.length;
    const X = i => pad + (i / (n - 1)) * (W - pad * 2);
    const Y = v => pad + (1 - (v - lo) / span) * (H - pad * 2);
    // catmull-rom -> bezier smoothing
    const pts = series.map((v, i) => [X(i), Y(v)]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const id = gid();
    const fill = opts.fill === false ? '' :
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
         <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
       </linearGradient></defs>
       <path d="${d} L${X(n - 1).toFixed(1)},${H} L${X(0).toFixed(1)},${H} Z" fill="url(#${id})"/>`;
    const last = pts[pts.length - 1];
    const dot = opts.dot === false ? '' :
      `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.4" fill="${color}"/>
       <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7" fill="${color}" opacity="0.18"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" style="width:100%;height:100%;">
      ${fill}
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      ${dot}
    </svg>`;
  }

  // ---------- mini sparkline (no fill, no axes) ----------
  function spark(series, opts) {
    opts = opts || {};
    return area(series, Object.assign({ w: opts.w || 120, h: opts.h || 36, fill: false, dot: opts.dot !== false, pad: 4, color: opts.color || 'var(--accent)' }, opts));
  }

  // ---------- candlesticks ----------
  function candles(series, opts) {
    opts = opts || {};
    const W = opts.w || 640, H = opts.h || 300, pad = 8;
    const r = S.rng(opts.seed || 5);
    const data = []; let lo = 1e9, hi = -1e9;
    for (let i = 0; i < series.length; i++) {
      const o = series[i];
      const c = (i < series.length - 1) ? series[i + 1] : o + (r() - 0.4) * 4;
      const h = Math.max(o, c) + r() * 3.2;
      const l = Math.min(o, c) - r() * 3.2;
      data.push({ o, c, h, l, up: c >= o });
      lo = Math.min(lo, l); hi = Math.max(hi, h);
    }
    const span = (hi - lo) || 1;
    const sx = (W - pad * 2) / data.length;
    const Y = v => pad + (hi - v) / span * (H - pad * 2);
    const cw = sx * 0.58;
    let body = '';
    data.forEach((d, i) => {
      const x = pad + i * sx + sx / 2;
      const col = d.up ? 'var(--up)' : 'var(--down)';
      body += `<line x1="${x.toFixed(1)}" y1="${Y(d.h).toFixed(1)}" x2="${x.toFixed(1)}" y2="${Y(d.l).toFixed(1)}" stroke="${col}" stroke-width="1.2" opacity=".65"/>`;
      const yTop = Y(Math.max(d.o, d.c)), hgt = Math.max(1.5, Math.abs(Y(d.o) - Y(d.c)));
      body += `<rect x="${(x - cw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${cw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="1.2" fill="${col}"/>`;
    });
    const lastY = Y(data[data.length - 1].c);
    body += `<line x1="0" y1="${lastY.toFixed(1)}" x2="${W}" y2="${lastY.toFixed(1)}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" style="width:100%;height:100%;">${body}</svg>`;
  }

  // ---------- vertical bars (volume) ----------
  function bars(values, opts) {
    opts = opts || {};
    const W = opts.w || 600, H = opts.h || 180, pad = 4;
    const hi = Math.max(...values) || 1;
    const n = values.length;
    const slot = (W - pad * 2) / n;
    const bw = slot * 0.62;
    const color = opts.color || 'var(--iris)';
    let body = '';
    values.forEach((v, i) => {
      const h = (v / hi) * (H - pad * 2);
      const x = pad + i * slot + (slot - bw) / 2;
      const y = H - pad - h;
      const op = 0.45 + 0.55 * (i / (n - 1));
      body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="1.5" fill="${color}" opacity="${op.toFixed(2)}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" style="width:100%;height:100%;">${body}</svg>`;
  }

  // ---------- horizontal proportion bar ----------
  function hbar(pct, color) {
    return `<div class="hbar"><span style="width:${Math.max(2, pct).toFixed(0)}%;background:${color || 'var(--accent)'};"></span></div>`;
  }

  S.charts = { area, spark, candles, bars, hbar };
})();
