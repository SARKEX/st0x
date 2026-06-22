/* ============================================================
   st0x · app data — assets, stats, series, helpers
   One global namespace: window.ST0X
   ============================================================ */
(function () {
  const APY = 3.53;

  // ---- markets (tokenized equities) ----
  // seed = base for the deterministic price series generator
  const ASSETS = [
    { sym: 'tNVDA', name: 'NVIDIA',        disc: 'nvda', price: 141.20, chg:  1.40, mcap: '$3.46T', vol: '$412K', tvl: 8.1, holders: 1240, seed: 11 },
    { sym: 'tTSLA', name: 'Tesla',         disc: 'tsla', price: 342.05, chg: -1.12, mcap: '$1.09T', vol: '$286K', tvl: 5.6, holders: 980,  seed: 23 },
    { sym: 'tMSTR', name: 'MicroStrategy', disc: 'mstr', price: 388.10, chg:  2.34, mcap: '$92.4B', vol: '$198K', tvl: 3.2, holders: 410,  seed: 7  },
    { sym: 'tCOIN', name: 'Coinbase',      disc: 'coin', price: 248.66, chg:  0.82, mcap: '$62.1B', vol: '$164K', tvl: 2.9, holders: 372,  seed: 31 },
  ];

  // savings instrument
  const SAVINGS = { sym: 'wtSGOV', name: 'Wrapped tSGOV', disc: 'sgov', price: 100.42, apy: APY, tvl: 4.2, holders: 186 };

  // ---- headline savings stats ----
  const STATS = [
    { v: '3.53%', k: '30-day SEC yield' },
    { v: '$85B',  k: 'Underlying AUM' },
    { v: '<10s',  k: 'Redeem · 24/7' },
    { v: 'No KYC', k: 'Permissionless' },
  ];

  // ---- portfolio (dashboard) ----
  const WALLET = '0x9c4e…7f3a';
  const HOLDINGS = [
    { sym: 'wtSGOV', name: 'Auto-compounding · US Treasuries', disc: 'sgov', earn: true, bal: 124.06, price: 100.42, value: 12480.55, pnl: 218.40, pnlPct: 1.78 },
    { sym: 'tNVDA',  name: 'NVIDIA',       disc: 'nvda', bal: 18.40, price: 141.20, value: 2598.08, pnl: 142.10, pnlPct: 5.79 },
    { sym: 'tTSLA',  name: 'Tesla',        disc: 'tsla', bal: 4.10,  price: 342.05, value: 1402.40, pnl: -38.20, pnlPct: -2.65 },
    { sym: 'tMSTR',  name: 'MicroStrategy',disc: 'mstr', bal: 9.20,  price: 388.10, value: 3570.52, pnl: 96.40,  pnlPct: 2.77 },
  ];
  const FUNDS = [
    { sym: 'USDC', name: 'USD Coin', disc: 'usdc', bal: 3920.10, idle: true },
    { sym: 'ETH',  name: 'Ethereum', disc: 'eth',  bal: 0.42 },
  ];
  const PORTFOLIO = {
    total: 23971.65,        // holdings + funds
    savings: 12480.55,
    pnl: 418.70,
    earnedToDate: 218.40,
    orders: 2,
  };

  // ---- platform metrics ----
  const PLATFORM = {
    tvl: 24.0,              // $M
    tvlChg: 6.4,            // % 30d
    vol24h: 1.84,           // $M
    volTotal: 312,          // $M cumulative
    apy: APY,
    yieldDistributed: 1.21, // $M
    wallets: 4182,
    walletsChg: 3.1,        // % 7d
    markets: 5,
  };

  // ---- series generators (deterministic via seeded PRNG) ----
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }

  // a gently trending walk, normalized later by the chart fns
  function walk(n, seed, drift, vol) {
    const r = rng(seed); const out = []; let v = 100;
    for (let i = 0; i < n; i++) { v += drift + (r() - 0.45) * vol; out.push(v); }
    return out;
  }
  // monotonic-ish accretion (savings NAV / cumulative yield)
  function accrue(n, seed, step) {
    const r = rng(seed); const out = []; let v = 100;
    for (let i = 0; i < n; i++) { v += step + Math.sin(i / 3) * step * 0.12 + r() * step * 0.1; out.push(v); }
    return out;
  }

  const SERIES = {
    tvl:      accrue(40, 91, 0.9),
    vol:      Array.from({ length: 30 }, (_, i) => { const r = rng(100 + i)(); return 0.9 + r * 1.6 + Math.sin(i / 4) * 0.5; }),
    yield:    accrue(40, 55, 1.0),
    wallets:  accrue(40, 77, 1.2),
    savings:  accrue(40, 12, 0.96),
    perf:     walk(40, 64, 0.35, 6),
  };
  // per-asset price series
  ASSETS.forEach(a => { a.series = walk(48, a.seed, 0.45, 5); });
  SAVINGS.series = SERIES.savings;

  // ---- disc markup helper ----
  const SGOV_SVG = '<svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-5 9 5"/><path d="M5 9v8M19 9v8M9 9v8M15 9v8"/><path d="M3 20h18"/></svg>';
  const DISC_LABEL = { nvda: 'tN', tsla: 'tT', mstr: 'tM', coin: 'tC', usdc: '$', eth: 'Ξ' };
  function disc(key, size) {
    const s = size || 36;
    const fs = Math.round(s * 0.34);
    const inner = key === 'sgov' ? SGOV_SVG : (DISC_LABEL[key] || '?');
    return `<span class="disc ${key}" style="width:${s}px;height:${s}px;font-size:${fs}px;">${inner}</span>`;
  }

  // ---- number formatting ----
  const fmt = (v, d = 2) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (v, d = 2) => '$' + fmt(v, d);
  const signed = (v, d = 2) => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), d);

  window.ST0X = {
    APY, ASSETS, SAVINGS, STATS, WALLET, HOLDINGS, FUNDS, PORTFOLIO, PLATFORM, SERIES,
    disc, fmt, usd, signed, rng,
    screens: {}, wires: {},
  };
})();
