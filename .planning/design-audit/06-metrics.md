# Design-fidelity audit — Platform Metrics (`/platform-metrics`)

**Our file:** `src/routes/(main)/platform-metrics/+page.svelte`
**Imported components:** `MetricCard.svelte` (→ `Card.svelte`), `Table.svelte`, `InfoBlock.svelte`, `Section.svelte`, `PageContainer.svelte`, `LoadingSpinner.svelte`, `Footer.svelte`
**Mock source:** `src2/Metrics.jsx`, atoms in `src2/atoms.jsx`, data in `src2/data.jsx`
**Mock screenshots:** `v2-metrics*.png`, `metrics*.png`

---

## Executive summary

This is the area with the **largest visual/structural gap** of any audited page. The mock `/metrics` is a **transparency dashboard**: an eyebrow header + live pill, a 4-up KPI card grid (mono values + sparklines + bar-sparks + a live-dot accent card), a full-width TVL **area chart** with a 7D/30D/90D/ALL timeframe toggle, a two-up **donut (TVL-by-asset) + daily-volume bar chart** row, a two-up **cumulative-yield area chart + proof-of-reserve panel** row, and a closing **idle-cash nudge CTA band**. None of these structures exist in our page.

Our page is instead an **operational multi-network data view**: an `InfoBlock` banner, a 5-column flat MetricCard strip, a "Stats by Network" table, and a "Token Volumes" table with a network `<select>`. It uses no charts, no sparklines, no donut, no proof-of-reserve, and no eyebrow/CTA.

Per the brief, this app has **real live data** the static mock lacks, so we must NOT delete the real tables/network logic. But the mock's *visual language* — eyebrow, KPI cards w/ sparklines, area/bar charts, donut, reserve panel, CTA — is almost entirely absent and should be layered in. The discrepancy list below is large; the highest-leverage P0 items are: add the eyebrow + `font-display` H1 + live pill header, convert the flat metric strip into the mock's 2×2/1×4 rounded-2xl KPI card grid with sparklines and the accent live-dot card, and adopt the rounded-2xl chart-card container styling (`border-white/10 bg-white/[0.025] p-5`).

---

## Section 1 — Page header / eyebrow

- [ ] **P0 — No eyebrow line.** Our page jumps straight into an `InfoBlock` info banner (`+page.svelte` lines 577–583); there is no eyebrow or page title at all.
  - **Mock** (`Metrics.jsx` 83–85): `<div className="mb-2 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-emerald-400"><span className="h-px w-5 bg-emerald-400/40"></span>Transparency · Live</div>` — a short mint dash rule + mono uppercase wide-tracked eyebrow text.
  - **Fix:** Add the eyebrow above the H1: `<div class="mb-2 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-accent"><span class="h-px w-5 bg-accent-line"></span>Transparency · Live</div>`.

- [ ] **P0 — No page H1.** We have no "Platform metrics" heading; the page only has `h2` section titles ("Stats by Network", "Token Volumes").
  - **Mock** (`Metrics.jsx` 86): `<h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Platform metrics</h1>`. The rendered mock uses the **display font** (Space Grotesk per tokens) — heavy, tight tracking.
  - **Fix:** Add `<h1 class="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">Platform metrics</h1>`.

- [ ] **P0 — No descriptive sub-line under the title.**
  - **Mock** (`Metrics.jsx` 87): `<p className="mt-2 max-w-xl text-[15px] text-gray-400">Onchain activity across st0x — every figure is read from Base mainnet and refreshes each block.</p>`.
  - **Fix:** Add `<p class="mt-2 max-w-xl text-[15px] text-text-2">Onchain activity across st0x — every figure is read from Base mainnet and refreshes each block.</p>`.

- [ ] **P0 — Missing "Live · N markets" pill (header right).** Our only "Live" indicator is a tiny `green-400` dot+label buried inside the "Stats by Network" section header (lines 648–651).
  - **Mock** (`Metrics.jsx` 89–92): a right-aligned rounded-full mint pill with an animated ping dot: `<div className="flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-3.5 py-2 font-mono text-[12px] font-semibold text-emerald-300"><span className="relative flex h-1.5 w-1.5"><span className="absolute … animate-ping rounded-full bg-emerald-400 opacity-70"></span><span className="relative … rounded-full bg-emerald-400"></span></span>Live · 12 markets</div>`. The whole header is `flex flex-wrap items-end justify-between gap-4 mb-7`.
  - **Fix:** Wrap title block + pill in `<div class="mb-7 flex flex-wrap items-end justify-between gap-4">`. Build the ping pill with `border-accent-line bg-accent-soft text-accent font-mono` and the two-span animate-ping dot. Use live market count from real data.

- [ ] **P1 — Replace the `InfoBlock` "Multi-Network Data" banner.** The blue info banner (lines 577–583) has no mock equivalent and reads as a dev/ops notice. The mock conveys "live, multi-source" via the eyebrow + pill instead.
  - **Fix:** Remove the standing `InfoBlock` for the normal state (keep the `variant="warning"` error blocks at 585–599 for real failures, but restyle to amber per the brief's warning convention). The "multi-network" idea is covered by the new live pill.

- [ ] **P1 — Color of the live dot is raw `green-400`, not the mint accent.** Lines 648–649 use `text-green-400` / `bg-green-400`.
  - **Mock:** mint `emerald-400` (= our `accent`). **Fix:** use `text-accent` / `bg-accent` and add the `animate-ping` outer span.

---

## Section 2 — KPI card grid

Mock has **4 KPI cards** in `grid grid-cols-2 gap-3 lg:grid-cols-4` (`Metrics.jsx` 96–98), each a `KpiCard` (55–73). Our equivalent is the flat strip at lines 601–638: `grid grid-cols-2 … lg:grid-cols-5` of plain `MetricCard`s.

- [ ] **P0 — Wrong card count & content.** Ours: TVL, Trading Volume, Total Trades, DEX Liquidity (5-col grid, last two hidden on mobile).
  - **Mock** (`data.jsx` 294–299 `METRIC_KPIS`): **Total Value Locked** (`$24.0M`, `+6.4% · 30-day`, sparkline), **24h Volume** (`$1.84M`, `+12% · $312M all-time`, sparkline), **Current APY** (`3.53%`, `SEC yield · $1.21M distributed`, `tone:'accent'`, no spark — live-dot accent card), **Wallets earning** (`4,182`, `+3.1% · 7-day`, sparkline).
  - **Fix:** Restructure to a 4-card grid (`grid-cols-2 lg:grid-cols-4 gap-3`). Map our live values onto these 4 slots (TVL, 24h/30d volume, APY/yield, wallets/trades). Keep real data but adopt the mock card anatomy below. The 5-column / "DEX Liquidity" / "Total Trades" split is mock-divergent — fold into the 4 KPI slots or move DEX-liquidity detail into the network table.

- [ ] **P0 — KPI card chrome is wrong.** `MetricCard`→`Card` renders `rounded-xl`, padding `p-4 sm:p-6`, and **no border / no background fill** (Card.svelte line 7 — only `rounded-xl overflow-hidden` + padding; background comes from whatever wraps it). In our screenshot the cards read as borderless blocks on the page bg.
  - **Mock** (`Metrics.jsx` 58): non-accent card = `relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-5`. So: **rounded-2xl** (not xl), **explicit hairline border** `border-white/10`, **subtle fill** `bg-white/[0.025]`, **p-5**.
  - **Fix:** Either give `MetricCard`/`Card` a `rounded-2xl border border-line bg-surface-1/… p-5` variant for this page, or build the KPI cards inline. Match radius (2xl), border (`border-line`), fill (`bg-white/[0.025]` ≈ `bg-surface-1`), padding (p-5).

- [ ] **P0 — Accent KPI card variant missing entirely.** The "Current APY" card is special: mint gradient border + glow.
  - **Mock** (`Metrics.jsx` 58–65): `border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.10] to-transparent`, a blurred glow `absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-400/15 blur-2xl`, value colored `text-emerald-300`, and a **live ping dot** before the label (62). Our MetricCard has no such variant (its `showGradient` is a top-border hover line, unrelated — and we pass `showGradient={false}`).
  - **Fix:** Add an `accent` KPI variant: `border-accent-line bg-gradient-to-br from-accent-soft to-transparent`, blurred mint glow blob, mint value text, and the animate-ping label dot.

- [ ] **P0 — KPI label typography differs.** Ours (MetricCard line 17): `text-xs font-medium uppercase tracking-wide text-text-2`.
  - **Mock** (`Metrics.jsx` 61): `text-[11px] uppercase tracking-wider text-gray-500` (i.e. `text-text-3`), with `flex items-center gap-1.5` to host the ping dot on accent cards. Smaller (11px), lighter color (gray-500 not gray-400), wider tracking.
  - **Fix:** `flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3`.

- [ ] **P0 — KPI value is not mono and wrong size/weight.** Ours uses `valueClass="text-xl font-bold sm:text-3xl"` (line 608) — sans, no mono.
  - **Mock** (`Metrics.jsx` 65): `mt-2 font-mono text-3xl font-bold` (`text-white`, or `text-emerald-300` on accent). The big numerals are **mono** (`$24.0M`, `4,182`) — note the distinctive mono `0`/`.` in the screenshots.
  - **Fix:** `mt-2 font-mono text-3xl font-bold text-text` (accent → `text-accent`). Drop the responsive `text-xl` shrink or keep a smaller mobile size but keep `font-mono`.

- [ ] **P0 — Change/delta line styling differs and lacks the `· sub` suffix.** Ours renders change via MetricCard's `change` slot (an `↗` glyph + text, `text-accent`, lines 21–26) but the page never passes `change`; it passes `subtitle` instead, rendered as plain `text-sm text-text-3` (MetricCard 27–29). Result: a generic subtitle, no delta coloring.
  - **Mock** (`Metrics.jsx` 66–67): a single mono line `font-mono text-[12px]` where `tone==='up'` → `text-emerald-400`, else `text-gray-400`, content `{d}{sub ? \` · ${sub}\` : ''}` e.g. `+6.4% · 30-day`. No arrow glyph. Positioned in a `flex items-center justify-between` row with the sparkline on the right.
  - **Fix:** Render the delta as `font-mono text-[12px] text-accent` (up) / `text-text-2` (neutral), composing `{delta} · {sub}`. Remove the `↗` arrow. Put it in a `mt-2 flex items-center justify-between` row alongside the sparkline.

- [ ] **P0 — Sparklines / bar-sparks entirely missing.** Every non-accent KPI card carries a tiny inline chart on the bottom-right.
  - **Mock** (`Metrics.jsx` 68): `<Sparkline data={kpi.spark} w={64} h={26} color="#2de3a6" fill={false} />` wrapped in `opacity-90`. The 24h-volume card's spark is a noisier series (`mkSpark`), TVL/wallets are monotone. `Sparkline` (atoms 61–82): 2-color-stop gradient option but `fill={false}` here so it's a 1.8px mint stroke line.
  - **Fix:** Port a Svelte `Sparkline` (SVG path from data, `stroke-width 1.8`, `stroke = accent`, `fill={false}`, `w=64 h=26`). Render in each non-accent card. We have real series available (price feeds / TVL history) to feed it.

- [ ] **P1 — Live-dot ping animation atom not present.** The accent card (and header pill, Section 1) need the two-span `animate-ping` dot.
  - **Fix:** Create a small reusable `LiveDot` snippet/component: outer `absolute … animate-ping rounded-full bg-accent opacity-70` + inner `relative … rounded-full bg-accent`, all inside `relative flex h-1.5 w-1.5`.

---

## Section 3 — TVL area chart (full-width card)

**Entirely missing in our page.** The mock devotes a prominent full-width card to a TVL trend area chart with a timeframe toggle (`Metrics.jsx` 100–118; screenshots `v2-metrics-mid`, `metrics`).

- [ ] **P0 — No TVL area chart section.** We show TVL only as one number in the KPI strip and a per-network table column.
  - **Mock card chrome:** `mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5`.
  - **Mock header** (102–115): left = small uppercase label `text-[12px] uppercase tracking-wider text-gray-500` ("Total value locked") above a `flex items-end gap-2.5` row of `font-mono text-3xl font-bold text-white` value (`$24.0M`) + `mb-1 font-mono text-[13px] font-semibold text-emerald-400` delta (`+6.4% · 30d`). Right = the timeframe toggle.
  - **Mock chart:** `<div className="h-[240px]"><AreaChart data={TVL_SERIES} /></div>` then a mono month-axis row `mt-2 flex justify-between font-mono text-[11px] text-gray-600` with `Nov Jan Mar May Jul`.
  - **Fix:** Add this card. `AreaChart` (Metrics.jsx 7–34): smooth quadratic path, mint stroke `2.2px`, gradient fill `0.28→0` opacity, 3 faint grid lines (`rgba(255,255,255,0.05)` at 25/50/75%), and a `r=4` end dot. Reproduce as an SVG Svelte component. Feed with real TVL history series.

- [ ] **P0 — Timeframe toggle (7D/30D/90D/ALL) missing.**
  - **Mock** (110–114): a segmented control `flex gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5`; each button `rounded-md px-3 py-1.5 font-mono text-[12px] font-medium transition`; active = `bg-white/10 text-white`, inactive = `text-gray-500 hover:text-gray-300`.
  - **Fix:** Build a 4-segment mono toggle bound to a `tf` state controlling the chart window. Active state `bg-surface-3 text-text`, inactive `text-text-3 hover:text-text-2`, container `rounded-lg border border-line bg-black/20 p-0.5`.

---

## Section 4 — TVL-by-asset donut + Daily volume (two-up row)

**Entirely missing.** Mock `Metrics.jsx` 120–165, screenshot `v2-metrics-low`. Two cards in `grid gap-4 lg:grid-cols-2`.

### 4a — TVL by asset donut
- [ ] **P0 — No donut composition card.** Our "Token Volumes" table is the closest analog but it's a volume table, not a TVL-share donut.
  - **Mock card** (123): `rounded-2xl border border-white/10 bg-white/[0.025] p-5`, title `mb-4 text-[13px] font-semibold text-white` "TVL by asset".
  - **Mock body** (125–145): `flex items-center gap-6` — left a `Donut` (size 168, stroke 22, segment colors from `TVL_BY_ASSET`) with a centered overlay `font-mono text-2xl font-bold text-white` total `$24.0M` + `text-[10px] uppercase tracking-wide text-gray-500` "Total locked". Right a `flex-1 space-y-2` legend; each row: `h-2.5 w-2.5 rounded-sm` color swatch, symbol `text-[12.5px] font-medium text-white` with optional mint **EARN** chip (`rounded bg-emerald-400/15 px-1 py-px text-[8px] font-bold uppercase text-emerald-300`), `$X.XM` `font-mono text-[12px] text-gray-300`, and `w-9 text-right font-mono text-[11px] text-gray-500` percent.
  - **Fix:** Port a `Donut` SVG component (Metrics.jsx 37–53: rotate -90, butt-cap arcs via `strokeDasharray`/`offset`, faint track `rgba(255,255,255,0.05)`). Build from real per-token TVL. Note the **EARN** chip on the SGOV/savings row — st0x has no SGOV savings token live, so map to whichever earn token applies or omit the chip; do not invent SGOV.

### 4b — Daily volume bars
- [ ] **P0 — No daily-volume bar chart card.**
  - **Mock** (148–164): card `rounded-2xl border border-white/10 bg-white/[0.025] p-5`. Header row `mb-1 flex items-center justify-between`: `text-[13px] font-semibold text-white` "Daily volume" + `font-mono text-[12px] text-emerald-400` "+12% · 24h". Below `mt-1 flex items-end gap-2.5`: `font-mono text-3xl font-bold text-white` "$1.84M" + `mb-1 text-[12px] text-gray-500` "last 24h".
  - **Bars** (158): `<div className="mt-4 h-[150px]"><BarSpark data={VOLUME_BARS} w={420} h={150} color="#7d8bff" gap={3} /></div>` — note volume bars are **iris/periwinkle `#7d8bff`** (our `iris`), NOT mint. `BarSpark` (atoms 158–169): rounded-top rects, opacity ramps `0.35 + 0.65*(v/max)`.
  - **Footer stats** (159–163): `mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-center` of 3 mini-stats — each `font-mono text-[14px] font-semibold text-white` value + `mt-0.5 text-[10px] uppercase tracking-wide text-gray-500` label: `$312M / All-time`, `$1.21M / Avg / day`, `38.4k / Trades · 30d`.
  - **Fix:** Port `BarSpark` (color `iris`/`#7d8bff`, gap 3, rounded rect tops, opacity ramp). Build the header + 3-up footer stat grid with the `border-t border-line` divider. Use real 24-day volume + all-time/avg/trades from `tradeActivity`.

---

## Section 5 — Cumulative yield + Proof-of-reserve (two-up row)

**Entirely missing.** Mock `Metrics.jsx` 167–210, screenshots `v2-metrics-reserve`. `grid gap-4 lg:grid-cols-[1.1fr_1fr]` (asymmetric: yield wider).

### 5a — Cumulative yield (accent card)
- [ ] **P1 — No cumulative-yield accent card.** (This is an Earn/Savings feature; st0x may not have live SGOV yield — gate on real data, don't fabricate.)
  - **Mock** (170–185): accent card `relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-5` + blurred glow `absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/12 blur-3xl`. Header: title `text-[13px] font-semibold text-white` "Yield distributed" + `<ApyChip />` (mint ping pill `3.53% APY`), subline `mt-1 text-[12px] text-gray-400`, right-aligned big `font-mono text-2xl font-bold text-emerald-300` "$1.21M" + `text-[11px] text-gray-500` "since launch". Then `mt-4 h-[140px]` AreaChart with `grid={false}` (no gridlines).
  - **Fix:** If yield data exists, build the accent yield card (mirror the accent KPI chrome at larger scale, `blur-3xl` glow, gridless AreaChart). Port `ApyChip` (atoms 85–97). Otherwise omit — do not show fake SGOV yield.

### 5b — Proof of reserve panel
- [ ] **P1 — No proof-of-reserve panel.** This is a strong trust element in the mock.
  - **Mock** (188–209): card `rounded-2xl border border-white/10 bg-white/[0.025] p-5`. Header `mb-4 flex items-center gap-2`: a `flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300` icon tile holding `<Icon name="shield" className="h-5 w-5" />`, then title `text-[13px] font-semibold text-white` "Proof of reserve" + `text-[11px] text-gray-500` "Every token backed 1:1 · onchain attested".
  - **Reserve grid** (196–204): `grid grid-cols-2 gap-2.5` of 4 tiles, each `rounded-xl border border-white/[0.07] bg-black/20 p-3.5` containing `font-mono text-lg font-bold text-white` value, `mt-0.5 text-[11px] font-medium text-gray-300` key, `mt-0.5 text-[10.5px] leading-snug text-gray-500` sub. Data (`data.jsx` 329–334): "237,418 / SGOV shares held", "100.4% / Reserve ratio", "14s ago / Last attestation", "0 / Audit findings".
  - **Attestation footer** (205–208): `mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3.5 py-2.5 text-[12px] text-emerald-200/90` with `<Icon name="check" className="h-4 w-4 text-emerald-400" />` and a link button `font-semibold text-emerald-300 underline-offset-2 hover:underline` "View attestation →".
  - **Fix:** Build the panel. Use the `shield` and `check` icons from the new `Icon.svelte` (NOT flowbite). Reserve facts should come from real proof-of-reserve / audit data; gate on availability rather than hardcoding SGOV figures.

- [ ] **P1 — `shield` / `check` icons must be the mock `Icon` set.** Our page currently imports no icons here at all (no PoR panel exists). When built, use `Icon name="shield"` path `M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z` and `check` path `M5 13l4 4L19 7` (atoms 13, 21) — stroke 1.6, currentColor. Do not substitute flowbite glyphs.

---

## Section 6 — Idle-cash CTA band (bottom)

- [ ] **P1 — No closing CTA band.** Mock ties metrics back to the product with a conversion band.
  - **Mock** (212–217): `mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/[0.10] to-transparent px-5 py-4`. Left `<Icon name="sprout" … text-emerald-400 />` (sprout path, atoms 20), copy `text-[14px] text-gray-200` "$11.6M is already earning 3.53% in Savings." with a `text-gray-400` follow "Idle USDC earns nothing — join them.", and a right-aligned button `ml-auto rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#053124] hover:bg-emerald-400` "Start earning 3.53%".
  - **Fix:** Add the band IF there is a real Savings/Earn product to link to. Use `sprout` icon, mint gradient band, and the solid-mint primary button (`bg-accent text-[#053124]` style used across the mock — dark-green text on mint). If no Savings product is live, omit rather than fabricate.

---

## Section 7 — "Stats by Network" table (ours; mock-divergent)

This table is **real functionality** the mock lacks — keep it, but restyle to the mock's card/typography language.

- [ ] **P1 — Section header lacks eyebrow/mono treatment & uses raw green dot.** Lines 641–652. `h2 text-base sm:text-lg` is fine but the "Live" indicator uses `text-green-400`/`bg-green-400` (lines 648–649) — should be `text-accent`/`bg-accent` + animate-ping per the mock's live-dot convention.
  - **Fix:** Recolor the live dot to mint with ping; consider wrapping section titles in the `Section` card chrome to match the rounded-2xl bordered surfaces (the mock has no naked sections — every block is a card).

- [ ] **P1 — TVL/volume numerals not mono.** Table cells (lines 699–707) render values in the default sans font. The mock renders **all numerics in `font-mono`**.
  - **Fix:** Add `font-mono` to the numeric `<td>`s (TVL, DEX liquidity, volume). The positive TVL color `text-green-400` (line 699) → `text-accent`.

- [ ] **P2 — Network rows show ARB/ETH branches** (lines 685–689) for a single-Base chain. Cosmetic dead branches; the icon for Base should be the only one rendered. Low priority / not a mock concern.

- [ ] **P2 — Table is naked, not carded.** The mock wraps everything in `rounded-2xl border border-white/10 bg-white/[0.025]` cards. Our `Section`/`Table` likely render without the hairline-bordered fill. Consider giving the network + token tables a card container for visual consistency.

---

## Section 8 — "Token Volumes" table (ours; mock-divergent)

Real functionality — keep. Restyle for consistency.

- [ ] **P1 — Network `<select>` focus ring is `yellow-500`** (line 725). Per brand semantics warnings = amber and accents = mint; a yellow focus ring is off-palette.
  - **Fix:** `focus:ring-accent` (mint) or `focus:ring-line`.

- [ ] **P1 — "Total Volume" cell uses `text-yellow-400`** (line 764). Off-palette yellow.
  - **Fix:** Use `text-text` mono or `text-accent` for positive; reserve amber strictly for warnings.

- [ ] **P1 — Numeric cells not mono.** Lines 764–770 values are sans.
  - **Fix:** Add `font-mono` to volume/value/trades cells to match the mock's mono-numeric convention.

- [ ] **P2 — Token symbol fallback disc** (lines 752–757) is a plain `bg-surface-3` circle with first-letter. The mock uses `AssetDisc` (atoms 140–155): a per-symbol radial-gradient disc with 2-letter initials (and a bank glyph for the earn/SGOV token). Lower priority, but adopting `AssetDisc` would unify token visuals across pages.

---

## Section 9 — Global / cross-cutting

- [ ] **P0 — Mono font not applied to numerics anywhere.** The single most pervasive gap: the mock renders **every figure** (`$24.0M`, `3.53%`, `4,182`, table values, percentages, deltas, axis labels) in `font-mono`. Our page uses the default sans for all numbers. This alone makes the page read as a different design.
  - **Fix:** Apply `font-mono` to all KPI values, chart headline values, deltas, donut center, reserve tiles, and table numeric cells.

- [ ] **P1 — Card radius inconsistency.** Mock standard is `rounded-2xl`; our `Card` defaults to `rounded-xl`. All metrics cards/charts/panels should be `rounded-2xl`.

- [ ] **P1 — Card surface/border tokens.** Mock standard card = `border border-white/10 bg-white/[0.025]` (≈ `border-line` + a very faint surface). Accent card = `border-accent-line bg-gradient-to-br from-accent-soft to-transparent`. Inner tiles = `border-white/[0.07] bg-black/20`. Our cards currently have no explicit border/fill (Card.svelte). Standardize these three surface recipes.

- [ ] **P1 — Section vertical rhythm.** Mock stacks blocks with `mt-4` between every card/row and `mb-7` under the header. Our page relies on `Section` spacing. Align to the mock's `mt-4` cadence once cards are introduced.

- [ ] **P2 — Page width.** Mock container is `mx-auto max-w-6xl px-5 py-8` (`Metrics.jsx` 79). Verify our `PageContainer` matches (max-w-6xl, px-5/py-8) so the grid lines up with other v2 pages.

- [ ] **P2 — Loading state.** Ours shows a centered `LoadingSpinner` (lines 572–575). Fine functionally; the mock has no loading state. Keep, but ensure spinner uses mint accent not yellow/green.

---

## Icon inventory (mock `Icon` names to adopt)

| Where | Mock icon (`atoms.jsx` path) | Our current |
|---|---|---|
| Proof-of-reserve header tile | `shield` (13) | none (panel missing) |
| Attestation footer | `check` (21) | none |
| Idle-cash CTA band | `sprout` (20) | none |
| (KPI/header live dots) | n/a — CSS `animate-ping` spans, not an icon | raw green dot |

All must come from the new `src/lib/components/ui/Icon.svelte` (viewBox 0 0 24 24, stroke 1.6, currentColor). No flowbite-svelte-icons on this page.

---

## Priority rollup

**P0 (structural / obvious):** eyebrow + `font-display` H1 + sub-line + live ping pill header; 4-card KPI grid with mock chrome (`rounded-2xl border-line bg-white/[0.025] p-5`); accent APY KPI variant (gradient border + glow + ping dot + mint value); mono KPI values + delta `· sub` line; KPI sparklines; full-width TVL **AreaChart** card + 7D/30D/90D/ALL toggle; donut + daily-volume(bar) two-up row; global `font-mono` on all numerics.

**P1:** cumulative-yield accent card + proof-of-reserve panel (gated on real data; `shield`/`check` icons); idle-cash CTA band w/ `sprout` icon + solid-mint button; recolor `green-400` live dots → mint+ping; remove standing InfoBlock banner (keep amber warnings); mono-ize table numerics; fix `yellow-500`/`yellow-400` off-palette to mint; card radius → `rounded-2xl`; standardize surface/border tokens.

**P2:** card-wrap the network/token tables; adopt `AssetDisc` for token rows; verify `max-w-6xl px-5 py-8`; ARB/ETH dead branches; loading-spinner accent color.
