# Design-fidelity audit — Earn page (`/earn`)

Scope: `src/routes/(main)/earn/+page.svelte` + `src/lib/components/earn/*`, audited against the
mock JSX (`src2/Earn.jsx`, `src2/EarnParts.jsx`, `src2/atoms.jsx`, `src2/data.jsx`) and the rendered
target screenshots (`screenshots/earn*.png`, `compare*.png`).

## Verdict up front

This page is a **high-fidelity port** — structure, grid, copy, icon paths, sparkline geometry, ApyChip,
CountUp, TokenDisc, and section order all match the **newer** mock iteration shown in the screenshots
(4 pillars + hero trust strip + comparison table + calculator + choose-yield + how-it-works + FAQ + CTA).
Note: `Earn.jsx`/`EarnParts.jsx` are an *older* iteration (3 pillars, no hero trust strip, hero tile
`$85B / <10s / No KYC` labelled differently, `ChooseYield` not mounted in `Earn()`). The **screenshots
are the real target** and our page tracks them — so most JSX-vs-ours diffs are intended evolution, not bugs.

The remaining discrepancies are almost entirely **one systemic surface/background substitution** plus a
couple of gradient/border token swaps. They are concentrated but they materially change the look,
especially in **light theme**.

---

## P0 — Systemic: translucent card surfaces replaced with opaque `bg-surface-2`

**The single biggest fidelity issue on the page.** The mock paints almost every card/tile with a *faint
translucent white overlay* over the dark page (`bg-white/[0.025]`, `bg-white/[0.02]`, `bg-white/[0.04]`,
`bg-black/30`). These read as barely-there glassy panels and are theme-aware (they tint over whatever
background sits behind them). Our port collapses nearly all of them to the **solid** token `bg-surface-2`
(`#111a25` dark / `#f4f7fa` light).

Consequences:
- **Dark:** cards are noticeably more opaque/“boxy” and a touch lighter than the mock’s near-invisible
  panels. Inset tiles that should be *darker* than their parent (`bg-black/30`, `bg-white/[0.04]`) are
  instead the *same* `bg-surface-2` as the card around them, so the nested-tile contrast the mock relies
  on disappears (hero stat tiles, calculator result tiles).
- **Light:** `bg-surface-2` = `#f4f7fa`, almost identical to the page bg, so cards/tables nearly vanish
  (see `ours/earn-light.png` — comparison table and pillars wash out). The mock’s `bg-white/[0.025]`
  would instead darken slightly over a light page and stay legible.

Per the shared brief, `bg-[#111a25]`→`bg-surface-2` only applies where the mock literally used `#111a25`.
The Earn mock does **not** — it uses `bg-white/[0.0xx]` overlays. **Keep the literal translucent classes.**

Checklist of every substitution to revert to the mock literal:

- [ ] **Hero stat tiles** — `EarnHero.svelte:87` uses `bg-surface-2`; mock (`Earn.jsx:41`) = `bg-black/30`.
      These should be *darker* inset wells inside the gradient panel. Change to `bg-black/30`.
- [ ] **Hero APY panel gradient tail** — `EarnHero.svelte:68` `...to-gray-950`; mock (`Earn.jsx:31`) =
      `to-[#070b12]`. Use `to-bg` (or literal `to-[#070b12]`) so the gradient sinks into the page color,
      not Tailwind grey.
- [ ] **Pillars cards** — `EarnPillars.svelte:11` `bg-surface-2`; mock (`Earn.jsx:60`) = `bg-white/[0.025]`
      with `border-white/10`. Use `bg-white/[0.025] border-white/10` (our `border-line` is fine for the border).
- [ ] **Comparison wrapper** — `TreasuryComparison.svelte:8` `bg-surface-2`; mock (`EarnParts.jsx:103`) =
      `bg-white/[0.025]`. Revert.
- [ ] **Comparison “initial” avatar (non-highlight rows)** — `TreasuryComparison.svelte:37` `bg-surface-2`;
      mock (`EarnParts.jsx:115`) = `bg-white/[0.05]`. This makes the letter-disc indistinguishable from
      the row bg; use `bg-white/[0.05]`.
- [ ] **Comparison footer band** — ours uses `bg-white/[0.015]` (line 73) ✅ already correct (kept literal).
      Leave as-is.
- [ ] **Calculator outer card** — `EarnCalculator.svelte:37` `bg-surface-2`; mock (`EarnParts.jsx:13`) =
      `bg-white/[0.025]`. Revert.
- [ ] **Calculator amount-input well** — `EarnCalculator.svelte:43` `bg-surface-2`; mock
      (`EarnParts.jsx:19`) = `bg-black/30` (a *darker* inset). Change to `bg-black/30`.
- [ ] **Calculator result tiles (Per month / Per day / SEC yield)** — `EarnCalculator.svelte:95,99,103`
      `bg-surface-2`; mock (`EarnParts.jsx:52`) = `bg-white/[0.04]`. Revert so they’re a faint lift inside
      the green gradient column, not a solid box.
- [ ] **Choose-yield outer card** — `ChooseYield.svelte:14` `bg-surface-2`; mock (`EarnParts.jsx:71`) =
      `bg-white/[0.025]`. Revert.
- [ ] **Choose-yield non-recommended (tSGOV) card** — `ChooseYield.svelte:27` `bg-surface-2`; mock
      (`EarnParts.jsx:79`) = `bg-white/[0.02]`. Revert.
- [ ] **How-it-works step cards** — `HowItWorks.svelte:11` `bg-surface-2`; mock (`Earn.jsx:77`) =
      `bg-white/[0.02]`. Revert.
- [ ] **FAQ accordion wrapper** — `FaqAccordion.svelte:13` `bg-surface-2`; mock (`EarnParts.jsx:152`) =
      `bg-white/[0.02]`. Revert.
- [ ] **Trust chips** — `TrustStrip.svelte:10` `bg-surface-2`; mock (`EarnParts.jsx:141`) = `bg-white/[0.02]`.
      Revert.

> Recommendation: do a single mechanical pass replacing `bg-surface-2` → the exact mock literal in each
> earn component (mostly `bg-white/[0.025]`, with `bg-black/30` for the two inset wells and `bg-white/[0.04]`
> for calc result tiles). Borders can stay on `border-line`/`border-line-strong` (those already map to the
> mock’s `border-white/10` and `border-white/15` reasonably). This is the fix that restores the v2 glassy
> look and rescues light theme.

---

## P0 — Hover states lost on translucent buttons/cards

Because the hover backgrounds were also tokenised, several hovers now resolve to the *same* color as the
resting card, so the hover is invisible.

- [ ] **“Why SGOV” secondary button** — `EarnHero.svelte:60` `hover:bg-surface-2`; mock (`Earn.jsx:26`) =
      `hover:bg-white/5`. On a `bg-surface-2` card the hover is a no-op. Use `hover:bg-white/5`.
- [ ] **Calculator preset chips (unselected)** — `EarnCalculator.svelte:76` `hover:bg-surface-2`; mock
      (`EarnParts.jsx:37`) = `hover:bg-white/5`. Use `hover:bg-white/5`.
- [ ] **Choose-yield non-recommended button** — `ChooseYield.svelte:52` `hover:bg-surface-2`; mock
      (`EarnParts.jsx:90`) = `hover:bg-white/5`. Use `hover:bg-white/5`.

---

## P1 — Icons (EarnIcon vs mock `Icon`)

`EarnIcon.svelte` **faithfully reproduces the mock `Icon` paths verbatim** (viewBox 0 0 24 24, stroke 1.6,
currentColor, round caps) for every glyph the Earn page uses. No glyph mismatches. Icons actually used on
this page and their status:

| Where | Mock icon | Ours | Status |
|---|---|---|---|
| Hero CTA arrow, calc CTA, CTA band, how-it-works connector | `arrowRight` | `arrowRight` | ✅ exact |
| Pillar 1 | `unlock` | `unlock` | ✅ exact |
| Pillar 2 | `bank` | `bank` | ✅ exact |
| Pillar 3 | `bolt` | `bolt` | ✅ exact |
| Pillar 4 | `shield` | `shield` | ✅ exact |
| TokenDisc SGOV glyph | `bank` | `bank` | ✅ exact |
| Comparison ✓ | `check` (stroke 2.4) | `check` (stroke 2.4) | ✅ exact |
| Comparison ✗ | `close` (stroke 2.4) | `close` (stroke 2.4) | ✅ exact |
| Choose-yield “Best for” / Trust chips | `check` | `check` | ✅ exact |
| FAQ toggle | `plus`/`minus` | `plus`/`minus` | ✅ exact |

**Recommendation for the shared `ui/Icon.svelte`:** `EarnIcon`’s path set is identical to the mock atom,
so swapping each `import EarnIcon from './EarnIcon.svelte'` → the new `$lib/components/ui/Icon.svelte` is a
safe, name-for-name rename (`arrowRight`, `unlock`, `bank`, `bolt`, `shield`, `check`, `close`, `plus`,
`minus`). Keep the `stroke={2.4}` overrides on the comparison ✓/✗ and `stroke={1.8}` on the TokenDisc bank
glyph. `EarnIcon.svelte` can then be deleted. (One caveat: confirm `ui/Icon.svelte` accepts the same
`className` + `stroke` props; if it uses `class`/`size` instead, update call-sites accordingly.)

`EarnIcon` omits `blocks`, `coins`, `chart`, `lock`, `swap`, `sprout`-only-partially — none of these are
used on the Earn page, so no impact here; the shared `ui/Icon.svelte` should carry the full set for other pages.

---

## P1 — Pillar count / content matches screenshots (not the stale JSX) — OK, but verify intent

- Our page renders **4 pillars** (`PILLARS` in `config/earn.ts`: unlock / bank / bolt / shield) matching
  `earn-hero.png`, `compare.png`. The `Earn.jsx`/`data.jsx` `PILLARS` array has **3** (unlock / bank / bolt,
  using a `sprout`-style set). **No change needed** — ours follows the screenshot target. Flagging only so
  it isn’t “corrected” back to 3 by a JSX-literal pass.
- Pillar icon chip: ours `bg-emerald-400/10 text-emerald-300` with `h-10 w-10 rounded-lg` ✅ matches
  `Earn.jsx:61` exactly.

---

## P1 — Hero trust strip placement

- Mock `Earn.jsx` hero has the trust strip **commented out** (“hidden for now”), but the screenshots
  (`earn-hero.png`, `earn2/3.png`) clearly show the 4 trust chips directly under the hero CTA row. Ours
  renders `<TrustStrip />` with `mt-8` under the hero (`EarnHero.svelte:96`) ✅ — matches the screenshot.
  No change. (Again flagged so a JSX-literal pass doesn’t delete it.)
- Trust chip bg should be `bg-white/[0.02]` (see P0 list), text `text-text-2` ✅, check icon
  `text-emerald-400/80` ✅.

---

## P1 — Hero copy differs from JSX but matches screenshots — leave

- H1: ours “Earn 3.53% on your idle dollars.” ✅ matches `earn-hero.png`. (`Earn.jsx:16` reads
  “…on your idle dollars.” too; `earn2.png` shows an alt “…on your dollars. Treasury-backed. No KYC.”
  variant — ours follows `earn-hero.png`.) No change.
- Subhead “Treasury-backed. No KYC. Redeem anytime.” ✅ matches `earn-hero.png`.
- Body paragraph “…then redeem to real shares in under 10 seconds.” ✅ matches screenshots.
- Hero stat labels: ours `BlackRock AUM / Redeem · 24/7 / Permissionless`. Screenshots
  (`earn-hero.png`) show `BLACKROCK AUM / REDEEM · 24/7 / PERMISSIONLESS` (uppercased via the `uppercase`
  class) ✅. Matches.

---

## P2 — Minor token/gradient polish

- [ ] **CTA band gradient tail** — `EarnCTA.svelte:14` `...to-gray-950`; mock (`Earn.jsx:92`) =
      `to-[#070b12]`. Use `to-bg`/literal `to-[#070b12]` (same issue as hero panel). Glow blur
      `bg-emerald-400/15` ✅ matches.
- [ ] **Comparison highlight row tint** — ours `bg-emerald-400/[0.06]` ✅ matches `EarnParts.jsx:113`.
      Highlighted ✓ chip `bg-emerald-400/15`, ✗ chip `bg-red-500/10 text-red-400/80` ✅ (correct red-for-no
      semantic, per brief). No change.
- [ ] **Comparison divider** — ours `divide-line`; mock = `divide-white/[0.05]`. `--line` is
      `rgba(255,255,255,0.07)` (dark), close enough; acceptable, but for exactness use `divide-white/[0.05]`.
- [ ] **FAQ divider** — ours `divide-line`; mock (`EarnParts.jsx:152`) = `divide-white/[0.07]` — these match
      (`--line` = 0.07). ✅
- [ ] **How-it-works connector arrow color** — ours `text-white/15` ✅ matches `Earn.jsx:81`. Good
      (kept literal — note this is the *correct* pattern the surface fixes above should follow).
- [ ] **Slider accent** — `accent-emerald-400` ✅ matches `EarnParts.jsx:33`.
- [ ] **Calculator “/ year”, “/year” spacing & 4xl emerald CountUp** — ✅ matches.
- [ ] **ApyChip** — ping dot + `border-emerald-400/30 bg-emerald-400/10 text-emerald-300`, lg = `px-3 py-1
      text-sm` ✅ exact match to `atoms.jsx:85`.
- [ ] **Sparkline** — geometry, gradient stops (0.35→0), stroke 1.8, color `#34d399` ✅ exact
      (deterministic series, good for SSR).
- [ ] **TokenDisc** — radial gradients + ring shadow `rgba(16,185,129,.18)` ✅ exact match to `atoms.jsx:40`.
      Minor: root has `text-text` but the glyph is the emerald `bank` icon on a gradient; harmless. The mock
      uses `color:#fff` — ours inherits theme text; in light theme the SGOV disc keeps a white-ish glyph
      because EarnIcon is `currentColor`=`text` which flips. Consider hardcoding `text-white` on the disc to
      keep the bank glyph white over the emerald gradient in light mode.

---

## P2 — Light-theme specific (downstream of P0 surfaces)

Once the P0 translucent-surface revert lands, light theme should largely self-correct (overlays tint over
the light page). Re-screenshot after that pass and verify:
- [ ] Pillar / how-it-works / FAQ / choose-yield cards have visible edges (border `border-line` light =
      `rgba(12,22,38,0.09)` is faint — may need `border-white/10` won’t show on light; the mock relies on
      the bg overlay for separation, so confirm cards read as panels).
- [ ] Comparison table rows separate from the page (currently they merge in `ours/earn-light.png`).
- [ ] Emerald-on-gradient text (`text-emerald-300`, `text-emerald-200`) stays legible on the lighter
      calculator/result gradient.

---

## Things that are correct and should NOT be changed

- Section order, `max-w-5xl px-6` wrappers, per-section `py-*` rhythm — all match `Earn.jsx:106-121`.
- All copy (`config/earn.ts`) is verbatim from `data.jsx` (plus the intended newer 4th pillar/FAQ tweaks).
- Primary button style `bg-emerald-500 text-[#05241a] hover:bg-emerald-400` ✅ (mint primary, dark-mint text).
- `font-mono` on calculator numeric tiles ✅ (`EarnParts.jsx:53`).
- Real modal wiring (`openSaveEarn()`) instead of the mock’s static `openDeposit` — correct per brief
  (do not regress to static).
- `EarnIcon` paths — exact; only action is the optional consolidation onto shared `ui/Icon.svelte`.
