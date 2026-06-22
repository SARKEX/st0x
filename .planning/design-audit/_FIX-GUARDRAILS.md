# Fix guardrails — design-fidelity pass

You are implementing the fixes from a design audit. Read YOUR area report in `.planning/design-audit/` in full and implement **all P0 + P1**, and P2 where safe and quick. Then verify your edited components with the **svelte MCP `svelte-autofixer`** and fix anything it flags.

## Hard rules

1. **Presentation only.** NEVER change `<script>` logic, bindings, event handlers, stores, queries, reactive statements, props contracts, or data flow. Only edit markup, Tailwind classes, structure, and icons. If a report item would require logic changes, skip it and note it in your summary.

2. **Do NOT fabricate data or build net-new feature surfaces.** If the mock shows a chart/donut/panel that needs data our app doesn't have, restyle what EXISTS — do not invent fake numbers or stub data. Note such gaps in your summary instead.

3. **Stay in your file scope** (listed in your task). Do NOT edit:
   - anything under `src/lib/components/ui/**` (shared primitives — owned by the shell pass; use them as-is),
   - the shared atoms `earn/ApyChip.svelte`, `earn/Sparkline.svelte`, `earn/CountUp.svelte`, `earn/TokenDisc.svelte`, `earn/EarnIcon.svelte`, `ui/Icon.svelte`, `ui/AssetDisc.svelte` (frozen — they already match the mock),
   - `src/lib/styles/*`, `tailwind.config.ts`, `src/app.*` (foundation — already done).

## Brand override (supersedes the mock/report where they conflict)

- **Mint replaces yellow everywhere.** If the mock or your report shows a `yellow-*`/`amber-*`/`bg-yellow-500` **call-to-action or accent**, use **mint** instead: primary actions → mint primary (`bg-emerald-500 text-[#05241a]` or the `Button` primary variant), secondary actions → ghost/secondary mint (`border-line bg-overlay-1 text-text`), NOT amber. (Note: our Tailwind remaps the `yellow` palette to mint already, so a leftover `bg-yellow-400` class renders mint — but replace literal hex like `#eab308` in JS/chart configs with mint `#2de3a6`.)
- **Amber is allowed ONLY for genuine warning / risk / caution messaging** (e.g. low-liquidity, market-closed, slippage banners) — use `amber-*`. Never for Sell.
- Keep semantics: **Buy/positive = mint/emerald**, **Sell/negative = red** (`text-down`/`red-*`), **links = sky/blue**.
- Keep the **real st0x logo** — do not adopt the mock's `st(o)x` mint-ring logo.

## Translucent overlays → use the theme-aware tokens (IMPORTANT)

Your report will frequently say "revert `bg-surface-2` to the mock's `bg-white/[0.0x]` / `bg-black/30`". Do **NOT** paste raw white/black-alpha literals onto theme-flipping page surfaces — they vanish in light mode. Instead use the new **theme-aware overlay utilities** (translucent white in dark, translucent ink in light):

| Report / mock literal | Use this instead |
|---|---|
| `bg-white/[0.02]`, `bg-white/[0.025]`, `bg-white/[0.03]` | `bg-overlay-1` |
| `bg-white/[0.04]`, `bg-white/[0.05]`, `bg-white/[0.06]` | `bg-overlay-2` |
| `bg-black/30` (inset field wells) | `bg-overlay-strong` |
| `hover:bg-white/5`, `hover:bg-surface-2` (as hover) | `hover:bg-overlay-hover` |
| `border-white/10`, `border-white/[0.07]`, `border-white/[0.06]` | `border-line-strong` (10) / `border-line` (≤07) |

Exception: a component that is **always dark regardless of theme** (e.g. a fixed dark modal whose own bg is a hardcoded `#0a0f17`) may keep raw `white/alpha` literals — but page-level cards/fields/rows must use the overlay tokens.

Card chrome target (the mock card): `rounded-2xl border border-line bg-surface-1 shadow-2` (or `bg-overlay-1` for the lighter "glass" cards the report calls out). Numeric values → `font-mono` (tabular). Section eyebrows → mono, uppercase, `tracking-[0.18em]`, `text-accent`.

## Icons

Use `import Icon from '$lib/components/ui/Icon.svelte';` (or the existing `EarnIcon` in earn components — it now wraps the same set). Replace hand-rolled inline `<svg>` glyphs with the named `Icon` the report specifies. Available names: shield, unlock, bolt, blocks, arrowRight, arrowUpRight, trendUp, sprout, check, plus, minus, close, info, coins, chart, bank, lock, clock, wallet, swap, arrowDown, chevronDown.

## Output

Make the edits. Then return a concise summary: what you changed (grouped), what you skipped and why, any logic-entangled or data-gap items you left for a human, and confirmation that svelte-autofixer is clean on your files.
