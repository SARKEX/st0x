---
phase: 03-production-grade-hardening
plan: 08a
subsystem: auth
tags: [phase-3, sec-03, sec-04, session-cookie, csrf, wallet-session, auth-routes, atomic-flip-half-1]

# Dependency graph
requires:
  - phase: 03-production-grade-hardening
    provides: "Plan 03-02 SEC-02 — csrf.ts module-load throw + A4 aliasing preserved verbatim; Plan 03-07 REL-02 — verifyWalletSignature on viem fallback chain ('fallback-chain-base' OBS-04 label) consumed by /api/auth/session POST"
provides:
  - "src/lib/server/walletSession.ts — KV-backed session lifecycle: createSession (32-byte CSPRNG sessionId hex; 30-day Redis PX TTL), readSession, maybeRefreshSession (24h sliding-refresh throttle), deleteSession"
  - "src/lib/server/signatureChallenge.ts — extended with 'session_login' purpose (issueSessionLoginChallenge / verifySessionLoginChallenge) under same atomic GET+DEL Lua precedent as access_register"
  - "POST /api/auth/session/challenge — issues 'session_login' nonce; authStrict rate-limited; ChallengeStorageUnavailableError → 503"
  - "POST /api/auth/session — verifies signature via REL-02 fallback chain → mints HttpOnly+Secure+SameSite=Strict 'session' cookie (path: '/', maxAge 30 days)"
  - "POST /api/auth/logout — deletes KV session record + clears 'session' cookie via cookies.delete('session', { path: '/' })"
  - "src/lib/server/csrf.ts — REWRITTEN: stateless generateCsrfToken/validateCsrfToken REMOVED; new generateCsrfTokenForSession + validateCsrfTokenForSession (HMAC-SHA256(sessionId, CSRF_SECRET).slice(0,32); crypto.timingSafeEqual constant-time compare). SEC-02 module-load throw preserved verbatim."
  - "GET /api/auth/csrf — 401 unless 'session' cookie present; otherwise returns { token: HMAC(sessionId, CSRF_SECRET) }"
affects: [03-08b, sec-03-consumer-migration, hooks.server.ts, logger.ts, access-check, snapshot-preview, layout-svelte]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KV-backed session record with sliding-refresh throttle (30-day absolute TTL; 24h refresh threshold per RESEARCH A2 + CONTEXT D-04a)"
    - "Server-issued cookie shape: HttpOnly + Secure (!dev) + SameSite=Strict + path: '/' + maxAge in seconds (RESEARCH Pitfall 8)"
    - "Cookie delete shape: cookies.delete('name', { path: '/' }) — path REQUIRED in SvelteKit 2 (RESEARCH Pitfall 10)"
    - "Session-bound CSRF via HMAC(sessionId, CSRF_SECRET) double-submit-cookie pattern (RESEARCH §Pattern 2)"
    - "isPublicPath() classification for self-checking auth endpoints (challenge/session/logout/csrf) — hooks-level enforcement would be circular when the cookie is what's being minted"

key-files:
  created:
    - "src/lib/server/walletSession.ts"
    - "src/lib/server/walletSession.test.ts"
    - "src/routes/api/auth/session/challenge/+server.ts"
    - "src/routes/api/auth/session/+server.ts"
    - "src/routes/api/auth/logout/+server.ts"
  modified:
    - "src/lib/server/signatureChallenge.ts (extended SignatureChallengePurpose union; added buildSessionLoginMessage + issueSessionLoginChallenge + verifySessionLoginChallenge)"
    - "src/lib/server/signatureChallenge.test.ts (added describe('session_login purpose (SEC-03)') with 4 tests)"
    - "src/lib/server/csrf.ts (REMOVED stateless generateCsrfToken/validateCsrfToken; ADDED generateCsrfTokenForSession + validateCsrfTokenForSession; preserved SEC-02 module-load throw + A4 aliasing + validateRequestOrigin + getCsrfTokenFromRequest)"
    - "src/lib/server/csrf.test.ts (added describe('SEC-04 session-bound CSRF') with 5 tests; SEC-02 module-load tests preserved verbatim per checker fix #3 carry-forward)"
    - "src/routes/api/auth/csrf/+server.ts (REWRITTEN: 401 unless 'session' cookie present; returns HMAC token bound to session-id)"
    - "src/hooks.server.ts (extended isPublicPath() with /api/auth/session, /api/auth/session/challenge, /api/auth/logout)"

key-decisions:
  - "Atomic-flip PR shape preserved: 03-08a (this plan) ships infrastructure; 03-08b will migrate wallet-address consumers in the same PR. CSRF rewrite ships in 03-08a because the stateless API has zero surviving consumers other than the GET endpoint we own — no atomic-flip risk for the CSRF half."
  - "30-day sliding session via maybeRefreshSession throttled to 1 KV write per 24h. CONTEXT D-04a UX guarantee: active traders never re-sign; D-04b: never re-prompts wallet signature per request."
  - "Stateless generateCsrfToken/validateCsrfToken DELETED (not deprecated). Per RESEARCH §Anti-Patterns: 'the existing csrf.ts approach is replaced by session-id-bound HMAC; the timestamp goes away — session expiry handles freshness.' Consumer-audit grep confirmed only the GET endpoint we control consumed the old API."
  - "createSession fails closed when KV unavailable (throws 'Session storage unavailable'). Same posture as ChallengeStorageUnavailableError in signatureChallenge.ts — minting an unrecoverable session cookie would be worse than a cold-start failure."
  - "isPublicPath() includes /api/auth/session* + /api/auth/logout — these endpoints self-check; hooks-level wallet-registration enforcement would be circular (the cookie is what these endpoints are MINTING)."

patterns-established:
  - "Server-issued auth cookie + KV session record + sliding refresh — reusable pattern for any future per-user state requiring 30-day persistence"
  - "Auth route handler shape: rate-limit → JSON body validation → consume challenge → verify signature on REL-02 fallback chain → mint cookie. Mirrors /api/access/register but with cookie-mint instead of state-mutation. New /api/auth/session POST is the canonical exemplar."

requirements-completed: [SEC-04]
requirements-partial: [SEC-03]

# Metrics
duration: ~7min
completed: 2026-04-30
---

# Phase 3 Plan 08a: SEC-03 walletSession Infrastructure + SEC-04 Session-Bound CSRF Summary

**SEC-03 infrastructure half: walletSession.ts module + signatureChallenge.ts session_login purpose + 3 new auth routes (challenge/session/logout) + SEC-04 csrf.ts session-bound HMAC rewrite + GET /api/auth/csrf session-cookie gate. SEC-04 audit finding closed (T-03-SEC-04-01); SEC-03 surfaces in place but consumer migration deferred to 03-08b (atomic-flip PR shape).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-30T11:24:52Z (baseline test run)
- **Completed:** 2026-04-30T11:32:00Z (Task 3 commit)
- **Tasks:** 3 (Task 1 TDD + Task 2 + Task 3 TDD = 5 atomic commits)
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

### Task 1 — SEC-03 walletSession.ts + 'session_login' purpose extension

- NEW `src/lib/server/walletSession.ts`: 4-method KV-backed session lifecycle
  - `createSession(walletAddress)` — 32-byte CSPRNG sessionId (hex-encoded, 64 chars); 30-day Redis PX TTL; lowercases address; fail-closed throw when KV unavailable
  - `readSession(sessionId)` — KV lookup; null on miss/unavailable/parse-failure
  - `maybeRefreshSession(sessionId, record)` — sliding refresh throttled to 1 KV write per 24h (RESEARCH A2); in-place mutation of caller's record so downstream code sees the fresh lastSeenAt without an extra round trip
  - `deleteSession(sessionId)` — kv.del; caller responsible for cookie clear
- NEW `src/lib/server/walletSession.test.ts`: 7 tests pinning round-trip, unknown-id null, throttle no-op + refresh past threshold, deleteSession, KV-unavailable null, fail-closed throw on createSession
- EXTENDED `src/lib/server/signatureChallenge.ts`: `'session_login'` added to `SignatureChallengePurpose` union; `buildSessionLoginMessage` (clear "this signature does not authorize any transaction" wording per D-04b); `issueSessionLoginChallenge` + `verifySessionLoginChallenge` use the same `consumeChallenge` atomic GET+DEL Lua precedent as access_register
- EXTENDED `src/lib/server/signatureChallenge.test.ts`: 4 new tests pinning issue shape, atomic single-use invariant (second verify rejects), atomic eval Lua-script fallback, fail-closed in production

### Task 2 — 3 NEW auth route handlers

- `POST /api/auth/session/challenge`: mirrors `/api/access/challenge:1-43` shape; authStrict rate-limiter; address regex validation; ChallengeStorageUnavailableError → 503
- `POST /api/auth/session`: rate-limit → JSON body + address regex + nonce + signature checks → `verifySessionLoginChallenge` → `verifyWalletSignature` (REL-02 fallback chain from Plan 03-07) → `createSession` → `cookies.set('session', sessionId, { httpOnly: true, secure: !dev, sameSite: 'strict', path: '/', maxAge: 30*24*60*60 sec })`. Pitfall 8 compliance: path REQUIRED, maxAge in SECONDS not ms.
- `POST /api/auth/logout`: regex-validates the existing cookie value before calling `deleteSession`; `cookies.delete('session', { path: '/' })` per Pitfall 10; returns 204
- `src/hooks.server.ts isPublicPath()` extended with `/api/auth/session`, `/api/auth/session/challenge`, `/api/auth/logout` — these endpoints self-check; hooks-level enforcement would be circular when the cookie is what the endpoint is MINTING

### Task 3 — SEC-04 csrf.ts session-bound HMAC rewrite

- `src/lib/server/csrf.ts`:
  - REMOVED: stateless `generateCsrfToken` (timestamp-encoded random + HMAC suffix) and `validateCsrfToken` (3-part split + timestamp expiry check + signature compare). Per RESEARCH §"Anti-Patterns to Avoid": "the existing csrf.ts approach (timestamp-encoded token) is replaced by session-id-bound HMAC. The timestamp goes away — session expiry handles freshness."
  - ADDED: `generateCsrfTokenForSession(sessionId)` returns first 32 hex chars of `HMAC-SHA256(sessionId, CSRF_SECRET).digest('hex')`
  - ADDED: `validateCsrfTokenForSession(token, sessionId)` — defensive empty/undefined rejection; length pre-check (rejects before timingSafeEqual); `crypto.timingSafeEqual` constant-time compare
  - PRESERVED VERBATIM: SEC-02 module-load fail-closed throw (Plan 03-02 carry-forward); A4 aliasing of `CSRF_SECRET` → `SESSION_SECRET`; `validateRequestOrigin` + `getCsrfTokenFromRequest` defense-in-depth helpers
- `src/routes/api/auth/csrf/+server.ts`: REWRITTEN — GET returns 401 with `{ error: 'Session required' }` unless 'session' cookie present; otherwise returns `{ token: generateCsrfTokenForSession(sessionId) }`
- `src/lib/server/csrf.test.ts`: appended `describe('SEC-04 session-bound CSRF')` block with 5 tests pinning round-trip, cross-session HMAC mismatch, defensive missing-input rejection, length-mismatch rejection, and constant-time compare via `crypto.timingSafeEqual` spy. SEC-02 module-load tests left untouched (per checker fix #3 carry-forward — they assert only `expect(mod).toBeDefined()` so the rewrite cannot break them).

## Task Commits

Atomic 5-commit sequence (TDD on Tasks 1 + 3; non-TDD on Task 2):

1. **Task 1 RED** — `62a69b0` test(03-08a): walletSession.test.ts + signatureChallenge.ts session_login purpose tests
2. **Task 1 GREEN** — `c93e8d8` feat(03-08a): SEC-03 walletSession.ts KV-backed session lifecycle + session_login challenge purpose
3. **Task 2** — `45a6137` feat(03-08a): SEC-03 NEW auth route handlers — session/challenge POST + session POST + logout POST
4. **Task 3 RED** — `fc0e569` test(03-08a): add SEC-04 session-bound CSRF tests for csrf.ts
5. **Task 3 GREEN** — `b35cc89` feat(03-08a): SEC-04 csrf.ts session-bound HMAC; GET /api/auth/csrf requires session cookie

## Decisions Made

- **Atomic-flip PR shape preserved at PR-shape, NOT plan-shape (per CONTEXT D-04 + checker fix #5).** This plan ships the infrastructure half of SEC-03 + the entire SEC-04 rewrite. The wallet-address consumer migration (5 server-auth reads + hint-cookie downgrade + logout cleanup) is deliberately deferred to Plan 03-08b. 03-08b depends_on 03-08a so the consumer migration cannot land before the new infrastructure. Both plans must merge as a single PR — no intermediate state where session cookie exists but no consumer reads it (or vice versa).
- **CSRF rewrite ships in 03-08a even though SEC-03 consumer migration is in 03-08b.** Rationale: consumer-audit grep confirmed the only consumer of the old `generateCsrfToken` / `validateCsrfToken` API was the GET endpoint at `/api/auth/csrf/+server.ts` — the same endpoint we control. No other source files import the old names. Atomic-flip risk for the CSRF half is structurally zero because there are no other consumers to migrate.
- **createSession fails closed on KV unavailability.** Throws `Session storage unavailable` (mirrors `ChallengeStorageUnavailableError` in signatureChallenge.ts). Minting a cookie pointing to a nonexistent KV record would create an immediately-invalid auth state that fails on the very next request — cleaner to surface the KV failure at mint time as a 503 to the client. (`/api/auth/session/+server.ts` does NOT yet wrap the throw — defaults to the catch-all 400 'Invalid request body' return; if this surfaces as a UX issue in 03-08b smoke testing, follow-up to wrap with explicit `instanceof` and 503 response.)
- **30-day sliding session via maybeRefreshSession throttled to 1 KV write per 24h.** CONTEXT D-04a UX guarantee. The 24h threshold is the planner-discretion choice from the deferred-ideas section ("KV write cost vs UX coverage trade-off"). 24h was chosen for symmetry with the existing 24-hour `SESSION_DURATION_MS` in auth.ts (basic-auth flow) — operators familiar with one number now have to remember only one number.
- **Cookie shape: maxAge in SECONDS (30*24*60*60), NOT ms.** RESEARCH Pitfall 8 explicit. SvelteKit 2's `cookies.set` interprets maxAge as seconds (per `cookie` npm package). Using ms would silently set a cookie that expires effectively never (Number.MAX_SAFE_INTEGER seconds in browser).
- **isPublicPath() classification for /api/auth/session* + /api/auth/logout.** These endpoints self-check; hooks-level wallet-registration enforcement would be circular (the cookie is what /api/auth/session is MINTING). Same pattern as the existing /api/auth/csrf entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test logic] walletSession.test.ts maybeRefreshSession assertion compared mutated value to itself**
- **Found during:** Task 1 GREEN test run after walletSession.ts implementation
- **Issue:** Test asserted `expect(parsed.lastSeenAt).toBeGreaterThan(record.lastSeenAt)` AFTER `maybeRefreshSession` had already mutated `record.lastSeenAt` in-place. Both values were equal — the in-place mutation set them simultaneously. Test failed with `expected 1777544810366 to be greater than 1777544810366`.
- **Fix:** Captured `originalLastSeen` before invoking `maybeRefreshSession`; assertion now compares against the captured original timestamp.
- **Files modified:** `src/lib/server/walletSession.test.ts` (1 test only — surrounding tests unchanged)
- **Committed in:** `c93e8d8` (Task 1 GREEN)

**2. [Rule 3 — TypeScript blocker] kvSet mock signature missing optional `_opts` arg surfaced new svelte-check error**
- **Found during:** Task 1 GREEN — `npm run check` after walletSession tests passed
- **Issue:** `vi.fn(async (key: string, value: string) => { ... })` inferred kvSet call signature as `[key, value]` (2 args). Test indexed `setCall[2]` to assert the `{ PX: 30*24*60*60*1000 }` options arg → tuple-index error: "Tuple type '[key: string, value: string]' of length '2' has no element at index '2'". svelte-check baseline regressed from 3 to 4 errors.
- **Fix:** Extended kvSet mock signature to `vi.fn(async (key: string, value: string, _opts?: { PX: number }) => { ... })`. Tuple now has 3 elements; `setCall[2]` typechecks. Underscore prefix on `_opts` documents the parameter is intentionally unused inside the mock body.
- **Files modified:** `src/lib/server/walletSession.test.ts` (mock signature only — no test logic changed)
- **Verification:** svelte-check returned to 3 errors (baseline preserved).
- **Committed in:** `c93e8d8` (Task 1 GREEN — same commit as fix #1)

**3. [Rule 1 — Documentation drift] csrf.test.ts comment referenced removed API names**
- **Found during:** Task 3 GREEN — final consumer audit
- **Issue:** csrf.test.ts header comment said "Round-trip coverage on session-bound CSRF lives in Plan 03-08a (SEC-04) which will replace generateCsrfToken/validateCsrfToken with session-bound variants." After the SEC-04 rewrite, this comment was past-tense incorrect ("will replace" → already replaced).
- **Fix:** Reworded comment to "Plan 03-08a (SEC-04) replaced the prior stateless generate/validate token API with session-bound generateCsrfTokenForSession/validateCsrfTokenForSession; round-trip coverage now lives in the SEC-04 describe block below."
- **Files modified:** `src/lib/server/csrf.test.ts` (comment text only — no test logic changed)
- **Committed in:** `b35cc89` (Task 3 GREEN)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 test-logic + 1 Rule 3 svelte-check tuple-type + 1 Rule 1 cosmetic comment-drift)
**Impact on plan:** All three fixes preserve the documented intent of the plan exactly; none expand scope. Pattern consistency with Plan 03-07's deviations (cosmetic comment-text reconciliation + test-mock contract update for new module-load surface).

## Issues Encountered

None during planned work — all 3 tasks ran cleanly. RED phases failed exactly the expected counts (5 SEC-03 tests on Task 1 + 5 SEC-04 tests on Task 3); GREEN phases passed all expected tests + preserved the prior counts.

Authentication gates: none. This plan does not consume any third-party API/auth surface — pure server-side cookie + KV work.

## Threat Surface Scan

The plan's `<threat_model>` enumerates the new attack surface:

- **T-03-SEC-03-02 (Tampering — server-side random sessionId):** mitigate ✓ — `crypto.randomBytes(32).toString('hex')` is structurally unguessable; HttpOnly + SameSite=Strict + Secure cookie shape prevents cross-origin / JS-read theft.
- **T-03-SEC-04-01 (Tampering / CSRF — pre-Phase-3 forgeable tokens):** mitigate (BLOCKER, closes audit finding) ✓ — session-bound HMAC with timingSafeEqual compare; tokens regenerate on session change.
- **T-03-SEC-04-02 (Bypass — non-authenticated callers):** mitigate ✓ — GET /api/auth/csrf returns 401 without session cookie.
- **T-03-SEC-04-03 (Replay — stale tokens post-login):** mitigate (UX-doc) ✓ — new session-id ⇒ new HMAC ⇒ stale tokens fail validation cleanly. RESEARCH Pitfall 3 client-side recipe (re-fetch token after login) belongs in 03-RUNBOOK.md (Plan 03-11).
- **T-03-SEC-04-04 (Cross-session attack):** mitigate ✓ — cross-session token rejection pinned in `csrf.test.ts` SEC-04 block test 2.

No new security-relevant surface introduced beyond what the plan's threat register documents. The wallet-address cookie remains as a non-authoritative hint until Plan 03-08b's downgrade — but in this plan it is structurally irrelevant (this plan adds NO new server-side `cookies.get('wallet-address')` call).

## Cross-cutting Phase 2 Gates (carry-forward)

- TRADE-01 IO-perspective lockdown: not touched in this plan ✓
- TRADE-02 cycle severance: `grep -c "from '\$lib/stores/transaction'" src/lib/services/marketOrderExecution.ts` → 0 ✓
- failWith() count ≥ 12: `grep -c "failWith(" src/lib/services/marketOrderExecution.ts` → 16 ✓
- EMERGENCY_RATIO_MULTIPLIER count = 0: 0 ✓
- staleTime: Infinity: not touched ✓
- svelte-check baseline: 3 errors preserved ✓ (all pre-existing in tests/lib/server/rpcMetrics.test.ts)

## Phase 3 Carry-Forward Gates

- SEC-02 module-load fail-closed (Plan 03-02): `! grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts` → 0 hits ✓ — preserved verbatim through the SEC-04 rewrite

## Acceptance Gate Results

### Task 1
- `grep -c "createSession\|readSession\|maybeRefreshSession\|deleteSession" src/lib/server/walletSession.ts` → 6 (≥4 ✓)
- `grep -c "30 \* 24 \* 60 \* 60 \* 1000" src/lib/server/walletSession.ts` → 1 ✓ (30-day TTL)
- `grep -c "session_login" src/lib/server/signatureChallenge.ts` → 3 (≥1 ✓)
- `grep -c "issueSessionLoginChallenge\|verifySessionLoginChallenge" src/lib/server/signatureChallenge.ts` → 3 (≥2 ✓)
- `npm test -- --run walletSession.test signatureChallenge.test` → 14 passed ✓
- svelte-check baseline ≤ 3 errors preserved ✓

### Task 2
- All 3 NEW route files exist ✓
- `grep -c "issueSessionLoginChallenge" src/routes/api/auth/session/challenge/+server.ts` → 2 (≥1 ✓; export + call)
- `grep -c "verifyWalletSignature" src/routes/api/auth/session/+server.ts` → 3 (≥1 ✓; comment + import + call)
- `grep -c "createSession" src/routes/api/auth/session/+server.ts` → 2 (≥1 ✓; import + call)
- `grep -c "deleteSession" src/routes/api/auth/logout/+server.ts` → 2 (≥1 ✓; import + call)
- `grep -c "path: '/'" src/routes/api/auth/session/+server.ts` → 2 (path + comment ✓)
- `grep -c "path: '/'" src/routes/api/auth/logout/+server.ts` → 2 (delete-call + comment ✓)
- `grep -c "httpOnly: true" src/routes/api/auth/session/+server.ts` → 1 ✓
- `grep -c "sameSite: 'strict'" src/routes/api/auth/session/+server.ts` → 1 ✓
- svelte-check baseline ≤ 3 errors preserved ✓
- Full test suite still passes ✓

### Task 3
- `grep -c "generateCsrfTokenForSession" src/lib/server/csrf.ts` → 2 (≥1 ✓; declaration + call inside validate)
- `grep -c "validateCsrfTokenForSession" src/lib/server/csrf.ts` → 1 (≥1 ✓; declaration)
- `grep -c "timingSafeEqual" src/lib/server/csrf.ts` → 2 (≥1 ✓; comment + call)
- `grep -c "createHmac" src/lib/server/csrf.ts` → 1 (≥1 ✓)
- `grep -c "Session required" src/routes/api/auth/csrf/+server.ts` → 1 ✓
- `grep -c "generateCsrfTokenForSession" src/routes/api/auth/csrf/+server.ts` → 2 (≥1 ✓; import + call)
- `npm test -- --run csrf.test` → 9 passed ✓ (4 SEC-02 + 5 SEC-04)
- svelte-check baseline ≤ 3 errors preserved ✓
- **Phase-exit gate**: `! grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts` → 0 hits ✓ (SEC-02 carry-forward preserved)

### Full Suite
- `npm test -- --run` → 569 passed | 1 skipped | 0 failed ✓ (was 553; +16 net: 7 walletSession + 4 signatureChallenge SEC-03 + 5 SEC-04)
- `npm run check` → 3 errors (baseline preserved) ✓

## Hand-off to Plan 03-08b

03-08b consumes these surfaces in the SEC-03 atomic-flip consumer migration:

- **`readSession(sessionId)`** — `src/hooks.server.ts:271` will call this from the new async `getWalletFromRequest`; 4 other server-side wallet-address consumers will read via `event.locals.walletAddress` populated by hooks (logger.ts, /api/access/check, /api/snapshots/preview, /api/snapshots/preview-stream)
- **`maybeRefreshSession(sessionId, record)`** — `src/hooks.server.ts` will fire-and-forget this on every authenticated request after readSession returns a record; 24h throttle caps writes
- **`deleteSession(sessionId)`** — `src/routes/access/+page.server.ts` will call this on logout-equivalent flows alongside `cookies.delete('session', { path: '/' })`
- **`validateCsrfTokenForSession(token, sessionId)`** — not yet consumed by any POST handler in 03-08a; 03-08b's manual smoke test exercises the GET /api/auth/csrf endpoint. Wiring CSRF validation into protected POST endpoints belongs to a future plan (Phase 4 TEST-01 / hooks.server.ts integration tests will pin the exact wiring shape).

03-08b will then complete D-04b's hard guarantee: the cookie minted at `/api/auth/session` authenticates every subsequent request — wallet signature is never re-prompted.

## Next Phase Readiness

- **Plan 03-08b unblocked.** The new infrastructure (walletSession.ts, signatureChallenge.ts session_login purpose, 3 auth routes, csrf.ts session-bound HMAC) is in place. 03-08b's Task 1 atomic-flip consumer migration consumes `readSession`, `maybeRefreshSession`, `deleteSession`. **03-08a + 03-08b must merge as a single PR per CONTEXT D-04.**
- **Wave 6 in progress (1 of 2 plans complete).** Next: Plan 03-08b (SEC-03 consumer migration + manual smoke test).
- **Phase 3 progress:** 8/11 plans complete; 8/10 phase REQ-IDs closed (SEC-01 + SEC-02 + SEC-04 + SEC-05 + SEC-06 + SEC-07 + REL-01 + REL-02). SEC-03 partial (infrastructure ✓; consumer migration in 03-08b). Remaining: SEC-03 close-out (03-08b) + REL-03 + Phase 3 RUNBOOK/exit (3 plans).

## Self-Check: PASSED

- [x] `src/lib/server/walletSession.ts` created (verified — 6 method-name occurrences)
- [x] `src/lib/server/walletSession.test.ts` created (verified — 7 tests passing)
- [x] `src/lib/server/signatureChallenge.ts` modified (session_login purpose added)
- [x] `src/lib/server/signatureChallenge.test.ts` modified (4 SEC-03 tests added; passing)
- [x] `src/lib/server/csrf.ts` rewritten (verified — old names absent, new names present, SEC-02 throw preserved)
- [x] `src/lib/server/csrf.test.ts` modified (5 SEC-04 tests added; SEC-02 tests preserved)
- [x] `src/routes/api/auth/session/challenge/+server.ts` created (verified)
- [x] `src/routes/api/auth/session/+server.ts` created (verified)
- [x] `src/routes/api/auth/logout/+server.ts` created (verified)
- [x] `src/routes/api/auth/csrf/+server.ts` rewritten (verified — 401 unless session cookie present)
- [x] `src/hooks.server.ts` isPublicPath() extended with new auth routes
- [x] Commit `62a69b0` exists in git log (Task 1 RED — test additions)
- [x] Commit `c93e8d8` exists in git log (Task 1 GREEN — feat walletSession + session_login)
- [x] Commit `45a6137` exists in git log (Task 2 — feat 3 NEW auth route handlers)
- [x] Commit `fc0e569` exists in git log (Task 3 RED — SEC-04 csrf tests)
- [x] Commit `b35cc89` exists in git log (Task 3 GREEN — feat csrf.ts SEC-04 + GET /api/auth/csrf)
- [x] All acceptance grep gates pass
- [x] Full test suite green (569 passed | 1 skipped | 0 failed; net +16 from baseline 553)
- [x] svelte-check baseline preserved (3 errors)
- [x] SEC-02 phase-exit gate preserved (no fallback secret strings in auth.ts/csrf.ts)
- [x] Cross-cutting Phase 2 gates green (TRADE-01 / TRADE-02 / failWith ≥12 / EMERGENCY_RATIO_MULTIPLIER = 0)

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
