---
phase: 02-trade-execution-backbone-refactor
plan: 03
subsystem: refactor
tags: [transaction-store, market-take-state-machine, circular-import, cycle-severance, trade-02]

# Dependency graph
requires:
  - phase: 02-trade-execution-backbone-refactor
    provides: "transactionShared.ts leaf module + façade in transaction.ts (PR-1, plan 02-02). marketTakeStore re-uses transactionStoreInternal + TransactionStatus + the 4 leaf utilities + the typed shared interfaces from there."
  - phase: 01-shrink-the-surface-see-what-s-happening
    provides: "failWith() OBS-03 transcript seam in marketOrderExecution.ts (Plan 01-07). Preserved verbatim through this rewrite — failWith count holds at 9."
provides:
  - "src/lib/stores/marketTakeStore.ts (NEW, 1337 lines) — owns the 5 market-take orchestration methods (preloadAggregatedTakeOrdersCalldata, handleAggregatedTakeOrdersCalldata, handleTakeOrders, handleOracleOrders, pollAndFinalizeTakeOrders) + private helpers (isSkippableMakerLegError, extractAvailableLiquidityAmount, buildExpectedPriceByOrderHash, formatPriceForReroute, shortOrderHash, buildLegRerouteMessage, sumBigints, deriveTakeRequestAmountWei, buildTakeOrdersRequest) + private aggregated-calldata cache (AggregatedTakeCacheEntry, aggregatedTakeCalldataCache, getAggregatedTakeCacheKey, shouldCacheAggregatedTakeResult, fetchAggregatedTakeOrdersCalldata) + ensureBulkPayerAllowanceIfNeeded multi-leg approval helper + a private createRaindexLink (the original copy stays in transaction.ts for non-take callers)."
  - "Sequential-block JSDoc contract on pollAndFinalizeTakeOrders protecting against Pitfall 6 (vault invalidation MUST run before partial-fill detection consumes its result)."
  - "Re-export façade in src/lib/stores/transaction.ts: imports the 5 methods from ./marketTakeStore and continues to expose them on the default export so the 15+ existing UI consumers (TransactionModal, MarketOrder, QuickTrade, TokenSwapModal, +page.svelte, etc.) keep working unchanged."
  - "marketOrderExecution.ts now imports the 3 take methods directly from $lib/stores/marketTakeStore + TransactionStatus + transactionStoreInternal from $lib/stores/transactionShared. Zero imports from $lib/stores/transaction. The TRADE-02 success-criterion-4 phase-exit grep gate returns 0 lines."
affects:
  - 02-04 (extracts deployTransactionStore + approvalStore + partialFillDetection — same destructure-from-transactionStoreInternal seam available)
  - 02-05 (orderDeployment.ts return-type fix; clears the 4 baseline svelte-check errors that shifted from transaction.ts:541/563/585/2223 to 380/402/424/1003 after this plan's deletion)
  - 02-08 (phase-exit re-runs the circular-import grep gate on marketOrderExecution.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lift-and-shift state-machine extraction: top-level `export const` functions that destructure store API at module top — preserves verbatim handler bodies while severing the closure dependency on the per-factory state."
    - "Module-tag log prefix convention: bracketed `[marketTakeStore:methodName]` (vs. the prior `[handleX]` shape) — gives Sentry/Vercel-Logs filterers a single token to grep when triaging market-take failures."
    - "Pitfall-6 JSDoc contract pattern: explicit `Sequential block — DO NOT split` on functions whose internal write-order is load-bearing for downstream consumers; documents the constraint in the function header where future contributors look first."

key-files:
  created:
    - "src/lib/stores/marketTakeStore.ts (NEW, 1337 lines, top-level exports of the 5 methods)"
  modified:
    - "src/lib/stores/transaction.ts (-1220 lines: deletes 5 method bodies + 9 private helpers + cache + ensureBulkPayerAllowance + bookkeeping comments and unused imports; adds 11-line import block from ./marketTakeStore)"
    - "src/lib/services/marketOrderExecution.ts (+10/-5 lines: rewrites import line at :31 + 4 call sites at :394 :434 :474 :482)"

key-decisions:
  - "Lifted helpers + cache as PRIVATE module-scope of marketTakeStore.ts (NOT re-exported, NOT promoted to a shared $lib/utils module). They are exclusively consumed by the 5 take methods, and `safeOneWeiBelow` (the only one that's also dead code) was already unused — moving the 9 helpers + 4-symbol cache as private internals keeps the public API surface of the new module to exactly the 5 methods. Plan 04 / 05 don't need any of these; if a future state-machine consumer needs them, promote-then."
  - "createRaindexLink kept in BOTH transaction.ts (used 5 times by deploy methods + handleWithdraw + handleRemoveOrder) and marketTakeStore.ts (used once in pollAndFinalizeTakeOrders). The wrapper is 4 lines around getRaindexOrderUrl from $lib/utils/tokenMath — moving it to a shared module would have leaked scope. The duplication is structurally tiny and disappears when Plan 04+ extracts the rest of transaction.ts."
  - "Method bodies lifted VERBATIM. All `set/update/awaitWalletConfirmation/awaitApprovalTx/transactionError/transactionSuccess` references inside the bodies preserved character-for-character; the only seams that had to change are (a) the destructure at module top instead of inside the factory closure, and (b) the console.* tag prefix renames inside the lifted bodies. Plan 04 will do the same for deployTransactionStore. Behaviour on the trade page is byte-equivalent."
  - "Marketplace UI consumers continue to call `transactionStore.handleTakeOrders(...)` (TokenSwapModal.svelte:421) via the façade default export — the export-default in transaction.ts spreads the imported marketTakeStore symbols into the same object shape that was there before. No UI binding site touched."
  - "marketOrderExecution.ts:482 `get(transactionStore)` rewritten to `get(transactionStoreInternal)` — the underlying writable is the same store; this read was the one path that needed the leaf import for value access (vs. method calls). Plan 04+ may move this read elsewhere when partialFillDetection extracts."
  - "Did NOT touch the 4 pre-existing svelte-check errors at transaction.ts (line numbers shifted from 541/563/585/2223 → 380/402/424/1003 after the deletion). Plan 02-05 will clear them via the orderDeployment.ts return-type fix."

patterns-established:
  - "Plan-by-plan progressive shrink of transaction.ts: PR-1 extracted the leaf shape; PR-2 (this) lifted the market-take state machine into its own module + severed the circular-import edge to marketOrderExecution.ts. PR-3/4/5 (Plans 02-04/05) lift the deploy + approval + partial-fill machinery off the same destructure seam. svelte-check stays at the 7-error baseline at every commit; the 15+ UI binding sites touch transaction.ts unchanged through the entire phase."
  - "The structural-cycle-elimination commit shape (Plan 02-03): commit 1 = `refactor(plan): lift methods into new file` — pure additive, transaction.ts façade unchanged externally. commit 2 = `refactor(plan): rewire callers to import from new file` — small import + identifier rewrite at the call site. svelte-check + tests green between the two commits, allowing safe bisect / revert if the production smoke test surfaces a regression."

requirements-completed: [TRADE-02]

# Metrics
duration: ~12min
completed: 2026-04-29
---

# Phase 2 Plan 03: TRADE-02 PR-2 — marketTakeStore Extraction + Cycle Severance Summary

**Lifted the 5 market-take orchestration methods (preloadAggregatedTakeOrdersCalldata, handleAggregatedTakeOrdersCalldata, handleTakeOrders, handleOracleOrders, pollAndFinalizeTakeOrders, ~1064 lines of handler bodies) out of the 2265-line transaction.ts into a new src/lib/stores/marketTakeStore.ts and rewired src/lib/services/marketOrderExecution.ts to import them directly — severing the last lexical edge in the transaction.ts ↔ marketOrderExecution.ts circular import surface. The TRADE-02 success-criterion-4 phase-exit grep gate now returns 0.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T21:02:43Z
- **Completed:** 2026-04-29T21:14:30Z
- **Tasks:** 2
- **Files modified:** 1 (transaction.ts) + 1 created (marketTakeStore.ts) + 1 modified (marketOrderExecution.ts)

## Accomplishments

- Created `src/lib/stores/marketTakeStore.ts` (1337 lines): owns the 5 take-order methods as top-level `export const` functions plus 9 private helpers, the aggregated-calldata cache (4 symbols + `fetchAggregatedTakeOrdersCalldata`), `ensureBulkPayerAllowanceIfNeeded`, and a private `createRaindexLink` copy.
- Shrunk `transaction.ts` by 1220 net lines (2265 → 1045) by deleting the 5 method bodies + 9 helpers + cache + multi-leg approval helper, and trimmed unused imports (`formatUnits`, `parseFloatHex`, `evaluateMarketOrderFill`, `getTrades`, `Float`, `authMethod`, plus 5 Rain SDK type imports + `TakeOrdersParams`).
- Added a JSDoc `Sequential block — DO NOT split into parallel awaits` contract on `pollAndFinalizeTakeOrders` to protect against Pitfall 6 (vault-balance invalidation must run BEFORE partial-fill detection consumes its result; otherwise the partial-fill banner could display stale balances). Plan 02-05 / partialFillDetection extraction must consume this result POST-completion, not interleaved.
- Façade in `transaction.ts` imports the 5 methods at the top from `./marketTakeStore` and continues to expose them on the `export default { ... }` object so the 15+ existing UI consumers (TransactionModal, MarketOrder, QuickTrade, TokenSwapModal, +page.svelte, WrapUnwrapModal, etc.) keep working unchanged.
- Rewrote `marketOrderExecution.ts:31` from `import transactionStore, { TransactionStatus } from '$lib/stores/transaction'` into TWO leaf imports: `TransactionStatus + transactionStoreInternal` from `transactionShared` and the 3 take methods from `marketTakeStore` directly. Rewrote 4 call sites: 3 method calls + the `get(transactionStore)` state read at :482.
- **Phase-exit gate:** `grep -E "from ['\"]\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` returns **0 lines**. The TRADE-02 PR-1 grep gate (`from './marketTakeStore'` in marketOrderExecution.ts) returns **1**. The reverse-cycle gate (`from '$lib/services/marketOrderExecution'` in marketTakeStore.ts) returns **0**. The OBS-03 baseline gate (`failWith(` count in marketOrderExecution.ts) holds at **9**. The TRADE-01 gate (raw IO-perspective property reads in marketOrderExecution.ts) holds at **0**.
- svelte-check held at the 7-error baseline (the 4 transaction.ts DeploymentTransactionArgs cast errors shifted from lines 541/563/585/2223 → 380/402/424/1003 because of the 1220-line deletion; Plan 02-05 will clear them via `orderDeployment.ts` return-type annotation). Test suite: 486 passing / 1 skipped, no regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lift 5 market-take methods into marketTakeStore.ts + add façade re-export** — `ee67803` (refactor)
   - Lifts the 5 method bodies + 9 private helpers + cache + ensureBulkPayerAllowanceIfNeeded + private createRaindexLink into the new file.
   - Updates transaction.ts to import the 5 methods from `./marketTakeStore` and re-export via the default export object.
2. **Task 2: Rewire marketOrderExecution.ts to import from marketTakeStore directly — sever the cycle** — `44a2666` (refactor)
   - The PR that meets TRADE-02 success criterion 4: structural circular-import elimination, not a patch.

## Files Created/Modified

- `src/lib/stores/marketTakeStore.ts` (NEW, 1337 lines) — market-take state machine. 5 exported methods + 9 private helpers + private aggregated-calldata cache + ensureBulkPayerAllowanceIfNeeded + private createRaindexLink. Imports `transactionStoreInternal + TransactionStatus + 4 leaf utilities + 6 shared types` from `./transactionShared`. Has zero imports from `$lib/services/marketOrderExecution`.
- `src/lib/stores/transaction.ts` (MOD, -1220 net lines: 2265 → 1045) — delete 5 method bodies + 9 helpers + cache + ensureBulkPayerAllowance + 6 unused imports. Adds 11-line import block from `./marketTakeStore` so the `export default { ... }` object still exposes the 5 methods.
- `src/lib/services/marketOrderExecution.ts` (MOD, +10 / -5 lines) — rewrite import line at :31 (1 → 5 lines) and 4 call sites at :394 :434 :474 :482.

## Decisions Made

- **Lifted helpers + cache as PRIVATE module-scope of marketTakeStore.ts.** Not re-exported, not promoted to a shared `$lib/utils` module. They are exclusively consumed by the 5 take methods. If a future state-machine consumer needs them, promote-then. The only "shared" private helper, `createRaindexLink`, is a 4-line wrapper around `getRaindexOrderUrl` — duplicated in both transaction.ts (5 deploy/withdraw/remove sites) and marketTakeStore.ts (1 site in pollAndFinalizeTakeOrders); promoting it to a util is out-of-scope for this plan.
- **Method bodies lifted VERBATIM.** Every `awaitWalletConfirmation`, `awaitApprovalTx`, `transactionError`, `transactionSuccess`, `update`, etc. reference inside the bodies is preserved character-for-character. Two seams changed: (a) destructure of those names happens at module top instead of inside the factory closure (so the bodies don't need a per-call `transactionStoreInternal.X(...)` rewrite), and (b) console-log tag renames from `[handleX]` to `[marketTakeStore:handleX]` inside the lifted bodies for triage clarity (no semantic change).
- **`get(transactionStore)` at marketOrderExecution.ts:482 rewritten to `get(transactionStoreInternal)`.** The underlying writable is the same — the difference is the import path. transactionStoreInternal is the leaf store; transactionStore is the façade default export. Both expose the same `subscribe` contract for `get()`. The plan flagged this as case (b) of Task 2's analysis ("the file references e.g. transactionStore.set somewhere"); my read found 1 such site (the state read), and rewrote it through the leaf import.
- **UI consumers UNTOUCHED.** TokenSwapModal.svelte:421 (`transactionStore.handleTakeOrders(...)`), WrapUnwrapModal.svelte:231 (`transactionStore.handleWrapUnwrap(...)`), TransactionModal.svelte (3 method calls + multiple `$transactionStore.X` reactive reads), and 15+ other consumer sites all use the façade default export from `$lib/stores/transaction`. The export-default object continues to spread the 5 take methods alongside the unchanged deploy/wrap/remove/withdraw methods.
- **Did NOT touch the 4 pre-existing svelte-check errors at transaction.ts.** They shifted from lines 541/563/585/2223 to 380/402/424/1003 because of the deletion, but the root cause is unchanged: `gui.getDeploymentTransactionArgs(...)` returns `WasmEncodedResult<unknown>` and `showRainlangConfirmation(deploymentArgs: DeploymentTransactionArgs, ...)` receives the unknown value. Plan 02-05 will fix via return-type annotation in `orderDeployment.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createRaindexClient` import had to be re-added to transaction.ts after import-list trim**

- **Found during:** Task 1, post-deletion svelte-check
- **Issue:** I trimmed `createRaindexClient` from the imports at `$lib/clients/raindex` because the methods that called it (`fetchAggregatedTakeOrdersCalldata`, the cache type alias) were being moved to marketTakeStore.ts. But three OTHER call sites of `createRaindexClient` survive in transaction.ts at lines 275, 554, 782 (used by `handleRemoveOrder` and `handleWithdraw`). svelte-check raised "Cannot find name 'createRaindexClient'" 3 times.
- **Fix:** Re-added `import { createRaindexClient } from '$lib/clients/raindex'` to the import block in transaction.ts (placed in the same logical position as before, between `rainlangConfirmationModal/reviewStrategyOnDeploy` and `invalidateOrderQueries` per CONVENTIONS.md import order).
- **Files modified:** `src/lib/stores/transaction.ts` (1 import line restored).
- **Verification:** `npm run check` returns 7 errors (baseline). Both Tasks 1 & 2 then ran clean.
- **Committed in:** `ee67803` (Task 1 atomic commit — caught + fixed before commit).

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking import resolution).
**Impact on plan:** Trivial — the trim was overzealous; the fix is one re-added import line. No scope creep, no behaviour change. The same class of issue (over-trimming imports during deletion-heavy refactors) was logged in Plan 02-02's "Issues Encountered" section — same lesson, same trivial cost.

## Issues Encountered

- **Plan acceptance criterion `grep -cE "from '\$lib/services" src/lib/stores/marketTakeStore.ts` returns 0 is overly strict for the lift-and-shift case.** marketTakeStore.ts imports `sendTransaction`, `waitForTransaction`, `APPROVAL_TX_CONFIRMATIONS` from `$lib/services/walletService` — exactly the same imports the original code in transaction.ts had, and exactly the same pattern the broader codebase uses (walletService is a normal cross-cutting service consumed by stores). Treating "no `$lib/services` import" as the "leaf-pure direction" gate would force duplicating those wallet-service function bodies into the new module. The acceptance criterion that materially matters — `grep -cE "from '\$lib/services/marketOrderExecution'" src/lib/stores/marketTakeStore.ts` returns 0 — is satisfied. The plan's `must_haves.truths` block confirms this: "marketTakeStore.ts does NOT import from `$lib/services/marketOrderExecution`" is the truth that owns the cycle severance, not a no-import-from-`$lib/services`-at-all rule. Documented here as a plan-text-vs-plan-intent discrepancy; structural intent fully met.
- **Plan listed lines 1467-2013 as the extraction range; actual range was 977-2041 in the post-PR-1 transaction.ts.** PR-1's deletion of 109 lines shifted the line numbers but the methods are the same. Used `grep -n "preloadAggregatedTakeOrdersCalldata|handleAggregatedTakeOrdersCalldata|handleTakeOrders|handleOracleOrders|pollAndFinalizeTakeOrders"` to enumerate sites at execution time, per the plan's explicit instruction to verify line ranges at execution.

## User Setup Required

None — pure refactor, no external service configuration, no schema or environment changes.

## Manual Smoke Test

Per Plan 02-VALIDATION.md "Manual-Only Verifications" / "Real-money smoke test post TRADE-02 PR-2": **DEFERRED to user.** The next manual gate before Plan 04 starts is one $5 Buy and one $5 Sell on /trade/[id] via test wallet, confirming TransactionStatus transitions render in UI, Sentry captures no new error class, and partial-fill detection fires correctly. This SUMMARY.md is the carry-forward record; smoke test outcome will be recorded in 02-04-SUMMARY.md prelude (or here as an addendum) once executed.

## Next Phase Readiness

- **Plan 02-04 (TRADE-02 PR-3 — extract deployTransactionStore + approvalStore + partialFillDetection):** ready. The destructure-from-transactionStoreInternal seam pattern (used by Task 1 here) is the template; the deploy methods can be lifted using the same shape. The 4 pre-existing svelte-check errors will move with the deploy methods (line numbers will shift again) — Plan 02-05 owns the actual fix.
- **Plan 02-05 (orderDeployment.ts return-type fix):** still owns clearing the 4 baseline svelte-check errors. Line numbers shifted from 541/563/585/2223 (post-PR-1) to 380/402/424/1003 (post-PR-2). Same root cause, same fix.
- **Plan 02-08 (phase-exit):** the circular-import grep gate `grep -E "from ['\"]\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` returns 0 from this plan onward. Plan 02-08 will re-run the gate as a phase-exit verification step.
- **Phase-exit gates contributed:** `test -f src/lib/stores/marketTakeStore.ts` exits 0; `grep -E "from ['\"]\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` returns 0 lines; `grep -cE "from '\\$lib/services/marketOrderExecution'" src/lib/stores/marketTakeStore.ts` returns 0; `failWith(` count holds at 9 (OBS-03 baseline preserved); TRADE-01 raw-read gate holds at 0; svelte-check holds at 7-error baseline.

## Threat Surface Scan

No new security-relevant surface introduced. The refactor moves existing wagmi/viem RPC call sites between modules without changing their trust boundaries — same `validateOrderbookAddress` calls with same arguments, same `withRetry` wrappings on chain reads (none added in this PR; Plan 02-06 owns the pre-flight `withRetry` wrapping for TRADE-03), same `wagmiConfig` retrieval, same approval-tx confirmations (`APPROVAL_TX_CONFIRMATIONS = 2`). The `[marketTakeStore:*]` log tag rename is purely a debugging-clarity change with no PII implications. ASVS V4 Access Control preserved (validateOrderbookAddress called with same arguments inside lifted methods). T-02-03-01 (cycle re-introduction) mitigated by the phase-exit grep gate; T-02-03-02 (vault-state ordering) mitigated by the JSDoc Sequential block contract; T-02-03-03 (identifier-rename omission) mitigated by `grep -c "transactionStore\\." src/lib/services/marketOrderExecution.ts = 0`; T-02-03-04 (transcript breakage) mitigated by `failWith(` count = 9 baseline preserved.

## Self-Check: PASSED

- File created — `src/lib/stores/marketTakeStore.ts`: FOUND
- File modified — `src/lib/stores/transaction.ts`: 1045 lines (was 2265) — FOUND
- File modified — `src/lib/services/marketOrderExecution.ts`: FOUND
- Commit `ee67803` (Task 1): FOUND in `git log --oneline`
- Commit `44a2666` (Task 2): FOUND in `git log --oneline`
- 5 export const methods in marketTakeStore.ts: VERIFIED (5)
- transaction.ts no longer locally defines the 5 methods: VERIFIED (0 `^const (...)` matches)
- transaction.ts imports the 5 methods from `./marketTakeStore`: VERIFIED (1 import block, 5 names)
- marketOrderExecution.ts has zero `from '$lib/stores/transaction'`: VERIFIED (0 matches)
- marketOrderExecution.ts imports from `$lib/stores/marketTakeStore`: VERIFIED (1 match)
- marketOrderExecution.ts imports from `$lib/stores/transactionShared`: VERIFIED (1 match)
- marketOrderExecution.ts has zero `transactionStore.X` member references: VERIFIED (0 matches)
- marketTakeStore.ts has zero imports from `$lib/services/marketOrderExecution`: VERIFIED (0 matches)
- Sequential-block JSDoc on pollAndFinalizeTakeOrders: VERIFIED (1 match for "Sequential block")
- failWith count in marketOrderExecution.ts: 9 (OBS-03 baseline preserved)
- TRADE-01 raw IO-perspective reads in marketOrderExecution.ts (excluding comments): 0
- svelte-check errors: 7 (matches baseline)
- Test count: 486 passing / 1 skipped (matches baseline)

---
*Phase: 02-trade-execution-backbone-refactor*
*Completed: 2026-04-29*
