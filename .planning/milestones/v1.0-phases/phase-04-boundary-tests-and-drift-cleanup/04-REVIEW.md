---
phase: 04-boundary-tests-and-drift-cleanup
reviewed: 2026-05-01T00:00:00Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - .github/workflows/test.yml
  - CLAUDE.md
  - eslint.config.js
  - package.json
  - scripts/codemods/migrate-token-find.ts
  - src/lib/api/subgraph.ts
  - src/lib/components/orders/DcaOrder.svelte
  - src/lib/components/orders/LimitOrder.svelte
  - src/lib/queries/oracleQuotes.ts
  - src/lib/queries/priceFeeds.ts
  - src/lib/server/adminWalletList.ts
  - src/lib/server/auditLog.ts
  - src/lib/server/snapshots/scraper.test.ts
  - src/lib/utils/tradeTransform.ts
  - src/routes/(main)/+page.svelte
  - src/routes/(main)/dashboard/+page.svelte
  - src/routes/(main)/trade/[id]/+page.svelte
  - src/routes/admin/+page.svelte
  - src/routes/api/admin/excluded-wallets/+server.ts
  - src/routes/api/admin/nansen/+server.ts
  - src/routes/api/admin/pool-wallets/+server.ts
  - src/routes/api/admin/snapshots/regenerate/+server.ts
  - src/routes/api/admin/snapshots/trigger/+server.ts
  - src/routes/api/admin/team-wallets/+server.ts
  - tests/fixtures/eslint/token-lookup-violation.ts
  - tests/fixtures/marketOrder/aggregated-quote-stale.json
  - tests/fixtures/marketOrder/fallback-no-liquidity.json
  - tests/fixtures/marketOrder/hydration-failure.json
  - tests/fixtures/marketOrder/per-order-partial-fill.json
  - tests/fixtures/marketOrder/slippage-cap-exceeded.json
  - tests/fixtures/marketOrder/stale-session-recovery.json
  - tests/fixtures/marketOrder/wrong-side-classification.json
  - tests/helpers/anvil.ts
  - tests/helpers/loadTranscript.ts
  - tests/hooks/_helpers.ts
  - tests/hooks/admin-gate.test.ts
  - tests/hooks/bot-rejection.test.ts
  - tests/hooks/cors.test.ts
  - tests/hooks/csp.test.ts
  - tests/hooks/public-paths.test.ts
  - tests/hooks/wallet-session.test.ts
  - tests/integration/marketOrder/_replay-helpers.ts
  - tests/integration/marketOrder/anvil-fork.test.ts
  - tests/integration/marketOrder/replay-aggregated-quote-stale.test.ts
  - tests/integration/marketOrder/replay-fallback-no-liquidity.test.ts
  - tests/integration/marketOrder/replay-hydration-failure.test.ts
  - tests/integration/marketOrder/replay-per-order-partial-fill.test.ts
  - tests/integration/marketOrder/replay-slippage-cap-exceeded.test.ts
  - tests/integration/marketOrder/replay-stale-session-recovery.test.ts
  - tests/integration/marketOrder/replay-wrong-side-classification.test.ts
  - tests/lib/admin/codes.audit.test.ts
  - tests/lib/admin/excluded-wallets.audit.test.ts
  - tests/lib/admin/pool-wallets.audit.test.ts
  - tests/lib/admin/referral-programme-migrate.audit.test.ts
  - tests/lib/admin/referral-programme-refresh.audit.test.ts
  - tests/lib/admin/snapshots-regenerate.audit.test.ts
  - tests/lib/admin/snapshots-trigger.audit.test.ts
  - tests/lib/admin/team-wallets.audit.test.ts
  - vite.config.integration.js
  - vite.config.js
findings:
  critical: 0
  warning: 7
  info: 8
  total: 15
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 47
**Status:** issues_found

## Summary

Phase 04 lands the boundary-test scaffolding (hooks, audit fan-out, market-order
replay), the DRIFT-01 codemod + ESLint rule, and refactors of the wallet-list
admin endpoints. The test scaffolding is competent and the ESLint rule is
correctly scoped. However, the limit/DCA order forms contain pre-existing
floating-point precision bugs that became more visible during this refactor,
the wallet-list KV update is not concurrency-safe, and several handlers parse
JSON without validating HTTP `response.ok` first — these regressions ship
through this phase even though some predate it.

No BLOCKER security vulnerabilities. The most material correctness bug is the
`Math.floor(amount * 10**18)` pattern in `LimitOrder.svelte` and `DcaOrder.svelte`,
which silently truncates to ~16 significant digits for any 18-decimal token
purchase.

## Warnings

### WR-01: Precision loss in LimitOrder buy-percentage button (silent under-fill on MAX)

**File:** `src/lib/components/orders/LimitOrder.svelte:201`
**Issue:** `Math.floor(assetAmount * 10 ** assetDecimals)` for `assetDecimals = 18`
multiplies a JS `number` by `1e18`, exceeding `Number.MAX_SAFE_INTEGER` (~9.007e15).
For any non-trivial buy size the result is silently rounded at the float level
before `BigInt()` is applied. Example: 100 USDC budget at $500 limit → `assetAmount = 0.2`,
`0.2 * 1e18 = 2e17` (well past safe-integer range). The "fixes 'not enough funds'
on MAX" comment in source explicitly relies on `Math.floor` precision that
doesn't exist.
**Fix:** Compute in BigInt directly without going through `Number`. Example:
```ts
// settlementToSpend (BigInt, settlementDecimals) ÷ price (string)
import { parseUnits } from 'viem';
const priceScaled = parseUnits(selectedInitialRatio || '0', settlementDecimals);
if (priceScaled === 0n) return;
// assetAmount = settlementToSpend * 10^assetDecimals / priceScaled
const numerator = settlementToSpend * 10n ** BigInt(assetDecimals);
const assetAmountWei = numerator / priceScaled;
tradeAmountInputRef.setAmountValue(assetAmountWei);
```

### WR-02: Same precision-loss pattern in DcaOrder min-trade calculation

**File:** `src/lib/components/orders/DcaOrder.svelte:94`
**Issue:** `BigInt(Math.floor(oneDollarWorth * 10 ** tokenDecimals))` truncates
for 18-decimal asset tokens. For sells priced at e.g. $1, `oneDollarWorth * 1e18 = 1e18`,
right at the edge of safe-integer precision; for any token priced below $1 the
multiplication exceeds safe-integer range and the resulting `minTradeAmount`
mis-validates inputs near the threshold.
**Fix:** Use `parseUnits('1', tokenDecimals) / parseUnits(price, 0)` BigInt
arithmetic, or precompute via fixed-precision math. Same pattern as WR-01.

### WR-03: Race condition in admin wallet-list KV update (read-modify-write)

**File:** `src/lib/server/adminWalletList.ts:93-135`
**Issue:** `walletListPost` reads the wallets array via `kvGet`, mutates it
in JS memory (`push` / `splice`), then writes the whole array back via `kvSet`.
Two concurrent admin requests targeting the same list (e.g. add A and add B)
can race: both read the same baseline, both write, the second write wins,
losing the first add. The existing `includes`/`indexOf` check provides no
atomicity. Audit-log fan-out then logs a "successful" add that is silently
gone.
**Fix:** Use Redis-native set operations (`SADD` / `SREM`) on a Set datatype,
or use a `WATCH`/`MULTI` transaction, or wrap with a per-key advisory lock.
Until then, document the constraint that admin mutations of these lists are
not concurrency-safe.

### WR-04: `nansen/+server.ts` top-level `usdc` may be undefined → runtime crash

**File:** `src/routes/api/admin/nansen/+server.ts:14-16`
**Issue:**
```ts
const paymentTokens = getPaymentTokensForNetwork(8453);
const usdc = paymentTokens[0];
```
`usdc` is captured at module-load time and is `undefined` if the Base network
ever has zero configured payment tokens (config drift, deployment misconfig).
All subsequent `isPaymentToken({ address: ... }, usdc)` calls will dereference
`usdc.address` and throw. The handler's outer try/catch surfaces a generic 500
rather than a clear configuration error.
**Fix:** Guard at module load and either throw a clear error or short-circuit
GET to a 503 with a config-missing message:
```ts
const usdc = paymentTokens[0];
if (!usdc) {
  throw new Error('[Nansen] No payment token configured for chainId 8453');
}
```

### WR-05: `subgraph.ts` callers do not check `response.ok` before `.json()`

**File:** `src/lib/api/subgraph.ts:128-136, 248-255`
**Issue:** Both `getSftById` and `getSfts` call `await response.json()` without
first checking `response.ok` or guarding `json.data`. A 5xx HTML error page
from the subgraph endpoint will throw a JSON-parse error that escapes to the
caller; a successful response with `{errors: [...]}` body will be silently
returned as an empty array because `json.data.offchainAssetReceiptVaults` is
`undefined` and the `?? []` masks the actual GraphQL error. The retry helper
`fetchPageWithRetry` (lines 415-481) handles this correctly — these two
callers don't.
**Fix:** Either route both queries through `fetchAllPaginatedData` /
`fetchPageWithRetry`, or replicate the `if (!response.ok) throw` and
`if (data.errors) throw` checks.

### WR-06: GraphQL injection surface — `vaultAddress.slice(2)` and `tokenId.toLowerCase()` unvalidated

**File:** `src/lib/api/subgraph.ts:29, 540-541`
**Issue:** `getSftById` interpolates `tokenId.toLowerCase()` directly into the
GraphQL query string without validating it is a `0x[a-f0-9]{40}` address.
Similarly `getSftMetadata` does `vaultAddress.slice(2)` and embeds it. A
caller passing a value containing `"` would break out of the GraphQL string
literal and inject arbitrary fields. Whether any caller forwards user-supplied
input here is project-specific, but the helpers are exported and have no
intrinsic guard. The pattern recurs in `getSfts:148` for the TOKENS config —
that path is config-controlled and lower-risk.
**Fix:** Validate inputs before interpolation:
```ts
if (!/^0x[a-fA-F0-9]{40}$/.test(tokenId)) {
  throw new Error('Invalid tokenId — must be 0x-prefixed 40-hex address');
}
```
Apply equivalent validation in `getSftMetadata`.

### WR-07: `tradeTransform.transformApiTradeEntry` may misclassify USDC-only trades as Buy

**File:** `src/lib/utils/tradeTransform.ts:140-152`
**Issue:** `outputIsAsset = !!outputConfig` treats *any* token that
`getTokenByAnyAddress` resolves as an "asset". Per CLAUDE.md / MEMORY, the
ST0x token catalog is asset-only, but `getTokenByAnyAddress` is also reachable
from contexts that mix payment tokens. If the lookup ever resolves USDC (or
any payment token) the side classification flips silently. The simpler shape
in `transformTradeToDisplayOrder` (above, line 48-53) uses `TOKENS.some(...)`
which makes the asset-only constraint explicit.
**Fix:** Mirror the explicit asset filter from `transformTradeToDisplayOrder`,
or add an `isAsset(addr, chainId)` helper that returns true only for entries
in the asset catalog (not payment tokens):
```ts
const outputIsAsset = !!outputConfig && !isPaymentToken({ address: outputAddr }, /*usdc*/);
```

## Info

### IN-01: `auditLog.queryAuditLogs` filter applied post-hoc → may return fewer than `limit` rows

**File:** `src/lib/server/auditLog.ts:179-203`
**Issue:** The query asks Redis for `limit * 2` rows then post-filters in JS.
For a workload where most rows are filtered out (e.g. filtering by a rare
`adminUser`), the caller receives well below `limit` rows and has no way to
page further. Acceptable for small admin dashboards; document the limitation.
**Fix:** Either iterate with growing `count` until `limit` filled or return
`{ rows, hasMore }` to make pagination explicit.

### IN-02: `auditLog.zRemRangeByScore` runs on every log write

**File:** `src/lib/server/auditLog.ts:115-116`
**Issue:** Every `logAuditEvent` call performs a `zRemRangeByScore` for old
entries. Out of scope for v1 perf review, but worth a note: at high audit
volume this multiplies KV cost. Move pruning to a periodic cron, or use Redis
TTL on the sorted-set entries instead of score-based scans.

### IN-03: `pickRandomBlock` excludes `endBlock` from selection range

**File:** `src/routes/api/admin/snapshots/trigger/+server.ts:26-28`
**Issue:** `Math.floor(Math.random() * range) + startBlock` returns values in
`[startBlock, endBlock)`. The half-split caller passes `endBlock` for the
upper half, so the very last block of the day is never chosen. Minor
sampling-bias; document or `range + 1`.

### IN-04: `nansen/+server.ts` 50000-trade safety limit silently drops data

**File:** `src/routes/api/admin/nansen/+server.ts:130-133`
**Issue:** Hitting the 50000-trade cap logs a warning but the response is
returned as if complete. Downstream USDC totals will silently undercount.
**Fix:** Either surface the partial-result flag in the response body
(`{ partial: true, processedTrades: 50000 }`), or raise the cap.

### IN-05: `migrate-token-find.ts` rewrite text not parenthesized

**File:** `scripts/codemods/migrate-token-find.ts:181`
**Issue:** `node.replaceWithText(\`getTokenByAnyAddress(${addrExpr})\`)` —
when `addrExpr` is itself a complex expression text (e.g. ternary or
binary op), the lack of outer parens is fine because `getTokenByAnyAddress(...)`
already brackets the argument. No defect, just easy to break in a future
refactor that drops the call wrapper. Add a comment noting the bracket
dependence.

### IN-06: Replay tests never exercise `success: true` path of the SUT

**File:** `tests/integration/marketOrder/replay-*.test.ts`
**Issue:** All seven scenarios assert `result.success === false`. The SUT
(`executeMarketOrder`) has no positive-path coverage in the replay battery
— a regression that breaks happy-path execution but preserves the failure
classifications would slip through. Acceptable scope-wise (transcripts are
captured failure modes), but worth one happy-path regression test alongside.

### IN-07: `anvil-fork.test.ts` `it.skip` blocks contain placeholder `expect(true).toBe(true)`

**File:** `tests/integration/marketOrder/anvil-fork.test.ts:45, 55, 61`
**Issue:** Three `it.skip` blocks with TODO bodies. Acceptable per the inline
documentation, but the placeholder `expect(true).toBe(true)` provides no
guard — when an operator un-skips them later, the test will pass against
nothing. Replace with `expect.fail('TODO: implement before un-skipping')`
so accidentally enabling without filling in fails loudly.

### IN-08: `LimitOrder.svelte` tracks `tradeSubmittedSuccessfully` on intent, not confirmation

**File:** `src/lib/components/orders/LimitOrder.svelte:289, 339`
**Issue:** `tradeSubmittedSuccessfully = true` is set the moment
`transactionStore.handleLimitDeploy` is dispatched, before any on-chain
confirmation. The `onDestroy` abandonment-tracking logic uses this flag —
so a wallet rejection right after dispatch will still count as a "successful"
trade in analytics. Cosmetic, not load-bearing.

---

_Reviewed: 2026-05-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
