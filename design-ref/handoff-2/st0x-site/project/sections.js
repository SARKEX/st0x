/* ============================================================
   st0x · page sections (color, type, components, in-context)
   Built in JS to keep markup DRY (swatches, candles, etc.)
   ============================================================ */
(function () {
  const mount = document.getElementById('sections');

  /* ---------- helpers ---------- */
  const swatch = (name, hex, ink) =>
    `<div class="swatch">
       <div class="chip" style="background:${hex}"></div>
       <div class="meta"><b style="${ink ? 'color:' + ink : ''}">${name}</b><span>${hex}</span></div>
     </div>`;

  const darkSet = [
    ['Page', '#070b11'], ['Surface 1', '#0c121b'], ['Surface 2', '#111a25'],
    ['Accent', '#2de3a6'], ['Accent deep', '#15c78c'], ['Iris', '#7d8bff'],
    ['Down', '#fb6a5d'], ['Text', '#eef3f8'], ['Text 2', '#9aa9bb'],
  ];
  const lightSet = [
    ['Page', '#f4f7f9'], ['Surface 1', '#ffffff'], ['Surface 2', '#eef2f5'],
    ['Accent', '#0fb37e'], ['Accent deep', '#0a9468'], ['Iris', '#5b66e0'],
    ['Down', '#e0483b'], ['Text', '#0c1626'], ['Text 2', '#51607a'],
  ];

  /* ---------- candlestick generator ---------- */
  function candles() {
    const N = 48, W = 560, H = 280, pad = 8;
    let price = 118, lo = 999, hi = 0;
    const data = [];
    for (let i = 0; i < N; i++) {
      const drift = (i / N) * 26;            // gentle uptrend
      const o = price;
      const c = o + (Math.sin(i * 0.7) * 3) + (Math.random() - 0.42) * 5 + 0.55;
      const h = Math.max(o, c) + Math.random() * 3.2;
      const l = Math.min(o, c) - Math.random() * 3.2;
      price = c;
      const base = 118 + drift;
      data.push({ o: o + drift, c: c + drift, h: h + drift, l: l + drift, up: c >= o });
      lo = Math.min(lo, l + drift); hi = Math.max(hi, h + drift);
    }
    const sx = (W - pad * 2) / N;
    const sy = (H - pad * 2) / (hi - lo || 1);
    const Y = v => pad + (hi - v) * sy;
    const cw = sx * 0.58;
    let body = '';
    data.forEach((d, i) => {
      const x = pad + i * sx + sx / 2;
      const col = d.up ? 'var(--up)' : 'var(--down)';
      body += `<line x1="${x}" y1="${Y(d.h)}" x2="${x}" y2="${Y(d.l)}" stroke="${col}" stroke-width="1.2" opacity=".7"/>`;
      const yTop = Y(Math.max(d.o, d.c)), hgt = Math.max(1.5, Math.abs(Y(d.o) - Y(d.c)));
      body += `<rect x="${x - cw / 2}" y="${yTop}" width="${cw}" height="${hgt}" rx="1.2" fill="${col}"/>`;
    });
    // last-price guide line
    const lastY = Y(data[data.length - 1].c);
    body += `<line x1="0" y1="${lastY}" x2="${W}" y2="${lastY}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:100%;">${body}</svg>`;
  }

  /* ---------- markup ---------- */
  mount.innerHTML = `
  <!-- ============ COLOR ============ -->
  <section class="section wrap" id="color">
    <p class="eyebrow">Foundations</p>
    <h2>Two themes, one signature.</h2>
    <p class="lede">Near-black blue depth or cool warm-white — both carry the same mint-emerald accent and iris secondary. The accent shifts a touch deeper in light mode to hold contrast. Yellow is retired.</p>
    <div class="modeboard">
      <div class="pane dark">
        <h4>Dark · primary</h4>
        <div class="swatches">${darkSet.map(([n, h]) => swatch(n, h)).join('')}</div>
      </div>
      <div class="pane light">
        <h4>Light · alternate</h4>
        <div class="swatches">${lightSet.map(([n, h]) => swatch(n, h)).join('')}</div>
      </div>
    </div>
  </section>

  <!-- ============ TYPE ============ -->
  <section class="section wrap" id="type">
    <p class="eyebrow">Typography</p>
    <h2>Sharp display, calm body, honest numbers.</h2>
    <p class="lede">Space Grotesk gives headlines a precise, technical edge. DM Sans keeps the interface quiet and legible. JetBrains Mono — with tabular figures — makes every price and balance line up to the decimal.</p>
    <div class="specimen card lift" style="padding:8px 26px 18px;">
      <div class="row"><span class="tag">Space Grotesk · Display</span><span class="display" style="font-weight:600; font-size:40px; letter-spacing:-.03em;">Trade tokenized markets</span></div>
      <div class="row"><span class="tag">DM Sans · Body</span><span style="font-size:18px; color:var(--text-2); max-width:52ch; line-height:1.5;">Permissionless, Treasury-backed, redeemable to the underlying in under ten seconds — twenty-four hours a day.</span></div>
      <div class="row"><span class="tag">JetBrains Mono · Figures</span><span class="mono" style="font-size:30px; font-weight:600;">$141.20 &nbsp;<span style="color:var(--up);">+1.40%</span> &nbsp;<span style="color:var(--text-3);">3.53% APY</span></span></div>
    </div>
  </section>

  <!-- ============ COMPONENTS ============ -->
  <section class="section wrap" id="components">
    <p class="eyebrow">Building blocks</p>
    <h2>Components in the new skin.</h2>
    <p class="lede">Every control reads from the same tokens, so the whole kit retints instantly when you flip the theme. Try it.</p>
    <div class="gallery">
      <div class="demo">
        <span class="cap">Buttons</span>
        <div class="stack"><button class="btn btn-primary">Buy tNVDA</button><button class="btn btn-ghost">Why SGOV</button></div>
        <div class="stack"><button class="btn btn-quiet">Cancel</button><button class="btn btn-primary" disabled style="opacity:.5;">Pending…</button></div>
      </div>

      <div class="demo">
        <span class="cap">Earn pill &amp; APY</span>
        <div class="stack">
          <button class="earnpill">Earn <span class="pct"><span class="live"><i></i><i></i></span>3.53%</span></button>
        </div>
        <div class="stack"><span class="apy"><span class="live"><i></i><i></i></span>3.53% APY</span><span class="apy lg">3.53% APY</span></div>
      </div>

      <div class="demo">
        <span class="cap">Token discs</span>
        <div class="stack">
          <span class="disc usdc" style="width:42px;height:42px;font-size:18px;">$</span>
          <span class="disc sgov" style="width:42px;height:42px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#042b1f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5"/><path d="M5 9v8M19 9v8M9 9v8M15 9v8"/><path d="M3 20h18"/></svg>
          </span>
          <span class="disc nvda" style="width:42px;height:42px;font-size:12px;font-weight:700;">tN</span>
        </div>
        <div class="stack" style="gap:7px;">
          <span class="navlink active">Trade</span><span class="navlink">Portfolio</span>
        </div>
      </div>

      <div class="demo">
        <span class="cap">Segmented · Buy / Sell</span>
        <div class="seg" id="segDemo">
          <button class="on-buy" data-seg="buy">Buy</button>
          <button data-seg="sell">Sell</button>
        </div>
        <div class="tf"><button class="on">1H</button><button>1D</button><button>1W</button><button>1M</button></div>
      </div>

      <div class="demo">
        <span class="cap">Input field</span>
        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="lbl">Pay</span><span class="lbl">Balance 3,920 USDC</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="mono" style="font-size:22px;color:var(--text-3);">$</span>
            <input value="500" inputmode="decimal" aria-label="amount" />
            <span class="disc usdc" style="width:30px;height:30px;font-size:13px;">$</span>
          </div>
        </div>
      </div>

      <div class="demo">
        <span class="cap">Status &amp; badges</span>
        <div class="stack">
          <span class="apy" style="color:var(--iris);border-color:var(--iris-soft);background:var(--iris-soft);">Alpha</span>
          <span class="apy" style="color:var(--up);">+$321.90</span>
          <span class="apy" style="color:var(--down);border-color:var(--down-soft);background:var(--down-soft);">−1.2%</span>
        </div>
        <div class="stack"><span class="live"><i></i><i></i></span><span style="font-size:13px;color:var(--text-2);">Live · redeem 24/7</span></div>
      </div>
    </div>
  </section>

  <!-- ============ IN CONTEXT: TRADE ============ -->
  <section class="section wrap" id="trade">
    <p class="eyebrow">In context</p>
    <h2>The Trade panel, re-skinned.</h2>
    <p class="lede">Same product, new language. Notice how the ambient field sits quietly behind the glass card, the candles use the semantic up/down tokens, and the idle-cash nudge reuses the Earn signature.</p>

    <div class="card lift glass" style="padding:0; overflow:hidden;">
      <div style="display:grid; grid-template-columns: 1.55fr 1fr; gap:0;" class="tradegrid">
        <!-- chart -->
        <div style="padding:22px 22px 18px; border-right:1px solid var(--line);">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
            <div style="display:flex; gap:12px; align-items:center;">
              <span class="disc nvda" style="width:40px;height:40px;font-size:12px;font-weight:700;">tN</span>
              <div>
                <div style="display:flex;align-items:center;gap:8px;"><b style="font-size:16px;">tNVDA</b><span style="font-size:12px;color:var(--text-3);">NVIDIA</span></div>
                <div class="mono" style="font-size:26px; font-weight:600; line-height:1.1; margin-top:2px;">$141.20</div>
                <div class="mono" style="font-size:13px; color:var(--up); font-weight:600;">+1.40% today</div>
              </div>
            </div>
            <div class="tf"><button>1H</button><button class="on">1D</button><button>1W</button><button>1M</button></div>
          </div>
          <div style="height:280px; border-radius:12px; background:linear-gradient(180deg, color-mix(in srgb,var(--accent) 5%, transparent), transparent); padding:4px;">${candles()}</div>
        </div>

        <!-- order ticket -->
        <div style="padding:22px; display:flex; flex-direction:column; gap:14px;">
          <div class="seg" id="segTrade">
            <button class="on-buy" data-seg="buy">Buy</button>
            <button data-seg="sell">Sell</button>
          </div>

          <div class="field">
            <div style="display:flex;justify-content:space-between;"><span class="lbl">Pay</span><span class="lbl">Balance 3,920 USDC</span></div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:2px;">
              <span class="mono" style="font-size:24px;color:var(--text-3);">$</span>
              <input value="500" inputmode="decimal" aria-label="pay" style="font-size:26px;" />
              <span style="display:inline-flex;align-items:center;gap:7px;background:var(--surface-3);padding:5px 9px;border-radius:var(--pill);font-size:13px;font-weight:600;"><span class="disc usdc" style="width:22px;height:22px;font-size:11px;">$</span>USDC</span>
            </div>
          </div>

          <div class="field">
            <span class="lbl">Receive (est.)</span>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
              <span class="mono" style="font-size:26px;font-weight:600;">3.541</span>
              <span style="display:inline-flex;align-items:center;gap:7px;background:var(--surface-3);padding:5px 9px;border-radius:var(--pill);font-size:13px;font-weight:600;"><span class="disc nvda" style="width:22px;height:22px;font-size:9px;font-weight:700;">tN</span>tNVDA</span>
            </div>
          </div>

          <button class="btn btn-primary" style="padding:15px; font-size:15px;">Buy tNVDA</button>

          <div style="display:flex; gap:12px; align-items:center; padding:13px 14px; border-radius:var(--r); border:1px solid var(--accent-line); background:var(--accent-soft);">
            <span class="disc sgov" style="width:34px;height:34px;flex:none;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#042b1f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5"/><path d="M5 9v8M19 9v8M9 9v8M15 9v8"/><path d="M3 20h18"/></svg>
            </span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">Idle USDC between trades?</div>
              <div style="font-size:12px;color:var(--text-2);">Park it in Savings &amp; earn 3.53% — withdraw anytime.</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ============ IN CONTEXT: EARN BAND ============ -->
  <section class="section wrap" id="earn">
    <div class="card lift" style="overflow:hidden; padding:0; position:relative;">
      <div style="position:absolute; inset:0; background:radial-gradient(120% 140% at 85% 0%, var(--accent-soft), transparent 60%); pointer-events:none;"></div>
      <div style="position:relative; display:grid; grid-template-columns: 1.3fr 1fr; gap:0;" class="tradegrid">
        <div style="padding:40px 40px 38px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
            <span class="apy"><span class="live"><i></i><i></i></span>3.53% APY</span>
            <span style="font-size:12px;color:var(--text-3);font-family:var(--font-mono);letter-spacing:.1em;text-transform:uppercase;">Save &amp; Earn</span>
          </div>
          <h3 class="display" style="font-weight:600; font-size:clamp(28px,3.4vw,42px); line-height:1.06; margin:0 0 14px; letter-spacing:-.025em;">Earn <span style="color:var(--accent);"><span data-countup data-to="3.53" data-dec="2"></span>%</span> on your idle dollars.</h3>
          <p style="color:var(--text-2); font-size:16px; line-height:1.5; max-width:46ch; margin:0 0 26px;">Treasury-backed by BlackRock's SGOV, tokenized and live on Base. No KYC. Redeem to real shares in under ten seconds.</p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-primary" style="padding:13px 20px;">Start earning</button>
            <button class="btn btn-ghost" style="padding:13px 20px;">How it works</button>
          </div>
        </div>
        <div style="padding:40px; display:flex; flex-direction:column; justify-content:center; gap:18px; border-left:1px solid var(--line);">
          <div>
            <div style="font-size:12px;color:var(--text-3);font-family:var(--font-mono);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;">Earned to date</div>
            <div class="mono" style="font-size:38px;font-weight:600;color:var(--accent);"><span data-countup data-to="218.40" data-dec="2" data-pre="$"></span></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
            <div style="padding:12px;border-radius:var(--r);background:var(--surface-2);border:1px solid var(--line);">
              <div class="mono" style="font-weight:600;font-size:15px;">$85B</div><div style="font-size:10px;color:var(--text-3);letter-spacing:.05em;text-transform:uppercase;">AUM</div>
            </div>
            <div style="padding:12px;border-radius:var(--r);background:var(--surface-2);border:1px solid var(--line);">
              <div class="mono" style="font-weight:600;font-size:15px;">&lt;10s</div><div style="font-size:10px;color:var(--text-3);letter-spacing:.05em;text-transform:uppercase;">Redeem</div>
            </div>
            <div style="padding:12px;border-radius:var(--r);background:var(--surface-2);border:1px solid var(--line);">
              <div class="mono" style="font-weight:600;font-size:15px;">No&nbsp;KYC</div><div style="font-size:10px;color:var(--text-3);letter-spacing:.05em;text-transform:uppercase;">Open</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <footer class="foot wrap">
    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; align-items:center; border-top:1px solid var(--line); padding-top:26px;">
      <span>st0x · design language v2 — tokens, motion &amp; components. Not financial advice.</span>
      <span class="mono" style="color:var(--text-muted);">dark · light · ambient</span>
    </div>
  </footer>
  `;

  /* segmented toggle behaviour */
  document.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('[data-seg]'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => { x.classList.remove('on-buy', 'on-sell'); });
      b.classList.add(b.dataset.seg === 'buy' ? 'on-buy' : 'on-sell');
    });
  });

  /* timeframe toggle */
  document.querySelectorAll('.tf').forEach(tf => {
    tf.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      tf.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
  });

  /* responsive: stack trade grid */
  const mq = window.matchMedia('(max-width: 760px)');
  function stack() {
    document.querySelectorAll('.tradegrid').forEach(g => {
      g.style.gridTemplateColumns = mq.matches ? '1fr' : '';
    });
  }
  mq.addEventListener('change', stack); stack();
})();
