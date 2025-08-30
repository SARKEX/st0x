# Style Alignment Review (Proposed Changes for Approval)

This document lists style and component alignment changes that would improve DRYness and mobile consistency. Please review and approve before we implement the breaking/visible changes.

## Proposals

- Consistent Cards:
  - Standardize all statistic/info tiles to use `ui/MetricCard.svelte` + `ui/Card.svelte` with `showGradient=false` for neutral tiles.
  - Replace ad-hoc `rounded-lg border bg-gray-800/50 p-4` tiles across pages with `MetricCard`.

- Page Padding/Spacing:
  - Adopt `ui/PageContainer.svelte` for outer page spacing (`p-3 sm:p-6` and `space-y-6 sm:space-y-8`).
  - Remove duplicate container markup in each page component to reduce divergence.

- Prose Content:
  - Use `ui/ProsePanel.svelte` for long-form content pages (`terms`, `faqs`, `audit`).
  - This ensures typography and padding are uniform and mobile-friendly.

- Tabs:
  - Replace hand-rolled tab bars with `ui/TabNav.svelte` to unify active/hover states and spacing.
  - Optionally add an `aria-controls` and keyboard navigation enhancement for accessibility.

- Buttons:
  - Introduce a unified `Button` style using Tailwind classes instead of scoped CSS in `Button.svelte`.
  - Add size variants (`sm|md|lg`) and emphasis variants (`primary|secondary|danger|ghost`).
  - Mark existing `Button.svelte` for migration to Tailwind class-based styling to match the rest of the system.

- Inputs/Selects:
  - Standardize input containers (`rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white`) by creating `ui/FormField.svelte` and `ui/TextInput.svelte` wrappers.
  - Migrate scattered inline input styles to these components for consistent focus/hover behavior.

- Tables:
  - Create `ui/Table.svelte` primitives for header and row styling (`border-b border-white/10`, `hover:bg-white/5`).
  - Migrate `OrderListTable` and `VaultListTable` to use shared table primitives.

- Gradients and Accents:
  - Align gradient usage via `Card.svelte` `showGradient` and remove inline gradient bars duplicated in cards.

## Accessibility (a11y)

- Ensure all interactive elements have `aria-label`s where text is not explicit.
- Add keyboard navigation to `TabNav.svelte` (Left/Right arrow to change tab, Home/End to jump).
- Prefer semantic elements where possible: buttons over divs, headings in order.

## Performance

- Reduce nested divs for gradient decorations when `Card.svelte` is used.
- Prefer responsive utility classes over custom media queries in component styles.

## Notes

- No visual breakage is expected from the container and prose refactors already implemented.
- Button/Input standardization will cause minor visual changes; please approve before migration.

