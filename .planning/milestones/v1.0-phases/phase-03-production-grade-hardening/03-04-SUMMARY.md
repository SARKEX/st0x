---
phase: 03-production-grade-hardening
plan: 04
subsystem: security
tags: [phase-3, sec-07, hcaptcha, vercel-env, fail-closed, captcha]

# Dependency graph
requires:
  - phase: 03-production-grade-hardening
    provides: "03-01 SEC-01 env-var split for accessCodes.ts (BASE_RPC_URL + module-load throw); 03-03 SEC-05 pickFromAlphabet helper in accessCodes.ts (file already touched in same module)"
provides:
  - "verifyCaptcha fails closed on Vercel preview when HCAPTCHA_SECRET unset"
  - "VERCEL_ENV-based environment classification replaces NODE_ENV-based gate (canonical Vercel signal per ctx7 /websites/vercel)"
affects: [phase-3-wave-3 (SEC-06 snapshot rate-limit + admin gate), phase-3-wave-4 (REL-01 retry shape — same accessCodes.ts module surface), phase-3-runbook (03-RUNBOOK.md captcha smoke test under VERCEL_ENV=preview)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vercel canonical environment classifier: env.VERCEL_ENV !== 'development' as the fail-closed gate; NODE_ENV-based gates are anti-pattern on Vercel because NODE_ENV='production' on BOTH preview and production deploys"
    - "Per-test $env/dynamic/private mock override via vi.doMock + Proxy backed by process.env (same shape as 03-02's auth.test.ts / csrf.test.ts solution for esm-env caching)"

key-files:
  created: []
  modified:
    - src/lib/server/accessCodes.ts
    - src/lib/server/accessCodes.test.ts

key-decisions:
  - "Replaced process.env.NODE_ENV === 'production' gate at verifyCaptcha with env.VERCEL_ENV !== 'development'. Vercel preview deploys (VERCEL_ENV='preview') no longer bypass captcha; only local development (VERCEL_ENV='development' or undefined-on-localhost) tolerates missing HCAPTCHA_SECRET. NODE_ENV-based gate was the audit finding (CONCERNS.md §HCAPTCHA bypass in non-production environments) because Vercel sets NODE_ENV='production' on BOTH preview and production deploys."
  - "Test infrastructure: SEC-07 describe block uses vi.doMock('$env/dynamic/private', ...) per beforeEach with a Proxy reading from process.env at access time, so per-test setup of VERCEL_ENV / HCAPTCHA_SECRET flows through. Same pattern Plan 03-02 established (esm-env caches at first node_modules transform; static top-level vi.mock cannot be re-evaluated mid-suite, but vi.doMock inside beforeEach + vi.resetModules() + vi.doMock under a Proxy works)."
  - "Updated existing 'allows captcha bypass when secret is missing in non-production' test (line 99 of pre-fix file) — that test pinned the BUG (NODE_ENV='test' → bypass). Post-fix, the static $env/dynamic/private mock returns env.VERCEL_ENV=undefined which makes the new gate fail closed regardless of NODE_ENV. The legacy test was a stale pin of the pre-fix behavior, not a stable contract; collapsed to a single 'fails closed for captcha when secret is missing (default — VERCEL_ENV undefined)' test that asserts the post-fix invariant under the existing static mock."
  - "Plan acceptance gate `! grep -E \"process\\.env\\.NODE_ENV === 'production'\" src/lib/server/accessCodes.ts` (0 hits) deemed plan-text-vs-plan-intent: 3 unrelated NODE_ENV checks remain in isWalletRegistered, processRegistration, and processRegistrationWithRedis (KV-availability fail-open gates, NOT captcha logic). Plan **intent** is 'remove from verifyCaptcha' which is satisfied — the `!grep` gate would have required out-of-scope churn on unrelated functions."

patterns-established:
  - "Vercel-canonical fail-closed gate pattern: `if (env.VERCEL_ENV !== 'development') return false;` inside missing-secret branches. Future Phase 3 work (SEC-06, REL-01, etc.) referencing environment-based fail-closed gates should use the same signal — not NODE_ENV which conflates preview and production."
  - "TDD test pattern for $env/dynamic/private flag-controlled tests: vi.doMock + Proxy-over-process.env in beforeEach. Compatible with vi.resetModules() and avoids esm-env caching issues."

requirements-completed: [SEC-07]

# Metrics
duration: 4min
completed: 2026-04-30
---

# Phase 3 Plan 04: SEC-07 hCaptcha VERCEL_ENV Fail-Closed Summary

**verifyCaptcha now fails closed on Vercel preview deploys without HCAPTCHA_SECRET — replaces NODE_ENV-based gate with env.VERCEL_ENV !== 'development' (canonical Vercel signal).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-30T10:04:30Z
- **Completed:** 2026-04-30T10:08:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- SEC-07 closed — Vercel preview deploys without HCAPTCHA_SECRET now fail closed instead of bypassing captcha (closes the audit finding from CONCERNS.md §"HCAPTCHA bypass in non-production environments")
- 4 SEC-07 tests pin VERCEL_ENV semantics: production+no-secret → false; preview+no-secret → false (the bug fix); development+no-secret → true; secret-set → real fetch path
- All Phase 2 cross-cutting gates green; svelte-check baseline = 3 errors preserved
- Wave 2 of Phase 3 complete (SEC-02 ✓ / SEC-05 ✓ / SEC-07 ✓); Phase 3 ready for Wave 3 (SEC-06)

## Task Commits

Each step was committed atomically (TDD RED → GREEN):

1. **Task 1 RED: SEC-07 VERCEL_ENV fail-closed tests** — `d397fd3` (test)
2. **Task 1 GREEN: verifyCaptcha VERCEL_ENV gate + legacy test refactor** — `4fe402a` (feat)

## Files Created/Modified
- `src/lib/server/accessCodes.ts` — verifyCaptcha now uses `env.VERCEL_ENV !== 'development'` gate; doc comment explains canonical Vercel signal vs NODE_ENV pitfall; legacy fail-closed/bypass log messages updated to include VERCEL_ENV value for log triage
- `src/lib/server/accessCodes.test.ts` — added SEC-07 describe block (4 tests: production+no-secret, preview+no-secret, development+no-secret, secret-set+fetch); updated legacy "non-production bypass" test to align with new VERCEL_ENV semantics

## Decisions Made
See `key-decisions` in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan-Text-vs-Plan-Intent] Updated stale legacy test rather than removing it**
- **Found during:** Task 1 GREEN (verifying tests after the verifyCaptcha gate flip)
- **Issue:** The pre-fix test at line 99 of accessCodes.test.ts (`'allows captcha bypass when secret is missing in non-production'`) pinned the BUG behavior — NODE_ENV='test' → bypass. Post-fix, that test contract is invalid: with `env.VERCEL_ENV=undefined` (from the existing static `vi.mock('$env/dynamic/private', () => ({ env: { HCAPTCHA_SECRET: '', REDIS_URL: '' }}))` mock), `undefined !== 'development'` is true, so the gate fails closed regardless of NODE_ENV. The plan's `<behavior>` section did not list updating this test.
- **Fix:** Collapsed the 2 legacy verifyCaptcha tests into 1 — kept the production-fails-closed assertion (now framed as "default mock VERCEL_ENV undefined → fails closed regardless of NODE_ENV") with a relaxed `expect.stringContaining(...)` log assertion that survives the log-message rename. Removed the bypass-in-non-production test because it pinned the bug; the new SEC-07 development test (`'tolerates missing HCAPTCHA_SECRET in local development'`) covers the legitimate dev-bypass path explicitly under VERCEL_ENV='development'.
- **Files modified:** src/lib/server/accessCodes.test.ts
- **Verification:** 11/11 tests pass (was 8 + 4 new = expected 12; net 11 because 1 stale test removed). All SEC-07 invariants pinned.
- **Committed in:** 4fe402a (GREEN commit)

**2. [Rule 1 - Plan-Text-vs-Plan-Intent] Plan acceptance gate `! grep ... NODE_ENV === 'production' ... = 0 hits` partially satisfied**
- **Found during:** Verification step after GREEN commit
- **Issue:** Plan literal acceptance gate requires 0 hits of `process.env.NODE_ENV === 'production'` in src/lib/server/accessCodes.ts. After the fix, 3 hits remain — at lines 343 (isWalletRegistered Redis fail-open), 430 (processRegistration KV-not-found fail-closed), 486 (processRegistrationWithRedis Redis fail-closed). These are KV-availability gates that govern whether Redis fail-open vs in-memory fallback semantics fire — they have nothing to do with captcha logic.
- **Fix:** No code change to those 3 lines — they are out of SEC-07 scope per SCOPE BOUNDARY rule. Documented in 03-PATTERNS.md / future plans as the surviving NODE_ENV gates that govern Redis fail-open behavior. Same plan-text-vs-plan-intent class as 02-03/02-04/02-07/03-02 (planner literal-grep over-strict; materially-important gate satisfied: verifyCaptcha specifically uses VERCEL_ENV).
- **Files modified:** None (intentional — these 3 functions are out of SEC-07 scope; touching them risks regression in unrelated KV fail-open semantics)
- **Verification:** Materially-important gates satisfied: `grep -c "VERCEL_ENV !== 'development'" src/lib/server/accessCodes.ts` = 1; `grep -c "VERCEL_ENV" src/lib/server/accessCodes.ts` = 4 (1 in code + 3 in doc comment); `grep -nE "process\.env\.NODE_ENV === 'production'" src/lib/server/accessCodes.ts` returns lines 343/430/486 — all in unrelated KV-availability gates, none in verifyCaptcha. Future Phase 3 work (or Phase 4 cleanup) may revisit those 3 sites if Redis fail-open semantics are revised.
- **Committed in:** 4fe402a (GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 plan-text-vs-plan-intent reframings — same class as Plans 02-03, 02-04, 02-07, 03-02)
**Impact on plan:** Both reframings preserve plan **intent** (verifyCaptcha uses VERCEL_ENV; tests pin post-fix invariants) while declining out-of-scope churn. SEC-07 audit finding (CONCERNS.md §"HCAPTCHA bypass in non-production environments") closed.

## Issues Encountered
- vitest mock for $env/dynamic/private under VERCEL_ENV control required vi.doMock + Proxy-over-process.env (same shape as Plan 03-02's auth.test.ts / csrf.test.ts solution). Resolved by following the established 03-02 pattern verbatim. RED tests failed as expected (production + preview both bypassed under NODE_ENV='test' + legacy gate); GREEN flip closed the gate; all 4 SEC-07 + 1 retained legacy test pass under the new gate.

## TDD Gate Compliance

Plan declared `tdd="true"` on Task 1. Gate sequence verified in git log:
- RED commit: `d397fd3` (test) — added 4 SEC-07 failing tests
- GREEN commit: `4fe402a` (feat) — verifyCaptcha uses VERCEL_ENV; tests pass
- REFACTOR: not needed (single-line gate flip; legacy test refactor folded into GREEN per pattern Plan 03-02 / 03-03 used)

## Cross-Cutting Phase 2 Gates

| Gate | Status | Evidence |
|------|--------|----------|
| TRADE-01 IO-perspective lockdown | ✓ green | 0 banned reads in marketOrderExecution.ts |
| TRADE-02 cycle severance | ✓ green | 0 transaction-store imports in marketOrderExecution.ts |
| failWith() count ≥ 12 | ✓ green | 16 in marketOrderExecution.ts |
| EMERGENCY_RATIO_MULTIPLIER count = 0 | ✓ green | 0 in marketOrderExecution.ts |
| staleTime: Infinity preserved | ✓ green | 3 occurrences in src/lib/queries/ |
| svelte-check baseline ≤ 3 errors | ✓ green | 3 errors (rpcMetrics.test.ts pre-existing TS2532; unchanged) |

## User Setup Required

None for SEC-07 itself — local development sets `VERCEL_ENV=development` (or omits the var, in which case captcha bypass requires explicit `VERCEL_ENV=development` going forward — local Node without `vercel dev` will fail closed unless HCAPTCHA_SECRET is set OR developer explicitly sets `VERCEL_ENV=development` in their .env).

**Operational note for 03-RUNBOOK.md (Plan 03-11):** A Vercel preview deploy without HCAPTCHA_SECRET will now reject access-code submissions (returns false from verifyCaptcha → 401 from the access-code route). Document the smoke recipe: deploy preview without secret → POST to /api/access/check → expect 401; deploy preview with secret → POST → expect 200.

## Self-Check: PASSED

**File existence:**
- `src/lib/server/accessCodes.ts` exists ✓
- `src/lib/server/accessCodes.test.ts` exists ✓

**Commits exist in git log:**
- `d397fd3` test(03-04): add SEC-07 VERCEL_ENV fail-closed tests for verifyCaptcha ✓
- `4fe402a` feat(03-04): SEC-07 verifyCaptcha fails closed on Vercel preview without HCAPTCHA_SECRET ✓

**Acceptance gates:**
- `grep -c "VERCEL_ENV !== 'development'" src/lib/server/accessCodes.ts` = 1 ✓
- `grep -c "VERCEL_ENV" src/lib/server/accessCodes.ts` = 4 ≥ 1 ✓
- verifyCaptcha-specific NODE_ENV check removed ✓ (3 surviving NODE_ENV checks are unrelated KV-availability gates — out of SEC-07 scope per SCOPE BOUNDARY rule)
- `npm test -- --run accessCodes.test` 11/11 pass ✓
- `npm run check` 3 errors (baseline preserved) ✓
- Full test suite 542 pass / 1 skip / 0 fail ✓

## Next Phase Readiness

Wave 2 of Phase 3 COMPLETE (3/3 plans: 03-02 SEC-02 ✓ / 03-03 SEC-05 ✓ / 03-04 SEC-07 ✓).

**Phase 3 progress:** 4/11 plans complete. Wave 1 (SEC-01) ✓; Wave 2 (SEC-02, SEC-05, SEC-07) ✓; Wave 3 (SEC-06 snapshots rate-limit + admin gate) ready to start.

**Carry-forward gates green:** All Phase 2 cross-cutting gates verified above.

**Deferred items:** 3 unrelated `process.env.NODE_ENV === 'production'` checks remain in accessCodes.ts (lines 343, 430, 486 — Redis fail-open / KV-not-found gates). NOT deferred to a phase-3 deferred-items list because: (a) they pre-date Phase 3 entirely; (b) they govern Redis-availability fail-open semantics which is a separate audit topic from SEC-07; (c) Phase 4 may revisit if a related concern emerges. Documented here for traceability.

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
