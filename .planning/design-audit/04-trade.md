# Design audit — Trade terminal (`/trade/[id]`)

Area owner: Trade terminal full screen — Off-chain Reference card, Buy/Sell, reference chart, On-chain Market (Trade History + Orderbook Depth + Orders + Holdings), About (Token / Equity Details).

## Source-of-truth note (read first)

There are **two distinct trade mock designs** in the handoff:

1. **`Trade.jsx` + `TradeCharts.jsx` + `v2-trade-full.png`** — the "Off-chain Reference" layout: left Watchlist rail, top TickerTape, a 2-up grid of **Off-chain Reference card** (oracle/confidence/bid/offer + Buy/Sell) and **reference ChartCard**, then **On-chain Market** (tabs: Market Data / Orders / Holdings → Trade History + Orderbook Depth cards), then **About** (Token Details / Equity Details cards). **This is the layout our app actually implements**, so it is the canonical target and the basis for every item below.
2. **`trade.png` / `v2-trade-3col.png` / `v2-trade-low.png`** — an alternative app-style design (segmented Buy/Sell pill, Market/Limit/Stop right-rail order panel, ticker chips, 24H stat cards, Open-orders table). Our app does NOT use this structure (our order entry is a slide-in panel, not a docked column). **Do not refactor to this layout** — it is a different IA. Where its visual atoms (segmented control, stat chips) are instructive they are noted as optional P2.

(`01/02/03-trade-cards.png` and `trade-check.png` all captured the same SAVE&EARN hero scroll position — no trade content; ignore.)

The mock's **shared card vocabulary** (`Trade.jsx` L16–22):
```
CARD    = 'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur'
SUBCARD = 'rounded-xl border border-white/10 bg-black/30'
Glow    = absolute rounded-full bg-emerald-400/15 blur-3xl   (top-right corner)
```
Our equivalents: `bg-white/[0.03]`→`bg-surface-1` (or keep literal), `border-white/10`→`border-line`, `bg-black/30`→`bg-surface-1`/`bg-bg`. **Radius is the single biggest systemic miss: mock cards are `rounded-2xl`, ours are `rounded-lg`.**

---

## P0 — structural / obvious

### [ ] P0-1 — Card radius is `rounded-lg` everywhere; mock is `rounded-2xl`
- **Now:** Every card on the page uses `rounded-lg` — Off-chain Reference TradingView card (`+page.svelte` L1010), oracle stats card (L1053), chart card (L1207, L1235), vault sub-cards (L1458, L1515). 
- **Mock:** `CARD` = `rounded-2xl` (`Trade.jsx` L17), sub-panels `rounded-xl` (SUBCARD L18). The Buy/Sell buttons and idle-cash nudge are also `rounded-xl`.
- **Fix:** Change the four primary cards from `rounded-lg` → `rounded-2xl`. Inner panels (oracle grid, vault summary) → `rounded-xl`. Presentational only.

### [ ] P0-2 — Card background is `bg-surface-2/80`; mock uses translucent `bg-white/[0.03]`
- **Now:** Cards use `bg-surface-2/80 ... backdrop-blur-sm` (L1010, L1053, L1207, L1235).
- **Mock:** `bg-white/[0.03] backdrop-blur` (CARD). The mock's surface is a very faint white wash over the page gradient, not a raised solid panel. This reads as a flatter, glassier card.
- **Fix:** Swap `bg-surface-2/80` → `bg-surface-1` (the token-mapped equivalent of `bg-white/[0.03]`/`#0c121b`) per the brief mapping, OR keep `bg-white/[0.03]` literal. Keep `backdrop-blur`. Border `border-line` already matches `border-white/10`. Presentational only.

### [ ] P0-3 — Trade History & Orderbook Depth charts are NOT wrapped in cards
- **Now:** In `TokenMarketCharts.svelte` (L729–833), both charts sit in bare `<div class="flex min-h-96 flex-col ...">` with no border/bg/radius/padding — confirmed in `trade-dark.png` where the two charts float on the page background with no card frame. Headers are uppercase eyebrows (`text-sm font-semibold uppercase tracking-wide text-text-2`, L740, L801).
- **Mock:** Each chart lives in its own `CARD p-5` (`Trade.jsx` L204 & L219). Header is **title-case** `text-[15px] font-semibold text-white` ("Trade History" / "Orderbook Depth") with a `text-[12px] text-gray-500` subtitle directly under it ("On-chain trade executions over time" / "Current on-chain liquidity").
- **Fix:** Wrap each chart block in `rounded-2xl border border-line bg-surface-1 p-5 backdrop-blur`. Change the two `<h3>` from uppercase-eyebrow to `text-[15px] font-semibold text-text` and the `<p>` subtitle to `text-xs text-text-3`/`text-[12px]`. The grid is currently 3-col (history 2/3, depth 1/3) — mock is a simple `lg:grid-cols-2` (history left, depth right, equal). Consider `lg:grid-cols-2` for parity, but the 2:1 split is defensible given our richer history chart; flag, don't force. Presentational/markup only — chart canvas logic untouched.

### [ ] P0-4 — Trade History range tabs styled blue; mock segmented control on `1D/7D/30D`
- **Now:** Range buttons are individual outlined chips: blue when active (`border-blue-400/60 bg-blue-500/20 text-blue-200`), bordered when idle (`TokenMarketCharts.svelte` L746–763).
- **Mock:** A single pill **segmented group** — `flex gap-1 rounded-lg bg-white/[0.04] p-0.5`, each button `rounded-md px-2 py-1 text-[11px]`, **active = `bg-sky-500/80 text-white`**, idle = `text-gray-400` (`Trade.jsx` L207–209). So: keep the sky/blue active fill, but wrap the buttons in a single rounded track with a faint bg rather than separate outlined chips.
- **Fix:** Wrap the `{#each historyRangeOptions}` in a `flex gap-1 rounded-lg bg-surface-2/60 p-0.5` track; restyle each button to `rounded-md px-2 py-1 text-[11px] font-medium`, active `bg-blue-500/80 text-white`, idle `text-text-2`. (Use blue per st0x semantics; mock literal is `sky-500`.) Presentational only.

### [ ] P0-5 — Reference card missing the emerald Glow blob
- **Now:** Off-chain Reference / oracle card has no decorative glow (L1009–1181).
- **Mock:** The ReferenceCard is `relative overflow-hidden CARD p-5` with a `<Glow />` (`bg-emerald-400/15 blur-3xl` at `-right-12 -top-16 h-56 w-56`) behind the content (`Trade.jsx` L80–82). Holdings card also gets a smaller Glow (L245). This is the Home hero signature.
- **Fix:** Make the outer reference card `relative overflow-hidden`, add a sibling `<div class="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl"></div>` before content. Pure decoration. (Our reference card is currently split into two stacked cards — TradingView symbol-info card + oracle stats card. The glow belongs on the top/primary card.)

### [ ] P0-6 — Oracle / Confidence / Bid / Offer grid is not a SUBCARD
- **Now:** The 2×2 oracle metrics are a bare `<dl class="grid grid-cols-2 ...">` inside the stats card (L1054). Values use `font-medium text-text-2` (not mono, dimmed).
- **Mock:** This block is a distinct inset `SUBCARD` — `rounded-xl border border-white/10 bg-black/30 p-4`, `grid grid-cols-2 gap-x-8 gap-y-4`; each value is `font-mono text-[17px] text-white`, label `text-[10.5px] uppercase tracking-wider text-gray-500` (`Trade.jsx` L124–128).
- **Fix:** Wrap the `<dl>` in `rounded-xl border border-line bg-bg/40 p-4`. Make `<dd>` values `font-mono text-[17px] text-text` (white, mono, tabular) instead of `text-text-2`. Labels already roughly match; bump tracking to `tracking-wider`. Presentational only.

---

## P1 — clear visual drift

### [ ] P1-1 — Buy/Sell button treatment: white text + glow shadow vs mock dark-text flat
- **Now:** Buy = `bg-green-500 text-text shadow-lg shadow-green-500/30` ; Sell = `bg-red-500 text-text shadow-lg shadow-red-500/30`, `rounded-xl px-3 py-2.5 ... sm:py-3` (L1182–1201).
- **Mock:** Buy = `rounded-xl bg-emerald-500 py-3.5 text-[15px] font-bold text-[#05231a] hover:bg-emerald-400`; Sell = `rounded-xl bg-red-500 py-3.5 text-[15px] font-bold text-[#2a0808] hover:bg-red-400` (`Trade.jsx` L131–134). **Dark ink text on the fill, font-bold, no drop-shadow glow, taller `py-3.5`.**
- **Fix:** Replace `text-text` with the dark inks (`text-[#05231a]` / `text-[#2a0808]`), `font-semibold`→`font-bold`, drop the `shadow-lg shadow-*/30`, set `py-3.5`. Keep `green-500`→ our green and `red-500` (mock `emerald-500` already maps to mint). Keep focus-ring for a11y. Presentational only — `on:click={openTradePanel(...)}` untouched.

### [ ] P1-2 — "Advanced Chart" is a full-width amber bar below the chart; mock is a small inline outline button in the tf-tab row
- **Now:** A `w-full ... sm:w-auto` amber `Button` (`rounded-xl border border-yellow-400/40 bg-yellow-500/20 ... shadow-lg shadow-yellow-500/30`) sitting in its own row below the chart (`L1243–1253`).
- **Mock:** Compact button `ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/[0.06] px-3 py-1.5 text-[12px] font-semibold text-amber-300 hover:bg-amber-400/15`, with an **`arrowUpRight` icon**, positioned on the **right end of the timeframe-tab row** inside the chart card (`Trade.jsx` L171–173).
- **Fix:** Reduce to `rounded-lg ... bg-amber-400/[0.06] px-3 py-1.5 text-[12px] text-amber-300`, drop `shadow-lg shadow-yellow-*`, drop full-width. Add leading `Icon name="arrowUpRight"` (new `Icon.svelte`). Our chart is a TradingView widget so we can't host the button inside a tf-tab row that doesn't exist — keep it top-right of the chart card header area instead of a separate bottom row. Note: amber/yellow — mock uses `amber-*`; our code uses `yellow-*`. Per brief "warnings = amber (not yellow)", **switch `yellow-*` → `amber-*`** here. Presentational only.

### [ ] P1-3 — Inline SVG icons (wallet, plus, chevron) instead of shared `Icon` component
- **Now:** "Track in Wallet" uses two hand-rolled inline `<svg>` paths (wallet L1294–1316, plus L1318–1326). About-collapse chevron is an inline `<svg>` (L1564–1577).
- **Mock:** One `Icon` set (`atoms.jsx`), `viewBox 0 0 24 24`, `stroke 1.6`, currentColor. Available glyphs include `wallet`, `plus`, `chevronDown`, `arrowUpRight`.
- **Fix:** Replace the inline wallet svg with `<Icon name="wallet" />`, the plus svg with `<Icon name="plus" />`, the chevron with `<Icon name="chevronDown" />` (new `src/lib/components/ui/Icon.svelte`). Our inline plus/wallet use `stroke-width=2`; mock is `1.6` — the shared Icon normalizes this. Presentational only.

### [ ] P1-4 — On-chain Market section header sizing vs mock
- **Now:** `<h2 class="text-base font-semibold sm:text-lg">On-chain Market</h2>` + `text-xs/sm text-text-2` subtitle (L1264–1267). Same pattern for About (L1559).
- **Mock:** `text-[20px] font-bold tracking-tight text-white` heading + `text-[13px] text-gray-500` subtitle (`Trade.jsx` L190–191, L303–304). Mock is bolder/larger (20px bold tracking-tight) and the section sits under a `border-t border-white/[0.06] pt-6` divider.
- **Fix:** Bump both section `<h2>` to `text-xl font-bold tracking-tight text-text` (≈20px) and subtitle to `text-[13px] text-text-3`. Add a top divider `border-t border-line pt-6` above On-chain Market and `pt-6 mt-8` above About to match the mock's sectioning (mock About L302). Presentational only.

### [ ] P1-5 — On-chain Market tab underline color
- **Now:** `TabNav.svelte` active tab = `border-accent text-accent` (mint) — this actually **matches** the mock's `text-emerald-300` + `bg-emerald-400` underline. Good. But the underline is `border-b-2` on the button vs mock's absolute `-bottom-px h-0.5 bg-emerald-400` floating bar over a `border-b` track. Visually equivalent.
- **Mock:** `Trade.jsx` L195–197 (emerald active text + emerald underline bar). 
- **Fix:** No change required — keep TabNav. (Note for consistency: the Trade-History range control above should NOT use this tab styling; see P0-4.) ✅ Largely compliant.

### [ ] P1-6 — Reference ticker symbol (price + change) typography
- **Now:** Title row prices use `font-mono tabular-nums` in places but the big price/change come from the TradingView symbol-info widget (not our markup), so we can't restyle them. The oracle/bid/offer numerics are `font-medium text-text-2` (see P0-6).
- **Mock:** Big price `font-mono text-[30px] font-semibold text-white` with USD label and signed change `font-mono text-[15px]` mint/red (`Trade.jsx` L106–108). Mono + tnum throughout.
- **Fix:** Where numerics are OUR markup (oracle grid, bid/offer, wrap-ratio, vault summary), ensure `font-mono tabular-nums`. The TV widget header is out of our control — leave it. Logic-entangled values (live prices) keep bindings; only add `font-mono tabular-nums` classes. Presentational only.

---

## P2 — polish / optional

### [ ] P2-1 — Missing "idle-cash → Earn" nudge under the Buy/Sell card
- **Now:** No nudge button beneath the Buy/Sell row.
- **Mock:** A pill CTA `group flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] py-2.5 text-[12px] text-emerald-300/80` with leading `Icon name="sprout"` and trailing `Icon name="arrowRight"` reading "Holding cash between trades? Earn N% in Savings" (`Trade.jsx` L139–143). Note `trade.png` shows the same nudge ("Idle USDC? Earn …") docked under the order panel.
- **Fix:** OPTIONAL new presentational element — add a mint-outline pill under the Buy/Sell grid linking to Earn, using `Icon name="sprout"` + `arrowRight`. This is net-new copy/CTA; confirm with product before adding (it routes somewhere real). Flag, do not auto-add.

### [ ] P2-2 — Missing TickerTape and Watchlist rail (mock-only shell)
- **Now:** Our page has neither a top wrapped-equity ticker tape nor a left ASSETS watchlist rail.
- **Mock:** `Trade.jsx` renders `<TickerTape>` (animated marquee of wrapped equities, `border-b border-white/[0.06] bg-black/30`, L25–44) and a `<Watchlist>` aside (`w-[208px] border-r ... bg-black/20`, active item gets `bg-emerald-400/[0.07]` + a 3px mint left bar, `AssetDisc` + symbol + Earn chip + price, L47–73).
- **Fix:** These are app-shell/IA additions, not card fidelity. Our app uses a different nav model; adding a watchlist rail + ticker is a feature decision, not a presentational fix. **Flag as out-of-scope for this audit** — do not add without product sign-off. If pursued later, the AssetDisc/Earn-chip atoms and the mint left-bar active treatment are the reference.

### [ ] P2-3 — AssetDisc avatar treatment
- **Now:** Token avatars elsewhere on the page use logo images / circular img (e.g. trade-panel header L1932 `rounded-full border border-line object-cover`).
- **Mock:** `AssetDisc` is a gradient disc (`radial-gradient(circle at 30% 25%, c1, c2)`) with 2-letter ticker, `inset 0 1px 0 rgba(255,255,255,.25)` top sheen, and a mint ring (`0 0 0 3px rgba(45,227,166,.18)`) for Earn assets (`atoms.jsx` L140–155). The reference/chart cards in the mock use a 40–46px AssetDisc beside the ticker.
- **Fix:** Low priority — our real token logos are arguably better than the mock's letter discs. Keep real logos. Only if a token lacks a logo, the AssetDisc gradient is a good fallback. No change required.

### [ ] P2-4 — Holdings / position card (mock) vs our Vaults tab
- **Now:** Our third tab is "Vaults" with a two-column vault list + summary table (L1391–1545), cards `rounded-lg border border-line bg-surface-2`.
- **Mock:** "Holdings" tab is a single glow card: `relative overflow-hidden CARD p-6` with `<Glow>`, showing "Your {sym} position" (qty) left and "Value · unrealised P&L" right, `font-mono text-[24px] font-semibold text-white` with `+pnl%` in mint (`Trade.jsx` L243–251).
- **Fix:** Our Vaults view is richer real functionality — keep it. Apply the card-radius/bg fixes (P0-1/P0-2) to the vault sub-cards (`rounded-lg`→`rounded-2xl`/`rounded-xl`, `bg-surface-2`→`bg-surface-1`). Optionally add the Glow to the summary card. Numerics → `font-mono tabular-nums`. Presentational only.

### [ ] P2-5 — Orders tab table styling
- **Now:** Orders rendered via `OrdersTable.svelte` (not reviewed in depth here).
- **Mock (`Trade.jsx` L230–240):** Header row `grid grid-cols-[1fr_1fr_1fr_1fr_1fr] bg-white/[0.03] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500`; rows `border-t border-white/[0.05] px-4 py-3 text-[13px]`; Side cell `font-semibold text-emerald-400`(buy)/`text-red-400`(sell); status `text-amber-300`. Whole table is an `overflow-hidden CARD` (rounded-2xl). `trade.png` shows green/red filled "BUY"/"SELL" badges + "Cancel" action.
- **Fix:** Audit `OrdersTable.svelte` separately. Ensure: container `rounded-2xl border border-line overflow-hidden`, header eyebrow `text-[10.5px] uppercase tracking-wider text-text-3` on faint bg, buy/sell colored mint/red, status amber, qty/price `font-mono tabular-nums`. Out of this file's scope — note for the table-owner.

### [ ] P2-6 — Equity Details / Token Details eyebrows already match
- **Now:** `text-sm font-semibold uppercase tracking-wide text-text-2` (L1588, L1806).
- **Mock:** `text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500` (`Trade.jsx` L262, L283). Mock eyebrow is smaller (11px) with wider tracking (`0.18em`) and dimmer (`text-3`).
- **Fix:** Tighten to `text-[11px] uppercase tracking-[0.18em] text-text-3` for closer match. Minor. Presentational only.

### [ ] P2-7 — Contract Information rows: link color & external-link icon
- **Now:** Address links use `text-blue-400 hover:text-blue-300` with `ExternalLink` (L1616 etc.). Rows are `flex justify-between ... text-sm` with `space-y-3` (not divided).
- **Mock:** Rows are `divide-y divide-white/[0.05]`, each `py-2.5 text-[13.5px]`; mono/link values `font-mono text-sky-400` with a trailing `Icon name="arrowUpRight" h-3 w-3 text-gray-500` (`Trade.jsx` L269–273).
- **Fix:** Add `divide-y divide-line` to the rows container, `py-2.5`. Make address values `font-mono text-blue-400` (sky→blue per st0x) with trailing `Icon name="arrowUpRight"`. Our `ExternalLink` likely already renders an icon — verify it's `arrowUpRight` shape, not flowbite. Presentational only.

---

## Logic-entanglement notes (safe vs risky)

- **Safe (pure markup/class/icon):** all card radius/bg/border swaps; Glow blobs; SUBCARD wrapping; Buy/Sell button colors & text ink; Advanced-Chart button restyle & amber switch; section-header sizing & dividers; range-control segmented styling; replacing inline SVGs with `Icon`; eyebrow tracking; numeric `font-mono tabular-nums` class additions; Contract-row divide/icon.
- **Entangled — do NOT touch:** `openTradePanel('Buy'|'Sell')` handlers, `historyRange` dispatch/`on:rangeChange` (restyle the button, keep the `on:click`+`track()`), Chart.js dataset colors are JS config (mint `#22c55e`/red `#ef4444` already correct — bid green/ask red OK; leave logic), TradingView widget internals (its header price/tf tabs are not our DOM — cannot restyle), oracle/bid/offer values come from live queries (add classes only, keep `{#if}`/bindings), wrap-ratio conditionals, vault pagination.
- **Cannot match without feature work:** custom `.tf` timeframe tabs (`1D/1M/3M/1Y/5Y/All`) — our chart is a TradingView widget that owns its own range UI; the mock's `.tf` row is not reproducible without swapping the chart. Ticker tape + watchlist rail (P2-2) are IA additions. Flag for product, not a presentational fix.
