---
phase: 03-production-grade-hardening
plan: 02
subsystem: server-auth
tags: [phase-3, sec-02, fail-closed, module-load, secrets, auth, csrf]

requires:
  - phase: 01-shrink-the-surface-see-what-s-happening
    provides: "CRON_SECRET module-load fail-closed precedent (src/routes/api/cron/snapshots/+server.ts:42-49) that this plan mirrors at module-top instead of function-body"
  - phase: 03-production-grade-hardening
    plan: 01
    provides: "SEC-01 module-top throw + dev-fallback pattern (accessCodes.ts, referrals.ts) reused verbatim for SEC-02 — same shape, different env var"
provides:
  - "Module-top throw guard for SESSION_SECRET in src/lib/server/auth.ts (SEC-02 closure)"
  - "Module-top throw guard for CSRF_SECRET / SESSION_SECRET (A4 aliasing) in src/lib/server/csrf.ts (SEC-02 closure)"
  - "Test boilerplate for SEC-02 fail-closed module-load throws — `vi.mock('$app/environment')` with hoisted devRef + `vi.mock('$env/dynamic/private')` Proxy reading process.env. Reusable for future fail-closed tests on other server modules."
  - "Phase-exit gate evidence: `! grep -E \"'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'\" src/` returns 0 hits"
affects: [phase-3-wave-6-sec-04, phase-3-wave-8-runbook]

tech-stack:
  added: []
  patterns:
    - "Module-top !dev && !env.X throw at boot (vs function-body lazy throw) — RESEARCH Pitfall 2: cold-start crash surfaces in Vercel Logs at deploy, not at first authenticated request"
    - "Dual-source secret with aliasing: CSRF_SECRET preferred when set; SESSION_SECRET fallback preserves current production deploy (which has only SESSION_SECRET set)"
    - "Test mocks: hoisted devRef + Proxy over process.env to drive `dev` and `env.X` at test time because Vite caches `esm-env/dev-fallback.js` at first node_modules transform and `vi.resetModules()` does not re-evaluate node_modules"

key-files:
  created:
    - "src/lib/server/auth.test.ts (SEC-02 module-load throw — 3 tests pinning prod-throw, dev-tolerates, prod-with-secret-loads)"
    - "src/lib/server/csrf.test.ts (SEC-02 module-load throw — 4 tests pinning prod-throw, A4-SESSION_SECRET-aliasing, CSRF_SECRET-only, dev-tolerates)"
    - ".planning/phases/phase-03-production-grade-hardening/deferred-items.md (logs pre-existing $env/dynamic/public test resolution failure introduced by Plan 03-01)"
  modified:
    - "src/lib/server/auth.ts (added `import { dev } from '$app/environment'` + module-top throw guard + module-level SESSION_SECRET const; removed `'st0x-session-secret-2024'` fallback from createSessionToken's local `secret` const)"
    - "src/lib/server/csrf.ts (added `import { dev } from '$app/environment'` + module-top throw guard with A4 aliasing; removed `'default-csrf-secret-change-in-production'` fallback)"

key-decisions:
  - "Mocked `$app/environment` and `$env/dynamic/private` in test files because Vite caches `esm-env/dev-fallback.js` at first node_modules transform — `vi.resetModules()` does not clear node_modules transforms, so `dev` cannot be flipped via NODE_ENV alone in tests. Hoisted devRef + Proxy-over-process.env pattern lets each test drive both inputs independently. Same precedent the existing accessCodes.test.ts skipped (it never tests the module-load throw — only the function-level production behaviour). This plan's test-boilerplate is reusable for any future SEC-* fail-closed module-load test."
  - "RED test commit deliberately preserved even though the post-edit test code differs from the pre-edit version. RED's purpose is to prove the throw fires, not to assert specific test infrastructure. The mock-based approach is the only way to test module-load semantics in vitest, but the assertion (rejects.toThrow with the right message) is identical."
  - "Module-top throw vs function-body throw chosen per RESEARCH Pitfall 2. CRON_SECRET precedent at src/routes/api/cron/snapshots/+server.ts:42-49 uses function-body 503 because the CRON_SECRET is only needed at the cron-handler boundary; SESSION_SECRET and CSRF_SECRET are needed everywhere these modules are imported, so module-top is the natural throw site (cold-start crash visible in Vercel Logs, no half-initialized lambda)."
  - "A4 aliasing preserved verbatim — `env.CSRF_SECRET || env.SESSION_SECRET` ordering means the current production deploy (which has only SESSION_SECRET set per RESEARCH §A4) continues to work without ops change. Plan 03-08a (SEC-04) will replace generateCsrfToken / validateCsrfToken with session-bound variants but the secret-source aliasing stays."
  - "Did NOT add round-trip CSRF coverage in this plan — plan-author's <behavior> note explicitly defers round-trip to 03-08a SEC-04 because that plan deletes generateCsrfToken / validateCsrfToken and replaces them with generateCsrfTokenForSession / validateCsrfTokenForSession. Adding round-trip tests now would just need rewriting in 03-08a."

patterns-established:
  - "Module-top throw guard for fail-closed secrets: `import { dev } from '$app/environment'; if (!dev && !env.X) throw new Error('[module] X required in production');` followed by `const X = env.X || (dev ? 'dev-only-do-not-use-in-prod' : '');`"
  - "Dual-source secret with explicit aliasing: `if (!dev && !env.A && !env.B) throw; const X = env.A || env.B || (dev ? 'placeholder' : '');`"
  - "SEC-02 test boilerplate (vitest): hoisted devRef + Proxy-over-process.env for $env/dynamic/private — reusable for any future fail-closed module-load test"

requirements-completed: [SEC-02]

duration: ~6min
completed: 2026-04-30
---

# Phase 3 Plan 02: SEC-02 Fail-Closed auth.ts + csrf.ts Summary

**Removed `'st0x-session-secret-2024'` fallback from auth.ts and `'default-csrf-secret-change-in-production'` fallback from csrf.ts; replaced with module-top throw guards that crash the lambda at cold start (Vercel Logs surfaces immediately) when SESSION_SECRET / CSRF_SECRET are missing in production. CSRF_SECRET → SESSION_SECRET aliasing preserved per RESEARCH §A4 so the current production deploy continues to work unchanged.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-30T08:29:15Z
- **Completed:** 2026-04-30T08:35:14Z
- **Tasks:** 2 of 2 completed
- **Files created:** 3 (auth.test.ts + csrf.test.ts + deferred-items.md)
- **Files modified:** 2 (auth.ts + csrf.ts)

## Accomplishments

- `src/lib/server/auth.ts` throws at module-top in production when `SESSION_SECRET` is missing (`!dev && !env.SESSION_SECRET`). Dev/test mode tolerates missing secret via `'dev-only-do-not-use-in-prod'` placeholder. The fallback string `'st0x-session-secret-2024'` is removed from src/.
- `src/lib/server/csrf.ts` throws at module-top in production when both `CSRF_SECRET` and `SESSION_SECRET` are missing (`!dev && !env.CSRF_SECRET && !env.SESSION_SECRET`). A4 aliasing preserved: `env.CSRF_SECRET || env.SESSION_SECRET || (dev ? placeholder : '')`. Existing `generateCsrfToken` / `validateCsrfToken` bodies untouched (Plan 03-08a SEC-04 will replace them with session-bound variants). The fallback string `'default-csrf-secret-change-in-production'` is removed from src/.
- Two new test files (`src/lib/server/auth.test.ts`, `src/lib/server/csrf.test.ts`) pin the SEC-02 module-load throw behaviour with 7 total tests (3 + 4). Test boilerplate uses hoisted `devRef` + Proxy-over-`process.env` for `$env/dynamic/private` because Vite caches `esm-env/dev-fallback.js` at first node_modules transform; `vi.resetModules()` does not re-evaluate node_modules so `dev` cannot be flipped via `NODE_ENV` alone.
- Phase-exit gate green: `! grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts` returns 0 hits.
- Cross-cutting Phase 2 gates verified green: TRADE-01 IO lockdown ✓, TRADE-02 cycle severance (0 imports from `$lib/stores/transaction` in `marketOrderExecution.ts`) ✓, `failWith()` count = 16 (≥12) ✓, `EMERGENCY_RATIO_MULTIPLIER` count = 0 ✓, svelte-check = 3 errors (Phase 2 baseline) ✓, staleTime: Infinity preserved ✓.

## Task Commits

Each task was committed atomically following the TDD RED → GREEN cycle:

1. **Task 1 RED: SEC-02 fail-closed test for auth.ts** — `8f35be7` (test)
2. **Task 1 GREEN: SEC-02 auth.ts module-load throw on missing SESSION_SECRET** — `3b75ae0` (feat)
3. **Task 2 RED: SEC-02 fail-closed test for csrf.ts** — `149674d` (test)
4. **Task 2 GREEN: SEC-02 csrf.ts module-load throw; preserve SESSION_SECRET aliasing** — `ea187e1` (feat)

## Files Created/Modified

- `src/lib/server/auth.ts` — added `import { dev } from '$app/environment'`, module-top `if (!dev && !env.SESSION_SECRET) throw`, module-level `SESSION_SECRET` const reused inside `createSessionToken`. Removed local `secret` const + `'st0x-session-secret-2024'` fallback.
- `src/lib/server/csrf.ts` — added `import { dev } from '$app/environment'`, module-top `if (!dev && !env.CSRF_SECRET && !env.SESSION_SECRET) throw`, dual-source `CSRF_SECRET = env.CSRF_SECRET || env.SESSION_SECRET || (dev ? placeholder : '')`. Removed `'default-csrf-secret-change-in-production'` fallback. `generateCsrfToken` / `validateCsrfToken` / `validateRequestOrigin` / `getCsrfTokenFromRequest` bodies UNCHANGED (Plan 03-08a SEC-04 will rewrite token generation).
- `src/lib/server/auth.test.ts` (NEW) — 3 tests: prod-throws-when-missing, dev-tolerates-missing, prod-loads-when-set. Mocks `$app/environment` (hoisted devRef getter) + `$env/dynamic/private` (Proxy reading process.env) so each test independently drives both inputs.
- `src/lib/server/csrf.test.ts` (NEW) — 4 tests: prod-throws-when-both-missing, A4-SESSION_SECRET-aliasing-loads, CSRF_SECRET-only-loads, dev-tolerates-missing. Same mock boilerplate as auth.test.ts.
- `.planning/phases/phase-03-production-grade-hardening/deferred-items.md` (NEW) — logs pre-existing `$env/dynamic/public` test resolution failure introduced by Plan 03-01 (4 affected suites; 0-test import errors; not a 03-02 regression).

## Decisions Made

- **Mocked `$app/environment` and `$env/dynamic/private` in test files** rather than relying on `NODE_ENV` switching. Vite caches `esm-env/dev-fallback.js` at first node_modules transform and `vi.resetModules()` does not re-evaluate node_modules, so `dev` is permanently `true` in vitest. Hoisted `devRef` + Proxy-over-`process.env` pattern lets each test drive both inputs cleanly. Reusable boilerplate for any future fail-closed module-load test (likely needed for SEC-04, SEC-06).
- **Module-top throw chosen over function-body throw** per RESEARCH §"Pitfall 2". CRON_SECRET at `src/routes/api/cron/snapshots/+server.ts:42-49` uses function-body 503 because the secret is only needed at the cron-handler boundary; SESSION_SECRET and CSRF_SECRET are needed at module load (createSessionToken / generateCsrfToken can be invoked from anywhere), so module-top is the natural throw site.
- **A4 aliasing preserved verbatim** — `env.CSRF_SECRET || env.SESSION_SECRET` ordering matches the pre-plan behaviour where `csrf.ts:10` read `env.SESSION_SECRET`. Current Vercel project has only `SESSION_SECRET` set, so the new throw guard does NOT fire post-deploy. Operationally, no env-var change required at deploy time for SEC-02.
- **No round-trip CSRF coverage in this plan** — plan-author's `<behavior>` note explicitly defers round-trip to Plan 03-08a (SEC-04) because that plan replaces `generateCsrfToken` / `validateCsrfToken` with session-bound variants. Adding round-trip tests now would just need rewriting in 03-08a.
- **RED test commit preserved** even though the post-edit test code uses mocks (the pre-edit version naively used `process.env.NODE_ENV` which doesn't drive `dev` in vitest). RED's contract is "prove the throw fires when expected and doesn't otherwise"; the mock infrastructure is implementation detail of how the test exercises that contract. The materially-important assertion (`rejects.toThrow(/SESSION_SECRET required in production/)`) is identical between RED and GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test infrastructure: $app/environment + $env/dynamic/private mocking**

- **Found during:** Task 1 (Step 1 RED) — initial test using `process.env.NODE_ENV = 'production'` did not flip `dev` (test 1 expected throw, got module load).
- **Issue:** Vite resolves `$app/environment.dev` via `esm-env/development` → `esm-env/dev-fallback.js` (no `development`/`production` Vite condition matched in vitest). The fallback reads `globalThis.process.env.NODE_ENV` at module-load time, but Vite caches this evaluation at first node_modules transform; `vi.resetModules()` does not re-evaluate node_modules. So `dev` is permanently `true` in the vitest environment regardless of how the test toggles NODE_ENV.
- **Fix:** Added `vi.mock('$app/environment', () => ({ get dev() { return devRef.value; } }))` with hoisted `devRef = { value: true }` so each test can flip `devRef.value` before re-importing the module. Also added `vi.mock('$env/dynamic/private', () => ({ env: new Proxy({}, { get: (_, key) => process.env[key] }) }))` so the test can drive `env.SESSION_SECRET` via `process.env.SESSION_SECRET`. Same boilerplate copied verbatim into csrf.test.ts.
- **Files modified:** src/lib/server/auth.test.ts (and same boilerplate in csrf.test.ts).
- **Verification:** All 7 SEC-02 tests pass; cross-cutting gates remain green; svelte-check baseline = 3 errors preserved.
- **Why "Rule 3 - Blocking" not "scope creep":** The plan's `<action>` step says "Run `npm test -- --run auth.test.ts` — first test must FAIL (current auth.ts at line 9 has `|| 'st0x-session-secret-2024'` fallback so import does not throw)." The plan implicitly required the test to be exercisable at all. Without these mocks, the test could not flip `dev` to drive the production branch, so the throw could not be exercised at test time. Same shape as Plan 01-07's Rule 3 `vi.mock('@sentry/sveltekit', ...)` auto-fix in `vitest-setup.ts` — also a transitive-import resolution issue introduced by an uninstrumented module path.
- **Committed in:** 3b75ae0 (auth.test.ts mock infrastructure landed in the GREEN commit) and 149674d (csrf.test.ts mock infrastructure landed in its RED commit).

---

**Total deviations:** 1 auto-fixed (1 blocking / test infrastructure)
**Impact on plan:** Auto-fix necessary to make the test exercisable. No scope creep — same class as Plan 01-07's Sentry mock + the existing `accessCodes.test.ts` `vi.mock('$env/dynamic/private', ...)` precedent. The plan's `<read_first>` referenced the signatureChallenge.test.ts boilerplate as the test-shape exemplar, but signatureChallenge.test.ts does not test module-load throws — it tests function-level behaviour, which doesn't need to flip `dev`. The first SEC-* fail-closed test in this codebase needed new mock infrastructure; it now exists.

## Issues Encountered

- **Pre-existing test failures (NOT introduced by this plan):** Full suite run shows 4 test files failing at suite-load with `TypeError: Cannot read properties of undefined (reading 'env')` at `virtual:$env/dynamic/public:1:40` → `src/lib/config/networks.ts:1`. These were introduced by Plan 03-01 (commit 70520c8) when `import { env as publicEnv } from '$env/dynamic/public'` was added to `networks.ts`. Pre-existence verified by `git stash` + re-run. Logged to `deferred-items.md` for owner of next plan that touches one of the affected files OR Plan 03-11 phase-exit. Plan 03-02's two new test files (`auth.test.ts`, `csrf.test.ts`) explicitly mock `$env/dynamic/private` and pass cleanly. Behavioural pass rate: 429 of 430 tests pass (1 skipped); the 4 affected suites are import-error failures, not behavioural regressions, and pre-date this plan.

## User Setup Required

None — no env-var change required at deploy time for this plan. Current Vercel project has `SESSION_SECRET` set, which satisfies both throw guards (auth.ts via `env.SESSION_SECRET`; csrf.ts via the `env.CSRF_SECRET || env.SESSION_SECRET` aliasing). The optional `CSRF_SECRET` env var can be added later for principle-of-least-privilege key separation; until then, the SESSION_SECRET aliasing keeps production working.

03-RUNBOOK.md (Plan 03-11 / phase-exit) should document:
- Both env vars are read (`SESSION_SECRET` required; `CSRF_SECRET` optional with SESSION_SECRET aliasing).
- Pre-deploy verification: ensure SESSION_SECRET is set in Vercel env (production + preview); a missing secret crashes the lambda at cold start with `[auth] SESSION_SECRET required in production` or `[csrf] CSRF_SECRET or SESSION_SECRET required in production` visible in Vercel Logs.
- Optional follow-up: split CSRF_SECRET from SESSION_SECRET for blast-radius reduction (cycle one without the other).

## Next Phase Readiness

- Wave 2 progress: SEC-02 closed structurally (1 of 3 Wave 2 plans complete). SEC-05 (Plan 03-03) and SEC-07 (Plan 03-04) remain — both quick wins, both independent of SEC-02.
- Plan 03-08a (SEC-04 session-bound CSRF) reads from this plan's CSRF_SECRET resolution path. The new `generateCsrfTokenForSession` / `validateCsrfTokenForSession` will use the same `CSRF_SECRET` constant (already exported via the dual-source aliasing); 03-08a only changes the token shape, not the secret-source.
- Test boilerplate from this plan (`vi.mock('$app/environment')` + Proxy-over-process.env for `$env/dynamic/private`) is reusable for any future SEC-* fail-closed module-load test. Worth promoting to a shared `tests/helpers/mockSvelteKitEnv.ts` if 3+ test files end up needing it (deferred — not yet 3+ instances).
- All cross-cutting Phase 2 gates green: TRADE-01 lockdown ✓, TRADE-02 cycle severance ✓, failWith count = 16 ≥12 ✓, EMERGENCY_RATIO_MULTIPLIER = 0 ✓, svelte-check = 3 errors ✓, staleTime: Infinity ✓.

## Self-Check: PASSED

Verified all claimed files exist on disk and all claimed commit hashes are in git log:

- `src/lib/server/auth.ts` — exists, has `SESSION_SECRET required in production` (1 hit), no `'st0x-session-secret-2024'` (0 hits), `import { dev } from '$app/environment'` (1 hit)
- `src/lib/server/csrf.ts` — exists, has `CSRF_SECRET or SESSION_SECRET required in production` (1 hit), no `'default-csrf-secret-change-in-production'` (0 hits), `import { dev } from '$app/environment'` (1 hit)
- `src/lib/server/auth.test.ts` — exists, 3 tests pass
- `src/lib/server/csrf.test.ts` — exists, 4 tests pass
- `.planning/phases/phase-03-production-grade-hardening/deferred-items.md` — exists
- Commit hashes: `8f35be7` (test auth), `3b75ae0` (feat auth), `149674d` (test csrf), `ea187e1` (feat csrf) — all found in `git log --oneline -6`

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
