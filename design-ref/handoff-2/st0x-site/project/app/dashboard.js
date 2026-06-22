/* ============================================================
   st0x · Dashboard — portfolio overview, savings, holdings, funds
   ============================================================ */
(function () {
  const S = window.ST0X;

  S.screens.dashboard = function () {
    const ch = S.charts;
    const p = S.PORTFOLIO;
    const monthly = p.savings * (S.APY / 100) / 12;

    const holdingRows = S.HOLDINGS.map(h => `
      <tr class="${h.earn ? 'earn-row' : ''}">
        <td>
          <div class="tok">${S.disc(h.disc, 34)}
            <div><b>${h.sym}${h.earn ? ` <span class="apy" style="padding:2px 8px;font-size:11px;">${S.APY.toFixed(2)}%</span>` : ''}</b><div class="nm">${h.name}</div></div>
          </div>
        </td>
        <td class="num mono" style="color:var(--text-2);">${S.fmt(h.bal, h.bal < 100 ? 2 : 2)}</td>
        <td class="num mono">${S.usd(h.value)}</td>
        <td class="num mono ${h.pnl >= 0 ? 'up' : 'down'}">${S.signed(h.pnl)} <span style="opacity:.7;">(${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(2)}%)</span></td>
      </tr>`).join('');

    const fundRows = S.FUNDS.map(f => `
      <tr>
        <td><div class="tok">${S.disc(f.disc, 32)}<div><b>${f.sym}</b><div class="nm">${f.name}</div></div></div></td>
        <td class="num mono" style="color:var(--text-2);">${S.fmt(f.bal, f.sym === 'ETH' ? 4 : 2)}</td>
        <td class="num">${f.idle
          ? `<button class="apy" data-go="trade" style="cursor:pointer;border:none;padding:5px 11px;">Earn ${S.APY.toFixed(2)}% →</button>`
          : '<span style="color:var(--text-muted);">—</span>'}</td>
      </tr>`).join('');

    return `
    <div class="scr wrap">
      <div class="scr-head">
        <div>
          <h1>Dashboard</h1>
          <p class="sub mono" style="display:flex;align-items:center;gap:7px;">${S.WALLET}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>
          </p>
        </div>
        <button class="btn btn-primary" data-go="trade">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Deposit
        </button>
      </div>

      <!-- overview stats -->
      <div class="statgrid">
        <div class="stat">
          <div class="k">Total value</div>
          <div class="v">$<span data-countup data-to="${p.total}" data-dec="2"></span></div>
          <div class="d up">${S.signed(p.pnl)} all-time</div>
        </div>
        <div class="stat earn">
          <div class="k"><span class="live"><i></i><i></i></span>Savings · earning</div>
          <div class="v">$<span data-countup data-to="${p.savings}" data-dec="0"></span></div>
          <div class="d">at ${S.APY.toFixed(2)}% APY</div>
        </div>
        <div class="stat">
          <div class="k">Unrealized P&amp;L</div>
          <div class="v up">${S.signed(p.pnl)}</div>
          <div class="d">across 4 holdings</div>
        </div>
        <div class="stat">
          <div class="k">Active orders</div>
          <div class="v">${p.orders}</div>
          <div class="d">2 limit · open</div>
        </div>
      </div>

      <!-- savings + performance -->
      <div class="dash-grid" style="margin-top:18px;">
        <div class="card lift savings-card">
          <div class="glow"></div>
          <div class="sc-in">
            <div style="display:flex;align-items:center;gap:12px;">
              ${S.disc('sgov', 42)}
              <div>
                <div style="display:flex;align-items:center;gap:9px;"><b style="font-size:16px;">Savings</b><span class="apy" style="padding:3px 9px;font-size:11px;"><span class="live"><i></i><i></i></span>${S.APY.toFixed(2)}% APY</span></div>
                <div class="nm" style="font-size:12px;color:var(--text-3);margin-top:2px;">wtSGOV · auto-compounding</div>
              </div>
            </div>
            <div class="figrow">
              <div><div class="k">Balance</div><div class="v">$<span data-countup data-to="${p.savings}" data-dec="2"></span></div></div>
              <div><div class="k">Earned to date</div><div class="v" style="color:var(--accent);">$<span data-countup data-to="${p.earnedToDate}" data-dec="2"></span></div></div>
            </div>
            <div style="display:flex;gap:10px;">
              <button class="btn btn-primary" style="padding:11px 18px;" data-go="trade">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg> Add
              </button>
              <button class="btn btn-ghost" style="padding:11px 18px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg> Withdraw
              </button>
            </div>
            <div style="margin-top:20px;padding:16px;border-radius:var(--r);background:var(--surface-2);border:1px solid var(--line);">
              <div class="card-head" style="margin-bottom:8px;">
                <span class="hint">NAV · last 12 months</span>
                <span class="mono up" style="font-size:13px;">+${S.APY.toFixed(2)}%</span>
              </div>
              <div style="height:60px;">${ch.spark(S.SERIES.savings, { w: 520, h: 60, color: 'var(--accent)' })}</div>
              <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--text-3);">
                <span>Yield compounds monthly</span>
                <span class="mono">≈ ${S.usd(monthly)}/mo</span>
              </div>
            </div>
          </div>
        </div>

        <!-- performance chart -->
        <div class="card lift card-pad">
          <div class="card-head">
            <h3>Portfolio value</h3>
            <div class="tf"><button data-tf>1W</button><button class="on" data-tf>1M</button><button data-tf>1Y</button></div>
          </div>
          <div class="bigpx" style="font-size:32px;">$<span data-countup data-to="${p.total}" data-dec="2"></span></div>
          <div class="subpx up" style="margin:4px 0 12px;">${S.signed(p.pnl)} (+1.78%) this month</div>
          <div class="chartbox" style="height:188px;">${ch.area(S.SERIES.perf, { w: 460, h: 188, color: 'var(--accent)' })}</div>
        </div>
      </div>

      <!-- idle nudge -->
      <div class="nudge" style="margin-top:18px;" data-go="trade">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
        <div style="flex:1;">
          <div class="nt">Your $3,920 USDC is idle.</div>
          <div class="nd">It could be earning ≈ ${S.usd(3920 * S.APY / 100)}/yr as Savings.</div>
        </div>
        <span class="apy" style="cursor:pointer;">Move to Savings →</span>
      </div>

      <!-- holdings -->
      <div class="section-label">Holdings</div>
      <div class="card" style="overflow:hidden;">
        <table class="dtable">
          <thead><tr><th>Token</th><th class="num">Balance</th><th class="num">Value</th><th class="num">P&amp;L</th></tr></thead>
          <tbody>${holdingRows}</tbody>
        </table>
      </div>

      <!-- funds -->
      <div class="section-label">Funds</div>
      <div class="card" style="overflow:hidden;">
        <table class="dtable">
          <thead><tr><th>Token</th><th class="num">Balance</th><th class="num"></th></tr></thead>
          <tbody>${fundRows}</tbody>
        </table>
      </div>
    </div>`;
  };

  S.wires.dashboard = function (root) {
    root.querySelectorAll('.tf [data-tf], .tf button').forEach(b => b.addEventListener('click', e => {
      const grp = b.closest('.tf'); if (!grp) return;
      grp.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
  };
})();
