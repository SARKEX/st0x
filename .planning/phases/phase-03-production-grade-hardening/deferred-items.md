# Phase 3 Deferred Items

Items discovered during Phase 3 execution that are out of scope for the touching plan
but tracked here so they aren't lost.

## Open

### 1. Pre-existing $env/dynamic/public test resolution failure (introduced in Plan 03-01 SEC-01)

- **Discovered:** 2026-04-30 during Plan 03-02 (SEC-02) full-suite test run
- **Symptom:** 4 test files (`tests/lib/network.test.ts`, `tests/lib/services/marketOrderExecution.test.ts`, `tests/lib/utils/quote.test.ts`, `tests/lib/transactionStore.test.ts`) fail at suite-load with `TypeError: Cannot read properties of undefined (reading 'env')` at `virtual:$env/dynamic/public:1:40` → `src/lib/config/networks.ts:1`. The 0-test failure registers as a suite import error, not a per-test failure.
- **Root cause:** Plan 03-01 (commit 70520c8) added `import { env as publicEnv } from '$env/dynamic/public'` to `networks.ts`. SvelteKit's vitest resolver doesn't fully wire `$env/dynamic/public` — it produces a virtual module whose `env` is undefined in the test environment.
- **Pre-existence verified:** stash + run confirms the failures are independent of Plan 03-02 changes; they reproduce against `HEAD~3` (post-Plan-03-01 state).
- **Why deferred:** Out of scope for Plan 03-02 (SEC-02 fail-closed). Per the executor's scope-boundary rule, only fixes for issues directly caused by the current task's changes are auto-fixed. This is a Plan 03-01 regression that the 03-01 SUMMARY did not flag. Other test files in the same suite that consume `$env/dynamic/public` indirectly (or that mock it explicitly, like `accessCodes.test.ts`) continue to pass.
- **Suggested fix:** Either add a default `vi.mock('$env/dynamic/public', () => ({ env: {} }))` in `vitest-setup.ts`, or have each affected test file mock the module explicitly. Cleanest fix: extend `vitest-setup.ts` since the import surface is shared across many test files.
- **Owner:** Whoever owns Plan 03-11 phase-exit OR the next plan that touches one of the affected test files.
- **Plan-02 SEC-02 impact:** None — Plan 03-02's two new test files (`auth.test.ts`, `csrf.test.ts`) explicitly mock `$env/dynamic/private` and pass cleanly. Cross-cutting Phase 2 gates remain green: 429 of 430 tests pass (1 skipped); the 4 affected suites are import-error failures, not behavioural regressions.

## Closed

*(none yet — Phase 3 in progress)*
