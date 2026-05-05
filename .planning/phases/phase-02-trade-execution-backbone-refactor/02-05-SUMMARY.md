---
phase: 02-trade-execution-backbone-refactor
plan: 05
subsystem: refactor
tags: [transaction-store, approval-store, partial-fill-detection, type-tightening, deploy-args, trade-02, trade-02-pr-4, trade-02-pr-5]

# Dependency graph
requires:
  - phase: 02-trade-execution-backbone-refactor
    provides: "transactionShared.ts leaf module + façade in transaction.ts (PR-1, plan 02-02)"
  - phase: 02-trade-execution-backbone-refactor
    provides: "marketTakeStore.ts (PR-2, plan 02-03) — circular-import edge severed"
  - phase: 02-trade-execution-backbone-refactor
    provides: "deployTransactionStore.ts (PR-3, plan 02-04) — sibling state machine extracted"
provides:
  - "src/lib/stores/approvalStore.ts (NEW, ~115 lines) — ensureAllowance utility consumed by both deploy + market-take state machines. Owns the canonical 'allowance read + ERC20 approve tx submission + APPROVAL_TX_CONFIRMATIONS=2 wait' sequence in exactly one place."
  - "src/lib/stores/partialFillDetection.ts (NEW, ~95 lines) — detectPartialFill helper consuming evaluateMarketOrderFill, called POST-completion (after vault invalidation) by pollAndFinalizeTakeOrders. Pitfall 6 mitigation made structural via call ordering + JSDoc."
  - "src/lib/services/orderDeployment.ts MOD — explicit `Promise<{ composedRainlang: string; deploymentArgs: DeploymentTransactionArgs }>` return-type annotations + `as DeploymentTransactionArgs` casts on getDcaDeploymentArgs / getLimitOrderDeploymentArgs / getMarketMakingDeploymentArgs / getFolioDeploymentArgs. Clears the 4 svelte-check errors that have been line-shifting through TRADE-02 PRs 1-3."
  - "src/lib/stores/transaction.ts shrunk from 123 → 32 lines — pure re-export façade (`{ ...transactionStoreInternal, ...deploy, ...marketTake }`) per 02-PATTERNS.md target shape. UI consumers' `$transactionStore.X` reactive subscriptions and `transactionStore.handleX(...)` method invocations preserved."
affects:
  - "02-06 (TRADE-03 pre-flight wiring) — transactionShared remains the leaf seam; the new approvalStore + partialFillDetection sit alongside it as additional leaves consumed by marketTakeStore."
  - "02-07 (TRADE-04 math symmetry) — partial-fill detection is now isolated in its own module; any TRADE-04 changes to partial-fill semantics modify partialFillDetection.ts, not pollAndFinalizeTakeOrders."
  - "02-08 (phase-exit) — re-runs all 5 module-existence + sibling-decoupling + leaf-direction + cycle-severance grep gates."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Callable utility with setStatus callback: `ensureAllowance` does NOT mutate transactionStoreInternal directly — the caller controls UI state via the setStatus callback. Keeps the utility pure on RPC + lets state-machine modules own their UI status transitions."
    - "Sequential block contract for partial-fill detection: `pollAndFinalizeTakeOrders` runs `invalidateDashboardBalances()` BEFORE `detectPartialFill` so the partial-fill banner cannot render with stale on-chain balance reads (Pitfall 6 mitigation made structural by call ordering + JSDoc)."
    - "Façade as pure spread: transaction.ts is now `{ ...transactionStoreInternal, ...deploy, ...marketTake }` — no local factory, no destructure, no method bodies. UI bindings preserved unchanged via the default export."
    - "Type lens at the source: explicit return-type annotation on `gui.getDeploymentTransactionArgs` consumers (where the SDK returns `WasmEncodedResult<unknown>`) cleared 4 downstream svelte-check errors at the showRainlangConfirmation call sites without modifying any consumer code."

key-files:
  created:
    - "src/lib/stores/approvalStore.ts (NEW, ~115 lines) — ensureAllowance + APPROVAL_TX_CONFIRMATIONS"
    - "src/lib/stores/partialFillDetection.ts (NEW, ~95 lines) — detectPartialFill + DetectPartialFillParams"
    - "tests/lib/stores/approvalStore.test.ts (NEW, 4 tests) — early-return on sufficient allowance, approve+confirm cycle, allowance-read tuple shape, APPROVAL_TX_CONFIRMATIONS=2 invariant"
    - "tests/lib/stores/partialFillDetection.test.ts (NEW, 5 tests) — partial / full / pays-anchor / no-fill / passthrough-fields"
  modified:
    - "src/lib/services/orderDeployment.ts — 4 explicit return-type annotations + 4 `as DeploymentTransactionArgs` casts. Imports DeploymentTransactionArgs from @rainlanguage/orderbook."
    - "src/lib/stores/transaction.ts (-91 net lines: 123 → 32) — replaces local `transactionStore()` factory + destructure with pure spread of transactionStoreInternal + deploy + marketTake."
    - "src/lib/stores/deployTransactionStore.ts — bulk-approval block restructured: balance-precondition stays (parallel fan-out), per-approval allowance read + approve tx now goes through ensureAllowance. Removed unused awaitApprovalTx + APPROVAL_TX_CONFIRMATIONS imports."
    - "src/lib/stores/marketTakeStore.ts — `ensureBulkPayerAllowanceIfNeeded` wrapper now delegates to ensureAllowance. `pollAndFinalizeTakeOrders` summary assembly replaced with detectPartialFill call AFTER invalidateDashboardBalances. Removed unused readContract wrapper + encodeFunctionData + withRetry + evaluateMarketOrderFill + MarketOrderSummary type imports."

key-decisions:
  - "`ensureAllowance` callable utility (NOT a Svelte store) per 02-PATTERNS.md 'Variation flag': caller-owned setStatus callback, utility never imports transactionStoreInternal. This keeps the dependency direction one-way and avoids coupling the utility to a specific consumer's writable."
  - "Deploy bulk-approval block restructured rather than replaced: kept the parallel balance-precondition (cheaper failure mode for the user — no wallet prompt before insufficient-balance shows) + delegated per-approval allowance read + approve tx to ensureAllowance. The pre-existing balance-check feature was preserved per the plan's 'preserve all existing edge-case handling' guidance."
  - "marketTake's `ensureBulkPayerAllowanceIfNeeded` wrapper retained (decode spender from SDK probe calldata, early-return on requiredWei <= 0) but its body now calls ensureAllowance. The wallet-confirmation status message ('Awaiting wallet confirmation to approve {symbol}...') is set BEFORE ensureAllowance, which then overwrites with CHECKING_ALLOWANCE / PENDING_APPROVAL via setStatus."
  - "SDK-driven approval flows (`approvalInfo.calldata` from getTakeCalldata) NOT migrated to ensureAllowance. They consume pre-encoded calldata from the Rain SDK rather than reading allowance independently — the ensureAllowance contract (read allowance, encode approve, send tx) doesn't fit them. They remain inline in marketTakeStore where the SDK return shape is locally available."
  - "Pitfall 6 made structural: `pollAndFinalizeTakeOrders` now calls `invalidateDashboardBalances()` BEFORE `detectPartialFill`. Previously the summary was assembled before the invalidation — same final state, but the new ordering is what the JSDoc 'Sequential block' contract says, and the partial-fill banner can no longer race the cache."
  - "transaction.ts shrunk to 32 lines via pure-spread: `{ ...transactionStoreInternal, ...deploy, ...marketTake }` instead of the previous 123-line factory + destructure pattern. `transactionStoreInternal` already exposes subscribe/set/update/reset/the 6 status helpers, so the spread is sufficient — no local factory needed. UI consumers' `$transactionStore.X` reactive subscriptions and `transactionStore.handleX(...)` invocations work unchanged."
  - "Rule 1 deviation in partialFillDetection.ts + test: PropertyAccessExpression reads on `params.inputTokenAddress` / `summary.inputTokenAddress` triggered TRADE-01's no-restricted-syntax rule. Auto-fixed by destructuring at function/test entry — same pattern marketTakeStore used pre-plan. Object-literal field assignment is not a MemberExpression and stays rule-safe."

patterns-established:
  - "TRADE-02 structurally complete after this plan: 5 focused state-machine modules under transaction.ts (transactionShared = leaf types/helpers; deployTransactionStore = deploy/wrap/withdraw/remove-order; marketTakeStore = 5 take methods; approvalStore = ensureAllowance utility; partialFillDetection = detectPartialFill). transaction.ts is a 32-line re-export façade that preserves the 15+ existing UI binding sites verbatim."
  - "Type lens at the source pattern: when an SDK call returns `WasmEncodedResult<unknown>` and downstream consumers see `unknown`, the canonical fix is an explicit return-type annotation + `as` cast at the immediate consumer (not at every transitive call site). Keeps type lenses local + auditable; matches the pre-existing pattern at orderDeployment.ts:188-193 documented in 02-PATTERNS.md."

requirements-completed: [TRADE-02]

# Metrics
duration: 15min
completed: 2026-04-29
---

# Phase 2 Plan 05: TRADE-02 PR-4 + PR-5 — approvalStore + partialFillDetection + Type Tightening Summary

**Closed the TRADE-02 split: extracted `ensureAllowance` into a callable utility consumed by both deploy + market-take state machines; extracted `detectPartialFill` into a thin wrapper called POST-completion (Pitfall 6 mitigation made structural); tightened the 4 deploy-args function return-types to clear the line-shifting svelte-check errors at the showRainlangConfirmation call sites; shrunk transaction.ts from 123 → 32 lines as a pure re-export façade. svelte-check baseline drops 7 → 3 (down to the pre-existing rpcMetrics test errors only).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-29T21:33:47Z
- **Completed:** 2026-04-29T21:49:17Z
- **Tasks:** 3
- **Files modified:** 4 (orderDeployment.ts, transaction.ts, deployTransactionStore.ts, marketTakeStore.ts) + 4 created (approvalStore.ts, partialFillDetection.ts, approvalStore.test.ts, partialFillDetection.test.ts)

## Accomplishments

- Created `src/lib/stores/approvalStore.ts` (~115 lines): `ensureAllowance({token, owner, spender, amount, network, setStatus})` callable utility + `APPROVAL_TX_CONFIRMATIONS=2`. Both wagmi calls (`readContract` for allowance, `sendTransaction` for approve) wrapped in `withRetry` per CONVENTIONS.md "Rule: any new wagmi/viem call should be wrapped with withRetry". Caller-owned setStatus callback drives UI state — utility never imports transactionStoreInternal (per 02-PATTERNS.md "Variation flag").
- Created `src/lib/stores/partialFillDetection.ts` (~95 lines): `detectPartialFill` + `DetectPartialFillParams` interface. Thin wrapper over `evaluateMarketOrderFill` that assembles a fully-populated `MarketOrderSummary`. Imports nothing from `$lib/services` or other state-machine stores — leaf direction preserved.
- **Pitfall 6 made structural**: `pollAndFinalizeTakeOrders` now calls `invalidateDashboardBalances()` BEFORE `detectPartialFill`. The Sequential-block JSDoc was preserved and expanded to spell out the call-ordering contract; future plans must not reorder these two calls.
- Tightened `orderDeployment.ts` return-type annotations on all 4 deploy-args functions: explicit `Promise<{ composedRainlang: string; deploymentArgs: DeploymentTransactionArgs }>` + matching `as DeploymentTransactionArgs` casts at return sites. **This clears the 4 svelte-check errors that have been line-shifting through TRADE-02 PRs 1-3** (transaction.ts:380/402/424/1003 → deployTransactionStore.ts:359/381/403/987 → CLEARED in this plan).
- Shrunk `transaction.ts` from 123 → 32 lines (-91 net): replaced the local `transactionStore()` factory + destructure with pure spread `{ ...transactionStoreInternal, ...deploy, ...marketTake }` per 02-PATTERNS.md target shape. UI consumers' `$transactionStore.X` reactive subscriptions and `transactionStore.handleX(...)` method invocations preserved verbatim.
- **svelte-check baseline drops from 7 → 3** — Phase 2 target (≤ 3) met. Only the pre-existing rpcMetrics test errors remain (out of scope for TRADE-02; documented in 02-VALIDATION.md baseline note).
- **Test suite: 495 passing / 1 skipped** (+9 new tests vs 02-04's 486: 4 approvalStore + 5 partialFillDetection). No regressions.
- All cross-cutting gates preserved:
  - Plan 03 cycle severance: `marketOrderExecution.ts` has 0 imports from `$lib/stores/transaction`.
  - Plan 02 leaf direction: `approvalStore.ts` and `partialFillDetection.ts` have 0 imports from `$lib/services`.
  - Plan 01 IO-perspective lockdown: 0 raw IO-perspective property reads in src/ + tests/ outside the canonical allowlist.
  - OBS-03 transcript gate: `failWith(` count holds at 9 in `marketOrderExecution.ts`.
  - Sibling decoupling: `deployTransactionStore.ts` has 0 imports from `marketTakeStore.ts`.
  - Reverse-cycle gate: 0 `$lib/stores/*.ts` files import from `$lib/services/marketOrderExecution`.

## Task Commits

Each task was committed atomically (TDD where applicable: test + impl in same commit per 02-02's TDD pattern, since splitting into a separate RED commit on a freshly-created module would require a placeholder export with no review or bisect value):

1. **Task 1: Create approvalStore.ts + rewire deploy + marketTake to consume it** — `80ffdc0` (refactor)
   - NEW src/lib/stores/approvalStore.ts (115 lines, exports ensureAllowance + APPROVAL_TX_CONFIRMATIONS)
   - NEW tests/lib/stores/approvalStore.test.ts (4 tests, all green)
   - MOD src/lib/stores/deployTransactionStore.ts (bulk-approval block restructured: balance-check stays, per-approval allowance + approve tx delegated to ensureAllowance; removed unused imports)
   - MOD src/lib/stores/marketTakeStore.ts (`ensureBulkPayerAllowanceIfNeeded` body delegates to ensureAllowance; removed unused readContract wrapper + encodeFunctionData + withRetry imports)

2. **Task 2: Extract partialFillDetection.ts + Pitfall 6 structural mitigation** — `b8c7427` (refactor)
   - NEW src/lib/stores/partialFillDetection.ts (95 lines, exports detectPartialFill + DetectPartialFillParams)
   - NEW tests/lib/stores/partialFillDetection.test.ts (5 tests, all green)
   - MOD src/lib/stores/marketTakeStore.ts (pollAndFinalizeTakeOrders: invalidateDashboardBalances() now runs BEFORE detectPartialFill; inline summary assembly + evaluateMarketOrderFill call replaced with detectPartialFill; removed unused MarketOrderSummary type import)

3. **Task 3: Tighten orderDeployment return types + shrink transaction.ts façade** — `adf3cf4` (refactor)
   - MOD src/lib/services/orderDeployment.ts (4 explicit return-type annotations + 4 `as DeploymentTransactionArgs` casts; imports DeploymentTransactionArgs from @rainlanguage/orderbook)
   - MOD src/lib/stores/transaction.ts (123 → 32 lines: pure spread façade)
   - MOD src/lib/stores/partialFillDetection.ts + tests/lib/stores/partialFillDetection.test.ts (Rule 1 deviation: destructure-at-entry to avoid TRADE-01 PropertyAccessExpression reads — see Deviations section)

**Plan metadata commit will be added separately after this SUMMARY.md + STATE.md updates.**

## Files Created/Modified

- `src/lib/stores/approvalStore.ts` (NEW, 115 lines) — Callable utility module. Exports `ensureAllowance({ token, owner, spender, amount, network, setStatus })` + `APPROVAL_TX_CONFIRMATIONS = 2`. Both wagmi RPC calls wrapped with `withRetry`. Imports nothing from `$lib/services`.
- `src/lib/stores/partialFillDetection.ts` (NEW, 95 lines) — Thin wrapper over `evaluateMarketOrderFill`. Exports `detectPartialFill(params)` returning a fully-populated `MarketOrderSummary`. Imports only `marketOrderFill` (for the math) and `transactionShared` (for the `MarketOrderSummary` type). 0 `$lib/services` imports.
- `tests/lib/stores/approvalStore.test.ts` (NEW, 4 tests) — covers: APPROVAL_TX_CONFIRMATIONS = 2 invariant, early-return on sufficient allowance (no approve tx sent), approve + waitForTransactionReceipt cycle on insufficient allowance, allowance read uses `(owner, spender)` tuple via `erc20Abi.allowance`.
- `tests/lib/stores/partialFillDetection.test.ts` (NEW, 5 tests) — covers: isPartialFill on wants-anchor when actual < 99.7% of requested, isFullFill when >= 99.7%, pays-anchor wins when `requestedTakerPaysAmount > 0`, isNoFill when actuals are zero, all passthrough fields populated.
- `src/lib/services/orderDeployment.ts` (MOD) — Imports `DeploymentTransactionArgs` from `@rainlanguage/orderbook`. Adds explicit `Promise<{ composedRainlang: string; deploymentArgs: DeploymentTransactionArgs }>` return-type annotations on `getDcaDeploymentArgs` (line 148), `getLimitOrderDeploymentArgs` (line 211), `getMarketMakingDeploymentArgs` (line 266), `getFolioDeploymentArgs` (line 357). Each function's `deploymentArgs = deploymentArgsResult.value` line now reads `as DeploymentTransactionArgs`.
- `src/lib/stores/transaction.ts` (MOD, -91 net lines: 123 → 32) — Replaces the previous `transactionStore()` factory + destructure with pure spread `{ ...transactionStoreInternal, ...deploy, ...marketTake }`. The reactive `$transactionStore.X` subscriptions work because `transactionStoreInternal` (the leaf writable) exposes `subscribe`. Method invocations work because the spread captures all 10 deploy/wrap/withdraw + 5 take + 6 status-helper methods.
- `src/lib/stores/deployTransactionStore.ts` (MOD) — `handleStrategyDeployment` bulk-approval block restructured: parallel balance-check fan-out preserved (cheaper failure mode for the user); per-approval allowance read + approve tx delegated to `ensureAllowance`. Removed `awaitApprovalTx` from destructure + `APPROVAL_TX_CONFIRMATIONS` from `walletService` imports (now flow through `approvalStore`).
- `src/lib/stores/marketTakeStore.ts` (MOD) — `ensureBulkPayerAllowanceIfNeeded` wrapper preserves the SDK-probe-calldata decode + early-return on requiredWei <= 0; its body now calls `ensureAllowance`. `pollAndFinalizeTakeOrders` Pitfall 6 mitigation made structural: `invalidateDashboardBalances()` runs BEFORE `detectPartialFill` (was AFTER inline summary assembly previously). Removed unused `readContract` wrapper + `encodeFunctionData` + `withRetry` + `evaluateMarketOrderFill` + `MarketOrderSummary` type imports.

## Decisions Made

- **`ensureAllowance` is a callable utility, NOT a Svelte store.** The plan name "approvalStore.ts" is somewhat misleading — there is no writable, no subscribe. The module exports a function. This matches 02-PATTERNS.md "Variation flag": "approval logic IS leaf-utility-shaped (no Svelte store), but the existing pattern in transaction.ts interleaves approval with `setState(TransactionStatus.PENDING_APPROVAL)` calls. Approach: the utility takes a `setStatus: (s: TransactionStatus) => void` callback so the caller drives the UI state."
- **Deploy bulk-approval restructured, not collapsed.** The pre-plan code did parallel balance + allowance checks for all approvals, then sequentially submitted approves for the insufficient ones. The plan's `ensureAllowance` reads allowance internally, so naively replacing the whole block would lose the parallel balance-check fan-out (which is a cheaper failure mode for the user — they see "insufficient {symbol} balance" before any wallet prompt). Restructured to: parallel balance-check (preserved) + filter by requiredAmount + per-approval `ensureAllowance` call. The plan's "preserve all existing edge-case handling" guidance covers this.
- **marketTake's `ensureBulkPayerAllowanceIfNeeded` wrapper retained.** The wrapper has 2 purposes the bare `ensureAllowance` doesn't: (a) decode the spender from the SDK's probe calldata (the SDK is the source of truth for which spender to approve, not a constant); (b) early-return when requiredWei <= 0 (the SDK can return a probe with no required allowance). Both are wrapper-level concerns, not utility-level. So the wrapper stays + delegates its allowance/approve work to ensureAllowance.
- **SDK-driven `approvalInfo.calldata` flows NOT migrated.** The 4-5 sites in `handleAggregatedTakeOrdersCalldata`, `handleOracleOrders`, and `handleTakeOrders` that consume `approvalInfo` from `getTakeCalldata` use a different pattern: the SDK gives them pre-encoded calldata + the token address, and they submit it directly. The `ensureAllowance` contract (read allowance, encode approve, send tx) doesn't fit them — they're SDK-orchestrated, not direct. Leaving them inline keeps the migration scoped + the SDK-driven flow self-documenting at the consumer site.
- **Pitfall 6 mitigation made structural by call ordering.** The pre-plan code in `pollAndFinalizeTakeOrders` was: (1) compute `evaluateMarketOrderFill`; (2) build summary; (3) build raindexLink; (4) `invalidateDashboardBalances()`; (5) `transactionSuccess(...)`. The new code is: (1) build raindexLink; (2) `invalidateDashboardBalances()`; (3) `detectPartialFill(...)` → summary; (4) `transactionSuccess(...)`. Same final state — the user-facing behavior is byte-equivalent — but the JSDoc "Sequential block" contract is now enforceable: the call ordering itself documents the contract.
- **transaction.ts pure-spread façade replaces the local factory.** `transactionStoreInternal` exposes `subscribe`/`set`/`update`/`reset`/the 6 status helpers (per Plan 02-02). The deploy + marketTake module objects expose 10 + 5 = 15 method handlers. Spread of all three covers the full back-compat surface without a local factory. Tested via the existing UI consumer access patterns (TransactionModal.svelte's `$transactionStore.X` reads, MarketOrder.svelte's `transactionStore.handleTakeOrders(...)` calls, etc.) — all work via the spread.
- **Type lens at the immediate consumer.** The `gui.getDeploymentTransactionArgs(...)` call returns `WasmEncodedResult<unknown>`. Three options to fix the downstream `showRainlangConfirmation(deploymentArgs)` errors: (a) propagate `unknown` to consumer + cast at use site; (b) return-type annotation + `as` cast at the immediate consumer (this plan); (c) bump the Rain SDK to a version where the return type is properly genericized. Picked (b) per 02-RESEARCH §"Pre-existing 4 svelte-check errors" recommendation: the SDK contract holds at alpha.231 (do NOT bump per RESEARCH §"Summary"); the immediate consumer is the right place because the type lens narrows `unknown → DeploymentTransactionArgs` exactly where the data is shape-checked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] partialFillDetection.ts + test triggered TRADE-01 ESLint rule (PropertyAccessExpression on banned IO-perspective field names)**

- **Found during:** Task 3 phase-exit verification (`npm run lint` after the type-tightening + façade-shrink edits).
- **Issue:** The plan-skeleton's body for `detectPartialFill` did `params.inputTokenAddress` / `params.outputTokenAddress` PropertyAccessExpression reads, and the test asserted on `summary.inputTokenAddress` / `summary.outputTokenAddress`. The TRADE-01 ESLint rule (`no-restricted-syntax` matching `MemberExpression[property.name=/^(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)$/]`) bans these reads outside the canonical allowlist (orderPerspective.ts / utils/orderbook.ts / api/orders.ts / generated-graphql.ts).
- **Fix:** Auto-fixed by destructuring at function/test entry and using shorthand object-literal assignment for the return shape. This is the same pattern marketTakeStore used pre-plan with `const inputTokenAddress = params.takerWantsToken.address;` followed by shorthand `{ inputTokenAddress, ... }`. Object-literal field assignment is not a `MemberExpression`, so the rule is rule-safe (per 02-RESEARCH §"Pitfall 2").
- **Files modified:** src/lib/stores/partialFillDetection.ts (destructured `params` at function entry), tests/lib/stores/partialFillDetection.test.ts (destructured `summary` at test entry, added `TOK_IN_ADDR` / `TOK_OUT_ADDR` consts to avoid `COMMON.inputTokenAddress` reads in assertions).
- **Verification:** `npm run lint` no longer flags partialFillDetection.ts; `grep -rnE "\\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\\b" --include='*.ts' --include='*.svelte' src/ tests/ | grep -vE "(orderPerspective\\.ts|utils/orderbook\\.ts|api/orders\\.ts|generated-graphql|io-perspective-violation\\.ts)" | grep -v '^[^:]*:[0-9]*: *//' | wc -l` returns 0; all 5 partialFillDetection tests still pass.
- **Committed in:** `adf3cf4` (Task 3 commit).

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug introduced by my new code). All cross-cutting gates preserved.

**Impact on plan:** The fix is a structural improvement, not a workaround. Destructuring at function entry is the established pattern across the codebase for working with object inputs that have IO-perspective field names. No scope creep — files modified are still within the plan's `files_modified` list (partialFillDetection.ts is one of the 6 specified files; its sister test file is implicitly in scope as the TDD partner).

## Issues Encountered

- **`vi.mock` factory hoisting in approvalStore.test.ts.** Initial test wrote `const mockReadContract = vi.fn()` at top-level then referenced it inside `vi.mock('@wagmi/core', () => ({ readContract: mockReadContract }))`. Vitest hoists `vi.mock` factories above top-level `const` declarations, so the factory ran before the consts were initialized → `ReferenceError: Cannot access 'mockReadContract' before initialization`. Fixed by wrapping the mock spies in `vi.hoisted(() => ({ ... }))` per Vitest's documented pattern. Same fix the codebase already uses in `vitest-setup.ts` for `mockWagmiConfigStore` etc.
- **transaction.ts `set` vs `update` exposure.** The pre-plan transaction.ts factory destructured + re-exposed `subscribe`, `reset`, and the 6 status helpers but explicitly NOT `set` or `update` (with a `void set` to silence unused-import lint). The new pure-spread `{ ...transactionStoreInternal, ... }` exposes BOTH `set` and `update` on the default export. This is technically a wider API surface than the pre-plan factory, but: (a) `transactionStoreInternal.set/update` were already public on the leaf module (lines 196-197 of transactionShared.ts); (b) no UI consumer calls `transactionStore.set(...)` or `transactionStore.update(...)` (verified by `grep`); (c) widening the façade default-export is the simplification the plan called for. Accepted.

## User Setup Required

None — pure refactor, no external service configuration, no schema or environment changes.

## Manual Smoke Test

Per 02-VALIDATION.md "Manual-Only Verifications" / "Real-money smoke test post TRADE-02 PR-4 + PR-5": **DEFERRED to user.** A reasonable smoke test before Plan 02-06 starts is one $5 limit-order deploy (verifies the deploy approval path through `ensureAllowance`), one market BUY against an oracle order (verifies the marketTake `ensureBulkPayerAllowanceIfNeeded` path through `ensureAllowance`), and one market SELL with a partial fill (verifies the `detectPartialFill` post-completion path + Pitfall 6 ordering — partial-fill banner should display the post-invalidation balance). Smoke test outcome will be recorded in 02-06-SUMMARY.md prelude (or here as an addendum) once executed.

## TRADE-02 Success Criteria Now Satisfied

After this plan, TRADE-02 ("Refactor transaction.ts into focused state-machine modules") is **structurally complete**. The 4 plan-level success criteria from 02-CONTEXT.md:

1. **Five focused state-machine modules under transaction.ts.** ✓ transactionShared (PR-1, plan 02-02), marketTakeStore (PR-2, plan 02-03), deployTransactionStore (PR-3, plan 02-04), approvalStore (PR-4, this plan), partialFillDetection (PR-5, this plan).
2. **transaction.ts is a re-export façade.** ✓ 32 lines (target ≤ 60). UI consumers' bindings preserved verbatim.
3. **Circular import edge severed.** ✓ `marketOrderExecution.ts` has 0 imports from `$lib/stores/transaction` (Plan 02-03 + held).
4. **svelte-check baseline reduced by ≥ 4 errors.** ✓ Was 7 (4 transaction.ts cast errors + 3 rpcMetrics test errors); now 3 (just the rpcMetrics test errors). Net -4, exact target.

Plan 02-06 (TRADE-03 pre-flight wiring) starts on a clean structural foundation — no transaction.ts orchestration to wade through, no circular import, type-lens narrowed at the deploy seam.

## Next Phase Readiness

- **Plan 02-06 (TRADE-03 pre-flight wiring in marketOrderExecution.ts):** ready. transactionShared remains the leaf seam; marketOrderExecution.ts already imports the 3 take methods directly from marketTakeStore (Plan 02-03 cycle severance gate). The new pre-flight wrapper inserts at line 329 per 02-PATTERNS.md without touching any state-machine module.
- **Plan 02-07 (TRADE-04 math symmetry):** ready. Partial-fill detection is now isolated in its own module; any TRADE-04 changes to partial-fill semantics modify partialFillDetection.ts, not pollAndFinalizeTakeOrders. The Sequential-block contract on pollAndFinalizeTakeOrders protects against accidental reordering.
- **Plan 02-08 (phase-exit):** ready. All 12 phase-exit gates from this plan + the cross-cutting gates from earlier plans are green. The phase-exit plan's main work is to (a) re-run all greps as a smoke test, (b) decide on `scripts/codemod-trade-01.ts` retention, (c) carry-forward deferred items + finalize REQUIREMENTS.md TRADE-02 mark-complete.
- **Phase-exit gates contributed by this plan:**
  - `wc -l src/lib/stores/transaction.ts` ≤ 60 (current: 32). ✓
  - `npm run check 2>&1 | grep -cE "^Error:"` ≤ 3 (current: 3). ✓
  - 5 new state-machine modules exist. ✓
  - `partialFillDetection.ts` does NOT import from `$lib/services`. ✓
  - `approvalStore.ts` does NOT import from `$lib/services`. ✓
  - 4 explicit `Promise<{ composedRainlang: string; deploymentArgs: DeploymentTransactionArgs }>` annotations + 4 `as DeploymentTransactionArgs` casts in orderDeployment.ts. ✓
  - Sibling decoupling: `deployTransactionStore.ts` has 0 imports from `marketTakeStore.ts`. ✓ (held from PR-3).
  - Circular-import absent: `marketOrderExecution.ts` has 0 imports from `$lib/stores/transaction`. ✓ (held from PR-2).

## Threat Surface Scan

No new security-relevant surface introduced. The refactor moves existing wagmi/viem RPC call sites between modules without changing their trust boundaries:
- `ensureAllowance` reads allowance + sends approve tx — same operations the inline blocks performed; same `withRetry` wrapping; same `APPROVAL_TX_CONFIRMATIONS = 2` wait. T-02-05-02 (approval-tx confirmations regression) MITIGATED structurally — the constant is defined inside approvalStore.ts and used in `waitForTransactionReceipt`'s `confirmations` arg.
- `detectPartialFill` is a pure function; no chain or wallet interaction. Its trust boundary is type-only (the `MarketOrderSummary` interface contract). T-02-05-01 (partial-fill interleaving) MITIGATED structurally — the call ordering inside `pollAndFinalizeTakeOrders` (`invalidateDashboardBalances()` THEN `detectPartialFill`) makes the Sequential-block contract enforceable.
- `orderDeployment.ts` return-type annotation + cast: the runtime shape is unchanged; only the type lens narrows `unknown → DeploymentTransactionArgs`. If the upstream Rain SDK ever returns a different shape, the deploy-tx submission fails downstream — the SAME failure mode as the previous `unknown` typing produced. T-02-05-03 (type-cast hides runtime error) NET behavior-equivalent.
- transaction.ts façade default-export drift: T-02-05-05 MITIGATED. The pure spread `{ ...transactionStoreInternal, ...deploy, ...marketTake }` captures all extracted methods. svelte-check + tests catch any consumer breakage.
- `[approvalStore]` console logs include the approval-tx hash (public on-chain data). T-02-05-04 (approval logging) ACCEPTED. No PII; addresses already covered by Sentry beforeSend scrubber from Phase 1 OBS-01.

ASVS V4 Access Control preserved: `validateOrderbookAddress` remains the gate inside `transactionShared.ts`; called by all approval-needing paths (`handleStrategyDeployment` for deploy, `handleOracleOrders` / `handleAggregatedTakeOrdersCalldata` / `handleTakeOrders` for take). No threat-flag entries needed (the surface moved between modules, not into new territory).

## Self-Check: PASSED

- File created — `src/lib/stores/approvalStore.ts`: FOUND
- File created — `src/lib/stores/partialFillDetection.ts`: FOUND
- File created — `tests/lib/stores/approvalStore.test.ts`: FOUND
- File created — `tests/lib/stores/partialFillDetection.test.ts`: FOUND
- File modified — `src/lib/services/orderDeployment.ts`: 4 explicit return-type annotations + 4 `as DeploymentTransactionArgs` casts VERIFIED
- File modified — `src/lib/stores/transaction.ts`: 32 lines (was 123) VERIFIED
- File modified — `src/lib/stores/deployTransactionStore.ts`: VERIFIED (bulk-approval restructured)
- File modified — `src/lib/stores/marketTakeStore.ts`: VERIFIED (Pitfall 6 ordering + ensureAllowance delegation + detectPartialFill call)
- Commit `80ffdc0` (Task 1): FOUND in `git log --oneline`
- Commit `b8c7427` (Task 2): FOUND in `git log --oneline`
- Commit `adf3cf4` (Task 3): FOUND in `git log --oneline`
- svelte-check error count: 3 (target ≤ 3) — VERIFIED
- transaction.ts line count: 32 (target ≤ 60) — VERIFIED
- 5 new state-machine modules exist: VERIFIED
- partialFillDetection imports from $lib/services: 0 — VERIFIED
- approvalStore imports from $lib/services: 0 — VERIFIED
- marketOrderExecution.ts imports from $lib/stores/transaction: 0 — VERIFIED
- failWith count in marketOrderExecution.ts: 9 — VERIFIED
- Sibling decoupling (deployTransactionStore imports from marketTakeStore): 0 — VERIFIED
- Reverse-cycle gate ($lib/stores/*.ts imports from $lib/services/marketOrderExecution): 0 — VERIFIED
- Promise<{ composedRainlang...DeploymentTransactionArgs }> count in orderDeployment.ts: 4 — VERIFIED
- `as DeploymentTransactionArgs` count in orderDeployment.ts: 4 — VERIFIED
- TRADE-01 raw IO-perspective gate (with comment + fixture filter): 0 hits — VERIFIED
- Test count: 495 passing / 1 skipped (was 486 / 1; +9 new tests, no regressions) — VERIFIED

---
*Phase: 02-trade-execution-backbone-refactor*
*Completed: 2026-04-29*
