---
phase: 03-production-grade-hardening
plan: 05
subsystem: security
tags: [phase-3, sec-06, rate-limit, admin-gate, snapshots, vercel-kv]

# Dependency graph
requires:
  - phase: 03-production-grade-hardening
    provides: "rateLimit.ts:applyTieredRateLimit + tieredLimits map (Phase 0); requireAdmin guard in adminAuth.ts (Phase 0); kv.ts (Phase 1 OBS-* foundation)"
provides:
  - "snapshotsPreview tier in tieredLimits (1/min anon, 3/min auth) — heaviest expense in spirit (preview takes 10-60s wall time)"
  - "GET /api/snapshots/preview wrapped with applyTieredRateLimit('snapshotsPreview', ...)"
  - "GET /api/snapshots/preview-stream wrapped with applyTieredRateLimit BEFORE SSE stream construction (429 returns plain JSON, not event-stream)"
  - "POST /api/snapshots/generate gated by requireAdmin (admin session + rate-limit; cron path unaffected per Pitfall 5 grep verification)"
affects: [phase-3-wave-6 (SEC-03 session-cookie atomic flip — Plan 03-08b will swap the cookie read at these call sites from 'wallet-address' → 'session' + KV lookup), phase-3-runbook (03-RUNBOOK.md SEC-06 smoke test: anonymous browser → preview → 429 after 1 hit; non-admin browser → POST generate → 401)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tier-name-must-exist-before-wrap pattern: applyTieredRateLimit fails OPEN on unknown tier names (Pitfall 4); always add tier to tieredLimits map FIRST, then wrap call sites"
    - "Rate-limit-before-stream pattern for SSE endpoints: invoke rate-limit early-return BEFORE constructing the ReadableStream so 429 responses are plain JSON (not malformed event-stream that confuses EventSource clients)"
    - "Cookie-name-change-deferral pattern: wrapper code reads the legacy 'wallet-address' cookie at call sites; the atomic flip to 'session' cookie + KV lookup is owned by a single later plan (03-08b / SEC-03), not pre-emptively scattered across consumers"

key-files:
  created: []
  modified:
    - src/lib/server/rateLimit.ts
    - src/routes/api/snapshots/preview/+server.ts
    - src/routes/api/snapshots/preview-stream/+server.ts
    - src/routes/api/snapshots/generate/+server.ts

key-decisions:
  - "snapshotsPreview tier added FIRST (before wrapping endpoints) per RESEARCH Pitfall 4 — applyTieredRateLimit returns null (allow) when the tier key is missing from tieredLimits; reversing the order would have left a window where the wrap fails open. Tier definition (1/min anon, 3/min auth) sized as the heaviest in spirit because preview takes 10-60s wall-clock per request, the most expensive endpoints in the snapshot subsystem."
  - "POST /api/snapshots/generate gated by requireAdmin only — no CRON_SECRET escape hatch. RESEARCH Pitfall 5 verified by grep at planning time AND re-verified at execution time: cron uses CRON_SECRET and calls generateAllTokenSnapshots() directly from the generator module (src/routes/api/cron/snapshots/+server.ts:87,117), bypassing the HTTP endpoint entirely. The CONTEXT D-03 fallback (requireAdmin + CRON_SECRET escape hatch) was kept available as a contingency but not needed."
  - "SSE rate-limit wrap fires BEFORE `new ReadableStream(...)` construction so a 429 response is plain application/json, not a half-formed text/event-stream. Same shape as fastify/koa SSE rate-limit middleware patterns. Inside the stream's start(), the rate-limit error path would have to manually emit an SSE 'error' event + close — strictly worse for client compat."
  - "Cookie name read at the rate-limit tier optimization is the legacy 'wallet-address' cookie. Per CONTEXT D-04 / Plan 03-08b atomic flip, the migration to the new signed 'session' cookie + KV-lookup of verified walletAddress is owned by a SINGLE later plan (Wave 6, after SEC-03 lands) — pre-emptively migrating individual call sites here would create an inconsistent intermediate state across the codebase."
  - "Plan acceptance gates `grep -c 'snapshotsPreview' rateLimit.ts | xargs test 1 -le` and `grep -c 'applyTieredRateLimit' preview/+server.ts | xargs test 1 -le` — the `1 -le` predicate is `1 ≤ N`, satisfied by the literal 1 hit per file (tier name appears once + import + wrap). All five grep gates green."

patterns-established:
  - "Heaviest-tier-by-wall-time pattern: when a tier represents endpoints with high CPU/IO cost per request (snapshotsPreview = 10-60s per call), the tier limits should be at the strictest end of the spectrum (1/min anon, 3/min auth) regardless of read-vs-write semantics. Not all expensive endpoints are POSTs."
  - "Cron-doesn't-call-generate invariant: when adding admin gates to API endpoints that share business logic with cron jobs, always grep at execution time AND in the verify gate for `/api/{endpoint}` references to confirm cron uses the underlying module function, not the HTTP endpoint. Documented as RESEARCH Pitfall 5; same pattern applies to other cron-adjacent endpoints in the codebase."

requirements-completed: [SEC-06]

# Metrics
duration: 18min
completed: 2026-04-30
---

# Phase 3 Plan 05: SEC-06 Snapshot Rate-Limit + Admin Gate Summary

**Snapshot preview endpoints capped at 1/min anon (3/min auth) via new snapshotsPreview tier; POST /api/snapshots/generate gated behind requireAdmin — closes audit finding "preview runs full snapshot recalc with no rate limit" without breaking cron path.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-30T09:16:13Z
- **Completed:** 2026-04-30T09:34:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- SEC-06 closed — both halves (rate-limit + admin gate) shipped in atomic commits
- New `snapshotsPreview` tier registered in `tieredLimits` map BEFORE wrap (Pitfall 4 mitigation): 1 request/min for anonymous, 3 requests/min for connected wallets
- `GET /api/snapshots/preview` wrapped with `applyTieredRateLimit('snapshotsPreview', 'snapshots-preview', wallet)` — anonymous browsers can no longer DoS the snapshot subsystem (preview takes 10-60s wall time per request)
- `GET /api/snapshots/preview-stream` wrapped BEFORE `new ReadableStream(...)` construction — 429 responses are plain JSON, not malformed event-stream
- `POST /api/snapshots/generate` gated by `requireAdmin(request, cookies, 'snapshots-generate')` — non-admin sessions get 401; rate-limit handled inside the guard via `rateLimiters.admin`
- Cron path verified untouched — RESEARCH Pitfall 5 grep re-verified at execution time (0 callers of `/api/snapshots/generate` in src/); cron uses `CRON_SECRET` + direct `generateAllTokenSnapshots()` call from the generator module, bypassing the HTTP endpoint entirely

## Task Commits

Each task was committed atomically:

1. **Task 1: SEC-06 add snapshotsPreview tier + wrap preview endpoints** — `ed0f22c` (feat)
2. **Task 2: SEC-06 requireAdmin gate on POST /api/snapshots/generate** — `3b1711b` (feat)

## Files Created/Modified

- `src/lib/server/rateLimit.ts` — Added `snapshotsPreview` tier to `tieredLimits` map (anon 1/min, auth 3/min)
- `src/routes/api/snapshots/preview/+server.ts` — Imported `applyTieredRateLimit`, replaced GET signature `({ url })` → `({ url, request, cookies })`, added rate-limit early-return BEFORE existing handler body
- `src/routes/api/snapshots/preview-stream/+server.ts` — Imported `applyTieredRateLimit`, replaced GET signature `({ url })` → `({ url, request, cookies })`, added rate-limit early-return BEFORE `new ReadableStream(...)` construction so 429 returns plain JSON
- `src/routes/api/snapshots/generate/+server.ts` — Imported `requireAdmin` from `$lib/server/adminAuth`, replaced POST signature `({ request })` → `({ request, cookies })`, added `requireAdmin(... 'snapshots-generate')` early-return BEFORE existing handler body

## Decisions Made

- **Tier-first ordering:** `snapshotsPreview` added to `tieredLimits` in the same commit as the wrap, but ordered FIRST in the diff so even mid-edit no version of the file ships a wrap referencing an undefined tier. RESEARCH Pitfall 4 explicitly notes `applyTieredRateLimit` returns `null` (allow) on unknown tier names — same as old "fail open" behavior. Strict ordering closes the window.
- **No CRON_SECRET escape hatch in /generate:** CONTEXT D-03 left two options (`requireAdmin only` vs `requireAdmin + CRON_SECRET fallback`). Chose `requireAdmin only` because RESEARCH Pitfall 5 grep at planning time AND at execution time confirms cron does NOT call this endpoint; it calls `generateAllTokenSnapshots()` directly from the generator module. Adding a CRON_SECRET branch would be dead code.
- **SSE rate-limit before stream construction:** chose to fire `applyTieredRateLimit` BEFORE `new ReadableStream(...)` so a 429 returns plain JSON. Inside the stream's `start()`, a rate-limit denial would have to manually emit an SSE `error` event + close the controller — same effect from client POV but strictly worse for plain HTTP clients (curl, browser DevTools).
- **Cookie name `'wallet-address'` retained:** CONTEXT D-04 + Plan 03-08b own the atomic flip from legacy 'wallet-address' cookie → signed 'session' cookie + KV lookup. Pre-emptively reading 'session' here would create an inconsistent intermediate state across the codebase before SEC-03 lands. Documented inline in both call sites + the tier comment in rateLimit.ts so the 03-08b consumer migration find/replace catches both.
- **Rate-limit prefix `'snapshots-generate'`:** matches the `requireAdmin(... 'admin-snapshots-regenerate')` precedent in `src/routes/api/admin/snapshots/regenerate/+server.ts:14` for log-search consistency.

## Deviations from Plan

None - plan executed exactly as written.

Both tasks landed verbatim per the plan body. All 8 acceptance criteria across the two tasks satisfied on first pass:

- `grep -c "snapshotsPreview" rateLimit.ts` = 1 ✓ (≥ 1 required)
- `grep -c "snapshotsPreview" preview/+server.ts` = 1 ✓
- `grep -c "snapshotsPreview" preview-stream/+server.ts` = 1 ✓
- `grep -c "applyTieredRateLimit" preview/+server.ts` = 2 ✓ (import + call)
- `grep -c "applyTieredRateLimit" preview-stream/+server.ts` = 2 ✓ (import + call)
- `grep -rn "/api/snapshots/generate" src ... | grep -v "generate/+server.ts"` = 0 ✓ (Pitfall 5 re-verified)
- `grep -c "requireAdmin" generate/+server.ts` = 2 ✓ (import + call)
- `grep -c "'snapshots-generate'" generate/+server.ts` = 1 ✓

## Issues Encountered

None. Both tasks landed in single edits with no iteration.

## Verification Evidence

- **svelte-check baseline preserved:** 3 errors (all in `tests/lib/server/rpcMetrics.test.ts` — unchanged from prior plans 03-01..04 baseline)
- **Full test suite:** 542 passed | 1 skipped | 0 failed (34 test files; matches Plan 03-04's post-fix count exactly — no regressions, no new tests added since this plan's behavior change is wire-up only and doesn't admit easy unit-testable seams without a test KV)
- **rateLimit unit tests:** 1 passed (existing single test, untouched)
- **Cross-cutting Phase 2 gates:** carry-forward green — no trade-execution code modified by this plan (only 4 snapshot/rate-limit files touched per `git diff HEAD~2 HEAD --name-only`):
  - TRADE-01 IO-perspective lockdown — unchanged
  - TRADE-02 cycle severance — unchanged
  - failWith() count = 19 (≥ 12) ✓
  - EMERGENCY_RATIO_MULTIPLIER = 0 ✓
  - staleTime: Infinity = 4 ✓
- **Cron-doesn't-call invariant:** `grep -rn "/api/snapshots/generate" src --include="*.ts" --include="*.svelte" --include="*.js" | grep -v "generate/+server.ts"` returns 0 hits at execution time (Pitfall 5 re-verified)
- **No accidental file deletions:** `git diff --diff-filter=D --name-only HEAD~1 HEAD` empty for both task commits

## User Setup Required

None - no external service configuration required. Existing `KV_REST_API_URL` + `KV_REST_API_TOKEN` env vars (used by `getKv()` inside `applyTieredRateLimit` → `checkRateLimit`) are already configured in production.

## Next Phase Readiness

**Wave 3 of Phase 3 complete.** Plans 03-06 (SEC-04 — IDOR / authorization audit) and 03-07 (REL-01 — RPC retry hardening) are unblocked.

**Hand-off to Plan 03-08b (Wave 6):** when SEC-03 atomic flip lands, two call sites need the cookie-read swap from `cookies.get('wallet-address')` to KV-lookup of `verifiedWallet` from the new 'session' cookie:
- `src/routes/api/snapshots/preview/+server.ts:13-15`
- `src/routes/api/snapshots/preview-stream/+server.ts:12-14`

Both sites have inline `// Plan 03-08b / SEC-03 will swap ...` comments to make the find/replace trivial. The `rateLimit.ts` tier definition itself does NOT need to change (only the wallet-string source upstream).

**Audit finding closed:** CONCERNS.md §"snapshot preview is unrate-limited expensive endpoint" — first half (rate-limit) AND second half (admin gate on generate) both addressed by this plan.

## Self-Check: PASSED

**Files exist:**
- `/Users/alastairong/st0x/st0x/.planning/phases/phase-03-production-grade-hardening/03-05-SUMMARY.md` ✓ (this file)
- `/Users/alastairong/st0x/st0x/src/lib/server/rateLimit.ts` ✓ (modified — `snapshotsPreview` tier added)
- `/Users/alastairong/st0x/st0x/src/routes/api/snapshots/preview/+server.ts` ✓ (modified — applyTieredRateLimit wrap)
- `/Users/alastairong/st0x/st0x/src/routes/api/snapshots/preview-stream/+server.ts` ✓ (modified — applyTieredRateLimit wrap)
- `/Users/alastairong/st0x/st0x/src/routes/api/snapshots/generate/+server.ts` ✓ (modified — requireAdmin guard)

**Commits exist:**
- `ed0f22c` ✓ (Task 1: feat(03-05): add snapshotsPreview tier + wrap preview endpoints)
- `3b1711b` ✓ (Task 2: feat(03-05): gate POST /api/snapshots/generate with requireAdmin)

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
