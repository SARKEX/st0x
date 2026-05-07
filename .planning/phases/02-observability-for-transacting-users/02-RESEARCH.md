# Phase 2: Observability for Transacting Users — Research

**Researched:** 2026-05-07
**Domain:** Browser + server observability (Sentry Replay, PostHog events/funnel, pino), correlation-ID threading, privacy review
**Confidence:** HIGH (stack/wiring sites verified in code; Sentry Replay + PostHog options verified against current vendor docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Dual-stack — Sentry Replay + PostHog session_recording coexist with separate roles (Sentry = error-triage replay; PostHog = funnel-investigation replay).
- **D-02:** Sentry Replay sampling — `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`. On-error buffer only.
- **D-03:** Sentry Replay masking — defaults `maskAllText: true` + `maskAllInputs: true`. Maximum privacy.
- **D-04:** PostHog session_recording — keep `maskAllInputs: true`, low session sample rate (~0.05–0.1). Wallet identify/reset already wired.

### Claude's Discretion (research must converge on a recommendation)
- OBS-07 event taxonomy schema (namespacing, property contract, pino-mirror format, error_class enum).
- OBS-08 funnel dashboard mechanism (manual UI vs as-code; bias to solo-team simplicity).
- OBS-09 correlation ID lifecycle (mint site, header name, pino field, propagation across wagmi + Dynamic).
- OBS-10 verification protocol (manual prod smoke + RUNBOOK screenshots default).
- OBS-11 privacy review format (checklist vs policy file).
- Phase-internal sequencing & wave parallelism.

### Deferred Ideas (OUT OF SCOPE)
- Per-RPC attribution restoration (REL-02 follow-up, backlog 999.6).
- Replacing PostHog or Sentry; admin-page observability deepening; generic synthetic uptime; performance budgets.
- INTEGRATIONS.md "No external error tracking SDK" drift (opportunistic side-update).
- v1.0 Phase 2 micro tech-debt bundle (backlog 999.4–5); various other v1.0 carry-forwards (999.x).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBS-06 | Sentry Session Replay integrated, privacy-masked, sampling biased toward transacting sessions | §OBS-06 — `Sentry.replayIntegration({maskAllText:true, maskAllInputs:true})` in `src/hooks.client.ts`; `replaysSessionSampleRate:0`, `replaysOnErrorSampleRate:1.0` per D-02 (bias = on-error buffer; failed-trade events from `captureTakeOrderFailure` trigger replay). |
| OBS-07 | Transaction event taxonomy in PostHog + pino across Buy/Sell/limit-deploy/DCA-deploy with documented properties | §OBS-07 — extend existing `track()` in `src/lib/services/analytics.ts`; add `trackTradeEvent()` wrapper; canonicalize event names; mirror to pino server-side via header propagation; DCA gap (no tracking today). |
| OBS-08 | Single PostHog funnel dashboard with named drop-off counts, broken out by order type | §OBS-08 — manual PostHog UI configuration; export JSON + screenshots into `02-RUNBOOK.md`. |
| OBS-09 | Correlation ID threading Sentry ↔ PostHog ↔ pino for any failed trade | §OBS-09 — mint `trade_id` (UUIDv4) in submit handler before any side-effect; set `Sentry.setTag('trade_id', id)`, pass as PostHog property, propagate via `X-Trade-Id` header into pino `RequestContext`. |
| OBS-10 | Real production trade roundtrip captured end-to-end | §OBS-10 — manual prod smoke + RUNBOOK screenshots (3 sinks). Mirror v1.0 Phase 2 PERF-01 HUMAN-UAT pattern. |
| OBS-11 | Privacy review against CONCERNS.md PII guidance + OBS-01 scrubber | §OBS-11 — `02-PRIVACY-REVIEW.md` checklist file mapping each masking decision and each event property to PII classification with sign-off. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Single chain (Base 8453); no multi-chain; no AA work.
- Tech stack pinned: Svelte 4 + SvelteKit 2 + TypeScript strict + `@sentry/sveltekit` ^10.50.0 + `posthog-js` 1.337.0 + `pino` ^9.14.0.
- INPUT/OUTPUT semantics: maker-perspective on chain vs taker-perspective in UI. OBS-07 properties for Buy/Sell must use UI-side language (`order_side: 'buy'|'sell'`, `mode: 'spendUpTo'|'buyUpTo'`) consistent with `orderPerspective.ts`.
- Project memory: PostHog session_recording already at `maskAllInputs: true` (`src/lib/services/analytics.ts:27-32`); wallet-driven identify/reset wired (`:50-85`).
- Logging never throws back into caller (project convention from `monitoring.ts` and `auditLog.ts`); apply to all new event-emission sites.

## Summary

The phase builds on a fully-wired v1.0 observability foundation. Concretely: Sentry SDK ^10.50.0 already has `beforeSend`/`beforeBreadcrumb` PII scrubbers in both `hooks.client.ts` and `hooks.server.ts`; PostHog is already initialized with `maskAllInputs: true`; pino is wired with AsyncLocalStorage `RequestContext` carrying `request_id`, `wallet`, `route`, `method`. **Trade-flow analytics already exists in partial form** — `MarketOrder.svelte` and `LimitOrder.svelte` already emit `trade_panel_opened`, `trade_button_clicked`, `trade_initiated`, `trade_failed`, `trade_panel_abandoned`, `trade_error_shown`. `DcaOrder.svelte` has **no tracking today** (verified — grep returned 0 hits). The phase therefore is mostly **canonicalize + extend + thread an ID**, not greenfield instrumentation.

**Primary recommendation:**
1. Promote the existing ad-hoc event names into a documented taxonomy in a new `src/lib/services/observability/tradeEvents.ts` module (a thin wrapper around `track()` that mints/propagates `trade_id` and enforces a property contract). Backfill missing OBS-07 steps (`quote_received`, `sign_approval`, `sign_trade`, `broadcast`, `confirmed`) and add full coverage to DCA.
2. Mint `trade_id` (UUIDv4) at the submit-button click handler in each order component, set as `Sentry.setTag` + PostHog property + `X-Trade-Id` request header. Extend pino `RequestContext` with optional `trade_id` field read from header.
3. Add Sentry `replayIntegration` to both `hooks.client.ts` and (no server change needed — Replay is browser-only) with the D-02/D-03 config. CSP already allows `worker-src 'self' blob:` (verified line 201).
4. Lower PostHog session-recording sample rate via the **PostHog dashboard ingestion settings page** (per vendor docs, not via posthog-js init) — add a runbook step rather than a code change. (Code-side `sampleRate` config exists historically but vendor now directs operators to the dashboard.)
5. Build the OBS-08 funnel manually in PostHog UI; export the funnel definition JSON + a screenshot into `02-RUNBOOK.md`.
6. OBS-10 = manual post-deploy smoke (mirrors v1.0 PERF-01 HUMAN-UAT). OBS-11 = `02-PRIVACY-REVIEW.md` checklist.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sentry Session Replay (OBS-06) | Browser | — | Replay is captured client-side; Sentry SaaS attaches to events post-hoc. No server work. |
| Trade event emission (OBS-07 client) | Browser | — | Events fire from order components and `marketOrderExecution.ts` (client-side service). |
| Trade event mirror (OBS-07 server) | API / SvelteKit endpoint | — | Server-side trade-related routes log via pino; the same `trade_id` from header lands in pino logs. No new API endpoints — reuse existing routes touched during a trade. |
| Funnel dashboard (OBS-08) | PostHog SaaS | — | Configured in PostHog UI; only artifact in repo is the exported funnel JSON + screenshot in RUNBOOK. |
| Correlation ID mint + propagation (OBS-09) | Browser (mint) → API (consume) | Sentry SaaS / PostHog SaaS (tags/properties) | ID lifecycle starts at the user's submit click. Server gets it via request header. |
| Privacy review (OBS-11) | Repo doc | — | Checklist file alongside RUNBOOK; no runtime concern. |

## Standard Stack

### Core (already installed — pin and reuse, do not bump)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sentry/sveltekit` | `^10.50.0` | Error capture + Session Replay | [VERIFIED: `package.json`] Already wired with PII scrubbers; v10 has `replayIntegration` first-class. |
| `posthog-js` | `1.337.0` | Product analytics + session recording + funnels | [VERIFIED: `package.json`] Pinned exact version. Already wired. |
| `pino` | `^9.14.0` | Server JSON logging | [VERIFIED: `package.json`] AsyncLocalStorage propagation already in `src/lib/server/logger.ts`. |

### Supporting (add to repo as new modules — no new npm dependencies)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/lib/services/observability/tradeEvents.ts` (new) | Typed wrapper over `track()` that enforces OBS-07 property contract + manages `trade_id` lifecycle | All OBS-07 event emission sites |
| `src/lib/services/observability/tradeId.ts` (new) | Mint, get, clear, header-name constant for trade_id | Submit handlers + fetch wrappers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Sentry.replayIntegration` defaults | `data-sentry-mask` selectors + finer per-element control | Higher diagnostic value, but requires per-element discipline and re-audit on every UI change. D-03 explicitly chose defaults. |
| Manual PostHog funnel | PostHog API / Terraform as-code | More repeatable but solo-team overhead exceeds benefit (D-08 manual + RUNBOOK screenshot is the established pattern). |
| Custom UUID library | `crypto.randomUUID()` (Web Crypto, browser native) | No dep needed; matches the server-side pino `randomUUID` from `node:crypto` (`src/lib/server/logger.ts:20`). Both produce v4 UUIDs — comparable correlation ID quality. [VERIFIED: native browser API since 2022.] |

**Installation:** No new packages. Module additions only.

**Version verification:**
```bash
npm view @sentry/sveltekit version  # 10.x current
npm view posthog-js version         # 1.x current
npm view pino version               # 9.x current
```
*Skipped registry round-trip — pinned versions in `package.json` work and changing them is out of scope per "build on existing tools" milestone constraint.* [ASSUMED versions remain compatible with new code; pinned versions are sufficient for all features used.]

## Architecture Patterns

### System Architecture Diagram

```
                    USER (clicks Buy/Sell/Deploy)
                              │
                              ▼
         ┌─────────────────────────────────────────────┐
         │ Submit handler (MarketOrder/LimitOrder/Dca) │
         │   1. mintTradeId() → UUIDv4                 │
         │   2. Sentry.setTag('trade_id', id)          │
         │   3. trackTradeEvent('trade.submit_clicked')│──► PostHog (event + trade_id property)
         └────────────────────┬────────────────────────┘
                              │ trade_id in scope
                              ▼
         ┌─────────────────────────────────────────────┐
         │ executeMarketOrder / orderDeployment        │
         │   - track step events: quote_received,      │
         │     sign_approval, sign_trade, broadcast,   │──► PostHog (timeline of steps with same trade_id)
         │     confirmed, failed                       │
         │   - on failure: captureTakeOrderFailure     │──► Sentry event (trade_id tag) + on-error Replay
         └────────────────────┬────────────────────────┘
                              │ HTTP fetch with X-Trade-Id header
                              ▼
         ┌─────────────────────────────────────────────┐
         │ SvelteKit API endpoint (e.g. /api/...)      │
         │   requestContextHandle reads X-Trade-Id     │
         │   into RequestContext.trade_id              │──► pino logs (trade_id field)
         └─────────────────────────────────────────────┘

         Triage path (engineer hits a Sentry alert):
         Sentry event → click attached Replay → grep `trade_id`
         in PostHog events / Vercel pino logs.
```

The diagram shows: **one mint site (browser submit handler)** → **three sinks (Sentry, PostHog, pino)** → **one shared key (`trade_id`)** for cross-tool correlation. The on-error Sentry Replay buffer is automatically attached when `replaysOnErrorSampleRate: 1.0` is set and a Sentry event fires.

### Recommended Project Structure (additions)
```
src/lib/services/observability/
├── captureTakeOrderFailure.ts       # existing — extend to set trade_id tag
├── tradeEvents.ts                    # NEW — typed wrapper, property contract
└── tradeId.ts                        # NEW — mint/get/clear + header constant

src/lib/server/
└── logger.ts                         # MODIFY — add optional trade_id to RequestContext

src/hooks.client.ts                   # MODIFY — add Sentry.replayIntegration
src/hooks.server.ts                   # MODIFY — extract X-Trade-Id header
```

### Pattern 1: Trade-event helper (OBS-07)
**What:** Thin typed wrapper over `track()` that injects `trade_id` and enforces the property contract.
**When to use:** Every trade-flow event (replaces ad-hoc `track('trade_failed', {...})` calls).
```typescript
// Source: derived from src/lib/services/analytics.ts:91 + project conventions
import { track } from '$lib/services/analytics';
import { getCurrentTradeId } from './tradeId';

export type TradeEventName =
  | 'trade.page_opened'
  | 'trade.quote_received'
  | 'trade.submit_clicked'
  | 'trade.sign_approval'
  | 'trade.sign_trade'
  | 'trade.broadcast'
  | 'trade.confirmed'
  | 'trade.failed';

export type ErrorClass =
  | 'slippage_exceeded'
  | 'no_liquidity'
  | 'stale_oracle'
  | 'insufficient_balance'
  | 'market_closed'
  | 'user_rejected'
  | 'rpc_error'
  | 'preflight_chain_unreachable'
  | 'preflight_order_vanished'
  | 'auto_retry_exhausted'
  | 'unknown';
  // Note: extends TakeOrderFailureReason from captureTakeOrderFailure.ts
  // Adds user-facing classes (user_rejected, market_closed) that don't reach Sentry capture.

export interface TradeEventProps {
  order_type: 'market' | 'limit' | 'dca';
  order_side: 'buy' | 'sell';
  mode?: 'spendUpTo' | 'buyUpTo';   // market only
  asset_symbol: string;              // e.g. 'tNVDA' — already non-PII (project token list)
  payment_symbol: string;            // e.g. 'USDC'
  amount?: string;                   // human-decimal, formatUnits()'d
  slippage_bps?: number;
  error_class?: ErrorClass;
  error_message?: string;            // free text — must NOT contain addresses (caller responsibility)
}

export function trackTradeEvent(name: TradeEventName, props: TradeEventProps): void {
  try {
    track(name, { ...props, trade_id: getCurrentTradeId() });
  } catch (err) {
    console.error('[trackTradeEvent] failed:', err);  // never throws back
  }
}
```

### Pattern 2: Trade ID lifecycle (OBS-09)
**What:** Mint at submit-click, set as Sentry tag, available via getter for the duration of the submit handler.
**When to use:** Inside `handleMarketOrder`, `handleLimitDeploy`, `handleDcaDeploy`.
```typescript
// src/lib/services/observability/tradeId.ts
import * as Sentry from '@sentry/sveltekit';

export const TRADE_ID_HEADER = 'X-Trade-Id';
let current: string | null = null;

export function mintTradeId(): string {
  current = crypto.randomUUID();
  try { Sentry.setTag('trade_id', current); } catch { /* swallow */ }
  return current;
}
export function getCurrentTradeId(): string | null { return current; }
export function clearTradeId(): void {
  current = null;
  try { Sentry.setTag('trade_id', undefined as unknown as string); } catch { /* swallow */ }
}
```
**Submit-handler usage** (in `MarketOrder.svelte` `handleMarketOrder`):
```typescript
const handleMarketOrder = async () => {
  const tradeId = mintTradeId();
  trackTradeEvent('trade.submit_clicked', { ... });
  try {
    const result = await executeMarketOrder({ ..., tradeId }); // pass through
    if (result.success) trackTradeEvent('trade.confirmed', { ... });
    else trackTradeEvent('trade.failed', { ..., error_class: classify(result.error) });
  } finally {
    clearTradeId();  // critical — module-level state, must reset
  }
};
```

### Pattern 3: pino RequestContext extension (OBS-09 server)
**What:** Read `X-Trade-Id` in the existing `requestContextHandle` and store in context.
**When to use:** All API routes touched during a trade — already covered automatically once header lands.
```typescript
// MODIFY src/lib/server/logger.ts
interface RequestContext {
  request_id: string;
  wallet: string | null;
  route: string;
  method: string;
  trade_id: string | null;   // NEW — orthogonal to request_id (which is per-HTTP-request)
  start_ms: number;
}
// In requestContextHandle:
const trade_id = event.request.headers.get('x-trade-id') ?? null;
// Validate shape — UUIDv4 only, defense-in-depth against header injection
const valid_trade_id = trade_id && /^[0-9a-f-]{36}$/i.test(trade_id) ? trade_id : null;
return contextStore.run({ ..., trade_id: valid_trade_id }, async () => { ... });
// In getLogger():
return baseLogger.child({ request_id, wallet, route, method, ...(ctx.trade_id && { trade_id: ctx.trade_id }) });
```

### Pattern 4: Sentry Replay integration (OBS-06)
**What:** Add `replayIntegration` to existing `Sentry.init()` in `hooks.client.ts`. Browser-only — server `hooks.server.ts` is unchanged.
```typescript
// MODIFY src/hooks.client.ts
import * as Sentry from '@sentry/sveltekit';
Sentry.init({
  dsn: env.PUBLIC_SENTRY_DSN,
  enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,        // D-02: no proactive recording
  replaysOnErrorSampleRate: 1.0,      // D-02: full on-error buffer
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,              // D-03
      maskAllInputs: true,            // D-03
      blockAllMedia: true             // belt-and-braces — no media on trade page anyway
    })
  ],
  beforeSend(event) { return scrubSentryEvent(event); },
  beforeBreadcrumb(breadcrumb) { return scrubSentryEvent(breadcrumb); }
});
```
**Source:** [CITED: docs.sentry.io/platforms/javascript/guides/sveltekit/session-replay/] — replayIntegration imported from `@sentry/sveltekit`; on-error mode buffers 60s + rest of session.

### Anti-Patterns to Avoid
- **Minting `trade_id` at page load** — would conflate browse intent with submit intent. Funnel drop-off math becomes wrong (every page-view is a "trade attempt"). Mint at submit click only.
- **Inlining `track()` calls instead of using `trackTradeEvent`** — bypasses property contract; `trade_id` would be missing on those events; OBS-09 correlation breaks for that step.
- **Forgetting `clearTradeId()`** — module-level state leaks across submit attempts; one trade's failure event ends up tagged with a previous trade's ID.
- **Adding raw user input or addresses to event properties** — `track()` does NOT scrub PostHog properties (only Sentry has the boundary scrubber per `src/lib/observability/scrub.ts`). Property contract must use symbols (`tNVDA`) and amounts, never raw addresses.
- **Letting event emission throw** — every `trackTradeEvent` call wrapped in try/catch (project convention).
- **Mutating existing event names mid-deploy** — PostHog funnels reference event names. Migration plan: emit BOTH old and new names for one release, then drop old.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom random string | `crypto.randomUUID()` (browser) + existing `randomUUID` (server pino) | Native, CSPRNG-backed, RFC 4122 v4. Already in use at `logger.ts:20`. |
| Replay capture | DOM mutation observer + IndexedDB blob | `Sentry.replayIntegration` | Sentry handles batching, network reconstruction, masking, replay UI. |
| Funnel drop-off math | Bespoke aggregation | PostHog Funnels UI | PostHog does step-conversion natively, broken out by event property. |
| PII redaction in event payloads | Inline regex | Disciplined property contract + existing `scrub.ts` for Sentry boundary | The PostHog mask is at recording level; event properties never contain PII by design (caller responsibility, enforced by typed `TradeEventProps`). |
| Cross-request correlation in pino | Manual `child()` per call site | Existing AsyncLocalStorage `RequestContext` | Already wired (`logger.ts:34`); just add a field. |

**Key insight:** Almost everything in this phase is "configure a vendor SDK + thread an ID." The only first-party code is two thin modules (~100 LOC total) and edits to ~6 files.

## Runtime State Inventory

> Phase is pure code/config additions. No data migration; no OS-level state; no rebrand.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by grep for migration patterns | None |
| Live service config | **PostHog dashboard:** session-recording sample rate must be set to 0.05–0.1 in PostHog UI (per vendor docs, sampling is set in dashboard, not posthog-js init). **Sentry dashboard:** Session Replay must be enabled on the project (account-level toggle). **PostHog dashboard:** OBS-08 funnel must be created in UI. | Manual operator steps documented in `02-RUNBOOK.md`. |
| OS-registered state | None — no scheduled tasks, no installed services | None |
| Secrets/env vars | `PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, PostHog API key — all already in Vercel env per v1.0 OBS-01 | None — same vars, no rotation |
| Build artifacts | None — no codegen, no compiled assets | None |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* — None. Three SaaS-side configurations are NEW (Sentry Replay enable, PostHog sample-rate adjustment, PostHog funnel creation) and must be done manually + documented in RUNBOOK.

## Common Pitfalls

### Pitfall 1: PostHog `sampleRate` config key drift
**What goes wrong:** Setting `session_recording: { sampleRate: 0.05 }` in posthog-js init silently does nothing on current versions.
**Why:** [CITED: posthog.com/docs/session-replay/how-to-control-which-sessions-you-record] PostHog now directs operators to set sampling on the "replay ingestion settings page" in the dashboard. Programmatic `sample_rate` historically existed but is no longer the canonical lever.
**How to avoid:** Don't add `sampleRate` to `analytics.ts`. Document the dashboard setting in RUNBOOK with a screenshot.
**Warning signs:** Plan task that says "set sampleRate in analytics.ts" — reject; the change is operator-side.

### Pitfall 2: Forgetting `clearTradeId()` on the early-return paths
**What goes wrong:** `trade_id` from a previous trade leaks into the next trade's events, breaking correlation.
**Why:** Module-level mutable state. The submit handler has 4+ early-return paths (`!isAuthenticated`, `!walletRegistered`, `!hasAvailableOrders`, `isSubmittingMarketOrder`). Without try/finally, `current` stays set.
**How to avoid:** Mint inside try; clear in finally. Code-review checklist item; ESLint rule optional but expensive to author for one call site per file.
**Warning signs:** Two consecutive trades emitting events with the same `trade_id`.

### Pitfall 3: CSP missing `worker-src 'self' blob:` for Sentry Replay
**What goes wrong:** Sentry Replay uses a Web Worker for compression; without CSP allowance, Replay silently degrades.
**Why:** [CITED: Sentry SvelteKit Replay docs.] Required directive: `worker-src 'self' blob:`.
**How to avoid:** Already present in CSP at `src/hooks.server.ts:201`. Verify post-deploy via DevTools console (no CSP violations on a real trade page).
**Warning signs:** Sentry events fire but no replay attached; CSP violation reports for `worker-src`.

### Pitfall 4: Edge-runtime opt-in breaks pino `trade_id`
**What goes wrong:** A future SvelteKit route declares `export const config = { runtime: 'edge' }`; `getRequestContext()` returns undefined; `trade_id` doesn't appear in those logs.
**Why:** Already documented in `logger.ts:11-13`. Edge has no `node:async_hooks`.
**How to avoid:** No new Edge routes in this phase. Inherit existing v1.0 OBS-02 invariant.

### Pitfall 5: Same-origin assumption on `X-Trade-Id` header
**What goes wrong:** Trade flows that hit a third-party API (e.g., Pyth Hermes, Goldsky subgraph, Rain Oracle Server) cannot send the custom header without CORS preflight allow-list approval.
**Why:** Custom request headers trigger CORS preflight.
**How to avoid:** Only attach `X-Trade-Id` to **same-origin** fetches (`/api/...`). Third-party calls don't need it — they're upstream of the SvelteKit endpoint that already has the header.
**Warning signs:** CORS preflight failures on Pyth/Goldsky requests; OPTIONS preflight 4xx in browser console.

### Pitfall 6: Dynamic embedded-wallet flow doesn't use the same submit handler shape
**What goes wrong:** Dynamic SDK might internally trigger signing flows that bypass the submit handler — the `trade_id` would not be in scope when the signature event happens.
**Why:** Dynamic's embedded-wallet path can trigger signing UI asynchronously.
**How to avoid:** `walletService.ts` is the unified surface. The submit handler mints the `trade_id` BEFORE the signing call regardless of which auth path. Verify by inspecting `walletService.ts` signing helpers and confirming the helper does not lose context. Manual test for OBS-10 must use a Dynamic embedded wallet on at least one of the smoke trades.
**Warning signs:** Sign-step events have `trade_id: null`.

### Pitfall 7: Event-name collision with existing taxonomy
**What goes wrong:** Existing events `trade_panel_opened`, `trade_button_clicked`, `trade_initiated`, `trade_failed`, `trade_panel_abandoned`, `trade_error_shown`, `limit_order_deployed` already exist in PostHog dashboards/funnels (if any). Renaming breaks history.
**Why:** PostHog funnels reference event names by string.
**How to avoid:** Migration plan — emit both old and new names for one release ("dual-emit"), update funnel to new names, remove old emissions in a follow-up. Or: keep snake_case names and just ADD the missing steps; the new taxonomy doc just canonicalizes what already exists. **Recommendation: keep existing snake_case names** (`trade_panel_opened`, etc.); ADD missing steps (`quote_received`, `sign_approval`, `sign_trade`, `broadcast`, `confirmed`); align DCA component to the same names. No dual-emit needed.

## Code Examples

### OBS-09 Same-origin fetch wrapper (header propagation)
```typescript
// Optional helper — only needed if any client-side fetch to /api/* doesn't already use a wrapper.
import { TRADE_ID_HEADER, getCurrentTradeId } from './tradeId';

export async function fetchWithTradeId(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const tradeId = getCurrentTradeId();
  if (!tradeId) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set(TRADE_ID_HEADER, tradeId);
  return fetch(input, { ...init, headers });
}
```

### OBS-09 captureTakeOrderFailure tag site
```typescript
// MODIFY src/lib/services/observability/captureTakeOrderFailure.ts:88
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Code-side PostHog `sampleRate` config | Dashboard-side ingestion control | Modern posthog-js (1.85.0+) | Operator step in RUNBOOK; no code change |
| Sentry Replay as separate `@sentry/replay` package | Bundled into `@sentry/sveltekit` v8+ | Sentry SDK v8 (2024) | Single import; no extra dep |
| Page-load page_view tracking | Manual `trackPageView` with semantic page name | Project decision (`analytics.ts:23`) | OBS-07 page-opened follows the same manual pattern |

**Deprecated/outdated:**
- The "no Sentry" line in `INTEGRATIONS.md` is stale (per CONTEXT canonical_refs). Opportunistic side-update; not blocking.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `crypto.randomUUID()` is available in all browsers Dynamic / wagmi support today | Pattern 2 | Low — Web Crypto API; Safari ≥15.4, Chrome ≥92, Firefox ≥95. Trade page already requires modern browser for wallet flows. |
| A2 | `Sentry.setTag('trade_id', ...)` setting and unsetting on the global scope is safe even when Sentry is disabled (dev mode) | Pattern 2 | Low — Sentry SDK no-ops gracefully when `enabled: false`. Try/catch guards anyway. |
| A3 | PostHog session-recording sample rate is set in the dashboard, not via init config, in the version pinned (`1.337.0`) | Pitfall 1 | MEDIUM — confirmed against current docs but pinned version is older; planner should verify in PostHog UI before deciding to drop the code-side config. **Confirmation step:** check whether `1.337.0` honors `session_recording.sampleRate` by setting it to 0 in dev and confirming no recording happens. |
| A4 | The submit handler in `MarketOrder.svelte:842` is the only mint site needed for market orders (no other code path triggers a market trade) | Pattern 2 | Low — verified by grep: only one `executeMarketOrder` call site. |
| A5 | Existing snake_case event names should be retained rather than renamed to dotted (`trade.submit_clicked`) | Pitfall 7 | Low — preserves PostHog history, lower migration risk. Planner can override if no PostHog dashboards depend on names today. |
| A6 | Dynamic embedded wallet signing call is invoked synchronously from within the same JS task as the submit handler (so module-level `current` is still valid) | Pitfall 6 | MEDIUM — verify by reading `walletService.ts` signing flow before sealing OBS-09 plan. |
| A7 | DCA deploy flow shares enough shape with Limit deploy that the same taxonomy applies (`order_type: 'dca'`, no per-cycle event spam) | OBS-07 §scope | Low — DCA is a deploy-once strategy; the deploy event is the relevant moment. Per-cycle execution is upstream Rain protocol behavior, not user-visible. |
| A8 | OBS-08 funnel "broken out by order_type" works in PostHog UI as a Breakdown on the `order_type` event property | OBS-08 | Low — standard PostHog Funnels feature. |

## Open Questions (RESOLVED)

1. **Should `trade_id` propagate to the Pyth Hermes / Goldsky subgraph / Rain Oracle Server requests?**
   - What we know: These are third-party calls; adding a custom header triggers CORS preflight.
   - What's unclear: Whether per-RPC attribution (deferred per backlog 999.6) wants this hook in place.
   - RESOLVED: NO for this phase — propagate only to same-origin `/api/*` calls. Per-RPC attribution remains deferred.

2. **What's the policy for OBS-08 funnel filtering — exclude failed-pre-submit (validation) attempts?**
   - What we know: `trade_panel_opened` fires on page mount; `trade_button_clicked` fires on the click even if the user isn't authenticated.
   - What's unclear: Should the funnel start at `submit_clicked` (only people who actually intended to trade) or at `page_opened` (entire intent funnel)?
   - RESOLVED: TWO funnels in one dashboard — (a) intent funnel from `page_opened` → `quote_received` → `submit_clicked`, (b) execution funnel from `submit_clicked` → `sign_*` → `broadcast` → `confirmed`. Both broken out by `order_type`.

3. **Cookie-consent gating for Sentry Replay?**
   - What we know: PostHog is gated behind cookie consent (`initAnalytics` only runs after consent per v1.0). Sentry currently runs from module load without consent.
   - What's unclear: Is on-error Sentry Replay (D-02) considered "essential" or "analytics" under the consent policy?
   - RESOLVED: Treat as essential (it activates only on errors and is the primary triage tool); document this stance in `02-PRIVACY-REVIEW.md`. Operator/legal sign-off required.

4. **Production readiness of pinned `posthog-js` 1.337.0 for OBS-08 funnels?**
   - What we know: PostHog SDK supports funnels regardless of version (funnels are dashboard-side, not SDK-side).
   - What's unclear: Whether the `defaults: '2025-11-30'` snapshot in `analytics.ts:22` controls anything funnel-relevant.
   - RESOLVED: No version bump; if funnel issues arise, they're fixed in dashboard config not code.

5. **Where exactly does `trade.broadcast` and `trade.confirmed` fire in `executeMarketOrder`?**
   - What we know: `marketOrderExecution.ts` orchestrates the take-order path; it returns success/error to the caller.
   - What's unclear: Whether the SDK exposes a "broadcast" callback distinct from "confirmed", or if these collapse into one event in the existing call shape.
   - RESOLVED: Plan tasks should include a small spike to map exact callback points in `marketOrderExecution.ts` and `orderDeployment.ts` before writing the emission code.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Sentry account + Replay quota | OBS-06 | ✓ (assumed — v1.0 OBS-01 shipped) | EU region | None — operator must enable Replay on the project |
| PostHog account + Recordings quota | OBS-08, D-04 | ✓ | EU region | None |
| Vercel Logs (pino sink) | OBS-09 server-side | ✓ | n/a | None — built-in |
| `crypto.randomUUID` browser | OBS-09 mint | ✓ | Web Crypto API | `crypto.getRandomValues` polyfill if a browser regression appears |
| `node:async_hooks` (pino propagation) | OBS-09 server | ✓ | Node 18+ on Vercel Node runtime | Edge runtime opt-out per existing `logger.ts` doc |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

> nyquist_validation: enabled (config.json `workflow.nyquist_validation: true`)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom) for unit + `@testing-library/svelte` for component; Playwright for UI E2E (Phase 1 harness) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npm test -- src/lib/services/observability` |
| Full suite command | `npm test && npm run check` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| OBS-06 | `Sentry.replayIntegration` registered with D-02/D-03 config in `hooks.client.ts` | unit (config inspection) | `npm test -- tests/lib/observability/sentryReplayConfig.test.ts` | ❌ Wave 0 |
| OBS-06 | CSP header includes `worker-src 'self' blob:` (regression guard) | unit | `npm test -- tests/lib/server/csp.test.ts` (extend if exists) | ❌ Wave 0 (verify existing CSP test) |
| OBS-06 | Real on-error replay capture in production | manual | RUNBOOK smoke (OBS-10) | n/a (manual) |
| OBS-07 | `trackTradeEvent` emits canonical event names with required properties | unit | `npm test -- tests/lib/services/observability/tradeEvents.test.ts` | ❌ Wave 0 |
| OBS-07 | Each step (`page_opened`..`confirmed`/`failed`) fires from each component (Market/Limit/DCA) | component | `npm test -- tests/lib/components/orders/MarketOrder.events.test.ts` (and Limit/Dca) | ❌ Wave 0 |
| OBS-07 | Server-side pino logs include `trade_id` when header present | unit (logger context) | `npm test -- tests/lib/server/logger.tradeId.test.ts` | ❌ Wave 0 |
| OBS-07 | DCA deploy emits the canonical event taxonomy (gap-fill — none today) | component | included in DCA component test above | ❌ Wave 0 |
| OBS-08 | Funnel exists in PostHog with named drop-off steps, broken out by `order_type` | manual + artifact | RUNBOOK screenshot + exported funnel JSON checked into `.planning/phases/02-.../artifacts/` | n/a (manual) |
| OBS-09 | `mintTradeId` produces a v4 UUID and `Sentry.setTag` is called | unit | `npm test -- tests/lib/services/observability/tradeId.test.ts` | ❌ Wave 0 |
| OBS-09 | `requestContextHandle` extracts `X-Trade-Id` and validates UUIDv4 shape | unit | `npm test -- tests/lib/server/logger.tradeId.test.ts` | ❌ Wave 0 (shared file with OBS-07) |
| OBS-09 | E2E: a failing trade emits a Sentry event tagged with the `trade_id` that also appears in PostHog events for that session | E2E (Anvil-fork harness from Phase 1) | `npm run test:integration -- tests/integration/ui/observability/correlation.test.ts` | ❌ Wave 0 |
| OBS-09 | Same-origin `/api/*` fetches in trade flow propagate `X-Trade-Id` | unit (fetch wrapper) | `npm test -- tests/lib/services/observability/fetchWithTradeId.test.ts` (only if helper introduced) | ❌ Wave 0 if helper added |
| OBS-10 | Real production trade visible end-to-end across Sentry replay + PostHog event/funnel + Vercel pino logs | manual | RUNBOOK smoke (operator runs after deploy) | n/a (manual) |
| OBS-11 | Privacy review checklist signed off | manual | `02-PRIVACY-REVIEW.md` exists with checked items | n/a (manual) |
| OBS-11 | `track()` event property contract excludes `0x[40]` addresses (regression guard) | unit | `npm test -- tests/lib/services/observability/tradeEvents.privacy.test.ts` (assert no property named like an address; lint-style) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- src/lib/services/observability` (subsystem unit tests, < 30s)
- **Per wave merge:** `npm test && npm run check` (full unit suite + svelte-check + tsc)
- **Phase gate:** Full suite green + UI E2E correlation test green + manual OBS-10 smoke documented before `/gsd-verify-work`

### How OBS-10's "real production trade roundtrip" is captured
- Manual operator smoke from a real wallet on production immediately after deploy.
- Operator performs ONE Buy market trade and ONE Limit deploy (DCA optional based on real-trade tolerance).
- For each: capture three screenshots into `02-RUNBOOK.md`:
  1. Sentry event detail page (or, for a successful trade, an intentionally-induced failure to show Replay attaches — see Open Question for whether to manually trigger one)
  2. PostHog event timeline showing the events for that `trade_id` in order
  3. Vercel Logs filter showing pino lines with the same `trade_id` field
- Pattern mirrors v1.0 Phase 2 PERF-01 HUMAN-UAT (post-deploy human verification, not synchronous CI gate).

### Privacy Review Acceptance Criteria (OBS-11)
- A `02-PRIVACY-REVIEW.md` checklist file exists with the following sections, each with operator sign-off line:
  1. **Replay masking** — Sentry defaults documented; PostHog `maskAllInputs` documented; delta noted.
  2. **Event property contract audit** — `TradeEventProps` fields enumerated; PII classification per field (asset_symbol = NOT PII; wallet_address auto-added by `track()` enrichment = PII but admin-only-readable per existing PostHog policy).
  3. **Sentry boundary scrubber coverage** — references `src/lib/observability/scrub.ts`; confirms `0x[40]`/`0x[130]`/signature-query-param patterns still in force.
  4. **Cookie consent stance** — Sentry Replay activation policy documented (per Open Question 3).
  5. **Cross-references CONCERNS.md** — every PII-adjacent recommendation in CONCERNS.md `## Security Considerations` reviewed; no regressions introduced.

### Wave 0 Gaps
- [ ] `tests/lib/services/observability/tradeEvents.test.ts` — covers OBS-07 emission contract
- [ ] `tests/lib/services/observability/tradeId.test.ts` — covers OBS-09 mint/get/clear lifecycle
- [ ] `tests/lib/server/logger.tradeId.test.ts` — covers OBS-07 server-side + OBS-09 header extraction
- [ ] `tests/lib/components/orders/MarketOrder.events.test.ts` (+ Limit, Dca) — covers per-step emission
- [ ] `tests/lib/observability/sentryReplayConfig.test.ts` — covers OBS-06 config inspection
- [ ] `tests/integration/ui/observability/correlation.test.ts` — covers end-to-end correlation under E2E harness
- [ ] `tests/lib/services/observability/tradeEvents.privacy.test.ts` — covers OBS-11 regression guard
- [ ] `tests/lib/server/csp.test.ts` — verify or extend; ensure `worker-src 'self' blob:` is asserted

## Security Domain

> security_enforcement: enabled (ASVS Level 1, block on high)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth) | n/a |
| V3 Session Management | no (no new sessions) | n/a |
| V4 Access Control | no (no new authz boundaries) | n/a |
| V5 Input Validation | yes | `X-Trade-Id` header validated as UUIDv4 regex before storing in `RequestContext` (defense against header injection / log forgery). Same hardening pattern already used for `request_id` (no validation) and session IDs (regex `/^[a-f0-9]{64}$/`). |
| V6 Cryptography | yes (uses CSPRNG for ID) | `crypto.randomUUID()` browser + `randomUUID` from `node:crypto` server — both CSPRNG-backed. Never roll a custom RNG. |
| V8 Data Protection | yes | OBS-11 PII review is the central control. No PII in event properties; Sentry boundary scrubber unchanged; PostHog `maskAllInputs` retained. |
| V14 Configuration | yes | CSP `worker-src 'self' blob:` for Sentry Replay (already present, regression-guard with test). |

### Known Threat Patterns for SvelteKit + Sentry + PostHog stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Header injection / log forgery via `X-Trade-Id` | Tampering | Regex-validate as UUIDv4 before storage; reject otherwise |
| PII leak through Sentry event payload | Information disclosure | Existing `scrubSentryEvent` in `beforeSend`/`beforeBreadcrumb`; OBS-11 review confirms all new event surfaces routed through it |
| PII leak through PostHog event properties | Information disclosure | Property contract via typed `TradeEventProps`; only enumerated, classified fields allowed |
| Session Replay capturing sensitive UI | Information disclosure | D-03 maximum masking (`maskAllText` + `maskAllInputs`) |
| CSP bypass via Replay worker | Tampering | `worker-src 'self' blob:` allowance scoped to Sentry's needs only |
| Cross-tool ID leak (third-party SaaS sees `trade_id`) | Information disclosure | `trade_id` is opaque random UUID with no derivation from PII; no leak even if intercepted |

## Recommended Phase Sequencing

The phase decomposes into 5 waves. **Wave 0 is mandatory test scaffolding (Nyquist).** The body of work is small enough that some waves could be merged at the planner's discretion.

### Wave 0 — Test scaffolding (no behavior change)
- Create empty test files listed in §Wave 0 Gaps with skipped placeholders.
- Confirm Phase 1 E2E harness (`tests/integration/ui/`) supports a new `observability/` subdir.
- ~1 task.

### Wave 1 — Foundation modules (parallel-safe)
- 1a. **OBS-09 trade ID lifecycle** — `src/lib/services/observability/tradeId.ts`. Pure module, no dependencies on order components.
- 1b. **OBS-09 pino RequestContext extension** — modify `src/lib/server/logger.ts` (add `trade_id` field; extract from header in `requestContextHandle`).
- 1c. **OBS-07 trade events module** — `src/lib/services/observability/tradeEvents.ts`. Depends on 1a (imports `getCurrentTradeId`).
- All three behind tests from Wave 0.

### Wave 2 — Sentry Replay (parallel with Wave 1; touches different files)
- 2a. **OBS-06 Sentry Replay integration** — modify `src/hooks.client.ts` only. Add CSP regression test.
- 2b. **OBS-09 Sentry tag in captureTakeOrderFailure** — modify `src/lib/services/observability/captureTakeOrderFailure.ts:88` (add `trade_id` tag). Depends on Wave 1a.

### Wave 3 — Component instrumentation (sequential — same files modified)
- 3a. **MarketOrder.svelte** — mint `trade_id` in `handleMarketOrder`; replace ad-hoc `track()` calls with `trackTradeEvent`; add missing steps (`quote_received`, `sign_approval`, `sign_trade`, `broadcast`, `confirmed`); ensure `clearTradeId()` in finally.
- 3b. **LimitOrder.svelte** — same shape; align with canonical taxonomy.
- 3c. **DcaOrder.svelte** — gap-fill from zero; instrument deploy flow.
- 3d. **`trade/[id]/+page.svelte`** — `page_opened` event continues to fire here (no `trade_id` yet — OBS-08 funnel intent step).
- 3e. **`marketOrderExecution.ts` + `orderDeployment.ts`** — emit `quote_received`, `sign_*`, `broadcast`, `confirmed` events at the precise SDK callback points (requires the spike from Open Question 5).

### Wave 4 — SaaS configuration + funnel (operator + repo artifact)
- 4a. **PostHog dashboard sample-rate change** — operator step in PostHog UI; document in RUNBOOK with screenshot.
- 4b. **Sentry project Replay enable** — operator step in Sentry UI; document in RUNBOOK.
- 4c. **OBS-08 funnel build** — manual configuration in PostHog UI; export funnel JSON to `.planning/phases/02-.../artifacts/funnel.json`; screenshot to RUNBOOK.

### Wave 5 — Verification + privacy review (sequential, both required)
- 5a. **OBS-11 privacy review** — author `02-PRIVACY-REVIEW.md`; operator sign-off.
- 5b. **OBS-10 production smoke** — operator runs real trade(s) on production after deploy; captures 3-screenshot bundle into RUNBOOK.

### Sequencing summary

```
Wave 0 ──► Wave 1 ─┬─► Wave 3 ──► Wave 4 ──► Wave 5
                   │
         Wave 2 ───┘
```

Waves 1 and 2 can run in parallel (different files). Wave 3 must follow Wave 1 (depends on `trackTradeEvent` and `mintTradeId`). Wave 4 must follow Wave 3 (funnel needs events flowing to confirm in dashboard). Wave 5 must follow everything else (verifies the integrated system).

**Total task count estimate:** 12–16 tasks across 6 waves. Within solo-team coarse-granularity bias (3 plans of 4–6 tasks each is reasonable).

## Sources

### Primary (HIGH confidence)
- `package.json` — verified Sentry/PostHog/pino versions
- `src/lib/services/analytics.ts` — verified `track()` shape, identify/reset wiring
- `src/lib/observability/scrub.ts` — verified scrubber contract
- `src/lib/server/logger.ts` — verified `RequestContext` + AsyncLocalStorage pattern
- `src/hooks.client.ts` + `src/hooks.server.ts` — verified Sentry init shape + CSP `worker-src 'self' blob:`
- `src/lib/components/orders/MarketOrder.svelte` + `LimitOrder.svelte` — verified existing event names + submit handler shape
- `src/lib/services/observability/captureTakeOrderFailure.ts` — verified Sentry tag site
- Grep `track\|trackPageView` over `src/lib/components/orders/DcaOrder.svelte` — confirmed zero analytics today (gap)

### Secondary (MEDIUM confidence — vendor docs, dated)
- [CITED: docs.sentry.io/platforms/javascript/guides/sveltekit/session-replay/] — `replayIntegration` import + on-error buffer behavior + CSP `worker-src 'self' blob:`
- [CITED: posthog.com/docs/session-replay/how-to-control-which-sessions-you-record] — sampling configured in dashboard, not init config

### Tertiary (LOW confidence — needs validation)
- A3 (PostHog 1.337.0 sample-rate code-side honoring) — confirm in PostHog UI / by spike before planning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and modules verified in package.json + code
- Architecture: HIGH — every file path and integration point read in this session
- Pitfalls: MEDIUM-HIGH — Pitfalls 1, 3, 4, 5, 7 verified against docs/code; Pitfalls 2, 6 are reasoned from project conventions and warrant explicit code-review attention

**Research date:** 2026-05-07
**Valid until:** 2026-06-07 (30 days — observability stack is stable, vendor docs slow-moving, no in-flight Sentry/PostHog SDK majors)

## RESEARCH COMPLETE
