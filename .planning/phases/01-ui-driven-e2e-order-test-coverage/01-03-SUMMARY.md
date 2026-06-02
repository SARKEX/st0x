---
phase: 01
plan: 03
subsystem: ui-test-selectors-and-discipline
tags: [data-testid, eslint, no-restricted-imports, TEST-12, D-09, D-10, D-11]
dependency_graph:
  requires:
    - 01-01-SUMMARY.md (minimal testid set: market-form, market-form-loaded, spend-input, trade-submit, success-toast on MarketOrder; mode-tab + side-toggle on +page.svelte)
    - eslint.config.js (TRADE-01 / DRIFT-01 scoped block — analog for verbose-message style)
    - tests/fixtures/eslint/token-lookup-violation.ts (DRIFT-01 fixture analog)
    - .planning/codebase/TESTING.md (canonical destination doc)
  provides:
    - MarketOrder.svelte: full D-09 testid set including asset-input + slippage-input + error-banner with data-error-class taxonomy
    - LimitOrder.svelte: limit-form + limit-form-loaded (Pitfall 4 lazy-load anchor) + deposit-input + price-input + deploy-submit + error-banner + success-toast
    - eslint.config.js no-restricted-imports rule scoped to tests/integration/ui/**
    - tests/fixtures/eslint/ui-test-import-violation.ts (proof fixture)
    - .planning/codebase/TESTING.md "UI Test Selectors" section
  affects:
    - 01-04..01-07 specs can compose [data-testid][data-side][data-mode][data-error-class] selectors against the actual UI without further changes
    - Future phases that add E2E coverage for DCA / QuickTrade / admin extend the retrofit incrementally per the documented convention
tech-stack:
  added: []
  patterns:
    - "D-09 compound testids: stable data-testid + adjacent semantic data-* attributes (data-side / data-mode / data-error-class)"
    - "D-11 lint enforcement: scoped no-restricted-imports rule with companion fixture (mirrors DRIFT-01 pattern)"
    - "sr-only error/success surfaces alongside visible UX: stable selectors without UX duplication"
    - "Reactive testid string switching with mode (spend-input vs asset-input on the same TradeAmountInput)"
key-files:
  created:
    - tests/fixtures/eslint/ui-test-import-violation.ts
  modified:
    - src/lib/components/orders/MarketOrder.svelte
    - src/lib/components/orders/LimitOrder.svelte
    - eslint.config.js
    - .planning/codebase/TESTING.md
decisions:
  - "errorClass taxonomy is precedence-significant: insufficient_balance > no_liquidity > slippage > stale_oracle > market_closed (highest-priority class wins when multiple are active)"
  - "error-banner element is sr-only: visible inline error blocks remain authoritative for users; the testid surface is for E2E only"
  - "spend-input/asset-input are reactive on inputMode (same TradeAmountInput element) — testid follows the mode rather than splitting into two elements"
  - "LimitOrder error-banner only classifies belowMinTradeError as insufficient_balance — TEST-08 taxonomy is fully covered on MarketOrder; LimitOrder limit-form-loaded anchor is the critical addition (Pitfall 4)"
  - "eslint.config.js fixture path listed in files glob so the rule applies to the proof fixture even though it lives outside tests/integration/ui/"
metrics:
  duration_minutes: 18
  completed_date: 2026-05-06
  task_count: 2
  commit_count: 2
  file_count: 5
---

# Phase 01 Plan 03: D-09/D-10/D-11 UI Test Discipline Summary

One-liner: Full D-09 compound-testid retrofit on MarketOrder + LimitOrder (extending the 01-01 minimal set) with classified error-banner + sr-only success-toast, plus a D-11 ESLint `no-restricted-imports` rule with a working fixture that proves UI E2E specs cannot reach into internal-logic modules.

## What Shipped

**Component testid retrofits (extending 01-01's minimal set):**

`src/lib/components/orders/MarketOrder.svelte` (9 `data-testid` references):
- `market-form` + `market-form-loaded` shell anchors (from 01-01).
- `spend-input` / `asset-input` reactive on `inputMode` — same `TradeAmountInput` serves both payment-anchored and asset-anchored entry, so the testid switches with the mode rather than splitting into two elements.
- `slippage-input` on the slippage `%` input.
- `trade-submit` with `data-side` + `data-mode="market"` (from 01-01).
- `error-banner` with `data-error-class` classifying errors into the five TEST-08 modes (`slippage` / `no_liquidity` / `stale_oracle` / `insufficient_balance` / `market_closed`). Rendered `sr-only` so visible UX is unchanged; the visible inline error blocks above remain authoritative for sighted users. The classification is precedence-ordered (e.g. `insufficient_balance` trumps `no_liquidity` so the actionable error surfaces first). Inline taxonomy comment block documents the mapping per the plan's must-fix bar.
- `success-toast` (from 01-01).

`src/lib/components/orders/LimitOrder.svelte` (7 `data-testid` references):
- `limit-form` outer shell + `limit-form-loaded` post-skeleton anchor — the critical Pitfall 4 mitigation so 01-07 `limitDeploy.spec.ts` can `waitFor` past the `{#await import()}` chunk-load before any selector resolves.
- `deposit-input` on the asset-quantity entry block (the deposit-into-output-vault amount per TEST-09).
- `price-input` on the limit-price `<Input>` (forwarded via the existing `dataTestId` prop — no raw HTML attribute added).
- `deploy-submit` on the Create Order button with `data-side` + `data-mode="limit"`.
- `error-banner` with `data-error-class="insufficient_balance"` for the below-min-trade case + `success-toast` rendered when `tradeSubmittedSuccessfully` flips.

`src/routes/(main)/trade/[id]/+page.svelte` — unchanged this plan. The 01-01 work already landed `mode-tab` (× 3 modes), `side-toggle` (× 2 sides), and `open-trade`. The wallet-connect shell already carries testids in `WalletConnect.svelte`. Top-level error/success surfaces don't exist outside the order components, so no `page-error-banner` was added (would have been dead markup).

**ESLint enforcement (D-11):**

`eslint.config.js` — NEW scoped block appended (separate from the TRADE-01 / DRIFT-01 `no-restricted-syntax` block per the flat-config-doesn't-merge warning at lines 35-38). `no-restricted-imports` rule with a verbose violation message pointing to `TESTING.md` and the companion fixture. Forbidden patterns: `$lib/services/marketOrderExecution`, `$lib/stores/transaction`, `$lib/services/orderDeployment`, `$lib/services/walletService`, `$lib/types/orderPerspective`. The fixture path is included in the rule's `files` glob so the rule applies even though the fixture lives outside `tests/integration/ui/`.

`tests/fixtures/eslint/ui-test-import-violation.ts` — companion fixture that intentionally imports two of the banned modules. Running `npx eslint tests/fixtures/eslint/ui-test-import-violation.ts` exits with code `1` and emits the `no-restricted-imports` error with the configured message. Mirrors `tests/fixtures/eslint/token-lookup-violation.ts` (DRIFT-01 / Phase 4 04-03) in shape and inline-comment grammar.

**Documentation:**

`.planning/codebase/TESTING.md` — appended `## UI Test Selectors` section with four sub-sections: Selector grammar (D-09), Retrofit scope (D-10), ESLint enforcement (D-11), Rationale. Locates the convention in the canonical testing doc so downstream phases extending the retrofit have a single source.

## Verification Receipts

| Gate | Result |
|------|--------|
| `npm run check` | 3 errors (`tests/lib/server/rpcMetrics.test.ts` baseline preserved) |
| `npm test -- --run` | 658 passed, 1 skipped, 0 failed |
| `grep -c 'data-testid' src/lib/components/orders/MarketOrder.svelte` | 9 (≥ 8 required) |
| `grep -c 'data-testid' src/lib/components/orders/LimitOrder.svelte` | 7 (≥ 6 required) |
| `grep -q 'data-testid="limit-form-loaded"' src/lib/components/orders/LimitOrder.svelte` | hit (Pitfall 4 anchor present) |
| `grep -q 'data-testid="error-banner"' src/lib/components/orders/MarketOrder.svelte` | hit |
| `grep -q 'data-error-class' src/lib/components/orders/MarketOrder.svelte` | hit |
| `grep -c 'data-testid="mode-tab"' 'src/routes/(main)/trade/[id]/+page.svelte'` | 4 (3 active tabs + 1 in HTML comment) |
| `npx eslint tests/fixtures/eslint/ui-test-import-violation.ts` exit code | 1 |
| Same invocation, message contains `no-restricted-imports` | yes |
| `grep -q '## UI Test Selectors' .planning/codebase/TESTING.md` | hit |
| `grep -q 'no-restricted-imports' eslint.config.js` | hit |
| `grep -q 'marketOrderExecution' eslint.config.js` | hit |
| New imports of `$lib/services/marketOrderExecution` / `$lib/stores/transaction` in modified components | 0 (existing imports preserved; no new ones added) |
| `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | 16 (≥ 12 baseline) |
| `npm run lint-check` exit code on production source | 1 (15 errors — pre-existing baseline; verified unchanged via `git stash` reproduction) |

`npm run lint-check`'s pre-existing 15-error baseline is documented as out-of-scope per the plan's SCOPE BOUNDARY and tracked separately. The plan's acceptance criterion is "production code still passes" — the baseline was 15 before this plan and is 15 after, so we did not regress lint.

## Deviations from Plan

### Auto-fixed Issues

None directly required. Three judgement calls during execution that materially shaped the implementation but stayed within the plan's letter:

**1. error-banner rendered `sr-only` rather than as a visible block**
- **Found during:** Task 1, action A — adding `<div data-testid="error-banner" data-error-class={errorClass}>`.
- **Issue:** The plan template shows the error-banner as a visible markup element. But MarketOrder.svelte already renders four distinct visible error/warning blocks (insufficient balance message at line 1156, liquidity warning at 1161, price-error block at 1172, orderPreparationError block at 1187) with carefully-tuned UX copy. Adding a sixth visible "error-banner" would either duplicate text users already see or replace UX that's been deliberately shaped by prior plans.
- **Resolution:** Rendered the error-banner `sr-only` with `role="alert"` `aria-live="polite"`. Visible UX is unchanged; the testid surface is for E2E + assistive-tech only. Inline comment documents the choice. Same approach 01-01 used for `success-toast` in this same file.
- **Files modified:** `src/lib/components/orders/MarketOrder.svelte`, `src/lib/components/orders/LimitOrder.svelte`
- **Commit:** 31c966b

**2. errorClass derivation placed below `priceError`/`insufficientBalanceError` declarations**
- **Found during:** Task 1, action A — initial placement of the `$: errorClass = ...` reactive.
- **Issue:** Initial position (right after `noLiquidityError` derivation) referenced `priceError` / `priceErrorReason` before they were declared with `let`. Svelte's reactive scheduler typically handles this since `$:` blocks re-run on dependency change, but TDZ would fire on the first synchronous read at component initialization.
- **Resolution:** Moved `$: errorClass = ...` below the balance-check block where both `insufficientBalanceError` and `priceError`/`priceErrorReason` are already initialized. No semantic difference — the reactive still re-runs whenever any input changes.
- **Files modified:** `src/lib/components/orders/MarketOrder.svelte`
- **Commit:** 31c966b

**3. spend-input vs asset-input rendered as a single reactive testid (not two separate elements)**
- **Found during:** Task 1, action A — applying `dataTestId="asset-input"`.
- **Issue:** Plan instructs "Asset-amount input: dataTestId='asset-input' via Input prop". But `MarketOrder.svelte` has a single `TradeAmountInput` (not `<Input>`) that handles both `inputMode === 'spend'` (payment-amount entry) and `inputMode === 'amount'` (asset-quantity entry). Adding two separate input elements would change the rendered DOM and require duplicating the surrounding wiring. Since `TradeAmountInput` does not forward a `dataTestId` prop, the testid lives on the wrapping `<div>`.
- **Resolution:** The wrapping `<div>` testid switches reactively on `inputMode`: `data-testid={inputMode === 'spend' ? 'spend-input' : 'asset-input'}`. E2E selectors compose cleanly — `[data-testid="asset-input"]` resolves when the user is in asset-quantity mode, `[data-testid="spend-input"]` when in payment-anchored mode. Inline comment documents the choice.
- **Files modified:** `src/lib/components/orders/MarketOrder.svelte`
- **Commit:** 31c966b

### Documented Assumptions

**LimitOrder error-banner only carries `insufficient_balance`** — the plan calls for "same taxonomy as MarketOrder" but LimitOrder's pre-deploy state doesn't naturally classify into `slippage` / `stale_oracle` / `no_liquidity` / `market_closed` (the limit-deploy path doesn't run pre-flight oracle/orderbook checks; it just deposits into the output vault). The `belowMinTradeError` is the one deterministic pre-deploy error and maps cleanly to `insufficient_balance` semantics ("you don't have enough size to make this order viable"). 01-07 (limit-deploy E2E) only needs the `success-toast` + `limit-form-loaded` anchors to assert deploy success; the full taxonomy lives on MarketOrder where TEST-08 tests against it.

## Threat Model Re-Walk

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-1-03-01 (testids in production bundle) | accept | Industry-standard. New testid names (`asset-input`, `slippage-input`, `error-banner`, `deploy-submit`, `deposit-input`, `price-input`, `limit-form`, `limit-form-loaded`) carry no sensitive info. Error-class values are abstract categories, not internal codes. |
| T-1-03-02 (testid additions break logic) | mitigate | Change scope strictly limited to attribute additions + one reactive `errorClass` derivation. svelte-check baseline preserved at 3. All 658 unit tests still pass. failWith count locked at 16. No new imports added to the three component files. error-banner rendered `sr-only` — does not change visible UX or layout. |
| T-1-03-03 (ESLint rule breaks unrelated lint) | mitigate | NEW scoped block appended (per the flat-config-doesn't-merge warning); existing TRADE-01 / DRIFT-01 block at lines 68-95 is unmodified. `npm run lint-check` baseline (15 errors, pre-existing) verified unchanged via `git stash` reproduction. The fixture file's intentional violation surfaces only when the file is targeted directly — `npm run lint` only scans `src/`, so the fixture doesn't pollute normal lint output. |

## Hand-Off

Plan 01-03 closes the D-09 / D-10 / D-11 trifecta. Wave-3 plans (01-04 marketBuy.spec.ts, 01-05 marketSell.spec.ts, 01-06 marketFailures.spec.ts, 01-07 limitDeploy.spec.ts) can now compose `[data-testid][data-side][data-mode][data-error-class]` selectors against the actual UI without further component changes.

**Outstanding for downstream plans:**
- **01-06 (TEST-08 marketFailures.spec.ts):** asserts against `[data-testid="error-banner"][data-error-class="<class>"]` for each of the 5 failure modes. The classification logic in `MarketOrder.svelte`'s `errorClass` derivation may need refinement once the actual `orderPreparationError` strings emitted by `marketOrderExecution.ts`'s `failWith()` call sites are observed end-to-end. The current pattern-match (substring `slippage` / `stale` / `oracle` / `chain_unreachable` / `market_closed`) is conservative and covers the documented OBS-03 reason names; if a `failWith()` reason produces a message that doesn't match, 01-06 will surface it and we extend the regex.
- **01-07 (TEST-09 limitDeploy.spec.ts):** uses `[data-testid="limit-form-loaded"]` as the post-lazy-load wait anchor and `[data-testid="success-toast"][data-mode="limit"]` for deploy success.

## Self-Check: PASSED

- All 5 listed files exist on disk and are tracked in git.
- Both commits (`31c966b`, `f356171`) exist in `git log`.
- Locked invariants intact: svelte-check baseline 3, failWith count 16, no new internal-logic imports in the three component files.
- ESLint rule fires on the fixture (exit code 1, message contains `no-restricted-imports`).
- TESTING.md `## UI Test Selectors` section is grep-able with all four sub-sections present.
- `npm run lint-check` baseline of 15 errors is pre-existing and unchanged by this plan (verified via `git stash`).
