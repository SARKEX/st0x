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

// Why it wins — rationalised to the four points that actually matter
const PILLARS = [
  {
    icon: 'unlock',
    title: 'Permissionless — no KYC',
    body: 'The only tokenised Treasury you can hold in any wallet and use in any DeFi protocol. Every rival gates access behind KYC.',
  },
  {
    icon: 'bank',
    title: 'Redeemable Treasuries',
    body: 'Backed 1:1 by SGOV — BlackRock’s $85B T-bill ETF. Redeem to actual SGOV shares in under 10s, 24/7. Not an IOU.',
  },
  {
    icon: 'bolt',
    title: 'Auto-compounding',
    body: 'Nothing to claim or stake. Treasury yield reinvests into wtSGOV automatically, so your balance grows on its own.',
  },
  {
    icon: 'shield',
    title: 'Regulated & audited',
    body: 'EU Prospectus + US Reg A, a legally enforceable right of exchange, Protofire audit (0 findings) and onchain proof of reserve.',
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
  { n: 4, t: 'Redeem anytime', d: 'Unwrap, swap, or redeem to underlying SGOV shares in under 10s, 24/7. No lockup, no NAV window.' },
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
    a: 'No. You hold wtSGOV — a tokenised, auto-compounding claim on SGOV, a BlackRock US Treasury ETF — in your own wallet. Not a bank deposit and not FDIC-insured, but backed 1:1 by some of the safest assets in finance.',
  },
  {
    q: 'How do I get my dollars back?',
    a: 'Swap back to USDC on st0x, or redeem to the actual underlying SGOV shares — both in under 10 seconds, 24/7 via the S01 / Alpaca bridge. No lockup, no withdrawal queue.',
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

Object.assign(window, {
  APY, rate, STATS, TREASURY_COMPARE, TWO_TOKEN, PILLARS, TRUST, TAGLINES, JOURNEY, HOW_IT_WORKS, EARN_FAQ, TOKENS, SGOV_SERIES,
});
