/* ============================================================
   st0x · Home screen — landing + quick trade + Save&Earn + markets
   ============================================================ */
(function () {
  const S = window.ST0X;

  S.screens.home = function () {
    const ch = S.charts;
    const marketRows = S.ASSETS.map(a => `
      <tr class="clickable" data-trade="${a.sym}">
        <td>
          <div class="tok">${S.disc(a.disc, 34)}
            <div><b>${a.sym}</b><div class="nm">${a.name}</div></div>
          </div>
        </td>
        <td class="num mono">${S.usd(a.price)}</td>
        <td class="num mono ${a.chg >= 0 ? 'up' : 'down'}">${a.chg >= 0 ? '+' : ''}${a.chg.toFixed(2)}%</td>
        <td class="num mono" style="color:var(--text-2);">$${a.tvl.toFixed(1)}M</td>
        <td class="num" style="width:90px;">${ch.spark(a.series, { w: 90, h: 30, color: a.chg >= 0 ? 'var(--up)' : 'var(--down)', dot: false })}</td>
      </tr>`).join('');

    const sav = S.SAVINGS;

    return `
    <div class="scr wrap">

      <!-- hero + quick trade -->
      <section class="hero">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Tokenized markets · Base mainnet</p>
            <h1>Trade the market.<br>Earn on the <span style="color:var(--accent);">rest</span>.</h1>
            <p class="lede">Buy tokenized equities — NVIDIA, Tesla, Coinbase — settled onchain in seconds. Idle dollars between trades earn ${S.APY.toFixed(2)}%, Treasury-backed and redeemable 24/7. No KYC.</p>
            <div class="cta">
              <button class="btn btn-primary" style="padding:14px 22px;font-size:15px;" data-go="trade">Start trading
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>
              <button class="btn btn-ghost" style="padding:14px 22px;font-size:15px;" data-go="dashboard">Open dashboard</button>
              <span class="apy lg"><span class="live"><i></i><i></i></span><span data-countup data-to="${S.APY}" data-dec="2"></span>% APY · live</span>
            </div>
          </div>

          <!-- quick trade card -->
          <div class="card lift glass">
            <div class="qt">
              <div class="qt-head"><span>Quick trade</span><span class="mono">Base · USDC</span></div>
              <div class="qt-row">
                <span class="pick">${S.disc('usdc', 26)} USDC</span>
                <span class="amt mono" id="qtPay">500.00</span>
              </div>
              <div class="qt-pivot"><span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>
              </span></div>
              <div class="qt-row">
                <span class="pick" data-go="trade">${S.disc('nvda', 26)} tNVDA
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </span>
                <span class="amt mono muted">3.541</span>
              </div>
              <button class="btn btn-primary" style="padding:14px;font-size:15px;margin-top:4px;" data-go="trade">Buy tNVDA</button>
              <div class="nudge" style="margin-top:2px;" data-go="dashboard">
                ${S.disc('sgov', 34)}
                <div style="flex:1;">
                  <div class="nt">Idle USDC earns ${S.APY.toFixed(2)}%</div>
                  <div class="nd">Park it in Savings — withdraw anytime.</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Save & Earn band -->
      <section style="margin-top:30px;">
        <div class="card lift" style="overflow:hidden;position:relative;">
          <div style="position:absolute;inset:0;background:radial-gradient(120% 140% at 85% 0%, var(--accent-soft), transparent 60%);pointer-events:none;"></div>
          <div style="position:relative;display:grid;grid-template-columns:1.3fr 1fr;gap:0;" class="earnband">
            <div style="padding:38px 38px 36px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                <span class="apy"><span class="live"><i></i><i></i></span>${S.APY.toFixed(2)}% APY</span>
                <span class="mono" style="font-size:12px;color:var(--text-3);letter-spacing:.1em;text-transform:uppercase;">Save &amp; Earn</span>
              </div>
              <h2 class="display" style="font-weight:600;font-size:clamp(26px,3.2vw,40px);line-height:1.06;margin:0 0 14px;letter-spacing:-.025em;">Don't let your dollars<br>sit still.</h2>
              <p style="color:var(--text-2);font-size:16px;line-height:1.5;max-width:46ch;margin:0 0 24px;">Hold USDC as wtSGOV — backed 1:1 by BlackRock's $85B Treasury ETF, tokenized and live on Base. Yield auto-compounds. Redeem to real shares in under ten seconds.</p>
              <div style="display:flex;gap:12px;flex-wrap:wrap;">
                <button class="btn btn-primary" style="padding:13px 20px;" data-go="dashboard">Start earning</button>
                <button class="btn btn-ghost" style="padding:13px 20px;" data-go="metrics">View platform metrics</button>
              </div>
            </div>
            <div style="padding:34px 38px;display:flex;flex-direction:column;justify-content:center;gap:16px;border-left:1px solid var(--line);" class="earnband-side">
              <div class="qt-head"><span class="mono" style="text-transform:uppercase;letter-spacing:.08em;">$10,000 · 1 year</span>
                ${ch.spark(S.SERIES.savings, { w: 80, h: 26, color: 'var(--accent)', dot: false })}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:14px;">
                <span style="display:flex;align-items:center;gap:9px;color:var(--text-2);">${S.disc('usdc', 26)} Idle USDC</span>
                <span class="mono" style="color:var(--text-3);">+$0</span>
              </div>
              <div style="height:1px;background:var(--line);"></div>
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:14px;">
                <span style="display:flex;align-items:center;gap:9px;">${S.disc('sgov', 26)} as wtSGOV</span>
                <span class="mono" style="font-weight:600;color:var(--accent);">+$<span data-countup data-to="353" data-dec="0"></span></span>
              </div>
              <p style="text-align:center;font-size:12px;color:var(--text-3);margin:2px 0 0;">Same dollars. One earns, one doesn't.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- markets table -->
      <section style="margin-top:34px;">
        <div class="scr-head" style="margin-bottom:14px;">
          <div><h2 class="display" style="font-weight:600;font-size:24px;margin:0;letter-spacing:-.02em;">Markets</h2></div>
          <button class="btn btn-quiet" data-go="trade">All markets →</button>
        </div>
        <div class="card" style="overflow:hidden;">
          <table class="dtable">
            <thead><tr>
              <th>Market</th><th class="num">Price</th><th class="num">24h</th><th class="num">TVL</th><th class="num">7d</th>
            </tr></thead>
            <tbody>
              <tr class="clickable earn-row" data-go="dashboard">
                <td><div class="tok">${S.disc('sgov', 34)}<div><b>${sav.sym} <span class="apy" style="padding:2px 8px;font-size:11px;">${S.APY.toFixed(2)}%</span></b><div class="nm">Auto-compounding · US Treasuries</div></div></div></td>
                <td class="num mono">${S.usd(sav.price)}</td>
                <td class="num mono up">+0.01%</td>
                <td class="num mono" style="color:var(--text-2);">$${sav.tvl.toFixed(1)}M</td>
                <td class="num"><span class="apy" style="padding:3px 9px;font-size:11px;">Earn →</span></td>
              </tr>
              ${marketRows}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
  };

  S.wires.home = function (root) {
    // responsive earnband
    const grid = root.querySelector('.earnband');
    const apply = () => {
      if (!grid) return;
      const stack = window.matchMedia('(max-width: 720px)').matches;
      grid.style.gridTemplateColumns = stack ? '1fr' : '1.3fr 1fr';
      const side = root.querySelector('.earnband-side');
      if (side) side.style.borderLeft = stack ? 'none' : '1px solid var(--line)';
    };
    apply();
    window.addEventListener('resize', apply);
  };
})();
