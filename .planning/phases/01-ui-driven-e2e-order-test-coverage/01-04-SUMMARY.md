---
phase: 01
plan: 04
subsystem: ui-e2e-buy-coverage
tags: [playwright, e2e, market-order, buy, TEST-06, TRADE-04, TRADE-01]
dependency_graph:
  requires:
    - tests/integration/ui/fixtures.ts (01-01 — test/expect/fundErc20/TOKENS)
    - tests/integration/ui/smoke.spec.ts (01-01 — happy-path skeleton this plan extends)
    - src/lib/components/orders/MarketOrder.svelte (01-03 — spend-input/asset-input/error-banner/success-toast testids)
    - src/routes/(main)/trade/[id]/+page.svelte (01-01 — open-trade/mode-tab/side-toggle testids)
  provides:
    - tests/integration/ui/marketBuy.spec.ts (TEST-06 Buy market-order coverage — spend-anchored + asset-anchored)
  affects:
    - TRADE-04 mode×side regression matrix populated on the Buy side
    - TRADE-01 INPUT/OUTPUT semantics implicitly pinned (Buy must produce tNVDA delta, not USDC delta)
    - 01-05 marketSell.spec.ts will mirror this shape on the Sell side
tech-stack:
  added: []
  patterns:
    - "Both UI + on-chain assertions per test (T-1-04-01 mitigation: success-toast and error-banner-NOT-visible together)"
    - "Asset-anchored slippage floor: parseUnits('0.099', 18) accommodates default ≤ 1% slippage cap"
    - "Reactive testid resolution: spend-input vs asset-input on the same TradeAmountInput element (per 01-03 D-09)"
key-files:
  created:
    - tests/integration/ui/marketBuy.spec.ts
  modified: []
decisions:
  - "Asset-anchored floor at 0.099 tNVDA (≤ 1% slippage tolerance) — adjust on first CI run if 01-RUNBOOK pins a different default cap"
  - "Mirror smoke.spec.ts open-sequence: open-trade CTA → mode-tab market → side-toggle buy → wait market-form-loaded"
  - "Drop FUNDED_ACCOUNT/TOKENS named imports (use fixture-injected fundedAccount/tokens) to keep import surface minimal"
metrics:
  duration_minutes: 4
  completed_date: 2026-05-06
  task_count: 1
  commit_count: 1
  file_count: 1
---

# Phase 01 Plan 04: TEST-06 Buy Market-Order E2E Spec Summary

One-liner: Two-spec Playwright file covering Buy-market both spend-anchored (give 100 USDC) and asset-anchored (receive 0.1 tNVDA) paths, each asserting success-toast visible AND error-banner NOT visible AND on-chain tNVDA balance delta.

## What Shipped

`tests/integration/ui/marketBuy.spec.ts` — 127 LOC, 2 `test(...)` blocks under one `test.describe('TEST-06 — Buy market order via UI')`:

- **spend-anchored** (TRADE-04 spend mode): funds 1000 USDC via `fundErc20` (setStorageAt slot=9), opens trade panel via `[data-testid="open-trade"][data-side="buy"]`, switches to `[data-testid="mode-tab"][data-mode="market"]` + `[data-testid="side-toggle"][data-side="buy"]`, waits for `[data-testid="market-form-loaded"]`, fills `[data-testid="spend-input"] input` with `100`, submits `[data-testid="trade-submit"][data-side="buy"]`. Asserts: success-toast visible within 30s, error-banner NOT visible, on-chain `tNVDA.balanceOf > 0n`, `USDC.balanceOf < 1000e6` (some USDC was spent).

- **asset-anchored** (TRADE-04 asset mode): same setup, fills `[data-testid="asset-input"] input` with `0.1`. Asserts: success-toast visible, error-banner NOT visible, on-chain `tNVDA.balanceOf >= 0.099 tNVDA` (slippage floor for ≤ 1% default cap).

Both specs skip when `BASE_RPC_URL` unset (`test.skip(!process.env.BASE_RPC_URL, ...)`) — mirrors smoke.spec.ts:18 and `tests/integration/marketOrder/anvil-fork.test.ts:17` skip-grammar.

**TRADE-01 implicit pin:** The asset-anchored test asserts `tNVDA.balanceOf > 0` after a Buy. If TRADE-01 ever inverts and Buy hits bid-side counterparties, USDC would *increase* and tNVDA stay flat — the assertion fails noisily.

## Verification Receipts

| Gate | Result |
|------|--------|
| `test -f tests/integration/ui/marketBuy.spec.ts` | exists |
| `grep -q "test.skip(!process.env.BASE_RPC_URL" marketBuy.spec.ts` | hit |
| `grep -cE "test\(.*spend-anchored\|test\(.*asset-anchored"` | 2 (≥ 2 required) |
| `grep -q 'data-testid="trade-submit"\]\[data-side="buy"'` | hit |
| Forbidden internal-logic imports (`$lib/services/marketOrderExecution`, `$lib/stores/transaction`, `$lib/types/orderPerspective`) | 0 (D-11 lint passes) |
| `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | 16 (≥ 12 baseline) |
| `npx eslint tests/integration/ui/marketBuy.spec.ts` | exit 0 |
| `npx playwright test --list` | 3 tests discovered (1 smoke + 2 new) |

The two specs were NOT executed end-to-end because `BASE_RPC_URL` is not provisioned in the executor's environment (CI-only secret per 01-09). Plan 01-09 lands the CI run that validates this. Until then, the specs are exercised by `npx playwright test --list` (config + import resolution) and the verify-gate set above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Cleanup] Dropped unused FUNDED_ACCOUNT / TOKENS named imports**
- **Found during:** Task 1, post-write review.
- **Issue:** Plan's example imported `FUNDED_ACCOUNT` and `TOKENS` from `./fixtures` but the spec body uses fixture-injected `fundedAccount` and `tokens` (per smoke.spec.ts pattern). Unused-import lint warning would surface.
- **Fix:** Imported only `test, expect, fundErc20` — fixture-injected values are available on the per-test object.
- **Files modified:** `tests/integration/ui/marketBuy.spec.ts`
- **Commit:** 8239171

### Documented Assumptions

**Asset-anchored floor at `parseUnits('0.099', 18)` (1% slippage tolerance).** The plan recommended this floor and noted it should be tuned to whatever default slippage cap 01-RUNBOOK pins. 01-RUNBOOK does NOT yet pin a slippage default — Pyth freshness is documented at 300s but slippage default is owned by `MarketOrder.svelte` initial state and slippage-input default value. If first CI run shows a tighter default cap (e.g. 0.5%), tighten the floor to `0.0995`; if wider (e.g. 2%), loosen to `0.098`. Documented inline in the spec.

**`spend-input` testid resolution depends on `inputMode === 'spend'`.** Per 01-03 D-09 the same `TradeAmountInput` wrapper switches `data-testid` reactively on `inputMode`. `MarketOrder.svelte:34` initializes `let inputMode: 'amount' | 'spend' = 'amount'` — so on first mount the resolved testid is `asset-input`, not `spend-input`. The smoke spec (which uses `[data-testid="spend-input"]`) and this plan's spend-anchored test rely on smoke-spec behavior at first CI run. If the spend-input selector fails to resolve, the resolution is to click the Buy/Spend toggle button (no testid currently — would need a 01-03 follow-up to add `[data-testid="input-mode-toggle"]`) before filling. Surfaces noisily on first CI run as a `Timeout 30000ms exceeded waiting for selector`.

## Threat Model Re-Walk

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-1-04-01 (UI success-toast flips green on internal error) | mitigate | Both specs assert `success-toast visible` AND `error-banner NOT visible` AND on-chain balance delta. Three independent checks; a partial-fill that flipped only the toast green would fail the on-chain assertion. |
| T-1-04-02 (Buy hitting bid-side counterparties — TRADE-01 inversion regression) | mitigate | Asset-anchored spec asserts `tNVDA.balanceOf >= 0.099 tNVDA` after a Buy. If TRADE-01 inverts, USDC would increase and tNVDA stay at 0 — the assertion fails. Spend-anchored adds the matching `USDC.balanceOf < initialUsdc` check as a second-axis pin. |
| T-1-04-03 (BASE_RPC_URL leaking via Playwright trace) | accept | playwright.config.ts (01-01) sets `trace: 'retain-on-failure'`. We navigate only to `process.env.PREVIEW_URL` (same-origin); BASE_RPC_URL traffic is anvil-process-layer, not browser navigation. |

## Hand-Off

Wave-3 Buy half complete. Plan 01-05 (marketSell.spec.ts) mirrors this shape on the Sell side — same setup, swap `[data-side="buy"]` → `[data-side="sell"]`, swap funding from USDC → tNVDA, swap balance assertions (USDC delta UP, tNVDA delta DOWN). The `error-banner not visible + success-toast visible + on-chain delta` triple-check pattern carries forward verbatim.

Plan 01-06 (marketFailures.spec.ts) inverts the assertion shape: each TEST-08 failure mode asserts `[data-testid="error-banner"][data-error-class="<class>"]` is visible AND `success-toast` NOT visible AND on-chain state unchanged.

## Self-Check: PASSED

- `tests/integration/ui/marketBuy.spec.ts` exists on disk and is tracked in git (commit 8239171).
- Commit 8239171 exists in `git log` on branch `phase-01-ui-driven-e2e-tests`.
- All plan verify-gate grep checks pass (verified above).
- `npx eslint tests/integration/ui/marketBuy.spec.ts` exits 0.
- `npx playwright test --list` discovers 2 new tests (3 total with smoke).
- Locked invariants intact: `failWith(` count = 16 (≥ 12 baseline); no internal-logic imports added.
