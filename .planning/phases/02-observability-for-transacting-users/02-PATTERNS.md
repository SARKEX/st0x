# Phase 2: Observability for Transacting Users — Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 14 (6 new, 8 modified)
**Analogs found:** 14 / 14

## File Classification

| New / Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `src/lib/services/observability/tradeId.ts` | NEW | service (browser, module-state lifecycle) | event-driven (mint/get/clear) | `src/lib/observability/scrub.ts` (pure browser observability module) + `src/lib/services/analytics.ts` (Sentry browser sink + module-level state) | role-match |
| `src/lib/services/observability/tradeEvents.ts` | NEW | service (typed wrapper over `track()`) | event-driven (fire-and-forget) | `src/lib/services/analytics.ts` (`track` helper) + `src/lib/services/observability/captureTakeOrderFailure.ts` (typed sink wrapper, never-throws-back convention) | exact |
| `src/lib/services/observability/captureTakeOrderFailure.ts` | MODIFY | service (Sentry sink) | event-driven (capture) | self — extend existing | n/a (in place) |
| `src/lib/server/logger.ts` | MODIFY | infrastructure (pino + AsyncLocalStorage) | request-response | self — extend `RequestContext` and `requestContextHandle` | n/a (in place) |
| `src/hooks.client.ts` | MODIFY | hook (Sentry browser init) | bootstrap | self — extend `Sentry.init({ integrations: [...] })` | n/a (in place) |
| `src/hooks.server.ts` | MODIFY (optional, no-op for OBS-09 — header read happens in `requestContextHandle`) | hook (Sentry server init + sequence) | bootstrap | self | n/a (in place) |
| `src/lib/components/orders/MarketOrder.svelte` | MODIFY | component (submit handler host) | event-driven | self — extend `handleMarketOrder` (lines 842-961) with `mintTradeId`/`clearTradeId`, replace `track(...)` with `trackTradeEvent(...)` | n/a (in place) |
| `src/lib/components/orders/LimitOrder.svelte` | MODIFY | component (submit handler host) | event-driven | self — extend `handleDeploy` (lines 206-298) and `proceedWithDeploy` (lines 337-350) | n/a (in place) |
| `src/lib/components/orders/DcaOrder.svelte` | MODIFY (gap-fill — zero analytics today) | component (submit handler host) | event-driven | `src/lib/components/orders/LimitOrder.svelte` `handleDeploy` (closest deploy-flow shape) | role-match |
| `src/routes/(main)/trade/[id]/+page.svelte` | MODIFY | route (page-load tracking) | request-response | existing `trackPageView()` call sites (`src/lib/services/analytics.ts:113`) | role-match |
| `src/lib/services/marketOrderExecution.ts` | MODIFY | service (orchestration) | event-driven | self — emission sites at SDK callback boundaries (broadcast / confirmed) | n/a (in place) |
| `src/lib/services/orderDeployment.ts` | MODIFY | service (orchestration) | event-driven | `src/lib/services/marketOrderExecution.ts` (sibling service) | role-match |
| `tests/lib/services/observability/tradeEvents.test.ts` | NEW | test (unit) | n/a | `tests/lib/services/observability/captureTakeOrderFailure.test.ts` | exact |
| `tests/lib/services/observability/tradeId.test.ts` | NEW | test (unit) | n/a | `tests/lib/services/observability/captureTakeOrderFailure.test.ts` | exact |
| `tests/lib/server/logger.tradeId.test.ts` | NEW | test (unit) | n/a | `tests/lib/server/logger.test.ts` | exact |
| `tests/lib/observability/sentryReplayConfig.test.ts` | NEW | test (config inspection) | n/a | `tests/lib/observability/scrub.test.ts` | role-match |
| `tests/lib/components/orders/MarketOrder.events.test.ts` (+ Limit, Dca) | NEW | test (component) | n/a | existing `@testing-library/svelte` order tests (search if present) | role-match |
| `02-PRIVACY-REVIEW.md` | NEW | doc (checklist) | n/a | `.planning/phases/01-.../01-RUNBOOK.md` | role-match |
| `02-RUNBOOK.md` | NEW | doc (operator runbook) | n/a | `.planning/phases/01-.../01-RUNBOOK.md` | exact |

## Pattern Assignments

### `src/lib/services/observability/tradeId.ts` (NEW — browser module, lifecycle)

**Analog:** `src/lib/services/observability/captureTakeOrderFailure.ts` (typed Sentry-using browser observability module, never-throws-back convention) + `src/lib/services/analytics.ts` (module-level `initialized` state pattern).

**Imports pattern** (mirror `captureTakeOrderFailure.ts:26`):
```typescript
import * as Sentry from '@sentry/sveltekit';
```

**Module-level state pattern** (mirror `analytics.ts:8-11`):
```typescript
let initialized = false;
let previousWalletAddress: string | null = null;
```
Adapt: `let current: string | null = null;` for the active `trade_id`.

**Never-throws-back convention** (copy from `captureTakeOrderFailure.ts:95-98`):
```typescript
try {
    Sentry.captureException(err, { ... });
} catch (sentryErr) {
    // Logging never throws back into caller (project convention)
    console.error('[captureTakeOrderFailure] Sentry sink failed:', sentryErr);
}
```
Apply to every `Sentry.setTag` call in `tradeId.ts`.

**Header constant export pattern:** Use `SCREAMING_SNAKE_CASE` per CLAUDE.md "Naming" convention:
```typescript
export const TRADE_ID_HEADER = 'X-Trade-Id';
```

---

### `src/lib/services/observability/tradeEvents.ts` (NEW — typed `track()` wrapper)

**Analog:** `src/lib/services/analytics.ts` lines 88-108 (the `track()` helper that this module wraps).

**Import + delegate pattern** (mirror analytics enrichment shape):
```typescript
// src/lib/services/analytics.ts:91-108
export function track(eventName: string, properties?: Record<string, unknown>): void {
    if (!browser || !initialized) return;
    const network = get(currentNetwork);
    const address = get(walletAddress);
    const method = get(authMethod);
    const enrichedProps = {
        ...properties,
        wallet_address: address?.toLowerCase(),
        auth_method: method,
        network: network?.displayName,
        chain_id: network?.chainId
    };
    posthog.capture(eventName, enrichedProps);
}
```
Adapt: `trackTradeEvent` calls `track(name, { ...props, trade_id: getCurrentTradeId() })`. Do NOT re-implement enrichment — delegate to `track()`.

**Typed-event-name discriminated union pattern** (mirror `captureTakeOrderFailure.ts:29-41` `TakeOrderFailureReason`):
```typescript
export type TakeOrderFailureReason =
    | 'no_quotes_available'
    | 'no_walk_fills'
    | 'unhydrated_fills'
    | 'aggregated_failed'
    | 'caught_exception'
    | 'preflight_chain_unreachable'
    | 'preflight_order_vanished'
    | 'auto_retry_exhausted';
```
Adapt: `TradeEventName`, `ErrorClass` as string-literal unions. Per RESEARCH §Pitfall 7, retain existing snake_case event names (`trade_panel_opened`, `trade_button_clicked`, `trade_initiated`, `trade_failed`, `trade_panel_abandoned`, `trade_error_shown`, `limit_order_deployed`) and ADD new steps (`quote_received`, `sign_approval`, `sign_trade`, `broadcast`, `confirmed`).

**Typed property contract** (mirror `captureTakeOrderFailure.ts:43-69` `TakeOrderTranscript` interface):
```typescript
export interface TakeOrderTranscript {
    subgraphQuoteHash: string | null;
    fullQuotePayload: ProcessedQuote[];
    onChainStateRead: { ... };
    side: 'bid' | 'ask';
    takerAction: 'Buy' | 'Sell';
    userAction: 'Buy' | 'Sell';
    mode: 'buyUpTo' | 'spendUpTo';
    walletAddress: string | null;
    request_id: string | null;
    timestamp: string;
}
```
Adapt: `TradeEventProps` per RESEARCH Pattern 1. Keep `mode: 'buyUpTo' | 'spendUpTo'` aligned with the existing transcript field (consistent UI-side language per CLAUDE.md INPUT/OUTPUT semantics — taker perspective in UI).

**Never-throws-back convention** (copy from `captureTakeOrderFailure.ts:95-98`):
```typescript
try {
    track(name, { ...props, trade_id: getCurrentTradeId() });
} catch (err) {
    console.error('[trackTradeEvent] failed:', err);
}
```

---

### `src/lib/services/observability/captureTakeOrderFailure.ts` (MODIFY — add `trade_id` tag)

**Existing pattern** (lines 87-94 — add `trade_id` to `tags` object):
```typescript
Sentry.captureException(err, {
    tags: { failure_reason: reason, side: transcript.side },
    extra: { ...transcript, errorMessage }
});
```

**After modification** (RESEARCH §Code Examples):
```typescript
import { getCurrentTradeId } from './tradeId';
Sentry.captureException(err, {
    tags: {
        failure_reason: reason,
        side: transcript.side,
        ...(getCurrentTradeId() ? { trade_id: getCurrentTradeId()! } : {})
    },
    extra: { ...transcript, errorMessage }
});
```

---

### `src/lib/server/logger.ts` (MODIFY — extend `RequestContext` with `trade_id`)

**Existing `RequestContext` interface** (lines 26-32):
```typescript
interface RequestContext {
    request_id: string;
    wallet: string | null;
    route: string;
    method: string;
    start_ms: number;
}
```

**Existing `requestContextHandle` pattern** (lines 101-123):
```typescript
export const requestContextHandle: Handle = async ({ event, resolve }) => {
    const request_id = event.request.headers.get('x-request-id') ?? randomUUID();
    const sessionId = event.cookies.get('session');
    let wallet: string | null = null;
    if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
        const record = await readSession(sessionId);
        wallet = record?.walletAddress ?? null;
    }
    const route = event.url.pathname;
    const method = event.request.method;
    const start_ms = Date.now();

    return contextStore.run({ request_id, wallet, route, method, start_ms }, async () => {
        const response = await resolve(event);
        response.headers.set('x-request-id', request_id);
        ...
    });
};
```

**Validation pattern to copy** (lines 105 — same regex-shape defense-in-depth used for `sessionId`):
```typescript
if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) { ... }
```
Adapt for UUIDv4 trade_id (per RESEARCH §Security Domain V5 + Pattern 3):
```typescript
const headerTradeId = event.request.headers.get('x-trade-id');
const trade_id = headerTradeId && /^[0-9a-f-]{36}$/i.test(headerTradeId) ? headerTradeId : null;
```

**`getLogger()` child-context pattern** (lines 69-78 — extend with conditional spread):
```typescript
export function getLogger(): Logger {
    const ctx = contextStore.getStore();
    if (!ctx) return baseLogger;
    return baseLogger.child({
        request_id: ctx.request_id,
        wallet: ctx.wallet,
        route: ctx.route,
        method: ctx.method
    });
}
```
Adapt: append `...(ctx.trade_id && { trade_id: ctx.trade_id })` so `trade_id` only appears when present (orthogonal to `request_id` which is always present).

---

### `src/hooks.client.ts` (MODIFY — add `Sentry.replayIntegration`)

**Existing init pattern** (entire file, lines 14-25):
```typescript
Sentry.init({
    dsn: env.PUBLIC_SENTRY_DSN,
    enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0,
    integrations: [],
    beforeSend(event) {
        return scrubSentryEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
        return scrubSentryEvent(breadcrumb);
    }
});
```

**Modification target** (RESEARCH Pattern 4): replace `integrations: []` and add D-02 sample-rate keys. Keep `dsn`, `enabled`, `beforeSend`, `beforeBreadcrumb` exactly as they are — the existing `scrubSentryEvent` PII boundary remains the source of truth (D-03 masking is independent and adds defense-in-depth at the recording layer).

```typescript
Sentry.init({
    dsn: env.PUBLIC_SENTRY_DSN,
    enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,        // D-02: no proactive recording
    replaysOnErrorSampleRate: 1.0,      // D-02: full on-error buffer
    integrations: [
        Sentry.replayIntegration({
            maskAllText: true,            // D-03
            maskAllInputs: true,          // D-03
            blockAllMedia: true
        })
    ],
    beforeSend(event) { return scrubSentryEvent(event); },
    beforeBreadcrumb(breadcrumb) { return scrubSentryEvent(breadcrumb); }
});
```

`src/hooks.server.ts` is unchanged for OBS-06 (Replay is browser-only).

---

### `src/lib/components/orders/MarketOrder.svelte` (MODIFY — `handleMarketOrder`)

**Analog:** self — `handleMarketOrder` at lines 842-961 already has the try / finally shape and existing `track()` call sites.

**Existing imports** (line 28):
```typescript
import { track } from '$lib/services/analytics';
```
**Modification:** add side-imports without removing — both modules coexist (other event surfaces in the file may keep raw `track()`):
```typescript
import { trackTradeEvent } from '$lib/services/observability/tradeEvents';
import { mintTradeId, clearTradeId } from '$lib/services/observability/tradeId';
```

**Existing `handleMarketOrder` shape** (lines 842-961, abbreviated):
```typescript
const handleMarketOrder = async () => {
    track('trade_button_clicked', { order_type: 'market', token_symbol: assetToken?.symbol, ... });

    if (!$isAuthenticated) { promptWalletConnection(); return; }
    if (!$walletRegistered) { promptLogin(); return; }
    if (!hasAvailableOrders || !selectedAmount) return;
    if (isSubmittingMarketOrder) return;
    isSubmittingMarketOrder = true;
    orderPreparationError = null;

    try {
        // ... refresh quotes, get filtered quotes ...
        const result = await executeMarketOrder({ ... });
        if (!result.success && result.error) {
            track('trade_failed', { ... });
        } else if (result.success) {
            track('trade_initiated', { ... });
        }
    } catch (error) {
        track('trade_failed', { ... });
    } finally {
        isSubmittingMarketOrder = false;
    }
};
```

**Modification pattern** (RESEARCH Pattern 2 + Pitfall 2):
- Mint `trade_id` BEFORE early-return guards (so even early-return events carry it for funnel correlation), OR mint right before `try` (RESEARCH default — RECOMMEND: mint before `try`, since OBS-09 cares about trades that actually start submitting). Planner picks; both are defensible.
- Replace `track('trade_button_clicked', ...)` → `trackTradeEvent('trade_button_clicked', ...)` and similarly for `trade_failed`/`trade_initiated`. Per RESEARCH Pitfall 7, KEEP the snake_case names.
- ADD inside the try: `trackTradeEvent('quote_received', ...)` after quote refresh; `trackTradeEvent('sign_approval', ...)` / `trackTradeEvent('sign_trade', ...)` / `trackTradeEvent('broadcast', ...)` / `trackTradeEvent('confirmed', ...)` at SDK callback points (Wave 3e spike to map exact sites in `marketOrderExecution.ts`).
- ADD `clearTradeId();` to `finally` block alongside the existing `isSubmittingMarketOrder = false;`. Critical per RESEARCH Pitfall 2.

---

### `src/lib/components/orders/LimitOrder.svelte` (MODIFY — `handleDeploy` + `proceedWithDeploy`)

**Analog:** `MarketOrder.svelte` `handleMarketOrder` (sibling shape — same submit-handler convention, same auth-guard sequence, same `track()` call sites).

**Existing `handleDeploy` shape** (lines 206-298):
- Line 208 — `track('trade_button_clicked', { order_type: 'limit', ... })`
- Line 290 — `track('limit_order_deployed', { token_symbol, order_side, price, amount })` (no-warning path)
- Line 340 (in `proceedWithDeploy`) — `track('limit_order_deployed', { ... })` (warning-acknowledged path)

**Modification:**
- `mintTradeId()` at the top of `handleDeploy` (or inside the auth-passed branch).
- Replace both `track()` calls with `trackTradeEvent()`. Both warning-paths must end up firing the same event with the same `trade_id`.
- `clearTradeId()` after `transactionStore.handleLimitDeploy(...)` resolves OR in a try/finally — RESEARCH Pattern 2 wraps in try/finally; planner adapts to the limit-order shape (no try/finally exists today).
- ADD missing OBS-07 steps (`quote_received` is N/A for limits; `sign_approval`/`sign_trade`/`broadcast`/`confirmed` fire from the deploy flow downstream — likely from `transactionStore` or `orderDeployment.ts`).

---

### `src/lib/components/orders/DcaOrder.svelte` (MODIFY — gap-fill, zero analytics today)

**Analog:** `LimitOrder.svelte` `handleDeploy` (closest sibling — DCA is a deploy-once strategy like limit).

**Pattern to install:** the entire `handleDeploy` event-emission shape from `LimitOrder.svelte:206-298`, adapted with `order_type: 'dca'`. Per RESEARCH Assumption A7, DCA is a deploy-once event surface (no per-cycle event spam).

---

### `src/routes/(main)/trade/[id]/+page.svelte` (MODIFY — `page_opened` event)

**Analog:** `src/lib/services/analytics.ts:113-118` `trackPageView()` helper (existing `page_viewed` event).

**Pattern:** `trade_panel_opened` already fires from `MarketOrder.svelte:123` and `LimitOrder.svelte:28` on component mount. The new `page_opened` step lives at the route level — fires before any panel is selected. RESEARCH §Wave 3d: this event does NOT yet have a `trade_id` (mint happens at submit click); it lives in the OBS-08 intent funnel only.

```typescript
// in onMount or page-load
trackPageView('trade', { token_id: $page.params.id });
```

---

### `src/lib/services/marketOrderExecution.ts` (MODIFY — emit `quote_received`/`broadcast`/`confirmed`)

**Analog:** self — already calls `captureTakeOrderFailure(err, transcript, reason)` at line 199 (RESEARCH-confirmed).

**Pattern:** the SDK has callback boundaries that map to OBS-07 steps. RESEARCH Open Question 5 calls for a small spike to map exact callback points. Use `trackTradeEvent` not `track` (consistent property contract). Per RESEARCH Pitfall 5, only same-origin fetches should propagate the `X-Trade-Id` header — never to Pyth Hermes / Goldsky / Rain Oracle Server.

---

### `src/lib/services/orderDeployment.ts` (MODIFY — emit `sign_*`/`broadcast`/`confirmed` for limit + DCA)

**Analog:** `src/lib/services/marketOrderExecution.ts` (sibling service — same orchestration role, same SDK-callback emission boundaries). Apply identical event-emission discipline.

---

### `tests/lib/services/observability/tradeEvents.test.ts` (NEW — unit)

**Analog:** `tests/lib/services/observability/captureTakeOrderFailure.test.ts` (sibling test for the sister module).

**Test scaffold pattern** (copy lines 1-50 verbatim, adapt module under test):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/sveltekit';
import {
    captureTakeOrderFailure,
    type TakeOrderTranscript,
    type TakeOrderFailureReason
} from '$lib/services/observability/captureTakeOrderFailure';

function makeTranscript(overrides: Partial<TakeOrderTranscript> = {}): TakeOrderTranscript {
    return {
        subgraphQuoteHash: '0x' + 'a'.repeat(64),
        // ...
        ...overrides
    };
}

describe('captureTakeOrderFailure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });
    it('invokes Sentry.captureException once with failure_reason tag + transcript in extra', () => {
        const captureSpy = vi.spyOn(Sentry, 'captureException');
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // ...
        expect(captureSpy).toHaveBeenCalledTimes(1);
        const [capturedErr, opts] = captureSpy.mock.calls[0] as [...];
        expect(opts?.tags).toMatchObject({ failure_reason: 'no_quotes_available', side: 'ask' });
    });
});
```

**Adapt for `trackTradeEvent`:** spy on `posthog.capture` (mocked at vitest-setup level); assert (a) event name passed through; (b) `trade_id` property present when `mintTradeId()` was called; (c) try/catch swallows posthog errors; (d) every `TradeEventName` is accepted; (e) every `ErrorClass` is accepted.

---

### `tests/lib/services/observability/tradeId.test.ts` (NEW — unit)

**Analog:** `tests/lib/services/observability/captureTakeOrderFailure.test.ts` (Sentry-spy idiom).

**Test surface:**
- `mintTradeId()` returns a UUIDv4-shaped string and calls `Sentry.setTag('trade_id', id)` (spy on `Sentry.setTag`).
- `getCurrentTradeId()` returns the minted ID; `null` after `clearTradeId()`.
- Try/catch around `Sentry.setTag` — even if Sentry throws, `mintTradeId` returns the ID (project never-throws-back convention).
- Two consecutive `mintTradeId()` calls yield distinct IDs (regression for Pitfall 2).

---

### `tests/lib/server/logger.tradeId.test.ts` (NEW — unit)

**Analog:** `tests/lib/server/logger.test.ts:1-79` (existing logger test file shape).

**Test surface:**
- `requestContextHandle` extracts `X-Trade-Id` header into `RequestContext.trade_id`.
- Invalid header (not UUIDv4 shape) → `trade_id` is `null` (defense-in-depth per RESEARCH §V5 Input Validation).
- `getLogger()` includes `trade_id` field in child logger when set; omits the field when `null` (orthogonal to `request_id` which is always present).
- Existing `pickLevelForRoute` tests untouched (not in scope).

---

### `tests/lib/observability/sentryReplayConfig.test.ts` (NEW — config inspection)

**Analog:** `tests/lib/observability/scrub.test.ts` (sibling pure-config browser test).

**Test surface:**
- Inspect `Sentry.init` call args from `hooks.client.ts` (mock `Sentry.init`, import the file, assert call shape):
  - `replaysSessionSampleRate: 0` (D-02)
  - `replaysOnErrorSampleRate: 1.0` (D-02)
  - `integrations` includes a `replayIntegration` call with `maskAllText: true`, `maskAllInputs: true` (D-03)
  - `beforeSend` and `beforeBreadcrumb` still wired to `scrubSentryEvent` (regression guard for OBS-01 PII boundary)

---

### `tests/lib/components/orders/MarketOrder.events.test.ts` (+ Limit, Dca) (NEW — component)

**Analog:** any existing `@testing-library/svelte` test in the repo (planner finds via `grep -r "render.*Svelte\|render.*Component" tests/`). If none exists for the orders directory, the analog is `tests/lib/services/marketOrderExecution.test.ts` (orchestration test) for the spy-on-emission pattern.

**Test surface:**
- Mock `trackTradeEvent`, render the component, simulate auth + token state, click submit, assert each step (`trade_button_clicked`, `quote_received`, `sign_*`, `broadcast`, `confirmed`/`failed`) fires once with the expected `trade_id` property.
- DCA test is gap-fill — must assert events fire from a baseline of zero today.

---

## Shared Patterns

### Never-throws-back convention
**Source:** `src/lib/services/observability/captureTakeOrderFailure.ts:75-114`
**Apply to:** `tradeId.ts`, `tradeEvents.ts`, every Sentry call site, every `track()`/`trackTradeEvent` call site
```typescript
try {
    Sentry.captureException(err, { ... });
} catch (sentryErr) {
    // Logging never throws back into caller (project convention)
    console.error('[captureTakeOrderFailure] Sentry sink failed:', sentryErr);
}
```
Documented in `marketOrderExecution.ts` comments and `auditLog.ts` per RESEARCH §Project Constraints. Apply uniformly.

### Sentry PII scrubbing boundary (regression-guard)
**Source:** `src/lib/observability/scrub.ts` + `src/hooks.client.ts:19-24`
**Apply to:** every modification of `Sentry.init` (OBS-06 must NOT remove `beforeSend`/`beforeBreadcrumb` wiring); every new Sentry capture call site (must route through standard `Sentry.captureException`/`Sentry.captureMessage` so the scrubber runs).
```typescript
const ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const SIG_RE = /0x[a-fA-F0-9]{130}/g;
const SIG_QUERY_RE = /([?&])signature=[^&]*/g;

function redactString(s: string): string {
    return s
        .replace(SIG_QUERY_RE, '$1signature=[REDACTED]')
        .replace(SIG_RE, '[REDACTED_SIGNATURE]')
        .replace(ADDR_RE, '[REDACTED_ADDR]');
}
```

### Browser-init guard (`!browser || !initialized`)
**Source:** `src/lib/services/analytics.ts:18, 92, 131`
**Apply to:** `tradeEvents.ts` (delegates to `track()` so inherits the guard automatically — no duplication needed).
```typescript
if (!browser || !initialized) return;
```

### `track()` automatic enrichment — DO NOT bypass
**Source:** `src/lib/services/analytics.ts:91-108`
**Apply to:** All trade event emission goes through `track()` (via `trackTradeEvent` wrapper). The `wallet_address` (lowercase), `auth_method`, `network`, `chain_id` enrichment must NOT be re-implemented elsewhere. RESEARCH §Anti-Patterns explicitly forbids inlining.

### Header-shape validation in pino context
**Source:** `src/lib/server/logger.ts:104-108` (`sessionId` regex check before use)
**Apply to:** new `X-Trade-Id` header read in `requestContextHandle`. Same defensive shape against header injection / log forgery (RESEARCH §V5 Input Validation).
```typescript
if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) { ... }
```
Adapt regex for UUIDv4: `/^[0-9a-f-]{36}$/i`.

### CSPRNG-backed UUID
**Source:** `src/lib/server/logger.ts:20, 102` — `randomUUID()` from `node:crypto`
**Apply to:** browser side uses `crypto.randomUUID()` (Web Crypto API, also CSPRNG). Symmetry across tiers — both produce UUIDv4 RFC 4122. RESEARCH §V6 Cryptography requirement; no custom RNG.

### Naming conventions per CLAUDE.md
- **stores:** camelCase
- **types:** PascalCase (`TradeEventName`, `TradeEventProps`, `ErrorClass`)
- **constants:** SCREAMING_SNAKE_CASE (`TRADE_ID_HEADER`)
- **event names:** keep existing snake_case per RESEARCH Pitfall 7 (`trade_button_clicked`, `quote_received`, etc.) — no migration needed

### CSP allow-list (regression-guard only — already correct)
**Source:** `src/hooks.server.ts:201` (already includes `worker-src 'self' blob:` per RESEARCH §Pitfall 3)
**Apply to:** `tests/lib/server/csp.test.ts` (extend or create) — assert `worker-src 'self' blob:` is present so a future CSP edit can't silently break Sentry Replay.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/integration/ui/observability/correlation.test.ts` | E2E (Phase 1 Anvil-fork harness) | n/a | Builds on Phase 1 E2E harness; no existing observability E2E test. The Phase 1 RUNBOOK and `tests/integration/ui/` examples (per `.planning/phases/01-.../01-RUNBOOK.md`) are the closest scaffolding analog. Planner should follow Phase 1 D-09 compound testid + `data-*` semantic-state convention. |
| `02-PRIVACY-REVIEW.md` checklist | doc | n/a | First-of-its-kind document. The acceptance criteria in RESEARCH §"Privacy Review Acceptance Criteria (OBS-11)" define the structure; no existing checklist analog in repo. |
| OBS-08 PostHog funnel JSON export under `.planning/phases/02-.../artifacts/` | artifact | n/a | First as-code SaaS-config artifact in repo. No prior pattern; per RESEARCH §Wave 4c, manual UI configure + export JSON. |
| OBS-04 RUNBOOK screenshot bundle (3 screenshots per OBS-10 trade) | artifact | n/a | Mirrors v1.0 Phase 2 PERF-01 HUMAN-UAT pattern (referenced but no concrete file analog inside this codebase to point at). Use `.planning/phases/01-.../01-RUNBOOK.md` as structural template. |

## Metadata

**Analog search scope:**
- `src/lib/services/` (analytics, observability, marketOrderExecution, orderDeployment)
- `src/lib/observability/` (scrub)
- `src/lib/server/` (logger)
- `src/lib/components/orders/` (MarketOrder, LimitOrder, DcaOrder)
- `src/hooks.client.ts`, `src/hooks.server.ts`
- `tests/lib/services/observability/`, `tests/lib/observability/`, `tests/lib/server/`

**Files scanned:** 12 source files + 4 test files + 2 hooks
**Pattern extraction date:** 2026-05-07
