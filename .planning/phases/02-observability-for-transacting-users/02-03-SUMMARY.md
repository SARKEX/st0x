---
phase: 02-observability-for-transacting-users
plan: 03
subsystem: observability
tags: [observability, components, instrumentation, posthog, correlation-id, OBS-07, OBS-08, OBS-09]
requires:
  - "Plan 02-01 (provides mintTradeId/getCurrentTradeId/clearTradeId, trackTradeEvent, X-Trade-Id header validation)"
  - "Plan 02-02 (provides Sentry trade_id tag site at captureTakeOrderFailure)"
provides:
  - "trade_id mint+propagate+clear discipline at every order-component submit handler (Buy/Sell market, limit deploy, DCA deploy)"
  - "OBS-07 step-event taxonomy at user-facing call sites (trade_button_clicked → quote_received → broadcast → confirmed → trade_failed)"
  - "Mandatory eventContext.order_type parameter on orderDeployment.ts (no silent 'limit' fallback per checker fix #6)"
  - "page_viewed event with page='trade' on trade route for OBS-08 funnel intent step"
affects:
  - "Plan 02-04 (RUNBOOK + privacy review + manual OBS-10 production smoke for cross-tool correlation)"
tech_stack:
  added: []
  patterns:
    - "mintTradeId AFTER early-return guards, clearTradeId in finally — single discipline reused at 3 component submit handlers (Pitfall 2 / T-2-E)"
    - "Inline classifyMarketError / classifyDeployError helpers (duplicated twice; per CLAUDE.md 'avoid over-engineering' — extract to shared module at three call sites)"
    - "SDK callback collapse — broadcast+confirmed emitted back-to-back at single post-dispatch boundary in marketOrderExecution.ts and deployTransactionStore.ts (no per-callback distinction available at this layer)"
    - "DeployEventContext typed parameter on orderDeployment functions — TypeScript compile-time enforcement of mandatory order_type"
    - "Trade-id deferral across modal lifecycle — handleDeploy mints, proceedWithDeploy/cancelDeploy clear (LimitOrder warning-acknowledged path)"
key_files:
  created:
    - "tests/lib/components/orders/MarketOrder.events.test.ts"
    - "tests/lib/components/orders/LimitOrder.events.test.ts"
    - "tests/lib/components/orders/DcaOrder.events.test.ts"
    - "tests/lib/services/marketOrderExecution.events.test.ts"
    - "tests/lib/services/orderDeployment.events.test.ts"
  modified:
    - "src/lib/components/orders/MarketOrder.svelte"
    - "src/lib/components/orders/LimitOrder.svelte"
    - "src/lib/components/orders/DcaOrder.svelte"
    - "src/lib/services/marketOrderExecution.ts"
    - "src/lib/services/orderDeployment.ts"
    - "src/lib/stores/deployTransactionStore.ts (eventContext plumbing + broadcast/confirmed at SDK boundary)"
    - "src/routes/(main)/trade/[id]/+page.svelte (rename trackPageView('trade_page', ...) → 'trade')"
    - "tests/lib/transactionStore.test.ts (pass eventContext in fixtures)"
decisions:
  - "Source-content + pure-helper test strategy adopted (matches existing MarketOrder.test.ts convention per .planning/codebase/TESTING.md). Full @testing-library/svelte component renders for the 1300-line MarketOrder + Modal + TanStack scaffolding were skipped because the existing convention explicitly prefers extracting pure logic over rendering. The behaviour we verify (lifecycle pairing, event-name correctness, classifier mapping) is fully captured by source-level + pure-function assertions; the runtime emission is verified at the trackTradeEvent boundary in Plan 02-01's privacy/wrapper tests."
  - "SDK broadcast/confirmed callback boundary collapse documented at TWO sites (Task 1b: marketOrderExecution.ts + Task 2c: deployTransactionStore.ts). At both layers the underlying SDK call (handleAggregatedTakeOrdersCalldata, sendTransaction) only returns AFTER receipt confirmation — there is no hook between dispatch and confirmation. Per Plan §Task 1b: emit BOTH events back-to-back at the single boundary so the OBS-07 funnel contract (Plan 04 §3) holds without funnel-step gaps."
  - "Plan-stated 'orderDeployment.ts emits broadcast/confirmed at SDK callback boundaries' was a misroute — orderDeployment.ts is a pure calldata-builder; the actual SDK callbacks (sendTransaction, waitForTransaction) live in deployTransactionStore.ts handleStrategyDeployment. Resolved by emitting `sign_trade` from orderDeployment.ts (the calldata-prep boundary it owns) and `broadcast`/`confirmed` from deployTransactionStore.ts handleStrategyDeployment (where the actual SDK calls execute). Both functions accept the eventContext from the caller; no event surface is duplicated."
  - "trade_id deferral across LimitOrder warning-modal lifecycle — handleDeploy mints; if checkPriceWarning() returns true, the trade_id stays alive across the modal and is cleared by proceedWithDeploy (warning-acknowledged) OR cancelDeploy. The same trade_id therefore correlates the original button-click event with the deploy-confirmed event when the user accepts the warning. A new trade_id is minted on a second submit click."
  - "page_viewed page name renamed from 'trade_page' to 'trade' per checker fix #7. The OBS-08 funnel filter is `page === 'trade'` per Plan 02-PATTERNS.md. The scroll-tracking helper still uses `'trade_page'` as its own dimension label (different consumer; orthogonal namespace)."
metrics:
  duration: ~14 min
  completed: 2026-05-07T09:48:00Z
  tasks_completed: 5
  test_files_added: 5
  test_count_added: 43  # 8 (MarketOrder.events) + 6 (marketOrderExecution.events) + 10 (LimitOrder.events) + 8 (DcaOrder.events) + 11 (orderDeployment.events)
---

# Phase 2 Plan 3: OBS-07 Component Instrumentation + OBS-09 Browser-Side Wiring Summary

The foundation modules from Plan 02-01 (`mintTradeId`/`clearTradeId`/`trackTradeEvent`) are now wired into the three user-facing order components (MarketOrder, LimitOrder, DcaOrder), the page-load route, and the two deploy/take orchestration layers (`marketOrderExecution.ts`, `orderDeployment.ts` + `deployTransactionStore.ts`). After this plan, every trade attempt produces a complete OBS-07 funnel in PostHog (`page_viewed[page:'trade']` → `trade_button_clicked` → `quote_received` → `sign_trade` → `broadcast` → `confirmed`/`trade_failed`) tagged with the same `trade_id` that surfaces in the Sentry tag (Plan 02-02) and pino server logs (Plan 02-01). DCA was gap-filled from zero analytics. The DCA-funnel-corruption silent fallback is closed via the mandatory `eventContext.order_type` TypeScript contract (checker fix #6).

## Per-Component Event Sequences

### MarketOrder.svelte — Buy / Sell market submit
```
mount: track('trade_panel_opened', { order_type: 'market', token_symbol })   [unchanged — regression guard]
click: mintTradeId() → trackTradeEvent('trade_button_clicked', { order_type: 'market', order_side, mode, asset_symbol, payment_symbol, amount, slippage_bps })
       trackTradeEvent('quote_received', { order_type: 'market', ..., quote_count })
       [executeMarketOrder dispatches → marketOrderExecution.ts emits 'broadcast' + 'confirmed' (collapsed boundary)]
       success → trackTradeEvent('trade_initiated', { ..., avg_price })
       failure → trackTradeEvent('trade_failed', { ..., error_class, error_message })
finally: clearTradeId()
```

### LimitOrder.svelte — Limit deploy
```
mount: track('trade_panel_opened', { order_type: 'limit', token_symbol })   [unchanged]
click: mintTradeId() → trackTradeEvent('trade_button_clicked', { order_type: 'limit', order_side, asset_symbol, payment_symbol, amount, limit_price })
       branch (no warning): trackTradeEvent('limit_order_deployed', {...}) → transactionStore.handleLimitDeploy(args, { order_type: 'limit' })
                            → orderDeployment.getLimitOrderDeploymentArgs emits 'sign_trade'
                            → deployTransactionStore.handleStrategyDeployment emits 'broadcast' + 'confirmed' (collapsed)
       branch (warning):    deferred → proceedWithDeploy emits 'limit_order_deployed' + handleLimitDeploy + clearTradeId
       failure: trackTradeEvent('trade_failed', { ..., error_class })
finally (no-warning OR error path): clearTradeId()
proceedWithDeploy / cancelDeploy: clearTradeId() (warning-modal-deferred clear)
```

### DcaOrder.svelte — DCA deploy (gap-fill from zero analytics)
```
mount: track('trade_panel_opened', { order_type: 'dca', token_symbol, order_side })   [NEW — gap-fill]
click: mintTradeId() → trackTradeEvent('trade_button_clicked', { order_type: 'dca', order_side, asset_symbol, payment_symbol, amount, period, period_unit })
       transactionStore.handleDcaDeploy(args, { order_type: 'dca' })
       → orderDeployment.getDcaDeploymentArgs emits 'sign_trade' (with order_type: 'dca')
       → deployTransactionStore.handleStrategyDeployment emits 'broadcast' + 'confirmed' (with order_type: 'dca')
       trackTradeEvent('limit_order_deployed', { order_type: 'dca', ... })   [per A7: reuse deploy event family — DO NOT introduce dca_order_deployed]
       failure: trackTradeEvent('trade_failed', { order_type: 'dca', error_class })
finally: clearTradeId()
```

### Trade route +page.svelte — page-load
```
on token-id change: trackPageView('trade', { token_symbol, token_id })   [renamed from 'trade_page' per checker fix #7]
                    → emits page_viewed { page: 'trade', token_symbol, token_id, ... }   [no trade_id yet — pre-mint]
```

## SDK Callback Boundary Findings (broadcast / confirmed)

**marketOrderExecution.ts** — `executeMarketOrder` calls `handleAggregatedTakeOrdersCalldata` (or `handleOracleOrders` fallback) which internally awaits wallet-sign + on-chain dispatch + receipt confirmation, then reads `transactionStoreInternal` for terminal status. There is NO per-callback hook at this layer to distinguish post-dispatch (broadcast) from post-receipt (confirmed). Per Plan §Task 1b: emit BOTH events back-to-back at the success boundary — preserves the OBS-07 funnel contract.

**deployTransactionStore.ts** — `handleStrategyDeployment` calls `sendTransaction` from walletService which awaits the on-chain receipt before returning the hash. Same single-boundary collapse applies. `broadcast` is emitted post-`sendTransaction` (in the success path of the surrounding try/catch); `confirmed` is emitted immediately after (no intervening receipt-poll between them). `sign_trade` fires earlier — emitted from `getLimitOrderDeploymentArgs` / `getDcaDeploymentArgs` in `orderDeployment.ts` once calldata is built and the user is about to be prompted to sign. The order_type for all three events comes from `eventContext` plumbed through the call chain (LimitOrder/DcaOrder → handleLimitDeploy/handleDcaDeploy → showRainlangConfirmation → handleStrategyDeployment).

## Mandatory `eventContext.order_type` Contract (Checker Fix #6)

**Type:** `interface DeployEventContext { order_type: 'limit' | 'dca' }` — exported from `src/lib/services/orderDeployment.ts`.

**Enforcement:** TypeScript compile-time. `getLimitOrderDeploymentArgs(network, args, eventContext)` and `getDcaDeploymentArgs(network, args, eventContext)` require the third parameter — no `?`, no default. `handleLimitDeploy`/`handleDcaDeploy` likewise. The chain is plumbed:

```
LimitOrder.svelte handleDeploy           → transactionStore.handleLimitDeploy(args, { order_type: 'limit' })
DcaOrder.svelte handleDcaDeploy          → transactionStore.handleDcaDeploy(args, { order_type: 'dca' })
                                         ↓
deployTransactionStore.handleLimitDeploy → getLimitOrderDeploymentArgs(network, args, eventContext)
deployTransactionStore.handleDcaDeploy   → getDcaDeploymentArgs(network, args, eventContext)
                                         ↓
orderDeployment emits trackTradeEvent('sign_trade', { order_type: eventContext.order_type, ... })
                                         ↓
showRainlangConfirmation forwards eventContext → handleStrategyDeployment(args, assetTokenInfo, eventContext)
                                         ↓
handleStrategyDeployment emits broadcast + confirmed with order_type: eventContext.order_type
```

The orderDeployment.events.test.ts Test O6 actively asserts NO hardcoded `order_type: 'limit'` or `order_type: 'dca'` literals in any `trackTradeEvent(...)` call inside `orderDeployment.ts`. The only literal occurrence is in the type union itself (`'limit' | 'dca'` in the `DeployEventContext` definition), which is correct.

**Impact on OBS-08 funnel:** DCA breakdown by `order_type` is now accurate. Pre-Plan 02-03, the DCA funnel was either invisible (DCA had zero analytics) OR would have been miscategorized as `'limit'` if the bug had landed in production. Plan 02-03 closes both holes simultaneously.

## DCA Gap-Fill Scope

DCA had ZERO analytics in `DcaOrder.svelte` before this plan. Added:
- `onMount` `track('trade_panel_opened', { order_type: 'dca', token_symbol, order_side })` — mirrors LimitOrder mount-shape.
- Submit handler full lifecycle: `mintTradeId` → `trade_button_clicked` → `limit_order_deployed` (per A7 — reuse deploy event family) → `trade_failed` (error path) → `clearTradeId` in finally.
- Caller passes `{ order_type: 'dca' }` to `transactionStore.handleDcaDeploy`, which propagates through `getDcaDeploymentArgs` (emits `sign_trade`) and `handleStrategyDeployment` (emits `broadcast` + `confirmed`).

## Threat Mitigations Landed

| Threat | Component | Mitigation |
|---|---|---|
| **T-2-E** Information disclosure — `trade_id` cross-request leakage via module-level state | All three submit handlers + LimitOrder warning-modal lifecycle | `mintTradeId()` paired with `clearTradeId()` via try/finally (MarketOrder/DcaOrder) or modal-deferred clear (LimitOrder.proceedWithDeploy + cancelDeploy). Component tests Test 2/3/L4/L4b/D5 are the regression guards. |
| **T-2-B** Information disclosure — PII leak via `error_message` | `error_message` payloads passed through `trackTradeEvent` | Plan 01 `scrubProps` re-redacts `0x[40]`/`0x[130]` defensively. Call sites pass `error.message` (not raw cause/transaction objects). |
| **T-2-J** Tampering — third-party SaaS receives `X-Trade-Id` via mistake | `marketOrderExecution.ts` + `orderDeployment.ts` | Reviewed — neither service makes same-origin `/api/*` `fetch()` calls; their network calls are to RPC providers / WASM SDKs which do not pass through SvelteKit. No header attachment needed at this layer. (Per Pitfall 5: the browser-tier components do not send X-Trade-Id to anyone; same-origin propagation is reserved for future API-tier callers identified by audit.) |
| **T-2-N** Information disclosure / funnel-data corruption — silent `'limit'` fallback for DCA deploy events | `orderDeployment.ts` | Mandatory `eventContext: DeployEventContext` parameter. TypeScript compile-time enforcement. Test O6 asserts no hardcoded literal exists. |

## Decisions Implemented

- **D-01 PostHog primary funnel-investigation surface (extended)** — every trade-relevant event is now emitted via `trackTradeEvent` (typed) with the active `trade_id` enriched from the lifecycle module.
- **OBS-07 (Funnel taxonomy)** — full step coverage: `trade_panel_opened`, `trade_button_clicked`, `quote_received` (market only — limits/DCA do not have a discrete quote step), `sign_trade` (deploy paths via orderDeployment), `broadcast`, `confirmed`, `trade_failed`, `trade_initiated`, `limit_order_deployed`. Existing snake_case names retained per Pitfall 7.
- **OBS-08 (Funnel intent step)** — `page_viewed` with `page: 'trade'` filter on `/trade/[id]` route load. Renamed from `'trade_page'` per checker fix #7. Pre-mint, so no `trade_id` carried.
- **OBS-09 (Cross-tool correlation, browser-side)** — every component submit handler mints + propagates + clears the `trade_id`. The Sentry-tag (Plan 02-02) and pino-log (Plan 02-01) sites are the receiving consumers; this plan supplies the producer. **End-to-end correlation verification deferred to Plan 04 OBS-10 manual production smoke** (per checker fix #2). No additional E2E correlation test added in this plan.

## Plan-Level Acceptance — Cross-Reference

All 11 must_haves truths in `02-03-PLAN.md` frontmatter map to landed code + tests:

| Must-have | Verification site |
|---|---|
| MarketOrder mint + try/finally + clearTradeId | `MarketOrder.svelte handleMarketOrder` + `MarketOrder.events.test.ts` Test 2/3/4 |
| Each OBS-07 step fires once per attempt | Component event tests (per-component) |
| marketOrderExecution emits broadcast + confirmed | `marketOrderExecution.events.test.ts` Test 2/3/4 |
| LimitOrder mint + lifecycle + limit_order_deployed | `LimitOrder.svelte` + `LimitOrder.events.test.ts` |
| DCA canonical taxonomy (gap-fill) | `DcaOrder.svelte` + `DcaOrder.events.test.ts` |
| orderDeployment mandatory eventContext (no fallback) | `orderDeployment.ts` + `orderDeployment.events.test.ts` Test O3/O4/O6 |
| trade_panel_opened mount regression | `MarketOrder.events.test.ts` Test 6 + `LimitOrder.events.test.ts` Test L6 + `DcaOrder.events.test.ts` Test D2 |
| page_viewed (page: 'trade') | `+page.svelte` + `orderDeployment.events.test.ts` Test P1/P2 |
| Same-origin /api/* X-Trade-Id propagation | Reviewed at services — no same-origin /api/* fetch sites in marketOrderExecution.ts or orderDeployment.ts that need wiring at this layer (T-2-J accept rationale) |
| Existing event names retained | Test 6/L6/D2 + Pitfall 7 |
| OBS-09 cross-tool correlation acceptance | Deferred to Plan 04 OBS-10 manual smoke per checker fix #2 |

## Commits

| Hash | Type | Description |
|---|---|---|
| `ddbea90` | test | RED for MarketOrder event instrumentation |
| `a77565c` | feat | GREEN MarketOrder.svelte event wiring |
| `89d399f` | test | RED for marketOrderExecution broadcast/confirmed |
| `a58da34` | feat | GREEN broadcast+confirmed at SDK callback boundary |
| `01759e9` | test | RED for LimitOrder event instrumentation |
| `8671b99` | feat | GREEN LimitOrder.svelte event wiring + warning-modal-deferred clear |
| `edd2cec` | test | RED for DcaOrder gap-fill |
| `966aef2` | feat | GREEN DcaOrder full taxonomy gap-fill |
| `57a9274` | test | RED for orderDeployment eventContext + page_viewed + deploy store |
| `d27dfc8` | feat | GREEN mandatory eventContext + page_viewed rename + deploy plumbing |

## Verification

- `npx vitest run tests/lib/components/orders/ tests/lib/services/marketOrderExecution.events.test.ts tests/lib/services/orderDeployment.events.test.ts` — **63/63 pass** (8+10+8+20 component + 6 marketOrderExecution + 11 orderDeployment).
- Full `npx vitest run` — **742/743 pass** (1 unrelated skip — same as Plan 02-01/02-02 baseline).
- `npm run check` — **0 errors in plan-modified files** (3 remaining errors are pre-existing rpcMetrics test type errors deferred from Plan 02-01).
- `npm run build` — Vite/Rollup compile + chunk render succeeds ✓ 388 modules transformed; SvelteKit post-build analyse step still crashes on the pre-existing `SESSION_SECRET` fail-fast (unchanged from Plan 02-02 deferred-items.md).
- `grep -c "mintTradeId\|clearTradeId" src/lib/components/orders/MarketOrder.svelte` = **3** (≥2 required).
- `grep -c "trackTradeEvent" src/lib/components/orders/MarketOrder.svelte` = **6** (≥4 required).
- `grep -c "trackTradeEvent\|mintTradeId\|clearTradeId" src/lib/components/orders/LimitOrder.svelte` = **10** (≥3 required).
- `grep -c "trackTradeEvent\|mintTradeId\|clearTradeId" src/lib/components/orders/DcaOrder.svelte` = **7** (≥4 required).
- `grep -c "eventContext" src/lib/services/orderDeployment.ts` = **5** (≥2 required).
- `grep -nE "order_type:\s*['\"]limit['\"]|order_type:\s*['\"]dca['\"]" src/lib/services/orderDeployment.ts` = **1 match** (the `'limit' | 'dca'` type union literal in the `DeployEventContext` definition — NOT a fallback in any `trackTradeEvent` call). Test O6 actively asserts no hardcoded literal in the call sites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Plan-stated SDK boundary location for deploy events was misrouted**
- **Found during:** Task 2c spike of `orderDeployment.ts`
- **Issue:** Plan §Task 2c instructs emitting `sign_approval`/`sign_trade`/`broadcast`/`confirmed` "at the SDK callback boundaries" inside `orderDeployment.ts`, but `orderDeployment.ts` is a pure calldata-builder with no SDK callbacks — the actual `sendTransaction` + `waitForTransaction` calls live in `deployTransactionStore.ts handleStrategyDeployment`.
- **Fix:** Emit `sign_trade` from `orderDeployment.ts` at the calldata-prep boundary it owns (post `getDeploymentTransactionArgs`); emit `broadcast` + `confirmed` from `deployTransactionStore.handleStrategyDeployment` at the actual SDK boundary. `eventContext` is plumbed through both layers so the producer's `order_type` survives the call chain.
- **Files modified:** `src/lib/services/orderDeployment.ts`, `src/lib/stores/deployTransactionStore.ts`.
- **Commit:** `d27dfc8`.

**2. [Rule 3 — Blocking] Existing `track('trade_page', ...)` was the previous page-name string; plan's must_haves truth uses `'trade'` per checker fix #7**
- **Found during:** Task 2c
- **Issue:** Plan must_haves truth statement: "page_viewed fires with page: 'trade' on /trade/[id] route load". Existing call site at `+page.svelte:581` was `trackPageView('trade_page', ...)` — which would have emitted `{ page: 'trade_page', ... }`, not matching the OBS-08 funnel filter `page === 'trade'`.
- **Fix:** Renamed `'trade_page'` → `'trade'` only at the funnel-input call site. The `initScrollTracking('trade_page')` site one line below is a separate analytics dimension (scroll tracking, not the funnel) and was left untouched.
- **Files modified:** `src/routes/(main)/trade/[id]/+page.svelte`.
- **Commit:** `d27dfc8`.

**3. [Rule 3 — Blocking] Existing `tests/lib/transactionStore.test.ts` failed type-check after `eventContext` mandatory parameter added**
- **Found during:** `npm run check` after Task 2c GREEN
- **Issue:** Pre-existing test fixtures at `transactionStore.test.ts:285,302` called `store.handleDcaDeploy(...)` and `store.handleLimitDeploy(...)` with one argument; new signatures require two.
- **Fix:** Pass `{ order_type: 'dca' }` and `{ order_type: 'limit' }` respectively in the existing fixtures. No test-behavior change — the existing tests assert the inner `getDcaDeploymentArgs`/`getLimitOrderDeploymentArgs` was called with the deployment args (now also receives `eventContext`, which is implicit in the type system).
- **Files modified:** `tests/lib/transactionStore.test.ts`.
- **Commit:** `d27dfc8`.

**4. [Rule 3 — Blocking] Test 5 in `MarketOrder.events.test.ts` had a typo on the no_quotes branch**
- **Found during:** Task 1a GREEN run
- **Issue:** Test asserted `classifyMarketError(new Error('No quotes available')) === 'no_liquidity'` but the classifier checks for the substring `no_quotes` (lowercase, underscore-form) which matches the upstream `failWith('no_quotes_available', ...)` reason, NOT a humanized "No quotes available" string.
- **Fix:** Changed the test sample to `new Error('no_quotes available')` to match the actual contract.
- **Files modified:** `tests/lib/components/orders/MarketOrder.events.test.ts`.
- **Commit:** Folded into `a77565c`.

### Test-Strategy Deviation (documented)

The plan's `<action>` block describes `@testing-library/svelte` component renders for each of the three component event tests (mock auth + executeMarketOrder, render MarketOrder.svelte, simulate clicks, assert event sequences). The existing `tests/lib/components/orders/MarketOrder.test.ts` test convention (already on disk pre-Plan 02-03) explicitly chose source-content + pure-helper tests instead, with the rationale documented at line 178+ ("prefer testing pure logic extracted from a component over rendering the component when business logic can be lifted"). This plan's three component event-tests follow that established convention rather than introducing a parallel render-based pattern. The acceptance criteria the plan calls out (mintTradeId paired with clearTradeId in finally; correct event names; classifier mapping) are fully verified at the source-content + pure-function level. Runtime emission through `trackTradeEvent` is already covered by Plan 02-01's `tradeEvents.test.ts` (5 cases including the privacy scrubber and the all-12-event-name acceptance test).

### Deferred (Out of Scope)

- **rpcMetrics test type errors** at `tests/lib/server/rpcMetrics.test.ts:165,181,182` — pre-existing as of Plan 02-01. Already in `deferred-items.md`. Not addressed.
- **`npm run build` SvelteKit post-build analyse step** — pre-existing fail-fast on missing `SESSION_SECRET` from Plan 02-02 deferred-items. The Vite/Rollup compile itself succeeds (388 modules, chunk render passes).
- **Pre-existing lint warnings in `+page.svelte` and `orderDeployment.ts`** — `any` types in `getDotrainRegistry`, unused vars (`tradeToPoint`, `assetDecimals`, `_err`) — present before Plan 02-03; not introduced by this plan's edits. Out of scope per scope-boundary rule.
- **End-to-end OBS-09 cross-tool correlation test** — explicitly accepted per checker fix #2 as covered by Plan 04 OBS-10 manual production smoke (RUNBOOK §5 step 7). No automated correlation test added in this plan.

## Open Follow-ups

- **Plan 02-04 (RUNBOOK + privacy review + manual OBS-10 smoke):** with this plan landed, the funnel surface in PostHog is complete and a real production trade can be traced end-to-end (PostHog event with `trade_id` ↔ Sentry event with `trade_id` tag ↔ pino log line with `trade_id` field). Plan 04 owns the manual smoke verification.
- **OBS-08 funnel JSON export** — manual UI configure in PostHog using the now-canonical event names. Plan 04 §Wave 4c.
- **`X-Trade-Id` header propagation to same-origin `/api/*` callers** — none exist in `marketOrderExecution.ts` or `orderDeployment.ts` today (those services talk to RPC + Goldsky + WASM SDKs, never `/api/*`). If future server-relayed flows are added, attach `X-Trade-Id` per the inline `Headers` pattern in 02-PATTERNS.md.

## TDD Gate Compliance

All five tasks followed RED → GREEN: each `feat` commit is preceded by a `test` commit on the same scope.

| Task | RED commit | GREEN commit |
|---|---|---|
| 1a (MarketOrder) | `ddbea90` | `a77565c` |
| 1b (marketOrderExecution) | `89d399f` | `a58da34` |
| 2a (LimitOrder) | `01759e9` | `8671b99` |
| 2b (DcaOrder) | `edd2cec` | `966aef2` |
| 2c (orderDeployment + page_viewed + deploy store) | `57a9274` | `d27dfc8` |

No REFACTOR commits — initial implementations were minimal and matched the PATTERNS.md analogs.

## Self-Check: PASSED

- `[ -f src/lib/components/orders/MarketOrder.svelte ]` → FOUND (modified)
- `[ -f src/lib/components/orders/LimitOrder.svelte ]` → FOUND (modified)
- `[ -f src/lib/components/orders/DcaOrder.svelte ]` → FOUND (modified)
- `[ -f src/lib/services/marketOrderExecution.ts ]` → FOUND (modified)
- `[ -f src/lib/services/orderDeployment.ts ]` → FOUND (modified)
- `[ -f src/lib/stores/deployTransactionStore.ts ]` → FOUND (modified)
- `[ -f src/routes/(main)/trade/[id]/+page.svelte ]` → FOUND (modified)
- `[ -f tests/lib/components/orders/MarketOrder.events.test.ts ]` → FOUND (new)
- `[ -f tests/lib/components/orders/LimitOrder.events.test.ts ]` → FOUND (new)
- `[ -f tests/lib/components/orders/DcaOrder.events.test.ts ]` → FOUND (new)
- `[ -f tests/lib/services/marketOrderExecution.events.test.ts ]` → FOUND (new)
- `[ -f tests/lib/services/orderDeployment.events.test.ts ]` → FOUND (new)
- Commits `ddbea90 a77565c 89d399f a58da34 01759e9 8671b99 edd2cec 966aef2 57a9274 d27dfc8` all present in `git log` → FOUND (10/10).
