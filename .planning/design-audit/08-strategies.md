# Design-fidelity audit — Strategies page (`/strategies`)

## Scope & important framing

Our `/strategies` route is the **real Rainlang strategy-deployment UI**: a segmented
selector (Portfolio Strategy / Market Making) over two builder components —
`FolioStrategy.svelte` (7-token portfolio) and `ActiveLiquidity.svelte` (DSF / market-making
DCA). This is live, functional, and has no equivalent in the static mock.

The assigned mock `src2/Strategy.jsx` is **not an order/strategy builder** — it is a
UX/product **design dossier** (Cover, Insight, JourneyMap, SellingPoints, SurfaceMap) for a
hypothetical "Save & Earn" SGOV product. It shares **no screen** with our builder. Therefore
there is no pixel target; the visual target is derived from:
- the mock's **shared design language** (`SectionLabel` eyebrows, card treatment, `Icon` set,
  pill/chip vocabulary in `Strategy.jsx`), and
- the **field / segmented / card / button vocabulary** in `screenshots/v2-trade-full.png`
  (same components our trade panel should match).

All findings below are **presentational only**. Do NOT touch the binding logic, the 7×token
state, deploy handlers, validation, or vault-ID plumbing.

Files in scope:
- `src/routes/(main)/strategies/+page.svelte` (header gate, warning banner, segmented selector, outer card)
- `src/lib/components/orders/FolioStrategy.svelte`
- `src/lib/components/orders/ActiveLiquidity.svelte`
- `src/lib/components/TokenSelect.svelte`
- `src/lib/components/ui/Input.svelte`, `TradeAmountInput.svelte`
- `src/lib/styles/utils.ts` (`containerStyles`)

---

## P0 — Structural / obvious

### [ ] P0-1 — `containerStyles.cardBordered` uses hardcoded gray, not surface/line tokens
**Now:** `src/lib/styles/utils.ts:30` — `cardBordered: 'rounded-lg border border-white/10 bg-gray-800/50 p-4'`.
Both builders wrap their Prices card and Order-Summary card in `containerStyles.cardBordered`
(`FolioStrategy.svelte:455,544`; `ActiveLiquidity.svelte:340,372`). `bg-gray-800/50` is a flat
slate that does not theme-flip and reads colder/greyer than the mock's surfaces. Mock cards are
`bg-white/[0.025]` over `bg-surface-*` with `border-white/10`, and our token system maps
`bg-[#111a25]`→`bg-surface-2`, `border-white/[0.06]`→`border-line`.
**Mock target:** `Strategy.jsx:46,77,102` — card = `rounded-2xl border border-white/10 bg-white/[0.025] p-5`.
**Fix:** Change `cardBordered` to `'rounded-lg border border-line bg-surface-2 p-4'` (or
`rounded-xl` to match the `rounded-2xl`/`rounded-xl` family). Also bump radius — see P1-7.
This is shared, so it fixes every summary/price card at once. Verify no other page depends on
the gray look.

### [ ] P0-2 — Section labels are plain `<h3>`/`<h4>`, missing the mock eyebrow (`SectionLabel`) treatment
**Now:** Inside the builders the only section headers are `<h3 class="mb-4 text-lg font-semibold">Select Tokens</h3>`
(`FolioStrategy.svelte:208`) and `<h4 class="mb-3 text-sm font-medium text-text-2">` for Prices /
Order Summary (`FolioStrategy.svelte:456,545`; `ActiveLiquidity.svelte:341,373`). There is no
numbered eyebrow + uppercase tracked label + hairline rule.
**Mock target:** `Strategy.jsx:59-66` `SectionLabel`:
```
<div className="flex items-center gap-3">
  <span className="font-mono text-sm text-emerald-400/70">{n}</span>
  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">{label}</span>
  <span className="h-px flex-1 bg-white/[0.08]"></span>
</div>
```
**Fix:** Promote the card titles ("Prices", "...Order Summary", "Select Tokens", "Advanced
Options") to this eyebrow style: `text-xs font-semibold uppercase tracking-[0.2em] text-text-2`
(optionally with a mono index and a `h-px flex-1 bg-line` rule). At minimum apply
`uppercase tracking-[0.2em]` + `text-text-2` so the headers match the mock's section vocabulary
instead of generic bold sentence-case.

### [ ] P0-3 — Login-gate icon is a custom flowbite-style lock glyph, not the mock `Icon` lock/unlock
**Now:** `+page.svelte:69-81` — inline `<svg viewBox="0 0 24 24" stroke-width="2">` with a
padlock path, wrapped in `bg-gradient-to-br from-blue-600/20 to-purple-700/20` and colored
`text-blue-400`. Visible in `ours/strategies-dark.png` as a blue/purple gradient lock badge.
This is off-brand: blue→purple gradient + blue icon, vs the mock's mint "earning" signature and
1.6-stroke icon set.
**Mock target:** `atoms.jsx:29` `lock` path (or `:14` `unlock`), rendered at stroke 1.6,
`currentColor`. Mock icon badges are `flex h-9 w-9 items-center justify-center rounded-lg
bg-emerald-400/10 text-emerald-300` (`Strategy.jsx:79,103,142`).
**Fix:** Replace the inline svg with `<Icon name="lock" class="h-12 w-12" />` from the new
`src/lib/components/ui/Icon.svelte`. Swap the blue/purple gradient badge for the mint badge:
`bg-accent-soft text-accent` (or `bg-emerald-400/10 text-emerald-300`). Drop `text-blue-400`.

### [ ] P0-4 — Warning banner uses red; brief mandates **amber** for warnings
**Now:** `+page.svelte:99-122` — "Warning: Experimental Strategies" banner is
`border-red-500/50 bg-red-500/15`, icon `text-red-400`, title `text-red-400`, body
`text-red-300/90`. Red is reserved for Sell/negative per the brief; warnings must be amber.
**Mock target:** Brief "Conventions" — warnings = **amber** (not yellow, not red). Mock info/
caution blocks use the `info` icon at stroke 1.6.
**Fix:** Recolor to amber: `border-amber-500/40 bg-amber-500/10`, icon/title `text-amber-400`,
body `text-amber-300/90`. Replace the inline triangle-alert svg (`+page.svelte:101-113`) with
`<Icon name="info" class="h-5 w-5" />` (mock has no warning-triangle glyph; `info` is the
closest in the set). Keep the warning copy/logic intact.

### [ ] P0-5 — `TokenSelect` selected-row highlight uses blue→purple gradient (off-brand)
**Now:** `TokenSelect.svelte:74` — the active option is
`bg-gradient-to-r from-blue-600/20 to-purple-700/20`, and hover is `hover:bg-gray-700/70`
(`:73`). Mock selection accents are mint, never blue/purple, and hover surfaces are neutral
`surface` tokens.
**Mock target:** Mock active/hover states use `hover:border-emerald-400/30
hover:bg-emerald-400/[0.05]` and active fills `bg-emerald-400/[0.06]` (`Strategy.jsx:113,141`).
**Fix:** Active option → `bg-accent-soft text-accent` (or `bg-emerald-400/[0.06]`). Hover →
`hover:bg-surface-2`. Remove the gradient entirely. This component is shared with trade, so the
fix propagates.

### [ ] P0-6 — Advanced-options toggle is a blue iOS switch, not the mock accent
**Now:** `FolioStrategy.svelte:247-256` and `ActiveLiquidity.svelte:248-257` — toggle track is
`bg-blue-500` when on / `bg-gray-600` when off, knob `bg-white`. Blue is the link color, not the
accent; mock "on" states are mint.
**Mock target:** Mock active controls use `bg-emerald-400/…` / `text-emerald-300`. Our token for
the accent fill is `bg-accent`.
**Fix:** On-state track → `bg-accent` (mint), off-state → `bg-surface-3` (or keep `bg-gray-600`
→ `bg-line-strong`). Knob stays white. Apply to both builders identically.

---

## P1 — Important

### [ ] P1-1 — Fast-Exit checkboxes use `text-blue-500` accent
**Now:** `ActiveLiquidity.svelte:162,170` — `<input type="checkbox" class="… text-blue-500">`.
Blue accent is off-brand for a positive/selected control.
**Mock target:** Selected/checked = mint (`emerald-300/400`).
**Fix:** `text-blue-500` → `text-accent` (mint). Keep `border-line bg-surface-3`.

### [ ] P1-2 — Deploy button is correct primary; verify glow matches mock CTA
**Now:** Both builders use `<Button variant="primary" size="lg" fullWidth>` (`FolioStrategy.svelte:628`,
`ActiveLiquidity.svelte:434`). `Button.svelte:12-13` primary = mint gradient
`from-accent-bright to-accent` with `shadow-[0_10px_30px_-10px_var(--accent-glow)]`. This is on-brand and
matches the mock's mint CTA — **no change needed**, just confirming. The text "Deploy Order" is fine.

### [ ] P1-3 — Input fields: surface + radius are close but lighter than the mock fields
**Now:** `Input.svelte:56` field wrapper = `bg-surface-3/50 rounded-lg border border-line
focus-within:border-accent-line`. `TokenSelect.svelte:44` = `bg-surface-3 … rounded-lg border
border-line hover:border-accent-line focus:border-accent-line`. These are already token-based
and on-brand. The `/50` opacity on `bg-surface-3` makes the amount field read slightly washed-out
vs the solid token-select. **Minor.**
**Mock target:** v2-trade fields are solid filled inputs with `rounded-lg`/`rounded-xl`, a clear
border, mint focus ring.
**Fix (polish):** Drop the `/50` so `Input.svelte` uses solid `bg-surface-3` to match
`TokenSelect`. Low risk, improves consistency across the two field types.

### [ ] P1-4 — Segmented strategy selector: container OK, but inactive labels lack the mock pill density
**Now:** `+page.svelte:124-142` — container `bg-surface-2 p-1 rounded-lg`, each tab is a
`Button variant="ghost"` with active `bg-accent-soft text-accent` / inactive
`text-text-2 hover:text-text`. This is structurally the right segmented pattern and the active
mint pill is correct. Inactive tabs render as full-width ghost buttons with a `border border-line`
coming from `Button` ghost variant (`Button.svelte:16`), which adds an unwanted border inside the
segmented track.
**Mock target:** v2-trade segmented controls (e.g. 1H/1D/1W/1M/YTD and Buy/Sell) are borderless
pills inside a single track; only the active pill has a fill.
**Fix:** Pass a class to suppress the ghost border inside the track (the segmented buttons should
be `border-transparent`), so inactive tabs are plain text and only the active tab shows the
`bg-accent-soft` fill. Container radius `rounded-lg` is fine.

### [ ] P1-5 — Outer builder card radius/border OK; background token mismatch with inner cards
**Now:** `+page.svelte:144` — outer wrapper `rounded-2xl border border-line bg-surface-2 p-3
backdrop-blur-sm sm:p-6`. Good: token-based, `rounded-2xl`, `border-line`. But inner cards use
`containerStyles.cardBordered` (`bg-gray-800/50`, P0-1), so inner cards are a *different* grey
family than the `surface-2` parent — they don't nest cleanly.
**Mock target:** Nested cards step surfaces consistently (`bg-white/[0.025]` over the section bg).
**Fix:** Resolving P0-1 (cardBordered → `bg-surface-2`/`bg-surface-3` + `border-line`) makes inner
cards nest correctly inside the `surface-2` parent. Consider inner = `bg-surface-3` so it reads as
a raised tier above the `surface-2` shell.

### [ ] P1-6 — Prices table headers are plain; lack mono-numeric / uppercase-eyebrow treatment
**Now:** `FolioStrategy.svelte:459-465` / `ActiveLiquidity.svelte:351-357` — `<th class="px-2 py-1
text-left/right">Token / Oracle Price / Price Certainty / Off-chain</th>` in default text. Numeric
cells (via `PythOracleRow`) should be mono per the brief; headers should read as small caps.
**Mock target:** Brief — numerics are mono; small section/column labels are uppercase tracked
`text-gray-500`/`text-text-3`. Mock price/figure rows use `font-mono` (`Strategy.jsx:49,51`).
**Fix:** Add `text-[11px] font-medium uppercase tracking-wide text-text-3` to the `<th>`s. Confirm
`PythOracleRow` numeric cells use `font-mono tabular-nums` (audit that component separately if not).

### [ ] P1-7 — Card radius is `rounded-lg` where mock uses `rounded-2xl`/`rounded-xl`
**Now:** `containerStyles.cardBordered` = `rounded-lg`. Inner Prices/Summary cards therefore have
a tighter 8px radius than the mock card family.
**Mock target:** `Strategy.jsx` cards = `rounded-2xl` (sections) / `rounded-xl` (list rows). The
outer builder card already uses `rounded-2xl`.
**Fix:** Bump `cardBordered` to `rounded-xl` (12px) so inner cards sit in the mock's radius family
without over-rounding small cards.

---

## P2 — Polish

### [ ] P2-1 — Order-Summary rows could use mono numerics + a divider above the total tier
**Now:** Summary rows (`FolioStrategy.svelte:546-625`, `ActiveLiquidity.svelte:374-431`) are
`flex justify-between text-sm` with `font-medium text-text` values. Token amounts/ratios are
numeric but render in the sans body font.
**Mock target:** Numerics are `font-mono` (`Strategy.jsx:49,51` use `font-mono … text-xl`).
**Fix:** Add `font-mono tabular-nums` to the value `<span>`s holding amounts/ratios (symbols can
stay sans). Optional: add a `border-t border-line pt-2` above the deposit-amount group to separate
config from amounts, matching the mock's grouped card rows.

### [ ] P2-2 — "Advanced Options" panel header is sentence-case, not eyebrow
**Now:** `FolioStrategy.svelte:261` / `ActiveLiquidity.svelte:263` —
`<h4 class="text-sm font-medium text-text-2">Advanced Options</h4>`.
**Mock target:** `Strategy.jsx:47,99,110` small headers = `text-xs uppercase tracking-wider
text-gray-500` (or `text-sm font-semibold uppercase tracking-wider text-gray-400`).
**Fix:** `text-xs font-semibold uppercase tracking-wider text-text-3`.

### [ ] P2-3 — Field labels are consistent but could match mock label scale
**Now:** Field labels are `text-sm font-medium text-text-2` (e.g. `FolioStrategy.svelte:214`).
Mock inline field labels in the dossier are `text-xs … text-gray-500`. This is minor and our
`text-sm text-text-2` is acceptable; leave as-is unless aligning the whole form to the smaller
label scale used in v2-trade.
**Fix (optional):** Standardize to `text-xs font-medium text-text-3` only if matching v2-trade's
denser field labels; otherwise no change.

### [ ] P2-4 — TokenSelect chevron is a hand-rolled 2-stroke svg, not the mock `chevronDown`
**Now:** `TokenSelect.svelte:53-60` — inline chevron `stroke-width="2"` `d="M19 9l-7 7-7-7"`.
**Mock target:** `atoms.jsx:34` `chevronDown` = `d="M6 9l6 6 6-6"` at stroke 1.6.
**Fix:** Replace with `<Icon name="chevronDown" class="h-5 w-5 transition-transform {isOpen ?
'rotate-180' : ''}" />`. Purely the glyph/stroke weight; keep the rotate logic.

### [ ] P2-5 — TokenSelect dropdown shadow/border tier
**Now:** `TokenSelect.svelte:66` dropdown = `border border-line bg-surface-2 shadow-xl`. Fine, but
`bg-surface-2` matches the page card; a popover should sit a tier higher.
**Fix (optional):** `bg-surface-3` (or keep `surface-2` and rely on `shadow-xl`). Low priority.

### [ ] P2-6 — Token disc / AssetDisc not used in TokenSelect rows
**Now:** `TokenSelect.svelte:48-50,78-80` renders `selected.logoUrl` as a plain `<img>` (or nothing
if no logo). The mock uses `AssetDisc` (gradient initials disc, `atoms.jsx:140`) when there is no
external asset. Our token configs ship real `logoUrl`s, so the img is acceptable — but tokens
without a logo render no disc at all (just text), which looks unfinished.
**Mock target:** `atoms.jsx:140-155` `AssetDisc` — gradient circle with 2-letter initials, mint
disc + `bank` glyph for the savings token.
**Fix (optional):** Fall back to an `AssetDisc`-style gradient initials circle when `logoUrl` is
missing, so every row has a disc. Keep `logoUrl` as the primary path. This is the only place the
mock's `AssetDisc` atom maps onto our builder; low priority since real logos exist.

---

## Notes / non-issues (do not "fix")

- **No 1:1 mock screen exists** for this builder; do not import the dossier's Cover/Insight/
  JourneyMap/SurfaceMap sections — they belong to the "Save & Earn" case study, not the strategy
  builder. Reproduce *vocabulary* (cards, eyebrows, icons, mint accents), not those sections.
- Keep all 7-token state, deploy handlers, validation flags, vault-ID inputs, and the
  Portfolio/Market-Making split exactly as-is.
- Deploy button (P1-2) and the segmented active pill already use the correct mint tokens — only
  the off-brand blue/purple/red accents (P0-3/4/5/6, P1-1) and the grey `cardBordered` (P0-1)
  need correcting.

---

## Summary of highest-impact fixes
1. `containerStyles.cardBordered`: `bg-gray-800/50`→`bg-surface-2`/`surface-3`, `rounded-lg`→`rounded-xl` (P0-1, P1-7).
2. Purge blue/purple gradients: login badge (P0-3), TokenSelect active row (P0-5), advanced toggle (P0-6), fast-exit checkbox (P1-1).
3. Warning banner red → amber + `info` icon (P0-4).
4. Adopt `SectionLabel`/eyebrow treatment for card + section headers (P0-2, P2-2).
5. Swap hand-rolled svgs for the shared `Icon` component (lock, info, chevronDown) (P0-3, P0-4, P2-4).
