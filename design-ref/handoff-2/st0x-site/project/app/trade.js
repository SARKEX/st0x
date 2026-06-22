/* ============================================================
   st0x · Trade screen — market list, chart, order ticket
   ============================================================ */
(function () {
  const S = window.ST0X;
  S.state = S.state || { asset: 'tNVDA', side: 'buy', tf: '1D', pay: 500 };

  function activeAsset() { return S.ASSETS.find(a => a.sym === S.state.asset) || S.ASSETS[0]; }

  S.screens.trade = function () {
    const ch = S.charts;
    const a = activeAsset();
    const recv = (S.state.pay / a.price);

    const list = S.ASSETS.map(x => `
      <div class="ml-item ${x.sym === a.sym ? 'active' : ''}" data-asset="${x.sym}">
        ${S.disc(x.disc, 34)}
        <div><div class="ml-sym">${x.sym}</div><div class="ml-nm">${x.name}</div></div>
        <div class="ml-px"><div class="p mono">${S.usd(x.price)}</div><div class="c mono ${x.chg >= 0 ? 'up' : 'down'}">${x.chg >= 0 ? '+' : ''}${x.chg.toFixed(2)}%</div></div>
      </div>`).join('');

    const tf = ['1H', '1D', '1W', '1M'].map(t => `<button class="${t === S.state.tf ? 'on' : ''}" data-tf="${t}">${t}</button>`).join('');

    return `
    <div class="scr wrap">
      <div class="scr-head">
        <div><h1>Trade</h1><p class="sub">Tokenized equities · settled onchain in seconds</p></div>
        <span class="apy lg" data-go="dashboard" style="cursor:pointer;"><span class="live"><i></i><i></i></span>Idle cash? Earn ${S.APY.toFixed(2)}%</span>
      </div>

      <div class="trade-layout">
        <!-- market list -->
        <div class="card market-list">
          <div class="ml-head">Markets · ${S.ASSETS.length}</div>
          ${list}
          <div class="ml-item" data-go="dashboard" style="margin-top:4px;border:1px dashed var(--accent-line);">
            ${S.disc('sgov', 34)}
            <div><div class="ml-sym">wtSGOV</div><div class="ml-nm">Savings · auto-compound</div></div>
            <div class="ml-px"><div class="p mono" style="color:var(--accent);">${S.APY.toFixed(2)}%</div><div class="c">APY</div></div>
          </div>
        </div>

        <!-- chart + ticket -->
        <div class="card lift trade-main">
          <div class="chart-pane">
            <div class="ch-head">
              <div style="display:flex;gap:13px;align-items:center;">
                ${S.disc(a.disc, 44)}
                <div>
                  <div style="display:flex;align-items:center;gap:9px;"><b style="font-size:17px;">${a.sym}</b><span style="font-size:12px;color:var(--text-3);">${a.name}</span></div>
                  <div class="bigpx" style="margin-top:3px;">${S.usd(a.price)}</div>
                  <div class="subpx ${a.chg >= 0 ? 'up' : 'down'}">${a.chg >= 0 ? '+' : ''}${a.chg.toFixed(2)}% today</div>
                </div>
              </div>
              <div class="tf">${tf}</div>
            </div>
            <div class="chartbox" style="height:300px;padding:4px;">
              ${ch.candles(a.series, { seed: a.seed, w: 660, h: 300 })}
            </div>
            <div class="metarow" style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px;">
              <div class="mr"><span>Market cap</span><span>${a.mcap}</span></div>
              <div class="mr"><span>24h volume</span><span>${a.vol}</span></div>
              <div class="mr"><span>TVL on st0x</span><span>$${a.tvl.toFixed(1)}M</span></div>
              <div class="mr"><span>Holders</span><span>${a.holders.toLocaleString()}</span></div>
            </div>
          </div>

          <!-- order ticket -->
          <div class="ticket">
            <div class="seg" id="tradeSeg">
              <button class="${S.state.side === 'buy' ? 'on-buy' : ''}" data-seg="buy">Buy</button>
              <button class="${S.state.side === 'sell' ? 'on-sell' : ''}" data-seg="sell">Sell</button>
            </div>

            <div class="field">
              <div style="display:flex;justify-content:space-between;"><span class="lbl">Pay</span><span class="lbl">Balance 3,920 USDC</span></div>
              <div style="display:flex;align-items:center;gap:10px;margin-top:2px;">
                <span class="mono" style="font-size:24px;color:var(--text-3);">$</span>
                <input value="${S.state.pay}" inputmode="decimal" id="payInput" aria-label="pay" style="font-size:26px;" />
                <span class="pill-token">${S.disc('usdc', 22)} USDC</span>
              </div>
            </div>

            <div class="field">
              <span class="lbl">Receive (est.)</span>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
                <span class="mono" style="font-size:26px;font-weight:600;" id="recvOut">${recv.toFixed(3)}</span>
                <span class="pill-token">${S.disc(a.disc, 22)} ${a.sym}</span>
              </div>
            </div>

            <button class="btn ${S.state.side === 'buy' ? 'btn-primary' : ''}" id="placeBtn" style="padding:15px;font-size:15px;${S.state.side === 'sell' ? 'background:var(--down);color:#fff;border-color:var(--down);' : ''}">
              ${S.state.side === 'buy' ? 'Buy' : 'Sell'} ${a.sym}
            </button>

            <div class="metarow">
              <div class="mr"><span>Rate</span><span>1 ${a.sym} = ${S.usd(a.price)}</span></div>
              <div class="mr"><span>Network fee</span><span>~$0.01 · Base</span></div>
              <div class="mr"><span>Settlement</span><span style="color:var(--accent);">&lt; 10s · onchain</span></div>
            </div>

            <div class="nudge" data-go="dashboard">
              ${S.disc('sgov', 34)}
              <div style="flex:1;">
                <div class="nt">Idle USDC between trades?</div>
                <div class="nd">Park it in Savings &amp; earn ${S.APY.toFixed(2)}% — withdraw anytime.</div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  };

  S.wires.trade = function (root, go) {
    // market selection
    root.querySelectorAll('[data-asset]').forEach(el => {
      el.addEventListener('click', () => { S.state.asset = el.getAttribute('data-asset'); go('trade'); });
    });
    // buy/sell
    const seg = root.querySelector('#tradeSeg');
    if (seg) seg.addEventListener('click', e => {
      const b = e.target.closest('[data-seg]'); if (!b) return;
      S.state.side = b.dataset.seg; go('trade');
    });
    // timeframe (no re-render needed — just visual)
    root.querySelectorAll('[data-tf]').forEach(b => b.addEventListener('click', () => {
      S.state.tf = b.getAttribute('data-tf');
      root.querySelectorAll('[data-tf]').forEach(x => x.classList.toggle('on', x === b));
    }));
    // live receive calc
    const input = root.querySelector('#payInput');
    const out = root.querySelector('#recvOut');
    if (input && out) input.addEventListener('input', () => {
      const v = parseFloat(input.value.replace(/,/g, '')) || 0;
      S.state.pay = v;
      out.textContent = (v / activeAsset().price).toFixed(3);
    });
  };
})();
