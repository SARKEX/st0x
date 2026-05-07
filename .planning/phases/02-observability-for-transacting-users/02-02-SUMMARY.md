---
phase: 02-observability-for-transacting-users
plan: 02
subsystem: observability
tags: [observability, sentry, session-replay, csp, OBS-06, OBS-09]
requires:
  - "Plan 02-01 (provides getCurrentTradeId, scrubSentryEvent already in place)"
provides:
  - "Sentry on-error Session Replay (OBS-06) — D-02 sample rates, D-03 masking"
  - "captureTakeOrderFailure trade_id Sentry tag (OBS-09 navigation key)"
  - "src/lib/server/csp.ts (CSP_DIRECTIVES + buildCspHeader, extracted for testability)"
affects:
  - "Plan 02-03 component instrumentation — mintTradeId at submit-click feeds the tag site landed here"
  - "Plan 02-04 RUNBOOK — Sentry-side dashboard 'Enable Replay on the project' toggle is documented in operator runbook, not code"
tech_stack:
  added: []
  patterns:
    - "On-error Session Replay buffer (replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1.0) — the operator-noted D-02 stance: no proactive recording"
    - "Maximum DOM masking (maskAllText + maskAllInputs + blockAllMedia) for fintech privacy posture (D-03 / Threat T-2-C)"
    - "Conditional spread for optional Sentry tags (`...(tradeId ? { trade_id: tradeId } : {})`) — clean tags object when no trade is active"
    - "CSP directive list extracted into its own module so unit tests can assert directive presence without invoking hooks.server.ts top-level side effects"
key_files:
  created:
    - "src/lib/server/csp.ts"
    - "tests/lib/observability/sentryReplayConfig.test.ts"
    - "tests/lib/server/csp.test.ts"
  modified:
    - "src/hooks.client.ts (Sentry.init: replayIntegration + sample rates)"
    - "src/hooks.server.ts (import CSP_DIRECTIVES from $lib/server/csp)"
    - "src/lib/services/observability/captureTakeOrderFailure.ts (trade_id tag)"
    - "tests/lib/services/observability/captureTakeOrderFailure.test.ts (extended with 3 trade_id tests)"
    - ".planning/phases/02-observability-for-transacting-users/deferred-items.md"
decisions:
  - "Extracted CSP_DIRECTIVES into a new `src/lib/server/csp.ts` module (vs. plan's literal suggestion to keep it inline-and-export from hooks.server.ts) because hooks.server.ts has too many top-level side effects to import in jsdom tests (Sentry.init, $env/dynamic/private fail-fast, sequence(...) hook chain). The new module exports both `CSP_DIRECTIVES: string[]` and `buildCspHeader(): string` — neither has side effects on import — and hooks.server.ts now imports the array directly. Same regression-guard outcome with no new abstraction beyond a tiny pure module."
  - "Conditional spread `...(tradeId ? { trade_id: tradeId } : {})` chosen over `trade_id: tradeId ?? undefined` so the tags object literally has no `trade_id` key when no trade is active. Sentry serializes `undefined` keys differently from missing keys; the missing-key form keeps the Sentry UI clean for non-trade-context errors and is what the test asserts via `Object.keys(opts.tags)`."
metrics:
  duration: ~5 min
  completed: 2026-05-07T10:30:00Z
  tasks_completed: 2
  test_files_added: 2
  test_count_added: 9  # 5 (sentryReplayConfig) + 1 (csp) + 3 (captureTakeOrderFailure trade_id)
---

# Phase 2 Plan 2: OBS-06 Sentry Replay + OBS-09 Sentry-Tag Summary

OBS-06 on-error Session Replay configured per D-02 + D-03 in `src/hooks.client.ts`, and the OBS-09 `trade_id` Sentry tag wired into `captureTakeOrderFailure`. CSP `worker-src 'self' blob:` directive extracted into `src/lib/server/csp.ts` so a regression test guards Pitfall 3.

## `Sentry.init` Shape Changes (src/hooks.client.ts)

Additive — no existing keys removed, no handler bodies modified:

```ts
Sentry.init({
    dsn: env.PUBLIC_SENTRY_DSN,
    enabled: !dev && Boolean(env.PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,        // NEW (D-02)
    replaysOnErrorSampleRate: 1.0,      // NEW (D-02)
    integrations: [                     // CHANGED ([] → [Replay])
        Sentry.replayIntegration({
            maskAllText: true,            // D-03
            maskAllInputs: true,          // D-03
            blockAllMedia: true           // belt-and-braces
        })
    ],
    beforeSend(event) { return scrubSentryEvent(event); },        // unchanged (OBS-01)
    beforeBreadcrumb(breadcrumb) { return scrubSentryEvent(breadcrumb); }  // unchanged (OBS-01)
});
```

## `captureTakeOrderFailure` Tag Object Change

Additive — `failure_reason` + `side` unchanged; `trade_id` conditionally added:

```ts
import { getCurrentTradeId } from './tradeId';
// ...
const tradeId = getCurrentTradeId();
Sentry.captureException(err, {
    tags: {
        failure_reason: reason,
        side: transcript.side,
        ...(tradeId ? { trade_id: tradeId } : {})   // NEW
    },
    extra: { ...transcript, errorMessage }
});
```

`getCurrentTradeId()` is captured to a local once (cleaner than calling twice). It is a pure module-state read — Plan 02-01 Task 1 guarantees it cannot throw — so no new try/catch is needed beyond the existing one wrapping `Sentry.captureException`.

## CSP Module Extraction

`src/lib/server/csp.ts` (new):
- `CSP_DIRECTIVES: string[]` — verbatim copy of the array previously inline in `hooks.server.ts`, preserving E2E `connect-src` relaxation gate (`process.env.E2E === '1'`) and dev-vs-prod `upgrade-insecure-requests` toggle.
- `buildCspHeader(): string` — `CSP_DIRECTIVES.join('; ')`.

`hooks.server.ts` now imports `CSP_DIRECTIVES` and references it directly in `SECURITY_HEADERS['Content-Security-Policy']: CSP_DIRECTIVES.join('; ')` (unchanged join expression).

## Tests Added

| File | Tests | Purpose |
|---|---|---|
| `tests/lib/observability/sentryReplayConfig.test.ts` | 5 | D-02 sample rates (×2), D-03 masking flags (×2), OBS-01 scrubber wiring intact (×1, also asserts integrations array contains the Replay return value) |
| `tests/lib/server/csp.test.ts` | 1 | `worker-src 'self' blob:` substring + array-membership presence (Pitfall 3 / Threat T-2-G regression guard) |
| `tests/lib/services/observability/captureTakeOrderFailure.test.ts` | +3 | trade_id present when getCurrentTradeId returns a string; key absent when null (verified via `Object.keys`); failure_reason + side unchanged regardless of trade_id presence |

All 9 tests pass; 6 existing `captureTakeOrderFailure` tests still pass (regression intact).

## Threat Mitigations Landed

| Threat | Component | Mitigation |
|---|---|---|
| **T-2-C** Information disclosure — Sentry Replay capturing sensitive DOM | `src/hooks.client.ts` Replay config | `maskAllText: true` + `maskAllInputs: true` + `blockAllMedia: true` per D-03. Tests 3+4 in `sentryReplayConfig.test.ts` are the regression guard. |
| **T-2-G** Tampering — CSP `worker-src 'self' blob:` regression breaking Replay silently | `src/lib/server/csp.ts` + `tests/lib/server/csp.test.ts` | Directive extracted into named module + unit test asserts substring presence. Future CSP edits cannot drop the directive without breaking the test. |

## Threats Accepted (No Code Action)

- **T-2-D** Cookie-consent bypass for Sentry Replay — operator/legal stance documented in Plan 02-04 PRIVACY-REVIEW. Treat as "essential" because Replay activates only on errors (no proactive recording per D-02). No consent gating in code.
- **T-2-H** `trade_id` visible in Sentry UI to Sentry-account members — opaque UUIDv4, no PII derivation. Same risk class as `request_id` already in Sentry events.

## Decisions Implemented

- **D-02** (Sentry side): on-error replay buffer, no proactive recording — `replaysSessionSampleRate: 0` + `replaysOnErrorSampleRate: 1.0`.
- **D-03** (Sentry side): maximum masking — `maskAllText`, `maskAllInputs`, `blockAllMedia`.
- **OBS-06**: Session Replay configured (Sentry-side dashboard "Enable Replay on the project" toggle is captured in Plan 02-04 RUNBOOK — not a code change).
- **OBS-09 (Sentry-tag half)**: `captureTakeOrderFailure` events carry `trade_id` tag when a trade is active. The mint-site (where `mintTradeId()` is called on submit-click) is wired in Plan 02-03 — at that point, any failure routed through `captureTakeOrderFailure` will surface the tag for navigation to PostHog events + pino logs.

## Commits

| Hash | Type | Description |
|---|---|---|
| `1719263` | test | RED for Sentry Replay config + CSP worker-src tests |
| `f5facd8` | feat | GREEN: Sentry Replay (OBS-06) + extract CSP for testability |
| `8e1c3ab` | test | RED for trade_id Sentry tag (OBS-09) |
| `5a2be57` | feat | GREEN: tag captureTakeOrderFailure with trade_id (OBS-09) |

## Verification

- `npx vitest run tests/lib/observability/ tests/lib/server/csp.test.ts tests/lib/services/observability/` — **36/36 pass** across 7 test files
- `grep -c "replayIntegration" src/hooks.client.ts` = **1** (≥1 required)
- `grep -c "replaysSessionSampleRate: 0" src/hooks.client.ts` = **2** (≥1 required — docstring + code)
- `grep -c "replaysOnErrorSampleRate: 1" src/hooks.client.ts` = **2** (≥1 required — docstring + code)
- `grep -c "maskAllText: true" src/hooks.client.ts` = **1** (≥1 required)
- `grep -c "maskAllInputs: true" src/hooks.client.ts` = **1** (≥1 required)
- `grep -c "scrubSentryEvent" src/hooks.client.ts` = **4** (≥2 required — beforeSend + beforeBreadcrumb still wired, plus comment refs)
- `grep -c "worker-src 'self' blob:" src/lib/server/csp.ts` = **2** (verbatim directive + comment reference)
- `grep -c "getCurrentTradeId" src/lib/services/observability/captureTakeOrderFailure.ts` = **3** (import + comment + call)
- `grep -c "trade_id:" src/lib/services/observability/captureTakeOrderFailure.ts` = **2** (conditional-spread literal + log key)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] CSP test couldn't import hooks.server.ts in jsdom**
- **Found during:** Task 1 RED setup
- **Issue:** Plan suggested either (a) extract `const CSP = "..."` above the handle in hooks.server.ts and import in test, or (b) call the handle with a mock event. Option (a) was preferred per plan, but importing hooks.server.ts in tests triggers `Sentry.init` (mocked OK) plus `$env/dynamic/private` fail-fast on missing production env vars, plus the `sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)` chain at module top level. Option (b) would require mocking out the entire SvelteKit hook chain.
- **Fix:** Extracted `CSP_DIRECTIVES` (and a small `buildCspHeader()` helper) into a new `src/lib/server/csp.ts` module. No new abstraction — just a side-effect-free named export that hooks.server.ts now imports. Same testability benefit, no cross-cutting refactor.
- **Files modified:** Added `src/lib/server/csp.ts`; `src/hooks.server.ts` imports it.
- **Commit:** Folded into `f5facd8`.

### Deferred (Out of Scope)

- **`npm run build` env-var failures at SvelteKit analyse step** — pre-existing fail-fast in `src/lib/server/auth.ts` and `src/lib/server/accessCodes.ts` requires production secrets to complete the post-build server-bundle analyse phase. The Vite/Rollup compile itself succeeds (Sentry Replay resolves cleanly from `@sentry/sveltekit` ^10.50.0). Logged in `deferred-items.md`. Not fixed here.
- **rpcMetrics test type errors** at `tests/lib/server/rpcMetrics.test.ts:165,181,182` — already deferred from Plan 02-01. Still present, still out of scope.

## Open Follow-ups

- **Plan 02-03**: wire `mintTradeId()` at submit-click sites (Buy/Sell buttons) and `clearTradeId()` in `finally` blocks. At that point, any in-flight failure that routes through `captureTakeOrderFailure` will tag the Sentry event with the active `trade_id` — this plan is the receiving end of that wiring.
- **Plan 02-04 RUNBOOK**: documents (a) Sentry-dashboard toggle "Enable Session Replay on the project" (OBS-06 operator step) and (b) on-error replay triage workflow.
- **Plan 02-04 PRIVACY-REVIEW**: documents the on-error-Replay-as-essential cookie-consent stance (T-2-D residual).

## TDD Gate Compliance

Both tasks followed RED → GREEN: each `feat` commit is preceded by a `test` commit on the same scope.

| Task | RED commit | GREEN commit |
|---|---|---|
| 1 (Replay + CSP) | `1719263` | `f5facd8` |
| 2 (trade_id tag) | `8e1c3ab` | `5a2be57` |

No REFACTOR commits required — initial implementations were minimal.

## Self-Check: PASSED

- `[ -f src/hooks.client.ts ]` → FOUND (modified)
- `[ -f src/hooks.server.ts ]` → FOUND (modified)
- `[ -f src/lib/server/csp.ts ]` → FOUND (new)
- `[ -f src/lib/services/observability/captureTakeOrderFailure.ts ]` → FOUND (modified)
- `[ -f tests/lib/observability/sentryReplayConfig.test.ts ]` → FOUND (new)
- `[ -f tests/lib/server/csp.test.ts ]` → FOUND (new)
- `[ -f tests/lib/services/observability/captureTakeOrderFailure.test.ts ]` → FOUND (extended)
- Commits `1719263 f5facd8 8e1c3ab 5a2be57` all present in `git log` → FOUND
