# Phase 2: Trade-Execution Backbone Refactor — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 16 (NEW + heavily-modified)
**Analogs found:** 16 / 16 (100% — every new file has a closest existing analog OR a documented alternative)

> Consumed by `gsd-planner`. Per-file pattern assignment carries excerpts the planner copies into action sections; "Shared Patterns" applies to multiple plans (TRADE-02 split modules, OBS-03 transcript writers, etc.).

---

## File Classification

| New / Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|--------|------|-----------|----------------|---------------|
| `eslint.config.js` | MOD | lint config (`no-restricted-syntax` selector) | build-time AST | `eslint.config.js` (own existing flat-config blocks) | exact (extending in place) |
| `tests/fixtures/io-perspective-violation.ts` | NEW | lint-rule fixture | static fixture | (no existing fixture-only file) — convention documented | partial (no exact analog) |
| `scripts/codemod-trade-01.ts` | NEW | one-shot codemod harness | AST rewrite | (no existing `scripts/*` content) — ts-morph framework chosen | partial (framework documented in RESEARCH §"Pattern 2") |
| `src/lib/types/orderPerspective.ts` | MOD | shared-helper module (add 4 accessor wrappers) | pure function | own existing helpers (`deriveMakerSide`, `getUserTakerInfo`) | exact (extending in place) |
| `src/lib/stores/transactionShared.ts` | NEW | leaf shared-types module | pure types + `writable()` factory | `src/lib/types/orderPerspective.ts` (leaf module pattern); `src/lib/utils/marketOrderFill.ts` (extracted-helper docstring template) | role-match |
| `src/lib/stores/deployTransactionStore.ts` | NEW | state-machine module (deploy) | request-response (wallet) | `src/lib/stores/transaction.ts` lines 619-708 (current `showRainlangConfirmation` + `handleDcaDeploy` etc.) | exact (lift-and-shift) |
| `src/lib/stores/marketTakeStore.ts` | NEW | state-machine module (take) | request-response (multi-tx orchestration) | `src/lib/stores/transaction.ts` lines 1467-2013 (`preloadAggregatedTakeOrdersCalldata`, `handleAggregatedTakeOrdersCalldata`, `handleOracleOrders`) | exact (lift-and-shift) |
| `src/lib/stores/approvalStore.ts` | NEW | utility (balance + allowance reads + ERC20 approval) | CRUD (read-then-write) | inline approval blocks in `transaction.ts` consumed by both deploy + take paths | role-match |
| `src/lib/stores/partialFillDetection.ts` | NEW | post-confirm detector | event-driven (after tx receipt) | `src/lib/utils/marketOrderFill.ts` (consumes `evaluateMarketOrderFill`) | exact (thin wrapper) |
| `src/lib/stores/transaction.ts` | MOD | re-export façade (shrink to ~30 lines) | barrel | `src/lib/stores/index.ts` (re-export pattern with back-compat note) | exact |
| `src/lib/services/marketOrderExecution.ts` | MOD | orchestrator (insert pre-flight before dispatch) | request-response (multicall) | own lines 320-368 (cascade), `src/lib/services/orderDeployment.ts:188-193` (WasmEncodedResult `.error / .value` consumption pattern) | exact (extending) |
| `src/lib/services/observability/captureTakeOrderFailure.ts` | MOD | dual-sink dispatcher (extend reason union) | event-driven | own existing `TakeOrderFailureReason` union (lines 29-34) | exact (extending in place) |
| `src/lib/components/orders/MarketOrder.svelte` | MOD | component (D-05 inline error block) | UI | own freshness-banner block at lines 1041-1049 ("Price may be outdated") | exact (sibling block) |
| `tests/lib/components/orders/MarketOrder.test.ts` | MOD | component test (extend with D-05 inline-error rendering) | unit | own existing 80+ line file (`calculateRequiredInput` price math) | role-match (existing tests are pure-helper; D-05 needs jsdom render) |
| `tests/lib/utils/marketOrderFill.test.ts` | MOD | parameterized regression matrix (TRADE-04) | unit (table-driven) | own existing 19-test suite (lines 1-77 above for shape) | exact (extending in place) |
| `tests/lib/services/marketOrderExecution.test.ts` | MOD | service test (TRADE-03 + TRADE-04) | unit (mocked SDK) | own existing test cases (per RESEARCH §"TRADE-04 reproduction §bug class 1") | exact (extending) |
| `src/routes/(main)/trade/[id]/+page.svelte` | MOD | page (PERF-01 lazy-load + waterfall reorg) | UI orchestrator | own existing tab block (current eager imports of `LimitOrder` / `DcaOrder` / `MarketOrder` at lines 8, 27-28); RESEARCH §"Pattern §Lazy-load mechanism" | exact (transforming in place) |
| `vite.config.js` | MOD | build config (rollup-plugin-visualizer registration) | build-time plugin | own existing plugin block at lines 8-20 | exact (extending in place) |
| `src/lib/api/orders.ts` | n/a | (NOT modified — see "Note on api/orders.ts" below) | — | — | — |
| `src/lib/services/orderDeployment.ts` | MOD | shared-helper module (return-type fix) | pure function | own existing function `getDcaDeploymentArgs` lines 147-198 | exact |

> **Note on `src/lib/api/orders.ts`:** the upstream prompt mentions this for the "orderDeployment return-type fix that clears 4 svelte-check baseline errors". Per RESEARCH §"Summary §4 svelte-check errors" the actual fix lives in `src/lib/services/orderDeployment.ts` (return-type annotation on `getDcaDeploymentArgs` / `getLimitOrderDeploymentArgs` etc.), not `api/orders.ts`. I have entered the right file in the table above and flag the discrepancy here.

---

## Pattern Assignments

### `eslint.config.js` (MOD — lint config, build-time AST gate)

**Analog:** own existing flat-config structure (lines 1-33).

**Imports + flat-config block pattern** (existing eslint.config.js:1-33):
```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: ts.parser } }
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'src/generated-graphql.ts']
	}
];
```

**Pattern note:** add a NEW config object at the end of the array with `files`, `ignores`, and a `rules['no-restricted-syntax']` entry. Match existing array-element style (each block is its own object, no commas inside the rule arrays). Selector form is documented in RESEARCH §"Pattern 1: ESLint custom rule via inline `no-restricted-syntax` selector".

**Variation flag:** none. Inline selector instead of `eslint-plugin-local/` scaffold per RESEARCH "Don't Hand-Roll" + Decision D-02a (Claude's discretion).

---

### `tests/fixtures/io-perspective-violation.ts` (NEW — lint-rule fixture)

**Analog:** none in repo today (no existing test-fixture-only files; existing tests build fixtures inline via `buildQuote()` etc., per `tests/lib/utils/quote.test.ts` and `tests/lib/services/marketOrderExecution.test.ts`).

**Pattern note:** create a minimal `.ts` file containing 4 raw property reads (one per banned property) on an inline-typed object, with a top-of-file comment documenting that ESLint MUST flag it. The file must NOT be allowlisted in `eslint.config.js` (it is *expected* to fail lint). The Wave 0 verification command in 02-VALIDATION.md (`npm run lint -- tests/fixtures/io-perspective-violation.ts`) consumes this file as the "rule fires" assertion.

**Convention to follow** — fixture file template:
```typescript
/**
 * ESLint fixture for TRADE-01 `no-restricted-syntax` rule.
 *
 * This file intentionally contains 4 banned raw property reads. The rule MUST
 * fire on every `MemberExpression` below. Verified by:
 *   npm run lint -- tests/fixtures/io-perspective-violation.ts
 *
 * DO NOT allowlist this file. It is *expected* to fail lint.
 */
import type { ProcessedQuote } from '$lib/utils/orderbook';

declare const quote: ProcessedQuote;

// All four reads must trigger the rule:
const a = quote.inputTokenAddress; // banned
const b = quote.outputTokenAddress; // banned
const c = quote.inputIOIndex; // banned
const d = quote.outputIOIndex; // banned

export const violations = { a, b, c, d };
```

**Variation flag:** new file convention. The `tests/fixtures/` directory does not yet exist; create it. Avoid placing under `tests/lib/` because that path is globbed by Vitest (`tests/**/*.{test,spec}.{js,ts}` per `vite.config.js:43`) — fixtures are deliberately excluded from the test glob (no `.test.ts` / `.spec.ts` suffix), so `tests/fixtures/` is safe.

---

### `scripts/codemod-trade-01.ts` (NEW — one-shot codemod harness)

**Analog:** no existing committed `scripts/*` file (the repo has `scripts/` listed in STRUCTURE.md as "currently untracked"). Framework choice documented in RESEARCH §"Standard Stack §New additions" (`ts-morph` 28.0.0).

**Pattern note:** stand-alone Node script invoked via `npx tsx scripts/codemod-trade-01.ts`. Must use `import type { Project, SyntaxKind, PropertyAccessExpression } from 'ts-morph'` (devDep). Delete the file after the codemod-PR merges (per Decision D-02 "codemod-first, then flip"); do NOT keep it as a runtime dependency.

**Skeleton from RESEARCH §"Pattern 2"** (lines 286-326):
```typescript
import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

const TARGET_PROPERTIES = new Set([
  'inputTokenAddress', 'outputTokenAddress', 'inputIOIndex', 'outputIOIndex'
]);

const ALLOWLIST = [
  'orderPerspective.ts',
  'utils/orderbook.ts',
  'api/orders.ts'
];

for (const sourceFile of project.getSourceFiles()) {
  if (ALLOWLIST.some(p => sourceFile.getFilePath().includes(p))) continue;

  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const propName = node.getName();
    if (!TARGET_PROPERTIES.has(propName)) continue;
    // Per-pattern transformations:
    //   quote.inputTokenAddress   → getMakerInputTokenAddress(quote)
    //   quote.outputTokenAddress  → getMakerOutputTokenAddress(quote)
    //   quote.inputIOIndex        → getMakerInputIOIndex(quote)
    //   quote.outputIOIndex       → getMakerOutputIOIndex(quote)
  }
}

await project.save();
```

**Variation flag:** `.svelte` files are NOT processed by the script — RESEARCH §"Pattern 2" recommends hand-editing the 6 `.svelte` files (~19 reads total) because building a Svelte preprocessor extraction step costs more than the manual edits.

---

### `src/lib/types/orderPerspective.ts` (MOD — add 4 accessor wrappers)

**Analog:** own existing helpers `deriveMakerSide` (lines 128-143), `makerToTakerTokens` (lines 160-181), `takerToMakerTokens` (lines 191-196). All are pure, JSDoc-typed, single-responsibility functions.

**Existing helper template** (lines 92-114, copy this style for the 4 new accessors):
```typescript
/**
 * Converts user action and tokens to taker order information
 *
 * @param userAction - 'Buy' or 'Sell'
 * @param assetToken - The non-settlement token (e.g., tSTOX)
 * @param paymentToken - The settlement token (e.g., USDC)
 * @returns Complete taker order information
 */
export function getUserTakerInfo(
	userAction: UserAction,
	assetToken: MinimalToken,
	paymentToken: MinimalToken
): TakerOrderInfo {
	if (userAction === 'Buy') {
		return {
			takerWants: assetToken,
			takerPays: paymentToken,
			userAction: 'Buy',
			crossingSide: 'ask',
			crossingDescription: 'Taking asks to buy asset'
		};
	} else {
		// ... mirror branch ...
	}
}
```

**New accessor pattern (from RESEARCH §"Code Examples §Example 1", lines 480-505):**
```typescript
import type { ProcessedQuote } from '$lib/utils/orderbook';

/**
 * Read maker INPUT token address from a ProcessedQuote.
 * Use this instead of direct `.inputTokenAddress` access to keep the IO-perspective
 * boundary structurally enforced by ESLint.
 *
 * The returned address is what the order RECEIVES (on-chain INPUT).
 */
export function getMakerInputTokenAddress(quote: ProcessedQuote): string {
  return quote.inputTokenAddress;
}
// ... same shape for getMakerOutputTokenAddress, getMakerInputIOIndex, getMakerOutputIOIndex.
```

**Pattern note:** match the file's existing tab-indent + JSDoc block + `export function name(...)` shape. The wrapper bodies ARE legal raw reads because the file is allowlisted by the ESLint rule (per RESEARCH §"TRADE-01 §Allowlist target files"). Add `import type { ProcessedQuote } from '$lib/utils/orderbook';` to the imports — currently this file has zero imports (it is leaf-pure on `MinimalToken` types it owns).

**Variation flag:** introduces a new dependency edge `$lib/types/orderPerspective` → `$lib/utils/orderbook`. Verify no cycle: `$lib/utils/orderbook` does NOT import from `$lib/types/orderPerspective` (confirmed in RESEARCH); the new edge is one-way.

---

### `src/lib/stores/transactionShared.ts` (NEW — leaf shared-types module)

**Analog (file-level structure):** `src/lib/types/orderPerspective.ts` (leaf module, no imports from `$lib/services` or `$lib/stores`).
**Analog (extracted-helper rationale):** `src/lib/utils/marketOrderFill.ts` lines 1-6 (the extraction docstring template).

**Header docstring template — copy verbatim shape from `marketOrderFill.ts:1-6`:**
```typescript
/**
 * Shared transaction-store leaf module.
 *
 * Extracted from transaction.ts so deploy-, market-take-, approval-, and
 * partial-fill-detection state machines can share TransactionStatus + interfaces
 * without circular imports, and so the types are easily unit-tested.
 */
```

**Content to lift (from `src/lib/stores/transaction.ts:347-407`):**
```typescript
export enum TransactionStatus {
	IDLE = 'Idle',
	CHECKING_ALLOWANCE = 'Checking your approved spend...',
	PENDING_WALLET = 'Waiting for wallet confirmation...',
	PENDING_APPROVAL = 'Approving spend...',
	PENDING_MULTI_TX_ACKNOWLEDGMENT = 'Multiple transactions required',
	SUCCESS = 'Success! Transaction confirmed',
	ERROR = 'Something went wrong'
}

export interface MarketOrderSummary {
	inputAmount: bigint; // What the user RECEIVES
	inputTokenDecimals: number;
	inputTokenSymbol: string;
	inputTokenAddress: string; // <-- INTERFACE field; ESLint MemberExpression selector won't fire on this
	outputAmount: bigint;
	outputTokenDecimals: number;
	outputTokenSymbol: string;
	outputTokenAddress: string;
	requestedInputAmount: bigint;
	ioRatio: number;
	actualSlippage: bigint;
	isPartialFill: boolean;
	isNoFill?: boolean;
}

export interface AssetTokenInfo { /* ... */ }
export interface MultiTxProgress { /* ... */ }
export interface RaindexLink { /* ... */ }
export interface TransactionMetadata { /* ... */ }
```

**Plus the writable() factory** (pattern from `transaction.ts:398-411`):
```typescript
const initialState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '',
	data: null as TransactionMetadata | null,
	functionName: '',
	message: '',
	multiTxAcknowledged: false,
	onMultiTxAcknowledge: null as (() => void) | null
};

const transactionStore = () => {
	const { subscribe, set, update } = writable(initialState);
	const reset = () => set(initialState);
	// ... setState helper ...
	return { subscribe, reset, set, update, /* ... */ };
};
```

**Pattern note:** this is a LEAF — it imports nothing from `$lib/services` or `$lib/stores`. Allowed imports: `svelte/store`, `viem`, `$lib/types/errors`, `$lib/config/network` (for `Network` type), `$lib/utils/raindexUrl` (for `getRaindexOrderUrl`). Plus the leaf-pure helpers `classifyError` (lines 87-101), `isOrderbookTrusted` (lines 111-114), `validateOrderbookAddress` (lines 120-130), `extractTransactionError` (lines 133-139) — copy as-is.

**Variation flag:** the existing `transaction.ts` has file-scoped imports for `wagmiConfig`, `currentNetwork`, `walletAddress` etc. that the LEAF must NOT pull in. Move those to the per-state-machine modules.

---

### `src/lib/stores/deployTransactionStore.ts` (NEW — deploy state machine)

**Analog:** own existing `transaction.ts` lines 619-708 (`showRainlangConfirmation`, `handleDsfDeploy`, `handleDcaDeploy`, `handleLimitDeploy`).

**Excerpt (current `transaction.ts:619-655`, lift verbatim into deployTransactionStore.ts):**
```typescript
const showRainlangConfirmation = (
	composedRainlang: string,
	deploymentArgs: DeploymentTransactionArgs,
	assetTokenInfo?: AssetTokenInfo
) => {
	const shouldReview = get(reviewStrategyOnDeploy);
	if (shouldReview) {
		rainlangConfirmationModal.set({
			show: true,
			rainlangCode: composedRainlang,
			onDeploy: () => {
				rainlangConfirmationModal.set({
					show: false,
					rainlangCode: '',
					onDeploy: null,
					onCancel: null
				});
				handleStrategyDeployment(deploymentArgs, assetTokenInfo);
			},
			onCancel: () => { /* ... */ reset(); }
		});
	} else {
		handleStrategyDeployment(deploymentArgs, assetTokenInfo);
	}
};
```

**Pattern note:** the state machine reads `transactionStoreInternal` from `transactionShared.ts` via shared module — does NOT define its own writable. The 4 svelte-check errors at lines 664/686/708/2346 all trace to `showRainlangConfirmation(deploymentArgs)` receiving `unknown` from `gui.getDeploymentTransactionArgs`. Per RESEARCH §"Pre-existing 4 svelte-check errors", the fix is to add an explicit return-type annotation on `getDcaDeploymentArgs` etc. in `orderDeployment.ts` — see "Pattern Assignment" for `orderDeployment.ts` below.

**Variation flag:** when `marketOrderExecution.ts` is updated (TRADE-03 wave) it will import `marketTakeStore` directly (NOT via the `transaction.ts` façade) — that severs the remaining circular-import direction (RESEARCH §"Circular import surface enumeration"). Deploy paths stay on the façade because they are not in the cycle.

---

### `src/lib/stores/marketTakeStore.ts` (NEW — market-take state machine; closes circular import)

**Analog:** own existing `transaction.ts` lines 1467-2013 (`preloadAggregatedTakeOrdersCalldata`, `handleAggregatedTakeOrdersCalldata`, `handleOracleOrders`, `pollAndFinalizeTakeOrders`).

**Imports to lift (transaction.ts top-of-file pattern):**
```typescript
import { get } from 'svelte/store';
import { wagmiConfig } from 'svelte-wagmi';
import {
	readContract as wagmiReadContract,
	sendTransaction as wagmiSendTransaction,
	waitForTransactionReceipt
} from '@wagmi/core';
import { withRetry } from '$lib/utils/retry';
import {
	TransactionStatus,
	type MarketOrderSummary,
	type TransactionMetadata,
	transactionStoreInternal
} from './transactionShared';
import { evaluateMarketOrderFill } from '$lib/utils/marketOrderFill';
```

**Critical sequencing constraint** (from RESEARCH §"Pitfall 6: Splitting transaction.ts breaks order-of-write to vault state"): preserve `pollAndFinalizeTakeOrders` as one sequential block — partial-fill detection consumes its result post-completion, NOT interleaved. JSDoc this contract:
```typescript
/**
 * Sequential block — DO NOT split into parallel awaits. Vault-balance
 * invalidation MUST run before partial-fill detection consumes the result,
 * or the partial-fill banner will display stale balances.
 */
const pollAndFinalizeTakeOrders = async (...) => { ... };
```

**Pattern note:** this is the structural fix that severs the remaining circular import. After this PR lands, `marketOrderExecution.ts:31` (`import transactionStore, { TransactionStatus } from '$lib/stores/transaction'`) MUST be rewritten to import `preloadAggregatedTakeOrdersCalldata` directly from `./marketTakeStore` (not via the `transaction.ts` façade). The grep gate from 02-VALIDATION.md `grep -E "from ['\"]\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` MUST return 0 lines.

**Variation flag:** `transaction.ts` does NOT import from `marketOrderExecution.ts` today (already severed in one direction). marketTakeStore.ts MUST preserve that property — it does NOT import `marketOrderExecution.ts`.

---

### `src/lib/stores/approvalStore.ts` (NEW — balance/allowance + ERC20 approval utility)

**Analog:** inline approval logic currently scattered across `transaction.ts` deploy + take paths (one block before each `wagmiSendTransaction` for `approve()`).

**Pattern note:** export a callable utility `ensureAllowance({token, owner, spender, amount, network}): Promise<void>` consumed by both `deployTransactionStore` and `marketTakeStore`. Wrap the `wagmiReadContract` (allowance read) and `wagmiSendTransaction` (approval tx) in `withRetry` per CONVENTIONS.md "Rule: any new wagmi/viem call that hits a load-balanced RPC should be wrapped with `withRetry`". After the approval tx, await `APPROVAL_TX_CONFIRMATIONS = 2` confirmations per CONVENTIONS.md "Confirmations & Transaction Hygiene" — DO NOT change this constant.

**Variation flag:** approval logic IS leaf-utility-shaped (no Svelte store), but the existing pattern in `transaction.ts` interleaves approval with `setState(TransactionStatus.PENDING_APPROVAL)` calls. Approach: the utility takes a `setStatus: (s: TransactionStatus) => void` callback so the caller (deploy or take) drives the UI state — keeps the utility pure on RPC, lets the state-machine modules own the status transitions.

---

### `src/lib/stores/partialFillDetection.ts` (NEW — post-confirm detector)

**Analog:** `src/lib/utils/marketOrderFill.ts` (consumes `evaluateMarketOrderFill`).

**Excerpt of upstream consumer** (`src/lib/utils/marketOrderFill.ts:64-84`):
```typescript
export function evaluateMarketOrderFill(input: MarketOrderFillInput): MarketOrderFillEvaluation {
	const { totalTakerWantsAmount, totalTakerPaysAmount, requestedTakerWantsAmount, requestedTakerPaysAmount } = input;
	const usePaysAnchor =
		requestedTakerPaysAmount !== undefined && requestedTakerPaysAmount > 0n;
	const requested = usePaysAnchor ? requestedTakerPaysAmount as bigint : requestedTakerWantsAmount;
	const actual = usePaysAnchor ? totalTakerPaysAmount : totalTakerWantsAmount;
	const isNoFill = requested <= 0n || actual <= 0n;
	const isPartialFill = !isNoFill && actual * 10_000n < requested * MARKET_ORDER_FULL_FILL_THRESHOLD_BPS;
	return { isNoFill, isPartialFill };
}
```

**Pattern note:** export `detectPartialFill(params): MarketOrderSummary` that wraps `evaluateMarketOrderFill` + assembles the `MarketOrderSummary` shape (currently built inline in `pollAndFinalizeTakeOrders`). Imports nothing from $lib/services or $lib/stores; depends only on `transactionShared` (for the `MarketOrderSummary` interface) and `marketOrderFill` (for the math).

**Variation flag:** none. This is a thin extraction — RESEARCH §"TRADE-02 §Recommended split granularity §Concern boundaries §4. Partial-fill detection (~80 lines)" notes this is currently inside `pollAndFinalizeTakeOrders`.

---

### `src/lib/stores/transaction.ts` (MOD — shrink to ~30 line façade)

**Analog:** `src/lib/stores/index.ts` (re-export pattern).

**Excerpt (existing index.ts re-export with back-compat note)** — match this style for the façade:
```typescript
// Re-export for back-compat. New code should import from the focused module.
export { wrongNetwork } from './authStore';
```

**Façade content (from RESEARCH §"TRADE-02 §Façade preservation", lines 674-685):**
```typescript
// Re-export façade — preserves UI bindings during migration. New code should
// import from the focused module directly (deployTransactionStore, marketTakeStore).
export {
	TransactionStatus,
	type TransactionMetadata,
	type MarketOrderSummary,
	type RaindexLink,
	type MultiTxProgress,
	type AssetTokenInfo
} from './transactionShared';
import { transactionStoreInternal } from './transactionShared';
import * as deploy from './deployTransactionStore';
import * as marketTake from './marketTakeStore';

export default {
	...transactionStoreInternal,
	...deploy,
	...marketTake
};
```

**Pattern note:** this preserves the 15+ existing `import transactionStore from '$lib/stores/transaction'` call sites unchanged. UI components keep working without code changes. The grep gate (`marketOrderExecution.ts` MUST NOT import from `$lib/stores/transaction`) is enforced separately — only that one consumer is rerouted.

---

### `src/lib/services/marketOrderExecution.ts` (MOD — TRADE-03 pre-flight wrapper)

**Analog (cascade structure):** own lines 320-368 (current aggregated → fallback → per-order cascade).
**Analog (WasmEncodedResult `.error / .value` consumption):** `src/lib/services/orderDeployment.ts:188-193`.

**WasmEncodedResult consumption pattern (orderDeployment.ts:188-193):**
```typescript
const composedRainlangResult = await gui.getComposedRainlang();
if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
const composedRainlang = composedRainlangResult.value;

const deploymentArgsResult = await gui.getDeploymentTransactionArgs($walletAddress);
if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
const deploymentArgs = deploymentArgsResult.value;
```

**Pre-flight integration pattern (from RESEARCH §"Pattern 3", expanded for `failWith()` discipline):**
```typescript
// In marketOrderExecution.ts — INSERT after walkResult is computed (between line 329
// "console.warn unhydratedFills" and line 330 "const firstQuote = walkResult.fills[0]").
const client = await getLoadBalancedClient(network);
const targetedOrders: RaindexOrder[] = walkResult.fills
  .map(f => f.quote.raindexOrder)
  .filter((o): o is RaindexOrder => Boolean(o));

if (targetedOrders.length === 0) {
  return failWith(
    'preflight_chain_unreachable',
    new Error('No hydrated orders to pre-flight'),
    'Unable to verify orderbook state. Please refresh quotes and retry.'
  );
}

const ordersWrapper = new RaindexOrders();
for (const o of targetedOrders) ordersWrapper.push(o);
const preflightResult = await client.getOrderQuotesBatch(ordersWrapper, null, null);

if (preflightResult.error || !preflightResult.value) {
  return failWith(
    'preflight_chain_unreachable',
    new Error(preflightResult.error?.readableMsg ?? 'getOrderQuotesBatch returned no value'),
    'Unable to verify orderbook state. Please refresh quotes and retry.'
  );
}

// Populate transcript.onChainStateRead.vaultBalance — this closes the Phase 1 D-08-LIMITATION.
const firstPreflight = preflightResult.value[0]?.[0];
if (firstPreflight?.data) {
  transcript.onChainStateRead.vaultBalance = firstPreflight.data.formattedMaxOutput;
}
```

**OBS-03 transcript-builder pattern** (own existing pattern from `marketOrderExecution.ts:337-342`):
```typescript
transcript.onChainStateRead.orderHash =
  (firstQuote.sgOrder as { orderHash?: string } | undefined)?.orderHash ??
  firstQuote.orderHash ??
  null;
transcript.onChainStateRead.IOIndex.input = firstQuote.inputIOIndex ?? null;
transcript.onChainStateRead.IOIndex.output = firstQuote.outputIOIndex ?? null;
```

**Pattern note:** every `return` from a TRADE-03 failure path MUST go through `failWith()` per Decision D-06 + 02-VALIDATION.md grep gate (`failWith(` count ≥ 12). Three new failure modes: `'preflight_chain_unreachable'`, `'preflight_order_vanished'`, `'auto_retry_exhausted'`. Auto-walk depth is 2 levels deep per RESEARCH §"Auto-walk depth recommendation".

**Pitfall callout (from RESEARCH §"Pitfall 3"):** `getOrderQuotesBatch` returns `RaindexOrderQuote[][]` — array per order, where each inner array is per-IO-pair. Use `result[i]?.[0]?.data?.formattedMaxOutput`, NOT `result[i].data.formattedMaxOutput`.

---

### `src/lib/services/observability/captureTakeOrderFailure.ts` (MOD — extend reason union)

**Analog:** own existing `TakeOrderFailureReason` union at lines 29-34.

**Existing union (lines 29-34):**
```typescript
export type TakeOrderFailureReason =
	| 'no_quotes_available'
	| 'no_walk_fills'
	| 'unhydrated_fills'
	| 'aggregated_failed'
	| 'caught_exception';
```

**Pattern note:** add 3 new variants per RESEARCH §"Recommended File Placement":
```typescript
export type TakeOrderFailureReason =
	| 'no_quotes_available'
	| 'no_walk_fills'
	| 'unhydrated_fills'
	| 'aggregated_failed'
	| 'caught_exception'
	| 'preflight_chain_unreachable'   // NEW (TRADE-03)
	| 'preflight_order_vanished'      // NEW (TRADE-03)
	| 'auto_retry_exhausted';         // NEW (TRADE-03)
```

**Variation flag:** none — this is a pure type-union extension. Sentry tags + console.error JSON shape stays unchanged.

---

### `src/lib/components/orders/MarketOrder.svelte` (MOD — D-05 inline error rendering)

**Analog:** own existing freshness-banner block at lines 1041-1049 ("Price may be outdated").

**Existing freshness-banner pattern (lines 1041-1049):**
```svelte
{#if selectedAmount && selectedAmount > 0n && !isLoadingPrice && !priceError}
	<p class="mt-1 text-xs {isQuoteStale ? 'text-yellow-400' : 'text-gray-500'}">
		{#if isQuoteStale}
			Price may be outdated ({quoteFreshnessSeconds}s ago)
		{:else}
			Updated {quoteFreshnessSeconds}s ago
		{/if}
	</p>
{/if}
```

**Pattern note:** new D-05 inline error block follows the same `{#if condition}<p class="...">message</p>{/if}` shape, BUT colored red (`text-red-400`) and gated on a new local reactive `$: noLiquidityError = $transactionStore.error === 'auto_retry_exhausted_inline'`. Per Decision D-05 the user's input MUST stay intact (no form reset, no toast) — copy: `"No liquidity available right now for this size. Try a smaller amount or check back in a minute."`

**Pattern recipe:**
```svelte
{#if noLiquidityError}
	<p class="mt-2 text-xs text-red-400">
		No liquidity available right now for this size. Try a smaller amount or check back in a minute.
	</p>
{/if}
```

**Variation flag:** the existing freshness banner uses `{isQuoteStale ? 'text-yellow-400' : 'text-gray-500'}` ternary; the D-05 block uses a hard red class because the terminal state is unconditional. Keep both blocks separate (do NOT fold) — the freshness banner measures fetch age (always-running), the D-05 block fires only after the auto-retry chain exhausts.

---

### `tests/lib/components/orders/MarketOrder.test.ts` (MOD — extend with D-05 inline error rendering)

**Analog:** own existing test file (currently tests `calculateRequiredInput` price math via `it.each`, lines 1-80).
**Analog (jsdom render pattern):** TESTING.md §"Component tests" lines 287-289 — "currently tests the price calculation function in isolation rather than rendering the component. This is the standing pattern: prefer testing pure logic extracted from a component over rendering the component when business logic can be lifted."

**Existing test-file shape (lines 1-22):**
```typescript
import { describe, it, expect } from 'vitest';

describe('MarketOrder price calculations', () => {
	const PRECISION = BigInt(1e18);
	function calculateRequiredInput(/* ... */) { /* ... */ }
	describe('SELL scenario: USDC (6 decimals) → Token (18 decimals)', () => {
		it.each([/* ... */])('should calculate $desc', ({ /* ... */ }) => { /* ... */ });
	});
});
```

**Pattern note:** D-05 inline error needs a real component render (not a pure-helper extraction) — break the standing pattern in this one block. Use `@testing-library/svelte` `render()` + `screen.getByText('No liquidity available...')` + setting the mocked transactionStore error to trigger the block. Mock `transactionStore` per TESTING.md §"Mocking §1. Top-level vi.mock() with vi.hoisted()" (existing pattern from `tests/lib/stores/authStore.test.ts`).

**Reference for the mock-store hoisted pattern (TESTING.md:160-178):**
```typescript
const { mockTransactionStore } = await vi.hoisted(async () => {
	const { writable } = await import('svelte/store');
	return {
		mockTransactionStore: writable({ status: 'IDLE', error: '', /* ... */ })
	};
});
vi.mock('$lib/stores/transaction', () => ({ default: mockTransactionStore }));
```

**Variation flag:** ADDS a render-based test alongside existing pure-math tests. Do not delete the existing 80+ lines of `calculateRequiredInput` tests — they cover separate ground.

---

### `tests/lib/utils/marketOrderFill.test.ts` (MOD — TRADE-04 16-case parameterized matrix)

**Analog:** own existing 19-test suite at lines 1-77 above plus the rest of the file.

**Existing parameterized pattern (lines 11-37):**
```typescript
describe('clampSlippageBps', () => {
	it('returns the value when within bounds', () => {
		expect(clampSlippageBps(10)).toBe(10);
		expect(clampSlippageBps(100)).toBe(100);
	});
	// ...
});

describe('computeRatioMultiplier', () => {
	// Regression: prior to this fix, Sell orders ignored slippageBps and used
	// a hardcoded "2" (= 100% tolerance). Both sides must derive the same multiplier.
	it('produces a multiplier identical for Buy and Sell at the same slippage', () => {
		expect(computeRatioMultiplier(10)).toBe(computeRatioMultiplier(10));
	});
	it('returns 1 + slippageBps/10_000 as a decimal string', () => {
		expect(computeRatioMultiplier(10)).toBe('1.001');
		// ...
	});
});
```

**Pattern note:** append a new top-level `describe('TRADE-04 regression matrix — pins 89571b3 bug classes', ...)` block with 16 parameterized cases per RESEARCH §"Code Examples §Example 2" (lines 511-602). Each case is a struct with `description`, `side`, `inputMode`, `slippageBps`, `requestedWantsAmount`, `requestedPaysAmount`, `totalReceivedWants`, `totalReceivedPays`, `expectPartialFill`. Forward to `evaluateMarketOrderFill(...)` and assert `result.isPartialFill === expectPartialFill`.

**Comment requirement (per RESEARCH §"Code Examples §Example 2"):** each case description MUST encode mode×side + which 89571b3 bug class it pins, e.g. `'Sell-by-asset (spend-anchored): full asset sold at worse price MUST NOT flag partial'`. This makes a future regression's failure log self-explanatory.

**Variation flag:** existing tests use `it()` for behaviour assertions and `it.each()` for tabular cases. The new matrix uses a typed `RegressionCase[]` array consumed via `REGRESSION_CASES.forEach((c) => { it(c.description, () => { ... })})` — chosen because the per-case fields are too many for a tuple-based `it.each`.

---

### `tests/lib/services/marketOrderExecution.test.ts` (MOD — TRADE-03 pre-flight + TRADE-04 priceCap symmetry)

**Analog:** own existing test cases (TESTING.md §"Key Test Areas" lists this file under "Order perspective semantics").

**TRADE-03 test pattern (mocked SDK):** mock `getLoadBalancedClient` so `client.getOrderQuotesBatch(...)` returns a controlled `{value: [[{success: false, data: null}]]}` shape; assert `failWith('preflight_order_vanished', ...)` is called via spy. Use TESTING.md §"Mocking §2. vi.mock with importOriginal" pattern to keep the rest of `$lib/clients/raindex` real.

**TRADE-04 priceCap-symmetry test pattern (per RESEARCH §"TRADE-04 §Bug class 1 reproduction"):**
```typescript
it('Sell at slippageBps=10 produces priceCap within 0.1% of worstFill ratio', () => {
	// Pre-89571b3 buggy behavior: Sell hardcoded EMERGENCY_RATIO_MULTIPLIER='2'
	// (~100% tolerance). Fixed behavior: priceCap symmetric across Buy/Sell.
	// ...
});
```

**Pattern note:** transcript-shape assertions for `vaultBalance` populated post-multicall MUST use `expect(transcriptCaptured.onChainStateRead.vaultBalance).toBe(<value>)` — NOT `toBeNull()`. This closes the Phase 1 D-08-LIMITATION.

**Variation flag:** none — this is extending an existing test surface in keeping with TESTING.md "Adding a New Test §3" (per-test overrides via `vi.hoisted`).

---

### `src/routes/(main)/trade/[id]/+page.svelte` (MOD — PERF-01 lazy-load + waterfall reorganization)

**Analog:** own existing eager imports at lines 8 (`LimitOrder`), 27 (`MarketOrder`), 28 (`DcaOrder`).
**Analog (Svelte 4 dynamic-import pattern):** RESEARCH §"PERF-01 §Lazy-load mechanism" lines 841-865 (canonical Svelte 4 `{#await import()}` block).

**Current eager-import shape (lines 7-29):**
```svelte
import LimitOrder from '$lib/components/orders/LimitOrder.svelte';
// ...
import MarketOrder from '$lib/components/orders/MarketOrder.svelte';
import DcaOrder from '$lib/components/orders/DcaOrder.svelte';
```

**Lazy-load transformation pattern (per RESEARCH §"PERF-01 §Lazy-load mechanism"):**
```svelte
{#if activeOrderTab === 'limit'}
  {#await import('$lib/components/orders/LimitOrder.svelte')}
    <div class="min-h-[420px]"><LoadingSpinner /></div>
  {:then Mod}
    <svelte:component this={Mod.default} {assetToken} ... />
  {:catch err}
    <div class="text-red-500">Failed to load Limit order form. Reload the page.</div>
  {/await}
{:else if activeOrderTab === 'dca'}
  {#await import('$lib/components/orders/DcaOrder.svelte')}
    <div class="min-h-[420px]"><LoadingSpinner /></div>
  {:then Mod}
    <svelte:component this={Mod.default} {assetToken} ... />
  {:catch err}
    <div class="text-red-500">Failed to load DCA order form. Reload the page.</div>
  {/await}
{:else}
  <MarketOrder {assetToken} ... />  <!-- default tab; eagerly imported -->
{/if}
```

**Pattern note:** the `min-h-[420px]` skeleton placeholder MUST match the lazy-loaded component's rendered height to prevent CLS regression (RESEARCH §"Pitfall 5"). Measure `LimitOrder.svelte` and `DcaOrder.svelte` heights at the current default screen size and use the larger of the two as the skeleton height. CLS regression is a manual-only verification per 02-VALIDATION.md "Manual-Only Verifications".

**Query-waterfall reorganization (per RESEARCH §"PERF-01 §Query-waterfall reorganization"):** kick off `createUserVaultsQuery` and `walletBalanceQuery` "speculatively" at mount (currently strictly Tier 3, sequentially after `currentToken` resolves) — TanStack `enabled: false` until ready makes this a no-op when not authenticated and a parallelization win when authenticated. Do NOT change `staleTime: Infinity` defaults (CLAUDE.md ground-truth constraint per RESEARCH §"Project Constraints").

**Variation flag:** chart libraries (`TradingViewChart`, `TokenMarketCharts`, `lightweight-charts`) are also lazy-load candidates per Decision D-08 — apply the same `{#await import()}` pattern to those.

---

### `vite.config.js` (MOD — register rollup-plugin-visualizer)

**Analog:** own existing plugin block at lines 8-20.

**Existing plugins block (lines 8-20):**
```javascript
plugins: [
	sentrySvelteKit({
		adapter: 'vercel',
		sourceMapsUploadOptions: {
			org: process.env.SENTRY_ORG,
			project: process.env.SENTRY_PROJECT,
			authToken: process.env.SENTRY_AUTH_TOKEN
		},
		autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN
	}),
	sveltekit(),
	svelteTesting()
],
```

**Pattern note:** add `import { visualizer } from 'rollup-plugin-visualizer';` at top, then push the plugin to the array gated on `process.env.ANALYZE === '1'` (per 02-VALIDATION.md Wave 0 line 94 "register `visualizer()` plugin gated on `process.env.ANALYZE === '1'`").

**Visualizer plugin pattern (RESEARCH §"PERF-01 §Bundle audit tool" lines 818-836):**
```javascript
plugins: [
	sentrySvelteKit({ /* ... */ }),
	sveltekit(),
	svelteTesting(),
	...(process.env.ANALYZE === '1'
		? [visualizer({
				emitFile: true,
				filename: 'stats.html',
				open: false,
				gzipSize: true,
				brotliSize: true,
				template: 'treemap'
			})]
		: [])
],
```

**Variation flag:** existing config uses CommonJS-style `defineConfig(({mode}) => ({...}))` with a function form — preserve this. Plus add `stats.html` to `.gitignore` per 02-VALIDATION.md Wave 0.

---

### `src/lib/services/orderDeployment.ts` (MOD — return-type fix clears 4 svelte-check baseline errors)

**Analog:** own existing `getDcaDeploymentArgs` signature at lines 147-198.

**Existing untyped-return pattern (lines 147-198):**
```typescript
export const getDcaDeploymentArgs = async (network: Network, args: DcaDeploymentArgs) => {
	// ... loads gui, sets fields, etc. ...

	const composedRainlangResult = await gui.getComposedRainlang();
	if (composedRainlangResult.error) throw new Error(composedRainlangResult.error.readableMsg);
	const composedRainlang = composedRainlangResult.value;

	const deploymentArgsResult = await gui.getDeploymentTransactionArgs($walletAddress);
	if (deploymentArgsResult.error) throw new Error(deploymentArgsResult.error.readableMsg);
	const deploymentArgs = deploymentArgsResult.value;

	return {
		composedRainlang,
		deploymentArgs
	};
};
```

**Pattern note:** the issue is that `gui.getDeploymentTransactionArgs(...)` returns `WasmEncodedResult<unknown>`, so `deploymentArgs` (line 193) is structurally `unknown` — and the `return { composedRainlang, deploymentArgs }` infers the property type as `unknown`. The 4 svelte-check errors at `transaction.ts:664/686/708/2346` all trace to passing this `unknown` into `showRainlangConfirmation(deploymentArgs: DeploymentTransactionArgs, ...)`.

**Fix pattern (RESEARCH §"TRADE-02 §Pre-existing 4 svelte-check errors §option (b) recommended"):**
```typescript
export const getDcaDeploymentArgs = async (
	network: Network,
	args: DcaDeploymentArgs
): Promise<{ composedRainlang: string; deploymentArgs: DeploymentTransactionArgs }> => {
	// ... unchanged body ...
	return { composedRainlang, deploymentArgs: deploymentArgs as DeploymentTransactionArgs };
};
```

**Variation flag:** apply the same return-type annotation to ALL 4 deployment-arg getters (`getDcaDeploymentArgs`, `getLimitOrderDeploymentArgs`, plus the two implicit ones at `:311` and `:448` per the grep). This is a one-shot type-tightening and clears all 4 svelte-check errors per the TRADE-02 PR-5 plan.

---

## Shared Patterns

### Logging convention
**Source:** CLAUDE.md project memory + `src/lib/services/walletService.ts` + `src/lib/stores/transaction.ts`
**Apply to:** all new state-machine modules, marketOrderExecution.ts pre-flight wiring, observability dispatcher
**Pattern:** prefix all `console.log` / `console.warn` / `console.error` with module tag in brackets:
```typescript
console.error('[walletService] Dynamic transaction error:', error);
console.warn('[executeMarketOrder] Failed to hydrate order:', e);
```
For new modules, use the module's filename without extension as the tag: `[marketTakeStore]`, `[deployTransactionStore]`, `[approvalStore]`, `[partialFillDetection]`. The `.eslintrc.cjs` legacy fallback flips `no-console: error` when `NODE_ENV=production` or `CI=true` — production console calls fail lint.

---

### `withRetry` wrapping for RPC calls
**Source:** `src/lib/utils/retry.ts` + CONVENTIONS.md "Rule"
**Apply to:** `marketTakeStore`, `approvalStore`, marketOrderExecution.ts pre-flight (the `getOrderQuotesBatch` call)
**Pattern:**
```typescript
import { withRetry } from '$lib/utils/retry';

const result = await withRetry(() => client.getOrderQuotesBatch(ordersWrapper, null, null));
```
Per CONVENTIONS.md "Rule: any new wagmi/viem call that hits a load-balanced RPC should be wrapped with `withRetry`". `withRetry` retries on `'header not found'`, `'block not found'`, or RPC error code `-32000` with exponential backoff `delayMs * 2^attempt`.

---

### `failWith()` discipline (OBS-03 transcript completeness)
**Source:** `src/lib/services/marketOrderExecution.ts` Plan 01-07 seam (pre-existing) + Decision D-06
**Apply to:** every error-return path in `marketOrderExecution.ts` introduced by TRADE-03 wiring
**Pattern:**
```typescript
return failWith(
	'preflight_chain_unreachable',  // <-- TakeOrderFailureReason variant; must exist in the union
	new Error('underlying error message'),  // <-- raw error for transcript.error
	'User-facing copy that becomes the inline-error UI text'  // <-- D-05 inline error
);
```
02-VALIDATION.md grep gate: `grep -E "failWith\\(" src/lib/services/marketOrderExecution.ts | wc -l` MUST be ≥ 12 (Phase 1 baseline 9 + 3 new TRADE-03 paths).

---

### Float-arithmetic precision: `*UpTo` over `*Exact`
**Source:** `src/lib/services/marketOrderExecution.ts:350-365` (load-bearing comment)
**Apply to:** any TRADE-04 math symmetry work in marketOrderExecution.ts or marketOrderFill.ts
**Pattern:** the `*UpTo` modes (`spendUpTo`, `buyUpTo`) tolerate the SDK's internal `0.999...999` vs `1` Float-precision gap; `*Exact` modes do not. **DO NOT change `*UpTo` to `*Exact` or vice versa** during TRADE-04 work. Existing inline comment (lines 350-353):
```typescript
// Use *UpTo modes instead of *Exact to tolerate tiny Float precision gaps
// where the SDK's internal quote discovery computes available liquidity as
// e.g. 0.999...999 instead of exactly 1. *UpTo fills as much as available
// up to the requested amount, avoiding spurious "Insufficient liquidity" errors.
```

---

### Vitest setup-file globals (no per-test re-mocking required)
**Source:** `vitest-setup.ts` + TESTING.md §"Vitest Configuration"
**Apply to:** `tests/lib/components/orders/MarketOrder.test.ts` (D-05 render tests), `tests/lib/services/marketOrderExecution.test.ts` (TRADE-03 SDK mock tests)
**Pattern:** `svelte-wagmi`, `$lib/stores`, `$app/stores` are ALREADY mocked globally in `vitest-setup.ts`. Do NOT re-mock these per-file. For per-test overrides of auth state (e.g. setting `walletAddress` for a specific test), use the `vi.hoisted` pattern from `tests/lib/stores/authStore.test.ts` lines 160-178.

---

### TanStack Query staleTime: Infinity (do not weaken)
**Source:** `src/lib/clients/queryClient.ts` + CLAUDE.md
**Apply to:** PERF-01 query-waterfall reorganization
**Pattern:** the global default is `staleTime: Infinity` (manual invalidation). PERF-01 parallelizes/prefetches but MUST NOT reduce staleTime to enable freshness. Quote from CLAUDE.md (ground-truth section): "TanStack Query default `staleTime: Infinity` (manual invalidation)."

---

### Module imports order (CONVENTIONS.md §"Import Organisation")
**Apply to:** every new state-machine module + marketOrderExecution.ts modifications
**Pattern (1-9 in order):**
1. Svelte / SvelteKit runtime (`svelte`, `svelte/store`, `$app/environment`, `$app/stores`)
2. Third-party packages (`@wagmi/core`, `viem`, `@rainlanguage/orderbook`, `@rainlanguage/float`, `@tanstack/svelte-query`)
3. `$lib/types/...`
4. `$lib/config/...`
5. `$lib/clients/...` and `$lib/api/...`
6. `$lib/services/...`
7. `$lib/stores/...`
8. `$lib/utils/...`
9. Local relative imports (`./`, `../`)

Use `import type { ... }` for type-only imports. Side-effect imports go at top.

---

## No Analog Found

Files where the closest analog is "documented convention but no exact precedent in repo":

| File | Reason | Workaround |
|------|--------|------------|
| `tests/fixtures/io-perspective-violation.ts` | No existing fixture-only file in `tests/`; existing tests build fixtures inline | Convention documented above; new `tests/fixtures/` directory created (NOT under `tests/lib/` to avoid Vitest glob) |
| `scripts/codemod-trade-01.ts` | `scripts/` directory currently untracked; no committed reference | Framework choice (`ts-morph` 28.0.0) documented in RESEARCH §"Standard Stack §New additions"; skeleton documented above |

Both are one-shot artifacts (codemod is delete-after-merge per Decision D-02; fixture is a permanent test-asset). Planner should treat both as new conventions established by Phase 2.

---

## Metadata

**Analog search scope:**
- `src/lib/types/` (orderPerspective.ts — leaf shared types)
- `src/lib/utils/` (marketOrderFill.ts — extracted helpers, retry.ts — withRetry)
- `src/lib/stores/` (transaction.ts — TRADE-02 split origin, index.ts — re-export pattern)
- `src/lib/services/` (marketOrderExecution.ts — orchestration, orderDeployment.ts — WasmEncodedResult pattern, walletService.ts — wagmi+Dynamic adapter, observability/captureTakeOrderFailure.ts)
- `src/lib/components/orders/` (MarketOrder.svelte — D-05 host)
- `src/lib/queries/` (orderbook.ts — TanStack factory pattern)
- `src/lib/api/` (orders.ts — estimateRatioFromFallback)
- `src/routes/(main)/trade/[id]/` (+page.svelte — PERF-01 surface)
- `src/routes/+layout.svelte` (Speed Insights mount)
- `tests/lib/utils/marketOrderFill.test.ts` (regression-test template)
- `tests/lib/components/orders/MarketOrder.test.ts` (component test pattern)
- `tests/lib/services/marketOrderExecution.test.ts` (service test pattern)
- `eslint.config.js` (lint rule extension site)
- `vite.config.js` (visualizer plugin extension site)

**Files Read directly:** 14
**Pattern extraction date:** 2026-04-29

## PATTERN MAPPING COMPLETE

20 files classified, 16 NEW/MOD analogs cited inline + 2 documented-convention entries (no existing analog) + 4 Shared Patterns spanning multiple plans; 100% coverage with concrete code excerpts and line numbers.
