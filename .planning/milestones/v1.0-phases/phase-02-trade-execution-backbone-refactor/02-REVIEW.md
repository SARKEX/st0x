---
phase: phase-02-trade-execution-backbone-refactor
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - eslint.config.js
  - vite.config.js
  - scripts/codemod-trade-01.ts
  - src/lib/components/QuickTrade.svelte
  - src/lib/components/orders/MarketOrder.svelte
  - src/lib/queries/orderbook.ts
  - src/lib/services/marketOrderExecution.ts
  - src/lib/services/observability/captureTakeOrderFailure.ts
  - src/lib/services/orderDeployment.ts
  - src/lib/stores/approvalStore.ts
  - src/lib/stores/deployTransactionStore.ts
  - src/lib/stores/marketTakeStore.ts
  - src/lib/stores/partialFillDetection.ts
  - src/lib/stores/transaction.ts
  - src/lib/stores/transactionShared.ts
  - src/lib/types/orderPerspective.ts
  - src/lib/utils/tokenMath.ts
  - src/lib/utils/transactionDisplay.ts
  - src/routes/(main)/dashboard/+page.svelte
  - src/routes/(main)/trade/[id]/+page.svelte
  - tests/fixtures/io-perspective-violation.ts
  - tests/lib/components/orders/MarketOrder.test.ts
  - tests/lib/services/marketOrderExecution.test.ts
  - tests/lib/stores/approvalStore.test.ts
  - tests/lib/stores/partialFillDetection.test.ts
  - tests/lib/stores/transactionShared.test.ts
  - tests/lib/types/orderPerspective.test.ts
  - tests/lib/utils/marketOrderFill.test.ts
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

The phase 2 refactor (Trade-Execution Backbone) is structurally sound. The IO-perspective boundary (`orderPerspective.ts`) is correctly applied across the new transaction-store split (`transactionShared` / `deployTransactionStore` / `marketTakeStore` / `approvalStore` / `partialFillDetection`). The ESLint rule + allowlist + violation fixture are correctly wired. The `failWith()` dispatcher in `marketOrderExecution.ts` reaches at least 12 routed sites (count of `failWith(` literal occurrences ≥ 12). Sibling stores do not import each other; the leaf-only invariant holds. The pre-flight cascade tests cover the documented success / `preflight_chain_unreachable` / `preflight_order_vanished` / `auto_retry_exhausted` paths and `priceCap` symmetry is pinned by source-grep.

Issues surfaced:

- One genuine logic concern around `walkResult.inputAmountFilled` going stale after pre-flight filters `walkResult.fills` (WR-01).
- Three quality issues: an unused & misleading `decimals` field in the `EnsureAllowanceParams` interface (WR-02), an unbounded module-level cache that has no eviction other than TTL-on-read (WR-03), and a `setInterval` polling loop that can overlap async ticks (WR-04).
- Five informational items.

No critical / security / data-loss bugs were found.

## Warnings

### WR-01: `walkResult.inputAmountFilled` is not recomputed after the TRADE-03 pre-flight filter

**File:** `src/lib/services/marketOrderExecution.ts:484` (mutation site) and `src/lib/services/marketOrderExecution.ts:531-563` (consumption site)

**Issue:** The pre-flight cascade mutates `walkResult.fills = workingFills` (line 484) when survivors drop, but `walkResult.inputAmountFilled` (and related aggregated totals on `walkResult` such as `outputAmountGiven`) was computed by `walkOrderbook(...)` at line 243 against the ORIGINAL fills set, not against the survivors. Consumers downstream still read `inputAmountFilled` directly from `walkResult` and route it into `aggregatedParams.requestedTakerWantsAmount` (line 563) for spend-mode and Sell flows:

```typescript
const { inputAmountFilled } = walkResult;            // line 531 — unchanged from original walk
…
requestedTakerWantsAmount:
    isBuy && inputMode !== 'spend' ? amount : inputAmountFilled,   // line 563
```

When pre-flight drops candidates, the request will ask for more than the surviving liquidity can supply. The SDK's `*UpTo` modes (line 496-507) tolerate this at submit time — but the value used as the partial-fill anchor in `pollAndFinalizeTakeOrders` is also `params.requestedTakerWantsAmount`, which means a successful trade against survivors-only liquidity may be incorrectly flagged as a partial fill (the user sees a "partial fill" banner because the anchor was inflated).

**Fix:** After mutating `walkResult.fills` to the survivors (line 484), recompute the aggregated totals from `workingFills` so the downstream `inputAmountFilled` / `outputAmountGiven` reflect the post-pre-flight state. For example:

```typescript
walkResult.fills = workingFills;
walkResult.inputAmountFilled = workingFills.reduce(
  (acc, f) => acc + (orderSide === 'Buy' ? f.assetAmount : f.paymentAmount),
  0n
);
walkResult.outputAmountGiven = workingFills.reduce(
  (acc, f) => acc + (orderSide === 'Buy' ? f.paymentAmount : f.assetAmount),
  0n
);
```

(Field names should match the actual `WalkResult` shape from `$lib/api/orders`; verify before applying.)

### WR-02: `EnsureAllowanceParams.token.decimals` is declared but never read; all callers pass `decimals: 0`

**File:** `src/lib/stores/approvalStore.ts:53` (interface), `src/lib/stores/deployTransactionStore.ts:226` and `src/lib/stores/marketTakeStore.ts:309` (callers)

**Issue:** The `token` parameter has `decimals: number` in its declared type but `ensureAllowance` (lines 73-125) never uses it — `approve` calldata is encoded directly from the `amount: bigint` argument. Both production callers pass the placeholder `decimals: 0`, which is misleading: it claims a token has zero decimals when it doesn't. A future contributor may try to use `token.decimals` inside the helper (e.g. for logging / formatting) and silently produce wrong values because every existing caller is passing `0`.

**Fix:** Drop the field from the interface entirely:

```typescript
export interface EnsureAllowanceParams {
    token: { address: Address };
    owner: Address;
    spender: Address;
    amount: bigint;
    network: Network;
    setStatus: (s: TransactionStatus) => void;
}
```

Then remove the `decimals: 0` literal from the two call sites.

### WR-03: `aggregatedTakeCalldataCache` is unbounded and only evicted on TTL hit at read time

**File:** `src/lib/stores/marketTakeStore.ts:233-286`

**Issue:** `aggregatedTakeCalldataCache: Map<string, AggregatedTakeCacheEntry>` is a module-singleton with no size cap. Cache key is `JSON.stringify(takeRequest)` (line 241) — every distinct combination of `(taker, sellToken, buyToken, mode, amount, priceCap, chainId)` produces a new entry. A user dragging a slippage slider or rapidly editing the amount field generates many distinct keys; expired entries are never reclaimed unless the same key is re-fetched (the eviction logic in `fetchAggregatedTakeOrdersCalldata` only checks expiry on read, line 273). The `set` path (line 280-283) overwrites only when a key collides.

This is a small per-page-session memory leak. For typical trade flows it's bounded by user input cardinality, but on a dashboard with continuous polling and form auto-recalculation it accumulates.

**Fix:** Either add a bounded size with LRU eviction, or sweep expired entries periodically:

```typescript
// Sweep on write — bounded O(n) per write but n stays small
function pruneExpired(now: number) {
    for (const [k, v] of aggregatedTakeCalldataCache) {
        if (v.expiresAt <= now) aggregatedTakeCalldataCache.delete(k);
    }
}
…
aggregatedTakeCalldataCache.set(cacheKey, { expiresAt: now + AGGREGATED_TAKE_CACHE_TTL_MS, value: result });
pruneExpired(now);
```

Or cap to e.g. 16 entries with FIFO eviction.

### WR-04: `setInterval` polling in `handleStrategyDeployment` can interleave overlapping async ticks

**File:** `src/lib/stores/deployTransactionStore.ts:293-316`

**Issue:** The poll-for-order-link interval fires every 2_000ms but each tick performs an `async` subgraph call (`tryFetchOrderLink()` → `client.getAddOrdersForTransaction(...)`) that can take longer than the interval. JavaScript's `setInterval` does NOT wait for the previous async callback to complete before scheduling the next tick — so a slow subgraph response can cause overlapping calls. Two overlapping ticks both hitting `clearInterval(interval)` is benign, but the duplicate `transactionSuccess(...)` calls on success are not — they would write the SUCCESS state twice with the same hash but possibly different `raindexLink` resolution windows. The `return` statements inside the interval callback (lines 301, 310) are dead — interval callbacks can't return values to the scheduler — so the early-return suggestion in the code is misleading.

**Fix:** Use a self-rescheduling `setTimeout` chain with an `inflight` guard, or guard the interval body:

```typescript
let inflight = false;
const interval = setInterval(async () => {
    if (inflight) return;        // skip ticks while a prior fetch is outstanding
    inflight = true;
    attempts++;
    try {
        if (attempts >= maxAttempts) {
            clearInterval(interval);
            invalidateOrderQueries();
            invalidateDashboardBalances();
            transactionSuccess(hash, 'Order deployed successfully!', buildMetadata());
            return;
        }
        const link = await tryFetchOrderLink();
        if (link) {
            clearInterval(interval);
            invalidateOrderQueries();
            invalidateDashboardBalances();
            transactionSuccess(hash, undefined, buildMetadata(link));
        }
    } catch (err) {
        console.error('[deployTransactionStore] Error checking for orders:', err);
    } finally {
        inflight = false;
    }
}, 2000);
```

Also drop the misleading `return` keyword on the inner success / max-attempt branches — the value is discarded.

## Info

### IN-01: `getDotrainRegistry` launders `any` through the runtime SDK shape probe

**File:** `src/lib/services/orderDeployment.ts:24-37`

**Issue:** The dynamic-import path uses `any` to walk both `module.DotrainRegistry` and `module.default?.DotrainRegistry` shapes. The cast back to `{ new: (url: string) => Promise<any> }` re-introduces `any` for the constructor return. This is acceptable as a controlled adapter boundary for a WASM SDK whose typings are still settling, but it would be cleaner to define a structural `DotrainRegistryStatic` interface and assert that shape:

```typescript
interface DotrainRegistryStatic {
    new: (url: string) => Promise<DotrainRegistryInstance>;
}
…
return Registry as DotrainRegistryStatic;
```

This eliminates the `any` from the return-type position without changing runtime behavior.

### IN-02: `transactionDisplay.translateMarketOrderForDisplay` returns `assetAddress` typed as accessor return type

**File:** `src/lib/utils/transactionDisplay.ts:51`

**Issue:** `MarketOrderDisplay.assetAddress` is declared `string` (line 18). The accessor `getMakerInputTokenAddress(summary)` returns `T['inputTokenAddress']`, which on `MarketOrderSummary` is `string` — so the assignment type-checks. Functionally fine, but a future widening of `MarketOrderSummary.inputTokenAddress` to `string | undefined` would silently break the return type without a TS error (the accessor is type-transparent). Worth a defensive `?? ''` or making the return type `string | undefined`.

**Fix:** Either tighten:
```typescript
const assetAddress = (direction === 'Buy'
    ? getMakerInputTokenAddress(summary)
    : getMakerOutputTokenAddress(summary)) ?? '';
```
or widen `MarketOrderDisplay.assetAddress: string | undefined`.

### IN-03: Lazy-load skeleton heights match container but not all forms

**File:** `src/routes/(main)/trade/[id]/+page.svelte:1830-1875`

**Issue:** The lazy-load wrapper for `LimitOrder`/`DcaOrder` uses `min-h-[420px]` for both the skeleton placeholder and the rendered form container. The actual `MarketOrder.svelte` form, when fully rendered with the order summary card + slippage input + warnings, can exceed 420px (especially with the `insufficientLiquidityWarning` block expanded). On tab switch from limit/DCA → market, the container height could grow, contributing to CLS. The phase plan's CLS smoke target is `< 0.1`. The 420px estimate is a heuristic — verify the assumption against the actual rendered Market form height.

**Fix:** Either bump `min-h-[460px]` (or whatever empirical max-form-height is) on the outer container, or measure rendered heights in dev-tools and document the reasoning in a comment.

### IN-04: `inputTokenAddress` etc. are still raw-read in `dashboard/+page.svelte:973-974`

**File:** `src/routes/(main)/dashboard/+page.svelte:973-974`

**Issue:** Lines 973-974 (post-codemod) read `quote.inputTokenSymbol` / `quote.outputTokenSymbol` directly. These four `Symbol` fields are NOT covered by the TRADE-01 ESLint rule (the rule only bans `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex`). This is consistent with the plan's scope, but given that `inputTokenSymbol` and `outputTokenSymbol` are also IO-perspective fields, future work may want to extend the ban to symbols too for full boundary coverage.

**Fix:** No action needed for this phase. Consider adding `inputTokenSymbol` / `outputTokenSymbol` to the rule's selector regex in a future phase if symbol-side perspective bugs surface.

### IN-05: `handleRemoveOrder` and `handleWithdrawFromOrder` carry `inputTokenAddress?: string;` etc. on the inline `quote` parameter type

**File:** `src/lib/stores/deployTransactionStore.ts:516-523, 747-754`

**Issue:** Both functions declare an inline parameter type with `inputTokenAddress?: string; outputTokenAddress?: string;`. These property declarations are not banned by the ESLint rule (the rule only catches MemberExpressions). The accessors `getMakerInputTokenAddress(quote)` are then used inside the body. Function works correctly — but two improvements would tighten the contract:

1. Promote the inline type to a named interface in `$lib/types` (e.g. `RemoveOrderArgs`, `WithdrawFromOrderArgs`) so the shape is reusable.
2. The `inputTokenAddress?` / `outputTokenAddress?` fields could be renamed to clarify they are maker-perspective (e.g. `makerInputTokenAddress`) — but this is a breaking change for the 15+ UI callers and is out of scope.

**Fix:** Optional refactor; not a defect.

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
