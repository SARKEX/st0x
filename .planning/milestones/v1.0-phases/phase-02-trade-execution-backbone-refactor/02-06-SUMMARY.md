---
phase: 02-trade-execution-backbone-refactor
plan: 06
subsystem: trade-execution
tags: [rain-orderbook, raindex-sdk, multicall, observability, sentry, svelte-4]

# Dependency graph
requires:
  - phase: phase-01-shrink-the-surface-see-what-s-happening
    provides: OBS-03 failWith() seam in marketOrderExecution.ts; TakeOrderTranscript shape with `onChainStateRead.vaultBalance` field deliberately null
  - phase: phase-02-trade-execution-backbone-refactor
    provides: Plan 02-01 TRADE-01 IO-perspective lockdown (raw-IO ESLint ban + helpers); Plan 02-02..05 TRADE-02 transaction.ts split (transactionShared / deployTransactionStore / marketTakeStore / approvalStore / partialFillDetection)
provides:
  - SDK pre-flight via `RaindexClient.getOrderQuotesBatch` BEFORE take-order dispatch
  - Auto-walk cascade up to PREFLIGHT_MAX_WALKS=2 levels with silent retry on staleness (D-03/D-04)
  - 3 new TakeOrderFailureReason variants — preflight_chain_unreachable, preflight_order_vanished, auto_retry_exhausted
  - transcript.onChainStateRead.vaultBalance populated from SDK formattedMaxOutput (closes Phase 1 D-08 LIMITATION)
  - D-05 inline terminal-state error block in MarketOrder.svelte ("No liquidity available right now for this size...")
  - failWith() count raised from 9 to 16 in marketOrderExecution.ts
affects:
  - 02-07 (TRADE-04 math symmetry — pre-flight wiring is upstream of slippage-cap derivation)
  - 02-08 (Phase 2 phase-exit verification — failWith() ≥ 12 + transcript.vaultBalance non-null gates inherited)
  - Phase 3 REL-01 (RPC retry-with-backoff; the new pre-flight call becomes another beneficiary)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-flight + auto-walk cascade pattern: SDK getOrderQuotesBatch → filter survivors → re-walk until budget exhausted, all wrapped in withRetry"
    - "transcript.vaultBalance population BEFORE failure-return so even error transcripts carry the on-chain truth that triggered the failure"
    - "D-05 reactive predicate derives terminal-state from local orderPreparationError (not transactionStore.error) — matches MarketOrder.svelte's actual data flow"

key-files:
  created:
    - tests/lib/components/orders/MarketOrder.test.ts (extended — added describe('MarketOrder D-05 inline terminal error (TRADE-03)') with 5 cases; pure-logic + source-content assertions)
  modified:
    - src/lib/services/observability/captureTakeOrderFailure.ts (TakeOrderFailureReason union extended with 3 TRADE-03 variants)
    - src/lib/services/marketOrderExecution.ts (~125 line pre-flight + auto-walk block inserted between firstQuote validity gate and aggregatedParams construction)
    - src/lib/components/orders/MarketOrder.svelte (noLiquidityError reactive + {#if} block as sibling to freshness banner; existing orderPreparationError block suppressed when D-05 fires to avoid duplicate render)
    - tests/lib/services/marketOrderExecution.test.ts (extended — added describe('TRADE-03 pre-flight (Plan 02-06)') with 4 mocked-SDK integration cases)

key-decisions:
  - "noLiquidityError reactive derived from local orderPreparationError, NOT $transactionStore.error — MarketOrder.svelte does not subscribe to transactionStore; the failWith() user-facing copy lands in orderPreparationError via executeMarketOrder()'s return"
  - "Plan 02-06 acceptance criteria verbatim adherence trumped the plan-text scaffolding for transactionStore mocking — chose render-free pure-logic + source-content tests per TESTING.md 'prefer testing pure logic extracted from a component over rendering'"
  - "Suppress generic orderPreparationError block when noLiquidityError is true (`!noLiquidityError` guard) — D-05 block + orderPreparationError box would otherwise both render the same string"
  - "PREFLIGHT_MAX_WALKS=2 hard-coded constant — future tunable. With a single candidate, level-0 total drop fires preflight_order_vanished (NOT auto_retry_exhausted) because (0+1 < 2). auto_retry_exhausted fires only when level-1 also has total drop"
  - "RaindexOrders is a value-import (constructor) — added to the SDK named imports alongside the type imports so `new RaindexOrders()` compiles. Confirmed by reading node_modules/@rainlanguage/orderbook/dist/esm/index.d.ts:4618"
  - "Pre-flight call wrapped in both `withRetry` AND a try/catch — withRetry throws on non-retryable errors; the outer try/catch routes those to failWith('preflight_chain_unreachable') instead of crashing through the trade UI"
  - "preflight_vault_drained NOT added per D-06a — SDK's success=false already considers a drained vault as vanished; a separate variant would be redundant. Comment in the union documents the rationale for future contributors"
  - "Test SDK mock uses 0.4 maxOutput (forcing multi-fill walks for 1-USDC orders) so 2-candidate test scenarios actually exercise both walk levels — with default 10 maxOutput, walkOrderbook used only the first quote and the cascade never engaged"

patterns-established:
  - "Pre-flight wrapper pattern: `let preflightCompleted = false; while (count < MAX) { ... if (all-pass) { preflightCompleted = true; break; } ... } if (!preflightCompleted) failWith(auto_retry_exhausted)` — handles the partial-survivor exit case the inner loop bodies don't naturally cover"
  - "Pitfall 3 (RaindexOrderQuote[][]) mitigated via `result[i]?.[0]?.data?.formattedMaxOutput` chain at every read site — the `[0]` picks the first IO-pair quote inside the inner array"
  - "Test mock pattern for executeMarketOrder pre-flight: vi.mock four interfaces ($lib/services/walletService for getSignerAddress, $lib/clients/raindex for getLoadBalancedClient, $lib/stores/marketTakeStore for the 3 dispatch handlers, $lib/services/observability/captureTakeOrderFailure for the spy). Plus a stub RaindexOrders class via vi.mock '@rainlanguage/orderbook' (the real class needs Wasm bindings)"

requirements-completed: [TRADE-03]

# Metrics
duration: 12min
completed: 2026-04-29
---

# Phase 2 Plan 06: TRADE-03 Pre-flight + Auto-walk + D-05 Inline Error Summary

**Pre-flight multicall via `RaindexClient.getOrderQuotesBatch` wired before take-order dispatch with a 2-level auto-walk cascade for silent retry on staleness, plus a D-05 inline terminal-state error block in MarketOrder.svelte and 3 new failWith() seams that close the Phase 1 D-08 vaultBalance LIMITATION.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T23:00:00Z
- **Completed:** 2026-04-29T23:12:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 source + 2 test, with `tests/lib/components/orders/MarketOrder.test.ts` extended in place)

## Accomplishments

- **Pre-flight on-chain truth read** before every market take-order. The SDK's `getOrderQuotesBatch` runs against the hydrated `RaindexOrder` instances from the walk; on detected staleness (success=false or maxOutput===0), the cascade silently walks to the next-best survivors over up to 2 walk levels. Slippage and pre-flight coexist non-redundantly per D-04.
- **3 new failWith() call sites** route through OBS-03 transcript per D-06: `preflight_chain_unreachable` (RPC/SDK failure), `preflight_order_vanished` (level-0 total drop), `auto_retry_exhausted` (cascade exhausted). failWith() count rises 9 → 16.
- **transcript.onChainStateRead.vaultBalance now populated** from the SDK's `formattedMaxOutput` at index `[0][0]` — populated BEFORE any failure path fires, so even `preflight_order_vanished` transcripts carry the on-chain truth that triggered the drop. Closes the Phase 1 D-08 LIMITATION (`01-CONTEXT.md` deliberately left this null pending TRADE-03).
- **D-05 inline terminal-state error block** in MarketOrder.svelte. Verbatim copy: "No liquidity available right now for this size. Try a smaller amount or check back in a minute." User input is preserved (no form reset, no toast) per D-05.
- **9 new test cases** total: 4 in `tests/lib/services/marketOrderExecution.test.ts` exercising the pre-flight code paths via mocked SDK (RPC failure, full cascade exhaustion, silent-retry-success, vaultBalance population on failure), 5 in `tests/lib/components/orders/MarketOrder.test.ts` validating the D-05 component contract (verbatim copy, reactive declaration + usage, terminal-state styling, predicate isolation).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend TakeOrderFailureReason union with 3 new variants** - `43f77c1` (feat)
2. **Task 2: Wire pre-flight + auto-walk + vaultBalance transcript population** - `f03b28a` (feat)
3. **Task 3: Add D-05 inline error block + new component test** - `6603e29` (feat)

**Plan metadata:** (this commit, after SUMMARY.md + STATE.md + ROADMAP.md updates)

## Files Created/Modified

- `src/lib/services/observability/captureTakeOrderFailure.ts` — Extended `TakeOrderFailureReason` union with 3 new variants (`preflight_chain_unreachable`, `preflight_order_vanished`, `auto_retry_exhausted`). Dispatcher logic unchanged — variants flow through the existing dual-sink path established in Plan 01-07. D-06a documented inline: `preflight_vault_drained` is conceptually subsumed by `preflight_order_vanished`.
- `src/lib/services/marketOrderExecution.ts` — ~125-line pre-flight + auto-walk block inserted between the firstQuote validity gate (line 358) and aggregatedParams construction (line 416 in pre-plan source). New imports: `RaindexOrders` (value-import), type imports `RaindexOrderQuote` + `WasmEncodedResult`, `withRetry` from `$lib/utils/retry`. Module-level constant `PREFLIGHT_MAX_WALKS = 2`. Inline comment near aggregatedParams documents the slippage-vs-pre-flight non-redundancy per D-04.
- `tests/lib/services/marketOrderExecution.test.ts` — Added `describe('TRADE-03 pre-flight (Plan 02-06)')` block with 4 mocked-SDK integration tests. New mocks: `vi.mock('$lib/services/walletService')` for `getSignerAddress`, `vi.mock('$lib/clients/raindex')` for `getLoadBalancedClient`, `vi.mock('$lib/stores/marketTakeStore')` for the 3 dispatch handlers, `vi.mock('$lib/services/observability/captureTakeOrderFailure')` to spy on `captureTakeOrderFailure`, `vi.mock('$lib/stores/transactionShared')` for `transactionStoreInternal`, plus a stub `RaindexOrders` class via `vi.mock('@rainlanguage/orderbook')` (the real class needs Wasm bindings initialized).
- `src/lib/components/orders/MarketOrder.svelte` — Added `$: noLiquidityError = (orderPreparationError ?? '').includes('No liquidity available right now')` reactive after `$: isQuoteStale`. Added `{#if noLiquidityError}` sibling block immediately after the freshness banner (text-red-400 for terminal state). Added `&& !noLiquidityError` guard on the existing generic orderPreparationError block to suppress duplicate render when D-05 fires.
- `tests/lib/components/orders/MarketOrder.test.ts` — Added `describe('MarketOrder D-05 inline terminal error (TRADE-03)')` block with 5 pure-logic + source-content assertions.

## Decisions Made

See key-decisions in frontmatter; expanded notes:

- **D-05 wiring path:** the plan's behavior section says `$: noLiquidityError = $transactionStore.error.includes('No liquidity available right now')`. In reality, MarketOrder.svelte does NOT subscribe to transactionStore — the user-facing error returned by `executeMarketOrder()` is captured into local `orderPreparationError` (line 227), which renders through an existing red-box block (lines 1160-1166). I derived `noLiquidityError` from `orderPreparationError` to match the actual data flow. This satisfies the plan's acceptance criteria (verbatim copy = 1 hit, `noLiquidityError` declaration + usage in `{#if}` block, text-red-400) without introducing a phantom transactionStore subscription that would never fire.
- **D-05 duplicate-render guard:** because the same `orderPreparationError` value drives BOTH the new D-05 block AND the existing generic-error box, both would render the same message. Added `&& !noLiquidityError` to the existing block's `{#if}` so only the D-05 block renders for the canonical "No liquidity available right now..." string.
- **PREFLIGHT_MAX_WALKS edge case:** with a single candidate, level-0 total drop fires `preflight_order_vanished` (NOT `auto_retry_exhausted`) because the condition `preflightWalkCount + 1 < PREFLIGHT_MAX_WALKS` is `0+1 < 2 = true`. `auto_retry_exhausted` fires only when level-1 also has a total drop OR when the partial-survivor branch falls through the loop without ever reaching the all-pass exit. Test cases written to exercise both terminal paths.
- **RaindexOrders value-import:** added the class to the named imports from `@rainlanguage/orderbook` so `new RaindexOrders()` compiles. Confirmed by reading `node_modules/@rainlanguage/orderbook/dist/esm/index.d.ts:4618` (`export class RaindexOrders { constructor(); push(order: RaindexOrder): void; ... }`).
- **Pre-flight error wrapping:** the call `await withRetry(() => preflightClient.getOrderQuotesBatch(...))` is BOTH wrapped in `withRetry` (per CONVENTIONS.md "any new wagmi/viem call that hits a load-balanced RPC should be wrapped with withRetry") AND inside a try/catch that routes thrown errors to `failWith('preflight_chain_unreachable')`. Without the try/catch, a non-retryable thrown error from the SDK would crash through the trade UI; with it, every error-return path is captured by OBS-03.
- **Test SDK mock — maxOutput tuning:** initial test used `maxOutput=10` (asset units), which let walkOrderbook satisfy a 1-USDC order from a single quote → the cascade never engaged with the 2-candidate scenarios. Changed to `maxOutput=0.4` so 2 quotes are needed to fill 1 USDC at price 1, exercising both walk levels.
- **Plan acceptance criterion overspecification on `walkResult`:** the plan example uses `let walkResult` and `walkResult = { ...walkResult, fills: workingFills }`. Project ESLint enforces `prefer-const`. Mutating the property `walkResult.fills = workingFills` directly works on `const walkResult` — same effective behavior, less reassignment ceremony, lint-clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Path conflict: `let walkResult` rejected by `prefer-const`**

- **Found during:** Task 2 (pre-flight + auto-walk wiring)
- **Issue:** Plan-text said `let walkResult = walkOrderbook(...)` then `walkResult = { ...walkResult, fills: workingFills }`. Project ESLint enforces `prefer-const`; since `walkResult` is only ever mutated via `.fills`, the `let` declaration triggered a lint error.
- **Fix:** Reverted to `const walkResult` and changed the post-loop assignment to `walkResult.fills = workingFills` (mutation of property on const-bound object, valid TS + lint-clean).
- **Files modified:** `src/lib/services/marketOrderExecution.ts`
- **Verification:** `npx eslint src/lib/services/marketOrderExecution.ts` returns 0 errors. Test suite all 504 pass.
- **Committed in:** `f03b28a` (Task 2 commit)

**2. [Rule 1 - Bug] Plan-text `$transactionStore.error` reference does not match component's actual data flow**

- **Found during:** Task 3 (D-05 inline error block)
- **Issue:** Plan's `behavior` section + `key_links` say `$: noLiquidityError = $transactionStore.error.includes('No liquidity available right now')`. But `MarketOrder.svelte` does not subscribe to transactionStore — the user-facing error from `executeMarketOrder()` lands in local `orderPreparationError` (line 227 in pre-plan source). Wiring `noLiquidityError` to a non-subscribed transactionStore would be a phantom predicate that never fires.
- **Fix:** Derived `noLiquidityError` from `orderPreparationError` instead. Plan's NOTE explicitly anticipated this: "At execution time, read the existing transactionStore subscription pattern in this file... Match it exactly." The existing pattern is local-state-driven. All acceptance criteria still satisfied (verbatim copy = 1, `noLiquidityError` ≥ 2 references, `{#if noLiquidityError}` block, text-red-400 styling).
- **Files modified:** `src/lib/components/orders/MarketOrder.svelte`
- **Verification:** Reactive predicate fires when `orderPreparationError` contains the D-05 verbatim string; does not fire for unrelated errors. 5 new test cases pin both behaviors.
- **Committed in:** `6603e29` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Duplicate-render guard for orderPreparationError block**

- **Found during:** Task 3 (after wiring noLiquidityError to orderPreparationError)
- **Issue:** Same `orderPreparationError` value drives BOTH the new D-05 block AND the existing generic orderPreparationError box (lines 1160-1166 in pre-plan source). Without a guard, the D-05 string renders twice on every cascade-exhaustion failure — once as the styled D-05 paragraph (gray-bg, no border, just text-red-400), once as the bordered red-bg box.
- **Fix:** Added `&& !noLiquidityError` to the existing block's `{#if}` so only the D-05 block renders for the canonical D-05 string. Other preparation errors still surface through the bordered box.
- **Files modified:** `src/lib/components/orders/MarketOrder.svelte`
- **Verification:** `grep -c 'No liquidity available right now for this size' src/lib/components/orders/MarketOrder.svelte` returns 1 (the verbatim copy lives in only one rendering site).
- **Committed in:** `6603e29` (Task 3 commit)

**4. [Rule 1 - Bug] Test SDK mock initial maxOutput too high — cascade never engaged**

- **Found during:** Task 2 (TRADE-03 test cases)
- **Issue:** Initial test fixture used `Float.parse('10').asHex()` for maxOutput. With 1 USDC spend at price 1, walkOrderbook used a single quote (since one quote could cover the whole order) → workingFills.length === 1, and 2-candidate cascade scenarios never engaged because the SDK mock returned data for indexes 0 and 1 but the loop only read index 0.
- **Fix:** Changed maxOutput to `Float.parse('0.4').asHex()` so 2 quotes are needed to fill 1 USDC, exercising both walk levels in the cascade tests.
- **Files modified:** `tests/lib/services/marketOrderExecution.test.ts`
- **Verification:** All 4 new TRADE-03 test cases pass; the 2-candidate scenarios actually drive the level-0 partial / level-1 total-drop path.
- **Committed in:** `f03b28a` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 Rule 3 - blocking ESLint, 2 Rule 1 - data-flow / fixture bug, 1 Rule 2 - missing duplicate-render guard)
**Impact on plan:** All auto-fixes essential for correctness/lint. No scope creep — every fix landed within `files_modified`. The Rule 1 (transactionStore vs orderPreparationError) deviation is a data-flow correction the plan-text anticipated via its NOTE; the chosen wiring honors the plan's acceptance criteria verbatim.

## Issues Encountered

- **MCP svelte tool unavailable in this agent context.** System reminder mandates use of the Svelte MCP server "whenever svelte development is involved." MCP tools are not exposed to this agent's tool surface (only Read/Write/Edit/Bash). Fell back to Context7 CLI (`npx ctx7 docs /websites/v4_svelte_dev "reactive declaration if block conditional rendering"`) which confirmed the canonical Svelte 4 patterns for `$:` reactive declarations and `{#if expression}` blocks. The component changes are mechanically identical to the existing freshness-banner sibling pattern (lines 1041-1049 in pre-plan source), so canonicality was already encoded by the analog.
- **Component-level rendering tests deferred for D-05.** Per the plan's NOTE in Task 3, rendering MarketOrder.svelte requires TanStack QueryClient + currentNetwork + walletService scaffolding. No analog component-render test exists in the project (`@testing-library/svelte` is installed but `vitest-setup.ts` does NOT provide a default QueryClient context). Used the TESTING.md "prefer testing pure logic extracted from a component over rendering" pattern instead — tests assert (a) verbatim copy in the .svelte source, (b) predicate-logic correctness, (c) terminal-state styling. Plan's `it.skip` last-resort pattern was avoided; 5 active passing tests provide stronger contract enforcement than a single `it.skip` placeholder.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 02-07 (TRADE-04 math symmetry) unblocked.** The pre-flight wiring is upstream of slippage-cap derivation; TRADE-04's mode×side regression matrix can extend without disturbing the cascade structure.
- **Phase 2 phase-exit gates (02-08) on track:** failWith() ≥ 12 (currently 16); transcript.vaultBalance non-null on success path AND failure paths (verified by Task 2 test 4); D-05 inline error UI live with verbatim copy.
- **Future tunable:** `PREFLIGHT_MAX_WALKS=2` is a module-level constant. If observed cascade-exhaustion rate is high in production (Sentry triages on `auto_retry_exhausted` reason tag), the constant can be raised to 3+ without further plan-level changes.
- **Phase 3 REL-01 beneficiary:** the new `getOrderQuotesBatch` call uses the same load-balanced RPC pool as the rest of the codebase. Once REL-01 (RPC retry-with-backoff) lands, the pre-flight automatically inherits exponential-backoff retry without code change.

## Self-Check: PASSED

All claimed files exist:
- src/lib/services/observability/captureTakeOrderFailure.ts (modified)
- src/lib/services/marketOrderExecution.ts (modified)
- src/lib/components/orders/MarketOrder.svelte (modified)
- tests/lib/services/marketOrderExecution.test.ts (modified)
- tests/lib/components/orders/MarketOrder.test.ts (modified)
- .planning/phases/phase-02-trade-execution-backbone-refactor/02-06-SUMMARY.md (this file)

All claimed commits exist on the branch:
- 43f77c1 (Task 1: extend TakeOrderFailureReason union)
- f03b28a (Task 2: pre-flight + auto-walk wiring + tests)
- 6603e29 (Task 3: D-05 inline error block + component tests)

---

*Phase: 02-trade-execution-backbone-refactor*
*Completed: 2026-04-29*
