# Design-fidelity audit — Home / Landing page

Area: hero, quick-trade module, save-&-earn card, token table, trust/pillars band, pioneers footer.

Mock sources of truth:
- `design-ref/handoff-2/st0x-site/project/src2/Home.jsx` — the app-home prototype: typewriter hero, `SwapCard` (quick-trade + ambient chart), `SaveEarnCard` band, `HomeTable`, `WhySection`, `PioneersFooter`.
- `design-ref/handoff-2/st0x-site/project/src2/HomeMarketing.jsx` — the longer marketing story (StatStrip, MoatSection, WhySection, ClosingCTA, PioneersFooter). Our page does NOT use most of these; `WhySection` (the pillars band) and `PioneersFooter` are the shared pieces.
- Atoms: `src2/atoms.jsx` (`Icon`, `TokenDisc`, `Sparkline`, `ApyChip`, `CountUp`, `AssetDisc`).
- Rendered target: `screenshots/home-band.png` (Home.jsx in browser-chrome) is the closest authoritative render of OUR home. `home2.png`/`home-mid.png` show an alternate "Trade the market. Earn on the rest." marketing hero — see note P-EXTRA.

Our files: `src/routes/(main)/+page.svelte`, `src/lib/components/QuickTrade.svelte`, `src/lib/components/earn/{SaveEarnCard,QuickTradeChart,IdleUsdcNudge,TokenDisc,EarnIcon,ApyChip,Sparkline,CountUp}.svelte`, `src/lib/components/ui/TokenDisplay.svelte`.

---

## P0 — Structural / obvious

### Hero accent color is YELLOW; mock is MINT/EMERALD (whole-page theme drift)
- [ ] **What's wrong now:** Our hero typewriter word uses `text-accent` (mint var) — fine — but the rest of the home page renders **yellow** as the live accent: the QuickTrade primary button, the QuickTrade ambient chart line/area (`stroke="#eab308"`, `bg-yellow-400` ping dot in `QuickTradeChart.svelte` lines 115-130, 163-165), and the "My Wallet"/CTA chrome (see `.playwright-mcp/ours/home-dark.png` / `home-light.png` — yellow swap card + yellow chart). The mock Home.jsx uses **yellow only for the single typewriter word** (`text-yellow-400`, Home.jsx:22-23) and **mint/emerald everywhere else**.
- [ ] **Mock target:** `Home.jsx` SwapCard primary button = `bg-gradient-to-b from-emerald-300 to-emerald-400 ... text-[#053124]` (line 133). `LivePriceChart` line/area = `#2de3a6` mint with `bg-emerald-400` ping dot (Home.jsx:64-69, 87). Only `HomeHeadline` highlight word is `text-yellow-400` (Home.jsx:22).
- [ ] **Fix:** In `QuickTradeChart.svelte` change the chart gradient + stroke from `#eab308` to mint `#2de3a6` (or `var(--accent)`) and the live-dot from `bg-yellow-400` to `bg-emerald-400`. In `QuickTrade.svelte` the primary `Button variant="primary"` is rendering yellow — confirm `Button`'s primary maps to mint, not amber/yellow, on this page. Per the brief: Buy/positive = mint; yellow is NOT a brand accent. Keep the typewriter word mint (`text-accent`) — note the mock used literal `text-yellow-400` for that one word, but the brief mandates mint accent, so `text-accent` is correct; the real drift is the yellow chart + button.

### QuickTrade right-hand chart panel: line color, "Live market" label, token disc
- [ ] **What's wrong now:** `QuickTradeChart.svelte` uses yellow `#eab308` everywhere (lines 115-130, 163-166) and label `Live market` / `Live on-chain price`. The token badge uses `<img src={token.logoUrl}>` (line 134).
- [ ] **Mock target:** `Home.jsx` LivePriceChart: mint `#2de3a6` gradient (`swapchart` stop 0% opacity .22 → 100% opacity 0) + 2px mint stroke (lines 62-69); bottom-left live row reads `Live market · 50+ equities` with mint ping dot (line 86-89); top-left uses `<TokenDisc token="tsgov" size={30} />` (mint disc, bank glyph) + `tNVDA` / `NVIDIA · tokenised` subtitle (lines 73-79); change pill `bg-emerald-400/15 text-emerald-300` (line 82).
- [ ] **Fix:** Recolor to mint as above. Keep real logo img (we have live data — acceptable per brief). Change ping dot to `bg-emerald-400`. The change-pill up state is already `bg-emerald-400/15 text-emerald-300` (correct); just fix the line/area/dot from yellow → mint.

### SaveEarnCard gradient uses `via-gray-900 to-gray-950` instead of the dark-teal mock stops
- [ ] **What's wrong now:** `SaveEarnCard.svelte:17` → `bg-gradient-to-br from-emerald-500/[0.10] via-gray-900 to-gray-950`. `via-gray-900`/`to-gray-950` are neutral greys.
- [ ] **Mock target:** `Home.jsx:157` → `from-emerald-500/[0.10] via-[#0b1712] to-[#0b0f17]` — the `via` stop is a dark **teal-tinted** `#0b1712`, `to` is near-black blue `#0b0f17`. This gives the card its green-tinted glow, not a grey fade.
- [ ] **Fix:** Replace `via-gray-900 to-gray-950` with `via-[#0b1712] to-[#0b0f17]` (literal hex, theme-stable). Keep the `bg-emerald-400/15 blur-3xl` glow (already present, line 20 — correct).

### Trust/pillars band: hand-rolled SVG icons must be replaced with the mock `Icon` set; wrong glyphs + wrong container shape/size
- [ ] **What's wrong now:** `+page.svelte:220-343` renders three pillars with **bespoke inline SVGs**: a globe/orbit ("Decentralised", lines 227-239), a custom swap+building+ETH-diamond composite ("Liquid", lines 256-301), and layered-circles-with-$ ("1:1 Collateralised", lines 318-333). Each sits in a **circular** `rounded-full bg-accent-soft` disc `h-12 w-12 sm:h-20 sm:w-20`. Layout is `grid-cols-3` always (3-up even on mobile).
- [ ] **Mock target:** `WhySection` (HomeMarketing.jsx:45-62, also imported into Home.jsx via `WhySection`). Each pillar uses the shared `Icon` component: `<Icon name={p.icon} className="h-7 w-7" />` inside a **rounded-square** `rounded-2xl bg-emerald-400/[0.08] text-emerald-300` tile `h-14 w-14` (line 55). Icons come from `HOME_PILLARS` (data.jsx:278-291): `unlock` (Decentralised), `swap` (Liquid), `shield` (1:1 Collateralised). Grid is `grid gap-8 sm:grid-cols-3` (single column on mobile, not 3-up). Section is preceded by an eyebrow + heading block (see next item).
- [ ] **Fix:** Replace the three inline SVGs with `EarnIcon` (`src/lib/components/earn/EarnIcon.svelte`) — it already has `unlock`, `shield`, and `swap` is the one glyph MISSING (EarnIcon supports shield/unlock/bolt/bank/sprout/check/close/info/plus/minus/clock/wallet/arrowRight/arrowUpRight/arrowDown/chevronDown/trendUp but NOT `swap`). Add the `swap` path `d="M7 8h11l-3-3M17 16H6l3 3"` (atoms.jsx:32) to EarnIcon (or the new `ui/Icon.svelte`). Change each pillar container from circular `rounded-full ... h-12 w-12 sm:h-20 sm:w-20` to square `rounded-2xl bg-emerald-400/[0.08] h-14 w-14` with `<EarnIcon name="..." className="h-7 w-7" />`. Map icons: Decentralised→`unlock`, Liquid→`swap`, 1:1 Collateralised→`shield`. Change mobile layout from `grid-cols-3` to `grid gap-8 sm:grid-cols-3` so it stacks on small screens.

### Pillars band is missing its eyebrow + section heading ("Why st0x")
- [ ] **What's wrong now:** `+page.svelte` jumps straight from the SaveEarnCard into the bare 3-up pillar grid (line 220). No "Why st0x" eyebrow, no section title.
- [ ] **Mock target:** `WhySection` header block (HomeMarketing.jsx:48-51): centered `text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/70` eyebrow "Why st0x", then `mt-3 text-2xl font-bold tracking-tight text-white sm:text-[32px]` heading "Tokenised equities & yield, done properly." Pillar grid is `mt-10`.
- [ ] **Fix:** Add the eyebrow + heading block above the pillar grid using the exact classes. Eyebrow: `text-xs font-semibold uppercase tracking-[0.2em] text-accent/70` (or literal `text-emerald-400/70`). Heading `text-2xl ... sm:text-[32px]` in `font-display`/bold `text-text`.

### Pillar body copy missing on mobile
- [ ] **What's wrong now:** Each pillar `<p>` is `hidden ... sm:block` (`+page.svelte:245,307,339`) — body text disappears on mobile.
- [ ] **Mock target:** `WhySection` (HomeMarketing.jsx:57) always shows the body `text-[13.5px] leading-relaxed text-gray-400 max-w-[17rem]`, centered.
- [ ] **Fix:** Remove the `hidden ... sm:block` so body always shows; set body to `text-[13.5px] leading-relaxed text-text-2 max-w-[17rem] mt-2` and center (`items-center text-center` on the pillar wrapper, matching mock line 54).

### Token table: "Bridged On-Chain" column is extra vs mock; mock has TVL + Holders only
- [ ] **What's wrong now:** `+page.svelte:386-397` renders **four** desktop columns after Token/Price: `TVL`, `Bridged On-Chain`, `Holders` (plus we compute marketCap as "TVL"). Mock has only `TVL` and `Holders`.
- [ ] **Mock target:** `HomeTable` (Home.jsx:227-234): columns are `Token`, `Price`, `TVL` (hidden sm:table-cell), `Holders` (hidden sm:table-cell), and an empty action column. No "Bridged On-Chain" column.
- [ ] **Fix:** This is a real-data column we add — per brief, do NOT delete real functionality. Flag as intentional drift but consider hiding "Bridged On-Chain" to match the cleaner mock, or keep if product wants it. At minimum, the header label styling must match (see next).

### Token table header styling differs (font-size / tracking / color)
- [ ] **What's wrong now:** Headers use `text-xs font-medium text-text-3` with `px-3 py-3 sm:px-5 sm:py-4` (`+page.svelte:379-398`).
- [ ] **Mock target:** `HomeTable` thead (Home.jsx:228-233): `text-[11px] uppercase tracking-wider text-gray-500` (i.e. `text-text-3`), cells `px-5 py-3 font-medium`. Note the **uppercase + tracking-wider + 11px**.
- [ ] **Fix:** Add `uppercase tracking-wider` and set size to `text-[11px]` on the `<th>` cells; reduce vertical padding to `py-3` (mock uses py-3, we use sm:py-4).

### Token disc in table: mock uses `TokenDisc` (mint/blue brand discs), we use logo `<img>`
- [ ] **What's wrong now:** Table rows render `<TokenDisplay logoUrl=... />` → a real logo `<img>` (`+page.svelte:436`, TokenDisplay.svelte:38). SGOV row uses the same generic logo.
- [ ] **Mock target:** `HomeTable` (Home.jsx:242): `<TokenDisc token={a.tag === 'earn' ? 'wtsgov' : 'usdc'} size={32} />` — but note that's prototype shorthand (every non-earn row shows a USDC disc in the static mock, which is wrong for a real app). The intent: SGOV/earn row = the mint **bank-glyph** disc with subtle ring; equity rows = brand-colored `AssetDisc` initials (atoms.jsx AssetDisc, lines 140-155 — gradient by symbol, white initials).
- [ ] **Fix:** Keep real logos for equities (we have them — acceptable per brief). For the **SGOV/earn row specifically**, the mock signature is the mint disc with `ring`. Either keep the real SGOV logo or, to match the mock's earn-row treatment, render `<TokenDisc token="wtsgov" size={32} ring />` for the SGOV row. Lower priority than the row tint/Earn-CTA which are already present.

---

## P1 — Important

### Hero subhead / supporting copy missing
- [ ] **What's wrong now:** `+page.svelte` hero (lines 184-191) is just the `<h1>` typewriter, then straight into QuickTrade. No supporting paragraph, no eyebrow.
- [ ] **Mock target:** The Home.jsx prototype hero (`HomeHeadline`, lines 19-26) is also headline-only — so our minimal hero matches Home.jsx. BUT the rendered `home2.png`/`home-mid.png` show a fuller marketing hero with an eyebrow (`TOKENIZED MARKETS · BASE MAINNET`), a two-line display headline ("Trade the market. / Earn on the rest."), a 3-line subparagraph, and three CTAs (Start trading / Open dashboard / 3.53% APY · live pill). See P-EXTRA below — confirm which hero is canonical with design.
- [ ] **Fix:** If Home.jsx is canonical, our hero is correct (headline only). If `home2.png` is canonical, this is a large rebuild — defer to a decision. Flagging, not fixing.

### QuickTrade card: "Quick trade" / "Base · USDC" header row missing
- [ ] **What's wrong now:** `QuickTrade.svelte` card (line 838+) opens directly with the USDC input row. No small header row.
- [ ] **Mock target:** `SwapCard` (Home.jsx:100-102): `mb-4 flex items-center justify-between text-xs text-gray-400` with `Quick trade` on the left and `Base · USDC` on the right.
- [ ] **Fix:** Add a header row at the top of the left column: `<div class="mb-4 flex items-center justify-between text-xs text-text-2"><span>Quick trade</span><span>Base · USDC</span></div>`.

### QuickTrade input rows: bg + radius differ from mock
- [ ] **What's wrong now:** Input rows use `rounded-xl border border-line bg-surface-2 px-4 py-3` (`QuickTrade.svelte:844,931`) and the token pill is `bg-surface-3` (lines 845,937).
- [ ] **Mock target:** `SwapCard` pay/receive rows (Home.jsx:105,120): `rounded-xl border border-white/10 bg-black/30 px-3.5 py-3.5`; token pill `rounded-full bg-white/5 px-2 py-1.5` (lines 106,121) — note **rounded-full** pill (we use `rounded-lg`) and **black/30** row bg (darker than our surface-2).
- [ ] **Fix:** Optional polish — set input rows to `bg-black/30` (or `bg-bg-deep`) and token pills to `rounded-full bg-white/5` for the mock's inset look. Keep `border-line`.

### QuickTrade swap pivot button: mock overlaps rows (-my-3) with `arrowDown` glyph
- [ ] **What's wrong now:** Direction toggle is a standalone centered button `rounded-full border border-line bg-surface-2 p-2` with a custom down-double-arrow SVG (`QuickTrade.svelte:906-927`). It sits between rows with normal spacing, not overlapping.
- [ ] **Mock target:** `SwapCard` pivot (Home.jsx:113-117): `z-10 -my-3 flex justify-center` with a `h-9 w-9 rounded-full border border-white/10 bg-[#0c1118]` disc containing `<Icon name="arrowDown" className="h-4 w-4" />` — it visually overlaps the two rows (negative margin) like a Uniswap swap pivot.
- [ ] **Fix:** Wrap the toggle in `z-10 -my-3 flex justify-center`, set disc to `h-9 w-9 rounded-full border border-line bg-surface-1`, and swap the bespoke arrow for `EarnIcon name="arrowDown"` (already in EarnIcon). (Functionally it still flips buy/sell — keep the handler.)

### QuickTrade "Launch Trading Terminal" secondary button + "or" divider missing
- [ ] **What's wrong now:** Our "Launch Trading Terminal" button lives **outside** the QuickTrade card (`+page.svelte:198-204`) as a separate full-width button; there's no "or" divider inside the card.
- [ ] **Mock target:** `SwapCard` (Home.jsx:138-143): inside the card, an `or` divider (`my-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-gray-600` with two `h-px flex-1 bg-white/10` rules) then a secondary `Launch Trading Terminal` button `rounded-xl border border-white/15 bg-white/[0.04] py-3 text-sm font-semibold text-white`.
- [ ] **Fix:** Move the "Launch Trading Terminal" button inside the QuickTrade card's left column, below the primary button, preceded by the "or" divider. Our current external button styling (`border-line-strong bg-surface-2`) is close; align to `bg-white/[0.04] border-white/15`.

### "Trading on Base Mainnet" indicator: mock uses a colored square, ours uses BASE.svg
- [ ] **What's wrong now:** `QuickTrade.svelte:1078-1082`: `Trading on [BASE.svg img] Base`.
- [ ] **Mock target:** `SwapCard` (Home.jsx:128-130): `Trading on [3×3 rounded square, background #7d8bff] Base Mainnet`. Iris/periwinkle square, not a logo.
- [ ] **Fix:** Low priority — keeping the real BASE.svg is fine/better. If matching exactly: replace with `<span class="inline-block h-3 w-3 rounded-[3px]" style="background:#7d8bff"></span>` and label "Base Mainnet". Recommend keeping BASE.svg.

### SaveEarnCard placement: mock stacks it as an equal-weight peer below the swap card (full width); ours is constrained
- [ ] **What's wrong now:** `+page.svelte:215-217` wraps SaveEarnCard in `max-w-md md:max-w-3xl` and it's nested in the centered hero block. The hero column is `text-center` so the card inherits centered context.
- [ ] **Mock target:** `ProductPair` (Home.jsx:205-211): `section mx-auto max-w-5xl space-y-5 px-6` — SwapCard and SaveEarnCard are **stacked, equal width, full max-w-5xl**, left-aligned content. Note `space-y-5` gap between the two cards.
- [ ] **Fix:** The two product cards (QuickTrade + SaveEarnCard) should share the same `max-w-3xl`/`max-w-5xl` container with `space-y-5`, both full-width within it, not one `max-w-md` and one wider. Currently QuickTrade is `max-w-md md:max-w-3xl` (QuickTrade.svelte:839) and SaveEarnCard wrapper is `max-w-md md:max-w-3xl` — make them consistent and remove the extra centering wrapper so they read as a stacked pair.

### SaveEarnCard "How it works" secondary button border token
- [ ] **What's wrong now:** `SaveEarnCard.svelte:58` uses `border border-line-strong ... text-text-2 hover:bg-surface-2`.
- [ ] **Mock target:** `Home.jsx:177`: `rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-gray-200 hover:bg-white/5`.
- [ ] **Fix:** Minor — `border-line-strong` ≈ `border-white/15` is acceptable; hover `bg-surface-2` vs `bg-white/5` is fine. No change required, noted for completeness.

### Eyebrow "SAVE & EARN · SGOV" — `text-emerald-400/70` opacity ok, but verify mint var
- [ ] **What's wrong now:** `SaveEarnCard.svelte:28` uses literal `text-emerald-400/70` — works (mint with opacity). The "New" pill is `bg-emerald-400/20 text-emerald-300` (line 24-25) — matches mock (Home.jsx:161).
- [ ] **Fix:** No change — this section is faithful to the mock. ✓

---

## P2 — Polish

### "More equities coming soon" copy + style
- [ ] **What's wrong now:** `+page.svelte:516` → `mt-6 text-center text-base text-text-2` "More equities coming soon!" (exclamation, text-base).
- [ ] **Mock target:** `HomeTable` (Home.jsx:264): `mt-5 text-center text-sm text-gray-500` "More equities coming soon" (no exclamation, text-sm, text-text-3).
- [ ] **Fix:** Change to `mt-5 text-sm text-text-3`, drop the exclamation mark.

### Table container bg / border radius
- [ ] **What's wrong now:** `+page.svelte:375` table wrapper `overflow-hidden rounded-xl` (relies on `Table` component for border/bg).
- [ ] **Mock target:** `HomeTable` (Home.jsx:225): `overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]`. Subtle 2%-white fill + 1px line border.
- [ ] **Fix:** Ensure the wrapper has `border border-line bg-surface-1/40` (≈ `bg-white/[0.02]`). Verify `Table.svelte` already applies a border; if not, add it.

### Row hover/earn-tint — already correct, verify
- [ ] **What's right:** `+page.svelte:421-424` row uses `isSgov(...) ? 'bg-emerald-400/[0.04] hover:bg-emerald-400/[0.08]' : 'hover:bg-surface-2'` and the Earn-row CTA `Earn →` in `text-emerald-300` — this **matches** the mock (Home.jsx:239,255-256). ✓ The non-earn action chevron `text-text-muted` matches mock `text-gray-600`. ✓ ApyChip on SGOV row matches (Home.jsx:245). ✓
- [ ] **Fix:** The mock's Earn arrow uses `Icon name="arrowRight"` (the long → glyph, `M5 12h14M13 6l6 6-6 6`), ours uses a chevron `M9 5l7 7-7 7` (`+page.svelte:484-490, 499-505`). Swap both action-column SVGs for `EarnIcon name="arrowRight"` to match the long-arrow glyph.

### Pioneers footer — heading copy + size
- [ ] **What's wrong now:** `+page.svelte:347` "Built by pioneers from" `text-xs ... sm:text-sm text-text-2`; logos are real `<img>` (Holo/Microsoft/Nasdaq/NYSE/ICE) at `h-4 sm:h-6`.
- [ ] **Mock target:** `PioneersFooter` (HomeMarketing.jsx:99-112): `text-[13px] font-medium text-gray-500` heading; wordmarks are styled **text** (not images) at `text-[19px] font-semibold tracking-wide text-gray-500 grayscale` with HOLO in mono. `gap-x-10 gap-y-5`, `mt-5`.
- [ ] **Fix:** Real logo images are acceptable/better than the mock's text wordmarks — keep them. Align heading to `text-[13px] text-text-3` and the row gap to `gap-x-10 gap-y-5`. Low priority.

### IdleUsdcNudge — not present in mock; intentional real feature
- [ ] **What's wrong now:** `QuickTrade.svelte:1168-1171` renders `IdleUsdcNudge` below the action button when the user holds USDC and the selected token isn't SGOV. No mock equivalent.
- [ ] **Fix:** Real conversion feature — keep. No drift to fix; flagged so it isn't mistaken for an extra element. The mock's equivalent nudge lives in the SaveEarnCard band. ✓

---

## P-EXTRA — Decision needed: which hero is canonical?

`home2.png` and `home-mid.png` render a **different** marketing hero than `Home.jsx`:
- Eyebrow: `TOKENIZED MARKETS · BASE MAINNET` (mono, mint, uppercase, wide tracking)
- Display headline (two lines, large `font-display`): "Trade the market." / "Earn on the **rest**." (last word mint)
- Subparagraph (3 lines, `text-gray-300/400`): "Buy tokenized equities — NVIDIA, Tesla, Coinbase — settled onchain in seconds. Idle dollars between trades earn 3.53%, Treasury-backed and redeemable 24/7. No KYC."
- Three CTAs in a row: mint **Start trading →** (filled), **Open dashboard** (outline), and a `3.53% APY · live` pill (mint, mono, ping dot).

This hero is NOT in `Home.jsx` (which is the typewriter "Tokenised Equities. {word}|" hero our app implements). It is also not in `HomeMarketing.jsx` (that file's hero is the StatStrip/Moat story). It appears to be a newer canonical landing hero.

- [ ] **Decision required:** Confirm with design whether the canonical home hero is (a) the typewriter "Tokenised Equities." hero (Home.jsx — what we have, just needs the yellow→mint accent fix), or (b) the "Trade the market. Earn on the rest." hero in `home2.png`. If (b), this is a hero rebuild: add the mono eyebrow, two-line display headline with mint last word, supporting paragraph, and the three-CTA row (Start trading / Open dashboard / APY pill). Do not silently change — flag for product/design.

---

## Summary of "already correct" (no action)
- SaveEarnCard structure, "New" pill, eyebrow, headline, body copy, CTA buttons, idle-vs-SGOV proof card (Sparkline + CountUp + TokenDisc), divider — all faithful to Home.jsx SaveEarnCard. Only the gradient `via/to` stops (P0) and minor border tokens drift.
- ApyChip component matches atoms.jsx ApyChip exactly (mint pill, ping dot, `X.XX% APY`).
- Table earn-row tint, ApyChip on SGOV, "Earn →" CTA, SGOV pinned to top (sort) — all match.
- TokenDisc / Sparkline / CountUp / EarnIcon ports are faithful; EarnIcon only missing the `swap` glyph (P0 pillars fix).
