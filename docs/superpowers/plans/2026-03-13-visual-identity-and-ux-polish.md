# Visual Identity & UX Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the brand identity from the ST0x logo into the UI, polish surfaces/motion/typography, and add targeted UX improvements (transaction celebration, vault explainer, error page, tutorial CTA).

**Architecture:** Pure visual/CSS changes across ~35 existing files plus 1 new file (`+error.svelte`). No logic changes, no new stores, no API changes. The brand color tokens in Tailwind config are the foundation — they must land first because every subsequent task references `brand-gold-*` and `brand-purple-*`.

**Tech Stack:** Svelte 4, Tailwind CSS 3, SvelteKit 2

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `tailwind.config.ts` | Brand color scales, font family |
| Modify | `src/app.css` | Focus fix, noise texture, legacy cleanup |
| Modify | `src/lib/components/ui/Card.svelte` | Default surface treatment |
| Modify | `src/lib/components/ui/TabNav.svelte` | Pill active state |
| Modify | `src/lib/components/ui/Button.svelte` | Focus ring color |
| Modify | `src/lib/components/ui/MetricCard.svelte` | Change class, tabular-nums |
| Modify | `src/lib/components/ui/Input.svelte` | Focus ring color |
| Modify | `src/lib/components/ui/Modal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/ui/ModalTabs.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/ui/Select.svelte` | Focus ring color |
| Modify | `src/lib/components/ui/InfoBlock.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/Header.svelte` | Nav active states, button colors |
| Modify | `src/lib/components/Footer.svelte` | Hover colors, risk warning color |
| Modify | `src/lib/components/Sidebar.svelte` | Active border, label size, tabular-nums |
| Modify | `src/lib/components/LoadingSpinner.svelte` | Brand colors on spinner |
| Modify | `src/lib/components/QuickTrade.svelte` | Glow halo, warning separation, tabular-nums |
| Modify | `src/lib/components/TransactionModal.svelte` | Celebration, guardrails copy, vault reminder, yellow→brand-gold |
| Modify | `src/lib/components/Tutorial.svelte` | Completion CTA, highlight colors |
| Modify | `src/lib/components/VaultTutorial.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/DepositModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/SendFundsModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/AccessCodeModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/TokenSwapModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/WrapUnwrapModal.svelte` | text-[10px]→text-xs |
| Modify | `src/lib/components/NetworkSelector.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/WalletConnect.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/DocsSidebar.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/OldTokensBanner.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/TokenSelect.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/VaultIdInput.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/orders/MarketOrder.svelte` | Warning separation, tabular-nums |
| Modify | `src/lib/components/orders/LimitOrder.svelte` | Vault explainer, yellow→brand-gold |
| Modify | `src/lib/components/orders/DcaOrder.svelte` | Vault explainer, yellow→brand-gold |
| Modify | `src/lib/components/orders/OrdersTable.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/referrals/ReferralButton.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/referrals/ReferralJoinModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/referrals/ReferralDashboardModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/referrals/ReferralLeaderboardModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/rewards/RewardsDisplay.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/rewards/RewardsDetailsModal.svelte` | Yellow→brand-gold |
| Modify | `src/lib/components/rewards/RewardsLeaderboardModal.svelte` | Yellow→brand-gold |
| Modify | `src/routes/(main)/+page.svelte` | Hero typography, gradient text, table animations, trust indicator colors, table hover, tabular-nums |
| Modify | `src/routes/(main)/+layout.svelte` | Background glows, grid opacity, page transition |
| Modify | `src/routes/(main)/trade/[id]/+page.svelte` | Buy/sell buttons, data label sizes, tabular-nums |
| Modify | `src/routes/(main)/dashboard/+page.svelte` | Yellow→brand-gold, tabular-nums |
| Modify | `src/routes/(main)/platform-metrics/+page.svelte` | Yellow→brand-gold |
| Modify | `src/routes/(main)/strategies/+page.svelte` | Yellow→brand-gold |
| Modify | `src/routes/(main)/terms/+page.svelte` | Yellow→brand-gold |
| Modify | `src/routes/docs/+layout.svelte` | Yellow→brand-gold |
| Modify | `src/lib/stores/tutorialStore.ts` | Tutorial completion step flow |
| Create | `src/routes/+error.svelte` | Custom error page |

---

## Chunk 1: Foundation (Tailwind config + global CSS)

### Task 1: Add brand colors and font family to Tailwind config

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add brand color scales and font family**

In `tailwind.config.ts`, add inside `theme.extend`:

```ts
colors: {
  primary: '#4c77ba',
  gray: { ...neutral },
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
},
fontFamily: {
  serif: ['Instrument Serif', 'Georgia', 'serif'],
},
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds with new color tokens available

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add brand color scales and serif font family to Tailwind config"
```

### Task 2: Fix focus styles and add noise texture

**Files:**
- Modify: `src/app.css`

- [ ] **Step 1: Replace global focus removal with focus-visible**

In `src/app.css`, replace lines 14-16:

```css
*:focus {
	outline: none;
}
```

With:

```css
*:focus:not(:focus-visible) {
	outline: none;
}
```

- [ ] **Step 2: Add noise texture**

After the focus rule, add:

```css
body::before {
	content: '';
	position: fixed;
	inset: 0;
	z-index: 9999;
	pointer-events: none;
	opacity: 0.015;
	background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
	background-repeat: repeat;
	background-size: 256px 256px;
}
```

- [ ] **Step 3: Verify dev server shows no regressions**

Run: `npm run dev` and visually confirm the noise texture is barely perceptible and focus outlines appear on keyboard tab.

- [ ] **Step 4: Commit**

```bash
git add src/app.css
git commit -m "fix: replace global focus removal with focus-visible, add subtle noise texture"
```

---

## Chunk 2: Global accent color replacement (yellow → brand-gold)

### Task 3: Replace yellow accent in UI foundation components

**Files:**
- Modify: `src/lib/components/ui/Button.svelte`
- Modify: `src/lib/components/ui/Input.svelte`
- Modify: `src/lib/components/ui/Modal.svelte`
- Modify: `src/lib/components/ui/ModalTabs.svelte`
- Modify: `src/lib/components/ui/MetricCard.svelte`
- Modify: `src/lib/components/ui/Select.svelte`
- Modify: `src/lib/components/ui/InfoBlock.svelte`
- Modify: `src/lib/components/ui/Card.svelte`

- [ ] **Step 1: Update Button.svelte focus ring**

In `Button.svelte` line 31, replace `focus:ring-yellow-500/30` with `focus:ring-brand-gold-500/30`.

- [ ] **Step 2: Update Input.svelte focus border**

In `Input.svelte`, replace all `yellow-500` references with `brand-gold-500`.

- [ ] **Step 3: Update Modal.svelte**

Replace all `yellow-` references with `brand-gold-` equivalents.

- [ ] **Step 4: Update ModalTabs.svelte**

Replace all `yellow-` references with `brand-gold-` equivalents.

- [ ] **Step 5: Update MetricCard.svelte**

Replace `text-yellow-500` in the default `changeClass` (line 8) with `text-brand-gold-500`.

- [ ] **Step 6: Update Select.svelte**

Replace all `yellow-` references with `brand-gold-` equivalents.

- [ ] **Step 7: Update InfoBlock.svelte**

Replace all `yellow-` references with `brand-gold-` equivalents.

- [ ] **Step 8: Update Card.svelte hover gradient**

In `Card.svelte` line 10, replace `to-yellow-500` with `to-brand-gold-500`.

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/ui/
git commit -m "feat: replace yellow accent with brand-gold in UI foundation components"
```

### Task 4: Replace yellow accent in layout components

**Files:**
- Modify: `src/lib/components/Header.svelte`
- Modify: `src/lib/components/Footer.svelte`
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/lib/components/LoadingSpinner.svelte`

- [ ] **Step 1: Update Header.svelte**

Replace all `yellow-500` with `brand-gold-500`, `yellow-400` with `brand-gold-400`, `yellow-800` with `brand-gold-800`, `yellow-600` with `brand-gold-600` throughout the file.

- [ ] **Step 2: Update Footer.svelte**

Replace all `yellow-500` with `brand-gold-500`, `yellow-600` with `brand-gold-600`.

- [ ] **Step 3: Update Sidebar.svelte**

Replace `border-yellow-500` with `border-brand-gold-500`, `bg-yellow-500` with `bg-brand-gold-500`, `text-yellow-400` with `text-brand-gold-400`, `text-yellow-300` with `text-brand-gold-300`, `shadow-yellow-500` with `shadow-brand-gold-500`, `hover:border-yellow-500` with `hover:border-brand-gold-500`.

- [ ] **Step 4: Update LoadingSpinner.svelte**

Replace `border-t-yellow-500` with `border-t-brand-gold-500` and `bg-yellow-500` with `bg-brand-gold-500` in the dot variant.

Also update the fullscreen variant glow: replace `to-yellow-500` with `to-brand-gold-500`.

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Header.svelte src/lib/components/Footer.svelte src/lib/components/Sidebar.svelte src/lib/components/LoadingSpinner.svelte
git commit -m "feat: replace yellow accent with brand-gold in layout components"
```

### Task 5: Replace yellow accent in feature components

**Files:**
- Modify: `src/lib/components/TransactionModal.svelte`
- Modify: `src/lib/components/Tutorial.svelte`
- Modify: `src/lib/components/VaultTutorial.svelte`
- Modify: `src/lib/components/DepositModal.svelte`
- Modify: `src/lib/components/SendFundsModal.svelte`
- Modify: `src/lib/components/AccessCodeModal.svelte`
- Modify: `src/lib/components/TokenSwapModal.svelte`
- Modify: `src/lib/components/NetworkSelector.svelte`
- Modify: `src/lib/components/WalletConnect.svelte`
- Modify: `src/lib/components/DocsSidebar.svelte`
- Modify: `src/lib/components/OldTokensBanner.svelte`
- Modify: `src/lib/components/TokenSelect.svelte`
- Modify: `src/lib/components/VaultIdInput.svelte`

- [ ] **Step 1: Replace yellow→brand-gold in each file**

For every file listed above, replace:
- `yellow-500` → `brand-gold-500`
- `yellow-400` → `brand-gold-400`
- `yellow-300` → `brand-gold-300`
- `yellow-600` → `brand-gold-600`
- `yellow-800` → `brand-gold-800`
- `yellow-900` → `brand-gold-900`

**Exception:** In `TransactionModal.svelte`, the `border-yellow-500/30 bg-yellow-500/20` on the multi-tx icon (line 327) and user rejection icon (line 69) should stay as-is — these are warning/caution states, not accent. Change them to `amber-500` instead. Also change `text-yellow-500` on the warning icons (lines 76, 331) to `text-amber-500`.

**Exception:** In `QuickTrade.svelte` (handled in Task 6 separately).

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/TransactionModal.svelte src/lib/components/Tutorial.svelte src/lib/components/VaultTutorial.svelte src/lib/components/DepositModal.svelte src/lib/components/SendFundsModal.svelte src/lib/components/AccessCodeModal.svelte src/lib/components/TokenSwapModal.svelte src/lib/components/NetworkSelector.svelte src/lib/components/WalletConnect.svelte src/lib/components/DocsSidebar.svelte src/lib/components/OldTokensBanner.svelte src/lib/components/TokenSelect.svelte src/lib/components/VaultIdInput.svelte
git commit -m "feat: replace yellow accent with brand-gold in feature components"
```

### Task 6: Replace yellow accent in order components and QuickTrade

**Files:**
- Modify: `src/lib/components/QuickTrade.svelte`
- Modify: `src/lib/components/orders/MarketOrder.svelte`
- Modify: `src/lib/components/orders/LimitOrder.svelte`
- Modify: `src/lib/components/orders/DcaOrder.svelte`
- Modify: `src/lib/components/orders/OrdersTable.svelte`

- [ ] **Step 1: Update QuickTrade.svelte**

Replace all `yellow-` accent references with `brand-gold-`.

**Warning separation:** The liquidity/market hours warnings (around lines 856-865) should use `amber-` instead of `brand-gold-`:
- `bg-yellow-900/20` → `bg-amber-900/20`
- `border-yellow-900/50` → `border-amber-900/50`
- `text-yellow-200` → `text-amber-200`
- `text-yellow-600` → `text-amber-600`

All other `yellow-` usages (focus rings, CTA, active states) → `brand-gold-`.

- [ ] **Step 2: Update MarketOrder.svelte**

Same pattern: accent `yellow-` → `brand-gold-`, warning states → `amber-`.

- [ ] **Step 3: Update LimitOrder.svelte and DcaOrder.svelte**

Replace `yellow-` → `brand-gold-` for accent uses. The `focus:border-yellow-500/50` in vault select (LimitOrder line 490) → `focus:border-brand-gold-500/50`.

- [ ] **Step 4: Update OrdersTable.svelte**

Replace `yellow-` → `brand-gold-`.

- [ ] **Step 5: Verify build**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/QuickTrade.svelte src/lib/components/orders/
git commit -m "feat: replace yellow accent with brand-gold in trade components, separate warning color to amber"
```

### Task 7: Replace yellow accent in referral, rewards, and route pages

**Files:**
- Modify: `src/lib/components/referrals/ReferralButton.svelte`
- Modify: `src/lib/components/referrals/ReferralJoinModal.svelte`
- Modify: `src/lib/components/referrals/ReferralDashboardModal.svelte`
- Modify: `src/lib/components/referrals/ReferralLeaderboardModal.svelte`
- Modify: `src/lib/components/rewards/RewardsDisplay.svelte`
- Modify: `src/lib/components/rewards/RewardsDetailsModal.svelte`
- Modify: `src/lib/components/rewards/RewardsLeaderboardModal.svelte`
- Modify: `src/routes/(main)/+page.svelte`
- Modify: `src/routes/(main)/dashboard/+page.svelte`
- Modify: `src/routes/(main)/platform-metrics/+page.svelte`
- Modify: `src/routes/(main)/strategies/+page.svelte`
- Modify: `src/routes/(main)/terms/+page.svelte`
- Modify: `src/routes/docs/+layout.svelte`

- [ ] **Step 1: Replace yellow→brand-gold in all referral/reward components**

Standard replacement in all 7 referral/reward files.

- [ ] **Step 2: Replace yellow→brand-gold in route pages**

In `+page.svelte` (landing): Replace `yellow-500`, `yellow-400` with `brand-gold-500`, `brand-gold-400`. The trust indicator circles (`bg-yellow-500/10`, `text-yellow-500`) become `bg-brand-gold-500/10`, `text-brand-gold-500`. The CTA button (`bg-yellow-500`) becomes `bg-brand-gold-500`. The typewriter text color handled separately in Task 8.

In `dashboard/+page.svelte`, `platform-metrics/+page.svelte`, `strategies/+page.svelte`, `terms/+page.svelte`, `docs/+layout.svelte`: Standard replacement.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/referrals/ src/lib/components/rewards/ src/routes/
git commit -m "feat: replace yellow accent with brand-gold in referrals, rewards, and route pages"
```

---

## Chunk 3: Typography, card surfaces, backgrounds

### Task 8: Hero typography and gradient typewriter text

**Files:**
- Modify: `src/routes/(main)/+page.svelte`

- [ ] **Step 1: Update hero h1 classes**

At line 217-219, change:
```
class="mb-6 text-3xl font-bold tracking-tight text-white sm:mb-8 sm:text-4xl lg:text-5xl xl:text-6xl"
```
To:
```
class="mb-8 font-serif text-4xl font-normal leading-[1.05] tracking-tight text-white sm:mb-10 sm:text-5xl lg:text-6xl xl:text-7xl"
```

- [ ] **Step 2: Add gradient to typewriter text**

At line 221, change:
```
<span class="text-yellow-400">{displayedText}</span><span class="animate-blink text-yellow-400">|</span>
```
To:
```
<span class="bg-gradient-to-r from-brand-gold-300 to-brand-gold-500 bg-clip-text text-transparent">{displayedText}</span><span class="animate-blink text-brand-gold-400">|</span>
```

- [ ] **Step 3: Verify visually in dev server**

Run: `npm run dev` and check the hero looks correct — Instrument Serif font, larger size, gradient text on the typewriter word.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(main)/+page.svelte
git commit -m "feat: apply Instrument Serif to hero headline with gradient typewriter text"
```

### Task 9: Tabular numerals, heading hierarchy, text-[10px] cleanup

**Files:**
- Modify: `src/lib/components/ui/MetricCard.svelte`
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/routes/(main)/+page.svelte`
- Modify: `src/routes/(main)/trade/[id]/+page.svelte`
- Modify: `src/routes/(main)/dashboard/+page.svelte`
- Modify: `src/lib/components/Footer.svelte`
- Modify: `src/lib/components/TokenSwapModal.svelte`
- Modify: `src/lib/components/WrapUnwrapModal.svelte`

- [ ] **Step 1: Add tabular-nums to MetricCard value**

In `MetricCard.svelte` line 19, change:
```
<span class={'block ' + valueClass}>{value}</span>
```
To:
```
<span class={'block tabular-nums ' + valueClass}>{value}</span>
```

- [ ] **Step 2: Add tabular-nums to Sidebar prices and fix label size**

In `Sidebar.svelte` line 136, change `text-[10px]` to `text-xs`:
```
<div class="mb-3 px-2 text-xs font-medium uppercase tracking-wider text-gray-400">
```

In line 172, add `tabular-nums`:
```
<div class="tabular-nums text-sm font-medium text-white">
```

- [ ] **Step 3: Add tabular-nums to landing page price cells**

In `+page.svelte` around line 470, add `tabular-nums` to the price display div:
```
<div class="tabular-nums font-medium text-white">
```

Also add `tabular-nums` to TVL, supply, and holders cells.

- [ ] **Step 4: Fix text-[10px] on trade page**

In `trade/[id]/+page.svelte`, replace all `text-[10px]` with `text-xs` at lines 902, 942, 956, 970, 984, 1815, 1882, 1909. Add `tabular-nums` to the price value spans in the data grid section.

- [ ] **Step 5: Fix text-[10px] in Footer**

In `Footer.svelte` line 73, change `text-[10px]` to `text-xs`.

- [ ] **Step 6: Fix text-[10px] in TokenSwapModal and WrapUnwrapModal**

In both files, change `text-[10px]` to `text-xs` in the percentage buttons.

- [ ] **Step 7: Add tabular-nums to dashboard portfolio values**

In `dashboard/+page.svelte`, add `tabular-nums` to price/value display spans.

- [ ] **Step 8: Verify build**

Run: `npm run build`

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/ui/MetricCard.svelte src/lib/components/Sidebar.svelte src/routes/(main)/+page.svelte src/routes/(main)/trade/[id]/+page.svelte src/routes/(main)/dashboard/+page.svelte src/lib/components/Footer.svelte src/lib/components/TokenSwapModal.svelte src/lib/components/WrapUnwrapModal.svelte
git commit -m "feat: add tabular-nums to numeric displays, replace text-[10px] with text-xs"
```

### Task 10: Card surface treatment

**Files:**
- Modify: `src/lib/components/ui/Card.svelte`

- [ ] **Step 1: Add default surface to Card**

In `Card.svelte` line 7, change:
```svelte
<div class={'group relative overflow-hidden rounded-xl ' + className + ' ' + paddingClass}>
```
To:
```svelte
<div class={'group relative overflow-hidden rounded-xl border border-white/[0.06] bg-gray-800/40 ' + className + ' ' + paddingClass}>
```

- [ ] **Step 2: Verify visually — check MetricCards on dashboard**

Run: `npm run dev`, navigate to `/dashboard` and verify MetricCards now have a visible surface.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/Card.svelte
git commit -m "feat: add default glass surface treatment to Card component"
```

### Task 11: Background improvements

**Files:**
- Modify: `src/routes/(main)/+layout.svelte`

- [ ] **Step 1: Update grid opacity**

At line 99, change `opacity-[0.02]` to `opacity-[0.04]`.

- [ ] **Step 2: Update radial glows with brand colors and higher opacity**

At lines 103-108, replace the two glow divs:

Replace the yellow glow (line 103-105):
```html
<div class="absolute left-1/4 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-500/5 blur-3xl"></div>
```
With:
```html
<div class="absolute left-1/2 top-1/3 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gold-500/[0.07] blur-[120px]"></div>
```

Replace the blue glow (line 106-108):
```html
<div class="absolute bottom-1/4 right-1/4 h-[500px] w-[500px] translate-x-1/2 translate-y-1/2 rounded-full bg-blue-500/5 blur-3xl"></div>
```
With:
```html
<div class="absolute bottom-0 right-1/4 h-[600px] w-[600px] rounded-full bg-brand-purple-500/[0.06] blur-[100px]"></div>
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev` and check that the background glows are now subtly visible.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(main)/+layout.svelte
git commit -m "feat: improve background glows with brand colors and increased visibility"
```

---

## Chunk 4: Component polish (buttons, tabs, glow, animations)

### Task 12: Buy/Sell button polish

**Files:**
- Modify: `src/routes/(main)/trade/[id]/+page.svelte`

- [ ] **Step 1: Replace Buy button classes**

Find the Buy button (around line 1003-1009). Replace its class with:
```
rounded-xl bg-emerald-500 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 ring-1 ring-inset ring-white/10 transition-all hover:bg-emerald-400 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:px-4 sm:py-3.5 sm:text-base
```

- [ ] **Step 2: Replace Sell button classes**

Find the Sell button (around line 1010-1017). Replace its class with:
```
rounded-xl bg-rose-500 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/25 ring-1 ring-inset ring-white/10 transition-all hover:bg-rose-400 hover:shadow-xl hover:shadow-rose-500/30 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:px-4 sm:py-3.5 sm:text-base
```

- [ ] **Step 3: Verify visually on trade page**

Run: `npm run dev`, navigate to a trade page, verify Buy (emerald) and Sell (rose) buttons look polished with shadows and press feedback.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(main)/trade/[id]/+page.svelte
git commit -m "feat: polish buy/sell buttons with emerald/rose colors, shadows, and press feedback"
```

### Task 13: Tab active states → pill style

**Files:**
- Modify: `src/lib/components/ui/TabNav.svelte`

- [ ] **Step 1: Replace active/inactive tab styles**

In `TabNav.svelte` lines 59-62, change:
```svelte
class={'flex-shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
  (activeId === tab.id
    ? 'border-yellow-500 text-yellow-500'
    : 'border-transparent text-gray-400 hover:text-white')}
```
To:
```svelte
class={'flex-shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ' +
  (activeId === tab.id
    ? 'bg-brand-gold-500/10 text-brand-gold-400'
    : 'text-gray-400 hover:text-white')}
```

Also in the parent div (line 47), remove `border-b border-white/10` since we no longer need the underline container:
```svelte
class={'flex gap-2 overflow-x-auto ' + className}
```

- [ ] **Step 2: Verify visually**

Check tabs on the trade page and dashboard to ensure pill style works.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/TabNav.svelte
git commit -m "feat: switch TabNav active state from underline to pill style"
```

### Task 14: QuickTrade glow halo

**Files:**
- Modify: `src/lib/components/QuickTrade.svelte`

- [ ] **Step 1: Add glow wrapper around the main container**

Find the outermost container div of the QuickTrade widget (around line 797-798, the `<div class="w-full max-w-md">` wrapper). Wrap it with a glow halo:

Add an outer wrapper with `class="relative"`, then insert a glow div before the existing card:
```html
<div class="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-brand-gold-500/20 via-brand-purple-500/20 to-brand-gold-500/20 opacity-75 blur-sm"></div>
```

Add `relative` to the existing card div to maintain stacking context.

- [ ] **Step 2: Verify visually on landing page**

Run: `npm run dev`, check that the QuickTrade widget has a subtle colored glow around it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/QuickTrade.svelte
git commit -m "feat: add brand-colored glow halo to QuickTrade widget"
```

### Task 15: Staggered table row animations and page transitions

**Files:**
- Modify: `src/routes/(main)/+page.svelte`
- Modify: `src/routes/(main)/+layout.svelte`

- [ ] **Step 1: Add fly import to landing page**

At the top of `+page.svelte`, add to the existing imports:
```ts
import { fly } from 'svelte/transition';
```

- [ ] **Step 2: Add staggered fly to table rows**

At line 449 (the `<tr>` inside `{#each processedTokens ...}`), add:
```svelte
<tr
  in:fly={{ y: 10, duration: 300, delay: Math.min(i * 50, 500) }}
  class="cursor-pointer transition-all hover:bg-brand-gold-500/5"
  ...
>
```

Note: The `i` variable is available from the `{#each processedTokens as token, i (token.id)}` — verify this already has the index `i` in the each block. If not, add `, i` after `token`.

- [ ] **Step 3: Add page transition to layout**

In `+layout.svelte`, add import at top:
```ts
import { fade } from 'svelte/transition';
import { page } from '$app/stores';
```

Note: `page` is likely already imported. Only add `fade` from `svelte/transition`.

Wrap the `<slot>` at line 165 with:
```svelte
{#key $page.url.pathname}
  <div in:fade={{ duration: 150, delay: 50 }}>
    <slot {sidebarExpanded} />
  </div>
{/key}
```

- [ ] **Step 4: Verify animations work**

Run: `npm run dev`, check that table rows stagger in on the landing page and page transitions are smooth.

- [ ] **Step 5: Commit**

```bash
git add src/routes/(main)/+page.svelte src/routes/(main)/+layout.svelte
git commit -m "feat: add staggered row entrance animations and page transitions"
```

---

## Chunk 5: UX improvements (transaction celebration, guardrails copy, vault explainer, error page, tutorial CTA)

### Task 16: Transaction success celebration and guardrails copy

**Files:**
- Modify: `src/lib/components/TransactionModal.svelte`

- [ ] **Step 1: Add animated checkmark CSS**

Add a `<style>` block at the bottom of the file:

```svelte
<style>
  .checkmark-circle {
    stroke-dasharray: 166;
    stroke-dashoffset: 166;
    animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
  }
  .checkmark-check {
    stroke-dasharray: 48;
    stroke-dashoffset: 48;
    animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.4s forwards;
  }
  @keyframes stroke {
    100% { stroke-dashoffset: 0; }
  }
</style>
```

- [ ] **Step 2: Replace static checkmark with animated version**

In the SUCCESS block (around lines 156-172), replace the static SVG checkmark with:

```svelte
<div class="mb-6 flex h-20 w-20 items-center justify-center" data-testid="success-icon">
  <svg class="h-20 w-20" viewBox="0 0 52 52" fill="none">
    <circle class="checkmark-circle" cx="26" cy="26" r="25" stroke="#22c55e" stroke-width="2" fill="none" />
    <path class="checkmark-check" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke="#22c55e" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</div>
```

- [ ] **Step 3: Add personalized message**

After the success status text (around line 176), add a personalized holding message:

```svelte
{#if marketOrderDisplay && !marketOrderDisplay.isNoFill}
  <p class="text-base font-medium text-white">
    {#if marketOrderDisplay.direction === 'Buy'}
      You now hold {formatQuantity(marketOrderDisplay.assetAmount, marketOrderDisplay.assetDecimals)} {marketOrderDisplay.assetSymbol}
    {:else}
      You received {formatQuantity(marketOrderDisplay.paymentAmount, marketOrderDisplay.paymentDecimals)} {marketOrderDisplay.paymentSymbol}
    {/if}
  </p>
{/if}
```

Note: Check if `marketOrderDisplay` has `paymentAmount` and `paymentDecimals` fields. If not, just show the asset amount for both buy and sell:
```svelte
{#if marketOrderDisplay && !marketOrderDisplay.isNoFill}
  <p class="text-base font-medium text-white">
    {marketOrderDisplay.direction === 'Buy' ? 'You now hold' : 'You sold'}
    {formatQuantity(marketOrderDisplay.assetAmount, marketOrderDisplay.assetDecimals)} {marketOrderDisplay.assetSymbol}
  </p>
{/if}
```

- [ ] **Step 4: Add "View in Dashboard" button**

After the existing "View transaction" TxLink in the success block (around line 292), add:

```svelte
<a
  href="/dashboard"
  class="inline-flex items-center gap-1 text-sm text-brand-gold-500 transition-colors hover:text-brand-gold-400 hover:underline"
>
  View in Dashboard
  <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
  </svg>
</a>
```

- [ ] **Step 5: Add vault reminder for limit/DCA deployments**

After the `assetTokenInfo` track-in-wallet button (around line 318), add:

```svelte
{#if assetTokenInfo && !marketOrderDisplay}
  <p class="mt-2 text-xs text-gray-400">
    When your order fills, withdraw tokens from
    <a href="/dashboard" class="text-brand-gold-500 hover:text-brand-gold-400 hover:underline">Dashboard &gt; Vaults</a>.
  </p>
{/if}
```

- [ ] **Step 6: Replace guardrails language**

At lines 211-214, replace:
```
No tokens available within 10% of oracle prices. During testing we have a guardrail to avoid unfavorable prices. If you still want to make this purchase, use a limit order and specify the desired price.
```
With:
```
Your order was not filled. Our price protection system prevented execution at an unfavorable price. Try again with a smaller amount, or use a limit order to specify your desired price.
```

At lines 249-253, replace:
```
Partial fill: not all requested quantity was available within slippage tolerance. We currently have a guardrail to avoid unfavorable prices. To ignore guardrails, use a limit order.
```
With:
```
Partial fill: not all requested quantity was available within your slippage tolerance. Use a limit order to specify an exact price.
```

- [ ] **Step 7: Verify build and visual**

Run: `npm run build`

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/TransactionModal.svelte
git commit -m "feat: add animated checkmark celebration, personalized message, vault reminder, and replace guardrails language"
```

### Task 17: Vault flow explainer in order forms

**Files:**
- Modify: `src/lib/components/orders/LimitOrder.svelte`
- Modify: `src/lib/components/orders/DcaOrder.svelte`

- [ ] **Step 1: Add vault explainer to LimitOrder**

After the Order Summary section (around line 454, after the closing `</div>` of the summary card), add:

```svelte
<!-- Vault flow explainer -->
<details class="rounded-lg border border-white/[0.06] bg-gray-800/40 p-3">
  <summary class="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-300">
    How do limit orders work?
  </summary>
  <ol class="mt-2 space-y-1.5 text-xs text-gray-400">
    <li class="flex items-start gap-2">
      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-gold-500/10 text-[10px] font-bold text-brand-gold-400">1</span>
      Your {orderSide === 'Buy' ? settlementLabel : assetToken.symbol} is deposited into a vault
    </li>
    <li class="flex items-start gap-2">
      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-gold-500/10 text-[10px] font-bold text-brand-gold-400">2</span>
      When your order fills, tokens arrive in the vault
    </li>
    <li class="flex items-start gap-2">
      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-gold-500/10 text-[10px] font-bold text-brand-gold-400">3</span>
      Withdraw tokens from <a href="/dashboard" class="text-brand-gold-500 hover:underline">Dashboard &gt; Vaults</a>
    </li>
  </ol>
</details>
```

- [ ] **Step 2: Add vault explainer to DcaOrder**

Add the same explainer after the DCA Order Summary section (around line 396), with text adjusted:

```svelte
<details class="rounded-lg border border-white/[0.06] bg-gray-800/40 p-3">
  <summary class="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-300">
    How do DCA orders work?
  </summary>
  <ol class="mt-2 space-y-1.5 text-xs text-gray-400">
    <li class="flex items-start gap-2">
      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-gold-500/10 text-[10px] font-bold text-brand-gold-400">1</span>
      Your funds are deposited into a vault
    </li>
    <li class="flex items-start gap-2">
      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-gold-500/10 text-[10px] font-bold text-brand-gold-400">2</span>
      Orders execute automatically at your chosen interval
    </li>
    <li class="flex items-start gap-2">
      <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-gold-500/10 text-[10px] font-bold text-brand-gold-400">3</span>
      Withdraw tokens from <a href="/dashboard" class="text-brand-gold-500 hover:underline">Dashboard &gt; Vaults</a>
    </li>
  </ol>
</details>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/orders/LimitOrder.svelte src/lib/components/orders/DcaOrder.svelte
git commit -m "feat: add vault flow explainer to limit and DCA order forms"
```

### Task 18: Custom error page

**Files:**
- Create: `src/routes/+error.svelte`

- [ ] **Step 1: Create error page**

Create `src/routes/+error.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-900 px-4">
	<div class="text-center">
		<p class="text-6xl font-extrabold tabular-nums text-brand-gold-500">
			{$page.status}
		</p>
		<h1 class="mt-4 text-2xl font-bold text-white sm:text-3xl">
			{#if $page.status === 404}
				Page not found
			{:else}
				Something went wrong
			{/if}
		</h1>
		<p class="mt-3 text-base text-gray-400">
			{#if $page.status === 404}
				The page you're looking for doesn't exist or has been moved.
			{:else if $page.error?.message}
				{$page.error.message}
			{:else}
				An unexpected error occurred. Please try again.
			{/if}
		</p>
		<div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
			<a href="/">
				<Button variant="primary">Go home</Button>
			</a>
			<a href="/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95">
				<Button variant="ghost">Visit the trading terminal</Button>
			</a>
		</div>
	</div>
</div>
```

- [ ] **Step 2: Verify by navigating to a non-existent route**

Run: `npm run dev`, navigate to `/nonexistent-page`, verify the custom error page renders.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+error.svelte
git commit -m "feat: add custom error page with brand styling"
```

### Task 19: Tutorial completion CTA

**Files:**
- Modify: `src/lib/components/Tutorial.svelte`
- Modify: `src/lib/stores/tutorialStore.ts`

- [ ] **Step 1: Add content for the complete step**

In `Tutorial.svelte`, update the `stepContent` record's `complete` entry (around line 92-96):

```ts
complete: {
  title: "You're all set!",
  description:
    "You've seen the markets, the trading terminal, and the on-chain data. Ready to make your first trade?",
  buttonText: 'Start Trading',
  isModal: true
}
```

- [ ] **Step 2: Update handleNext for the complete step**

In the `handleNext` function (around line 194-216), update the `complete` handling. Currently at lines 208-211:

```ts
if (next === 'complete') {
  await goto('/');
  completeTutorial();
}
```

Change to:

```ts
if (next === 'complete') {
  // Don't navigate or complete yet — show the completion modal
  // The complete step is now a modal with its own CTAs
}
```

- [ ] **Step 3: Add completion modal CTA buttons**

In the template section where the modal steps render (around line 382-392), the "Skip tutorial" button and the main button already render for modal steps. We need to differentiate the `complete` step.

Inside the modal template block, after the main Button (around line 384), add a conditional for the complete step:

```svelte
{#if $tutorialStep === 'complete'}
  <Button on:click={handleNext} variant="primary" fullWidth>
    {content.buttonText}
  </Button>
  <button
    on:click={handleBackToMarkets}
    class="text-sm text-gray-400 transition-colors hover:text-white"
  >
    Back to Markets
  </button>
{:else}
  <Button on:click={handleNext} variant="primary" fullWidth>
    {content.buttonText}
  </Button>
  <button
    on:click={handleSkip}
    class="text-sm text-gray-400 transition-colors hover:text-white"
  >
    Skip tutorial
  </button>
{/if}
```

Add the handler function in the script:
```ts
async function handleBackToMarkets() {
  await goto('/');
  completeTutorial();
}
```

And update `handleNext` so when the step is `complete`:
```ts
if ($tutorialStep === 'complete') {
  await goto('/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95');
  completeTutorial();
  return;
}
```

- [ ] **Step 4: Update showTutorial to include complete step**

At line 250, change:
```ts
$: showTutorial = $tutorialActive && $tutorialStep !== 'complete';
```
To:
```ts
$: showTutorial = $tutorialActive;
```

And update `handleNext` for the `fundamentals` → `complete` transition to NOT auto-complete:

In the current handleNext (around lines 207-211), the transition from fundamentals to complete currently does `completeTutorial()`. Remove that — just let it advance to the complete step naturally.

- [ ] **Step 5: Also update the Tutorial highlight color**

Replace `border-yellow-500` with `border-brand-gold-500` and `shadow-[0_0_20px_rgba(234,179,8,0.3)]` with `shadow-[0_0_20px_rgba(224,153,54,0.3)]` (using the brand gold hex).

- [ ] **Step 6: Verify build**

Run: `npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/Tutorial.svelte src/lib/stores/tutorialStore.ts
git commit -m "feat: add tutorial completion modal with Start Trading CTA"
```

### Task 20: Final verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run svelte-check**

Run: `npm run check`
Expected: No type errors.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All existing tests pass.

- [ ] **Step 4: Verify admin pages unaffected**

The admin pages (`src/routes/admin/`) also have `yellow-` references but are internal tools. They should be updated for consistency but are lower priority. If time permits, do a quick pass on:
- `src/routes/admin/codes/+page.svelte`
- `src/routes/admin/rewards/+page.svelte`
- `src/routes/admin/referrals/+page.svelte`

- [ ] **Step 5: Final commit if any remaining fixes**

```bash
git add -A
git commit -m "chore: final polish and build verification"
```
