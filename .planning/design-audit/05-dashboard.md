# Design Audit — Dashboard / Portfolio

Area: `/dashboard` screen — overview metric cards, Savings card, Funds/Holdings tables, idle-USDC nudge.

**Files audited**
- Page: `src/routes/(main)/dashboard/+page.svelte`
- `src/lib/components/earn/SavingsCard.svelte`
- `src/lib/components/earn/ApyChip.svelte`, `TokenDisc.svelte`, `EarnIcon.svelte`, `CountUp.svelte`, `Sparkline.svelte`, `IdleUsdcNudge.svelte`
- `src/lib/components/ui/MetricCard.svelte`, `Card.svelte`, `Section.svelte`, `PageContainer.svelte`, `table/Table.svelte`

**Mock source**
- `design-ref/.../src2/Dashboard.jsx` (the `Dashboard`, `Metric`, `SavingsCard` components), `atoms.jsx`, `data.jsx`
- Screenshots: `screenshots/dashboard.png` (full), `v2-dashboard.png` (scrolled), `portfolio.png` (yellow-deposit prototype variant)

**Note on our screenshot:** `.playwright-mcp/ours/dashboard-dark.png` is the disconnected/connect-wallet state, so metrics/Savings/tables are not visible. Audit below is from markup + mock; visible-only items flagged as such.

---

## What already matches (no action)

The Save & Earn atoms are faithful ports and need no change:
- `SavingsCard.svelte` reproduces the mock structure 1:1 (radius `rounded-2xl`, `border-emerald-400/25`, gradient, blur orb, 1.3fr/1fr grid, balance/earned columns, Add/Withdraw buttons, NAV side-panel with Sparkline + clock row). Only the gradient endpoints differ slightly (see P2-1).
- `ApyChip.svelte` — exact match (ping dot, `border-emerald-400/30 bg-emerald-400/10 text-emerald-300`, `px-2 py-0.5 text-[11px]`).
- `TokenDisc.svelte`, `EarnIcon.svelte` (plus/minus/clock/bank/info/sprout paths all present), `CountUp.svelte`, `Sparkline.svelte` — match.
- `IdleUsdcNudge.svelte` banner variant — exact match of the mock idle-USDC nudge (`border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2.5 text-[13px]`, info icon, "Move to Savings →").

---

## P0 — Structural / obvious

- [ ] **Funds & Holdings tables are not wrapped in the mock's card container.**
  - **Now:** Both tables render via `<Table>` (`src/lib/components/ui/table/Table.svelte`) which outputs a bare `<table class="w-full min-w-full">` inside an `overflow-x-auto` div. The section heading + table sit directly on the page background with no surrounding border/radius/fill. Funds section at `+page.svelte:1335-1414`, Holdings at `:1423-1666`.
  - **Mock target:** `Dashboard.jsx:93` & `:122` — each table is wrapped in `<div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">`, and rows use `border-t border-white/[0.06]` (top divider per row, no outer card on each row). The heading is `mb-3 text-base font-semibold text-white` sitting *above* the bordered table block.
  - **Fix:** Wrap each table's `overflow-x-auto` div with `rounded-xl border border-line bg-surface-1/40` (mock `bg-white/[0.02]` ≈ `surface-1` at very low opacity — use `bg-white/[0.02]` literal to match exactly). Give `<tbody>` rows `border-t border-line` (≈ `border-white/[0.06]`). Remove the per-row `hover:bg-surface-2` only if it conflicts; mock has no row hover on Funds/Holdings but keeping a subtle hover is acceptable. Visible in `screenshots/dashboard.png` (Funds table is a single rounded bordered panel).

- [ ] **Page max-width differs — mock is `max-w-5xl`, ours is unconstrained full-bleed.**
  - **Now:** `PageContainer.svelte` = `space-y-6 p-3 sm:p-6` with no max-width; content spans the whole canvas. Mock content is centered at `max-w-5xl` (1024px).
  - **Mock target:** `Dashboard.jsx:69` — `<div className="mx-auto max-w-5xl px-6 py-8">`.
  - **Fix:** This is a shell-level decision (the AppShell/Canvas may already cap width). If the dashboard route is not already capped to ~`max-w-5xl`, wrap the dashboard content in `mx-auto max-w-5xl px-6 py-8` (or add a `className="mx-auto max-w-5xl"` to `PageContainer` for this route). Confirm against the Trade/Earn audits to keep the global container consistent.

- [ ] **Header address row: icon mismatch + extra controls vs mock.**
  - **Now:** `+page.svelte:1160-1212` — address line uses `text-text-2` (no `font-mono`), followed by **two raw inline SVGs**: a copy-clipboard glyph and a Heroicons-style external-link box-with-arrow. Neither matches the mock.
  - **Mock target:** `Dashboard.jsx:74` — `<div className="... text-sm text-gray-400 font-mono">0x9c…7f3a <Icon name="arrowUpRight" .../></div>`. Single `arrowUpRight` icon (the diagonal `M7 17L17 7M9 7h8v8`), address is `font-mono`.
  - **Fix:** Add `font-mono` to the address row. Replace the external-link SVG with `EarnIcon name="arrowUpRight" className="h-3.5 w-3.5"` (path already exists in `EarnIcon.svelte:56`). The copy button is real functionality not in the mock — keep it, but consider styling its glyph to the same stroke weight / muting it. Do not regress copy/basescan features.

- [ ] **Metric grid column count & breakpoints differ from mock.**
  - **Now:** `+page.svelte:1247` — `grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4`. The `grid-cols-3` mobile + `sm:grid-cols-2` is an odd reflow, and we render **five** cards (Total Value, Savings·earning, Unrealized P&L, Active Orders, Active Vaults).
  - **Mock target:** `Dashboard.jsx:80` — `grid grid-cols-2 gap-3 sm:grid-cols-4`. Exactly **four** cards: Total Value, `Savings · earning` (tone="earn"), Unrealized P&L, Active Orders. No "Active Vaults" metric.
  - **Fix:** Change grid to `grid grid-cols-2 gap-3 sm:grid-cols-4`. The 5th "Active Vaults" card is real functionality — keep it, but to match the mock's clean 4-up row consider either (a) dropping it to a `sm:grid-cols-4` and letting it wrap onto a 2nd row, or (b) folding vault count into a subtitle. Mock has Savings always shown (we gate it on `savingsValue > 0` — acceptable since live data may be empty, but note the mock's Savings card is `tone="earn"` and is the 2nd cell, which we do match when present).

- [ ] **Deposit button color: ours mint/primary, mock is amber/yellow.**
  - **Now:** `+page.svelte:1215` — `<Button variant="primary">` renders the mint accent button.
  - **Mock target:** `Dashboard.jsx:76` — `bg-yellow-500 ... text-black hover:bg-yellow-400` (amber Deposit, matching `screenshots/portfolio.png` & `dashboard.png` where the Deposit pill is gold). Note: brief says warnings=amber, Buy/positive=mint. Deposit here is intentionally **amber** in the mock to read as a primary CTA distinct from the mint Save&Earn accent.
  - **Fix:** Per the convention guard (keep mint for Buy/positive), confirm with design whether Deposit should be amber. The mock unambiguously uses `bg-yellow-500 text-black`. Recommend a dedicated amber/`warning`-style button variant for Deposit to match, OR accept mint if design has since standardized. Flagging as the mock literal is amber. Use plus icon `M12 5v14M5 12h14` (we already do via inline SVG — could swap to `EarnIcon name="plus"`).

---

## P1 — Important

- [ ] **USDC "Earn 3.53%" CTA missing from the Funds table row.**
  - **Now:** Funds table (`+page.svelte:1369-1407`) renders Token / Wallet / Vaults / Total columns and only a Dynamic-user "Withdraw" action cell. There is **no per-row "Earn" CTA** on the USDC row. The idle-USDC prompt only appears as the separate banner below the table (`:1416-1420`).
  - **Mock target:** `Dashboard.jsx:101-104` — the USDC row's right cell is a button: `inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/20` with `<Icon name="sprout" .../>Earn 3.53%`. Non-USDC rows show `<span className="text-gray-600">—</span>`. Visible in `screenshots/dashboard.png` (mint "🌱 Earn 3.53 %" pill on the USDC row).
  - **Fix:** Add an action cell to the Funds table: for the USDC row render a sprout-icon "Earn {formatApy()}%" button (`EarnIcon name="sprout"`, the emerald-outline pill classes above) wired to `openSaveEarn({ mode: 'deposit', prefillUsdc })`; other rows render an em-dash. We keep both this and the existing banner nudge (banner is extra reinforcement, acceptable).

- [ ] **Mock Funds table is a simple 3-column layout (Token / Balance / action); ours is 4-column (Token / Wallet / Vaults / Total).**
  - **Now:** `+page.svelte:1343-1366` — Token, Wallet, Vaults, Total headers.
  - **Mock target:** `Dashboard.jsx:95` — `Token | Balance | (action)` only; balance is `font-mono text-gray-200`.
  - **Fix:** This is a real-feature divergence (we split wallet vs vault balances). Keep the richer columns but ensure the numeric cells use `font-mono` to match the mock (mock Funds balance `font-mono`, ours at `:1382-1389` is plain `text-text-2` / `text-sm` — **not mono**). Add `font-mono` to balance/total cells.

- [ ] **Holdings table P&L / Value cells not monospaced; mock uses mono throughout.**
  - **Now:** Holdings value cell `:1567` `text-xs font-medium sm:text-sm` (no mono); P&L `:1570` plain. Balance/Holdings cells likewise non-mono.
  - **Mock target:** `Dashboard.jsx:129-131` — `Balance`, `Value`, `P&L` all `font-mono`; value `text-white`, P&L `text-emerald-300` (gain) / `text-red-400` (loss) with `+`/`-$` formatting.
  - **Fix:** Add `font-mono` to the Holdings Balance, Holdings (total), Price, Value, and P&L numeric cells. Keep green/red semantics (we use `text-green-400`/`text-red-400`; mock uses `text-emerald-300` for gains — `emerald-300` ≈ our mint-300, slightly brighter than `green-400`. Prefer `text-emerald-300` to match).

- [ ] **SGOV holding row highlight present but APY chip placement / disc differ.**
  - **Now:** `:1491-1505` — SGOV row gets `bg-emerald-400/[0.04] hover:bg-emerald-400/[0.08]` (good), `<ApyChip />` after the TokenDisplay. We use the app's `TokenDisplay` (logo image) not the mint bank-glyph `TokenDisc`.
  - **Mock target:** `Dashboard.jsx:127-128` — SGOV row `bg-emerald-400/[0.04]` (no hover change), `<TokenDisc token="wtsgov" size={30}/>` (mint disc, bank glyph), symbol + `<ApyChip/>` inline `font-semibold text-white`, sub-label `text-xs text-gray-400`.
  - **Fix:** Background matches. APY chip placement matches. The disc differs because we use real token logos — acceptable per "keep real features," but for the SGOV/Savings row specifically the mock's mint bank-glyph `TokenDisc` is the intended Save&Earn signature. Consider rendering `TokenDisc token="wtsgov"` for the SGOV row instead of the generic logo to carry the mint accent (low priority).

- [ ] **MetricCard radius/border don't match mock metric card.**
  - **Now:** `MetricCard.svelte` → `Card.svelte` uses `rounded-xl`, and the dashboard passes `cardClass=""` for default cards (no border at all) — they rely on `Card`'s base which has **no border/bg** unless `showGradient`. So non-earn metric cards render border-less.
  - **Mock target:** `Dashboard.jsx:7` `Metric` — default tone: `rounded-xl border p-4 border-white/10 bg-white/[0.025]`; earn tone: `border-emerald-400/25 bg-emerald-400/[0.05]`. Label `text-[11px] uppercase tracking-wider text-gray-500`; value `mt-1 text-xl font-bold sm:text-2xl` (`text-emerald-300` for earn, else `text-white`); sub `mt-0.5 text-xs text-gray-500`.
  - **Fix:** Pass `cardClass="border border-line bg-white/[0.025]"` to the three default MetricCards so they get the mock's faint border+fill (currently only the earn card has `border-emerald-400/25 bg-emerald-400/[0.05]`). Set label to `text-[11px] uppercase tracking-wider text-text-3` (ours is `text-xs ... tracking-wide text-text-2` at `MetricCard.svelte:17` — mock is `[11px]`, `tracking-wider`, `text-gray-500`≈`text-3`). Reduce value→label gap to the mock's `mt-1` (ours `mb-2`).

---

## P2 — Polish

- [ ] **SavingsCard gradient endpoints differ from mock.**
  - **Now:** `SavingsCard.svelte:25` — `from-emerald-500/[0.10] via-gray-900 to-gray-950`.
  - **Mock target:** `Dashboard.jsx:21` — `from-emerald-500/[0.10] via-[#0a1410] to-[#070b12]` (a warmer green-tinted mid, near-black bottom).
  - **Fix:** Replace `via-gray-900 to-gray-950` with `via-[#0a1410] to-[#070b12]` (or theme equivalents) for the exact green-wash falloff.

- [ ] **SavingsCard NAV panel label says "last 12 months"; mock dashboard.png/v2 say the same, but prototype `portfolio.png` says "Value · last 40 days · +1.8% · Next accrual in ~6h · $1.20/day".**
  - **Now:** `SavingsCard.svelte:71-81` — "NAV · last 12 months", "+{apy}%", "Yield compounds monthly", "≈ ${monthly}/mo". This matches the **final** mock (`Dashboard.jsx:48-53`, `screenshots/dashboard.png`/`v2-dashboard.png`).
  - **Mock target:** `Dashboard.jsx:48` confirms "NAV · last 12 months" + "+3.53%" + clock "Yield compounds monthly" + "≈ $/mo". **We match the canonical Dashboard.jsx.** The `portfolio.png` "last 40 days / daily accrual" wording is an older prototype variant — ignore.
  - **Fix:** None (matches canonical). Listed for traceability.

- [ ] **Withdraw button border token.**
  - **Now:** `SavingsCard.svelte:64` uses `border-line-strong text-text-2 hover:bg-surface-2`.
  - **Mock target:** `Dashboard.jsx:44` — `border border-white/15 text-gray-200 hover:bg-white/5`. `white/15` is stronger than our default `line`; `line-strong` is the right call. Match is good.
  - **Fix:** None (acceptable mapping).

- [ ] **Add button accent color.**
  - **Now:** `SavingsCard.svelte:58` — `bg-emerald-500 text-[#05241a] hover:bg-emerald-400`. Matches `Dashboard.jsx:43` exactly (incl. the dark-mint text `#05241a`).
  - **Fix:** None.

- [ ] **Section heading sizes: ours `text-base sm:text-lg`, mock fixed `text-base`.**
  - **Now:** Funds/Holdings `h2` = `text-base font-semibold sm:text-lg` (`:1336`, `:1426`).
  - **Mock target:** `Dashboard.jsx:92`/`:121` — `mb-3 text-base font-semibold text-white` (no `sm:text-lg` bump).
  - **Fix:** Minor; drop `sm:text-lg` for exact parity, or keep (responsive bump is a reasonable enhancement). Low priority.

- [ ] **"Hide dust" checkbox & "Display holdings in unwrapped equivalents" toggle are app-only controls not in the mock.**
  - **Now:** `:1311-1322` and `:1427-1439`.
  - **Mock target:** none — mock has no such controls.
  - **Fix:** Keep (real functionality). Ensure their styling uses theme tokens (`text-text-2`, `border-line`) — currently uses `text-blue-500`/`text-yellow-400` accents which are fine per semantics. No change required; noted so it isn't mistaken for drift.

- [ ] **Empty/loading states (LoadingSpinner, EmptyState, WalletConnectionPrompt) are app-only.** Mock is static. Keep; out of audit scope for visual parity.
