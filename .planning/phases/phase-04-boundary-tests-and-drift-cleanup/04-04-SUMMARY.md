---
phase: 04-boundary-tests-and-drift-cleanup
plan: 04
subsystem: test
tags: [test, hooks, integration, security-coverage, sec-03, sec-04, csp, cors]

# Dependency graph
requires:
  - phase: 04
    provides: "Phase 3 SEC-03+04 atomic-flip session-cookie surface (Plans 03-08a/03-08b) — wallet auth proof moved from client-set wallet-address cookie to server-issued session cookie + KV record."
  - phase: 04
    provides: "Phase 1 OBS-01 / Pitfall-1 CSP host-pinning constraint — explicit Sentry hosts only; no bare *.sentry.io wildcard."
  - phase: 04
    provides: "Phase 1 DEPR-03 Onramper removal — frame-src must NOT contain Onramper hosts."
provides:
  - "Regression CI gate for hooks.server.ts trust boundary: a future change to admin gating, CORS classification, CSP directives, public-path bypass, wallet-session shape, or bot-rejection ordering now fails CI rather than reaching prod (ROADMAP success criterion #1)."
  - "tests/hooks/_helpers.ts — typed RequestEvent / KV / Session factories reusable by future hooks-layer tests."
affects:
  - "Future hooks.server.ts edits — must keep all 58 it-blocks green or update them in lockstep with documented rationale."
  - "Phase 4 Wave 6 phase-exit grep gate — ls tests/hooks/{cors,csp,public-paths,admin-gate,wallet-session,bot-rejection}.test.ts must succeed."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vitest hoisted-mock + vi.mock pattern for SvelteKit hooks integration tests (mirrors src/lib/server/walletSession.test.ts; vitest-setup.ts already stubs @sentry/sveltekit globally)."
    - "Single 'as unknown as RequestEvent' escape isolated in tests/hooks/_helpers.ts; consumer test files use the typed return with no further casts (Pitfall 5)."
    - "Per-concern split (D-02): one test file per named hooks-layer concern, each <300 lines, each with a single describe() block whose label names the invariant."

key-files:
  created:
    - "tests/hooks/_helpers.ts"
    - "tests/hooks/cors.test.ts"
    - "tests/hooks/csp.test.ts"
    - "tests/hooks/public-paths.test.ts"
    - "tests/hooks/admin-gate.test.ts"
    - "tests/hooks/wallet-session.test.ts"
    - "tests/hooks/bot-rejection.test.ts"
  modified: []

key-decisions:
  - "Drive the full sequence(requestContextHandle, sentryHandle, existingHandle) handle export end-to-end rather than reaching into existingHandle internals. sentryHandle is already mocked to passthrough in vitest-setup.ts; requestContextHandle calls readSession (which we mock) — both compose cleanly with the deps mocked at the $lib/server/* boundary."
  - "Mock $lib/server/walletSession + $lib/server/auth + $lib/server/accessCodes at the module boundary, NOT the underlying KV. Rationale: hooks.server.ts only consumes the named exports (readSession, maybeRefreshSession, verifySessionToken, isWalletRegistered, verifyWalletSignature). Stubbing the boundary keeps each test file <200 lines and avoids the KV-shape coupling the SUT itself does not have."
  - "Each test file mocks $env/dynamic/private via Proxy → process.env (auth.test.ts pattern) and $app/environment as { dev: false } so the production branch (HSTS, no-localhost-fallback) is exercised. NODE_ENV is left as vitest's default."
  - "Pin actual SUT behavior, not aspirational behavior: bot-rejection today detects via PATH patterns (BOT_PATH_PATTERNS), NOT User-Agent strings. Tests assert path-based detection. The 'bot User-Agent' phrasing in the original plan is not what the SUT does; future work to add UA-based detection would extend, not invalidate, these tests."
  - "Wildcard-guard regex for Pitfall 1: /https:\\/\\/\\*\\.sentry\\.io(?:\\s|;|$)/. Matches a bare *.sentry.io token (whitespace/semicolon/EOL terminator) but does NOT match the legitimate https://*.ingest.sentry.io / https://*.ingest.us.sentry.io because those have 'ingest.' between the wildcard and 'sentry.io'."

patterns-established:
  - "tests/hooks/ directory layout: one test per named concern, shared _helpers.ts, vi.mock at top-of-file for $lib/server/* + $env/dynamic/private + $app/environment, beforeEach resets via vi.resetModules + vi.clearAllMocks + per-test mock return-value reset."

requirements-completed: [TEST-01]

# Metrics
duration: ~12min
completed: 2026-05-01
---

# Phase 4 Plan 4: TEST-01 Hooks Integration Tests Summary

Author 6 integration test files in `tests/hooks/` plus a shared `_helpers.ts`, pinning the post-Phase-3 `src/hooks.server.ts` trust-boundary surface (CORS classification, CSP host pinning, public-path bypass, admin gate, wallet-session classification, bot-rejection ordering) so any silent regression now fails CI.

## What Was Built

**7 new test files in `tests/hooks/` (no source changes):**

| File | Tests | LOC | Concern Pinned |
|------|-------|-----|----------------|
| `_helpers.ts` | n/a | 97 | Shared `createMockRequestEvent` / `createMockKv` / `createMockSession` — typed against SvelteKit's `RequestEvent`, single `as unknown as RequestEvent` escape contained here. |
| `cors.test.ts` | 8 | 152 | Production / Vercel-preview origin classification, public-API wildcard, OPTIONS preflight 204 + Allow-Methods/Headers/Max-Age, 403 on disallowed preflight, Expose-Headers rate-limit pass-through. |
| `csp.test.ts` | 12 | 130 | Explicit `https://*.ingest.sentry.io` + `https://*.ingest.us.sentry.io` pinning, **no bare `*.sentry.io` wildcard** (Pitfall 1), no Onramper frame-src (DEPR-03), `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, X-Frame DENY, X-Content-Type nosniff, Referrer-Policy, HSTS in production. |
| `public-paths.test.ts` | 11 | 151 | `/access`, `/api/access/*`, `/api/public/*`, `/api/auth/session{,/challenge}`, `/api/auth/logout`, `/docs/*`, `/admin/login` all bypass auth; ordering invariant (public classification runs BEFORE `isWalletRegistered`). |
| `admin-gate.test.ts` | 7 | 142 | 303 redirect on missing/invalid `auth-session` cookie, non-finite `auth-timestamp` rejection, valid-token allow, admin-session bypass on `/api/snapshots/*`, X-Frame-Options DENY on redirect response. |
| `wallet-session.test.ts` | 9 | 199 | **D-04 atomic flip**: legacy `wallet-address` cookie NOT authoritative; **D-04b**: `verifyWalletSignature` never called per-request (asserted across 5 invocations); D-04a `maybeRefreshSession` fan-out; malformed-id regex guard; expired/unregistered/missing 401 paths. |
| `bot-rejection.test.ts` | 11 | 143 | `.php` / `wp-admin` / `wp-login` / `_next` / `cgi-bin` / `.env` probe 404s, encoded-URL crawler guard (`/https%3A//evil.com/foo`), ordering (BEFORE auth + BEFORE resolve), legitimate-path negative controls. |

**Total:** 58 it-blocks; max file 199 LOC (well under the 300 LOC ceiling per D-02 split-per-concern).

## STRIDE Coverage Map

| Threat ID | Category | Mitigation Test | Active Assertions |
|-----------|----------|-----------------|-------------------|
| T-04-04-01 | Authentication Bypass | `wallet-session.test.ts` | 9 — incl. legacy-cookie-not-authoritative + D-04b never-re-signs |
| T-04-04-02 | Tampering | `csp.test.ts` | 12 — incl. Pitfall-1 wildcard guard + DEPR-03 Onramper absence |
| T-04-04-03 | Elevation of Privilege | `admin-gate.test.ts` | 7 — incl. valid/invalid token paths + X-Frame on redirect |
| T-04-04-04 | Information Disclosure | `cors.test.ts` | 8 — incl. unknown-origin no-ACAO-echo + Vercel-preview classification |
| T-04-04-05 | Denial of Service | `bot-rejection.test.ts` | 11 — incl. ordering-before-auth + ordering-before-resolve |

## Verification

```
$ npm test -- tests/hooks/ --run
Test Files  6 passed (6)
     Tests  58 passed (58)

$ npm test -- --run
Test Files  42 passed (42)
     Tests  627 passed | 1 skipped (628)

$ npm run check
svelte-check found 3 errors and 0 warnings in 1 file
```

Baseline svelte-check (3 errors, all pre-existing in `tests/lib/server/rpcMetrics.test.ts:182`) preserved.

## Critical Pitfall-1 Assertion (Verbatim)

```ts
// csp.test.ts
it('connect-src does NOT contain a bare *.sentry.io wildcard (Phase 1 Pitfall 1 invariant)', async () => {
    const csp = await getCspForPath('/access');
    const bareSentryWildcard = /https:\/\/\*\.sentry\.io(?:\s|;|$)/;
    expect(csp).not.toMatch(bareSentryWildcard);
});
```

This test future-proofs against a regression that drops the explicit per-region pinning and re-introduces `https://*.sentry.io` as a CSP wildcard host (which would over-permit Sentry's full host fleet, violating Phase 1's defense-in-depth posture).

## Critical D-04 Atomic-Flip Assertion (Verbatim)

```ts
// wallet-session.test.ts
it('legacy wallet-address cookie WITHOUT session cookie is NOT authoritative (D-04 atomic flip)', async () => {
    const handle = await loadHandle();
    const event = createMockRequestEvent({
        pathname: '/api/snapshots/foo',
        cookies: { 'wallet-address': '0xAbC0000000000000000000000000000000000003' }
    });
    const response = await handle({ event, resolve: passthroughResolve });
    expect(response.status).toBe(401);
    expect(mockReadSession).not.toHaveBeenCalled();
    expect(mockIsRegistered).not.toHaveBeenCalled();
});
```

A future regression that re-introduces trust in the client-set `wallet-address` cookie would silently bypass the SEC-03+04 auth path. This test makes that regression a CI failure.

## Deviations from Plan

None — plan executed exactly as written. Two minor adaptations (documented as decisions, not deviations):

1. **Bot-rejection assertions test path-based detection (not UA-based).** The plan's wording mentioned "bot User-Agent" rejection; the SUT today rejects via `BOT_PATH_PATTERNS` (`hooks.server.ts:357-376`). Tests pin actual behavior. Future UA-based detection would extend these tests, not invalidate them.
2. **Auto-fix Rule 1 not triggered.** No bugs found in the SUT; all 58 tests pass on first run after the per-file fixture work.

## Self-Check: PASSED

- `tests/hooks/_helpers.ts` — FOUND
- `tests/hooks/cors.test.ts` — FOUND
- `tests/hooks/csp.test.ts` — FOUND
- `tests/hooks/public-paths.test.ts` — FOUND
- `tests/hooks/admin-gate.test.ts` — FOUND
- `tests/hooks/wallet-session.test.ts` — FOUND
- `tests/hooks/bot-rejection.test.ts` — FOUND
- Commit `b80b725` (Task 1 helpers) — FOUND in git log
- Commit `05ea74c` (Task 2 six test files) — FOUND in git log
- `npm test -- tests/hooks/ --run` exits 0 — VERIFIED (58/58 pass)
- `npm test -- --run` exits 0 — VERIFIED (627 pass + 1 skip)
- `npm run check` baseline preserved — VERIFIED (3 errors, all pre-existing)
- Each file <300 lines — VERIFIED (max 199)
- `grep -c 'ingest.sentry.io' tests/hooks/csp.test.ts` ≥ 2 — VERIFIED (4 occurrences)
- `grep -c 'wallet-address' tests/hooks/wallet-session.test.ts` ≥ 1 — VERIFIED (5 occurrences)
- `grep -c 'verifyWalletSignature' tests/hooks/wallet-session.test.ts` ≥ 1 — VERIFIED (3 occurrences)
- No `as any` in `tests/hooks/` — VERIFIED
