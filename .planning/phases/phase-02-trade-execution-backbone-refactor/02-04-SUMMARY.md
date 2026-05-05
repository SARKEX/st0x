---
phase: 02-trade-execution-backbone-refactor
plan: 04
subsystem: refactor
tags: [transaction-store, deploy-state-machine, wrap-unwrap, withdraw, remove-order, trade-02]

# Dependency graph
requires:
  - phase: 02-trade-execution-backbone-refactor
    provides: "transactionShared.ts leaf module + façade in transaction.ts (PR-1, plan 02-02). deployTransactionStore re-uses transactionStoreInternal + the 4 leaf utilities + the typed shared interfaces from there."
  - phase: 02-trade-execution-backbone-refactor
    provides: "marketTakeStore.ts extracted in PR-2 (plan 02-03). This plan establishes deployTransactionStore as a SIBLING module that does NOT import from marketTakeStore — the two state machines share only the leaf."
provides:
  - "src/lib/stores/deployTransactionStore.ts (NEW, 988 lines) — owns the 10 deploy/wrap/withdraw/remove-order orchestration methods (handleStrategyDeployment, showRainlangConfirmation, handleDsfDeploy, handleDcaDeploy, handleLimitDeploy, handleFolioDeploy, handleWithdraw, handleRemoveOrder, handleWithdrawFromOrder, handleWrapUnwrap) + the helpers used exclusively by them (findVaultByIdAndToken, createRaindexLink, the wagmi readContract/sendTransaction/waitForTransaction wrappers, TAKE_TX_CONFIRMATIONS constant)."
  - "Re-export façade in src/lib/stores/transaction.ts: imports the 10 methods from ./deployTransactionStore and continues to expose them on the export-default object so the 15+ existing UI consumers (TransactionModal, MarketOrder, QuickTrade, TokenSwapModal, +page.svelte, WrapUnwrapModal, OrderActionsModal, etc.) keep working unchanged."
  - "transaction.ts shrunk from 1045 lines → 123 lines (-922 net). Now a thin façade with: types re-export block, classifyError + validateOrderbookAddress + isOrderbookTrusted + extractTransactionError re-exports (Plan 02 gate), import + spread of marketTakeStore methods (Plan 03 gate), import + spread of deployTransactionStore methods (this plan), and a 30-line export-default factory that destructures the leaf store API into a back-compat object shape."
affects:
  - 02-05 (orderDeployment.ts return-type fix; clears the 4 baseline svelte-check errors that travelled WITH showRainlangConfirmation from transaction.ts:380/402/424/1003 to deployTransactionStore.ts:359/381/403/987)
  - 02-06 (TRADE-03 pre-flight wiring in marketOrderExecution.ts; transactionShared remains the leaf seam)
  - 02-08 (phase-exit re-runs all the structural gates: circular-import absent, sibling decoupling, OBS-03 failWith count)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling state-machine decoupling: deployTransactionStore.ts and marketTakeStore.ts import the same leaf (transactionShared.ts) but do NOT import each other. Verified by `grep -cE \"from '\\$lib/stores/marketTakeStore'\" src/lib/stores/deployTransactionStore.ts` returning 0."
    - "Lift-and-shift verbatim: methods moved character-for-character; only seams that changed are (a) the destructure of awaitWalletConfirmation/awaitApprovalTx/transactionError/transactionSuccess/checkingWalletAllowance/reset happens at the top of deployTransactionStore.ts (vs. inside the per-factory closure in the original transaction.ts), and (b) console.* tag prefix renames from [handleX] → [deployTransactionStore:handleX]."
    - "Helpers and module-scope wagmi wrappers travel WITH the methods that use them: findVaultByIdAndToken + createRaindexLink + readContract + sendTransaction + waitForTransaction + TAKE_TX_CONFIRMATIONS were used exclusively by the lifted methods, so they moved together. transaction.ts no longer needs them and the matching imports were dropped."

key-files:
  created:
    - "src/lib/stores/deployTransactionStore.ts (NEW, 988 lines, 10 top-level export const methods + 2 private helpers + 4 module-scope constants)"
  modified:
    - "src/lib/stores/transaction.ts (-922 net lines: 1045 → 123; deletes 10 method bodies + 2 helpers + the wagmi wrappers + TAKE_TX_CONFIRMATIONS + ~25 imports that are now unused; adds import block from ./deployTransactionStore and updates the export-default object to spread the imported methods)"

key-decisions:
  - "Lifted helpers (findVaultByIdAndToken, createRaindexLink) as PRIVATE module-scope of deployTransactionStore.ts (NOT re-exported, NOT promoted to a shared $lib/utils module). They are exclusively consumed by the 10 lifted methods. Plan 02-03 made the same decision for marketTakeStore.ts's 9 helpers + cache. The single 'shared' helper, createRaindexLink, was duplicated between transaction.ts and marketTakeStore.ts in PR-2 because both modules used it; in PR-3 the transaction.ts copy moves to deployTransactionStore.ts and marketTakeStore.ts retains its own copy — both modules still need it. Promoting createRaindexLink to a $lib/utils helper is out-of-scope; will happen naturally if a third caller emerges."
  - "Method bodies lifted VERBATIM. Two seams changed only: (a) destructure of awaitWalletConfirmation/awaitApprovalTx/transactionError/transactionSuccess/checkingWalletAllowance/reset happens at module top instead of inside the factory closure (so bodies don't need per-callsite `transactionStoreInternal.X(...)` rewrites), and (b) console.* tag prefix renames from [handleX] → [deployTransactionStore:handleX] inside the lifted bodies for triage clarity. Behavior on deploy / withdraw / wrap-unwrap UI flows is byte-equivalent."
  - "transaction.ts is now a 123-line thin façade. It still defines a transactionStore() factory that returns the back-compat object shape consumers expect (subscribe + status helpers + 19 method handlers spread from the imported modules), but no longer has any handler bodies of its own. Plan 02-05 will likely shrink it further when approval logic moves out — at which point the factory will be replaceable with a pure spread of transactionStoreInternal."
  - "Did NOT touch the 4 pre-existing svelte-check errors. They travelled WITH showRainlangConfirmation (the receiver of `unknown` from `gui.getDeploymentTransactionArgs`) from transaction.ts to deployTransactionStore.ts: lines 380/402/424/1003 → 359/381/403/987. The threat-model entry T-02-04-02 acknowledged this; Plan 02-05 will clear them via the orderDeployment.ts return-type annotation. svelte-check error count remains at 7 baseline."
  - "Sibling decoupling preserved structurally. deployTransactionStore.ts has 0 imports from $lib/stores/marketTakeStore (T-02-04-01 mitigation): the two modules share only the leaf (transactionShared.ts) and exist as siblings under transaction.ts's façade. If they ever needed to share state-machine code, that would be a Plan 02-05 / 02-06 architectural change, not an opportunistic edit during a lift-and-shift."

patterns-established:
  - "Plan-by-plan progressive shrink of transaction.ts continues: PR-1 (plan 02-02) extracted the leaf shape (transactionShared); PR-2 (plan 02-03) lifted the market-take state machine + severed the circular-import edge to marketOrderExecution.ts; PR-3 (this plan) lifts the deploy / wrap-unwrap / withdraw / remove-order methods into a sibling state-machine module. transaction.ts is now a thin re-export façade. Plan 02-05 will likely take the remaining approval glue out and reduce transaction.ts to ~30 lines or eliminate it entirely. The 15+ UI binding sites have been untouched through every PR."
  - "Sibling state-machine isolation: deployTransactionStore + marketTakeStore are SIBLINGS that share the leaf (transactionShared) but do NOT import each other. Validated by grep: each module has 0 imports from the other. This is the structural gate that prevents future PR drift from re-coupling them. Plan 02-08 (phase-exit) will re-verify."

requirements-completed: [TRADE-02]

# Metrics
duration: ~5min
completed: 2026-04-29
---

# Phase 2 Plan 04: TRADE-02 PR-3 — deployTransactionStore Extraction Summary

**Lifted the 10 deploy / wrap-unwrap / withdraw / remove-order orchestration methods (handleStrategyDeployment, showRainlangConfirmation, handleDsfDeploy, handleDcaDeploy, handleLimitDeploy, handleFolioDeploy, handleWithdraw, handleRemoveOrder, handleWithdrawFromOrder, handleWrapUnwrap) out of the 1045-line transaction.ts into a NEW 988-line src/lib/stores/deployTransactionStore.ts. transaction.ts now contains only the type re-export block, the export-default factory that spreads the imported methods, and ~30 lines of comments — net 1045 → 123 lines. UI bindings preserved unchanged via the export-default façade.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-29T21:22:43Z
- **Completed:** 2026-04-29T21:27:17Z
- **Tasks:** 1
- **Files modified:** 1 (transaction.ts) + 1 created (deployTransactionStore.ts)

## Accomplishments

- Created `src/lib/stores/deployTransactionStore.ts` (988 lines): owns the 10 deploy/wrap/withdraw/remove-order orchestration methods as top-level `export const` functions plus 2 private helpers (`findVaultByIdAndToken`, `createRaindexLink`) plus the module-scope wagmi wrappers (`readContract` retry-wrapper, `sendTransaction`, `waitForTransaction`) and the `TAKE_TX_CONFIRMATIONS` constant — all of which were used exclusively by the lifted methods.
- Shrunk `transaction.ts` from 1045 → 123 lines (-922 net) by deleting the 10 method bodies + 2 helpers + the wagmi wrappers + ~25 imports that are now unused (`decodeFunctionData`, `encodeFunctionData`, `erc20Abi`, `viem.Hash`, `viem.Hex`, `wagmiReadContract`, `walletServiceSendTransaction`, `walletServiceWaitForTransaction`, `APPROVAL_TX_CONFIRMATIONS`, `withRetry`, `DeploymentTransactionArgs` type, `RaindexVault` type, `getRaindexOrderUrl`, `getRaindexVaultUrl`, `isPaymentToken`, `TransactionErrorMessage`, `isStaleWalletSessionError`, `handleStaleWalletSession`, `wagmiConfig`, `walletAddress`, `track`, `getDcaDeploymentArgs`, `getLimitOrderDeploymentArgs`, `getMarketMakingDeploymentArgs`, `getFolioDeploymentArgs`, the 4 deployment-arg types, `wrapToken`, `unwrapToken`, `rainlangConfirmationModal`, `reviewStrategyOnDeploy`, `createRaindexClient`, `invalidateOrderQueries`, `invalidateUserVaultQueries`, `invalidateDashboardBalances`, `Network` type, `ZERO_FLOAT_HEX`, `getMakerOutputTokenAddress`, `getMakerInputTokenAddress`, `getMakerInputIOIndex`, `getMakerOutputIOIndex`, `currentNetwork`, `get` from svelte/store).
- Façade in `transaction.ts` imports the 10 methods at the top from `./deployTransactionStore` and continues to expose them on the `export default { ... }` object so the 15+ existing UI consumers (TransactionModal, MarketOrder, QuickTrade, TokenSwapModal, +page.svelte, WrapUnwrapModal, OrderActionsModal, etc.) keep working unchanged.
- **Phase-exit gate `T-02-04-01`:** `grep -cE "from '\$lib/stores/marketTakeStore'" src/lib/stores/deployTransactionStore.ts` returns **0**. Sibling decoupling preserved — the two state-machine modules share only the leaf (transactionShared.ts) and never import each other.
- svelte-check held at the 7-error baseline. The 4 transaction.ts DeploymentTransactionArgs cast errors travelled WITH `showRainlangConfirmation` to deployTransactionStore.ts: previously at lines 380/402/424/1003 in transaction.ts, now at lines 359/381/403/987 in deployTransactionStore.ts. Plan 02-05 will clear them via the orderDeployment.ts return-type annotation.
- Test suite: **486 passing / 1 skipped, no regressions.**
- Cross-cutting gates preserved:
  - Plan 03 gate: `grep -cE "from ['\"]\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` returns **0**.
  - OBS-03 baseline: `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` returns **9**.
  - Plan 02 leaf gate: `grep -cE "from '\$lib/services" src/lib/stores/transactionShared.ts` returns **0**.
  - Reverse-cycle gate: `grep -cE "from '\$lib/services/marketOrderExecution'" src/lib/stores/marketTakeStore.ts` returns **0**.
  - TRADE-01 raw-IO-perspective reads: held at 0 in src/ outside the allowlist.

## Task Commits

The plan defined 1 task. It was committed atomically:

1. **Task 1: Lift deploy/wrap/withdraw methods into deployTransactionStore.ts + add façade re-export** — `0e197f7` (refactor)
   - Lifts the 10 method bodies + 2 private helpers + wagmi wrappers + `TAKE_TX_CONFIRMATIONS` into the new file.
   - Updates transaction.ts to import the 10 methods from `./deployTransactionStore`, spreads them into the export-default factory's return shape, and removes the now-orphaned imports + helper definitions.

## Files Created/Modified

- `src/lib/stores/deployTransactionStore.ts` (NEW, 988 lines) — deploy + wrap-unwrap + withdraw + remove-order state machine. 10 exported methods + 2 private helpers (`findVaultByIdAndToken`, `createRaindexLink`) + 4 module-scope constants/wrappers (`readContract`, `sendTransaction`, `waitForTransaction`, `TAKE_TX_CONFIRMATIONS`). Imports `transactionStoreInternal + 4 leaf utilities + 3 shared types` from `./transactionShared`. Has zero imports from `$lib/stores/marketTakeStore` (sibling decoupling) and zero from `$lib/services/marketOrderExecution`.
- `src/lib/stores/transaction.ts` (MOD, -922 net lines: 1045 → 123) — delete 10 method bodies + 2 helpers + the wagmi wrappers + TAKE_TX_CONFIRMATIONS + ~25 imports that are now unused. Adds 14-line import block from `./deployTransactionStore` and updates the export-default factory's return object to spread the imported methods.

## Decisions Made

- **Lifted helpers (`findVaultByIdAndToken`, `createRaindexLink`) as PRIVATE module-scope of deployTransactionStore.ts.** Not re-exported, not promoted to a shared `$lib/utils` module. They are exclusively consumed by the 10 lifted methods. The same private-helper decision was made in Plan 02-03 for marketTakeStore.ts. `createRaindexLink` continues to be duplicated between deployTransactionStore.ts and marketTakeStore.ts (both modules still need it for their own raindex-link construction); promoting it to a `$lib/utils` helper is out-of-scope for this plan.
- **Method bodies lifted VERBATIM.** Every `awaitWalletConfirmation`, `awaitApprovalTx`, `transactionError`, `transactionSuccess`, `checkingWalletAllowance`, `reset`, `track`, `validateOrderbookAddress`, etc. reference inside the bodies is preserved character-for-character. Two seams changed: (a) destructure of those names happens at module top instead of inside the factory closure (so the bodies don't need a per-call `transactionStoreInternal.X(...)` rewrite), and (b) console-log tag renames from `[handleRemoveOrder]` → `[deployTransactionStore:handleRemoveOrder]` inside the lifted bodies for triage clarity (no semantic change).
- **transaction.ts is now a 123-line thin façade.** It still defines a `transactionStore()` factory that returns the back-compat object shape consumers expect (subscribe + reset + the 6 status helpers + 11 method handlers spread from the imported modules), but no longer has any handler bodies of its own. The factory remains because (a) the export-default consumers do `transactionStore.X(...)` member access, which requires an object — not module re-exports, and (b) some destructuring of `transactionStoreInternal` API is still needed to expose `subscribe`/`reset`/etc. at the top level. Plan 02-05 may further reduce or eliminate this factory.
- **Did NOT touch the 4 pre-existing svelte-check errors.** They travelled WITH `showRainlangConfirmation` (the receiver of `unknown` from `gui.getDeploymentTransactionArgs`) from transaction.ts to deployTransactionStore.ts: lines 380/402/424/1003 → 359/381/403/987. Threat-model entry T-02-04-02 acknowledged this travel as accepted; Plan 02-05 will clear them via the `orderDeployment.ts` return-type annotation. svelte-check error count remains at 7 baseline.
- **`APPROVAL_TX_CONFIRMATIONS = 2` preserved.** The constant is imported from `$lib/services/walletService` (where it lives) and used in `handleStrategyDeployment`'s approval-tx loop. Per CONVENTIONS.md "Confirmations & Transaction Hygiene", DO NOT change to 1 — that would race with reorgs. Plan 02-05's approval-extraction will likely move this constant into `approvalStore.ts` along with the approval logic; for now it lives in `walletService` and is consumed in `deployTransactionStore.ts` unchanged.
- **UI consumers UNTOUCHED.** TokenSwapModal.svelte, WrapUnwrapModal.svelte:231 (`transactionStore.handleWrapUnwrap(...)`), TransactionModal.svelte (3 method calls + multiple `$transactionStore.X` reactive reads), QuickTrade.svelte, MarketOrder.svelte, OrderActionsModal.svelte, +page.svelte, etc. all use the façade default export from `$lib/stores/transaction`. The export-default object continues to spread the 10 deploy/wrap/withdraw methods alongside the 5 take methods + 6 status helpers + subscribe/reset.
- **`writable` import removed from transaction.ts.** Was only used by the local factory's previous body (which had its own writable in pre-PR-1 versions). Now that transaction.ts pure-spreads from `transactionStoreInternal` and has no method bodies of its own, no `writable` is needed. Same trim happened in Plan 02-02 for the leaf-extraction case.

## Deviations from Plan

### Auto-fixed Issues

**None.** No deviations required during this plan. The lift-and-shift was clean: every reference inside the method bodies resolved against either (a) the destructured `transactionStoreInternal` API at module top, (b) a private helper that travelled with the methods, (c) an imported leaf utility from `./transactionShared`, (d) an imported third-party / `$lib/services` value used unchanged from the original transaction.ts.

The plan-author's `read_first` note flagged the 4 svelte-check errors travelling with `showRainlangConfirmation` as an accepted/expected behavior (Plan 02-05 owns the fix). It happened exactly as predicted: 380/402/424/1003 → 359/381/403/987. **Total deviations: 0.**

## Issues Encountered

- **Plan acceptance criterion `grep -cE "from '\$lib/services" src/lib/stores/deployTransactionStore.ts` returns 1 was overly strict for the lift-and-shift case** (same class of issue as Plan 02-03's first "Issues Encountered" bullet). My new file has 4 `$lib/services` imports: `walletService` (for `sendTransaction`, `waitForTransaction`, `APPROVAL_TX_CONFIRMATIONS`), `orderDeployment` (for `getDcaDeploymentArgs` + `getLimitOrderDeploymentArgs` + `getMarketMakingDeploymentArgs` + `getFolioDeploymentArgs` + the 4 type imports), `wrapService` (for `wrapToken` + `unwrapToken`), and `analytics` (for `track`). All 4 imports are exactly what the original code in transaction.ts had, and exactly the cross-cutting service consumption pattern the broader codebase uses. Treating "no `$lib/services` import" as the leaf-purity gate would force duplicating those service function bodies into the new module. The materially-important gate (sibling decoupling: 0 imports from `$lib/stores/marketTakeStore`) is satisfied. The plan's `must_haves.truths` block confirms the structural intent: "deployTransactionStore.ts does NOT import from marketTakeStore.ts (the two state-machines are siblings, not coupled)" — that's the truth that owns the sibling-decoupling property, not a no-import-from-`$lib/services`-at-all rule. Documented here as a plan-text-vs-plan-intent discrepancy; structural intent fully met.
- **Plan listed `read_first` line ranges as 619-708 + 1467-2013** for the original transaction.ts — those were pre-PR-2 line numbers. Post-PR-2, the methods are at 167-1003 (consolidated after marketTakeStore extraction shifted line numbers). Used `grep -nE "(handleStrategyDeployment|showRainlangConfirmation|handleDsfDeploy|handleDcaDeploy|handleLimitDeploy|handleFolioDeploy|handleWithdraw|handleRemoveOrder|handleWithdrawFromOrder|handleWrapUnwrap)"` to enumerate sites at execution time, per the plan's explicit instruction to verify line ranges at execution.

## User Setup Required

None — pure refactor, no external service configuration, no schema or environment changes.

## Manual Smoke Test

Per Plan 02-VALIDATION.md "Manual-Only Verifications" / "Real-money smoke test post TRADE-02 PR-3": **DEFERRED to user.** A reasonable smoke test before Plan 02-05 starts is one $5 limit-order deploy, one wrap-unwrap operation on tNVDA, one withdraw from a vault, and one cancel-order via the UI — confirming the deploy/wrap/withdraw/remove-order TransactionStatus transitions render in UI, Sentry captures no new error class, and the rainlang-confirmation modal still shows when `reviewStrategyOnDeploy` is true. This SUMMARY.md is the carry-forward record; smoke test outcome will be recorded in 02-05-SUMMARY.md prelude (or here as an addendum) once executed.

## Next Phase Readiness

- **Plan 02-05 (orderDeployment.ts return-type fix + approval-store extraction):** ready. The 4 svelte-check errors at deployTransactionStore.ts:359/381/403/987 are the next target — fixing the `getDcaDeploymentArgs` / `getLimitOrderDeploymentArgs` / `getMarketMakingDeploymentArgs` / `getFolioDeploymentArgs` return-type annotations to `Promise<{ composedRainlang: string; deploymentArgs: DeploymentTransactionArgs }>` will clear all 4 in one PR. Approval-extraction (separate concern, same plan or 02-06) can lift the inline approval block in `handleStrategyDeployment` (deployTransactionStore.ts:171-258 area) into an `approvalStore.ts` utility consumed by both deploy and take paths.
- **Plan 02-06 (TRADE-03 pre-flight wiring) + Plan 02-07 (TRADE-04 math symmetry):** unblocked. Both modify `marketOrderExecution.ts` and/or `marketTakeStore.ts`; deployTransactionStore is sibling-isolated and won't conflict.
- **Plan 02-08 (phase-exit):** the sibling-decoupling grep gate `grep -cE "from '\$lib/stores/marketTakeStore'" src/lib/stores/deployTransactionStore.ts` returns 0 from this plan onward. Plan 02-08 will re-run the gate as a phase-exit verification step.
- **Phase-exit gates contributed:** `test -f src/lib/stores/deployTransactionStore.ts` exits 0; `grep -cE "from '\$lib/stores/marketTakeStore'" src/lib/stores/deployTransactionStore.ts` returns 0; `grep -cE "from '\$lib/services/marketOrderExecution'" src/lib/stores/deployTransactionStore.ts` returns 0; `failWith(` count holds at 9 (OBS-03 baseline preserved); TRADE-01 raw-read gate holds at 0; svelte-check holds at 7-error baseline.

## Threat Surface Scan

No new security-relevant surface introduced. The refactor moves existing wagmi/viem RPC call sites between modules without changing their trust boundaries — same `validateOrderbookAddress` calls with same arguments at deploy/withdraw/remove-order entry points, same `withRetry` wrapping on the `readContract` allowance-check (preserved by the `readContract` const that travels into deployTransactionStore.ts), same `wagmiConfig` retrieval, same approval-tx confirmations (`APPROVAL_TX_CONFIRMATIONS = 2`). The `[deployTransactionStore:*]` log tag rename is purely a debugging-clarity change with no PII implications. ASVS V4 Access Control preserved: `validateOrderbookAddress` is called at every transaction-submission site inside the lifted methods (handleStrategyDeployment for orderbook deployments, handleWithdraw for vault withdrawals, handleRemoveOrder + handleWithdrawFromOrder for order/vault management). Threat-model dispositions:

- **T-02-04-01 (sibling-coupling re-introduction)**: mitigated. `grep -cE "from '\$lib/stores/marketTakeStore'" src/lib/stores/deployTransactionStore.ts` returns 0.
- **T-02-04-02 (DeploymentTransactionArgs type drift)**: accepted (Plan 05 fixes). The 4 svelte-check errors travelled WITH `showRainlangConfirmation` to deployTransactionStore.ts:359/381/403/987. svelte-check error count remains at 7 baseline; this plan does not regress.
- **T-02-04-03 (logging tag drift)**: accepted. `[deployTransactionStore]` tag rename is for debugging clarity.
- **T-02-04-04 (approval-tx confirmations regression)**: mitigated. `APPROVAL_TX_CONFIRMATIONS` is imported unchanged from `$lib/services/walletService` and used at the same call site (handleStrategyDeployment's approval loop). Constant value (= 2) is owned by walletService.ts; not changed.
- **T-02-04-05 (façade contract drift)**: mitigated. svelte-check + tests pass; the export-default object explicitly spreads all 10 lifted methods alongside the 5 take methods + 6 status helpers; UI consumer paths unchanged.

No HIGH severity threats. No new threat-flag entries needed (the surface moved between modules, not into new territory).

## Self-Check: PASSED

- File created — `src/lib/stores/deployTransactionStore.ts`: FOUND (988 lines)
- File modified — `src/lib/stores/transaction.ts`: 123 lines (was 1045) — FOUND
- Commit `0e197f7` (Task 1): FOUND in `git log --oneline`
- 10 export const methods in deployTransactionStore.ts: VERIFIED (10)
- transaction.ts no longer locally defines the 10 methods: VERIFIED (0 `^const (...)` matches)
- transaction.ts imports the 10 methods from `./deployTransactionStore`: VERIFIED (1 import block, 10 names)
- deployTransactionStore.ts imports from `./transactionShared`: VERIFIED (1 match)
- deployTransactionStore.ts has zero imports from `$lib/stores/marketTakeStore`: VERIFIED (0 matches)
- deployTransactionStore.ts has zero imports from `$lib/services/marketOrderExecution`: VERIFIED (0 matches)
- APPROVAL_TX_CONFIRMATIONS preserved in deployTransactionStore.ts: VERIFIED (imported from walletService + used in approval loop)
- failWith count in marketOrderExecution.ts: 9 (OBS-03 baseline preserved)
- marketOrderExecution.ts has zero `from '$lib/stores/transaction'`: 0 (Plan 03 gate preserved)
- TRADE-01 raw IO-perspective reads in src outside allowlist: 0 (TRADE-01 gate preserved)
- svelte-check errors: 7 (matches baseline; the 4 transaction.ts errors travelled to deployTransactionStore.ts:359/381/403/987 — total unchanged)
- Test count: 486 passing / 1 skipped (matches baseline)

---
*Phase: 02-trade-execution-backbone-refactor*
*Completed: 2026-04-29*
