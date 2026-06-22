# Phase 1: Shrink the Surface, See What's Happening - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 38 (7 CREATE, 14 MODIFY, 17 DELETE)
**Analogs found:** 11 strong matches; 4 greenfield (anchored to CONVENTIONS.md)

---

## File Classification

### CREATE

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/server/logger.ts` | server-only helper module + handle hook | request-response | `src/lib/server/auditLog.ts` (server-only fire-and-forget logger) | role-match |
| `src/lib/server/rpcMetrics.ts` | server-only helper module | event-driven | `src/lib/utils/monitoring.ts` (`logQueryFailure` structured-log emitter) | role-match |
| `src/lib/server/alerts.ts` | server-only helper module | request-response (outbound POST) | `src/lib/server/snapshots/pyth.ts:200-211` (fetch with `AbortSignal.timeout`); fail-closed pattern from `src/routes/api/cron/snapshots/+server.ts:38-52` | partial-match (greenfield Slack) |
| `src/lib/services/observability/captureTakeOrderFailure.ts` | utility (browser-tier) | event-driven | `src/lib/utils/monitoring.ts` (sibling helper that emits structured JSON via `console.warn`) | role-match |
| `src/lib/observability/scrub.ts` | utility (shared client+server) | transform | None — pure-function utility; anchor to CONVENTIONS.md ("pure helpers under `src/lib/utils/`") | greenfield |
| `src/hooks.client.ts` | SvelteKit client hook (entry-point) | event-driven | None — file does not exist today; `src/lib/services/analytics.ts:17-39` (`initAnalytics`) is the nearest init-shape analog | greenfield |
| `src/lib/stores/announcementStore.ts` | Svelte store module | event-driven | `src/lib/stores/tutorialStore.ts` (single-purpose `writable` + browser-localStorage init helpers) | exact |
| `src/lib/components/announcements/TokenSwapAnnouncementModal.svelte` | Svelte component (move) | event-driven | `src/lib/components/rewards/TokenSwapAnnouncementModal.svelte` (the file itself; this is a `git mv`) | exact |

### MODIFY

| Modified File | Role | Data Flow | Pattern Reference |
|---------------|------|-----------|-------------------|
| `src/hooks.server.ts` | SvelteKit server hook | request-response | (in-place CSP edit + `sequence()` chain extension) |
| `src/lib/server/snapshots/generator.ts` | server-only helper | CRUD (RPC) | (in-place edit per Pattern 4 in RESEARCH §"Code Examples") |
| `src/lib/server/snapshots/processor.ts` | server-only helper | transform | (delete per-wallet points calc per D-03) |
| `src/lib/server/accessCodes.ts` | server-only auth helper | request-response | (in-place edit per Pattern 4) |
| `src/lib/services/marketOrderExecution.ts` | client-tier service | event-driven | (transcript-builder seam at function entry per RESEARCH §"OBS-03 capture seam analysis") |
| `src/lib/components/DepositModal.svelte` | Svelte component | event-driven | (rewrite per UI-SPEC + RESEARCH "Deleted-content baseline") |
| `src/lib/components/Header.svelte` | Svelte component | request-response | (delete commented-out RewardsDisplay refs at lines 148, 352) |
| `src/routes/(main)/+layout.svelte` | SvelteKit layout | event-driven | (update import path of TokenSwapAnnouncement; remove rewards mounts at 173-175) |
| `src/routes/api/cron/snapshots/+server.ts` | route handler | CRUD | (remove `updateMonthlyPoints` import + call per D-03; remove `invalidateRewardsCaches` if rewards-only) |
| `src/lib/stores/dynamicStore.ts` | Svelte store | event-driven | (delete `depositModalInitialView` export + `setDepositModalInitialView` setter per D-10) |
| `src/lib/server/auditLog.ts` | server-only helper | event-driven | (remove `'ONRAMPER_URL_SIGNED'` from union per Pitfall 6) |
| `src/lib/server/rateLimit.ts` | server-only helper | request-response | (remove `onramper:` tier at lines 322-326 per Pitfall 7) |
| `.env.example` | config | — | (add Sentry/Slack vars; remove Onramper + LP_SUBGRAPH_URL) |
| `package.json` | config | — | (add `@sentry/sveltekit`, `pino`) |
| `vite.config.js` | config | — | (wire `sentrySvelteKit` plugin per Pattern 1) |

### DELETE

All deletions per RESEARCH §"Deletion Graph". Grouped:

| File group | Files | Action |
|-----------|-------|--------|
| User-facing rewards UI (DEPR-01) | `src/lib/components/rewards/{RewardsDetailsModal,RewardsLeaderboardModal,RewardsDisplay}.svelte` | DELETE |
| Rewards store body (DEPR-01) | `src/lib/stores/rewardsStore.ts` | DELETE entirely after extracting `initTokenSwapAnnouncement` + `tokenSwapAnnouncementVisible` to new `announcementStore.ts` |
| Public rewards APIs (DEPR-01) | `src/routes/api/rewards/{user,leaderboard,global,pool-apy}/+server.ts`; `src/routes/api/public/{wallet,rewards-apy,rocketboost}/+server.ts` | DELETE |
| Admin rewards (DEPR-02) | `src/routes/admin/rewards/+page.svelte` (4933 lines); `src/routes/api/admin/rewards-pool/+server.ts` | DELETE |
| Rewards points pipeline (DEPR-02 / D-03) | `src/lib/server/snapshots/points.ts`; `src/lib/server/rewards/rewardsCommon.ts`; `src/routes/api/snapshots/points/+server.ts` | DELETE |
| Onramper (DEPR-03) | `src/lib/components/OnramperModal.svelte`; `src/routes/api/onramper/sign-url/+server.ts` | DELETE |

---

## Pattern Assignments

### NEW: `src/lib/server/logger.ts`  (greenfield server-only module + handle hook)

**Closest analog:** `src/lib/server/auditLog.ts` — same `src/lib/server/` placement, fire-and-forget I/O, exports both raw helpers AND a request-bound factory (`createAuditLogger`).

**Imports + module-doc pattern** (`src/lib/server/auditLog.ts:1-7`):
```typescript
/**
 * Audit logging for sensitive operations.
 * Logs are stored in Redis with a TTL for compliance and debugging.
 */

import { getKv } from './kv';
import { getClientIp } from './rateLimit';
```

**Request-bound factory pattern** (`src/lib/server/auditLog.ts:120-150`):
```typescript
/**
 * Helper function to create audit logger for a specific request.
 * Makes it easier to log multiple events from the same request.
 */
export function createAuditLogger(request: Request) {
    return {
        log: (
            eventType: AuditEventType,
            details: Record<string, unknown>,
            options?: {
                walletAddress?: string;
                adminUser?: string;
                success?: boolean;
                errorMessage?: string;
            }
        ) => logAuditEvent(request, eventType, details, options),
        // ...
    };
}
```

**Existing structured-log shape to copy** (`src/lib/utils/monitoring.ts:37-48`):
```typescript
export function logQueryFailure(event: QueryFailureEvent): void {
    try {
        // Surface a human-readable summary AND a structured payload on a single line.
        console.warn(
            `[monitor] ${event.kind}:`,
            JSON.stringify({ ts: new Date().toISOString(), ...event })
        );
    } catch {
        // Logging must never throw back into the caller.
        console.warn('[monitor] failed to serialize failure event', event.kind, event.error);
    }
}
```

**Implementation guidance:** Use the full sketch from RESEARCH §"Pattern 2" lines 358-446 (pino + AsyncLocalStorage `requestContextHandle`, `getLogger()`, `getRequestContext()`, `pickLevelForRoute()`). Per CONVENTIONS.md "Server-Side Conventions": this is server-only, must NOT be imported from `.svelte` or browser-only TS. Use `import { dev } from '$app/environment'` and `import { env } from '$env/dynamic/private'` per CONVENTIONS.md "Path Aliases". Per Pitfall 2 (RESEARCH:763), document at the top of `logger.ts` that AsyncLocalStorage requires Node runtime — Edge breaks it.

**What to keep / change vs. analog:**
- Keep: file placement (`src/lib/server/`), module-top JSDoc, fire-and-forget try/catch wrapping (logging never throws back).
- Change: pino instead of `console.warn`/Redis; emit JSON directly to stdout; expose `Handle`-typed `requestContextHandle` for use in `hooks.server.ts` `sequence()`.

---

### NEW: `src/lib/server/rpcMetrics.ts`  (server-only helper)

**Closest analog:** `src/lib/utils/monitoring.ts` — same single-purpose structured-log emitter, narrow type vocabulary.

**Single-purpose helper pattern** (`src/lib/utils/monitoring.ts:11-31`):
```typescript
export type QueryFailureKind =
    | 'subgraph_page_failed'
    | 'subgraph_page_retry'
    | 'subgraph_pagination_interrupted'
    | 'pyth_hermes_retry'
    | 'pyth_hermes_failed'
    | 'public_endpoint_network_failed';

export interface QueryFailureEvent {
    kind: QueryFailureKind;
    endpoint?: string;
    itemsKey?: string;
    network?: string;
    attempt?: number;
    maxAttempts?: number;
    skip?: number;
    itemsSoFar?: number;
    status?: number;
    permanent?: boolean;
    error: string;
}
```

**Implementation guidance:** Per RESEARCH §"Pattern 4" lines 540-578: export `recordRpcAttempt({ rpc_url, fn, ok, status_or_error, duration_ms })` and `reportChainExhausted({ fn, attempts })`. `recordRpcAttempt` calls `getLogger().debug(...)` on success and `getLogger().warn(...)` on failure. `reportChainExhausted` calls `getLogger().error(...)` AND awaits `notifyChainExhausted(...)` from `alerts.ts` with a try/catch wrapper logging delivery-failure at `error` level.

**What to keep / change vs. analog:**
- Keep: narrow `interface RpcAttempt` shape; module-top JSDoc; never throw back to caller.
- Change: import the new pino logger from `$lib/server/logger` instead of using `console.warn`; expose async `reportChainExhausted` (because Slack delivery is async); RPC-domain vocabulary instead of subgraph/Pyth.
- Co-locate with `monitoring.ts`'s style: module-top doc explains WHY this lives separately ("RPC-tier metric, distinct from subgraph/HTTP failures in `monitoring.ts`").

---

### NEW: `src/lib/server/alerts.ts`  (greenfield Slack webhook poster)

**No exact analog.** Closest behavior:
- Outbound HTTP with `AbortSignal.timeout`: `src/lib/server/snapshots/pyth.ts:200-211`.
- Fail-closed env-var pattern in production / warn-skip in dev: `src/routes/api/cron/snapshots/+server.ts:38-52`.

**Outbound fetch with timeout pattern** (`src/lib/server/snapshots/pyth.ts:200-211`):
```typescript
const monitorUrl = env.LIQUIDITY_MONITOR_URL;
if (monitorUrl) {
    try {
        const res = await fetch(
            `${monitorUrl.replace(/\/$/, '')}/api/prices/spym`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
            const data = await res.json();
            monitorPrice = data.price ?? null;
        }
    } catch (e) {
        console.warn('[Pyth] liquidity-monitor SPYM fetch failed:', e);
    }
}
```

**Fail-closed env pattern** (`src/routes/api/cron/snapshots/+server.ts:38-52`) — anchor for D-09:
```typescript
const authHeader = request.headers.get('authorization');
const cronSecret = env.CRON_SECRET;

// Fail closed in production if CRON_SECRET is missing
if (!cronSecret && !dev) {
    console.error('[Cron] CRON_SECRET is not configured');
    return json({ error: 'Cron endpoint not configured' }, { status: 503 });
}
```

**Anchor (CONVENTIONS.md):** Server-only module under `src/lib/server/`; access env via `$env/dynamic/private`; tag log lines with `[alerts]` per project convention; "Rate limiters fail closed when Redis is unavailable in production" → mirror that pattern for Slack URL.

**Implementation guidance:** Per RESEARCH §"Pattern 4" lines 580-625: export `notifyChainExhausted(payload)` posting JSON `{text: '...'}` to `env.OBSERVABILITY_ALERT_WEBHOOK_URL` with `AbortSignal.timeout(3000)`. Use `getWebhookUrl()` helper that returns `null` + logs `error` in production when var missing (mild form per RESEARCH:591 — does NOT throw at module load to avoid killing cold-start). Length-cap each `status_or_error` string to ~512 chars before embedding in Slack text (per Security Domain V5 in RESEARCH:1159).

**What to keep / change vs. analogs:**
- Keep: 3s `AbortSignal.timeout` (matches pyth.ts 5s budget but tighter for synchronous-feel alert); never let alert delivery exception bubble to caller.
- Change: fail-closed *softly* (return null + log) instead of `return json(...503)` (alerts.ts isn't a route handler).

---

### NEW: `src/lib/services/observability/captureTakeOrderFailure.ts`  (browser-tier helper)

**Closest analog:** `src/lib/utils/monitoring.ts` — sibling structured-log helper, but with Sentry as a second sink and the wider take-order transcript shape.

**Sibling-helper rationale (already documented in RESEARCH §"Pattern 3" lines 451-532):** Don't extend `monitoring.ts` — its kind enum is subgraph/Pyth-specific and OBS-03's transcript is wider/heavier. Make a dedicated module.

**Existing structured-log shape to mimic** (`src/lib/utils/monitoring.ts:37-48`, repeated above):
```typescript
console.warn(
    `[monitor] ${event.kind}:`,
    JSON.stringify({ ts: new Date().toISOString(), ...event })
);
```

**Browser-tier dual-sink (D-15) implementation:** Per RESEARCH §"Pattern 3" lines 487-511:
```typescript
export function captureTakeOrderFailure(
    err: unknown,
    transcript: TakeOrderTranscript,
    reason: 'no_quotes_available' | 'no_walk_fills' | 'unhydrated_fills' | 'aggregated_failed' | 'caught_exception'
): void {
    Sentry.captureException(err, {
        tags: { failure_reason: reason, side: transcript.side },
        extra: { ...transcript, errorMessage: err instanceof Error ? err.message : String(err) }
    });
    console.error('[take-order failed]', JSON.stringify({
        ts: transcript.timestamp,
        reason,
        ...transcript,
        error: err instanceof Error ? err.message : String(err)
    }));
}
```

**Anchor (CONVENTIONS.md):** Per "Module Design" — one concept per file. Per "Where to Add New Code" → "New service / business-logic module: `src/lib/services/<name>.ts`". A subdirectory `services/observability/` is acceptable because it groups several future helpers; alternatively `src/lib/utils/captureTakeOrderFailure.ts` aligns with the existing `monitoring.ts` neighborhood. **Planner picks one** — recommendation: `src/lib/services/observability/` so it can grow. Either is conventional.

**What to keep / change vs. analog:**
- Keep: `console.error('[tag]', JSON.stringify(...))` shape; ts-prefixed payload; never let helper throw.
- Change: dual-sink (Sentry + console.error) instead of `console.warn`-only; level=error not warn (these are real failures); transcript is structured per the taker-side `TakeOrderTranscript` interface in RESEARCH:461-485.

---

### NEW: `src/lib/observability/scrub.ts`  (shared client+server pure-function utility)

**No analog** — pure scrubber utility is greenfield. Anchor to CONVENTIONS.md "Module Design": "One concept per file"; "pure helpers" go in `src/lib/utils/`. RESEARCH placed it at `src/lib/observability/scrub.ts` to signal cross-tier (client+server) usage; either path is fine. **Planner picks; recommendation:** `src/lib/observability/scrub.ts` so the future `instrumentation.server.ts`/Sentry-init code can co-locate.

**Implementation guidance:** Per RESEARCH §"Code Examples — `scrubSentryEvent` PII walker" lines 821-852:
```typescript
import type { ErrorEvent, Event, Breadcrumb } from '@sentry/sveltekit';

const ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const SIG_RE = /0x[a-fA-F0-9]{130}/g;
const SIG_QUERY_RE = /([?&])signature=[^&]*/g;

function redactString(s: string): string {
    return s
        .replace(SIG_QUERY_RE, '$1signature=[REDACTED]')
        .replace(SIG_RE, '[REDACTED_SIGNATURE]')
        .replace(ADDR_RE, '[REDACTED_ADDR]');
}

function walk(value: unknown): unknown {
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = walk(v);
        }
        return out;
    }
    return value;
}

export function scrubSentryEvent<T extends Event | Breadcrumb>(input: T): T {
    return walk(input) as T;
}
```

**Anchor (CONVENTIONS.md):** "Pure helpers. No side effects, no I/O, no Svelte stores." Order regexes longest-first so signatures are caught before addresses (already done in sketch). Per assumption A3 (RESEARCH:927), the planner may extend regexes to include JWT and email — flag as plan-bounce decision, not a hard requirement. Per Pitfall 9 (RESEARCH:811-815), the `SIG_QUERY_RE` MUST run first.

**Unit test:** RESEARCH §"Validation Architecture" line 1141 says the planner SHOULD add a basic unit test (~20 lines) at `tests/lib/observability/scrub.test.ts` — pure function, trivial cost.

---

### NEW: `src/hooks.client.ts`  (greenfield SvelteKit client hook)

**No exact analog** — file does not currently exist. Closest init-shape analog is `src/lib/services/analytics.ts` (PostHog init).

**Init-shape pattern** (`src/lib/services/analytics.ts:17-39`):
```typescript
let initialized = false;
// ...
export function initAnalytics(apiKey: string): void {
    if (!browser || initialized || !apiKey) return;

    posthog.init(apiKey, {
        api_host: 'https://eu.i.posthog.com',
        defaults: '2025-11-30',
        capture_pageview: false,
        capture_pageleave: true,
        persistence: 'localStorage+cookie',
        autocapture: false,
        session_recording: { maskAllInputs: true, maskInputOptions: { password: true } }
    });

    initialized = true;
    setupWalletTracking();
}
```

**Implementation guidance:** Per RESEARCH §"Pattern 1" lines 258-288 — top-level `Sentry.init` (not in `onMount` per Pitfall in Anti-Patterns line 711) plus `export const handleError = Sentry.handleErrorWithSentry(myErrorHandler)`. Use `import { dev } from '$app/environment'` and `import { env } from '$env/dynamic/public'`. Gate enabled-flag on `!dev && Boolean(env.PUBLIC_SENTRY_DSN)`. Wire `beforeSend` and `beforeBreadcrumb` to `scrubSentryEvent` from `$lib/observability/scrub`. Free-tier conservation: `tracesSampleRate: 0`, `integrations: []`.

**Anchor (CONVENTIONS.md):** Per "Console policy" lines 192-193 — keep `console.error('[hooks.client] ...')` for the existing handler (tag with module name in brackets). Per "Comments" — file-top JSDoc explaining purpose.

**What to keep / change vs. analog:**
- Keep: top-level `let initialized` guard pattern; `if (!browser || ...) return;` early-exit; module tag in brackets for console calls.
- Change: Sentry init runs at module load (NOT inside an `init*()` function called from a component) — SDK must intercept errors during SSR/pre-mount; per Anti-Pattern in RESEARCH:711.

---

### NEW: `src/lib/stores/announcementStore.ts`  (extracted from rewardsStore.ts)

**Closest analog:** `src/lib/stores/tutorialStore.ts` — single-purpose store with browser-localStorage init helpers, `writable` + tiny init function.

**Single-purpose store pattern** (`src/lib/stores/tutorialStore.ts:25-62`):
```typescript
import { writable, derived } from 'svelte/store';
import { hideTutorial as persistHideTutorial } from '$lib/utils/tutorialStorage';

// Current tutorial step
export const tutorialStep = writable<TutorialStep>('welcome');

// Whether tutorial is active (visible)
export const tutorialActive = writable<boolean>(false);

// Complete and hide the tutorial
export function completeTutorial(): void {
    tutorialActive.set(false);
    tutorialStep.set('complete');
    persistHideTutorial();
}
```

**Existing exports to migrate (verbatim) from `src/lib/stores/rewardsStore.ts:84-110`:**
```typescript
// Modal visibility stores
export const showTokenSwapAnnouncementModal = writable(false);

// Local storage key for token swap announcement
const TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY = 'st0x_token_swap_announcement_seen';

// Check if user has seen the token swap announcement
export function hasSeenTokenSwapAnnouncement(): boolean {
    if (!browser) return true;
    return localStorage.getItem(TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY) === 'true';
}

// Mark token swap announcement as seen
export function markTokenSwapAnnouncementSeen(): void {
    if (!browser) return;
    localStorage.setItem(TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY, 'true');
    showTokenSwapAnnouncementModal.set(false);
}

// Initialize token swap announcement modal on first visit
export function initTokenSwapAnnouncement(): void {
    if (!browser) return;
    if (!hasSeenTokenSwapAnnouncement()) {
        showTokenSwapAnnouncementModal.set(true);
    }
}
```

**What to keep / change vs. analog:**
- Keep: every line of the four exports above — verbatim. CONTEXT D-16 says "Retain `initTokenSwapAnnouncement` + `tokenSwapAnnouncementVisible`."
- Change: file path (`stores/rewardsStore.ts` → `stores/announcementStore.ts`); update all 3 import sites (modal component, `(main)/+layout.svelte`, any other consumer found via grep).
- Per CONVENTIONS.md naming: `announcementStore.ts` (camelCase + `Store` suffix) is correct.

---

### NEW: `src/lib/components/announcements/TokenSwapAnnouncementModal.svelte`  (move)

**Analog:** the file itself — `src/lib/components/rewards/TokenSwapAnnouncementModal.svelte`. This is a `git mv` then update the import at the top.

**Single line to change** (`src/lib/components/rewards/TokenSwapAnnouncementModal.svelte:1-5`):
```svelte
<script lang="ts">
    import {
        showTokenSwapAnnouncementModal,
        markTokenSwapAnnouncementSeen
    } from '$lib/stores/rewardsStore';
```

**After move:** change the import to:
```typescript
import {
    showTokenSwapAnnouncementModal,
    markTokenSwapAnnouncementSeen
} from '$lib/stores/announcementStore';
```

**Anchor (CONVENTIONS.md / STRUCTURE.md):** Components are feature-grouped under `src/lib/components/<feature>/`. Per CONTEXT D-16, the destination is `src/lib/components/announcements/`. The directory does not exist yet — create it.

**What to keep / change vs. analog:** Body verbatim (lines 7-119 of the original) — only the import path and the file location change.

---

### MODIFY: `src/hooks.server.ts`  (CSP + sequence chain extension)

**Pattern source (in-place):** Existing `handle: Handle` is the single export at line 341. Wrap it via `sequence()` from `@sveltejs/kit/hooks`.

**CSP `connect-src` excerpt to edit** (`src/hooks.server.ts:152-173`):
```typescript
const CSP_DIRECTIVES = [
    "default-src 'self'",
    // Script sources - TradingView widgets require unsafe-inline (they use script.innerHTML for config)
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://s3.tradingview.com https://tv-static-2.tradingview.com https://va.vercel-scripts.com https://cdn.jsdelivr.net https://*.posthog.com https://*.i.posthog.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://dynamic-static-assets.com https://*.dynamic-static-assets.com https://cdn.jsdelivr.net data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.st0x.io ... https://*.posthog.com https://*.i.posthog.com",
    "frame-src 'self' https://newassets.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://buy.onramper.com https://buy.onramper.dev https://*.tradingview.com ...",
    // ...
];
```

**Three edits needed:**

1. **Append to `connect-src`** (Pitfall 1 — wildcards don't cross dot boundaries):
   ```
   https://*.ingest.sentry.io https://*.ingest.us.sentry.io
   ```
   (add `https://*.ingest.de.sentry.io` if the Sentry org turns out to be EU-region per assumption A2 in RESEARCH:926)

2. **Remove from `frame-src`** (DEPR-03):
   ```
   https://buy.onramper.com https://buy.onramper.dev
   ```

3. **Edit `requiresWalletRegistration()` lines 232-244** (DEPR-01 + DEPR-03):
   ```typescript
   function requiresWalletRegistration(path: string): boolean {
       if (path.startsWith('/api/rewards/') && path !== '/api/rewards/global') return true;  // DELETE this line (DEPR-01)
       if (path.startsWith('/api/snapshots/')) return true;
       if (path === '/api/onramper/sign-url') return true;  // DELETE this line (DEPR-03)
       // ...
   }
   ```

**`sequence()` chain extension pattern** — RESEARCH §"Pattern 1" lines 290-323:
```typescript
import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { requestContextHandle } from '$lib/server/logger';
// ... existing imports

Sentry.init({
    dsn: env.SENTRY_DSN,
    enabled: !dev && Boolean(env.SENTRY_DSN),
    tracesSampleRate: 0,
    integrations: [],
    beforeSend(event) { return scrubSentryEvent(event); },
    beforeBreadcrumb(breadcrumb) { return scrubSentryEvent(breadcrumb); }
});

const existingHandle: Handle = async ({ event, resolve }) => {
    // ... rename current `handle` body to existingHandle
};

// Order matters: request-id FIRST, then Sentry, then existing chain
export const handle = sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle);

export const handleError = Sentry.handleErrorWithSentry(({ error, event }) => {
    console.error('[hooks.server] Unhandled server error:', error, event);
});
```

**What to keep / change:**
- Keep: every line of the existing `handle` body (CSP, CORS, bot rejection, admin gate, wallet-registration). Just rename `handle` → `existingHandle` and re-export through `sequence()`.
- Change: 3 surgical edits above + `sequence()` wiring. Do NOT widen scope into the wallet/registration logic; that's Phase 3.

---

### MODIFY: `src/lib/server/snapshots/generator.ts:19-35`  (RPC instrumentation)

**Existing function (`src/lib/server/snapshots/generator.ts:19-35`):**
```typescript
async function callRpc(method: string, params: unknown[]): Promise<unknown | null> {
    for (const rpcUrl of RPC_URLS) {
        try {
            const response = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
            });
            if (!response.ok) continue;
            const data = await response.json();
            if (data.result) return data.result;
        } catch {
            continue;
        }
    }
    return null;
}
```

**Replacement pattern:** Verbatim from RESEARCH §"Pattern 4" lines 628-665. Wrap each attempt with `recordRpcAttempt({ rpc_url, fn, ok, status_or_error, duration_ms })`; collect `attempts[]`; call `await reportChainExhausted({ fn: 'callRpc:' + method, attempts })` before returning `null`.

**Critical guardrail (Pitfall 3, RESEARCH:770-775):** Phase 1 instruments visibility ONLY. Do NOT add retry-with-backoff. Do NOT change "empty result is success-with-null" semantics. The `continue` keyword stays. Same single-attempt-per-RPC behavior survives Phase 1 → REL-01 in Phase 3.

---

### MODIFY: `src/lib/server/snapshots/processor.ts`  (delete points calc per D-03)

**Pattern source:** Per RESEARCH §"Deletion Graph" DEPR-02 row for processor.ts → "delete the per-wallet monthly points calculation entirely from `src/lib/server/snapshots/processor.ts`."

**Audit-log non-regression check:** processor.ts does NOT call `createAuditLogger`. Safe to edit. Per RESEARCH §"Runtime State Inventory": the `getRewardsExcludedWalletsSet()` call at `processor.ts:118` MUST be retained — it is used for non-rewards reasons (orderbook + system addresses).

**What to keep / change:**
- Keep: TVL aggregates, per-token TVL, per-token volume, total volume, holdings calculation, `getRewardsExcludedWalletsSet()` consumption.
- Change: delete the per-wallet points step (planner finds the function/call site by grep — RESEARCH listed it under "the per-wallet monthly points calculation"); add a code comment per D-04 spirit explaining historical blob fields are LEFT AS-IS for backward read-compat.

---

### MODIFY: `src/lib/server/accessCodes.ts:64-85`  (verifyWalletSignature instrumentation)

**Existing function (`src/lib/server/accessCodes.ts:64-85`):**
```typescript
export async function verifyWalletSignature(
    address: string,
    message: string,
    signature: `0x${string}`
): Promise<boolean> {
    try {
        const valid = await basePublicClient.verifyMessage({
            address: address as `0x${string}`,
            message,
            signature
        });
        return valid;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown verification error';
        console.error('[accessCodes] Signature verification failed:', { message });
        return false;
    }
}
```

**Replacement pattern:** Verbatim from RESEARCH §"Pattern 4" lines 670-704. Wrap success + failure paths with `recordRpcAttempt({ rpc_url: 'alchemy-base-mainnet', fn: 'verifyWalletSignature', ... })`. Treat catch as chain-exhausted (single-RPC means failure IS chain-exhaustion) — call `await reportChainExhausted(...)` then keep the existing `console.error` line.

**Critical guardrail:** Phase 1 leaves the single-Alchemy-RPC dependency in place — REL-02 in Phase 3 adds the fallback chain.

---

### MODIFY: `src/lib/services/marketOrderExecution.ts`  (OBS-03 transcript-builder seam)

**Capture seam analysis — verbatim from RESEARCH §"OBS-03 capture seam analysis" lines 514-530:**

| Line range | Failure mode | OBS-03 reason |
|------------|--------------|---------------|
| 141-143 | No taker address | (NOT a "no liquidity" — skip) |
| 144-147 | All quotes excluded as taker-owned | `no_quotes_available` |
| 161-163 | walkResult empty | `no_walk_fills` |
| 167-169 | worstFill missing ratio | `caught_exception` |
| 181-183 | emergencyRatioHex null | `caught_exception` |
| 278-281 | firstQuote missing orderData/sgOrder | `unhydrated_fills` |
| 388-393 | indexedFills empty in fallback | `aggregated_failed` |
| 442-447 | TransactionStatus.ERROR after both paths | `aggregated_failed` (most common production "no liquidity") |
| 452-457 | Outer try/catch | `caught_exception` |

**Single-seam transcript-builder pattern (RESEARCH:530, RECOMMENDED over wrapping each branch):** Construct a transcript object at function entry; every error-return path already has access to it. Replace each `return { success: false, error }` with:
```typescript
return failWith(reason, error, transcript);
```
where `failWith()` calls `captureTakeOrderFailure()` then returns the failure object. Avoids missing branches.

**Existing function-entry pattern to extend (`src/lib/services/marketOrderExecution.ts:130-143`):**
```typescript
const {
    orderSide, amount, inputMode = 'amount', slippageBps = DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
    assetToken, paymentToken, quotes, network
} = input;

try {
    const takerAddress = getSignerAddress();
    if (!takerAddress) {
        return { success: false, error: 'Wallet not connected. Please reconnect and try again.' };
    }
```

**What to keep / change:**
- Keep: every existing `return { success: false, error }` user-facing message (the strings are already user-friendly). Phase 1 does NOT refactor execution — that's Phase 2.
- Change: build transcript at function entry; replace each return with `failWith()`. Transcript fields per RESEARCH §"Pattern 3" lines 461-485 (`subgraphQuoteHash`, `fullQuotePayload`, `onChainStateRead`, `ratio`, `slippageBps`, `priceCap`, `side`, `takerAction`, `userAction`, `mode`, `walletAddress`, `request_id`, `timestamp`).
- Per D-15: this file runs client-side; pino is server-only. The dual-sink resolves to `Sentry.captureException` + `console.error('[take-order failed]', JSON.stringify(...))`. NOT a server-relayed endpoint.

---

### MODIFY: `src/lib/components/DepositModal.svelte`  (D-10 collapse to deposit-only)

**Existing surface to delete:**

`src/lib/components/DepositModal.svelte:1-19` (chooser scaffolding):
```typescript
import OnramperModal from '$lib/components/OnramperModal.svelte';
import {
    showDepositModal,
    closeDepositModal,
    depositModalInitialView   // DELETE — the chooser was the only consumer
} from '$lib/stores/dynamicStore';
import { walletAddress, authMethod } from '$lib/stores/authStore';
// ...
type ModalView = 'options' | 'buy' | 'deposit';
let currentView: ModalView = 'options';
let copied = false;
let showOnramper = false;
```

`src/lib/components/DepositModal.svelte:50-99` (chooser logic — all of this goes):
```typescript
$: if ($showDepositModal) {
    if ($authMethod === 'dynamic') {
        currentView =
            $depositModalInitialView === 'deposit' ? 'deposit'
            : $depositModalInitialView === 'buy' ? 'buy'
            : 'options';
    } else {
        currentView = 'buy';
    }
}
// handleClose, showBuyView, handleBuyCrypto, handleOnramperClose, showDepositView, goBack — all chooser plumbing, DELETE
```

`src/lib/components/DepositModal.svelte:114-119` (multi-title — collapses to "Deposit"):
```typescript
$: modalTitle =
    currentView === 'options' ? 'Add Funds'
    : currentView === 'buy' ? 'Buy Crypto'
    : 'Deposit from Wallet';
```

**Rewrite skeleton** — verbatim from RESEARCH §"Code Examples — Deleted-content baseline" lines 862-902:
```svelte
<script lang="ts">
    import { browser } from '$app/environment';
    import Modal from '$lib/components/ui/Modal.svelte';
    import Button from '$lib/components/ui/Button.svelte';
    import { showDepositModal, closeDepositModal } from '$lib/stores/dynamicStore';
    import { walletAddress } from '$lib/stores/authStore';
    import { currentNetwork } from '$lib/stores';

    let copied = false;
    let qrCodeDataUrl = '';
    let qrCodeError: string | null = null;

    async function generateQrCode(data: string) { /* unchanged */ }
    $: if ($walletAddress && $showDepositModal) generateQrCode($walletAddress);

    async function copyAddress() { /* unchanged */ }

    function handleClose() {
        closeDepositModal();
        copied = false;
    }

    $: paymentToken = 'USDC';
    $: basescanUrl = $walletAddress ? `https://basescan.org/address/${$walletAddress}` : '';
</script>

<Modal show={$showDepositModal} title="Deposit" maxWidthClass="max-w-md" onClose={handleClose}>
    <div class="space-y-5">
        <p class="text-sm text-gray-400">
            Send {paymentToken} on {$currentNetwork?.displayName ?? 'Base'} to this address.
            Funds will appear in your st0x balance once confirmed.
        </p>
        <!-- QR + address + copy + Basescan + warning + Close — keep verbatim from current
             "deposit" branch (lines 296-422 of the original), changing the final button copy
             from "Done" to "Close" -->
    </div>
</Modal>
```

**Copy contract (UI-SPEC §"DepositModal — collapsed"):**
| Element | Copy |
|---------|------|
| Modal title | "Deposit" |
| Address label | "Your wallet address" (existing) |
| Body | "Send {token} on Base to this address. Funds will appear in your st0x balance once confirmed." |
| Address copy CTA | "Copy address" (existing) |
| Basescan link | "View on Basescan" (existing) |
| QR caption | "Scan with your wallet" (existing) |
| Close action | "Close" |

**What to keep / change:**
- Keep: QR generation; `copyAddress()`; Basescan link logic; `Modal` component import; `showDepositModal` + `closeDepositModal` from `dynamicStore`.
- Change: delete `OnramperModal` import + render; delete `depositModalInitialView` import; collapse `currentView` state (gone); reduce ~425 → ~80 lines.

---

### MODIFY: `src/lib/components/Header.svelte`  (delete commented-out RewardsDisplay refs)

**Pattern source (in-place):** `Header.svelte:148, 352` — both lines are comments only:
```svelte
<!-- RewardsDisplay temporarily hidden -->
```

**What to keep / change:** Delete both commented-out lines AND the surrounding "Boost Rewards and Referrals in mobile menu" comment header per RESEARCH §"Deletion Graph" DEPR-01 row. Confirm via grep that no live `<RewardsDisplay />` mounts remain.

---

### MODIFY: `src/routes/(main)/+layout.svelte`  (re-import announcement; remove rewards mounts)

**Existing imports + mount block** (`src/routes/(main)/+layout.svelte:6,10,173-176`):
```svelte
<script lang="ts">
    import TokenSwapAnnouncementModal from '$lib/components/rewards/TokenSwapAnnouncementModal.svelte';
    // ...
    import { initTokenSwapAnnouncement } from '$lib/stores/rewardsStore';
    // ...
</script>
<!-- Rewards Modals - temporarily hidden -->
<!-- <RewardsDetailsModal /> -->
<!-- <RewardsLeaderboardModal /> -->
<TokenSwapAnnouncementModal />
```

**What to keep / change:**
- Keep: `<TokenSwapAnnouncementModal />` mount; `initTokenSwapAnnouncement()` call inside `onMount`.
- Change line 6: `from '$lib/components/rewards/...'` → `from '$lib/components/announcements/TokenSwapAnnouncementModal.svelte'`.
- Change line 10: `from '$lib/stores/rewardsStore'` → `from '$lib/stores/announcementStore'`.
- Delete lines 173-175 (the comment + two commented-out modal mounts) entirely.

---

### MODIFY: `src/routes/api/cron/snapshots/+server.ts`  (D-03 / DEPR-02)

**Existing imports** (`src/routes/api/cron/snapshots/+server.ts:13, 22`):
```typescript
import { updateMonthlyPoints } from '$lib/server/snapshots/points';
import { invalidateRewardsCaches } from '$lib/server/cache';
```

**Pattern source (RESEARCH §"Deletion Graph" DEPR-02 row, line 1026):** remove the `updateMonthlyPoints` import and call (~line 106). Remove `invalidateRewardsCaches` import IF it only invalidates rewards caches (planner inspects `src/lib/server/cache.ts:51-58` — `invalidatePublicApiCaches` invalidates `rewardsApy` + `rocketboost` + `allWalletData`, all rewards-only — so DELETE the call at cron line 143 too).

**Fail-closed pattern surviving — KEEP** (`src/routes/api/cron/snapshots/+server.ts:38-52`):
```typescript
const cronSecret = env.CRON_SECRET;
if (!cronSecret && !dev) {
    console.error('[Cron] CRON_SECRET is not configured');
    return json({ error: 'Cron endpoint not configured' }, { status: 503 });
}
```
(this is the model OBS-04's `alerts.ts` mimics for `OBSERVABILITY_ALERT_WEBHOOK_URL`)

---

### MODIFY: `src/lib/stores/dynamicStore.ts`  (D-10 chooser-state delete)

**Pattern source (RESEARCH §"Deletion Graph" DEPR-03):** Lines 36 and 150-164. `showDepositModal` survives. `depositModalInitialView` and `setDepositModalInitialView` are deleted (the chooser was the only consumer).

**What to keep / change:**
- Keep: `showDepositModal`, `closeDepositModal`, all dynamic-session state.
- Change: delete `depositModalInitialView` writable + `setDepositModalInitialView` setter.

---

### MODIFY: `src/lib/server/auditLog.ts:23`  (DEPR-03 union prune)

**Existing union member** (`src/lib/server/auditLog.ts:9-33`):
```typescript
export type AuditEventType =
    | 'WALLET_REGISTRATION'
    | 'ACCESS_CODE_CREATED'
    // ...
    | 'ONRAMPER_URL_SIGNED'  // DELETE this line per Pitfall 6
    // ...
```

**What to keep / change:** Single-line removal. Verify by grep that no surviving callsite emits this type (`grep -rn 'ONRAMPER_URL_SIGNED' src/` returns 0 hits after deletion).

---

### MODIFY: `src/lib/server/rateLimit.ts:322-326`  (DEPR-03 tier prune)

**Existing tier** (`src/lib/server/rateLimit.ts:322-326`):
```typescript
// Onramper (requires wallet)
onramper: {
    anonymous: { windowMs: 60 * 1000, maxRequests: 2 },
    authenticated: { windowMs: 60 * 1000, maxRequests: 10 }
}
```

**What to keep / change:** Delete the entire `onramper:` tier (3-line value + key + comment). Per Pitfall 7. Verify by grep that no surviving callsite passes `'onramper'` as `tierKey`.

---

### MODIFY: `.env.example`  (add Sentry/Slack; remove Onramper + LP_SUBGRAPH_URL)

**Existing entries to delete** (`.env.example:21-30`):
```
PUBLIC_ONRAMPER_API_KEY=
ONRAMPER_SECRET_KEY=
PUBLIC_ONRAMPER_ENV=
LP_SUBGRAPH_URL=https://api.goldsky.com/api/public/...
```

**Entries to add** (per RESEARCH §"Runtime State Inventory" line 741):
```
# Observability — Sentry (errors)
SENTRY_DSN=
PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=

# Observability — Slack incoming webhook for chain-exhausted RPC alerts
OBSERVABILITY_ALERT_WEBHOOK_URL=
```

**Operational reminder (NOT a code task):** Vercel project env mutations are a separate manual step per RESEARCH §"Runtime State Inventory" Live service config row.

---

### MODIFY: `package.json`  (Sentry + pino)

**Pattern source:** Per RESEARCH §"Standard Stack" lines 113-120 and §"Sources Primary" line 1184: `@sentry/sveltekit@^10.50.0`, `pino@^9.9.5` (or 10.3.1). No new peer-dep conflicts versus current SvelteKit 2.8.0 + Svelte 4.2.7 (Sentry SDK 10.x lists `@sveltejs/kit: '2.x'` per `npm view`).

**What to keep / change:** Add to `dependencies` (NOT `devDependencies` — both are runtime-needed). Run `npm install` after edit; verify with `npm ls @sentry/sveltekit pino`.

---

### MODIFY: `vite.config.js`  (Sentry sourcemap upload plugin)

**Existing config to extend** (`vite.config.js:1-7`):
```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
    plugins: [sveltekit(), svelteTesting()],
    // ...
}));
```

**Replacement pattern:** Per RESEARCH §"Pattern 1" lines 326-348:
```typescript
import { sentrySvelteKit } from '@sentry/sveltekit';

export default defineConfig(({ mode }) => ({
    plugins: [
        sentrySvelteKit({
            adapter: 'vercel',
            sourceMapsUploadOptions: {
                org: process.env.SENTRY_ORG,
                project: process.env.SENTRY_PROJECT,
                authToken: process.env.SENTRY_AUTH_TOKEN
            },
            autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN  // skip when token absent (PR previews)
        }),
        sveltekit(),
        svelteTesting()
    ],
    // ... rest unchanged
}));
```

**Critical guardrail (Pitfall 4, RESEARCH:777-783):** `autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN` MUST gate on the token's presence. Otherwise PR preview deploys (which lack the token) will fail at the upload step.

---

### DELETE: rewards UI files + rewards APIs + admin rewards + Onramper

Per RESEARCH §"Deletion Graph". Per-file rationale already enumerated in that section. **Single planner-checklist:**

| Group | Sequenced before | Why |
|-------|------------------|-----|
| `src/lib/components/rewards/{RewardsDetailsModal,RewardsLeaderboardModal,RewardsDisplay}.svelte` | DEPR-01 | Already commented-out — lowest risk |
| Move `TokenSwapAnnouncementModal.svelte` to `announcements/` | BEFORE deleting `rewards/` directory | D-16 |
| `src/lib/stores/rewardsStore.ts` | AFTER `announcementStore.ts` extraction lands | D-16 |
| `src/routes/api/rewards/*` + `src/routes/api/public/{wallet,rewards-apy,rocketboost}` | DEPR-01 | No surviving consumers per Deletion Graph |
| `src/routes/admin/rewards/+page.svelte` (4933 lines) | DEPR-02 | No imports outside this file |
| `src/lib/server/snapshots/points.ts` + `src/lib/server/rewards/rewardsCommon.ts` | DEPR-02 / D-03 | Update barrel `src/lib/server/snapshots/index.ts:6` to remove `export * from './points'` |
| `src/lib/components/OnramperModal.svelte` + `src/routes/api/onramper/sign-url/+server.ts` | DEPR-03 | Single-consumer chains per Deletion Graph |

**Audit-log non-regression check:** Confirmed in RESEARCH §"Deletion Graph" — only the deleted endpoints (`admin/rewards/+page.svelte` rewards-pool save, `/api/onramper/sign-url`) emit audit logs; both go together; no surviving endpoint loses coverage.

**Guard before deletion** — per Pitfall 5 (RESEARCH:784-789), before deleting `rewardsStore.ts` run:
```bash
grep -rn "from '\$lib/stores/rewardsStore'" src/
grep -rn "from '\$lib/server/rewards/rewardsCommon'" src/
grep -rn "MonthlyPointsData" src/
```
…and audit each remaining hit.

---

## Shared Patterns

### Authentication / Authorization

**Source:** `src/hooks.server.ts:341-468` (`handle: Handle`) — single-export gate covering CSP, CORS, bot-rejection, admin session, wallet-registration. The phase does NOT change auth logic; it extends the chain via `sequence()`.

**Apply to:** `hooks.server.ts` is the only auth touch-point.

**Critical:** Per CONTEXT D-13 + Pitfall 3, do NOT widen scope — Phase 1 instruments and prunes; Phase 2 refactors trade execution; Phase 3 hardens auth.

---

### Error Handling

**Source 1 — module-tag console policy** (`src/lib/server/auditLog.ts:115-117`, `src/lib/services/walletService.ts` per CONVENTIONS.md line 193):
```typescript
} catch (error) {
    console.error('[Audit] Failed to log event:', error);
}
```
Tag every `console.*` line with the module name in brackets per CONVENTIONS.md "Console policy" — even after pino lands. Pino logs use the `getLogger().error({...}, 'msg')` shape; `console.error` survives in client-tier code paths and in places where the logger isn't appropriate.

**Source 2 — fail-closed env-var pattern** (`src/routes/api/cron/snapshots/+server.ts:44-48`) — anchor for `OBSERVABILITY_ALERT_WEBHOOK_URL`:
```typescript
if (!cronSecret && !dev) {
    console.error('[Cron] CRON_SECRET is not configured');
    return json({ error: 'Cron endpoint not configured' }, { status: 503 });
}
```
Adapt the milder form for `alerts.ts` per RESEARCH:591 — log error in production, return null, never throw at module load.

**Source 3 — never let logger throw back into caller** (`src/lib/utils/monitoring.ts:38-47`):
```typescript
try {
    console.warn(/* ... */);
} catch {
    console.warn('[monitor] failed to serialize failure event', event.kind, event.error);
}
```

**Apply to:** all new `src/lib/server/{logger,rpcMetrics,alerts}.ts` modules and `src/lib/services/observability/captureTakeOrderFailure.ts`.

---

### Validation

**Source:** `src/lib/utils/validation.ts` factory pattern (per CONVENTIONS.md line 147). Phase 1 has no new user input to validate — Slack alert payloads contain server-derived strings only. Per Security Domain V5 (RESEARCH:1159), length-cap each `status_or_error` to ~512 chars before embedding in Slack `text`.

**Apply to:** `src/lib/server/alerts.ts` — single inline length-cap helper at the top of `notifyChainExhausted()`.

---

### Module placement

**Source:** CONVENTIONS.md "Server-Side Conventions" + STRUCTURE.md "Where to Add New Code". Recap:
- `src/lib/server/*` — server-only; never imported from `.svelte` or browser-only `.ts`.
- `src/lib/utils/*` — pure helpers; no I/O, no Svelte stores.
- `src/lib/services/*` — business logic orchestrating wallet/contracts/queries/stores.
- `src/lib/components/<feature>/<Name>.svelte` — feature-grouped Svelte components.
- `src/lib/stores/*Store.ts` — camelCase + `Store` suffix.

**Apply to:**
| New file | Conventional path |
|---------|-------------------|
| pino logger | `src/lib/server/logger.ts` |
| RPC metrics | `src/lib/server/rpcMetrics.ts` |
| Slack alerts | `src/lib/server/alerts.ts` |
| Sentry scrubber (shared) | `src/lib/observability/scrub.ts` (greenfield directory accepted) |
| Take-order capture | `src/lib/services/observability/captureTakeOrderFailure.ts` (planner picks; alternative `src/lib/utils/captureTakeOrderFailure.ts`) |
| Sentry client init | `src/hooks.client.ts` (new SvelteKit special file) |
| Announcement store | `src/lib/stores/announcementStore.ts` |
| Announcement modal | `src/lib/components/announcements/TokenSwapAnnouncementModal.svelte` |

---

### Testing

**Source:** Unit-test mirror in `tests/lib/utils/format.test.ts`, `tests/lib/services/marketOrderExecution.test.ts` per CONVENTIONS.md "Testing." Per RESEARCH §"Project Constraints" line 982 + §"Validation Architecture" line 1141:
- Add `tests/lib/observability/scrub.test.ts` — pure-function unit tests for `scrubSentryEvent` (~20 lines).
- Add `tests/lib/server/logger.test.ts` — unit tests for `pickLevelForRoute` (pure helper).

**Apply to:** new modules `scrub.ts` and `logger.ts` only. Phase 4 covers broader test coverage.

---

## No Analog Found

| File | Role | Reason | Anchor |
|------|------|--------|--------|
| `src/lib/observability/scrub.ts` | Recursive PII walker over Sentry event tree | First scrubber in the codebase | CONVENTIONS.md "Module Design" — pure helpers; module-top JSDoc |
| `src/lib/server/logger.ts` (pino body) | Structured JSON logger + AsyncLocalStorage middleware | First pino instance + first `Handle` extracted to a server module | CONVENTIONS.md "Server-Side Conventions"; STRUCTURE.md "New server-only logic" |
| `src/lib/server/alerts.ts` | Slack incoming-webhook poster | First outbound webhook in code (closest is pyth.ts fetch but to a custom st0x microservice) | RESEARCH §"Pattern 4" full sketch + fail-closed env model from `cron/snapshots/+server.ts:44` |
| `src/hooks.client.ts` | First SvelteKit client hook in the project | File doesn't exist; PostHog init in `analytics.ts` is gated behind cookie consent and called from a component, NOT applicable as init-shape for Sentry which must run at module load | RESEARCH §"Pattern 1" lines 258-288; CONVENTIONS.md "Console policy" for `[hooks.client]` tag |

For each greenfield module, the planner reproduces the implementation skeleton from the cited RESEARCH §"Pattern N" / §"Code Examples" block verbatim and adapts only naming/import paths to satisfy CONVENTIONS.md.

---

## Metadata

**Analog search scope:** `src/lib/server/`, `src/lib/services/`, `src/lib/stores/`, `src/lib/components/`, `src/lib/utils/`, `src/routes/api/cron/`, `src/hooks.server.ts`, `vite.config.js`, `package.json`, `.env.example`.

**Files scanned (analogs read):** 12
- `src/hooks.server.ts`
- `src/lib/server/auditLog.ts`
- `src/lib/server/cache.ts`
- `src/lib/server/accessCodes.ts`
- `src/lib/server/snapshots/generator.ts`
- `src/lib/server/snapshots/pyth.ts`
- `src/lib/server/rateLimit.ts`
- `src/lib/utils/monitoring.ts`
- `src/lib/utils/retry.ts`
- `src/lib/services/analytics.ts`
- `src/lib/services/marketOrderExecution.ts`
- `src/lib/stores/tutorialStore.ts`
- `src/lib/stores/rewardsStore.ts`
- `src/lib/components/rewards/TokenSwapAnnouncementModal.svelte`
- `src/lib/components/DepositModal.svelte`
- `src/lib/components/Header.svelte`
- `src/routes/(main)/+layout.svelte`
- `src/routes/api/cron/snapshots/+server.ts`

**Pattern extraction date:** 2026-04-28
