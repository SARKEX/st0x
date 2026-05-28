---
phase: 01
plan: 06
subsystem: ui-e2e-failure-modes
tags: [playwright, e2e, market-order, TEST-08, failure-modes, error-classification]
dependency_graph:
  requires:
    - tests/integration/ui/fixtures.ts (01-01 — test/expect/fundErc20/UNFUNDED_ACCOUNT)
    - tests/helpers/anvilControl.ts (01-01 — advanceTime, fundErc20, createAnvilTestClient)
    - tests/helpers/eip1193Stub.ts (01-01 — eip1193StubSource for re-injection)
    - src/lib/components/orders/MarketOrder.svelte (01-03 — D-09 errorClass derivation + data-error-class attr)
    - src/routes/(main)/trade/[id]/+page.svelte (01-01 — open-trade/mode-tab/side-toggle testids)
    - .planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md (FORK_BLOCK, freshness window, no-liquidity pair, Saturday timestamp)
  provides:
    - tests/integration/ui/marketFailures.spec.ts (TEST-08 — 5 failure-mode UI E2E specs)
  affects:
    - TEST-08 closed structurally (each failure mode surfaces a user-visible UI error with classified data-error-class)
    - "No liquidity" silent-failure class (CONCERNS) now surfaces in UI E2E coverage
    - Wave 3 complete (01-04 Buy + 01-05 Sell + 01-06 failure modes)
tech-stack:
  added: []
  patterns:
    - "Inverted assertion shape: error-banner[data-error-class] visible AND success-toast NOT visible (mirror of 01-04/05's success+no-error-banner pattern)"
    - "Real codepath forcing per D-06/D-07/D-08: no marketHours.ts / Pyth fetcher mocking; UI inputs / time advance / signer swap drive natural failures"
    - "Monotonic Date.now() offset patch for stale-oracle (additive offset matches advanceTime delta); absolute Date.now() pin for market_closed (anchored Saturday epoch)"
    - "EIP-1193 stub re-injection BEFORE goto() so svelte-wagmi reads UNFUNDED_ACCOUNT on first eval (Pitfall 1)"
key-files:
  created:
    - tests/integration/ui/marketFailures.spec.ts
  modified: []
decisions:
  - "Pinned PYTH_FRESHNESS_WINDOW_SEC=300 from 01-RUNBOOK (ASSUMED default; runbook flags re-extraction from registry Rainlang as a follow-up but executor honored runbook value)"
  - "Pinned NO_LIQUIDITY pair as (wtAMZN, sell) per 01-RUNBOOK primary; pre-fund wtAMZN so no_liquidity is the ONLY failure mode (T-1-06-02 mitigation — balance failure can't masquerade)"
  - "slippage-input fill targets data-testid directly (not a wrapper), unlike spend-input/asset-input — verified at MarketOrder.svelte:1124-1133"
  - "Stale-oracle uses monotonic offset Date.now() patch per 01-RUNBOOK §'evm_setNextBlockTimestamp + Date.now() patch sync'; market-closed uses absolute pin (Saturday epoch is the anchor, not a delta)"
metrics:
  duration_minutes: 6
  completed_date: 2026-05-06
  task_count: 1
  commit_count: 1
  file_count: 1
---

# Phase 01 Plan 06: TEST-08 Market-Order Failure Modes E2E Spec Summary

One-liner: Five-spec Playwright file covering all D-09 error-class taxonomy values (slippage / no_liquidity / stale_oracle / insufficient_balance / market_closed) — each forced through a deterministic real-codepath mechanism per D-06/D-07/D-08 and asserting the specific `[data-error-class]` value rendered by MarketOrder.svelte plus success-toast NOT visible.

## What Shipped

`tests/integration/ui/marketFailures.spec.ts` — 208 LOC, 5 `test(...)` blocks under one `test.describe('TEST-08 — Market order failure modes via UI')`:

1. **slippage exceeded** — funds 1000 USDC, fills `slippage-input` with `0.001` (0.001%), submits Buy spend-anchored at 100 USDC → asserts `data-error-class="slippage"`. Forces ratio-cap math reject inside `marketOrderExecution.ts` naturally (no anvil manipulation).

2. **no liquidity** — funds 10 wtAMZN (pre-fund so balance failure can't masquerade — T-1-06-02), navigates to `/trade/0x997baE3EC193a249596d3708C3fAB7C501Bb8a53` (wtAMZN), Sell side, asset-anchored 1 tNVDA → asserts `data-error-class="no_liquidity"`. Empty book at FORK_BLOCK=33_400_000 per 01-RUNBOOK primary pair.

3. **stale oracle** — funds USDC, calls `advanceTime(testClient, 360)` (= PYTH_FRESHNESS_WINDOW_SEC + 60 = 300+60), patches browser `Date.now()` with a +360_000ms monotonic offset (per 01-RUNBOOK §"evm_setNextBlockTimestamp + Date.now() patch sync") via `addInitScript`, submits Buy → asserts `data-error-class="stale_oracle"`. Drives the real on-chain Pyth freshness gate (TRADE-03 surface).

4. **insufficient balance** — re-injects EIP-1193 stub with `UNFUNDED_ACCOUNT` (anvil[1], no ERC20 balance) BEFORE `page.goto()` so svelte-wagmi reads the swapped account on first eval (Pitfall 1), submits Buy → asserts `data-error-class="insufficient_balance"`. No funding call — wallet balance check trips naturally.

5. **market closed** — funds USDC, calls `setNextBlockTimestamp({ timestamp: 1745550000n })` + `mine({ blocks: 1 })`, pins `Date.now()` to `1745550000 * 1000` (Sat 2026-04-25 03:00:00 UTC) via `addInitScript`, submits Buy → asserts `data-error-class="market_closed"`. Real `marketHours.isOutsideMarketHours()` gates via `dayOfWeek === 6` in ET.

All 5 specs assert `[data-testid="success-toast"]` is NOT visible alongside the error-banner-class assertion — three-axis pin (error-banner visible + correct class + success-toast absent) ensures the failure surface fired AND the happy-path UI didn't accidentally fire too.

Skip-grammar mirrors smoke.spec.ts:18 / marketBuy.spec.ts:19 / marketSell.spec.ts:26 — local dev without `BASE_RPC_URL` skips rather than fails. Plan 01-09 wires the CI archive-RPC run.

## Verification Receipts

| Gate | Result |
|------|--------|
| `test -f tests/integration/ui/marketFailures.spec.ts` | exists |
| `grep -q "test.skip(!process.env.BASE_RPC_URL"` | hit |
| `grep -cE 'data-error-class="(slippage\|no_liquidity\|stale_oracle\|insufficient_balance\|market_closed)"'` | 10 (each class appears in selector + test name; ≥ 5 required) |
| `grep -cE "test\\(.*'(slippage\|no liquidity\|stale\|insufficient\|market closed)"` | 5 (≥ 5 required) |
| Forbidden internal-logic imports (`$lib/services/marketOrderExecution`, `$lib/stores/transaction`, `$lib/types/orderPerspective`) | 0 (D-11 lint passes) |
| `grep -q 'SATURDAY_03_UTC = 1745550000'` | hit |
| `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | 16 (≥ 12 baseline) |
| `npx eslint tests/integration/ui/marketFailures.spec.ts` | exit 0 |
| `npx playwright test --list` | 10 tests (1 smoke + 2 Buy + 2 Sell + 5 failure) |

The 5 specs were NOT executed end-to-end because `BASE_RPC_URL` is not provisioned in the executor's environment (CI-only secret per 01-09). Plan 01-09 lands the CI run that validates this. Until then, the specs are exercised by `npx playwright test --list` (config + import resolution) + the verify-gate set above + targeted ESLint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Pattern fidelity] Switched bare `page.fill('[data-testid="..."]', ...)` to `page.locator('[data-testid="..."] input').first().fill(...)` for spend-input / asset-input**
- **Found during:** Task 1, post-write review against marketBuy/marketSell pattern.
- **Issue:** Plan example used `page.fill('[data-testid="spend-input"]', '100')` directly. But per 01-03 D-09 + 01-04/05 SUMMARYs, `spend-input` and `asset-input` testids land on the wrapper `<TradeAmountInput>` element with the actual `<input>` nested inside. `page.fill` on a wrapper fails to resolve the nested input.
- **Fix:** Used `page.locator('[data-testid="spend-input"] input').first().fill(...)` to match marketBuy.spec.ts:54 / marketSell.spec.ts:118 pattern. Kept bare `page.fill` for `slippage-input` because that testid IS directly on an `<input>` element (verified at MarketOrder.svelte:1124-1133).
- **Files modified:** `tests/integration/ui/marketFailures.spec.ts`
- **Commit:** 95451ef

### Documented Assumptions

**Pyth freshness window pinned at 300s without re-extraction from registry Rainlang.** 01-RUNBOOK §"Pyth freshness window" flags 300s as ASSUMED and notes Plan 01-06 SHOULD re-extract from `static/registry/` Rainlang at FORK_BLOCK before its smoke run. Re-extraction was not performed in this plan — the registry Rainlang requires a `BASE_RPC_URL` archive read to extract the pinned constant per the runbook note ("not recoverable from this agent's environment"). Same root cause as the 01-RUNBOOK ASSUMPTION block: `BASE_RPC_URL` is a CI-only secret. If 01-09's CI run shows the stale-oracle test failing because the real freshness window is shorter than 300s, the advanceTime call already adds `+60s` headroom; if longer, increase `PYTH_FRESHNESS_WINDOW_SEC` and document the new value in 01-RUNBOOK.

**No-liquidity pair `(wtAMZN, sell)` not pre-verified at runtime.** 01-RUNBOOK flags this as ASSUMED at FORK_BLOCK=33_400_000 with backup `(wtIAU, sell)`. The Goldsky verification query in the runbook requires `BASE_RPC_URL` access. If 01-09's CI run finds wtAMZN sell-side has bid liquidity (test fails because order partially fills), swap to `(wtIAU, sell)` and document in 01-RUNBOOK §"No-liquidity" alongside the matching token entry.

**`slippage-input` is a direct `<input>` not a wrapper.** Verified at MarketOrder.svelte:1124-1133 — the `data-testid="slippage-input"` attribute lives directly on the `<input id="market-slippage">` element. This differs from `spend-input`/`asset-input` which live on a `<TradeAmountInput>` wrapper. Documented inline in the spec to prevent a future refactor from accidentally moving the testid onto a wrapper.

## Threat Model Re-Walk

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-1-06-01 (UI shows generic error not classified into D-09 taxonomy) | mitigate | 01-03 retrofit added classification logic (MarketOrder.svelte:311-328 `errorClass` derivation). Each spec asserts the SPECIFIC class — a generic-error fallback would fail the assertion and surface the gap. The 01-03 derivation prioritizes by precedence (insufficient_balance > no_liquidity > slippage / stale_oracle / market_closed by string match) so the right class wins when multiple are active. |
| T-1-06-02 (Stale-oracle / no-liquidity test passes due to wallet-balance error not the intended fail) | mitigate | Stale-oracle test funds USDC before advancing time; no-liquidity test funds wtAMZN before navigating. The only path to error in each is the intended forcing mechanism. The exact `data-error-class` assertion (not a generic error-banner check) is the structural pin — a balance error fires `insufficient_balance` and the assertion fails. |
| T-1-06-03 (No-liquidity pair becomes liquid between RUNBOOK selection and run) | accept | Backup pair (wtIAU, sell) documented in 01-RUNBOOK; escape hatch is `removeOrder` mass-cancellation (CONTEXT Deferred). Documented but not pre-built. If 01-09 CI surfaces this, switch to backup or invoke escape hatch. |

## Hand-Off

Wave 3 (Buy / Sell / failure modes) now complete. TEST-06 (Buy), TEST-07 (Sell), TEST-08 (failure modes) all closed structurally — 10 specs total in `tests/integration/ui/`:
- 1 smoke (TEST-05)
- 2 Buy (TEST-06)
- 2 Sell (TEST-07)
- 5 failure (TEST-08)

Plan 01-07 (limit deploy + counterparty fill — TEST-09) extends the suite with the limit-order deploy path; reuses the same fixture machinery (testClient, fundedAccount, tokens) and the same open-sequence; diverges on the deploy path (clicks `[data-testid="mode-tab"][data-mode="limit"]`, waits for `limit-form-loaded`) plus a counterparty-fill simulation step on the fork.

Plan 01-09 wires the CI archive-RPC run that exercises all 10 specs end-to-end. Until then, all 10 specs are validated structurally via `npx playwright test --list` + ESLint + verify-gate greps.

## Self-Check: PASSED

- `tests/integration/ui/marketFailures.spec.ts` exists on disk and is tracked in git (commit 95451ef).
- Commit 95451ef exists in `git log` on branch `phase-01-ui-driven-e2e-tests`.
- All plan verify-gate grep checks pass (verified above; data-error-class count=10, test blocks=5, no forbidden imports, SATURDAY_03_UTC pinned, failWith=16).
- `npx eslint tests/integration/ui/marketFailures.spec.ts` exits 0.
- `npx playwright test --list` discovers 5 new failure tests (10 total).
- Locked invariants intact: `failWith(` count = 16 (≥ 12 baseline); no internal-logic imports added; D-11 lint clean.
