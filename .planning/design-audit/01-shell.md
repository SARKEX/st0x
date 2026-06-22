# Design Audit — 01: App shell + shared primitives

Area: header / nav / chrome, buttons, cards, modal frame, theme toggle, ambient background, footer, network selector.

Mock source of truth: `design-ref/handoff-2/st0x-site/project/src2/AppShell.jsx` (Logo, NavLink, EarnPill, Header, Canvas, ProductFrame) and `src2/atoms.jsx` (Icon set). Rendered targets: `screenshots/v2-trade-full.png`, `v2-dashboard.png`, `01-v2-final.png`.

Convention reminders honored below: we KEEP the real st0x logo (not the mock mint-ring `st(o)x`), we KEEP real features the static mock lacks (ThemeToggle, NetworkSelector dropdown, ReferralButton, sidebar, hamburger nav, account dropdown menu). Items flag visual/structural drift only.

Legend: **P0** structural/obvious · **P1** clear visual mismatch · **P2** polish.

---

## A. Header chrome (container, sticky, blur, border)

### A1 — [P0] Header has no background, no border, no blur
- **What's wrong now**: `Header.svelte` line 119 — outer wrapper is `sticky top-0 z-[100] bg-transparent transition-all duration-300`. There is no bottom border and no backdrop blur. On scroll the header floats over content with nothing separating it.
- **Mock target**: `AppShell.jsx` Header (line 65): `sticky top-0 z-40 border-b border-white/[0.06] bg-[#070b11]/80 backdrop-blur-xl`. The header is a defined band: translucent bg, hairline bottom border, blur.
- **Fix**: Change wrapper to `sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl` (use `bg-bg/80` so it theme-flips; `border-line` = `border-white/[0.06]`). Drop `bg-transparent`. Keep the higher z if dropdowns need it, but z-40 matches mock.

### A2 — [P1] Header inner padding differs
- **What's wrong now**: line 120 — `px-3 py-3 sm:px-6 sm:py-5`. Vertical padding grows to `py-5` (20px) at sm.
- **Mock target**: Header inner row (line 66): `px-4 py-3 sm:px-6` — constant `py-3` (12px), `px-4` mobile / `px-6` at sm.
- **Fix**: `px-4 py-3 sm:px-6`. Remove the `sm:py-5` growth.

### A3 — [P1] Logo↔nav gap and group gaps differ
- **What's wrong now**: left group uses `gap-1.5 sm:gap-2 lg:gap-4` (line 122); right group `gap-1.5 sm:gap-2 xl:gap-3` (line 133); nav-item list `gap-1.5 xl:gap-2` (line 135).
- **Mock target**: Header row is `justify-between gap-3` (line 66). Left group `gap-5` (line 67). Right cluster `gap-1.5 sm:gap-2` (line 71). Inner `<nav>` is `gap-1` (line 72).
- **Fix**: Tighten nav-link list to `gap-1` (mock packs Home/Trade/Earn/Metrics with 4px gaps, ours has 6px+). Right cluster `gap-1.5 sm:gap-2`. The mock keeps logo on far left and the whole nav+chip+button cluster on the far right with `justify-between` — ours already does this; just align the gaps.

---

## B. Nav links (NavLink)

### B1 — [P0] Active non-Earn nav pill uses wrong background token
- **What's wrong now**: `Header.svelte` line 179-182 — active link = `bg-surface-3 text-text`; inactive = `text-text-2 hover:bg-surface-2 hover:text-text`.
- **Mock target**: `NavLink` (line 22-28): active (non-accent) = `bg-white/10 text-white`; inactive = `text-gray-300 hover:bg-white/5 hover:text-white`. The active pill is a translucent white wash (`white/10`), not an opaque raised surface.
- **Fix**: active → `bg-white/10 text-text` (or `bg-surface-3`/`bg-text/10` equivalent; mock literally wants `white/10`). Inactive → `text-text-2 hover:bg-white/5 hover:text-text`. Use `hover:bg-white/5` rather than `hover:bg-surface-2` to match the lighter hover wash.

### B2 — [P1] Nav link padding/shape correct but verify font
- **What's wrong now**: line 179 — `rounded-lg px-3 py-2 text-sm font-medium`. This matches.
- **Mock target**: `NavLink` (line 22): `rounded-lg px-3 py-2 text-sm font-medium transition-colors`. ✓ match.
- **Fix**: none — keep. (Noted to confirm no regression.)

### B3 — [P1] Nav order: Earn pill is in the wrong position
- **What's wrong now**: `NAV_ITEMS` (lines 52-69) order is **Trade, Earn, Strategies, Platform Metrics**. The Earn pill renders 2nd. We also have extra items (Strategies/Platform Metrics) which are real features — keep them.
- **Mock target**: Header nav (lines 73-76) order is **Home, Trade, Earn (pill), Metrics**. Earn sits between Trade and Metrics; there is no "Home" nav item in ours (the logo is Home).
- **Fix**: Keep our real items, but order them **Trade, Earn (pill), then Strategies/Platform-Metrics** so the Earn pill sits immediately after Trade (matching the mock's Trade→Earn adjacency). Currently Earn is already 2nd after Trade — ✓ adjacency is fine; just confirm Strategies/Metrics follow the pill, which they do. No change strictly required, but ensure Earn pill is never pushed after Metrics.

### B4 — [P1] "Alpha" badge color uses accent (mint), mock uses iris for non-"New" badges
- **What's wrong now**: Strategies "Alpha" badge (line 186-188): `bg-accent-soft … text-accent` (mint).
- **Mock target**: `NavLink` badge (line 32): `badge === 'New' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-iris-500/20 text-iris-300'`. Non-"New" badges (e.g. "Alpha"/"Soon") are **iris**, not mint. Also mock badge is `text-[9px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5`.
- **Fix**: For the Alpha badge use `bg-iris-500/20 text-iris-300` (iris is defined in tailwind config). Keep `text-[9px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5` (ours already matches the typography). Reserve mint/emerald badge styling for "New".

---

## C. Earn pill (EarnPill)

### C1 — [P2] Earn pill is a near-perfect port — verify exact classes
- **What's wrong now**: lines 139-175 — our Earn pill replicates the mock: `group relative … overflow-hidden … rounded-lg border px-3 py-1.5 text-sm font-semibold`, shimmer sweep span, sprout icon, ping-dot + APY chip. Active/inactive emerald states match.
- **Mock target**: `EarnPill` (lines 42-60). ✓ essentially identical, including the APY sub-chip `bg-emerald-400/15 px-1.5 py-0.5 text-[11px] font-bold text-emerald-200` and the ping dot.
- **Fix**: none required. Minor: mock shows `{APY.toFixed(2)}%` → ours `{formatApy()}%` (3.53) ✓. Keep. (One nit: mock pill gap is `gap-2`; ours `gap-2` ✓.)

### C2 — [P2] Sprout icon should come from shared Icon.svelte
- **What's wrong now**: lines 149-161 inline an SVG copy of the sprout path.
- **Mock target**: `EarnPill` uses `<Icon name="sprout" className="h-4 w-4" />` (atoms.jsx sprout path, stroke 1.6).
- **Fix**: Once `src/lib/components/ui/Icon.svelte` lands, replace the inline `<svg>` with `<Icon name="sprout" class="h-4 w-4" />`. The paths already match the atoms.jsx sprout definition, so this is a refactor for consistency, not a visual change.

---

## D. Network selector chip

### D1 — [P0] Network chip shows a chain logo image + "Base Mainnet" + chevron; mock is a dot + "Base"
- **What's wrong now**: `NetworkSelector.svelte` lines 93-107 — button renders an `<img>` chain logo (`getChainLogo`), the network `displayName` ("Base Mainnet"), and a `▼` glyph chevron. Style: `border border-line bg-surface-2 px-2 py-1 … min-h-10 sm:px-3 sm:py-2`.
- **Mock target**: `AppShell.jsx` (lines 80-83): a static chip — `flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm text-gray-200` containing a colored dot `<span class="h-2 w-2 rounded-full" style="background:#7d8bff">` and the text `Base` (short name, not "Base Mainnet"), with **no logo image and no chevron**.
- **Fix**: Restyle the trigger button to match the mock chip: `flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 text-sm text-text-2`. Replace the logo `<img>` with an iris dot `<span class="h-2 w-2 rounded-full bg-iris-500">` (or `style="background:#7d8bff"`). Use the short label ("Base") instead of `displayName`. The `▼` chevron: the mock has none — since ours is a real dropdown, keep a chevron but swap the `▼` text glyph for the shared `chevronDown` Icon (`h-4 w-4`, stroke 1.6) and dim it (`text-text-3`). Remove `min-h-10` so the chip height matches the `py-1.5` mock (~32px), aligning with the nav pills.

### D2 — [P1] Chevron is a literal `▼` text character
- **What's wrong now**: line 106 — `<span class="text-xs …">▼</span>`.
- **Mock target**: mock uses no chevron here; the icon set provides `chevronDown` (`d="M6 9l6 6 6-6"`).
- **Fix**: replace `▼` with `<Icon name="chevronDown" class="h-4 w-4 text-text-3 transition-transform" class:rotate-180={isOpen} />`. Never ship the `▼` unicode glyph.

### D3 — [P2] Dropdown panel styling acceptable, align border/radius
- **What's wrong now**: dropdown panel (line 120-122) uses `rounded-lg border border-line bg-surface-1/95 backdrop-blur-lg shadow-lg`. Fine and on-brand.
- **Mock target**: mock chip is static (no dropdown), so no direct target. Keep ours but match card radius/shadow tokens: panel should use `shadow-2` (= `--shadow-2`) instead of Tailwind's generic `shadow-lg` for consistency with the card system.
- **Fix**: optional — swap `shadow-lg` → `shadow-[var(--shadow-2)]` (or a `shadow-2` alias if added).

---

## E. "My Dashboard" / connect button

### E1 — [P1] Connected "My Dashboard" gradient button matches; verify suffix + chevron
- **What's wrong now**: lines 209 & 276 — `bg-gradient-to-b from-emerald-300 to-emerald-400 px-3.5 py-2 text-sm font-semibold text-[#053124] shadow-[0_10px_30px_-10px_rgba(45,227,166,0.45)] hover:brightness-105`. We append a chevron and an account dropdown (real feature — keep).
- **Mock target**: `AppShell.jsx` (lines 85-88): `rounded-lg bg-gradient-to-b from-emerald-300 to-emerald-400 px-3.5 py-2 text-sm font-semibold text-[#053124] hover:brightness-105` with inline `boxShadow: 0 10px 30px -10px rgba(45,227,166,0.45)`, and a mono suffix `<span class="font-mono text-[11px] font-medium text-emerald-900/70">·7f3a</span>`.
- **Fix**: (a) Our suffix (lines 213-217, 280-282) uses `text-[11px] font-normal text-emerald-900/70` — mock uses **`font-mono … font-medium`** and prefixes with `·` (middle dot). Change to `font-mono text-[11px] font-medium text-emerald-900/70` and render `·{last4}` (mock shows `·7f3a`). (b) Gradient/shadow/padding already match ✓. (c) Keep the chevron+dropdown (real feature), but the mock has no chevron — acceptable since ours is interactive; make the chevron subtle (`text-emerald-900/60`).

### E2 — [P1] Disconnected state uses Button primary; should read as the mint gradient CTA
- **What's wrong now**: "Connect or Log In" (lines 339-346) uses `<Button variant="primary" size="sm">`. With the Button fix (section G) this becomes the correct gradient.
- **Mock target**: mock's header CTA is always the mint gradient pill (`My Dashboard`). The disconnected analog should be the same gradient treatment.
- **Fix**: ensure `Button variant="primary"` resolves to `from-accent-bright to-accent text-accent-ink shadow-[…glow]` (see G1). Then "Connect or Log In" visually matches the mock CTA. No structural change.

### E3 — [P2] Account dropdown menu items: replace inline SVGs with Icon set; fix red hover token
- **What's wrong now**: dropdown items (lines 242-249, 259-266, 307-314, 324-331) inline Heroicons-style SVGs (`blocks`-like grid path for Dashboard, logout arrow). The destructive item uses `hover:bg-white/10` (lines 253, 318) — a hardcoded white wash that won't theme-flip.
- **Mock target**: icon set provides `blocks` (grid, line 16 of atoms.jsx) for the dashboard glyph. There's no logout glyph in the set — keep ours but normalize stroke to 1.6.
- **Fix**: swap the dashboard grid SVG for `<Icon name="blocks" class="h-4 w-4" />`. Change destructive hover from `hover:bg-white/10` to `hover:bg-down/10` (or `hover:bg-surface-2`) so it theme-flips; keep `text-down` (mock semantics: red = down) instead of `text-red-400`.

---

## F. Theme toggle (real feature, not in mock)

### F1 — [P2] ThemeToggle is on-brand; keep but confirm tokens
- **What's wrong now**: `ThemeToggle.svelte` — segmented pill `rounded-full border border-line bg-surface-2 p-1`, active segment `bg-surface-1 text-accent shadow-sm`. Sun/moon icons stroke 1.7.
- **Mock target**: no equivalent (mock is dark-only). This is a real feature we keep.
- **Fix**: none required. Nit: mock icon stroke convention is `1.6`; align sun/moon `stroke-width` to `1.6` for consistency with the Icon set. Keep placement (mock would put it left of the network chip — ours is already left of NetworkSelector ✓).

---

## G. Button primitive (`ui/Button.svelte`)

### G1 — [P0] Primary/ghost variants — verify against mock button language
- **What's wrong now**: `Button.svelte` lines 12-17 —
  - primary: `bg-gradient-to-b from-accent-bright to-accent text-accent-ink shadow-[0_10px_30px_-10px_var(--accent-glow)] hover:brightness-105` ✓ matches the brief's `.btn-primary` spec exactly.
  - ghost: `bg-transparent text-text border border-line hover:bg-surface-2`.
  - secondary: `bg-surface-2 text-text border border-line-strong hover:bg-surface-3`.
- **Mock target** (brief): primary gradient = `linear-gradient(180deg, accent-bright, accent)` + `accent-ink` text + accent glow shadow ✓. Ghost = `surface-2 + line-strong border`. Quiet = transparent.
- **Fix**: Our **secondary** already = `surface-2 + border-line-strong` which is the brief's **ghost** spec; our **ghost** = transparent which is the brief's **quiet** spec. The names are swapped vs the brief's vocabulary. Recommend: (a) rename or add a `quiet` variant = `bg-transparent text-text-2 hover:bg-surface-2 hover:text-text` (no border) for transparent/tertiary actions; (b) keep `secondary` (= brief "ghost": surface-2 + line-strong) as the standard non-primary fill; (c) verify the primary gradient direction is `to-b` (180deg) ✓. No visual change to primary needed — it already matches.

### G2 — [P1] Button radius/min-height
- **What's wrong now**: line 31 — base = `min-h-10 … rounded-lg font-semibold`. The `min-h-10` (40px) forces all buttons taller than the mock's compact header pills (`py-1.5`/`py-2` ≈ 32-36px).
- **Mock target**: mock header buttons are `px-3 py-2` (NavLink) / `px-3.5 py-2` (My Dashboard) / `px-3 py-1.5` (Earn) with **no min-height** — height is content-driven.
- **Fix**: drop `min-h-10` from the Button base (or make it opt-in via a prop). Mock buttons size from padding alone; `min-h-10` causes the header CTAs to be visibly chunkier than the mock.

### G3 — [P2] transition is `transition-colors`; gradient buttons need `transition`
- **What's wrong now**: line 31 base = `transition-colors`. The primary variant relies on `hover:brightness-105` which `transition-colors` does NOT animate (brightness is a filter).
- **Mock target**: My Dashboard / Earn use `transition` / `transition-all` so brightness + border/bg animate.
- **Fix**: change base to `transition` (or `transition-all`) so `hover:brightness-105` eases. Currently the hover brighten snaps.

---

## H. Card primitive (`ui/Card.svelte`)

### H1 — [P0] Card has no background, border, or shadow by default
- **What's wrong now**: `Card.svelte` line 7 — `group relative overflow-hidden rounded-xl` + caller-supplied `className`. There is NO default `bg`, `border`, or `shadow`. Every consumer must hand-roll surface/border/shadow, so cards are visually inconsistent across the app.
- **Mock target** (brief + dashboard screenshot): mock cards = `bg-surface-1` (`#0c121b`), `border border-line` (`white/[0.06]`), `rounded-2xl` (large blocks) or `rounded-lg`, `shadow-2`, with an optional top hairline gradient. See `v2-dashboard.png` Savings card and stat tiles — each is a `bg-surface-1` rounded-2xl with a hairline border.
- **Fix**: give Card sensible defaults: `rounded-2xl bg-surface-1 border border-line shadow-[var(--shadow-2)]` and let `className` override. Radius should be `rounded-2xl` for major blocks (mock uses 2xl for the big Savings/stat cards) — our default `rounded-xl` is one step too tight. Keep the optional top-hairline (`showGradient`) — that matches the mock's "optional top hairline."

### H2 — [P1] Default padding `p-3 sm:p-4 lg:p-5` is tighter than mock
- **What's wrong now**: line 3 — `paddingClass = 'p-3 sm:p-4 lg:p-5'` (12→20px).
- **Mock target**: mock cards use `p-5`/`p-6` (the Savings card in `v2-dashboard.png` has generous ~20-24px interior padding; stat tiles ~`p-5`).
- **Fix**: bump default to `p-5` (or `p-4 sm:p-5`) so cards breathe like the mock. Keep override prop.

### H3 — [P1] Top-hairline gradient only shows on hover
- **What's wrong now**: line 9-11 — the top gradient strip is `opacity-0 … group-hover:opacity-100` (hover-only).
- **Mock target**: the mock's optional top hairline is a static accent rule on featured cards (not hover-gated).
- **Fix**: make the hairline visibility a prop (`hairline: 'static' | 'hover' | 'none'`); for featured/accent cards render it statically at low opacity (e.g. `opacity-60`) rather than only on hover.

---

## I. Modal primitive (`ui/Modal.svelte`)

### I1 — [P0] Modal overlay is opaque `bg-surface-2` (no dim/blur), and double-nests panels
- **What's wrong now**: `Modal.svelte` line 13 — backdrop = `fixed inset-0 … bg-surface-2` (a solid opaque surface, no opacity, no blur). Then the panel (line 18) AND an inner wrapper (line 24) BOTH apply `rounded-lg bg-surface-1 p-…` — a card inside a card. Close button is a literal `✕` glyph; hover uses `hover:bg-gray-100 hover:text-primary` (hardcoded light colors that break in dark mode).
- **Mock target**: the mock uses dim translucent overlays (e.g. `bg-black/…` + `backdrop-blur`) and a single `bg-surface-1 border border-line rounded-2xl shadow-pop` panel. Close = `Icon name="close"` (`d="M6 6l12 12M6 18L18 6"`, stroke 1.6).
- **Fix**: (a) overlay → `fixed inset-0 bg-black/60 backdrop-blur-sm` (dim, not opaque). (b) Collapse the double panel into one: `rounded-2xl border border-line bg-surface-1 shadow-[var(--shadow-pop)]`. (c) Replace `✕` with `<Icon name="close" class="h-5 w-5" />`. (d) Fix close-button hover: `hover:bg-surface-2 hover:text-text` (not `hover:bg-gray-100 hover:text-primary`). (e) Header divider `border-line` ✓.

### I2 — [P2] Modal radius `rounded-lg` should be `rounded-2xl`
- **What's wrong now**: lines 18, 24 — `rounded-lg`.
- **Mock target**: large surfaces (cards, modals, product frame) use `rounded-2xl`.
- **Fix**: `rounded-2xl` on the modal panel.

---

## J. Ambient background (`AmbientBackground.svelte`)

### J1 — [P1] Ambient is a far richer canvas than the mock — confirm it's an intentional upgrade, but reconcile grid + glow geometry
- **What's wrong now**: `AmbientBackground.svelte` renders an animated `<canvas>` of 14-26 bokeh orbs (lighter blend), three large `auraDrift` blooms, and a top-masked grid veil at `64px`. This is more elaborate than the mock's `Canvas` (two static-ish blurred glows + a flat grid).
- **Mock target**: `AppShell.jsx` Canvas (lines 96-109): flat `#070b11` base; a grid at `opacity-[0.025]` `64px 64px` (full-bleed, NOT top-masked); a `520px` mint glow top-left (`rgba(45,227,166,0.05)`, warms to `0.12` on Earn/Dashboard) with `glowFloat1 48s`; a `460px` iris glow bottom-right (`rgba(125,139,255,0.07)`) with `glowFloat2 60s`. Two glows only, no bokeh field.
- **Fix**: This is a real visual upgrade — keep the richer ambient, but: (a) the mock grid is **full-bleed at 0.025 opacity**, ours is **top-masked** (`mask-image: radial-gradient(...)`) so the grid fades out below the fold. Decide intentionally — to match the mock the grid should be uniform/full-bleed; ours fading is a stylistic choice, flag for design sign-off. (b) Mock's grid is `64px` ✓ (ours `64px` ✓). (c) The mock "warm green glow on Earn/Dashboard" behavior (Canvas `warm` flag) is NOT reproduced — ours doesn't intensify the mint bloom on Earn/Dashboard routes. If we want parity, raise `--aura-a` (mint) intensity on `/earn` and `/dashboard`. P2.

### J2 — [P2] Grid opacity/color
- **What's wrong now**: ours uses `var(--grid)` for line color (token-driven, good).
- **Mock target**: `rgba(255,255,255,.6)` lines at `opacity-[0.025]` container → effective ~0.015 white.
- **Fix**: confirm `--grid` resolves to a comparable near-invisible value in dark mode; if it reads heavier than the mock, dial down.

---

## K. Footer (real feature; mock has none)

### K1 — [P2] Footer is on-brand; confirm tokens, no mock equivalent
- **What's wrong now**: `Footer.svelte` — `border-t border-line`, links `text-text-2 hover:text-accent`, social chips `bg-surface-2 text-text-3 hover:bg-accent-soft hover:text-accent`, risk warning `text-accent` label. All token-driven and consistent with the system.
- **Mock target**: the static mock has no footer (it's a single-screen prototype). No drift to fix.
- **Fix**: none. Nit: social-icon SVGs are brand glyphs (X/Telegram/LinkedIn) that legitimately aren't in the Icon set — keep as-is. The "Risk Warning:" label uses `text-accent` (mint); per brief, warnings should be **amber**, but this is a legal disclaimer styled as a brand accent, not a warning state — leave unless design wants amber. (Low confidence; flag only.)

---

## L. Sidebar (real feature; mock has none)

### L1 — [P1] Mobile pull-out tab uses retired yellow
- **What's wrong now**: `Sidebar.svelte` lines 90-98 — mobile open tab = `border-yellow-500/40 bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 text-yellow-400 shadow-yellow-500/20 hover:… text-yellow-300`.
- **Mock target**: brief explicitly RETIRES yellow ("warnings = amber, not yellow"; mint is the signature). This attention-grabbing tab predates the mint system.
- **Fix**: re-tint to the mint accent: `border-accent-line bg-accent-soft text-accent hover:bg-accent-soft/… shadow-accent`. Or if it's meant to be an "attention" affordance, use amber tokens — but `yellow-500` literal should go.

### L2 — [P2] Sidebar surfaces/blur are on-brand
- **What's wrong now**: sidebar panel `bg-surface-1/70 border-r border-line backdrop-blur-xl`; active asset row `border-l-2 border-accent bg-accent-soft`; chevron tabs use inline SVGs.
- **Mock target**: no equivalent (mock has no sidebar). Token usage is consistent with the system.
- **Fix**: none required. Nit: the inline chevron SVGs (lines 76-84, 95-97, 118-126) could use `Icon name="chevronDown"`/`close` once Icon.svelte lands, for consistency.

---

## M. Icons summary (this area)

Replace these inline/foreign SVGs with the shared `Icon` set (`atoms.jsx` paths, viewBox 0 0 24 24, stroke 1.6, currentColor) once `ui/Icon.svelte` exists:

| Location | Current | Use mock Icon |
|---|---|---|
| Header Earn pill (Header.svelte 149-161) | inline sprout SVG | `sprout` |
| Header account dropdown "Dashboard" (242-249, 307-314) | Heroicons grid path | `blocks` |
| Header account dropdown chevron (218-231, 283-296) | inline chevron, stroke 2 | `chevronDown` (stroke 1.6) |
| Header hamburger (357-380) | inline bars/X | keep (no menu glyph in set) or `close` for the X state |
| NetworkSelector chevron (106) | `▼` text glyph | `chevronDown` |
| Modal close (Modal.svelte 37) | `✕` text glyph | `close` |
| ThemeToggle sun/moon (20-44) | inline, stroke 1.7 | keep, normalize stroke → 1.6 |
| Sidebar chevrons (76-84, 95-97, 118-126) | inline, stroke 2 | `chevronDown` / `close` |

Literal text glyphs `▼` and `✕` must be removed (D2, I1) — these are the most visible "not designed" tells.

---

## Priority rollup

**P0 (do first):**
- A1 header bg/border/blur missing (header doesn't read as a band)
- B1 active nav pill wrong bg token
- D1 network chip: logo+"Base Mainnet"+chevron → dot + "Base" chip
- G1 Button variant vocabulary (add `quiet`, confirm primary)
- H1 Card has no default bg/border/shadow
- I1 Modal opaque overlay + double-nested panel + `✕`/`hover:bg-gray-100`

**P1:**
- A2 header padding, A3 gaps, B4 Alpha badge → iris, D2 `▼` glyph, E1 dashboard suffix font-mono + `·`, G2 `min-h-10`, G3 transition, H2/H3 card padding+hairline, J1 ambient grid mask + warm-glow parity, L1 sidebar yellow → mint.

**P2:**
- C1/C2 Earn pill icon refactor, D3 dropdown shadow token, E3 dropdown icons + red hover token, F1 toggle stroke, I2 modal radius, J2 grid opacity, K1 footer, L2 sidebar icons.
