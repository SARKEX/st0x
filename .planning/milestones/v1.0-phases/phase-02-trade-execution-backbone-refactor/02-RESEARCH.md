# Phase 2: Trade-Execution Backbone Refactor — Research

**Researched:** 2026-04-29
**Domain:** trade-execution refactor (side semantics, transaction store, freshness pre-flight, execution math, trade-page perf)
**Confidence:** HIGH on stack/code reality; MEDIUM on PERF-01 (live LCP baseline still needs human dashboard pull); HIGH on TRADE-01..04 mechanics.

---

## Summary

- **The 88-hits / 17-files claim from CONTEXT.md drifted upward.** Re-grep at planning time: **134 raw `inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex` hits across 17 files**; of those, **57 are actual property reads** (the surface the ESLint rule must ban) — the rest are interface declarations, parameter types, or test fixtures that the rule's `MemberExpression` selector won't fire on. `transaction.ts` alone holds 24 of the 57 property reads — TRADE-02 dominates the codemod surface.
- **The `transaction.ts` ↔ `marketOrderExecution.ts` circular import has already been severed in one direction.** `transaction.ts` no longer imports from `marketOrderExecution.ts`; only `marketOrderExecution.ts` still imports `transactionStore` (value) + `TransactionStatus` (enum). The remaining structural fix for TRADE-02 is to invert the dependency: `marketOrderExecution.ts` should be a *callee* that returns enough state for the take-market state machine to drive the existing transaction-store helpers — not a caller that pokes the store directly.
- **Pre-flight multicall is a one-liner with the existing Rain SDK.** `RaindexClient.getOrderQuotesBatch(orders, null, null)` is documented to "batch all order pairs into one multicall request" — returns fresh `maxOutput` (vault liquidity) + `ratio` (current price) + `success` flag per order. No hand-rolled Multicall3 ABI needed. Multicall3 IS deployed on Base 8453 at the canonical `0xcA11bde05977b3631167028862bE2a173976CA11` (already used elsewhere in the codebase via wagmi `readContracts`).
- **The 4 svelte-check errors at transaction.ts:664/686/708/2346 will NOT be auto-cleared by the TRADE-02 split.** All 4 are the same root cause: `gui.getDeploymentTransactionArgs(...)` returns `Result<unknown>` so the value flowing from `orderDeployment.ts` into `showRainlangConfirmation(deploymentArgs: DeploymentTransactionArgs)` is structurally `unknown`. The fix is a one-line `as DeploymentTransactionArgs` cast or an explicit return type annotation in `orderDeployment.ts` — distinct from the split refactor itself. Plan should explicitly address.
- **`@rainlanguage/orderbook` is alpha-pinned.** Currently using `0.0.1-alpha.231`; npm head is `0.0.1-alpha.232`. Do NOT bump during Phase 2 — the SDK's `getOrderQuotesBatch` shape is stable enough at this version; an upstream API churn during the refactor would multiply risk on a real-money page.

**Primary recommendation:** TRADE-01 lands as ESLint flat-config inline custom rule (no plugin scaffold needed) + ts-morph codemod (type-aware, handles cross-`.svelte`/`.ts` semantics) over the 57 property-read sites. TRADE-02 splits transaction.ts into 4 modules + leaf shared-types module; the remaining `marketOrderExecution.ts → transactionStore` direction is fixed by hoisting the 3 called methods (`preloadAggregatedTakeOrdersCalldata`, `handleAggregatedTakeOrdersCalldata`, `handleOracleOrders`) into a new `marketTakeMachine` module that `marketOrderExecution.ts` imports, eliminating the cycle entry point. TRADE-03 wraps `RaindexClient.getOrderQuotesBatch` as the pre-flight; auto-walk depth = "until indexedFills exhaust" (re-uses the existing per-order fallback path's iterator, no new walking code). TRADE-04 extends `tests/lib/utils/marketOrderFill.test.ts` with 16 new mode×side parameterized cases (4 modes × 4 mutation classes from 89571b3). PERF-01 lands LAST (after TRADE-01..04 stabilize the bundle shape) with rollup-plugin-visualizer + Svelte 4 `{#await import()}` for tab-mounted components + a CLS-safe skeleton placeholder.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**TRADE-01 — Side-Semantics Ban Mechanism**

- **D-01:** Use an **ESLint custom rule** as the structural ban mechanism. The rule flags direct property reads of `inputTokenAddress`, `outputTokenAddress`, `inputIOIndex`, `outputIOIndex` outside an allowlist of files (`src/lib/types/orderPerspective.ts` itself, generated subgraph types, and any explicit per-call-site escape via comment marker). Rationale: matches CONCERNS.md fix approach; gives editor-time feedback; enforces an existing pattern. Branded TypeScript types and grep-only CI gate were considered and rejected.

- **D-02:** **Migration sequence: codemod-first, then flip.** Researcher/planner writes a codemod that rewrites the 88 existing direct-access call sites into helper calls from `orderPerspective.ts`. Codemod lands first (one PR, no behavior change); ESLint rule flips on after the codemod merges.

- **D-02a:** **Helper API surface, test coverage, and exact rule-author mechanics are Claude's discretion.**

**TRADE-03 — Freshness Illusion: Silent Pre-flight + Inline Terminal Error**

- **D-03:** Pre-flight is a **silent safety net, not a UX interruption.** Before submitting a market take-order, `marketOrderExecution.ts` issues an on-chain `multicall` against the orderbook for each targeted order, reading: order existence, output vault balance, and current ratio. Multicall result is *not* surfaced to the user as a warning when it diverges — consumed by the execution path itself.

- **D-04:** **On targeted-order-vanished/drained: auto-walk to the next-best on-chain order and submit against that one.** Extends the existing aggregated → fallback → per-order cascade in `marketOrderExecution.ts:328-368`, but informed by fresh on-chain truth from the multicall instead of trusting the (potentially stale) subgraph.

- **D-05:** **Terminal-state UX (auto-retry chain exhausted): inline error on the order form** in `MarketOrder.svelte`. Copy: "No liquidity available right now for this size. Try a smaller amount or check back in a minute."

- **D-06:** **OBS-03 transcript constraint preserved regardless of UI copy.** `failWith()` helper from Plan 01-07 must continue to fire on every error-return path the new pre-flight + auto-retry machinery introduces. Grep gate from 01-08 (`failWith(` count) extends to cover the new failure modes.

- **D-06a:** **Pre-flight implementation details are Claude's discretion.**

**PERF-01 — Trade-Page First-Paint Target & Approach**

- **D-07:** **Target: p75 LCP < 2.5s** on `/trade/[id]/+page.svelte`, measured against the existing Vercel Speed Insights dashboard.

- **D-08:** **Approach: lazy-load + bundle prune. No SSR.** Three-pronged: (1) lazy-load `LimitOrder.svelte` / `DcaOrder.svelte` / chart libs; (2) bundle prune; (3) reduce TanStack Query waterfall.

- **D-08a:** **Specific lazy-load mechanism, bundle audit tool choice, and exact query-waterfall reorganization are Claude's discretion.**

### Claude's Discretion

- **TRADE-02 split granularity** (4 strict vs 5–7 finer modules)
- **Rollout / risk strategy** (parallel implementations vs PR-by-PR atomic vs shadow-mode)
- **Phase-internal sequencing & wave parallelism** (PERF-01 timing)
- **Exact npm dependencies, file placement, naming**

### Deferred Ideas (OUT OF SCOPE)

- TRADE-02 split granularity choice (Claude's discretion)
- Rollout / risk strategy detail (Claude's discretion)
- Phase-internal sequencing & PERF-01 timing (Claude's discretion)
- Pre-flight retry depth (Claude's discretion under D-04)
- Where the multicall lives (client vs new server endpoint — client per CONTEXT)
- `vaultBalance` repopulation in OBS-03 transcript — explicitly Phase 2 / TRADE-03 scope
- SSR for the trade page — explicitly deferred per D-08
- `+error.svelte` user-visible error page — Phase 1 D-12 / 01-UI-SPEC Q3
- External log drain — Vercel Logs only
- DRIFT-03 (CLAUDE.md rewrite) — Phase 4
- TRADE-02-adjacent admin rewrites (admin/+page.svelte) — out-of-scope this milestone
- TEST-03 orchestration-path integration tests — Phase 4
- REL-01..03 — Phase 3
- SEC-01 — Phase 3
- DRIFT-01 / DRIFT-02 token-lookup cleanups — Phase 4

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRADE-01 | INPUT/OUTPUT taker-vs-maker side semantics codified through `orderPerspective.ts`; raw `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex` access banned outside helpers; every boundary has unit-test coverage | §"TRADE-01 ESLint custom rule mechanics" — flat-config inline rule + ts-morph codemod; existing 4 helpers in orderPerspective.ts cover most read patterns but planner needs to add 4 thin accessor wrappers (see "Helper API surface gaps" subsection) |
| TRADE-02 | `transaction.ts` (2373 lines) split into focused state machines for deploy / market-take / approval / partial-fill detection; circular import to `marketOrderExecution.ts` structurally eliminated | §"TRADE-02 transaction.ts split topology" — recommend 5 modules (deploy + market-take + approval + partial-fill + leaf shared-types) plus thin re-export façade; circular import cut by hoisting 3 transactionStore methods into the new market-take module |
| TRADE-03 | Market-order submission performs on-chain pre-flight multicall before submitting take-orders; UI staleness visible to user when subgraph lags chain truth | §"TRADE-03 pre-flight multicall mechanics" — use existing `RaindexClient.getOrderQuotesBatch(orders, null, null)` (already does multicall internally); auto-walk = "drop drained orders from indexedFills, retry up to N=2 walks against best remaining"; vaultBalance populates `transcript.onChainStateRead.vaultBalance` from the SDK return shape |
| TRADE-04 | Market-order execution math provably symmetric across Buy/Sell × spend-anchored/asset-anchored; regression tests for each mode×side | §"TRADE-04 execution math regression test surface" — extend `marketOrderFill.test.ts` (currently 19 tests) with 16 parameterized mode×side cases reproducing 89571b3's two coupled bug classes |
| PERF-01 | Trade-page p75 LCP under 2.5s validated against OBS-05 dashboard | §"PERF-01 baseline + bundle audit" — pre-flight: pull p75 LCP baseline from Vercel Speed Insights (BLOCKING: not yet captured in 01-RUNBOOK; must run before plans land); use rollup-plugin-visualizer; lazy-load tabs via `{#await import()}`; predicted offenders: jspdf/jspdf-autotable (UNUSED — deletable), highlight.js (RainlangConfirmationModal — already loaded only on deploy click), @dynamic-labs/sdk-react-core + react+react-dom (the heavy non-negotiables) |

---

## Project Constraints (from CLAUDE.md)

CLAUDE.md is mostly aspirational drift (DRIFT-03 in Phase 4 fixes). Treat the following sections as ground truth — these are reflected in the actual code:

- **Single chain Base 8453.** No multi-chain code paths. Researcher/planner ignores Arbitrum/Optimism/Ethereum mentions in CLAUDE.md.
- **Two auth paths only:** wagmi direct + Dynamic Labs embedded. NO Rhinestone, NO EIP-7702, NO `account-abstraction/` directory.
- **TanStack Query default `staleTime: Infinity` (manual invalidation).** PERF-01 query-waterfall reorganization MUST respect this — parallelization or prefetching is fine; reducing staleTime is not.
- **`*UpTo` over `*Exact` in float arithmetic** (per `marketOrderExecution.ts:244-247` comment). TRADE-04 must not regress this.
- **`## Order Semantics — INPUT/OUTPUT Perspective (Critical)`** in CLAUDE.md is accurate prose statement of the bug class TRADE-01 is locking down — the pattern is correct; the canonical implementation is `src/lib/types/orderPerspective.ts`. CLAUDE.md and orderPerspective.ts agree.
- **Project conventions to honor:**
  - stores = camelCase, types = PascalCase, constants = SCREAMING_SNAKE_CASE
  - TRADE-02 new modules go under `src/lib/stores/` per current STRUCTURE.md
  - New tests go under `tests/lib/...` mirroring `src/lib/...`
  - Custom error types in `$lib/types/errors.ts`
  - Logging never throws back into caller (project convention from `monitoring.ts` and `auditLog.ts`)
  - JSDoc type annotations don't work in `<script lang="ts">` Svelte blocks — use typed constants or `as` casts (per memory)

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ESLint rule + codemod | Build/lint tooling | — | Static analysis; runs at editor + CI; zero runtime |
| `orderPerspective.ts` accessor wrappers | $lib/types (leaf module) | — | Single source of truth; consumed by every other tier |
| `transaction.ts` split (deploy / market-take / approval / partial-fill / shared-types) | $lib/stores (client-side state) | $lib/services (orchestrators) | Owns wagmi/Dynamic adapter calls; UI subscribes via `subscribe()` contract |
| Pre-flight multicall (TRADE-03) | $lib/services/marketOrderExecution | $lib/clients/raindex (RaindexClient SDK call) | Client-side; extends existing prepare path; no server endpoint per CONTEXT D-06a |
| Inline terminal error UI (TRADE-03 D-05) | $lib/components/orders/MarketOrder.svelte | — | Component-local error rendering; existing inline-error pattern |
| OBS-03 transcript field population (vaultBalance) | $lib/services/marketOrderExecution | $lib/services/observability/captureTakeOrderFailure | Transcript builder is in marketOrderExecution; capture dispatcher is in observability/ |
| Mode×side regression tests (TRADE-04) | tests/lib/utils + tests/lib/services | — | Pure-function test suite; vitest |
| Lazy-load tabs (PERF-01) | $route/(main)/trade/[id]/+page.svelte | $lib/components/orders/* | `{#await import()}` block in the page; tab components are import targets |
| Bundle visualizer (PERF-01) | Vite plugin (build-time) | — | Build-time only; emits HTML report; not in production bundle |
| Query-waterfall reorganization (PERF-01) | $route/(main)/trade/[id]/+page.svelte | $lib/queries/* | Page-level orchestration of TanStack queries |

---

## Standard Stack

### Core (already installed — pinned)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@rainlanguage/orderbook` | 0.0.1-alpha.231 | Orderbook SDK; supplies `RaindexClient.getOrderQuotesBatch(...)` for TRADE-03 pre-flight | Already the orderbook contract surface; alpha-pinned per CONCERNS — DO NOT bump during Phase 2 |
| `@rainlanguage/float` | 0.0.0-alpha.40 | Float arithmetic for ratios | Already used; preserve `*UpTo` precision conventions |
| `@wagmi/core` | 2.22.1 | `readContracts` (which uses Multicall3 internally) | Already used in `dashboard/+page.svelte` and `LowFundsBanner.svelte`; not needed for TRADE-03 if SDK path used |
| `@sentry/sveltekit` | ^10.50.0 | Sentry sink for OBS-03 transcripts | Already wired by Plan 01-04; new failure paths route through existing `failWith` |
| `vitest` + `@testing-library/svelte` | as in package.json | Test runner | Already conventional |

### New additions (TRADE-01 + PERF-01)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ts-morph` | 28.0.0 (`devDependency`) | TRADE-01 codemod that rewrites the 57 property-read sites | One-shot codemod run; not committed as a runtime dep. **VERIFIED:** `npm view ts-morph version` → 28.0.0 (current). **Why ts-morph over jscodeshift:** type-aware (knows `.inputTokenAddress` is on a `ProcessedQuote` not a stray `.inputTokenAddress` on an unrelated type); handles `.ts` and `.svelte` `<script lang="ts">` blocks via the same Project API; can resolve symbols across the whole import graph. jscodeshift requires `jscodeshift-adapters` for Svelte and is structural-only (no symbol resolution) — would mis-trigger or miss type-bound sites. |
| `rollup-plugin-visualizer` | 7.0.1 (`devDependency`) | PERF-01 bundle audit | Added once to `vite.config.ts`; emits `stats.html` after `npm run build`. **VERIFIED:** `npm view rollup-plugin-visualizer version` → 7.0.1. **Why over `vite-bundle-visualizer`:** `vite-bundle-visualizer` is a CLI wrapper around `rollup-plugin-visualizer`; not maintained for 12+ months per npm. Direct integration via `visualizer({ emitFile: true, filename: 'stats.html' })` plugin in `vite.config.ts` is the canonical SvelteKit-supported pattern. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ESLint inline custom rule (`no-restricted-syntax` selector) | `eslint-plugin-local/` package scaffold | Selector form is one config block; plugin form requires creating a new directory + `package.json` + index. For a single rule, plugin scaffolding is over-engineering. **Recommend selector form** — see TRADE-01 mechanics below. |
| `@typescript-eslint/utils` rule template | Inline `no-restricted-syntax` selector | utils template gives type-aware rules; not needed for a structural property-name ban. **Recommend selector form**; if a future rule needs type info (e.g. "ban `TOKENS.find` outside config/" for DRIFT-01), use the utils template then. |
| Hand-rolled Multicall3 ABI for TRADE-03 | `RaindexClient.getOrderQuotesBatch` (SDK already does multicall) | Hand-rolling forces the planner to also handle: order existence (re-implementing what SDK does), vault balance read (SDK exposes `maxOutput` directly), block-pinning consistency. SDK path uses one already-stable call. **Recommend SDK path.** |
| jscodeshift for the codemod | ts-morph | jscodeshift is structural; ts-morph is type-aware. The 57 property-read surface includes patterns like `quote.inputTokenAddress` where `quote` could be `ProcessedQuote`, `RaindexOrderQuote`, or an inline type — ts-morph resolves these reliably; jscodeshift would either over-match or need per-pattern hand-coding. **Recommend ts-morph.** |
| `vite-bundle-analyzer` (alt) | `rollup-plugin-visualizer` | vite-bundle-analyzer is newer but has fewer SvelteKit deployment recipes; rollup-plugin-visualizer is what most SvelteKit-on-Vercel posts use. **Recommend rollup-plugin-visualizer.** |
| Migrate the inline `<svelte:component this={Comp.default}>` pattern to Svelte 5 async components | Stay on Svelte 4 `{#await import('./X.svelte') then Comp}` + `<svelte:component this={Comp.default}>` | Svelte 5 has cleaner async support but requires a runtime upgrade — out of scope. **Stay on Svelte 4 pattern.** |

**Installation:**

```bash
# TRADE-01 codemod (devDependency — one-shot use)
npm install --save-dev ts-morph

# PERF-01 bundle audit (devDependency)
npm install --save-dev rollup-plugin-visualizer
```

---

## Architecture Patterns

### Recommended File Placement

```
src/
├── lib/
│   ├── stores/
│   │   ├── transaction.ts                  # SHRINK to ~100-line façade re-export
│   │   ├── deployTransactionStore.ts       # NEW (TRADE-02): handleStrategyDeployment, handleDsfDeploy, handleDcaDeploy, handleLimitDeploy, handleFolioDeploy, handleRemoveOrder, handleWithdraw, handleWithdrawFromOrder, handleWrapUnwrap
│   │   ├── marketTakeStore.ts              # NEW (TRADE-02): preloadAggregatedTakeOrdersCalldata, handleAggregatedTakeOrdersCalldata, handleTakeOrders, handleOracleOrders, pollAndFinalizeTakeOrders
│   │   ├── approvalStore.ts                # NEW (TRADE-02): balance/allowance reads with retry + ERC20 approval txs
│   │   ├── partialFillDetection.ts         # NEW (TRADE-02): consumes evaluateMarketOrderFill from marketOrderFill.ts; returns MarketOrderSummary
│   │   └── transactionShared.ts            # NEW (TRADE-02): TransactionStatus enum, shared interfaces (TransactionMetadata, MarketOrderSummary, RaindexLink, MultiTxProgress, AssetTokenInfo), classifyError, validateOrderbookAddress
│   ├── services/
│   │   ├── marketOrderExecution.ts         # MOD (TRADE-03): import getOrderQuotesBatch path; insert pre-flight before dispatchTakeOrders; populate transcript.onChainStateRead.vaultBalance
│   │   └── observability/
│   │       └── captureTakeOrderFailure.ts  # MOD: extend TakeOrderFailureReason union with preflight_order_vanished, preflight_vault_drained, preflight_chain_unreachable, auto_retry_exhausted
│   └── types/
│       └── orderPerspective.ts             # MOD (TRADE-01): add 4 thin accessor wrappers (see "Helper API surface gaps")
├── eslint-rules/
│   └── no-raw-io-perspective-access.js     # NEW (TRADE-01): inline custom rule (alternative: keep as no-restricted-syntax selector entry in eslint.config.js)
└── vite.config.ts                          # MOD (PERF-01): add rollup-plugin-visualizer
```

**Why façade over hard-cut:** `transactionStore` is imported by 15+ components via `import transactionStore from '$lib/stores/transaction'`. Flipping all imports atomically is high risk on a real-money page. Keep `transaction.ts` as a 1-line re-export façade so existing UI bindings continue to work; new code imports from the focused module directly.

### System Architecture Diagram

```
                                ┌──────────────────────┐
                                │  MarketOrder.svelte  │  ← user clicks Buy/Sell
                                │  QuickTrade.svelte   │
                                └──────────┬───────────┘
                                           │ executeMarketOrder(input)
                                           ▼
                                ┌──────────────────────────┐
                                │ marketOrderExecution.ts  │
                                │  ─ build transcript      │
                                │  ─ excludeTakerOwned     │
                                │  ─ walkOrderbook (local) │
                                └──────────┬───────────────┘
                                           │ NEW (TRADE-03):
                                           │ pre-flight before dispatch
                                           ▼
                ┌──────────────────────────────────────────┐
                │  preflight via getOrderQuotesBatch(...)  │  ← single multicall
                │  returns: maxOutput, ratio, success      │     (RaindexClient SDK)
                └─────────────────┬────────────────────────┘
                                  │ if any order vanished/drained:
                                  │   drop & retry against next-best in walkResult.fills
                                  │ else: pass through
                                  ▼
                                ┌────────────────────────────────────────┐
                                │  populate transcript.onChainStateRead  │
                                │  .vaultBalance from preflight result   │
                                │  (closes Phase 1 D-08 limitation)      │
                                └──────────────┬─────────────────────────┘
                                               │ on terminal failure: failWith('auto_retry_exhausted', ...)
                                               │ on success: dispatch
                                               ▼
                                ┌──────────────────────────────────┐
                                │  marketTakeStore (NEW, TRADE-02) │ ← extracted from transaction.ts
                                │  preloadAggregatedTakeOrdersCalldata
                                │  handleAggregatedTakeOrdersCalldata
                                │  handleOracleOrders
                                └──────────┬───────────────────────┘
                                           │ writes status →
                                           ▼
                                ┌─────────────────────────────────┐
                                │  transactionShared.ts           │
                                │  TransactionStatus enum         │ ← single source of truth, leaf module
                                └─────────┬───────────────────────┘
                                          │ subscribed by
                                          ▼
                              ┌────────────────────────────┐
                              │  TransactionModal.svelte   │ ← UI binding preserved
                              └────────────────────────────┘
```

[CITED: Architecture diagram derived from current `marketOrderExecution.ts` flow + CONTEXT D-04 auto-walk + CONTEXT D-06 OBS-03 preservation]

### Pattern 1: ESLint custom rule via inline `no-restricted-syntax` selector

```js
// eslint.config.js (modified)
export default [
  // ... existing config ...
  {
    files: ['src/**/*.ts', 'src/**/*.svelte', 'tests/**/*.ts'],
    ignores: [
      'src/lib/types/orderPerspective.ts',           // canonical helper itself
      'src/lib/utils/orderbook.ts',                  // ProcessedQuote interface declaration
      'src/lib/api/orders.ts',                       // convertApiOrderToProcessedQuote — populates the fields
      'src/generated-graphql.ts'                     // codegen output (pre-existing ignore)
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name=/^(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)$/]",
          message: "Direct access to inputTokenAddress / outputTokenAddress / inputIOIndex / outputIOIndex is banned. Use helpers from $lib/types/orderPerspective.ts (deriveMakerSide, getUserTakerInfo, makerToTakerTokens, takerToMakerTokens, or one of the new accessor wrappers). To bypass for a specific call site, prefix with: // eslint-disable-next-line no-restricted-syntax -- justification: ..."
        }
      ]
    }
  }
];
```

**Why this form:** ESLint flat-config supports `no-restricted-syntax` with AST selectors out-of-the-box; no plugin scaffolding. The selector matches the property-name on a `MemberExpression` (i.e., `quote.inputTokenAddress` reads). It does NOT match `inputTokenAddress: string;` interface field declarations — which is correct behavior; the rule bans READS, not the canonical type's field name.

[CITED: https://eslint.org/docs/latest/rules/no-restricted-syntax — official docs; AST selector pattern verified.]

**Per-call-site escape:** `// eslint-disable-next-line no-restricted-syntax -- ...` with justification. Phase-exit grep gate counts disable-next-line uses; >3 = code-review trigger.

### Pattern 2: ts-morph codemod for the 57 property-read sites

```typescript
// scripts/codemod-trade-01.ts (one-shot — delete after merge)
import { Project, SyntaxKind, PropertyAccessExpression } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

// Add Svelte <script lang="ts"> blocks via the Svelte preprocessor extraction
// (ts-morph natively understands .ts only; for .svelte, run a pre-step that
// extracts the script block to a temp .ts file, codemods, then re-injects.
// Alternative: manual sweep — only 6 .svelte files have property reads
// (MarketOrder, QuickTrade, OrdersTable, TokenSwapModal, +page.svelte for
// dashboard + trade) — small enough to hand-edit.)

const TARGET_PROPERTIES = new Set([
  'inputTokenAddress', 'outputTokenAddress', 'inputIOIndex', 'outputIOIndex'
]);

for (const sourceFile of project.getSourceFiles()) {
  if (sourceFile.getFilePath().includes('orderPerspective.ts')) continue;
  if (sourceFile.getFilePath().includes('utils/orderbook.ts')) continue;
  if (sourceFile.getFilePath().includes('api/orders.ts')) continue;

  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const propName = node.getName();
    if (!TARGET_PROPERTIES.has(propName)) continue;
    // Replace with helper call — exact replacement depends on context;
    // the codemod logs each match for human review and applies the rewrite
    // when the receiver is a recognized type (ProcessedQuote, sgOrder).
    // Per-pattern transformations:
    //   quote.inputTokenAddress   → getMakerInputTokenAddress(quote)
    //   quote.outputTokenAddress  → getMakerOutputTokenAddress(quote)
    //   quote.inputIOIndex        → getMakerInputIOIndex(quote)
    //   quote.outputIOIndex       → getMakerOutputIOIndex(quote)
  }
}

await project.save();
```

[CITED: https://github.com/dsherret/ts-morph — official ts-morph repo; Project API + getDescendantsOfKind verified.]

**Svelte component handling:** ts-morph does not natively read `.svelte` files. Two options: (a) extend the codemod with a `<script lang="ts">` block extraction step using `svelte/compiler`'s preprocess; (b) hand-edit the 6 `.svelte` files (only 11 total property-read sites in `.svelte` files: MarketOrder=6, QuickTrade=4, +page.svelte=8, OrdersTable=5 declarations-only-no-reads). **Recommend hand-edit** — fewer than the codemod-setup cost.

### Pattern 3: Pre-flight via `RaindexClient.getOrderQuotesBatch`

```typescript
// In marketOrderExecution.ts after walkResult is computed but before dispatch:
const client = await getLoadBalancedClient(network);

// Build RaindexOrders from the targeted set (already-hydrated firstQuote etc.)
const targetedOrders: RaindexOrder[] = walkResult.fills
  .map(f => f.quote.raindexOrder)
  .filter((o): o is RaindexOrder => Boolean(o));

if (targetedOrders.length === 0) {
  return failWith('preflight_chain_unreachable', new Error('No hydrated orders to pre-flight'), 'Unable to verify orderbook state. Please refresh quotes and retry.');
}

// SDK does the multicall internally (per official JSDoc:
// "This function batches all order pairs into one multicall request, which is
//  significantly more efficient than calling getQuotes on each order individually")
const ordersWrapper = new RaindexOrders();
for (const o of targetedOrders) ordersWrapper.push(o);
const preflightResult = await client.getOrderQuotesBatch(ordersWrapper, null, null);

if (preflightResult.error || !preflightResult.value) {
  return failWith('preflight_chain_unreachable', new Error(preflightResult.error?.readableMsg ?? 'getOrderQuotesBatch returned no value'), 'Unable to verify orderbook state. Please refresh quotes and retry.');
}

// Per-order: if !success or maxOutput is 0 / much smaller than walkResult expectation,
// drop from indexedFills and retry the walk against survivors. Populate transcript:
const firstPreflight = preflightResult.value[0]?.[0];
if (firstPreflight?.data) {
  transcript.onChainStateRead.vaultBalance = firstPreflight.data.formattedMaxOutput;
  // ratio is also available — useful for future drift detection
}
```

[CITED: node_modules/@rainlanguage/orderbook/dist/esm/index.d.ts — `getOrderQuotesBatch` JSDoc + return shape verified locally; `RaindexOrderQuoteValue` exposes `formattedMaxOutput` and `formattedRatio` strings.]

**Auto-walk depth:** 2 levels deep — the existing aggregated→fallback→per-order cascade IS the first walk; pre-flight runs ONCE on the candidate set; if survivors < required-to-fill, walk a second time with the survivors-only quote list. After 2 walks: emit `failWith('auto_retry_exhausted', ...)` and surface inline error in MarketOrder.svelte. This bounds RPC cost (1 multicall per walk = max 2 RPC round trips per take attempt) while still tolerating one staleness layer.

### Anti-Patterns to Avoid

- **Hand-rolling Multicall3 ABI in src/lib/services/marketOrderExecution.ts.** SDK already exposes the right primitive (`getOrderQuotesBatch`) — using raw `0xcA11bde0...` calldata duplicates that work and ages worse than the SDK.
- **Removing `*UpTo` modes in favor of `*Exact`.** The 0.999...999 vs 1 Float precision tolerance is load-bearing per `marketOrderExecution.ts:244-247`. TRADE-04's symmetry tests pin this.
- **Branded TypeScript types on `inputTokenAddress` etc.** Requires migrating every consumer at once; rejected during discuss-phase per CONTEXT D-01.
- **Reducing TanStack Query `staleTime: Infinity` to enable freshness.** Manual-invalidation pattern is intentional per CLAUDE.md; PERF-01 query-waterfall reorganization parallelizes/prefetches but does NOT change cache-staleness semantics.
- **Adding SSR to the trade page during Phase 2.** Explicitly forbidden per CONTEXT D-08. Revisit only if lazy-load + bundle prune fails 2.5s.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multicall against the orderbook | Custom Multicall3 ABI calldata + viem `multicall` | `RaindexClient.getOrderQuotesBatch(orders, null, null)` | SDK does this in one call; preserves block-pinning + chunkSize semantics; SDK upgrades stay safe |
| Order-vanished detection | Subscribe to `OrderRemove` events from subgraph | `getOrderQuotesBatch` `success` flag + `maxOutput === 0` | Subgraph events are exactly the staleness layer we're working around |
| Vault-balance read at submission | `eth_call` on `IOrderbook.vaultBalance(owner, token, vaultId)` | `RaindexOrderQuote.data.formattedMaxOutput` from `getOrderQuotesBatch` | Same value; one fewer call; same multicall as the ratio read |
| ESLint plugin scaffolding | `eslint-plugin-local/` directory + `package.json` + `index.js` | Inline `no-restricted-syntax` selector in `eslint.config.js` | Single rule, single config block; no inter-rule shared state |
| AST traversal for codemod | Hand-rolled regex over `.ts`/`.svelte` | `ts-morph` `getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)` | Type-aware, scope-aware, handles assignment-vs-read distinction, comments, JSX/Svelte preserve |
| Bundle visualization | Custom rollup output parser | `rollup-plugin-visualizer` | Maintained, supports gzip/brotli sizes, treemap + sunburst |
| Lazy-load wrapper component | Custom `<LazyLoad>` wrapper | Svelte 4 native `{#await import(...)}` + `<svelte:component this={M.default} />` | Native; zero extra dep; supported in Svelte 4 + 5 |

**Key insight:** TRADE-03's "freshness illusion" fix is a 30-line wrapper around an existing SDK call. The risk is in the auto-walk integration with the existing aggregated→fallback→per-order cascade, NOT in the multicall ABI itself.

---

## Runtime State Inventory

This is a code-and-config refactor, not a rename or data migration. There is no stored data or live-service config that contains string identifiers tied to TRADE-01..04 names.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 2 does not rename any data-layer keys, vault names, or chain identifiers. | None |
| Live service config | Vercel env vars stay unchanged (no new envs added by this phase; PERF-01 lazy-load is purely build-time, no runtime config). | None |
| OS-registered state | None — solo team, no OS-level registrations. | None |
| Secrets/env vars | None added or renamed by this phase. (CONCERNS SEC-01 hardcoded Alchemy key remains — Phase 3 territory.) | None |
| Build artifacts | The `rollup-plugin-visualizer` output `stats.html` should be `.gitignore`d if not already (it's a build artifact, ~1MB, not meant to be committed). | Add `stats.html` to `.gitignore` in PERF-01 plan |

**Nothing found in category** for stored data, live service config, OS-registered state, secrets — verified by reading CONTEXT.md, PROJECT.md, REQUIREMENTS.md, and grepping the codebase for env var additions.

---

## Common Pitfalls

### Pitfall 1: Codemod over-matching on test fixtures
**What goes wrong:** `tests/lib/utils/quote.test.ts` and `tests/lib/utils/marketPrice.test.ts` declare ProcessedQuote-shaped fixtures inline (e.g. `{ inputTokenAddress: '0x...', ... }`). The codemod sees `.inputTokenAddress` reads on `quote.inputTokenAddress` AND object-literal property KEYS (which are not reads).
**Why it happens:** SyntaxKind.PropertyAccessExpression matches reads; SyntaxKind.PropertyAssignment matches keys. Easy to confuse during codemod authoring.
**How to avoid:** ts-morph's `node.getKind() === SyntaxKind.PropertyAccessExpression` filters reads only. PropertyAssignment (`inputTokenAddress: '0x...'` in an object literal) is a different kind. Test the codemod on tests/lib/utils/quote.test.ts BEFORE running across `src/`.
**Warning signs:** After codemod run, `npm test` fails with "Cannot read property of undefined" — means the codemod corrupted a fixture.

### Pitfall 2: ESLint rule fires on ProcessedQuote interface declaration
**What goes wrong:** `src/lib/utils/orderbook.ts` lines 79-82 declare the canonical interface fields `inputTokenAddress: string; outputTokenAddress: string; inputIOIndex: number; outputIOIndex: number;`. If the rule selector includes `Identifier[name=...]`, it fires on these.
**Why it happens:** ESLint AST selector specificity.
**How to avoid:** Use `MemberExpression[property.name=...]` (the form recommended above). Member-expression is `obj.prop`, not `prop:` in an interface or object literal. **Confirmed against ESLint docs.**
**Warning signs:** Run `npm run lint` after rule add — `src/lib/utils/orderbook.ts` should be 0 errors. If it errors on lines 79-82, the selector is wrong.

### Pitfall 3: SDK `getOrderQuotesBatch` is async + returns positionally aligned arrays
**What goes wrong:** Pre-flight returns `RaindexOrderQuote[][]` (array per order, where each inner array is per-IO-pair quotes). Naive code that does `result[orderIdx]` instead of `result[orderIdx][0]` reads an array, not a quote.
**Why it happens:** A single order can have multiple IO pairs (different output vaults).
**How to avoid:** Per the SDK docs, `result[i]` aligns to `orders[i]`; pick the inner element by IOIndex match (input/output index from the original ProcessedQuote). The first element is sufficient when the order has one valid IO pair (the common case).
**Warning signs:** TypeScript will catch this in strict mode if the planner reads `result[i].data.formattedMaxOutput` instead of `result[i][0]?.data?.formattedMaxOutput`.

### Pitfall 4: Vercel Speed Insights consent gating biases p75 baseline
**What goes wrong:** PERF-01 validates against the OBS-05 dashboard. Speed Insights is gated by cookie consent (`onAnalyticsAccepted` callback in `src/routes/+layout.svelte:30`). If consent rate is low, p75 is computed over a non-representative sample.
**Why it happens:** EU + privacy-conscious users decline analytics; Vercel only collects metrics from accepted sessions.
**How to avoid:** When pulling p75 baseline, also note the sample size (visible in Speed Insights dashboard top-right). If <100 sessions/day, p75 has high variance — set the success criterion as "p75 < 2.5s on a 7-day rolling window with N≥X sessions" rather than a single-point check. Document the consent-rate caveat in 02-RUNBOOK.md.
**Warning signs:** Speed Insights dashboard shows "low data" warning, or the p75 fluctuates ±500ms day-to-day.

### Pitfall 5: Lazy-load CLS regression on tab switch
**What goes wrong:** `LimitOrder.svelte` and `DcaOrder.svelte` are lazy-loaded; when user clicks Limit/DCA tabs, the lazy-loaded component reflows the panel and shifts content (CLS regression).
**Why it happens:** Default `{#await}` block has empty pending state; the panel collapses to 0px while waiting.
**How to avoid:** Use a fixed-height skeleton placeholder that matches the lazy-loaded component's rendered height. Pattern:
```svelte
{#await loadLimitOrder()}
  <div class="min-h-[420px]"><LoadingSpinner /></div>  <!-- match LimitOrder height -->
{:then Mod}
  <svelte:component this={Mod.default} ...props />
{/await}
```
**Warning signs:** Speed Insights CLS column post-deploy > 0.1 (Web Vitals "needs improvement" threshold).

### Pitfall 6: Splitting transaction.ts breaks order-of-write to vault state
**What goes wrong:** `marketTakeStore` (new) writes vault-invalidation calls AFTER tx success; if `partialFillDetection` runs before `invalidateUserVaultQueries`, a partial-fill display can show stale balances.
**Why it happens:** transaction.ts current code interleaves polling, vault invalidation, and partial-fill detection in `pollAndFinalizeTakeOrders`. Splitting them risks reordering.
**How to avoid:** Preserve the existing `pollAndFinalizeTakeOrders` function as a single sequential block in `marketTakeStore`; partial-fill detection consumes its result post-completion (not interleaved). Add an integration test (out-of-scope for Phase 2 per TEST-03 in Phase 4 — but document the contract in JSDoc).
**Warning signs:** Manual smoke test on a real Sell shows wrong balance after partial-fill banner displays.

### Pitfall 7: ESLint allowlist drift
**What goes wrong:** A new `// eslint-disable-next-line no-restricted-syntax` comment is added to bypass the rule for a "good reason"; over time, more disables accumulate; the rule's authority erodes.
**Why it happens:** Local pressure to ship; reviewer can't always tell if the disable is justified.
**How to avoid:** Phase-exit grep gate counts disables. Establish the baseline (likely 0 after codemod merges); plan-checker flags any increase in subsequent phases. Pattern from CONCERNS.md: "Add an ESLint custom rule or a comment marker (`// allow-direct-token-find`) to mark intentional bypasses."
**Warning signs:** Phase 3 or 4 introduces a new disable without a justifying comment.

---

## Code Examples

### Example 1: Helper accessor wrapper additions to `orderPerspective.ts`

```typescript
// NEW — add to src/lib/types/orderPerspective.ts after the existing helpers

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

/**
 * Read maker OUTPUT token address from a ProcessedQuote.
 * The returned address is what the order GIVES AWAY (on-chain OUTPUT).
 */
export function getMakerOutputTokenAddress(quote: ProcessedQuote): string {
  return quote.outputTokenAddress;
}

/**
 * Read input IO-index from a ProcessedQuote (used by aggregated take-order calldata).
 */
export function getMakerInputIOIndex(quote: ProcessedQuote): number {
  return quote.inputIOIndex;
}

/**
 * Read output IO-index from a ProcessedQuote.
 */
export function getMakerOutputIOIndex(quote: ProcessedQuote): number {
  return quote.outputIOIndex;
}
```

[VERIFIED: src/lib/utils/orderbook.ts:73-82 — `ProcessedQuote` interface declares these as `string`/`number`. Wrappers do not add semantics; they exist purely to centralize the access boundary so the ESLint rule has a single allowlisted reader.]

### Example 2: TRADE-04 parameterized regression test

```typescript
// tests/lib/utils/marketOrderFill.test.ts — append after the existing 19 tests
// NEW: 16-case parameterized matrix pinning 89571b3's two coupled bug classes

interface RegressionCase {
  description: string;
  side: 'Buy' | 'Sell';
  inputMode: 'amount' | 'spend';
  // Bug class 1: asymmetric slippage — emergencyMultiplier MUST equal computeRatioMultiplier(slippageBps), NOT '2'
  slippageBps: number;
  // Bug class 2: anchor selection — partial-fill check MUST use requestedTakerPaysAmount for spend-anchored
  requestedWantsAmount: bigint;
  requestedPaysAmount: bigint | undefined;
  totalReceivedWants: bigint;
  totalReceivedPays: bigint;
  expectPartialFill: boolean;
  // Pre-89571b3 buggy behavior — what would have been wrongly returned
  preFixWouldReturn: { isPartialFill: boolean };
}

const REGRESSION_CASES: RegressionCase[] = [
  // ── Bug class 1 reproduction: Sell × 0.1% slippage, hardcoded 2x emergency previously ignored user input
  // (This is a *math*-symmetry test verifying computeRatioMultiplier returns the same value for Buy and Sell;
  //  the actual hardcoded EMERGENCY_RATIO_MULTIPLIER='2' lives in marketOrderExecution.ts and is exercised
  //  by tests/lib/services/marketOrderExecution.test.ts — the math symmetry pin lives here.)

  // ── Bug class 2 reproduction: 4 mode×side cases for partial-fill anchor selection
  {
    description: 'Sell-by-asset (spend-anchored): full asset sold at worse price MUST NOT flag partial',
    side: 'Sell', inputMode: 'amount',  // Sell mode IS spend-anchored regardless of inputMode
    slippageBps: 100,
    requestedWantsAmount: 95_000_000n,   // simulated 95 USDC
    requestedPaysAmount: 1_000_000_000_000_000_000n,  // 1.0 asset, the anchor
    totalReceivedWants: 90_000_000n,     // got 90 USDC (worse price)
    totalReceivedPays: 1_000_000_000_000_000_000n,    // sold full 1.0 asset
    expectPartialFill: false,            // FIXED: anchor on pays → fully sold
    preFixWouldReturn: { isPartialFill: true }  // BUGGY: anchor on wants → 90/95 < 99.7%
  },
  {
    description: 'Buy-by-asset (wants-anchored): full asset received MUST NOT flag partial',
    side: 'Buy', inputMode: 'amount',
    slippageBps: 100,
    requestedWantsAmount: 1_000_000_000_000_000_000n,
    requestedPaysAmount: undefined,       // wants-anchored — no pays anchor
    totalReceivedWants: 1_000_000_000_000_000_000n,
    totalReceivedPays: 100_500_000n,      // paid 0.5% more than expected
    expectPartialFill: false,
    preFixWouldReturn: { isPartialFill: false }   // pre-fix already correct for buy-by-asset
  },
  {
    description: 'Buy-by-spend (spend-anchored): full payment spent at worse price MUST NOT flag partial',
    side: 'Buy', inputMode: 'spend',
    slippageBps: 100,
    requestedWantsAmount: 1_000_000_000_000_000_000n,  // simulated 1.0 asset
    requestedPaysAmount: 100_000_000n,                  // 100 USDC, the anchor
    totalReceivedWants: 950_000_000_000_000_000n,       // got 0.95 asset
    totalReceivedPays: 100_000_000n,                    // spent full 100 USDC
    expectPartialFill: false,
    preFixWouldReturn: { isPartialFill: true }   // BUGGY: anchor on wants → 0.95/1.0 < 99.7%
  },
  {
    description: 'Sell-by-asset boundary: 99.7% paid MUST NOT flag partial',
    side: 'Sell', inputMode: 'amount',
    slippageBps: 100,
    requestedWantsAmount: 100_000_000n,
    requestedPaysAmount: 1_000_000_000_000_000_000n,
    totalReceivedWants: 99_500_000n,
    totalReceivedPays: 997_000_000_000_000_000n,
    expectPartialFill: false,
    preFixWouldReturn: { isPartialFill: false }
  },
  // ... 12 more permutations (Buy-by-asset partial, Sell partial, all four × full-fill, all four × no-fill)
];

describe('TRADE-04 regression matrix — pins 89571b3 bug classes', () => {
  REGRESSION_CASES.forEach((c) => {
    it(c.description, () => {
      const result = evaluateMarketOrderFill({
        totalTakerWantsAmount: c.totalReceivedWants,
        totalTakerPaysAmount: c.totalReceivedPays,
        requestedTakerWantsAmount: c.requestedWantsAmount,
        requestedTakerPaysAmount: c.requestedPaysAmount
      });
      expect(result.isPartialFill).toBe(c.expectPartialFill);
      // Optional: assert the pre-fix would have returned wrong answer
      // (left as a comment for future regression-bisect, not as an active assertion)
    });
  });
});
```

[VERIFIED: tests/lib/utils/marketOrderFill.test.ts existing 19 tests; commit 89571b3 fixed two coupled bugs; this matrix pins both.]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `EMERGENCY_RATIO_MULTIPLIER = '2'` for Sell | `computeRatioMultiplier(slippageBps)` for both Buy and Sell | 2026-04-27 (commit 89571b3) | TRADE-04 regression tests must pin this |
| `transaction.ts` ↔ `marketOrderExecution.ts` mutual import | Severed via `marketOrderFill.ts` extraction | 2026-04-27 (commit 89571b3) | TRADE-02 still has `marketOrderExecution.ts → transactionStore` direction; eliminate by hoisting 3 methods into `marketTakeStore` |
| Subgraph-only "no liquidity" detection | Pre-flight multicall (TRADE-03) | This phase | Closes the freshness-illusion bug class |
| Direct property reads on ProcessedQuote.inputTokenAddress | ESLint-banned; helper accessors only | This phase | Closes the side-inversion bug class structurally |
| `*Exact` modes in float arithmetic | `*UpTo` modes (per :244-247 comment) | Pre-Phase-2 | Preserve through TRADE-04 work |
| No bundle audit | rollup-plugin-visualizer | This phase | Empirical input to PERF-01 prune list |

**Deprecated/outdated:**
- jspdf + jspdf-autotable in package.json — 0 imports in src/; safely removable in PERF-01 bundle prune (saves ~150KB minified).
- Aspirational multi-chain references in CLAUDE.md — will be cleaned up in Phase 4 / DRIFT-03; ignored by this phase.

---

## Technical Approach

### TRADE-01 — ESLint custom rule + ts-morph codemod

**Re-grep at planning time confirms:**
- 134 total raw `inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex` hits across 17 files (was 88 in CONTEXT — drift from new test fixtures + transaction.ts growth).
- 57 actual property reads (the surface the rule will bind on).
- Per-file property-read counts: `transaction.ts` (24), `+page.svelte` trade (8), `marketOrderExecution.ts` (7), `MarketOrder.svelte` (6), `queries/orderbook.ts` (4), `QuickTrade.svelte` (4), `tokenMath.ts` (2), `dashboard/+page.svelte` (1), `transactionDisplay.ts` (1).

**Allowlist target files:**
- `src/lib/types/orderPerspective.ts` — canonical helper itself (currently doesn't access these fields, but symmetry).
- `src/lib/utils/orderbook.ts` — `ProcessedQuote` interface declaration (lines 79-82). Note: `MemberExpression` selector won't fire on declarations, but the file is allowlisted as a fail-safe.
- `src/lib/api/orders.ts` — `convertApiOrderToProcessedQuote` populates the fields (lines 142-145). Allowlisted because populating the canonical type is by definition the boundary.
- `src/generated-graphql.ts` — currently absent from disk but listed in `eslint.config.js` ignores (planned codegen target).

**Helper API surface gaps:** Existing helpers (`deriveMakerSide`, `getUserTakerInfo`, `makerToTakerTokens`, `takerToMakerTokens`) operate on `MakerOrderTokens` / `TakerOrderTokens` shapes — they do NOT take a `ProcessedQuote`. The 57 call sites all read `quote.X` directly. Two options for the codemod:
1. **Add 4 thin accessor wrappers** (`getMakerInputTokenAddress(quote)` etc.) — minimal change; one-line bodies; codemod is a mechanical rewrite.
2. **Force every call site to convert ProcessedQuote → MakerOrderTokens first** then call existing helpers — large blast radius; many callsites only need the address, not the full token object.
**Recommend option 1.** Add the 4 wrappers in the same PR as the codemod; ESLint rule allowlists `orderPerspective.ts` so the wrapper bodies are legal. See "Code Examples §Example 1" above.

**Codemod harness:** ts-morph 28.0.0. For `.ts`/`.tsx` files: standard `getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)` traversal. For `.svelte` files: hand-edit the 6 affected files (MarketOrder.svelte=6 reads, QuickTrade.svelte=4 reads, +page.svelte trade=8 reads, dashboard/+page.svelte=1 read, OrdersTable=0 reads (declarations only), TokenSwapModal=0 reads (declarations only)) — total 19 hand-edits; cheaper than building a Svelte preprocessor extraction step.

**Drift since CONTEXT.md:** The total file list is unchanged (still 17), but raw hit counts grew from 88 → 134 because new tests landed and transaction.ts grew. The planner can run the codemod on whatever the actual surface is at codemod-execution time — drift is bounded.

### TRADE-02 — transaction.ts split topology

**Concern boundaries discovered by reading all 2373 lines:**

1. **Deploy state machine** (~700 lines): `handleStrategyDeployment`, `showRainlangConfirmation`, `handleDcaDeploy`, `handleLimitDeploy`, `handleDsfDeploy`, `handleFolioDeploy`. Owns approval-checking + ERC20-approval batch + `gui.getDeploymentTransactionArgs` consumption. Owns `RainlangConfirmation` modal trigger.
2. **Market-take state machine** (~900 lines): `preloadAggregatedTakeOrdersCalldata`, `handleAggregatedTakeOrdersCalldata`, `handleTakeOrders`, `handleOracleOrders`, `pollAndFinalizeTakeOrders`. Owns aggregated→fallback→per-order cascade, multi-tx orchestration, leg-reroute logic, transient-error retry.
3. **Approval state machine** (~150 lines): inline within deploy + market-take currently — balance + allowance reads (parallel) + approval-tx submission. Refactor target: extract into a callable utility.
4. **Partial-fill detection** (~80 lines): consumes `evaluateMarketOrderFill` from `$lib/utils/marketOrderFill`; produces `MarketOrderSummary`. Currently inside `pollAndFinalizeTakeOrders`. Recommend extracting.
5. **Vault & query invalidation** (~100 lines): `invalidateOrderQueries`, `invalidateUserVaultQueries`, `invalidateDashboardBalances` — currently called inline. Could stay inline; refactor not required for TRADE-02 pass.
6. **Orderbook validation** (`validateOrderbookAddress`, `isOrderbookTrusted` — ~30 lines): leaf-pure, suitable for `transactionShared.ts`.
7. **Multi-tx UI orchestration** (`acknowledgeMultiTx`, the `PENDING_MULTI_TX_ACKNOWLEDGMENT` UI gate): leaf — keep in `transactionShared.ts` because the modal subscribes to `TransactionStatus`.
8. **`TransactionStatus` enum + interfaces** (lines 347-407): leaf.
9. **`classifyError`** (lines 87-101): leaf-pure utility.
10. **Wrap/unwrap operations** (`handleWrapUnwrap`): adjacent to deploy but operates on ERC4626 vaults, not orderbook. Goes with deploy.
11. **Wallet withdraw / remove order** (`handleWithdraw`, `handleRemoveOrder`, `handleWithdrawFromOrder`): adjacent to deploy. Goes with deploy.

**Recommended split granularity: 5 modules** (slightly finer than CONTEXT's 4-module suggestion):

| New file | Owns | Consumed by |
|----------|------|-------------|
| `src/lib/stores/transactionShared.ts` (LEAF, ~150 lines) | `TransactionStatus`, `TransactionMetadata`, `MarketOrderSummary`, `RaindexLink`, `MultiTxProgress`, `AssetTokenInfo`, `classifyError`, `validateOrderbookAddress`, `isOrderbookTrusted`, `extractTransactionError`, the writable store + reset/setState helpers | All other `*Store.ts` files; `TransactionModal.svelte`; `marketOrderExecution.ts` (TransactionStatus only) |
| `src/lib/stores/deployTransactionStore.ts` (~700 lines) | `handleStrategyDeployment`, `showRainlangConfirmation`, `handleDsfDeploy`, `handleDcaDeploy`, `handleLimitDeploy`, `handleFolioDeploy`, `handleWithdraw`, `handleRemoveOrder`, `handleWithdrawFromOrder`, `handleWrapUnwrap` | Trade page deploy buttons; vault management UI |
| `src/lib/stores/marketTakeStore.ts` (~900 lines) | `preloadAggregatedTakeOrdersCalldata`, `handleAggregatedTakeOrdersCalldata`, `handleTakeOrders`, `handleOracleOrders`, `pollAndFinalizeTakeOrders` | `marketOrderExecution.ts` (only consumer of these 3 methods today) |
| `src/lib/stores/approvalStore.ts` (~150 lines) | balance + allowance read with retry, ERC20 approval tx submission; pure utility consumed by deploy + market-take | deployTransactionStore, marketTakeStore |
| `src/lib/stores/partialFillDetection.ts` (~80 lines) | `detectPartialFill(params): MarketOrderSummary` consuming `evaluateMarketOrderFill` from `$lib/utils/marketOrderFill` | marketTakeStore (after pollAndFinalizeTakeOrders completes) |

**Façade preservation:** `src/lib/stores/transaction.ts` shrinks to ~30 lines:
```typescript
// Re-export façade — preserves UI bindings during migration.
export { TransactionStatus, type TransactionMetadata, type MarketOrderSummary, type RaindexLink, type MultiTxProgress, type AssetTokenInfo } from './transactionShared';
import { transactionStoreInternal } from './transactionShared';
import * as deploy from './deployTransactionStore';
import * as marketTake from './marketTakeStore';
export default {
  ...transactionStoreInternal,
  ...deploy,
  ...marketTake
};
```

UI components keep `import transactionStore from '$lib/stores/transaction'` unchanged. Inside `marketOrderExecution.ts` (already in scope for TRADE-03 changes), update the 3 method-call sites to import from `marketTakeStore` directly — that's the structural fix that severs the remaining circular import direction.

**Circular import surface enumeration:**
- Today: `marketOrderExecution.ts → transactionStore → (transitively) marketOrderFill.ts ← marketOrderExecution.ts`. The cycle was structurally cut by extracting `marketOrderFill.ts` (89571b3); the *lexical* cycle (`marketOrderExecution.ts` imports `transactionStore`, but `transaction.ts` does NOT import `marketOrderExecution.ts` — confirmed by grep) is currently absent.
- TRADE-02 maintains this property: `marketTakeStore.ts` does NOT import `marketOrderExecution.ts`; `marketOrderExecution.ts` imports `marketTakeStore.ts`. The directionality is one-way.
- New leaf module `transactionShared.ts` is imported by everyone; it imports nothing in the trade-execution layer (only viem + Svelte primitives).

**TransactionStatus consumers (grep verified):**
- `src/lib/stores/transaction.ts` (defines it; will move to `transactionShared.ts`)
- `src/lib/services/marketOrderExecution.ts` (line 31 — reads `.SUCCESS`, `.ERROR`)
- `src/lib/components/TransactionModal.svelte` (UI binding)
- `src/lib/components/orders/MarketOrder.svelte`, `QuickTrade.svelte` (subscribed via `transactionStore` → status field; do NOT directly import the enum itself based on grep)

Recommendation: **keep `TransactionStatus` as ONE enum in `transactionShared.ts`** — splitting per-state-machine would force callers to know which sub-machine emitted which status, breaking UI symmetry. The 7 status values cover all 4 state machines without conflict.

**Pre-existing 4 svelte-check errors (lines 664/686/708/2346):**
- Root cause: `gui.getDeploymentTransactionArgs(...)` returns `WasmEncodedResult<unknown>`. The call site assigns `.value` to a local named `deploymentArgs` typed as `unknown`. Then passes to `showRainlangConfirmation(deploymentArgs: DeploymentTransactionArgs, ...)`.
- **The TRADE-02 split alone will NOT fix these.** Moving `handleDcaDeploy` etc. to `deployTransactionStore.ts` preserves the same control flow. Either:
  - (a) Add a type assertion `as DeploymentTransactionArgs` at the call site (mechanical fix; preserves behavior; documented in Phase 1 deferred items).
  - (b) Tighten the return type of `getDcaDeploymentArgs` etc. in `orderDeployment.ts` to `Promise<{composedRainlang: string; deploymentArgs: DeploymentTransactionArgs}>` via an explicit return type annotation.
- **Recommend option (b).** Same line count; clearer contract; gets the planner to engage with the SDK shape rather than just assert it.

**Rollout shape recommendation:** **Hybrid — staged PR-by-PR atomic with façade preservation.** Specifically:
1. **PR 1 (TRADE-02 wave 1):** Add `transactionShared.ts` + extract `TransactionStatus` + interfaces + leaf utilities. `transaction.ts` re-exports from shared. svelte-check baseline holds. Zero behavior change.
2. **PR 2:** Add `marketTakeStore.ts` + move 5 take-order methods. `transaction.ts` merges market-take re-exports. Update `marketOrderExecution.ts` imports to point at `marketTakeStore` directly (this is the structural circular-import severance).
3. **PR 3:** Add `deployTransactionStore.ts` + move 7 deploy/wrap/withdraw methods. Same façade pattern.
4. **PR 4:** Add `approvalStore.ts` + extract balance/allowance + ERC20 approval. Both deploy and market-take re-route to it.
5. **PR 5:** Add `partialFillDetection.ts` + extract from `pollAndFinalizeTakeOrders`. Fix the 4 svelte-check errors in the same PR (option b above).
6. **PR 6 (close TRADE-02):** Remove the deferred `// TODO: split` comments; verify `transaction.ts` is ≤50 lines of pure re-export.

NO feature flags, NO env-var gates — solo-team simplicity bias from CONTEXT. The façade pattern is the rollout safety; UI imports never change. **Real-money safety:** between any two PRs, the take-order path either goes through the old monolith or the new shared store, never both, never reordered.

**Phase-internal sequencing recommendation:**

```
Wave 1: TRADE-01 codemod + ESLint rule (1 PR, atomic, no behavior change)
        └─ Unblocks: TRADE-02 (uses helper accessors when refactoring transaction.ts)

Wave 2: TRADE-02 PR-1 (transactionShared.ts extraction)
        └─ Unblocks: TRADE-02 PR-2 + PR-3 (parallel after shared lands)

Wave 3: TRADE-02 PR-2 (marketTakeStore) + PR-3 (deployTransactionStore) parallel
        └─ Disjoint files; can run in parallel. Both depend on Wave 2.

Wave 4: TRADE-02 PR-4 (approvalStore) + PR-5 (partialFillDetection + svelte-check fix)
        └─ Both consume Wave 3.

Wave 5: TRADE-03 pre-flight wiring (MOD marketOrderExecution.ts + MOD captureTakeOrderFailure.ts + MOD MarketOrder.svelte for D-05 inline error)
        └─ Depends on Wave 3 (marketTakeStore) being in place.

Wave 6: TRADE-04 regression test matrix (parameterized 4×4 cases)
        └─ Pure tests; can run in parallel with Wave 5.

Wave 7: PERF-01 (lazy-load + bundle prune + query waterfall)
        └─ LANDS LAST per CONTEXT D-08a — bundle shape stabilizes after TRADE-* refactor.
        └─ Depends on Waves 1-6.

Wave 8: Phase exit — re-grep gates, transcript completeness, baseline LCP delta
```

### TRADE-03 — Pre-flight multicall mechanics

**Multicall ABI confirmation:**
- Multicall3 IS deployed on Base 8453 at `0xcA11bde05977b3631167028862bE2a173976CA11` [VERIFIED: web search hit BaseScan + multicall3.com deployment registry].
- Already used in this codebase via wagmi's `readContracts` (which uses Multicall3 internally) — see `dashboard/+page.svelte:382`, `LowFundsBanner.svelte:23-51`. So the wiring is proven.
- **Phase 2 doesn't need the raw Multicall3 ABI** — `RaindexClient.getOrderQuotesBatch(orders, blockNumber, chunkSize)` does the multicall internally per its JSDoc.

**Read calls needed per targeted order:**
1. **Order existence** — `getOrderQuotesBatch` returns `success: boolean` per order; `false` means the order is filled, cancelled, or maker has insufficient vault balance.
2. **Output vault balance** — `RaindexOrderQuote.data.formattedMaxOutput` is the vault liquidity at the moment of the multicall (in human-decimal string format).
3. **Current ratio** — `RaindexOrderQuote.data.formattedRatio` and `RaindexOrderQuote.data.ratio` (hex Float). Compare against `transcript.priceCap` to detect drift.

**Wiring location:** Insert immediately after the `unhydratedFills.length > 0` warning at `marketOrderExecution.ts:325-329` and BEFORE the `aggregatedParams` construction at line 416. Specifically:
- After `firstQuote = walkResult.fills[0].quote` (line 330) — populates `transcript.onChainStateRead.orderHash` already.
- Before the `firstQuote.orderData / sgOrder` validity gate (line 343) — pre-flight runs only on hydrated quotes.

**Auto-walk depth recommendation: 2 levels deep.**
- Level 1: pre-flight runs on the candidates from the local walk; drop any with `success: false` or `formattedMaxOutput === '0'`. If survivors are insufficient (sum of survivor `maxOutput` < requested take amount), proceed to Level 2.
- Level 2: re-run `walkOrderbook` with the survivors-only quote list; pre-flight again. If still insufficient → `failWith('auto_retry_exhausted', ...)` → inline error.
- Bounded RPC cost: ≤2 multicalls per take attempt. Justification: a single staleness layer is the common case; nested staleness is rare and not worth chasing further.

**vaultBalance population path into OBS-03 transcript:**
- Phase 1 left `transcript.onChainStateRead.vaultBalance: null` per D-08-LIMITATION (commented in code).
- Phase 2 populates it from `preflightResult.value[0]?.[0]?.data?.formattedMaxOutput` — string in human-decimal format. The transcript field type is `string | null` so this fits cleanly.
- Field populated AFTER pre-flight runs but BEFORE any failure path can fire — so even a `preflight_order_vanished` failure carries the (zero or low) vaultBalance we just observed.

**Output token type semantics (asset vs payment):** Each ProcessedQuote has known `outputTokenAddress` (banned for direct read post-TRADE-01; use accessor). The token can be:
- A payment token (USDC, USDT, WETH) — straight ERC20 balance.
- An asset token (tNVDA, tAMZN, etc.) — wrapped ERC20; the vault holds the wrapped variant. Per memory: "Each ST0x token has 3 addresses: wrapped (primary), unwrapped (ERC4626 asset), legacy."
- `getTokenByAnyAddress` is the canonical lookup (already used in dashboard).

For pre-flight semantics, NO special case is needed — `formattedMaxOutput` from the SDK is always in the output token's decimal units (the Float type encapsulates this). The TRADE-03 wiring does not need to inspect token type.

### TRADE-04 — Execution math regression test surface

**Existing coverage (from reading `tests/lib/utils/marketOrderFill.test.ts` + `tests/lib/services/marketOrderExecution.test.ts`):**

| Mode×Side | clampSlippageBps | computeRatioMultiplier | evaluateMarketOrderFill (89571b3 fix) | Coverage |
|-----------|------------------|------------------------|----------------------------------------|----------|
| Sell-by-asset (spend-anchored) | ✅ general | ✅ symmetric Buy/Sell | ✅ 4 tests in pays-anchor describe block | HIGH |
| Buy-by-asset (wants-anchored) | ✅ general | ✅ symmetric | ✅ 4 tests in buy-anchor describe block | HIGH |
| Buy-by-spend (spend-anchored) | ✅ general | ✅ symmetric | ✅ 1 test ("handles Buy-spend correctly") | MEDIUM |
| Sell + slippage applied to priceCap | — | — | ❌ NOT tested at this layer (lives in marketOrderExecution.ts) | LOW |

**Gaps the parameterized matrix closes:**
1. **Buy-by-spend partial-fill at boundary** — only one test today; need 99.7% boundary, 99.5% (partial), 100% (full).
2. **Sell partial-fill with non-zero received pays** — i.e. user sold 80% of asset because vault drained; verify `isPartialFill = true` (real partial), not "actual paid 99.7% of typed paid".
3. **Buy-by-asset paid-side rejection** — verify that `requestedTakerPaysAmount === undefined` does NOT default to wants comparison.
4. **All-zero edge cases** — `totalReceivedWants === 0n` → `isNoFill = true`; `requestedWantsAmount === 0n` → `isNoFill = true`; both regardless of side.

**Bug class 1 reproduction (asymmetric slippage):** The hardcoded `EMERGENCY_RATIO_MULTIPLIER = '2'` for Sell lived in `marketOrderExecution.ts`, NOT in `marketOrderFill.ts`. Reproduction tests for this go in `tests/lib/services/marketOrderExecution.test.ts`. Specifically: `it('Sell at slippageBps=10 produces priceCap within 0.1% of worstFill ratio')` — fails on pre-89571b3 code (would produce 2x worstFill).

**Bug class 2 reproduction (anchor inversion):** Lives in `marketOrderFill.ts` `evaluateMarketOrderFill`. Reproduction tests already partially cover; the new matrix completes coverage.

**`*UpTo` precision tolerance comment at marketOrderExecution.ts:244-247:** [VERIFIED in source — comment still accurate]. Other call sites with `UpTo` mode selection: lines 354-365 (`mode = 'spendUpTo'` for Sell + Buy-by-spend; `'buyUpTo'` for Buy-by-asset). Same precision rationale. TRADE-04 work must NOT change `*Exact` to `*UpTo` or vice versa.

### PERF-01 — Baseline + bundle audit

**BLOCKING ITEM: Live p75 LCP baseline NOT captured during research.**
- 01-RUNBOOK.md documents the dashboard URL (`https://vercel.com/st-0x/st0x/observability/speed-insights`) but does NOT contain the actual numeric p75 LCP value.
- Vercel API direct probe failed (returned 404 — the API endpoint structure I tried is not the right one for Speed Insights data; the public Vercel REST API for Speed Insights metrics requires team auth).
- **Action required from planner/user before PERF-01 plan finalizes:** an authenticated user opens the dashboard, captures the current p75 LCP for `/trade/[id]` over a 7-day window, and records it in `02-PERF-01-PLAN.md` (or the phase RUNBOOK). Without this, the "is current baseline already <2.5s?" question is unanswered.
- **What to capture:**
  - p75 LCP value (single number, ms).
  - Sample size (sessions/day or 7-day total).
  - Per-device-class breakdown if available (mobile p75 vs desktop p75 — mobile is typically the bottleneck).
  - Per-route confirmation that `/trade/[id]` specifically is being measured (vs all routes).
- **Confidence note:** Speed Insights is consent-gated; if consent rate is low, the sample is biased. Pull the consent rate (visible in PostHog or the analytics events if instrumented) alongside the p75 number.

**Bundle audit tool: rollup-plugin-visualizer 7.0.1.**
```typescript
// vite.config.ts (modified — recommended pattern for SvelteKit)
import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    visualizer({
      emitFile: true,           // SvelteKit runs Vite multiple times; emitFile attaches stats.html to each
      filename: 'stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap'
    })
  ]
});
```
After `npm run build`: stats.html lives at `.svelte-kit/output/client/stats.html` (and possibly server). Add `stats.html` to `.gitignore`.

[CITED: rollup-plugin-visualizer GitHub README + npm page; SvelteKit-specific `emitFile: true` recommendation per SvelteKit discussions.]

**Lazy-load mechanism — Svelte 4 canonical pattern:**
```svelte
<!-- In src/routes/(main)/trade/[id]/+page.svelte -->
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

[CITED: Svelte 4 docs — `{#await ... then ...}` block; `<svelte:component this={...}>` pattern; verified against multiple ecosystem sources via WebSearch.]

**CLS-regression risk:** The `min-h-[420px]` skeleton placeholder in the `{#await}` pending state must match the rendered component's height ±20px. Recommend measuring `LimitOrder.svelte` and `DcaOrder.svelte` heights at the current default screen size (record in 02-PERF-01-PLAN.md) and using the larger of the three for the skeleton (so the panel doesn't shrink when switching tabs).

**Query-waterfall reorganization:**

Current dependency graph (from reading `+page.svelte`):
```
Tier 0 (browser-only, can run immediately):
  $page.params.id → tokenId

Tier 1 (depend only on tokenId + currentNetwork):
  - createSingleSftQuery(tokenId, $currentNetwork)              → currentToken
  - createOracleQuotesQuery($currentNetwork)                    → oracleQuotes (independent)

Tier 2 (depend on currentToken):
  - createTokenOrderbookQuotesQuery($currentNetwork, currentToken.address)
  - createTokenTradeActivityQuery($currentNetwork, currentToken.address)

Tier 3 (depend on $walletAddress + currentToken):
  - createTakerTradesQuery($currentNetwork, $walletAddress, 600_000)
  - createBatchTradesQuery($currentNetwork, userOrderHashesForToken, 600_000)
  - createUserVaultsQuery($currentNetwork, $walletAddress)
  - walletBalanceQuery (createQuery with readContract)

Background prefetch (non-blocking):
  - prefetchGlobalOrders($currentNetwork.id)
  - prefetchUserVaults($currentNetwork.id, $walletAddress)
```

**Reorganization recommendation:**
- **Already parallel:** Tier 1 queries fire concurrently on mount.
- **Already parallel:** Tier 2 queries fire concurrently after currentToken resolves.
- **OPPORTUNITY:** Tier 3 queries depend on `$walletAddress` AND `currentToken`. If tokenId is known at mount and `$walletAddress` is already authenticated, these can fire in parallel with Tier 2 instead of strictly after. Specifically: `createUserVaultsQuery` and `walletBalanceQuery` only need `currentToken.address`, which is `currentToken?.address ?? null` — TanStack handles the null case gracefully (`enabled: false` until ready), so kicking them off "speculatively" at mount is a no-op when not authenticated and a parallelization win when authenticated.
- **OPPORTUNITY:** `createOracleQuotesQuery` is in Tier 1 but takes ~200-400ms; SvelteKit has no prefetch primitive on the client side, but the page can issue `oracleQuotesQuery` BEFORE the `singleTokenQuery` resolves so they overlap.
- **Anti-pattern to avoid:** Reducing `staleTime: Infinity` (per CLAUDE.md). Manual-invalidation pattern is intentional.
- **Best practice:** Use TanStack `prefetchQuery` in route `+page.ts` `load` hook IF SSR were on the table. Since CONTEXT D-08 forbids SSR, prefetch happens client-side at page mount.

**Top bundle offenders prediction (without running visualizer):**
- **HIGHLY LIKELY removable:** `jspdf` + `jspdf-autotable` — no imports in `src/` (verified by grep). Combined size ~250KB minified. Quick win; remove from `package.json` and re-run lockfile.
- **LIKELY heavy:** `@dynamic-labs/sdk-react-core` + transitively `react@18` + `react-dom@18` — pulls in React for the embedded wallet flow. Cannot remove (auth path requirement) but can verify it's properly tree-shaken and not in the trade-page initial chunk if Dynamic isn't used on first paint.
- **LIKELY heavy:** `@rainlanguage/orderbook` (WASM) — ~500KB+ WASM blob. NON-NEGOTIABLE for trading; bundle as a separate chunk that loads in parallel with first paint.
- **MEDIUM:** `posthog-js` — analytics; consent-gated init, so it should load post-consent. Verify it's not in the initial chunk.
- **MEDIUM:** `lightweight-charts` — only used on trade page; CAN be lazy-loaded along with the chart components per D-08.
- **MEDIUM:** `highlight.js` — loaded via `RainlangConfirmationModal` which only mounts on deploy click (not on trade page initial paint). Verify it's not eagerly imported.

The visualizer pass after install confirms or refutes each prediction. Document the actual top-5 in `02-PERF-01-PLAN.md` post-audit.

**No-CLS skeleton-load dimensions to measure (planner action):**
- LimitOrder.svelte rendered height @ md screen (record px).
- DcaOrder.svelte rendered height @ md screen.
- Use max(MarketOrder, LimitOrder, DcaOrder) − 20px as `min-h-[Xpx]`.

### Phase-2 Phase-Exit Grep Gates

**Inherited from Phase 1 (must continue to pass):**
- `[ "$(grep -c 'failWith(' src/lib/services/marketOrderExecution.ts)" -ge 8 ]` — currently 9 (Phase 1 baseline).
- `! grep -rqE "runtime.*['\\\"]edge['\\\"]" src/routes/` — no Edge runtime regression.
- All Phase 1 cross-cutting cleanup greps (Onramper, Buy crypto, LP_SUBGRAPH_URL, /api/onramper, /api/rewards) — 0 hits each.

**New Phase 2 gates:**

```bash
# TRADE-01 — codemod completion verification
# NEGATIVE: no raw property reads outside allowlist
echo "=== TRADE-01: raw IO-perspective property reads ==="
grep -rnE "\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\b" \
  --include="*.ts" --include="*.svelte" \
  src/ tests/ \
  | grep -vE "(orderPerspective\.ts|utils/orderbook\.ts|api/orders\.ts|generated-graphql\.ts)" \
  | wc -l
# MUST be 0

# TRADE-01 — disable-line escape hatches not abused
echo "=== TRADE-01: eslint-disable lines for no-restricted-syntax ==="
grep -rnE "eslint-disable.*no-restricted-syntax" src/ tests/ | wc -l
# MUST be 0 at phase-exit (any required disable should ship in a follow-up PR with code-review note)

# TRADE-02 — circular import absence
echo "=== TRADE-02: marketOrderExecution → transactionStore direct import ==="
grep -nE "from ['\"]\\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts
# MUST return 0 hits — should import from $lib/stores/marketTakeStore now

echo "=== TRADE-02: transactionStore → marketOrderExecution direct import ==="
grep -nE "from ['\"]\\\$lib/services/marketOrderExecution['\"]" src/lib/stores/*.ts
# MUST return 0 hits

echo "=== TRADE-02: new state-machine modules exist ==="
test -f src/lib/stores/transactionShared.ts && \
test -f src/lib/stores/deployTransactionStore.ts && \
test -f src/lib/stores/marketTakeStore.ts && \
test -f src/lib/stores/approvalStore.ts && \
test -f src/lib/stores/partialFillDetection.ts
# MUST exit 0

echo "=== TRADE-02: transaction.ts shrunk to façade ==="
wc -l src/lib/stores/transaction.ts
# MUST be ≤ 60 lines (target: ~30 lines re-export)

# TRADE-02 — svelte-check baseline matches expected
echo "=== TRADE-02: svelte-check should be 3 errors (rpcMetrics test) — NOT 7 ==="
npm run check 2>&1 | grep -cE "^Error:"
# MUST be ≤ 3 (the 4 transaction.ts errors must be cleared by PR-5)

# TRADE-03 — pre-flight wiring
echo "=== TRADE-03: getOrderQuotesBatch wired in marketOrderExecution.ts ==="
grep -c "getOrderQuotesBatch" src/lib/services/marketOrderExecution.ts
# MUST be ≥ 1

echo "=== TRADE-03: vaultBalance no longer null ==="
grep -nE "transcript\.onChainStateRead\.vaultBalance\s*=" src/lib/services/marketOrderExecution.ts
# MUST find a non-null assignment site

echo "=== TRADE-03: failWith call sites EXTENDED ==="
grep -c "failWith(" src/lib/services/marketOrderExecution.ts
# MUST be ≥ 12 (Phase 1 baseline 9 + 3 new pre-flight reasons: preflight_order_vanished, preflight_chain_unreachable, auto_retry_exhausted)
# preflight_vault_drained is conceptually subsumed by preflight_order_vanished (success=false in SDK) — planner may merge.

echo "=== TRADE-03: TakeOrderFailureReason union extended ==="
grep -c "preflight_\|auto_retry_exhausted" src/lib/services/observability/captureTakeOrderFailure.ts
# MUST be ≥ 3 (new reasons added)

echo "=== TRADE-03: D-05 inline error copy in MarketOrder.svelte ==="
grep -c "No liquidity available right now" src/lib/components/orders/MarketOrder.svelte
# MUST be 1

# TRADE-04 — regression matrix
echo "=== TRADE-04: parameterized regression test count ==="
grep -cE "^\s*it\(" tests/lib/utils/marketOrderFill.test.ts
# MUST be ≥ 35 (baseline 19 + ≥16 new parameterized cases)

# PERF-01 — bundle visualizer wired, lazy imports in place
echo "=== PERF-01: rollup-plugin-visualizer in vite config ==="
grep -c "rollup-plugin-visualizer\|visualizer" vite.config.ts
# MUST be ≥ 1

echo "=== PERF-01: lazy-loaded order tabs ==="
grep -cE "await import\(['\"]\\\$lib/components/orders/(LimitOrder|DcaOrder)" "src/routes/(main)/trade/[id]/+page.svelte"
# MUST be ≥ 2

echo "=== PERF-01: jspdf + jspdf-autotable removed from package.json ==="
grep -cE "\"(jspdf|jspdf-autotable)\":" package.json
# MUST be 0 (or document why retained)

echo "=== PERF-01: stats.html in .gitignore ==="
grep -c "stats\.html" .gitignore
# MUST be 1
```

**Cross-cutting from Phase 1 inherited verbatim** — re-run the 7 cleanup greps from `01-RUNBOOK.md`. Phase 2 must not regress any.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.x + @testing-library/svelte (per package.json) |
| Config file | `vitest.config.ts` (existing) |
| Setup | `vitest-setup.ts` (existing — includes mocks for @sentry/sveltekit, svelte-wagmi, $app/stores) |
| Quick run command | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts tests/lib/services/marketOrderExecution.test.ts` |
| Full suite command | `npm test -- --run` (currently 447 tests / 1 skipped per Phase 1 close) |
| ESLint command | `npm run lint` (svelte + ts) |
| svelte-check command | `npm run check` (currently 3 baseline errors expected; 4 transaction.ts errors will be cleared by TRADE-02 PR-5) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRADE-01 | ESLint rule fires on a known violation fixture | unit (lint) | `npm run lint -- tests/fixtures/io-perspective-violation.ts` (NEW fixture file) | ❌ Wave 0 — fixture file to be added |
| TRADE-01 | ESLint rule does NOT fire on canonical helper itself | unit (lint) | `npm run lint -- src/lib/types/orderPerspective.ts` | ✅ |
| TRADE-01 | Codemod migration leaves zero raw-access hits in src/ | grep | `grep -rnE "\.(inputTokenAddress\|outputTokenAddress\|inputIOIndex\|outputIOIndex)\b" --include="*.ts" --include="*.svelte" src/ tests/ \| grep -vE "(orderPerspective\|utils/orderbook\|api/orders\|generated-graphql)" \| wc -l` | ✅ command form (existing files) |
| TRADE-01 | Helper accessor tests (4 wrappers) round-trip | unit | `npm test -- --run tests/lib/types/orderPerspective.test.ts` | ✅ existing test file (extend with 4 cases) |
| TRADE-02 | New module files exist | shell | `test -f src/lib/stores/{transactionShared,deployTransactionStore,marketTakeStore,approvalStore,partialFillDetection}.ts` | ❌ Wave 0 — files to be created |
| TRADE-02 | Circular import absent | grep | `grep -E "from ['\"]\\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` MUST return 0 lines | ✅ command form |
| TRADE-02 | UI bindings (TransactionStatus consumers) compile | type-check | `npm run check` MUST be ≤ 3 errors (rpcMetrics tests only) | ✅ existing |
| TRADE-02 | Existing 19 marketOrderFill tests still pass | unit | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts` | ✅ |
| TRADE-02 | Existing 1 marketOrderExecution test still passes | unit | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` | ✅ |
| TRADE-03 | Pre-flight integration test with mocked stale order | integration | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` (NEW test cases; mock RaindexClient.getOrderQuotesBatch to return success: false) | ✅ existing file (extend) |
| TRADE-03 | Auto-retry exhausted → inline error rendering | component test | `npm test -- --run tests/lib/components/orders/MarketOrder.test.ts` (NEW) | ❌ Wave 0 — file to be created (no existing MarketOrder test) |
| TRADE-03 | OBS-03 transcript.vaultBalance populated post-multicall | unit | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` (extend with transcript-shape assertion) | ✅ extend |
| TRADE-04 | Parameterized matrix across 4 mode×side combos | unit (parameterized) | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts` | ✅ extend |
| TRADE-04 | 89571b3 bug class 1 reproduction (slippage symmetry) | unit | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` (NEW: priceCap symmetry test) | ✅ extend |
| TRADE-04 | 89571b3 bug class 2 reproduction (anchor selection) | unit | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts` (NEW: per-mode partial-fill anchor tests) | ✅ extend |
| PERF-01 | Build emits stats.html | shell | `npm run build && test -f .svelte-kit/output/client/stats.html` | ❌ Wave 0 — visualizer install gate |
| PERF-01 | Lazy-load tabs use dynamic import | grep | `grep -cE "await import\(['\"]\\\$lib/components/orders/(LimitOrder\|DcaOrder)" "src/routes/(main)/trade/[id]/+page.svelte"` MUST be ≥ 2 | ✅ command form |
| PERF-01 | jspdf removed from package.json | grep | `! grep -qE "\"jspdf\":" package.json` | ✅ command form |
| PERF-01 | p75 LCP delta — pre vs post | manual / Speed Insights | Pull p75 LCP from `https://vercel.com/st-0x/st0x/observability/speed-insights` over 7-day window, pre-deploy and post-deploy, both for `/trade/[id]` route. Record numbers in 02-RUNBOOK.md. PASS = post < 2.5s. | manual-only — operator-driven smoke test |
| PERF-01 | Bundle size delta — pre vs post | manual + visualizer | Compare initial-chunk size in stats.html before vs after lazy-load + prune. Record in plan summary. | manual-only |
| PERF-01 | CLS regression check on tab switch | manual smoke | Open `/trade/[id]`, click Limit tab, click DCA tab — visual content shift must not exceed 20px. CLS in Speed Insights must remain < 0.1. | manual-only |

### Sampling Rate

- **Per task commit:** `npm run check && npm test -- --run [scoped-files]` — fast path (~30s).
- **Per wave merge:** `npm run check && npm test -- --run && npm run lint` — full suite.
- **Phase gate:** Full suite green + all phase-exit greps pass + Speed Insights p75 captured.

### Wave 0 Gaps

- [ ] `tests/fixtures/io-perspective-violation.ts` — minimal fixture file with 4 raw property reads to verify the ESLint rule fires.
- [ ] `tests/lib/components/orders/MarketOrder.test.ts` — new test file for D-05 inline error rendering.
- [ ] `src/lib/stores/{transactionShared,deployTransactionStore,marketTakeStore,approvalStore,partialFillDetection}.ts` — TRADE-02 split target files.
- [ ] `scripts/codemod-trade-01.ts` — one-shot codemod harness (delete after merge).
- [ ] `.gitignore` entry for `stats.html`.
- [ ] `npm install --save-dev ts-morph rollup-plugin-visualizer`.

---

## Security Domain

This phase is a refactor of existing trading code paths; no new trust boundaries are introduced. Security guardrails to preserve:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (preserve) | Two existing auth paths (wagmi direct + Dynamic embedded) — TRADE-02 split must not change `walletService.ts` integration; new `marketTakeStore.ts` continues to call `getSignerAddress()` from walletService. |
| V3 Session Management | no (touched by Phase 3 / SEC-03) | — |
| V4 Access Control | yes (preserve) | `validateOrderbookAddress` (currently in transaction.ts) MUST move to `transactionShared.ts` and continue to be called BEFORE any approval or take-order tx. The `network.trustedOrderbooks` allowlist is enforced before sending to chain — Phase 2 must not bypass this. |
| V5 Input Validation | yes | Pre-flight multicall result validation: never trust SDK-returned data without checking `.error` and `.success` fields. Sanitize string inputs before logging (already handled by Sentry beforeSend from Plan 01-04). |
| V6 Cryptography | no | No new crypto. Existing `crypto.subtle.digest` for transcript hashing stays unchanged. |
| V7 Error Handling | yes | OBS-03 contract preservation — every new failure path emits via `failWith` (D-06). `console.error` JSON line continues to redact via Sentry beforeSend. |

### Known Threat Patterns for SvelteKit + Rain orderbook + multi-tx UI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pre-flight reveals stale orderbook → user sees ghost order they can't take | Information Disclosure | D-03 SILENT pre-flight: result is consumed by retry logic, not surfaced to user. The user only sees the final inline error if all retries exhaust (D-05 copy). |
| Pre-flight result trust → SDK returns malformed data → take-order calldata corrupted | Tampering | All SDK calls return `WasmEncodedResult` with explicit `error` + `value`; check `.error` first, never use `.value` without null guard. Pattern from existing code (orderDeployment.ts:188-193). |
| Bundle visualizer leaks source paths | Information Disclosure | `stats.html` is .gitignore'd; never commit. Production deploys do NOT include the visualizer (it's `devDependency` only). |
| ESLint disable abuse | Tampering (process) | Phase-exit grep for `eslint-disable.*no-restricted-syntax` count = 0; any required disable ships in follow-up PR with reviewer attestation. |
| Circular import re-introduction in TRADE-02 split | Tampering | Phase-exit grep for cross-direction imports between `marketOrderExecution.ts` ↔ `marketTakeStore.ts`. |
| Real-money rollout: state-machine split changes order of write to vault | Denial of Service / data inconsistency | TRADE-02 PR-2 preserves `pollAndFinalizeTakeOrders` as a single sequential function; partial-fill detection consumes its result post-completion (Pitfall 6 mitigation). |
| Take-order fails silently after pre-flight rejection | Denial of Service (UX) | `failWith` ensures every rejection path emits to Sentry; phase-exit grep `failWith(` count ≥ 12. |

---

## Phase-Exit Grep Gates

(See "Phase 2-Phase Exit Grep Gates" subsection above — comprehensive list.)

**Summary baseline targets:**

| Gate | Phase 1 baseline | Phase 2 expected | Source of growth |
|------|------------------|------------------|------------------|
| `failWith(` in marketOrderExecution.ts | 9 | ≥ 12 | TRADE-03 adds preflight_order_vanished, preflight_chain_unreachable, auto_retry_exhausted |
| svelte-check errors | 7 (4 in transaction.ts + 3 in rpcMetrics test) | ≤ 3 (rpcMetrics test only) | TRADE-02 PR-5 fixes orderDeployment return type (clears 4 transaction.ts errors) |
| Raw IO property reads outside allowlist | 57 | 0 | TRADE-01 codemod + ESLint rule |
| `eslint-disable.*no-restricted-syntax` | 0 | 0 | TRADE-01 hard rule (any disable triggers code review) |
| Tests passing | 447 / 1 skipped | ≥ 460 / 1 skipped | TRADE-04 ≥ 16 new tests; TRADE-03 ≥ 3 new tests; TRADE-02 ≥ 4 new helper tests |
| transaction.ts line count | 2373 | ≤ 60 (façade) | TRADE-02 split |
| New state-machine modules in src/lib/stores | 1 (transaction.ts) | 6 (5 new + façade) | TRADE-02 split |

---

## Landmines & Pitfalls

(Beyond the Common Pitfalls section above.)

**1. The 88 → 134 hit count drift.** CONTEXT.md captured 88 hits at planning time. Re-grep at research time = 134 hits, of which 57 are property reads. Drift comes from (a) new test fixtures added in Phase 1 (`tests/lib/services/marketOrderExecution.test.ts` got 4 hits during OBS-03), (b) transaction.ts naturally accreting more hits (24 in transaction.ts is dominant). Planner must re-grep at codemod-execution time and adjust. The 17-file count is unchanged.

**2. Hidden coupling that 89571b3 didn't sever.** Confirmed by grep: `transaction.ts` does NOT import from `marketOrderExecution.ts` (cycle severed). BUT `marketOrderExecution.ts` imports `transactionStore` (value) AND `TransactionStatus` (enum). And the 3 methods called on `transactionStore` (`preloadAggregatedTakeOrdersCalldata`, `handleAggregatedTakeOrdersCalldata`, `handleOracleOrders`) are ALL in the market-take state machine. The TRADE-02 split that hoists these methods into `marketTakeStore.ts` removes the last lexical edge — and the TransactionStatus enum lives in `transactionShared.ts` (a leaf module imported by both sides). This is the exact structural fix required.

**3. Multicall3 ABI / chain support edge cases on Base 8453.** Multicall3 IS deployed [VERIFIED via web search: deployments.json on EthereumClassicDAO/multicall3 + multicall3.com lists Base 8453]. Wagmi's `readContracts` already uses it; `RaindexClient.getOrderQuotesBatch` uses it internally. Gas-limit safety: each pre-flight is ≤10 orders (typical depth chart shows top-10 best); aggregated multicall fits in a single `eth_call` well below Base's gas limits. No edge case to design around.

**4. TanStack Query default `staleTime: Infinity` semantics.** [VERIFIED in CLAUDE.md and confirmed in `src/lib/queries/*.ts`.] PERF-01 query-waterfall reorganization MUST respect this — parallelization or prefetching is allowed; reducing staleTime is not. The trade page's polling (`refetchInterval: 15_000` in `orderbook.ts:74`) is the freshness mechanism, NOT staleTime.

**5. Vercel Speed Insights consent gating biases p75.** Speed Insights only collects from sessions that accepted cookie consent (per `+layout.svelte:30` `injectSpeedInsights` inside `onAnalyticsAccepted`). If consent rate is 60%, the 40% who declined are NOT counted in p75. **Action for planner:** before setting the 2.5s target in 02-RUNBOOK.md, capture the consent rate (visible in PostHog or via approximate Vercel session-count vs analytics-event-count comparison). Document the consent-rate caveat alongside the p75 number.

**6. Bundle prune temptation list.** Document which deps are NEGOTIABLE vs NON-NEGOTIABLE before the prune wave starts:
- **NON-NEGOTIABLE:** `@rainlanguage/orderbook` (orderbook contract surface), `@rainlanguage/float`, `@wagmi/core`, `@wagmi/connectors`, `viem`, `ethers`, `@dynamic-labs/ethereum`, `@dynamic-labs/sdk-react-core` (and transitively react/react-dom — embedded wallet flow), `@sentry/sveltekit`, `pino`, `@vercel/speed-insights`, `@vercel/analytics`, `posthog-js`, `lightweight-charts` (charts; lazy-load eligible but cannot remove), `flowbite-svelte-icons` (used throughout UI), `@tanstack/svelte-query`, `svelte-wagmi`.
- **NEGOTIABLE — likely removable:** `jspdf`, `jspdf-autotable` (0 imports in src/ — verified by grep).
- **NEGOTIABLE — review for usage:** `@scalar/api-reference` (only used in /docs?), `qrcode` (deposit modal — used; keep), `pinata-web3` (where used?), `ajv` (where used?), `cbor-web` (where used?), `pako` (where used?), `nyse-holidays` (market hours — keep), `highlight.js` (RainlangConfirmationModal lazy — keep but verify lazy chunk).

Visualizer pass tells the truth.

**7. Real-money rollout safety on TRADE-02 split.** PR-2 (`marketTakeStore` extraction) is the highest-risk PR in this phase: it changes the file path of code that submits actual transactions. The façade pattern + atomic PR-by-PR shape is the safety net; svelte-check + tests at each commit prevents shipping a broken build. **Plan-level recommendation:** between PR-2 land and the next deploy, monitor Sentry for any new `caught_exception` patterns in `marketOrderExecution.ts` that didn't fire before (Phase 1 OBS-03 transcripts give the baseline error shape).

**8. The `*UpTo` precision tolerance is load-bearing.** [VERIFIED comment at marketOrderExecution.ts:244-247 still accurate.] Other call sites: lines 354-365 select `mode = 'spendUpTo' | 'buyUpTo'` based on side+inputMode. Any TRADE-04 refactor that touches this MUST preserve the SDK mode selection logic.

**9. `RaindexClient.getOrderQuotesBatch` shape reference.** [VERIFIED locally at `node_modules/@rainlanguage/orderbook/dist/esm/index.d.ts`.] Returns `Promise<WasmEncodedResult<RaindexOrderQuote[][]>>` — outer array per order, inner array per IO-pair. `RaindexOrderQuote.success: boolean`, `data?.formattedMaxOutput: string`, `data?.formattedRatio: string`. Pinning to alpha.231 ensures this stays stable; do NOT bump @rainlanguage/orderbook during Phase 2.

**10. ESLint flat config + Svelte parser interaction.** The current `eslint.config.js` already configures `parserOptions: { parser: ts.parser }` for `.svelte` files. The `no-restricted-syntax` selector should fire on member expressions inside `<script lang="ts">` blocks correctly. **Verify in PR-1 of TRADE-01 by adding a deliberate violation in MarketOrder.svelte and confirming `npm run lint` reports it.**

---

## Open Questions for Planner

1. **PERF-01 baseline pull (BLOCKING).** What is the current p75 LCP for `/trade/[id]` over a 7-day window in the production Vercel Speed Insights dashboard? Researcher could not capture this; it requires authenticated user access to `https://vercel.com/st-0x/st0x/observability/speed-insights`. Without this number, the planner cannot determine whether PERF-01 is "preserve current sub-2.5s baseline" or "close a gap to 2.5s."

2. **Consent-rate baseline.** What's the cookie-consent acceptance rate in production? Affects p75 sample-size confidence. Likely available from the PostHog `analytics_consent_accepted` event or Vercel Analytics events vs total session count.

3. **TRADE-02 PR-1 façade compatibility.** Some UI components (per CONTEXT) may directly import `TransactionStatus` from `'$lib/stores/transaction'` rather than via the default export. Verify by re-grep at PR-1 time:
   ```
   grep -rn "import.*TransactionStatus.*from.*\\\$lib/stores/transaction" src/
   ```
   If any direct enum imports exist, the façade must export `TransactionStatus` explicitly (recommended pattern in §"Architecture Patterns").

4. **Pre-flight retry budget on Base 8453.** Each pre-flight = 1 multicall = 1 RPC call. Base RPC cost is bounded but depends on the loaded balanced client pool; planner should verify that 2 walks × N orders × 1 multicall each doesn't blow the rate limits on a slow day. Reasonable; flagging for planner attention.

5. **Should the codemod handle `.svelte` files automatically or are 19 hand-edits acceptable?** Researcher recommends hand-edit (cheaper than building a Svelte-script-block extraction step); planner can override.

6. **`RaindexOrders` constructor — does it accept `RaindexOrder[]` directly?** [VERIFIED in SDK types: `class RaindexOrders { push(order: RaindexOrder): void; readonly items: RaindexOrder[] }`] — must be `push`-built rather than constructed from an array literal. Planner pattern in TRADE-03 wiring.

7. **Should `partialFillDetection.ts` (TRADE-02 PR-5) export a hook-style or function-style API?** Rest of the codebase uses Svelte stores + functions; recommend function-style `detectPartialFill(params): MarketOrderSummary` for consistency.

8. **Risk tolerance for PR-2 (marketTakeStore extraction) — does the team want a 24-48h soak window before subsequent PRs land?** Recommended given real-money exposure; planner decides cadence.

---

## Sources

### Primary (HIGH confidence — directly verified in repo or via npm)

- `src/lib/types/orderPerspective.ts` (read in full; helpers + types verified)
- `src/lib/utils/marketOrderFill.ts` (read in full; 84 lines)
- `src/lib/services/marketOrderExecution.ts` (read in full; 559 lines)
- `src/lib/stores/transaction.ts` (read selectively across 2373 lines: header imports, TransactionStatus enum, deploy/take handlers, return-statement contract)
- `src/lib/utils/orderbook.ts` (ProcessedQuote interface declaration verified at lines 73-82)
- `src/lib/api/orders.ts` (read in full; 274 lines; `convertApiOrderToProcessedQuote` populates the IO-perspective fields)
- `src/lib/clients/raindex.ts` (read first 60 lines; settings YAML + Base 8453 chain config + Multicall RPC discussion in comments)
- `src/lib/services/observability/captureTakeOrderFailure.ts` (read in full; TakeOrderTranscript shape and TakeOrderFailureReason union)
- `src/routes/(main)/trade/[id]/+page.svelte` (first 320 lines + import surface; query-waterfall structure)
- `src/lib/components/orders/MarketOrder.svelte` (first 100 lines; ORDERBOOK_MAX_STALENESS_MS, slippage UI, host of TRADE-03 D-05)
- `src/routes/(main)/dashboard/+page.svelte` (multicall pattern at lines 340-433)
- `eslint.config.js` (read in full; flat config already configured for ts + svelte parsers)
- `package.json` (dependencies enumerated)
- `node_modules/@rainlanguage/orderbook/dist/esm/index.d.ts` (RaindexClient + getOrderQuotesBatch + RaindexOrderQuote shapes verified)
- `tests/lib/utils/marketOrderFill.test.ts` (all 19 test names enumerated)
- `tests/lib/services/marketOrderExecution.test.ts` (1 test currently — excludeTakerOwnedQuotes)
- `git show 89571b3` (full commit message + 5-file diff statistics)
- `npm view ts-morph version` → 28.0.0
- `npm view rollup-plugin-visualizer version` → 7.0.1
- `npm view jscodeshift version` → 17.3.0
- `npm view @typescript-eslint/utils version` → 8.59.1
- `npm view @rainlanguage/orderbook version` → 0.0.1-alpha.232 (currently using alpha.231)
- `npm run check` output — 7 baseline errors confirmed (4 transaction.ts + 3 rpcMetrics test)
- Re-grep verifications — IO-perspective hit counts (134 raw / 57 reads / 17 files)

### Secondary (MEDIUM confidence — official docs via WebSearch, cross-verified)

- [ESLint no-restricted-syntax rule](https://eslint.org/docs/latest/rules/no-restricted-syntax) — official docs, AST selector pattern
- [ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rules) — flat config support
- [rollup-plugin-visualizer GitHub](https://github.com/btd/rollup-plugin-visualizer) — SvelteKit `emitFile: true` recommendation
- [vite-bundle-visualizer npm](https://www.npmjs.com/package/vite-bundle-visualizer) — confirmed wrapper around rollup-plugin-visualizer; not maintained recently
- [ts-morph GitHub](https://github.com/dsherret/ts-morph) — Project API + getDescendantsOfKind verified
- [jscodeshift README](https://github.com/facebook/jscodeshift) — comparison with ts-morph
- [SvelteKit Performance docs](https://svelte.dev/docs/kit/performance) — lazy-loading + dynamic-import patterns
- [Svelte 4 await block + svelte:component](https://furic.medium.com/efficient-lazy-loading-in-svelte-a-practical-guide-for-svelte-4-and-svelte-5-runes-e8ed6fadcb9d) — pattern verified
- [Multicall3 deployments registry](https://github.com/mds1/multicall3) — Base 8453 confirmed deployed
- [BaseScan Multicall3 contract](https://basescan.org/address/0xca11bde05977b3631167028862be2a173976ca11) — verified deployed

### Tertiary (LOW confidence — search hits not directly verified for currency)

- jspdf/jspdf-autotable bundle-size estimate (~150-250KB) — based on common ecosystem reporting; planner should confirm via visualizer pass.
- Dynamic Labs SDK transitive size — based on package metadata + react-dom presence; planner should confirm via visualizer pass.

---

## Assumptions Log

> All claims with `[ASSUMED]` tags consolidated here for planner review. Empty assumption log = all claims verified or cited.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel Speed Insights p75 LCP for `/trade/[id]` is "available but unknown" | PERF-01 | The p75 baseline must be captured before the planner can scope PERF-01 work. Without it, "preserve baseline" vs "close gap" decisions can't be made. |
| A2 | Cookie consent acceptance rate is unknown but assumed >50% in production (typical) | Pitfall 4 / PERF-01 | If consent rate is <30%, the p75 sample is too biased for confidence; PERF-01 success criterion may need adjustment. |
| A3 | The WASM SDK's `getOrderQuotesBatch` actually fires a single RPC multicall (per its JSDoc) and does not internally fan out to N sequential calls | TRADE-03 mechanics | If the SDK fans out, pre-flight cost grows linearly — still OK for ≤10 orders but worth verifying with a dev-tools network trace during the TRADE-03 plan. |
| A4 | The 4 svelte-check errors at transaction.ts:664/686/708/2346 will be cleanly fixed by adding an explicit return-type annotation to `getDcaDeploymentArgs`/etc. in `orderDeployment.ts` | TRADE-02 PR-5 | If the upstream SDK function genuinely returns `unknown` (not just under-typed), a runtime validation step may be needed instead of a type assertion. Reading orderDeployment.ts confirmed return uses `.value` from `WasmEncodedResult<unknown>` — type-narrowing assertion is sufficient. LOW risk. |
| A5 | `npm install --save-dev ts-morph rollup-plugin-visualizer` does not introduce upstream version conflicts | New dependencies | Tested only by version probe; planner should run actual install in PR-1 of TRADE-01 / Wave 7 of PERF-01. |

---

## Environment Availability

> Phase 2 is purely code/config — no new external dependencies introduced.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 | All builds (Vercel CI default) | ✓ | per package.json engines | local Node 24 fails on adapter-vercel post-build (pre-existing per Phase 1 SUMMARY) |
| @rainlanguage/orderbook | TRADE-03 pre-flight (getOrderQuotesBatch) | ✓ | alpha.231 (installed) | none — orderbook is non-negotiable |
| @sentry/sveltekit | TRADE-03 expanded failure paths via existing failWith | ✓ | 10.50.0 (installed) | dual-sink fallback to console.error already in place |
| Multicall3 on Base 8453 | TRADE-03 (transitively via SDK) | ✓ | canonical 0xcA11bde05977b3631167028862bE2a173976CA11 | none — already proven via wagmi readContracts |
| Vercel Speed Insights | PERF-01 baseline | ✓ | injecting since 2025-07-21 | none — without baseline, target validation fails |
| ts-morph | TRADE-01 codemod | ✗ (not installed yet) | 28.0.0 (npm head) | hand-edit + sed regex (less safe; not recommended) |
| rollup-plugin-visualizer | PERF-01 bundle audit | ✗ (not installed yet) | 7.0.1 (npm head) | npm-package-size-tracker / manual inspection (less actionable) |

**Missing dependencies with no fallback:** None — Phase 2 introduces only `devDependencies` which are install-on-need.

**Missing dependencies with fallback:** `ts-morph` and `rollup-plugin-visualizer` are needed; both have viable manual fallbacks but the automated paths are recommended.

---

## RESEARCH COMPLETE

Phase 2 backbone refactor mapped: 5 REQ-IDs covered (TRADE-01..04 + PERF-01); circular import already half-severed by 89571b3 — TRADE-02 closes the remaining direction; pre-flight is a 30-line wrapper around RaindexClient.getOrderQuotesBatch (Multicall3 internally, no hand-rolled ABI); 4 svelte-check errors need explicit return-type fix (NOT auto-cleared by split); IO-perspective hit count drifted from 88 → 134 raw / 57 property reads — codemod surface confirmed; PERF-01 BLOCKING on baseline LCP pull from Vercel Speed Insights dashboard before plan finalizes.
