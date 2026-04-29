---
phase: 01
slug: shrink-the-surface-see-what-s-happening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-29
audit_date: 2026-04-29
requirements_total: 8
requirements_automated: 7
requirements_manual_only: 1
requirements_covered_by_regression: 3
test_count_baseline: 447
test_count_after: 468
tests_added: 21
test_files_added: 3
---

# Phase 01 — Validation Strategy (post-execution audit)

> Retroactive Nyquist audit conducted after `/gsd-execute-phase 1` and `/gsd-secure-phase 1` completed. Audited 8 requirements across 8 plans. 7 automated, 1 manual-only (live-dashboard verification). Test suite went from 447/1-skipped to 468/1-skipped (+21 new tests across 3 new files).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.6 + @testing-library/svelte |
| **Config file** | `vite.config.js` (`test` block) + `vitest-setup.ts` |
| **Quick run command** | `npm test -- <path> --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5s full suite (468 tests) |
| **Environment** | jsdom |
| **Setup mocks** | `$app/environment`, `$app/stores`, `@sentry/sveltekit`, `svelte-wagmi` (in `vitest-setup.ts`) |

---

## Sampling Rate

- **After every task commit:** `npm run check` (svelte-check) + `npm test -- --run`
- **After every plan wave:** Full suite + cross-cutting greps
- **Before phase exit:** Full suite green; baseline-or-better
- **Max feedback latency:** ~5s

---

## Per-Requirement Verification Map

| Req-ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | Status |
|--------|------|------|-------------|------------|-----------|-------------------|--------|
| DEPR-02 | 01-01 | 1 | Admin rewards UI + per-wallet points pipeline + LP_SUBGRAPH_URL deleted | T-01-01..T-01-05 | covered-by-regression | `npm test -- --run` (468 baseline holds after deletion) | ✅ green |
| DEPR-01 | 01-02 | 2 | User-facing rewards UI/APIs deleted; TokenSwap announcement preserved | T-02-01..T-02-05 | covered-by-regression | `npm test -- --run` | ✅ green |
| DEPR-03 | 01-03 | 3 | Onramper modal/route deleted; DepositModal collapsed; CSP cleaned | T-03-01..T-03-06 | covered-by-regression | `npm test -- --run` | ✅ green |
| OBS-01 | 01-04 | 4 | Sentry SDK + recursive PII scrubber + CSP for ingest hosts | T-04-01..T-04-07 | unit | `npm test -- tests/lib/observability/scrub.test.ts --run` | ✅ green (5/5) |
| OBS-02 | 01-05 | 5 | pino + AsyncLocalStorage request-id middleware; per-route levels | T-05-01..T-05-08 | unit | `npm test -- tests/lib/server/logger.test.ts --run` | ✅ green (13/13) |
| OBS-04 | 01-06 | 6 | RPC instrumentation + Telegram chain-exhausted alerts (D-17) | T-06-01..T-06-08 | unit | `npm test -- tests/lib/server/rpcMetrics.test.ts tests/lib/server/alerts.test.ts --run` | ✅ green (7/7 + 8/8) |
| OBS-03 | 01-07 | 6 | Take-order failure transcript dual-sink (Sentry + console) | T-07-01..T-07-07 | unit | `npm test -- tests/lib/services/observability/captureTakeOrderFailure.test.ts --run` | ✅ green (6/6) |
| OBS-05 | 01-08 | 7 | Vercel Speed Insights confirmed receiving data | T-08-01..T-08-03 | manual | 01-RUNBOOK.md Smoke 3 (live-dashboard verification) | ⚪ manual-only |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⚪ manual-only*

---

## Wave 0 Requirements

Existing Vitest infrastructure covers all phase requirements. No new test framework or fixture files required.

The new test files reuse the global mocks already wired in `vitest-setup.ts` (`@sentry/sveltekit` no-op stub from 01-07 covers `captureTakeOrderFailure`'s Sentry sink). Per-test `vi.mock` blocks isolate `$lib/server/logger`, `$lib/server/alerts`, `$env/dynamic/private`, `$app/environment`, and `globalThis.fetch`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel Speed Insights receives LCP/CLS/INP/TTFB for `/trade/[token]` route | OBS-05 | Live-dashboard data ingestion is a Vercel SaaS state — cannot be unit-tested without mocking the entire Vercel API surface, which would test the mock not the system | 01-RUNBOOK.md Smoke 3: open `https://vercel.com/st-0x/st0x/observability/speed-insights`, confirm at least one entry under Recent Visits in the last 24h, confirm `/trade/[token]` route metrics are populated. Empty-dashboard recovery path documented in RUNBOOK. **Verified 2026-04-29 at orchestration time:** Vercel project API returned `speedInsights.hasData: true, enabledAt: 2025-07-21` (~9 months of data). |

---

## Tests Added (Phase 1 Nyquist Validation)

| File | Tests | Surface |
|------|-------|---------|
| `tests/lib/server/rpcMetrics.test.ts` | 7 | recordRpcAttempt (debug/warn levels), reportChainExhausted error log + notifyChainExhausted invocation, attempts list propagation, alert-delivery exception caught + logged |
| `tests/lib/server/alerts.test.ts` | 8 | Telegram POST URL/body shape, fail-closed when bot token missing, fail-closed when chat id missing, 🚨 prefix + fn + RPC URLs + request_id in `text`, 512-char per-error truncation, AbortSignal.timeout(3000), fetch-error rethrow, dev-mode fail-silent |
| `tests/lib/services/observability/captureTakeOrderFailure.test.ts` | 6 | Sentry.captureException with tags + extra, console.error JSON line tagged `[take-order failed]`, T-07-04 try/catch around BOTH sinks, 5 TakeOrderFailureReason labels round-trip, full D-08 transcript shape preserved in extra |
| **Total** | **21** | — |

---

## Validation Sign-Off

- [x] All requirements have `<automated>` verification OR documented manual-only with reason (OBS-05)
- [x] Sampling continuity: every plan has at least one targeted test or covered-by-regression
- [x] Wave 0 needs: none — existing infra sufficient
- [x] No watch-mode flags
- [x] Feedback latency < 5s (full suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-29 (orchestrator-led audit; gsd-nyquist-auditor wrote tests).

---

## Validation Audit 2026-04-29

| Metric | Count |
|--------|-------|
| Gaps found | 2 (OBS-03, OBS-04) |
| Resolved | 2 (3 test files / 21 tests written, all green) |
| Escalated | 0 |
| Manual-only | 1 (OBS-05 Speed Insights) |
| Covered-by-regression | 3 (DEPR-01/02/03 — deletion plans, asserted by 468-test baseline + cross-cutting greps in 01-RUNBOOK) |
| Test count baseline → after | 447 → 468 |
| New test files | 3 |
| New tests | 21 |
| Test runtime | ~5s full suite |
| Failures introduced | 0 |
