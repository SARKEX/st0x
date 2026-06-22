// ─────────────────────────────────────────────────────────────────────────
// Shared data — St0x "Save & Earn" (tSGOV / wtSGOV) design dossier + prototype
// ─────────────────────────────────────────────────────────────────────────
const APY = 3.53; // 30-day SEC yield on the underlying SGOV ETF
const rate = (d = 2) => APY.toFixed(d); // display helper

// Headline product stats (from the tSGOV/wtSGOV one-pager)
const STATS = [
  { v: '3.53%', k: '30-day SEC yield' },
  { v: '$85B', k: 'Underlying AUM' },
  { v: '<10s', k: 'Redeem · 24/7' },
  { v: 'No KYC', k: 'Permissionless' },
];

// THE moat: every meaningful tokenised Treasury requires KYC. Except SGOV.
const TREASURY_COMPARE = [
  { name: 'SGOV', issuer: 'BlackRock / S01', ok: true, access: 'Any wallet · any DeFi protocol', highlight: true },
  { name: 'BUIDL', issuer: 'BlackRock', ok: false, access: '$5M min · US qualified purchasers · whitelist' },
  { name: 'OUSG', issuer: 'Ondo', ok: false, access: 'Qualified purchasers · KYC via Ondo portal' },
  { name: 'BENJI', issuer: 'Franklin Templeton', ok: false, access: 'KYC via Benji · gated' },
  { name: 'USTB', issuer: 'Superstate', ok: false, access: 'Qualified purchasers · allowlist' },
  { name: 'USYC', issuer: 'Hashnote / Circle', ok: false, access: 'KYC + qualified investor screening' },
  { name: 'USDY', issuer: 'Ondo', ok: false, access: 'Non-US persons only · KYC at onboarding' },
];

// Two tokens, one underlying — "choose your yield"
const TWO_TOKEN = [
  {
    sym: 'tSGOV', token: 'tsgov', tag: 'Get paid',
    desc: 'Cash dividends paid to you in stablecoins, every month.',
    best: 'Reserves · treasuries · credit allocators', mode: 'dividends',
  },
  {
    sym: 'wtSGOV', token: 'wtsgov', tag: 'Auto-compound', recommended: true,
    desc: 'Dividends reinvest into the wrapper — each wtSGOV grows worth more tSGOV. Your balance just rises.',
    best: 'DeFi · set-and-forget saving', mode: 'compound',
  },
];

// Why it wins — the points that actually matter
const PILLARS = [
  {
    icon: 'unlock',
    title: 'Permissionless — no KYC',
    body: 'The only tokenised Treasury you can hold in any wallet and use in any DeFi protocol. Every rival gates access behind KYC.',
  },
  {
    icon: 'bank',
    title: 'Redeemable Treasuries',
    body: 'Backed 1:1 by SGOV — BlackRock’s $85B T-bill ETF, with a real claim on the underlying. Swap back to USDC anytime, 24/7. Not an IOU.',
  },
  {
    icon: 'bolt',
    title: 'Auto-compounding',
    body: 'Nothing to claim or stake. Treasury yield reinvests into wtSGOV automatically, so your balance grows on its own.',
  },
];

const TRUST = [
  'EU Prospectus + US Reg A',
  'Protofire audit · 0 findings',
  'Onchain proof of reserve',
  'Redeemable to underlying SGOV',
];

// Selling points / taglines for the brief
const TAGLINES = [
  { line: 'Don’t let your dollars sit still.', use: 'Primary — home callout' },
  { line: 'Idle USDC earns $0. Make it 3.53%.', use: 'Conversion — the no-brainer' },
  { line: 'The only Treasury yield you don’t need permission for.', use: 'Differentiator — permissionless' },
  { line: 'Set it and forget it — yield that compounds itself.', use: 'Auto-compounding' },
  { line: 'Treasury-backed. Wallet-native. No KYC.', use: 'Nav pill / short form' },
];

// User journey stages
const JOURNEY = [
  {
    stage: 'See', where: 'Home + nav pill', goal: 'Plant the idea',
    user: '“Wait — my stablecoins could be earning?”',
    move: 'A live 3.53% pill in the header (visible from every page incl. trading) and a callout band on the home page introducing it as a new kind of product.',
  },
  {
    stage: 'Compare', where: 'Earn hub', goal: 'Build trust',
    user: '“Is this safe, and why this over the others?”',
    move: 'Lead with the real moat: the only permissionless tokenised Treasury — every rival needs KYC. Real BlackRock backing, redeemable to underlying. Honest yield hook vs idle USDC.',
  },
  {
    stage: 'Convert', where: 'Start earning modal', goal: 'Remove friction',
    user: '“OK, how much do I put in?”',
    move: 'A calculator-led deposit that pre-fills idle USDC and converts to wtSGOV in one tap, with projected $/yr shown live. Re-uses the existing buy flow under the hood.',
  },
  {
    stage: 'Hold', where: 'Portfolio', goal: 'Reinforce + grow',
    user: '“Is it working? Should I add more?”',
    move: 'A “Savings” card showing balance, value accruing as it compounds, plus one-tap Add / Withdraw and idle-cash nudges.',
  },
];

// Corrected mechanic: dividends → monthly deposit into wrapper → NAV grows
const HOW_IT_WORKS = [
  { n: 1, t: 'Deposit dollars', d: 'Swap USDC into wtSGOV in one tap, right inside st0x. No account, no KYC.' },
  { n: 2, t: 'Treasuries earn', d: 'Your tokens are backed 1:1 by SGOV — BlackRock’s short-dated US T-bill ETF, ~3.53% SEC yield.' },
  { n: 3, t: 'Yield compounds', d: 'Each month the Treasury yield is added to the wtSGOV wrapper — so every token is worth more than before. Your balance grows on its own.' },
  { n: 4, t: 'Cash out anytime', d: 'Unwrap and swap wtSGOV back to USDC in under 10s, 24/7. No lockup, no NAV window.' },
];

const EARN_FAQ = [
  {
    q: 'How does the yield actually reach me?',
    a: 'The underlying Treasuries earn yield continuously, and each month it’s added to the wtSGOV wrapper — so your token steadily becomes worth more. Nothing to claim or stake. ~3.53% SEC yield today.',
  },
  {
    q: 'Do I need to KYC?',
    a: 'No. SGOV is the only meaningful tokenised Treasury that’s fully permissionless — any wallet, any DeFi protocol. KYC applies only at primary issuance, never to you on the secondary market.',
  },
  {
    q: 'Is this a savings account?',
    a: 'No. You hold wtSGOV — a tokenised, auto-compounding claim on SGOV, a BlackRock US Treasury ETF — in your own wallet, backed 1:1 by the underlying Treasuries.',
  },
  {
    q: 'How do I get my dollars back?',
    a: 'Swap wtSGOV back to USDC on st0x anytime — under 10 seconds, 24/7, with no lockup or withdrawal queue. (Direct redemption to the underlying SGOV is available to registered participants.)',
  },
];

// Tokens — underlying ETF (SGOV) wrapped as tSGOV (dividends) / wtSGOV (compounding)
const TOKENS = {
  usdc: { sym: 'USDC', name: 'USD Coin', color: '#2775CA' },
  tsgov: { sym: 'tSGOV', name: 'Tokenised SGOV', color: '#10B981' },
  wtsgov: { sym: 'wtSGOV', name: 'Wrapped tSGOV', color: '#10B981' },
};

// Monthly NAV steps for the wtSGOV accretion sparkline (compounding, monotonic up)
const SGOV_SERIES = (() => {
  const pts = [];
  let v = 100;
  for (let i = 0; i < 40; i++) {
    v += 0.0096 + Math.sin(i / 3) * 0.0014 + 0.001 * Math.random();
    pts.push(v);
  }
  return pts;
})();

// ── Trade terminal data ───────────────────────────────────────────────────
// Watchlist / markets rail. spark = tiny normalized series for the row sparkline.
const mkSpark = (seed, up) => {
  const a = []; let v = 50;
  for (let i = 0; i < 18; i++) { v += Math.sin(i * 0.7 + seed) * 4 + (Math.random() - (up ? 0.40 : 0.58)) * 6; a.push(v); }
  return a;
};
const MARKETS = [
  { sym: 'tNVDA', name: 'NVIDIA',        price: 141.20, chg: 1.40,  disc: 'nvda', spark: mkSpark(1, true) },
  { sym: 'tTSLA', name: 'Tesla',         price: 342.05, chg: -0.62, disc: 'tsla', spark: mkSpark(2, false) },
  { sym: 'tCOIN', name: 'Coinbase',      price: 248.66, chg: 2.08,  disc: 'coin', spark: mkSpark(3, true) },
  { sym: 'tMSTR', name: 'MicroStrategy', price: 388.10, chg: -1.20, disc: 'mstr', spark: mkSpark(4, false) },
  { sym: 'tAAPL', name: 'Apple',         price: 214.32, chg: 0.44,  disc: 'aapl', spark: mkSpark(5, true) },
  { sym: 'tMETA', name: 'Meta',          price: 612.90, chg: 1.92,  disc: 'meta', spark: mkSpark(6, true) },
  { sym: 'wtSGOV', name: 'Savings · US Treasuries', price: 100.42, chg: 0.01, earn: true, disc: 'sgov', spark: mkSpark(7, true) },
];

// Active market header stats (tNVDA)
const ACTIVE_STATS = [
  ['24h High', '$143.86'], ['24h Low', '$138.40'], ['24h Vol', '$1.84M'],
  ['Mkt Cap', '$3.45T'], ['Holders', '1,240'], ['TVL', '$8.1M'],
];

// Order book ladder around 141.20 (price, size, total)
const ORDER_BOOK = {
  asks: [
    ['141.62', '128', '18.1k'], ['141.55', '96', '13.6k'], ['141.48', '212', '30.0k'],
    ['141.39', '74', '10.5k'], ['141.31', '180', '25.5k'], ['141.25', '142', '20.1k'],
  ],
  bids: [
    ['141.18', '164', '23.2k'], ['141.11', '98', '13.9k'], ['141.04', '226', '31.9k'],
    ['140.96', '88', '12.4k'], ['140.88', '154', '21.7k'], ['140.79', '120', '16.9k'],
  ],
  spread: '0.07', spreadPct: '0.05%',
};

// Recent trades (time, price, size, side)
const RECENT_TRADES = [
  ['12:04:51', '141.21', '12.4', 'buy'], ['12:04:48', '141.19', '4.0', 'sell'],
  ['12:04:42', '141.20', '8.1', 'buy'], ['12:04:39', '141.18', '20.6', 'buy'],
  ['12:04:31', '141.16', '3.2', 'sell'], ['12:04:25', '141.17', '15.0', 'buy'],
  ['12:04:18', '141.14', '6.7', 'sell'], ['12:04:09', '141.15', '9.9', 'buy'],
];

// User's current position in the active market
const POSITION = { qty: 18.4, avg: 133.48, last: 141.20, value: 2598.08, pnl: 142.10, pnlPct: 5.79 };

// Open orders (bottom of terminal)
const OPEN_ORDERS = [
  { side: 'buy',  sym: 'tNVDA', type: 'Limit', qty: '5.0', price: '138.00', filled: '0%', status: 'open' },
  { side: 'sell', sym: 'tTSLA', type: 'Limit', qty: '2.0', price: '360.00', filled: '0%', status: 'open' },
];

// ── Real trade terminal data (faithful to app.st0x.fi) ─────────────────────
// Left "ASSETS" watchlist rail — the actual st0x universe, denominated in USD.
const TRADE_WATCHLIST = [
  { sym: 'tCOIN', name: 'Coinbase Global Inc…',      price: 155.51, disc: 'coin' },
  { sym: 'tSPYM', name: 'State Street SPDR P…',      price: 86.60,  disc: 'spym' },
  { sym: 'tMSTR', name: 'MicroStrategy Incor…',      price: 117.07, disc: 'mstr', active: true },
  { sym: 'tQQQM', name: 'Invesco NASDAQ 1…',         price: 291.37, disc: 'qqqm' },
  { sym: 'tSIVR', name: 'abrdn Physical Silver…',    price: 62.01,  disc: 'sivr' },
  { sym: 'tNVDA', name: 'NVIDIA Corporation…',       price: 207.92, disc: 'nvda' },
  { sym: 'tCRCL', name: 'Circle Internet Group…',    price: 81.08,  disc: 'crcl' },
  { sym: 'tTSLA', name: 'Tesla Inc ST0x',            price: 396.75, disc: 'tsla' },
  { sym: 'tAMZN', name: 'Amazon.com Inc S…',         price: 244.25, disc: 'amzn' },
  { sym: 'tIAU',  name: 'iShares Gold Trust S…',     price: 80.08,  disc: 'iau' },
  { sym: 'tARKK', name: 'ARK Innovation ETF…',       price: 75.00,  disc: 'arkk' },
  { sym: 'tPPLT', name: 'abrdn Physical Platin…',    price: 15.63,  disc: 'pplt' },
  { sym: 'tSGOV', name: 'iShares 0-3 Month…',        price: 100.47, disc: 'sgov', earn: true },
  { sym: 'tVWO',  name: 'Vanguard Emerging…',        price: 58.46,  disc: 'vwo' },
  { sym: 'tBMNR', name: 'Bitmine Immersion Te…',     price: 16.15,  disc: 'bmnr' },
];

// Top ticker tape — wrapped equities streaming across the header
const TRADE_TICKER = [
  { name: 'Wrapped NVIDIA Corp ST0x',     price: 208.19, chg: -0.45,  pct: -0.22 },
  { name: 'Wrapped Amazon.com Inc ST0x',  price: 244.19, chg: -1.03,  pct: -0.42 },
  { name: 'Wrapped Tesla Inc ST0x',       price: 396.68, chg: -12.27, pct: -3.00 },
  { name: 'Wrapped MicroStrategy ST0x',   price: 117.02, chg: -10.18, pct: -8.00 },
  { name: 'Wrapped Coinbase Global ST0x', price: 155.48, chg: 3.21,   pct: 2.11 },
  { name: 'Wrapped Circle Internet ST0x', price: 81.08,  chg: 1.44,   pct: 1.81 },
];

// The selected market — MicroStrategy / Strategy Inc — matching the screenshots.
const TRADE_ACTIVE = {
  sym: 'tMSTR', wsym: 'wtMSTR', ref: 'NASDAQ:MSTR', disc: 'mstr',
  fullName: 'MicroStrategy Incorporated ST0x',
  ticker: 'MSTR', company: 'STRATEGY INC', exchange: 'Nasdaq Stock Market',
  price: 117.02, chg: -10.18, pct: -8.00,
  atClose: 'AT CLOSE (AS OF 22:50 GMT+1)',
  postPrice: 117.17, postChg: 0.15, postPct: 0.13, postAsOf: 'POST MARKET (AS OF 22:58 GMT+1)',
  earnings: 'August 4', eps: '−35.0',
  oracle: 117.07, confidence: 0.12205, bid: 117.15, offer: 117.74,
  wrapped: '0xFF05…a8e2', underlying: '0x013b7…d5fe', network: 'Base Mainnet', decimals: 18,
  sector: 'Technology Services', industry: 'Internet Software/Services', employees: '1.54 K',
  profile: 'Strategy, Inc. is a Bitcoin Treasury company. The firm has adopted Bitcoin as a primary treasury reserve asset, using proceeds from equity and debt financing, as well as cash flows from operations, to strategically accumulate Bitcoin and advocate for its role as digital capital.',
};

// 1-day intraday line for the reference chart (sell-off then a late bounce).
const MSTR_INTRADAY = (() => {
  const a = []; let v = 124.4;
  for (let i = 0; i < 80; i++) {
    const drift = i < 40 ? -0.13 : (i < 64 ? -0.02 : 0.08);
    v += drift + Math.sin(i / 2.3) * 0.18 + (Math.random() - 0.5) * 0.55;
    a.push(Math.max(114.6, v));
  }
  return a;
})();

// Trade-history cand(ish) + volume series for the On-chain Market panel
const TRADE_HISTORY = (() => {
  const price = []; const vol = []; let v = 135;
  for (let i = 0; i < 60; i++) {
    v += (i < 30 ? -0.45 : -0.12) + Math.sin(i / 3) * 0.7 + (Math.random() - 0.5) * 1.6;
    v = Math.min(151, Math.max(92, v));
    price.push(v);
    vol.push(0.2 + Math.abs(Math.sin(i * 0.9)) * 0.9 + Math.random() * 0.4);
  }
  return { price, vol, hi: 151.15, lo: 91.79 };
})();

// Orderbook depth — cumulative bids (≤ mid) and asks (≥ mid) around ~117.4
const DEPTH = {
  mid: 117.40,
  bids: [ [116.56, 0], [116.80, 312], [117.00, 312], [117.20, 312], [117.38, 160], [117.39, 0] ],
  asks: [ [117.41, 0], [117.60, 104], [117.80, 104], [118.00, 104], [118.20, 104], [118.33, 104] ],
  min: 116.56, max: 118.33, top: 500,
};

// "Built by pioneers from" — real partner/credibility logos (wordmark style)
const PIONEERS = ['HOLO', 'Microsoft', 'Nasdaq', 'NYSE', 'ICE'];

// Three home marketing pillars — the original st0x points, adjusted for the
// new yield product. Copy kept close to the live site, extended for Save & Earn.
const HOME_PILLARS = [
  {
    icon: 'unlock', title: 'Decentralised',
    body: 'Withdraw to your own wallet and put your tokens to work across DeFi. No KYC, no permission needed.',
  },
  {
    icon: 'swap', title: 'Liquid',
    body: 'Bridged real-time from stock markets, with 24/7 trading. Swap or redeem in seconds.',
  },
  {
    icon: 'shield', title: '1:1 Collateralised',
    body: 'Every token is fully collateralised by its underlying asset, with a legally enforceable right of exchange.',
  },
];

// ── Platform metrics data ─────────────────────────────────────────────────
const METRIC_KPIS = [
  { k: 'Total Value Locked', v: '$24.0M', d: '+6.4%', sub: '30-day', tone: 'up', spark: SGOV_SERIES.slice(8) },
  { k: '24h Volume',         v: '$1.84M', d: '+12%',  sub: '$312M all-time', tone: 'up', spark: mkSpark(9, true) },
  { k: 'Current APY',        v: '3.53%',  d: 'SEC yield', sub: '$1.21M distributed', tone: 'accent', spark: null },
  { k: 'Wallets earning',    v: '4,182',  d: '+3.1%', sub: '7-day', tone: 'up', spark: mkSpark(11, true) },
];

// TVL area-chart series (months, monotonic-ish up)
const TVL_SERIES = (() => {
  const a = []; let v = 5.2;
  for (let i = 0; i < 32; i++) { v += 0.62 + Math.sin(i / 4) * 0.22 + Math.random() * 0.18; a.push(v); }
  return a;
})();

// Daily volume bars (last 24 days, $M)
const VOLUME_BARS = Array.from({ length: 24 }, (_, i) => 0.7 + Math.abs(Math.sin(i * 0.8)) * 1.4 + Math.random() * 0.5);

// TVL composition by asset (share of pool)
const TVL_BY_ASSET = [
  { sym: 'wtSGOV', label: 'Savings · SGOV', tvl: 11.6, color: '#2de3a6', earn: true },
  { sym: 'tNVDA',  label: 'NVIDIA',         tvl: 5.1,  color: '#7d8bff' },
  { sym: 'tTSLA',  label: 'Tesla',          tvl: 3.0,  color: '#5b8def' },
  { sym: 'tMSTR',  label: 'MicroStrategy',  tvl: 2.2,  color: '#c98bff' },
  { sym: 'tCOIN',  label: 'Coinbase',       tvl: 1.4,  color: '#ffb86b' },
  { sym: 'Other',  label: '6 more markets', tvl: 0.7,  color: '#566173' },
];

// Cumulative yield distributed (monthly, $k)
const YIELD_SERIES = (() => {
  const a = []; let v = 0;
  for (let i = 0; i < 14; i++) { v += 60 + i * 9 + Math.random() * 20; a.push(v); }
  return a;
})();

// Proof-of-reserve / attestation facts
const RESERVE = [
  { k: 'SGOV shares held', v: '237,418', sub: 'BlackRock iShares 0-3mo T-bill' },
  { k: 'Reserve ratio', v: '100.4%', sub: 'Onchain attested · refreshed each block' },
  { k: 'Last attestation', v: '14s ago', sub: 'Chainlink Proof-of-Reserve' },
  { k: 'Audit findings', v: '0', sub: 'Protofire · full report' },
];

Object.assign(window, {
  APY, rate, STATS, TREASURY_COMPARE, TWO_TOKEN, PILLARS, TRUST, TAGLINES, JOURNEY, HOW_IT_WORKS, EARN_FAQ, TOKENS, SGOV_SERIES,
  MARKETS, ACTIVE_STATS, ORDER_BOOK, RECENT_TRADES, POSITION, OPEN_ORDERS,
  TRADE_WATCHLIST, TRADE_TICKER, TRADE_ACTIVE, MSTR_INTRADAY, TRADE_HISTORY, DEPTH, PIONEERS, HOME_PILLARS,
  METRIC_KPIS, TVL_SERIES, VOLUME_BARS, TVL_BY_ASSET, YIELD_SERIES, RESERVE,
});
