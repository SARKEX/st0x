---
phase: phase-02-trade-execution-backbone-refactor
fixed_at: 2026-04-29T00:30:00Z
review_path: .planning/phases/phase-02-trade-execution-backbone-refactor/02-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-04-29T00:30:00Z
**Source review:** `.planning/phases/phase-02-trade-execution-backbone-refactor/02-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (Warnings; Info findings excluded per `critical_warning` scope)
- Fixed: 4
- Skipped: 0

**Verification baseline:**
- `npm test`: 523 passed / 1 skipped (unchanged from pre-fix baseline).
- `npm run check`: 3 errors in `tests/lib/server/rpcMetrics.test.ts` (unchanged baseline; unrelated to phase 2 surface).

**Note on worktree isolation:** The fixer's `setup_worktree` step was skipped because the target branch `gsd/phase-2-trade-execution-backbone-refactor` was already checked out in the main working tree and a second worktree on the same branch is not permitted by git. The orchestrator's prompt explicitly instructed to operate on the existing tree (`Working tree is clean; you're on branch gsd/phase-2-trade-execution-backbone-refactor. Use normal git commits with hooks`), and there is no concurrent foreground session to race. All four fixes were applied directly on the existing tree.

## Fixed Issues

### WR-01: `walkResult.inputAmountFilled` is not recomputed after the TRADE-03 pre-flight filter

**Files modified:** `src/lib/services/marketOrderExecution.ts`
**Commit:** `32d5423`
**Status:** fixed: requires human verification

**Applied fix:** After the pre-flight cascade mutates `walkResult.fills = workingFills` (line 484), recompute `walkResult.inputAmountFilled` and `walkResult.outputAmountGiven` from the survivors using the user-perspective mapping that `walkOrderbook` itself applies (Buy → input=asset/output=payment; Sell → input=payment/output=asset). The reviewer's suggested branches were inverted relative to the actual `walkOrderbook` source — the fix uses the canonical mapping confirmed via `src/lib/utils/orderbook.ts:392-393`.

**Verification:**
- Tier 1 (re-read): confirmed survivor totals computed once via `reduce` and then dispatched per `orderSide`.
- Tier 2 (test suite): `tests/lib/services/marketOrderExecution.test.ts` 8/8 passing. The pre-existing "one candidate drains; survivors pass pre-flight → silent retry succeeds" log line confirms behavior change: `walkOutputGiven` and `walkInputFilled` for the survivor case dropped from `'800000'` / `'800000000000000000'` to `'400000'` / `'400000000000000000'` — the survivor-only totals, exactly as expected after the fix.
- Marked `requires human verification` because the `requestedTakerWantsAmount`/`requestedTakerPaysAmount` semantics in `aggregatedParams` (line 563) and the partial-fill anchor in `pollAndFinalizeTakeOrders` are logic-sensitive and the existing tests don't appear to cover the partial-fill banner path end-to-end. Spot-check a real survivors-only execution to confirm the partial-fill banner no longer mis-fires.

### WR-02: `EnsureAllowanceParams.token.decimals` is declared but never read

**Files modified:** `src/lib/stores/approvalStore.ts`, `src/lib/stores/deployTransactionStore.ts`, `src/lib/stores/marketTakeStore.ts`, `tests/lib/stores/approvalStore.test.ts`
**Commit:** `39140d1`
**Status:** fixed

**Applied fix:** Removed `decimals: number` from the `EnsureAllowanceParams.token` shape, dropped the placeholder `decimals: 0` from both production callers, and updated the three `ensureAllowance({ token: { address: TOKEN, decimals: 6 }, ... })` test fixtures in `approvalStore.test.ts` to match the new shape.

The other `decimals: 0` occurrences in `src/lib/queries/costBasis.ts` (lines 29, 36, 92, 98) were intentionally NOT touched — they construct `CostBasisTrade` shapes, not `EnsureAllowanceParams`, and are out of scope for this finding.

**Verification:**
- Tier 1 (re-read): all four files re-read; surrounding code intact.
- Tier 2 (svelte-check): no new errors. Baseline of 3 errors in `tests/lib/server/rpcMetrics.test.ts` unchanged.
- Tier 2 (test suite): `tests/lib/stores/approvalStore.test.ts` 4/4 passing; full store-test directory 58/59 (1 pre-existing skip).

### WR-03: `aggregatedTakeCalldataCache` is unbounded and only evicted on TTL hit at read time

**Files modified:** `src/lib/stores/marketTakeStore.ts`
**Commit:** `cb5855c`
**Status:** fixed

**Applied fix:** Added `pruneExpiredAggregatedTakeCache(now)` helper that iterates the cache and deletes entries whose `expiresAt <= now`. Called immediately after every successful `set()` in `fetchAggregatedTakeOrdersCalldata`. This drains expired entries continuously, keeping cache size bounded by the count of currently-non-expired distinct take requests.

Chose sweep-on-write over LRU because cache key is `JSON.stringify(takeRequest)` (already non-trivial to hash) and the per-write O(n) sweep stays cheap because n is naturally small once expired entries are reclaimed.

**Verification:**
- Tier 1 (re-read): confirmed sweep call placed only on successful-cache-write path (does not run when `shouldCacheAggregatedTakeResult` rejects the result, preserving error-state semantics).
- Tier 2 (test suite): full `tests/lib/stores/` directory 58/59 passing (1 pre-existing skip).
- Tier 2 (svelte-check): baseline 3 errors unchanged.

### WR-04: `setInterval` polling in `handleStrategyDeployment` can interleave overlapping async ticks

**Files modified:** `src/lib/stores/deployTransactionStore.ts`
**Commit:** `d690a2e`
**Status:** fixed

**Applied fix:** Added an `inflight` boolean guard around the interval body. Each tick early-returns if a prior fetch is still outstanding. The guard is reset in a `finally` block so a thrown error never wedges polling. Also dropped the misleading `return transactionSuccess(...)` keywords on the inner success / max-attempt branches — interval callbacks discard return values, so the `return` was dead code that implied flow control it never had.

Restructured the interval body so the max-attempts branch runs inside the `try`, ensuring the `finally` block always resets `inflight` even if `transactionSuccess()` (which calls `invalidateOrderQueries` + `invalidateDashboardBalances` first) somehow throws.

**Verification:**
- Tier 1 (re-read): confirmed `inflight` toggles in try/finally, both branches use bare `transactionSuccess()` calls without the `return` keyword, and `clearInterval(interval)` still fires on both terminal paths.
- Tier 2 (test suite): full `npm test` 523/524 passing (1 pre-existing skip; same as baseline).
- Tier 2 (svelte-check): baseline 3 errors unchanged.

## Skipped Issues

None.

---

_Fixed: 2026-04-29T00:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
