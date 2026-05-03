---
phase: 01-shrink-the-surface-see-what-s-happening
verified: 2026-05-03T20:33:15Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 1: Shrink the Surface, See What's Happening — Verification Report

**Phase Goal:** Cut the surviving surface that is no longer in v1.0 scope (rewards UI, onramper, LP subgraph) and stand up the observability spine (Sentry, structured logging, RPC instrumentation, take-order failure transcripts, Vercel Speed Insights) so production failures stop being silent.

**Verified:** 2026-05-03T20:33:15Z
**Status:** passed
**Re-verification:** Yes — retroactive goal-backward verification authored 2026-05-03 from the gap-closure quick task `260503-tm8`. Each row below was independently re-derived against the current `src/` tree, not transcribed from `v1.0-MILESTONE-AUDIT.md`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User-facing rewards UI + APIs deleted; the only surviving "rewards" references are the admin referral pool config in `src/lib/server/kv.ts` (referral programme, not user-facing rewards) | VERIFIED | `ls src/lib/components/rewards/` → No such file or directory. `ls src/routes/api/rewards/` → No such file or directory. `grep -rn 'rewardsStore\|RewardsDisplay' src/` → 1 hit (`src/lib/stores/announcementStore.ts:3` header comment documenting the DEPR-01 D-16 extraction). `src/lib/server/kv.ts:100–101` `rewardsPool` keys are referral-programme config (used by `src/lib/server/referrals.ts:345`), not user-facing rewards. |
| 2 | Admin rewards UI + LP subgraph URL removed; admin referral programme tooling preserved | VERIFIED | `ls src/routes/admin/rewards/` → No such file or directory. `grep -rn 'LP_SUBGRAPH_URL' src/` → 0 hits. `grep -n 'LP_SUBGRAPH_URL' .env.example` → 0 hits. |
| 3 | Onramper integration deleted (modal, sign-url route, env vars, CSP carve-out) and DepositModal collapsed to deposit-only | VERIFIED | `ls src/lib/components/OnramperModal.svelte` → No such file or directory. `ls src/routes/api/onramper/` → No such file or directory. `grep -rn 'Onramper\|onramper' src/` → 0 hits. DepositModal.svelte = 174 lines; `grep -n 'Buy Crypto\|Add Funds\|Onramper' src/lib/components/DepositModal.svelte` → 0 hits. |
| 4 | Sentry SDK wired on both client and server with PII scrubber, and CSP allows the Sentry ingest hosts | VERIFIED | `src/hooks.client.ts:9,14` (`import * as Sentry from '@sentry/sveltekit'` + `Sentry.init({...})`). `src/hooks.server.ts:2,18` same pattern. `src/hooks.server.ts:24,27` invoke `scrubSentryEvent(...)` from `$lib/observability/scrub`. `src/hooks.server.ts:186` CSP `connect-src` includes `https://*.ingest.sentry.io https://*.ingest.us.sentry.io`. |
| 5 | Pino structured logger + AsyncLocalStorage request-context middleware in place; Sentry handle wraps it so request-id propagates | VERIFIED | `src/lib/server/logger.ts:19,21,34` (`import { AsyncLocalStorage } from 'node:async_hooks'`, `import pino`, `const contextStore = new AsyncLocalStorage<RequestContext>()`). `src/hooks.server.ts:514` `export const handle = sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)` — request-context FIRST so all subsequent handlers (including Sentry) see the same request_id. |
| 6 | RPC call sites are instrumented and a chain-exhausted alert fires through Telegram (D-17) | VERIFIED | `src/lib/server/rpcMetrics.ts:22` `import { notifyChainExhausted } from '$lib/server/alerts'`. `:32` `recordRpcAttempt`. `:50` `reportChainExhausted`. `:64` `notifyChainExhausted({...request_id}).catch(...)` — request-id threaded from the AsyncLocalStorage context. |
| 7 | Take-order failure transcripts wired into marketOrderExecution as a dual-sink (Sentry + console) | VERIFIED | `src/lib/services/marketOrderExecution.ts:47–50` import `captureTakeOrderFailure` from `$lib/services/observability/captureTakeOrderFailure`. `:199` calls it with `(errOrMessage, transcript, reason)`. `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` → 16 (≥ Phase 4 carry-forward gate of 12). |
| 8 | Vercel Speed Insights wired into the SvelteKit root layout | VERIFIED | `src/routes/+layout.svelte:11` `import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit'`. `:31` `injectSpeedInsights()`. Live-dashboard data ingestion (HUMAN-UAT — see § Human Verification Required) was confirmed at orchestration time: `speedInsights.hasData: true, enabledAt: 2025-07-21` per `01-VALIDATION.md:77`. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/components/rewards/` | Deleted | VERIFIED | Directory absent (`ls` → No such file or directory) |
| `src/routes/api/rewards/` | Deleted | VERIFIED | Directory absent |
| `src/routes/admin/rewards/` | Deleted | VERIFIED | Directory absent |
| `src/lib/components/OnramperModal.svelte` | Deleted | VERIFIED | File absent |
| `src/routes/api/onramper/` | Deleted | VERIFIED | Directory absent |
| `src/lib/stores/announcementStore.ts` | Extracted from rewardsStore (D-16) | VERIFIED | Present; header comment cites "Extracted from rewardsStore.ts in Phase 1 (DEPR-01 / D-16)" |
| `src/lib/components/DepositModal.svelte` | Collapsed to deposit-only | VERIFIED | 174 lines; 0 hits of `Buy Crypto` / `Add Funds` / `Onramper` |
| `src/hooks.client.ts` | Sentry client init + PII scrubber | VERIFIED | `Sentry.init` at line 14; `@sentry/sveltekit` import at line 9 |
| `src/hooks.server.ts` | Sentry server init + PII scrubber + CSP ingest hosts + handle sequence | VERIFIED | `Sentry.init` at line 18; scrubber wired at lines 24,27; CSP at line 186; sequence at line 514 |
| `src/lib/observability/scrub.ts` | Recursive PII scrubber | VERIFIED | Present; tested by `tests/lib/observability/scrub.test.ts` (5/5 pass) |
| `src/lib/server/logger.ts` | pino + AsyncLocalStorage middleware | VERIFIED | Present (lines 19, 21, 34); tested by `tests/lib/server/logger.test.ts` (13/13 pass) |
| `src/lib/server/rpcMetrics.ts` | `recordRpcAttempt` + `reportChainExhausted` | VERIFIED | Lines 32, 50; threads request-id from AsyncLocalStorage context |
| `src/lib/server/alerts.ts` | `notifyChainExhausted` Telegram poster | VERIFIED | Imported by `rpcMetrics.ts:22`; tested by `tests/lib/server/alerts.test.ts` (8/8 pass) |
| `src/lib/services/observability/captureTakeOrderFailure.ts` | Dual-sink dispatcher | VERIFIED | Imported by `marketOrderExecution.ts:47–50`; tested by `tests/lib/services/observability/captureTakeOrderFailure.test.ts` (6/6 pass) |
| `src/routes/+layout.svelte` | `injectSpeedInsights` invocation | VERIFIED | Line 11 import + line 31 invocation |
| `tests/lib/observability/scrub.test.ts` | OBS-01 PII scrubber test | VERIFIED | 5 tests pass |
| `tests/lib/server/logger.test.ts` | OBS-02 logger + AsyncLocalStorage test | VERIFIED | 13 tests pass |
| `tests/lib/server/rpcMetrics.test.ts` | OBS-04 RPC metrics test | VERIFIED | 7 tests pass |
| `tests/lib/server/alerts.test.ts` | OBS-04 chain-exhausted alert test | VERIFIED | 8 tests pass |
| `tests/lib/services/observability/captureTakeOrderFailure.test.ts` | OBS-03 take-order failure test | VERIFIED | 6 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/hooks.server.ts` | `@sentry/sveltekit` | `Sentry.init({...})` + `Sentry.sentryHandle()` in `sequence(...)` | WIRED | Lines 18, 514 |
| `src/hooks.server.ts` | `$lib/observability/scrub` | `scrubSentryEvent(event)` in `beforeSend` / `beforeBreadcrumb` callbacks | WIRED | Lines 24, 27 (event + breadcrumb scrubbing) |
| `src/hooks.server.ts` handle | `$lib/server/logger` | `requestContextHandle` placed FIRST in `sequence(...)` | WIRED | Line 514 — request-id propagates to Sentry breadcrumbs and downstream handlers |
| `src/lib/server/rpcMetrics.ts` | `$lib/server/alerts` | `import { notifyChainExhausted } from '$lib/server/alerts'` invoked from `reportChainExhausted` | WIRED | Lines 22, 64 |
| `src/lib/services/marketOrderExecution.ts` | `$lib/services/observability/captureTakeOrderFailure` | direct import + invocation inside catch path | WIRED | Lines 47–50, 199 |
| `src/routes/+layout.svelte` | `@vercel/speed-insights/sveltekit` | `injectSpeedInsights()` in onMount | WIRED | Lines 11, 31 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite green | `npm test -- --run` | 52 files / 663 pass / 1 skip | PASS |
| svelte-check baseline holds | `npm run check` | 3 errors (matches Phase 2/3/4 baseline; sole error in `tests/lib/server/rpcMetrics.test.ts:182`) | PASS |
| OBS-01 PII scrubber | `npm test -- --run tests/lib/observability/scrub.test.ts` | 5/5 pass | PASS |
| OBS-02 logger + AsyncLocalStorage | `npm test -- --run tests/lib/server/logger.test.ts` | 13/13 pass | PASS |
| OBS-03 dual-sink | `npm test -- --run tests/lib/services/observability/captureTakeOrderFailure.test.ts` | 6/6 pass | PASS |
| OBS-04 RPC metrics | `npm test -- --run tests/lib/server/rpcMetrics.test.ts` | 7/7 pass | PASS |
| OBS-04 chain-exhausted alert | `npm test -- --run tests/lib/server/alerts.test.ts` | 8/8 pass | PASS |
| `failWith(` count in marketOrderExecution.ts | `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | 16 (≥ 12 baseline) | PASS |
| Onramper fully removed | `grep -rn 'Onramper\|onramper' src/` | 0 hits | PASS |
| LP_SUBGRAPH_URL fully removed | `grep -rn 'LP_SUBGRAPH_URL' src/ .env.example` | 0 hits | PASS |
| User-facing rewards removed | `ls src/lib/components/rewards/ src/routes/api/rewards/ src/routes/admin/rewards/` | 3 × No such file or directory | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DEPR-01 | 01-02 | User-facing rewards UI + APIs pruned (token-swap announcement extracted to `announcementStore.ts` per D-16) | SATISFIED | `src/lib/components/rewards/` absent; `src/routes/api/rewards/` absent; `src/lib/stores/announcementStore.ts` present with D-16 header comment |
| DEPR-02 | 01-01 | Admin rewards UI + per-wallet points pipeline + LP_SUBGRAPH_URL deleted | SATISFIED | `src/routes/admin/rewards/` absent; `grep LP_SUBGRAPH_URL src/ .env.example` → 0 hits |
| DEPR-03 | 01-03 | Onramper integration removed; DepositModal collapsed to deposit-only | SATISFIED | `OnramperModal.svelte` absent; `src/routes/api/onramper/` absent; `grep -rn 'Onramper' src/` → 0; DepositModal 174 lines, 0 Buy Crypto/Add Funds CTAs |
| OBS-01 | 01-04 | Sentry SDK + recursive PII scrubber + CSP for ingest hosts | SATISFIED | `Sentry.init` in both `hooks.client.ts:14` + `hooks.server.ts:18`; `scrubSentryEvent` wired at `hooks.server.ts:24,27`; CSP `connect-src` includes `*.ingest.sentry.io` at `hooks.server.ts:186`; scrub tests 5/5 pass |
| OBS-02 | 01-05 | pino + AsyncLocalStorage request-id middleware; per-route levels | SATISFIED | `src/lib/server/logger.ts:19,21,34`; `requestContextHandle` placed FIRST in `hooks.server.ts:514` `sequence(...)`; logger tests 13/13 pass |
| OBS-03 | 01-07 | Take-order failure transcript dual-sink (Sentry + console) | SATISFIED | `captureTakeOrderFailure` imported and invoked in `marketOrderExecution.ts:47–50,199`; failWith count = 16; capture tests 6/6 pass |
| OBS-04 | 01-06 | RPC instrumentation + Telegram chain-exhausted alerts (D-17) | SATISFIED | `recordRpcAttempt`/`reportChainExhausted` in `rpcMetrics.ts:32,50`; `notifyChainExhausted` invoked at `:64`; metrics 7/7 + alerts 8/8 pass |
| OBS-05 | 01-08 | Vercel Speed Insights confirmed receiving data | SATISFIED (with HUMAN-UAT carry-forward — see below) | `injectSpeedInsights()` wired at `src/routes/+layout.svelte:11,31`; live-dashboard ingestion confirmed 2026-04-29 (`speedInsights.hasData: true, enabledAt: 2025-07-21` per `01-VALIDATION.md:77`) |

No orphaned requirements: REQUIREMENTS.md Phase 1 mapping = {OBS-01..05, DEPR-01..03} = 8 IDs, all addressed by Phase 1 plans. No Phase 2/3/4 REQ-IDs leak into this verification.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (no behavioral anti-patterns introduced by Phase 1) | — | — | — | — |
| `tests/lib/server/rpcMetrics.test.ts` | 182 | `'alertArg' possibly undefined` | Info | Pre-existing svelte-check baseline error (3 total). Acknowledged carry-forward across Phases 2/3/4. |

### Human Verification Required

OBS-05 — **Vercel Speed Insights live-dashboard verification.** The `injectSpeedInsights()` wiring in the SvelteKit root layout is automatable, but live-dashboard data ingestion (i.e. confirming Vercel actually receives LCP/CLS/INP/TTFB events for `/trade/[token]`) is a Vercel SaaS state and cannot be unit-tested without mocking the entire Vercel API surface (which would test the mock, not the system). Per `01-VALIDATION.md:77`, this was already verified at orchestration time on 2026-04-29 — the Vercel project API returned `speedInsights.hasData: true, enabledAt: 2025-07-21` (~9 months of data). The verification recipe (visit `https://vercel.com/st-0x/st0x/observability/speed-insights`, confirm at least one entry under Recent Visits in the last 24h, confirm `/trade/[token]` route metrics are populated) is documented in `01-RUNBOOK.md` Smoke 3. Empty-dashboard recovery path is documented in the same runbook.

This is framed (per Phase 4's HUMAN-UAT framing in `04-VERIFICATION.md:114`) as a **milestone-level post-deploy validation**, not a Phase 1 success-criterion condition — treating it as Phase 1 gating would conflate phase-completion with operational follow-up. Phase 1 status remains `passed` because the wiring is in place AND the dashboard was empirically observed populated at orchestration time.

### Gaps Summary

No gaps. All 8 phase requirement IDs satisfied, behavioral spot-checks (`npm test`, `npm run check`, plus 5 OBS targeted runs) all pass at expected baselines, all DEPR deletions confirmed by file-system absence + grep zeros, and all OBS observability spine wiring confirmed by file:line grep evidence. The OBS-05 live-dashboard component is a deferred operational verification per the Phase 4 framing and does not block Phase 1 closure.

---

*Verified: 2026-05-03T20:33:15Z*
*Verifier: Claude (gsd-verifier)*
