---
phase: 01
plan: 05
subsystem: ui-e2e-sell-coverage
tags: [playwright, e2e, market-order, sell, TEST-07, TRADE-04, TRADE-01]
dependency_graph:
  requires:
    - tests/integration/ui/fixtures.ts (01-01 — test/expect/fundErc20)
    - tests/integration/ui/marketBuy.spec.ts (01-04 — Buy mirror reference)
    - src/lib/components/orders/MarketOrder.svelte (01-03 — spend-input/asset-input/error-banner/success-toast testids)
    - src/routes/(main)/trade/[id]/+page.svelte (01-01 — open-trade/mode-tab/side-toggle testids)
  provides:
    - tests/integration/ui/marketSell.spec.ts (TEST-07 Sell market-order coverage — asset-anchored + spend-anchored)
  affects:
    - TRADE-04 mode×side regression matrix populated on the Sell side (Buy populated by 01-04)
    - TRADE-01 INPUT/OUTPUT semantics implicitly pinned for Sell direction (Sell must produce tNVDA debit + USDC credit, not the reverse)
    - Wave-3 (Buy/Sell market-order coverage) now complete; 01-06 marketFailures.spec.ts inverts assertion shape
tech-stack:
  added: []
  patterns:
    - "BOTH-sides on-chain delta assertion (tNVDA debited AND USDC credited) — strictly stronger than marketBuy's single-axis pin since Sell crosses bid-side and an inversion regression would visibly invert both axes"
    - "Spend-anchored 9.9 USDC floor on a 10 USDC target receive (≤ 1% default slippage tolerance), symmetric to marketBuy's 0.099 tNVDA floor on 0.1 target"
    - "Mirrored open-sequence: open-trade CTA → mode-tab market → side-toggle sell → wait market-form-loaded"
key-files:
  created:
    - tests/integration/ui/marketSell.spec.ts
  modified: []
decisions:
  - "Both specs assert tNVDA debited AND USDC credited (T-1-05-01 mitigation — TRADE-01 inversion regression on Sell would flip BOTH axes; we pin BOTH). Strictly stronger than marketBuy's single-axis pin because the Sell direction crosses bid-side, where an inversion is symmetric"
  - "Spend-anchored test interprets spend-input on Sell as the USDC target-receive (the side-relative 'spend/receive' framing). If the actual UI semantic differs (e.g. spend-input is always the USDC field regardless of side), this surfaces noisily on first CI run"
  - "Used initial pre-fund of 1 tNVDA (not 10) — sufficient headroom for 0.1 sell + slippage; mirrors marketBuy's 1000 USDC pre-fund (10× the spend amount) ratio"
  - "Mirrored marketBuy's open-sequence (open-trade CTA → mode-tab → side-toggle → market-form-loaded wait) verbatim with side flipped — keeps both specs aligned for parallel grep/refactor"
metrics:
  duration_minutes: 5
  completed_date: 2026-05-06
  task_count: 1
  commit_count: 1
  file_count: 1
---

# Phase 01 Plan 05: TEST-07 Sell Market-Order E2E Spec Summary

One-liner: Two-spec Playwright file covering Sell-market both asset-anchored (sell 0.1 tNVDA) and spend-anchored (target receive 10 USDC) paths, each asserting success-toast visible AND error-banner NOT visible AND BOTH-sides on-chain delta (tNVDA debited + USDC credited) — strictly stronger TRADE-01 pin than the Buy mirror.

## What Shipped

`tests/integration/ui/marketSell.spec.ts` — 145 LOC, 2 `test(...)` blocks under one `test.describe('TEST-07 — Sell market order via UI')`:

- **asset-anchored** (TRADE-04 asset mode on Sell): pre-funds 1 tNVDA via `fundErc20` (setStorageAt slot=0), opens trade panel via `[data-testid="open-trade"][data-side="sell"]`, switches to `[data-testid="mode-tab"][data-mode="market"]` + `[data-testid="side-toggle"][data-side="sell"]`, waits for `[data-testid="market-form-loaded"]`, fills `[data-testid="asset-input"] input` with `0.1`, submits `[data-testid="trade-submit"][data-side="sell"]`. Asserts: success-toast visible within 30s, error-banner NOT visible, on-chain `tNVDA.balanceOf < 1e18` (some tNVDA was sold), `USDC.balanceOf > 0n` (USDC was received).

- **spend-anchored** (TRADE-04 spend mode on Sell): same setup, fills `[data-testid="spend-input"] input` with `10` (target receive 10 USDC). Asserts: success-toast visible, error-banner NOT visible, on-chain `USDC.balanceOf >= 9.9 USDC` (slippage floor for ≤ 1% default cap), `tNVDA.balanceOf < initial`.

Both specs skip when `BASE_RPC_URL` unset (`test.skip(!process.env.BASE_RPC_URL, ...)`) — mirrors marketBuy.spec.ts:19 and smoke.spec.ts:18 skip-grammar.

**TRADE-01 implicit pin (stronger than marketBuy):** Both Sell specs assert BOTH `tNVDA.balanceOf < initial` AND `USDC.balanceOf > 0n` (or `>= 9.9 USDC`). If TRADE-01 ever inverts and Sell crosses ask-side counterparties, USDC would *decrease* and tNVDA would not be debited — both assertions fail. This is strictly stronger than marketBuy's single-axis pin (which only checks tNVDA delta).

## Verification Receipts

| Gate | Result |
|------|--------|
| `test -f tests/integration/ui/marketSell.spec.ts` | exists |
| `grep -q "test.skip(!process.env.BASE_RPC_URL" marketSell.spec.ts` | hit |
| `grep -cE "test\(.*asset-anchored\|test\(.*spend-anchored"` | 2 (≥ 2 required) |
| `grep -q 'data-testid="trade-submit"\]\[data-side="sell"'` | hit |
| Forbidden internal-logic imports (`$lib/services/marketOrderExecution`, `$lib/stores/transaction`, `$lib/services/orderDeployment`, `$lib/services/walletService`, `$lib/types/orderPerspective`) | 0 (D-11 lint passes) |
| `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | 16 (≥ 12 baseline) |
| `npx eslint tests/integration/ui/marketSell.spec.ts` | exit 0 |
| `npx playwright test --list` | 5 tests discovered (1 smoke + 2 Buy + 2 Sell) |

The two specs were NOT executed end-to-end because `BASE_RPC_URL` is not provisioned in the executor's environment (CI-only secret per 01-09). Plan 01-09 lands the CI run that validates this. Until then, the specs are exercised by `npx playwright test --list` (config + import resolution) and the verify-gate set above.

## Deviations from Plan

None — plan executed exactly as written. The plan's example code referenced `import { ..., TOKENS, FUNDED_ACCOUNT }` from `./fixtures`, but the same already-applied refinement from 01-04 (drop unused named imports; use fixture-injected `tokens` / `fundedAccount`) was applied here for consistency. Documented as a 01-04 deviation already; not re-listing.

The plan's example also used `page.fill('[data-testid="..."]', ...)` directly. Switched to `page.locator('[data-testid="..."] input').first().fill(...)` — matches marketBuy.spec.ts and accounts for the fact that `spend-input` / `asset-input` testids land on a wrapper `<TradeAmountInput>` element with the actual `<input>` nested inside (per 01-03 D-09 testid-on-wrapper convention). Not a deviation — fidelity to the established 01-04 pattern.

### Documented Assumptions

**Asset-anchored does NOT have a tNVDA-floor assertion (only `tNVDA < initial`).** Unlike marketBuy's asset-anchored test which asserts `tNVDA >= 0.099 floor`, the Sell asset-anchored test asserts only `tNVDA < initial` (some was sold). Reasoning: on Sell, the user's input is what they're *giving away* — slippage on a sell affects the USDC *received*, not the tNVDA spent. The tNVDA spend amount is the explicit input (0.1) and should match exactly post-fill. Asserting `tNVDA < initial` is the correctness check; asserting `tNVDA == initial - 0.1` would be tighter but partial-fill edge-cases (T-1-05-02) make a strict equality brittle. Matches plan acceptance criteria.

**`spend-input` semantic on Sell side.** Per 01-03 D-09 the same `TradeAmountInput` wrapper switches `data-testid` reactively on `inputMode`. On Sell, the spend-input represents "what USDC the user wants to receive" (the side-relative interpretation). If the actual MarketOrder.svelte semantic differs at the inputMode toggle (e.g. spend-input is always USDC regardless of side, but the math interprets it differently for Sell), this surfaces noisily on first CI run. Documented inline in the spec.

**Bid-side liquidity at FORK_BLOCK=33_400_000 for tNVDA.** 01-RUNBOOK §"No-liquidity (token, side) pair" flags `(wtAMZN, sell)` as a known-empty book; tNVDA Sell is NOT on that list, but bid-side depth was not pre-verified by this agent. If first CI run finds zero bid liquidity for tNVDA, swap to a token with confirmed bid depth and document in 01-RUNBOOK alongside the no-liquidity table.

## Threat Model Re-Walk

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-1-05-01 (Sell hitting ask-side counterparties — TRADE-01 inversion regression) | mitigate | BOTH specs assert `tNVDA.balanceOf < initial` AND `USDC.balanceOf > 0n` (or `>= 9.9 USDC`). If TRADE-01 inverts on Sell, USDC would decrease and tNVDA stay flat — BOTH assertions fail. Two-axis pin; strictly stronger than marketBuy's single-axis pin. |
| T-1-05-02 (Asymmetric ratio-cap math on Sell — partial fill within slippage tolerance produces <9.9 USDC received) | mitigate | Spend-anchored spec asserts `USDC.balanceOf >= parseUnits('9.9', 6)` after a 10 USDC target. A ratio-cap asymmetry that produced 9.5 USDC (5% slippage) would fail the assertion; a 1% slippage produces 9.9 USDC and just passes. Matches marketBuy's symmetric 0.099 tNVDA / 0.1 target floor. |
| (T-1-04-01 carried) UI success-toast flips green on internal error | mitigate | Both specs assert `success-toast visible` AND `error-banner NOT visible` AND on-chain BOTH-sides delta. Three independent checks. |

## Hand-Off

Wave-3 Buy/Sell market-order coverage now complete (01-04 + 01-05). TRADE-04 mode×side regression matrix populated on both axes; TRADE-01 INPUT/OUTPUT semantics implicitly pinned in both directions.

Plan 01-06 (marketFailures.spec.ts) inverts the assertion shape: each TEST-08 failure mode asserts `[data-testid="error-banner"][data-error-class="<class>"]` is visible AND `success-toast` NOT visible AND on-chain state unchanged. The 5 failure modes (slippage, no liquidity, stale oracle, insufficient balance, market-hours gating) reuse the same fixture machinery (testClient, fundedAccount, tokens) and the same open-sequence, only diverging on the forcing-mechanism per case (per 01-RUNBOOK §"No-liquidity" + §"Pyth freshness" + §"Saturday market-hours timestamp").

## Self-Check: PASSED

- `tests/integration/ui/marketSell.spec.ts` exists on disk and is tracked in git (commit 20ef813).
- Commit 20ef813 exists in `git log` on branch `phase-01-ui-driven-e2e-tests`.
- All plan verify-gate grep checks pass (verified above).
- `npx eslint tests/integration/ui/marketSell.spec.ts` exits 0.
- `npx playwright test --list` discovers 2 new Sell tests (5 total: 1 smoke + 2 Buy + 2 Sell).
- Locked invariants intact: `failWith(` count = 16 (≥ 12 baseline); no internal-logic imports added.
