# Visual Identity & UX Polish Design Spec

**Date**: 2026-03-13
**Branch**: `ux-improvements`
**Scope**: Visual identity extraction, surface polish, motion, emotional moments, and targeted UX improvements. Core functionality and page structure unchanged.

---

## 1. Brand Color System

### Problem
The logo contains #2D2950 (deep purple) and #E09936 (amber gold) but neither appears in the UI. The current accent is generic Tailwind `yellow-500` (#EAB308). Warning states also use yellow, creating semantic ambiguity.

### Design

**Define brand colors in `tailwind.config.ts`:**

```js
colors: {
  brand: {
    gold: {
      DEFAULT: '#E09936',
      50: '#FEF7EC',
      100: '#FDECD3',
      200: '#FBD5A1',
      300: '#F8BE6F',
      400: '#F0A94B',
      500: '#E09936',
      600: '#C47D1E',
      700: '#9C6218',
      800: '#744A15',
      900: '#4C3212',
    },
    purple: {
      DEFAULT: '#2D2950',
      50: '#EEEDF5',
      100: '#D8D5E8',
      200: '#B1ABCF',
      300: '#8A81B6',
      400: '#635A9A',
      500: '#443D73',
      600: '#363062',
      700: '#2D2950',
      800: '#211E3B',
      900: '#161428',
    },
  },
}
```

**Replace all accent `yellow-500`/`yellow-400` usages with `brand-gold-500`/`brand-gold-400`:**
- Header nav active states
- Tab active states (TabNav)
- CTA button backgrounds
- Focus rings
- Hover states
- Sidebar active border
- Tutorial highlight border
- Footer hover states
- Loading spinner accent

**Separate warning color:** Use `amber-500`/`amber-400` for warning states (currently sharing yellow with accent). This affects QuickTrade liquidity warnings and any other amber/yellow warning banners.

### Files
- `tailwind.config.ts` — color definitions
- ~30 files with yellow-500/400 accent references (global find-and-replace)
- `src/lib/components/QuickTrade.svelte` — warning color separation
- `src/lib/components/orders/MarketOrder.svelte` — warning color separation

---

## 2. Typography: Instrument Serif Hero

### Problem
Instrument Serif is loaded in `app.html` but never used. The hero headline uses DM Sans like everything else, creating no typographic differentiation.

### Design

**Add Instrument Serif to Tailwind config:**
```js
fontFamily: {
  serif: ['Instrument Serif', 'Georgia', 'serif'],
}
```

**Apply to the hero headline** in `src/routes/(main)/+page.svelte`:
- Add `font-serif` class to the h1
- Increase size from `text-3xl sm:text-4xl lg:text-5xl xl:text-6xl` to `text-4xl sm:text-5xl lg:text-6xl xl:text-7xl`
- Change `font-bold` to `font-normal` (serifs look better at regular weight in display sizes)
- Tighten line height with `leading-[1.05]`

**Keep DM Sans for everything else.** The serif is exclusively for the hero headline to create a TradFi-meets-crypto visual tension.

**Gradient text on typewriter words:**
Replace `text-yellow-400` on the typewriter span with:
```
bg-gradient-to-r from-brand-gold-300 to-brand-gold-500 bg-clip-text text-transparent
```

### Files
- `tailwind.config.ts` — font family
- `src/routes/(main)/+page.svelte` — hero h1, typewriter span

---

## 3. Tabular Numerals

### Problem
Prices and balances use proportional DM Sans, causing digit "dancing" when values update.

### Design

Add `tabular-nums` class to all numeric displays:
- `MetricCard.svelte` — value span
- Price cells in landing page asset table
- Sidebar price displays
- Trade page price grid (oracle price, bid, ask, confidence)
- QuickTrade amount displays
- Order form price/amount fields
- Dashboard portfolio values

### Files
- `src/lib/components/ui/MetricCard.svelte`
- `src/routes/(main)/+page.svelte` — table price cells
- `src/lib/components/Sidebar.svelte` — price displays
- `src/routes/(main)/trade/[id]/+page.svelte` — price grid
- `src/lib/components/QuickTrade.svelte` — amounts
- `src/routes/(main)/dashboard/+page.svelte` — portfolio values

---

## 4. Heading Hierarchy Standardization

### Problem
Section headings use ad-hoc sizes. `text-[10px]` labels are too small. No consistent tier system.

### Design

Three heading tiers:
- **H1 (page title):** `text-3xl font-extrabold tracking-tight sm:text-4xl`
- **H2 (section title):** `text-xl font-bold tracking-tight sm:text-2xl`
- **H3 (subsection/label):** `text-xs font-medium uppercase tracking-wider text-gray-400`

Replace all `text-[10px]` data labels with the H3 tier (`text-xs`). Minimum font size is 12px (Tailwind `text-xs`).

### Files
- `src/routes/(main)/trade/[id]/+page.svelte` — data labels at lines 902, 942, 956, 970, 984
- `src/lib/components/Sidebar.svelte` — section labels
- Any other `text-[10px]` usage

---

## 5. Card Surface Treatment

### Problem
The `Card` component has no default background, border, or shadow. Every usage must manually add surface styles, leading to inconsistency. Many card-like containers on the trade page don't use the Card component at all.

### Design

**Give Card a default surface:**
```html
<div class="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gray-800/40 {className} {paddingClass}">
```

This provides a subtle glass-like surface without needing per-usage styling. The `bg-gray-800/40` provides slight elevation over the `bg-gray-900` page background.

**Do NOT change** the QuickTrade widget or trade page panels that already have their own bespoke surface treatments — those are more refined and should stay as-is.

### Files
- `src/lib/components/ui/Card.svelte` — default surface

---

## 6. QuickTrade Glow Halo

### Problem
The QuickTrade widget is the primary conversion element on the landing page but has no visual emphasis beyond a subtle top gradient that is nearly invisible at 50% opacity.

### Design

Wrap the existing QuickTrade container in a glow halo:

```html
<div class="relative">
  <!-- Animated glow -->
  <div class="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-brand-gold-500/20 via-brand-purple-500/20 to-brand-gold-500/20 opacity-75 blur-sm"></div>
  <!-- Existing card (add 'relative' to maintain stacking) -->
  <div class="relative ...existing classes...">
    ...
  </div>
</div>
```

The glow uses brand colors and creates a colored halo that draws the eye.

### Files
- `src/lib/components/QuickTrade.svelte` — outer wrapper (landing page usage only; check if the component is used elsewhere and conditionally apply)

---

## 7. Buy/Sell Button Polish

### Problem
Buy/Sell buttons on the trade page use flat `bg-green-500`/`bg-red-500` with no depth, feedback, or refinement.

### Design

**Buy button:**
```
rounded-xl bg-emerald-500 px-3 py-3 text-sm font-bold text-white
shadow-lg shadow-emerald-500/25
ring-1 ring-inset ring-white/10
transition-all
hover:bg-emerald-400 hover:shadow-xl hover:shadow-emerald-500/30
active:scale-[0.98]
focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-2 focus:ring-offset-gray-900
```

**Sell button:**
Same pattern with `rose-500`/`rose-400` replacing emerald.

The additions: inner ring for dimension, colored shadows for glow, `active:scale-[0.98]` for press feedback, `font-bold` for weight, refined hues (emerald/rose instead of green/red).

### Files
- `src/routes/(main)/trade/[id]/+page.svelte` — buy/sell buttons (~lines 1003-1017)

---

## 8. Background Improvements

### Problem
Background glows are at 5% opacity (invisible). Grid pattern is at 2% (invisible).

### Design

In `src/routes/(main)/+layout.svelte`:

**Increase glow opacity and use brand colors:**
- Yellow glow: `bg-yellow-500/5` → `bg-brand-gold-500/[0.07]`, repositioned centered behind hero
- Blue glow: `bg-blue-500/5` → `bg-brand-purple-500/[0.06]`

**Increase grid pattern opacity:**
- `opacity-[0.02]` → `opacity-[0.04]`

**Add noise texture** in `src/app.css`:
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,...feTurbulence noise SVG...");
  background-repeat: repeat;
  background-size: 256px 256px;
}
```

Extremely subtle (1.5% opacity) grain that adds tactile quality. Used by Hyperliquid and dYdX.

### Files
- `src/routes/(main)/+layout.svelte` — glows and grid
- `src/app.css` — noise texture

---

## 9. Tab Active States: Pill Style

### Problem
Active tabs use a thin 2px bottom border that is minimal and easily missed.

### Design

In `TabNav.svelte`, replace the active state:

**Current:** `border-b-2 border-yellow-500 text-yellow-500`

**New:** `rounded-md bg-brand-gold-500/10 text-brand-gold-400`

Remove the `border-b-2 border-transparent` from inactive tabs since we're switching from underline to pill.

### Files
- `src/lib/components/ui/TabNav.svelte`

---

## 10. Staggered Entrance Animations

### Problem
All content appears instantly. No sense of the page "coming alive."

### Design

**Asset table rows** on the landing page: Apply staggered `fly` transition to each `{#each}` row:
```svelte
{#each processedTokens as token, i (token.id)}
  <tr in:fly={{ y: 10, duration: 300, delay: i * 50 }}>
```

Cap the delay at 10 items (500ms max total) to avoid slow-feeling pages with many tokens.

**Page transitions** in `+layout.svelte`: Wrap the `<slot>` with a keyed fade:
```svelte
{#key $page.url.pathname}
  <div in:fade={{ duration: 150, delay: 50 }}>
    <slot />
  </div>
{/key}
```

Keep transitions fast (150-200ms) so they don't feel sluggish.

### Files
- `src/routes/(main)/+page.svelte` — asset table rows
- `src/routes/(main)/+layout.svelte` — page transition wrapper

---

## 11. Focus Styles Fix

### Problem
`app.css` has `*:focus { outline: none }` which removes focus indicators for keyboard users — a WCAG 2.4.7 violation.

### Design

Replace:
```css
*:focus { outline: none; }
```

With:
```css
*:focus:not(:focus-visible) { outline: none; }
```

This removes outlines for mouse clicks while preserving them for keyboard navigation.

### Files
- `src/app.css`

---

## 12. Transaction Success Celebration

### Problem
After a successful trade, the TransactionModal shows a generic data table and "Close" button. No emotional payoff.

### Design

Enhance the SUCCESS state in `TransactionModal.svelte`:

1. **Animated checkmark**: Replace the static SVG checkmark with a CSS draw animation (stroke-dasharray/stroke-dashoffset technique). The check draws itself over 600ms.

2. **Personalized message**: Below the checkmark, show "You now hold X [token]" calculated from the trade output amount. For sells, show "You received X USDC".

3. **"View in Dashboard" CTA**: Add a secondary button linking to `/dashboard` below the existing transaction link.

Keep the existing transaction summary table — just add the celebration elements above it.

### Files
- `src/lib/components/TransactionModal.svelte` — SUCCESS state block

---

## 13. Remove "Testing/Guardrails" Language

### Problem
The TransactionModal's no-fill message says "During testing we have a guardrail to avoid unfavorable prices." The word "testing" undermines confidence that the platform is production-ready.

### Design

Replace the guardrails message with:
> "Your order was not filled. Our price protection system prevented execution at an unfavorable price. Try again with a smaller amount or adjust your slippage tolerance."

Replace "guardrail" with "price protection" — same concept, professional framing.

### Files
- `src/lib/components/TransactionModal.svelte`

---

## 14. Vault Flow Explainer

### Problem
After deploying a limit order, users must separately understand vault deposits, order cancellation, and vault withdrawals. The VaultTutorial exists but is separate from the order flow context.

### Design

Add a compact 3-step visual explainer in the order summary section of `LimitOrder.svelte` and `DcaOrder.svelte`, visible before the user clicks "Create Order":

```
How limit orders work:
1. Your USDC is deposited into a vault
2. When your order fills, tokens arrive in the vault
3. Withdraw tokens from Dashboard > Vaults
```

Render as a small info box with a collapse/expand toggle (collapsed by default after first view, using localStorage). Style as `border border-white/[0.06] bg-gray-800/40 rounded-lg p-3 text-xs text-gray-400`.

After the order succeeds in TransactionModal, add a reminder line: "When your order fills, withdraw from Dashboard > Vaults" with a link.

### Files
- `src/lib/components/orders/LimitOrder.svelte` — order summary section
- `src/lib/components/orders/DcaOrder.svelte` — order summary section
- `src/lib/components/TransactionModal.svelte` — post-deployment success state

---

## 15. Custom Error Page

### Problem
No custom error page exists. Users hitting a 404 or error see the SvelteKit default.

### Design

Create `src/routes/+error.svelte` with:
- Brand-styled dark page matching the app theme
- Large friendly message: "Page not found" (404) or "Something went wrong" (other errors)
- "Go home" button linking to `/`
- "Visit the trading terminal" secondary link
- Use the brand gold accent for the CTA

Keep it simple — no animations or complex layouts.

### Files
- `src/routes/+error.svelte` (new file)

---

## 16. Tutorial Completion CTA

### Problem
The tutorial ends at the "fundamentals" step with a "Finish" button that silently navigates home. No summary, no achievement, no call to action.

### Design

Change the final tutorial step behavior:
- Instead of navigating home and calling `completeTutorial()`, show a completion modal with:
  - "You're all set!" heading
  - Brief summary: "You've seen the markets, the trading terminal, and the on-chain data. Ready to make your first trade?"
  - Primary CTA: "Start Trading" → navigates to the trade page
  - Secondary: "Back to Markets" → navigates home
- Store completion in localStorage (existing behavior via `completeTutorial()`)

### Implementation
- Add a `complete` step view to the Tutorial component (currently the `complete` step has empty content)
- The complete step renders as a modal (like the `welcome` step) with the CTA content above

### Files
- `src/lib/components/Tutorial.svelte` — complete step content and navigation
- `src/lib/stores/tutorialStore.ts` — may need to adjust step flow

---

## Excluded from Scope

- Hero headline rewrite (keep current "Tokenised Equities." + typewriter)
- QuickTrade label/micro-copy
- Access code flow changes
- Navigation restructuring
- Sidebar price change percentages (future work)
- Skeleton loading screens (future work)
- Hexagonal motif (future work)
- `prefers-reduced-motion` support (future work)
- Scroll-triggered animations (future work)

---

## Implementation Order

1. Brand colors in Tailwind config (foundation for everything else)
2. Global accent color replacement (yellow → brand-gold)
3. Focus styles fix (quick accessibility win)
4. Typography: Instrument Serif hero + heading hierarchy + tabular-nums
5. Card surface treatment
6. Background improvements (glows, grid, noise)
7. Buy/sell button polish
8. QuickTrade glow halo
9. Tab active states
10. Staggered entrance animations + page transitions
11. Transaction success celebration
12. Remove testing/guardrails language
13. Vault flow explainer
14. Custom error page
15. Tutorial completion CTA
