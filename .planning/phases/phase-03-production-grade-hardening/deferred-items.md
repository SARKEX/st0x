# Phase 3 Deferred Items

Items discovered during Phase 3 execution that are out of scope for the touching plan
but tracked here so they aren't lost.

## Open

*(none)*

## Closed

### 1. Pre-existing $env/dynamic/public test resolution failure (introduced in Plan 03-01 SEC-01)

- **Discovered:** 2026-04-30 during Plan 03-02 (SEC-02) full-suite test run
- **Symptom:** 4 test files (`tests/lib/network.test.ts`, `tests/lib/services/marketOrderExecution.test.ts`, `tests/lib/utils/quote.test.ts`, `tests/lib/transactionStore.test.ts`) fail at suite-load with `TypeError: Cannot read properties of undefined (reading 'env')` at `virtual:$env/dynamic/public:1:40` → `src/lib/config/networks.ts:1`. The 0-test failure registers as a suite import error, not a per-test failure.
- **Root cause:** Plan 03-01 (commit 70520c8) added `import { env as publicEnv } from '$env/dynamic/public'` to `networks.ts`. SvelteKit's vitest resolver doesn't fully wire `$env/dynamic/public` — it produces a virtual module whose `env` is undefined in the test environment.
- **Resolved:** 2026-04-30 between Plan 03-02 and Plan 03-03. Orchestrator added `vi.mock('$env/dynamic/public', () => ({ env: {} }))` to `vitest-setup.ts` (mirrors the existing `@sentry/sveltekit` and `$app/stores` default mocks). Full suite now passes 33 files / 530 tests / 1 skipped (up from 29 files / 429 tests / 4 failed-suite-imports). svelte-check baseline preserved at 3 errors. Per-test files needing specific env values can re-mock locally.
