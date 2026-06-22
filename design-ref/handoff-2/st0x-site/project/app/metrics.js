/* ============================================================
   st0x · Platform Metrics — TVL/AUM, volume, APY+yield, wallets
   ============================================================ */
(function () {
  const S = window.ST0X;

  S.screens.metrics = function () {
    const ch = S.charts;
    const m = S.PLATFORM;

    // TVL breakdown by market (savings + equities)
    const bd = [
      { sym: 'wtSGOV', disc: 'sgov', tvl: S.SAVINGS.tvl, color: 'var(--accent)' },
      ...S.ASSETS.map((a, i) => ({ sym: a.sym, disc: a.disc, tvl: a.tvl, color: ['var(--iris)', '#5fb0ff', '#f7931a', '#ff6b6f'][i] }))
    ].sort((x, y) => y.tvl - x.tvl);
    const bdMax = Math.max(...bd.map(b => b.tvl));
    const bdRows = bd.map(b => `
      <div class="breakdown-row">
        <div class="bd-name">${S.disc(b.disc, 28)} ${b.sym}</div>
        ${ch.hbar((b.tvl / bdMax) * 100, b.color)}
        <div class="bd-val">$${b.tvl.toFixed(1)}M</div>
      </div>`).join('');

    return `
    <div class="scr wrap">
      <div class="scr-head">
        <div>
          <p class="eyebrow">Transparency · live</p>
          <h1>Platform metrics</h1>
          <p class="sub">Onchain activity across st0x — updated every block on Base mainnet.</p>
        </div>
        <span class="apy lg"><span class="live"><i></i><i></i></span>Live · ${m.markets} markets</span>
      </div>

      <!-- hero stats -->
      <div class="statgrid">
        <div class="stat">
          <div class="k">Total value locked</div>
          <div class="v">$<span data-countup data-to="${m.tvl}" data-dec="1"></span>M</div>
          <div class="d up">+${m.tvlChg.toFixed(1)}% · 30d</div>
          <div class="spk">${ch.spark(S.SERIES.tvl, { w: 84, h: 30, color: 'var(--accent)', dot: false })}</div>
        </div>
        <div class="stat">
          <div class="k">24h volume</div>
          <div class="v">$<span data-countup data-to="${m.vol24h}" data-dec="2"></span>M</div>
          <div class="d">$${m.volTotal}M all-time</div>
          <div class="spk">${ch.spark(S.SERIES.vol, { w: 84, h: 30, color: 'var(--iris)', dot: false })}</div>
        </div>
        <div class="stat earn">
          <div class="k"><span class="live"><i></i><i></i></span>Current APY</div>
          <div class="v"><span data-countup data-to="${m.apy}" data-dec="2"></span>%</div>
          <div class="d">$${m.yieldDistributed.toFixed(2)}M yield distributed</div>
        </div>
        <div class="stat">
          <div class="k">Wallets</div>
          <div class="v"><span data-countup data-to="${m.wallets}" data-dec="0"></span></div>
          <div class="d up">+${m.walletsChg.toFixed(1)}% · 7d</div>
          <div class="spk">${ch.spark(S.SERIES.wallets, { w: 84, h: 30, color: 'var(--accent)', dot: false })}</div>
        </div>
      </div>

      <!-- TVL over time (big) -->
      <div class="card lift card-pad" style="margin-top:18px;">
        <div class="card-head">
          <div>
            <h3>Total value locked</h3>
            <div class="bigpx" style="font-size:30px;margin-top:6px;">$<span data-countup data-to="${m.tvl}" data-dec="1"></span>M</div>
            <div class="subpx up">+${m.tvlChg.toFixed(1)}% over 30 days</div>
          </div>
          <div class="tf"><button data-tf>7D</button><button class="on" data-tf>30D</button><button data-tf>90D</button><button data-tf>ALL</button></div>
        </div>
        <div class="chartbox" style="height:240px;">${ch.area(S.SERIES.tvl, { w: 1040, h: 240, color: 'var(--accent)' })}</div>
      </div>

      <!-- volume + yield row -->
      <div class="metrics-2" style="margin-top:18px;">
        <div class="card lift card-pad">
          <div class="card-head">
            <div>
              <h3>Trading volume</h3>
              <div class="subpx" style="color:var(--text-2);margin-top:6px;">Daily · last 30 days</div>
            </div>
            <div style="text-align:right;">
              <div class="bigpx" style="font-size:22px;">$${m.volTotal}M</div>
              <div class="hint mono">cumulative</div>
            </div>
          </div>
          <div class="chartbox" style="height:180px;background:none;">${ch.bars(S.SERIES.vol, { w: 600, h: 180, color: 'var(--iris)' })}</div>
        </div>

        <div class="card lift card-pad">
          <div class="card-head">
            <div>
              <h3>Yield distributed</h3>
              <div class="subpx" style="color:var(--text-2);margin-top:6px;">Cumulative to savers</div>
            </div>
            <span class="apy"><span class="live"><i></i><i></i></span>${m.apy.toFixed(2)}%</span>
          </div>
          <div class="bigpx" style="font-size:28px;color:var(--accent);">$<span data-countup data-to="${m.yieldDistributed}" data-dec="2"></span>M</div>
          <div class="subpx" style="color:var(--text-3);margin:4px 0 12px;">paid into wtSGOV · auto-compounded</div>
          <div class="chartbox" style="height:130px;">${ch.area(S.SERIES.yield, { w: 480, h: 130, color: 'var(--accent)' })}</div>
        </div>
      </div>

      <!-- TVL breakdown + wallets -->
      <div class="metrics-2" style="margin-top:18px;">
        <div class="card lift card-pad">
          <div class="card-head"><h3>TVL by market</h3><span class="hint">$${m.tvl.toFixed(1)}M total</span></div>
          ${bdRows}
        </div>

        <div class="card lift card-pad">
          <div class="card-head">
            <div><h3>Wallets</h3><div class="subpx" style="color:var(--text-2);margin-top:6px;">Unique holders over time</div></div>
            <div style="text-align:right;">
              <div class="bigpx" style="font-size:22px;"><span data-countup data-to="${m.wallets}" data-dec="0"></span></div>
              <div class="hint mono up">+${m.walletsChg.toFixed(1)}% · 7d</div>
            </div>
          </div>
          <div class="chartbox" style="height:130px;">${ch.area(S.SERIES.wallets, { w: 480, h: 130, color: 'var(--iris)' })}</div>
        </div>
      </div>

      <!-- trust strip -->
      <div class="card card-pad" style="margin-top:18px;display:flex;flex-wrap:wrap;gap:14px 28px;align-items:center;justify-content:space-between;">
        ${['EU Prospectus + US Reg A', 'Protofire audit · 0 findings', 'Onchain proof of reserve', 'Redeemable to underlying SGOV'].map(t => `
          <span style="display:inline-flex;align-items:center;gap:9px;font-size:13px;color:var(--text-2);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>${t}
          </span>`).join('')}
      </div>
    </div>`;
  };

  S.wires.metrics = function (root) {
    root.querySelectorAll('.tf button').forEach(b => b.addEventListener('click', () => {
      const grp = b.closest('.tf');
      grp.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    }));
  };
})();
