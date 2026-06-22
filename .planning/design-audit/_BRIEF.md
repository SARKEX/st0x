# Design-fidelity audit — shared brief

We are bringing the live st0x app to **pixel fidelity** with the v2 design mockup.

## Where things are

- **Mock source (React/JSX, the design source-of-truth):** `design-ref/handoff-2/st0x-site/project/src2/*.jsx`
  - Shared atoms/icons: `src2/atoms.jsx` (the `Icon` set, `AssetDisc`, `TokenDisc`, `ApyChip`, `Sparkline`, `CountUp`, `BarSpark`)
  - Shell: `src2/AppShell.jsx` (Header, NavLink, EarnPill, Canvas)
  - Data/copy: `src2/data.jsx`
- **Mock styles:** `design-ref/handoff-2/st0x-site/project/style/tokens.css` (we already ported verbatim → `src/lib/styles/tokens.css`) and `style/components.css` (NOT used by src2 — src2 uses Tailwind utilities; ignore components.css).
- **Mock rendered target screenshots:** `design-ref/handoff-2/st0x-site/project/screenshots/*.png`
- **Our app screenshots (current state):** `.playwright-mcp/ours/*.png`

## Methodology fact (critical)

The mock styles everything with **Tailwind utility classes** (e.g. `bg-emerald-400/15`, `border-white/[0.06]`, `rounded-2xl`, `text-gray-300`, inline `style={}` for gradients/shadows). Our Tailwind config already remaps `emerald`→mint scale and defines `iris`, plus var-backed theme aliases (`bg`, `surface-1/2/3`, `text`, `text-2/3/muted`, `line`, `accent`, etc.). So fixes = **reproduce the mock's exact markup/classes/structure**, not invent new CSS.

Mock literal-class → our equivalent (both work; mock literals render mint automatically):
- `emerald-*` already = mint. Keep literal emerald-* OR use `accent` tokens. For theme-flipping structural color prefer var tokens (`bg-surface-1`, `border-line`, `text-text-2`). For the mint accent, literal `emerald-400/NN` works with opacity; `accent`/`accent-soft`/`accent-line` are pre-baked (opacity modifiers do NOT work on var-backed `accent`).
- `text-white`→`text-text`, `text-gray-300/400`→`text-text-2`, `text-gray-500`→`text-text-3`, `bg-[#070b11]`→`bg-bg`, `bg-[#0c121b]`→`bg-surface-1`, `bg-[#111a25]`→`bg-surface-2`, `border-white/[0.06]`→`border-line`.

## Icons (a top complaint)

The mock uses ONE icon component (`atoms.jsx` → `Icon`, viewBox 0 0 24 24, stroke 1.6, currentColor) with a fixed path set: shield, unlock, bolt, blocks, arrowRight, arrowUpRight, trendUp, sprout, check, plus, minus, close, info, coins, chart, bank, lock, clock, wallet, swap, arrowDown, chevronDown. We are adding a Svelte `Icon.svelte` (`src/lib/components/ui/Icon.svelte`) with these exact paths. **Where our app uses flowbite-svelte-icons or different glyphs, the audit must name the mock icon to use instead.**

## Conventions (do NOT regress)

- Keep the **real st0x logo** (`/images/logo-sidebar.svg`) — do NOT adopt the mock's `st(o)x` mint-ring logo.
- Keep semantics: Buy/positive = mint/emerald, Sell/negative = red (`down`), links = sky/blue, warnings = **amber** (not yellow).
- This app has **real features and live data** the static mock lacks. Reproduce the mock's *visual language* (cards, spacing, icons, buttons, grids, typography). Do NOT propose deleting real functionality to match the simpler static mock. Flag visual/layout drift only.

## Your output (AUDIT ONLY — do not edit code)

Write `.planning/design-audit/<area>.md`. Be exhaustive and concrete. For your assigned page, go section by section (top → bottom) and list EVERY discrepancy vs the mock, each as a checklist item with:
- **What's wrong now** (our current state, cite our file + approx line/section)
- **Mock target** (cite mock JSX file + the exact classes/structure/icon/spacing/gradient)
- **Fix** (the specific Svelte/Tailwind change to make)

Cover: icons, card usage (which blocks should be cards vs not, borders/radius/shadow/bg), alignment & grid structure, spacing/padding, button styles & layout/placement, colors (bg/surface/text/accent), typography (font-display headings, mono numerics, sizes/weights/tracking), eyebrows/section headers, badges/pills/chips, dividers, hover/active states, and any missing or extra sections. Prioritize items P0 (structural/obvious) → P2 (polish).
