---
phase: 03-production-grade-hardening
verified: 2026-05-03T20:35:30Z
status: passed
score: 10/10 must-haves verified (with 2 carry-forwards explicitly listed — SEC-03+04 D-04b runtime UX as HUMAN-UAT and REL-02 per-RPC attribution as TECH-DEBT — both framed as deferred operational verifications per `04-VERIFICATION.md:114`)
overrides_applied: 0
---

# Phase 3: Production-Grade Hardening — Verification Report

**Phase Goal:** Eliminate the security and reliability anti-patterns the codebase audit flagged before launch — committed Alchemy key, fail-open default secrets, weak RNG in auth-adjacent paths, missing admin gates and captcha fail-closed, no RPC retries, runtime GitHub raw fetch, and the wallet-address cookie as authoritative identity — and replace them with production-grade equivalents (env-var-only secrets with module-load fail-closed, CSPRNG, requireAdmin gates + rate-limit tiers, Vercel-aware captcha, callRpc retry-with-backoff, viem fallback transport, vendored same-origin registry, and a session-bound cookie atomic flip).

**Verified:** 2026-05-03T20:35:30Z
**Status:** passed (with HUMAN-UAT + TECH-DEBT carry-forwards listed in § Human Verification Required and § Anti-Patterns Found — neither blocks Phase 3 closure per Phase 4's framing of carry-forwards as milestone-level post-deploy validations rather than phase-completion gates)
**Re-verification:** Yes — retroactive goal-backward verification authored 2026-05-03 from the gap-closure quick task `260503-tm8`. Each row below was independently re-derived against the current `src/` tree, not transcribed from `v1.0-MILESTONE-AUDIT.md`. All phase-exit greps from `03-VALIDATION.md:95–122` were re-run; results recorded inline.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Committed Alchemy URL absent from src/; primary RPC URL read from env var with a same-shape public fallback | VERIFIED | `grep -r "y3BXawVv5uuP" src/` → 0 hits. `src/lib/config/networks.ts:38–42` "SEC-01 / Phase 3 D-02: PUBLIC_BASE_RPC_URL is the Alchemy app URL exposed to the [client]" + `const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com'`. |
| 2 | Server auth/csrf modules fail closed at module load when SESSION_SECRET / CSRF_SECRET are missing — no fallback secret strings in source | VERIFIED | `grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts` → 0 hits. Module-load throw covered by `src/lib/server/auth.test.ts` (3/3 pass) and `src/lib/server/csrf.test.ts` (9/9 pass). |
| 3 | Wallet-address cookie no longer used as authoritative identity anywhere in lib / hooks / API routes — replaced by KV-backed session id read via `walletSession.ts` | VERIFIED | `grep -rn "cookies.get('wallet-address')" src/lib src/hooks.server.ts src/routes/api` → 0 hits. `src/lib/server/walletSession.ts` present (KV-backed session lifecycle). `src/lib/server/walletSession.test.ts` 7/7 pass. `src/lib/server/signatureChallenge.test.ts` (session_login purpose) 7/7 pass. |
| 4 | CSRF tokens are session-bound (HMAC over session id) — stateless tokens removed; SEC-04 round-trip covered | VERIFIED | `src/lib/server/csrf.test.ts:5–7` describes the API rewrite: "Plan 03-08a (SEC-04) replaced the prior stateless generate/validate token API with session-bound generateCsrfTokenForSession/validateCsrfTokenForSession". `src/lib/server/csrf.test.ts:80` `describe('SEC-04 session-bound CSRF', ...)`. csrf.test 9/9 pass. |
| 5 | Auth-adjacent secret generators use crypto.randomBytes with rejection sampling — no `Math.random()` in `accessCodes.ts` / `referrals.ts` | VERIFIED | `grep -E "Math\.random\(\)" src/lib/server/accessCodes.ts src/lib/server/referrals.ts` → 0 hits. `src/lib/server/accessCodes.test.ts` (15/15 pass) covers SEC-05 CSPRNG witness + rejection sampling; `src/lib/server/referrals.test.ts` (5/5 pass) covers referral-code CSPRNG. |
| 6 | Snapshot generate route gated by requireAdmin; preview routes wrapped in a dedicated rate-limit tier | VERIFIED | `src/routes/api/snapshots/generate/+server.ts:10` `import { requireAdmin } from '$lib/server/adminAuth'`; `:15` `await requireAdmin(request, cookies, 'snapshots-generate')`. `src/lib/server/rateLimit.ts:325` `snapshotsPreview: { ... }` tier present. |
| 7 | hCaptcha verification fails closed when HCAPTCHA_SECRET is missing on Vercel preview/production (only dev silently bypasses) | VERIFIED | `src/lib/server/accessCodes.ts:171–187` documents and implements VERCEL_ENV-aware fail-closed: `if (env.VERCEL_ENV !== 'development') { throw new Error('[accessCodes] HCAPTCHA_SECRET not configured (VERCEL_ENV=...)'); }` then `console.warn` for development only. accessCodes.test.ts SEC-07 block covered. |
| 8 | callRpc retries with backoff (per-RPC `withRetry`, throws on chain exhaustion); `latestBlock` silent fallback removed | VERIFIED | `src/lib/server/snapshots/generator.ts:13` `import { withRetry } from '$lib/utils/retry'`. `:73–78` `await withRetry(() => fetchOnce(rpcUrl, method, params), 2, 200)`. Comments `:37` "REL-01: empty result is a failure (lets withRetry fire on transient empties)" and `:61` "On chain exhaustion: throws `Error("callRpc(${method}) — all N RPCs ...")`". `src/lib/server/snapshots/generator.test.ts` 7/7 pass. |
| 9 | Wallet signature verification uses viem fallback transport (REL-02) — no naive single-RPC verifyMessage | VERIFIED | `src/lib/server/accessCodes.ts:2,11–25,30,39` `import { createPublicClient, fallback, http } from 'viem'` + RPC_URLS = `[PRIMARY_RPC_URL].concat(networks[0].fallbackRpcUrls)` + `transport: fallback([...])`. Comment `:30` cites "RESEARCH Pattern 3 + Pitfall 7 (multiplicative-retry trap)". REL-02 fallback-transport tests in accessCodes.test.ts (15/15 pass). |
| 10 | Rain registry vendored under `static/registry/` and served same-origin; runtime GitHub raw fetch eliminated | VERIFIED | `grep -E "RAIN_STRATEGIES_COMMIT|raw\.githubusercontent\.com.*rain\.strategies" src/lib/services/orderDeployment.ts` → 0 hits. `src/lib/services/orderDeployment.ts:56–60` "Registry URL for rain.strategies. Vendored under static/registry/ and served same-origin" + `const REGISTRY_URL = publicEnv.PUBLIC_REGISTRY_URL || '/registry/manifest'`. `static/registry/manifest` present and lists all 8 strategies. |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/config/networks.ts` | env-var read for BASE_RPC_URL / PUBLIC_BASE_RPC_URL | VERIFIED | Lines 38–42 |
| `src/lib/server/auth.ts` | module-load fail-closed on missing SESSION_SECRET; no fallback string | VERIFIED | grep gate clean; auth.test.ts 3/3 pass |
| `src/lib/server/csrf.ts` | module-load fail-closed; session-bound HMAC API | VERIFIED | grep gate clean; csrf.test.ts 9/9 pass (incl. SEC-04 block) |
| `src/lib/server/walletSession.ts` | KV-backed session lifecycle (NEW in 03-08a) | VERIFIED | Present; walletSession.test.ts 7/7 pass |
| `src/lib/server/accessCodes.ts` | crypto.randomBytes with rejection sampling; viem fallback transport for verifyMessage; VERCEL_ENV-aware hCaptcha fail-closed | VERIFIED | `Math.random()` grep clean; viem fallback at lines 2/11-25/30/39; hCaptcha fail-closed at 171–187; accessCodes.test.ts 15/15 pass |
| `src/lib/server/referrals.ts` | crypto.randomBytes with rejection sampling | VERIFIED | `Math.random()` grep clean; referrals.test.ts 5/5 pass |
| `src/lib/server/snapshots/generator.ts` | callRpc per-RPC retry; throws on chain exhaustion; latestBlock fallback removed | VERIFIED | Lines 13/73-78; generator.test.ts 7/7 pass |
| `src/lib/server/rateLimit.ts` | snapshotsPreview tier added | VERIFIED | Line 325 |
| `src/routes/api/snapshots/generate/+server.ts` | requireAdmin gate | VERIFIED | Lines 10, 15 |
| `src/lib/services/orderDeployment.ts` | vendored registry; same-origin URL; no GitHub raw fetch | VERIFIED | grep gate clean; lines 56–60 |
| `static/registry/` | vendored Rain strategies | VERIFIED | manifest + 8 .rain files + settings.yaml present |
| `src/lib/server/signatureChallenge.ts` | session_login purpose extension | VERIFIED | signatureChallenge.test.ts 7/7 pass |
| Auth route handlers (`session/challenge POST`, `session POST`, `logout POST`) | NEW in 03-08a-T2 | VERIFIED (per Phase 3 SUMMARYs + walletSession test coverage) | Wired through walletSession.ts; covered by walletSession.test.ts 7/7 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/config/networks.ts` | `$env/dynamic/public` | `publicEnv.PUBLIC_BASE_RPC_URL` read with same-origin fallback | WIRED | Line 42 |
| `src/lib/server/auth.ts` | `$env/dynamic/private` | module-load throw if SESSION_SECRET missing | WIRED | auth.test.ts pins fail-closed |
| `src/lib/server/csrf.ts` | session id (KV) | HMAC-bound `generateCsrfTokenForSession` / `validateCsrfTokenForSession` | WIRED | csrf.test.ts SEC-04 block (line 80) covers round-trip |
| `src/hooks.server.ts` | `$lib/server/walletSession` | atomic flip — wallet-address cookie downgraded to non-authoritative hint; auth derived from session cookie + KV record | WIRED | grep `cookies.get('wallet-address')` in src/lib + hooks.server + routes/api → 0 hits |
| `src/lib/server/accessCodes.ts` (`verifyCaptcha`) | `$env/dynamic/private` (`HCAPTCHA_SECRET`, `VERCEL_ENV`) | VERCEL_ENV-aware fail-closed | WIRED | Lines 171–187 |
| `src/lib/server/accessCodes.ts` (`verifyWalletSignature`) | viem fallback transport | `createPublicClient({ transport: fallback([http(url1), http(url2), ...]) })` | WIRED | Lines 2, 11–25, 30, 39; PRIMARY_RPC_URL prepended to `networks[0].fallbackRpcUrls` |
| `src/lib/server/snapshots/generator.ts` | `$lib/utils/retry` | `withRetry(() => fetchOnce(...), 2, 200)` per RPC; throws on chain exhaustion | WIRED | Lines 13, 73-78 |
| `src/routes/api/snapshots/generate/+server.ts` | `$lib/server/adminAuth` | `requireAdmin` guard | WIRED | Lines 10, 15 |
| `src/lib/services/orderDeployment.ts` | `static/registry/manifest` | `REGISTRY_URL = publicEnv.PUBLIC_REGISTRY_URL || '/registry/manifest'` | WIRED | Lines 56–60, 83 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite green | `npm test -- --run` | 52 files / 663 pass / 1 skip | PASS |
| svelte-check baseline holds | `npm run check` | 3 errors (matches Phase 2/4 baseline; sole error in `tests/lib/server/rpcMetrics.test.ts:182`) | PASS |
| SEC-01 committed Alchemy key absent | `! grep -r "y3BXawVv5uuP" src/` | 0 hits | PASS |
| SEC-02 fallback secret strings absent | `! grep -E "'st0x-session-secret-2024'\|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts` | 0 hits | PASS |
| SEC-02 module-load throw | `npm test -- --run src/lib/server/auth.test.ts src/lib/server/csrf.test.ts` | auth 3/3 + csrf 9/9 | PASS |
| SEC-03 wallet-address cookie no longer authoritative | `! grep -rn "cookies.get('wallet-address')" src/lib src/hooks.server.ts src/routes/api` | 0 hits | PASS |
| SEC-03 walletSession lifecycle | `npm test -- --run src/lib/server/walletSession.test.ts src/lib/server/signatureChallenge.test.ts` | walletSession 7/7 + signatureChallenge 7/7 | PASS |
| SEC-04 session-bound CSRF round-trip | `npm test -- --run src/lib/server/csrf.test.ts` (SEC-04 block) | 9/9 (block at line 80) | PASS |
| SEC-05 Math.random absent in auth-adjacent | `! grep -E "Math\.random\(\)" src/lib/server/accessCodes.ts src/lib/server/referrals.ts` | 0 hits | PASS |
| SEC-05 CSPRNG + rejection sampling tests | `npm test -- --run src/lib/server/accessCodes.test.ts src/lib/server/referrals.test.ts` | accessCodes 15/15 + referrals 5/5 | PASS |
| SEC-06 requireAdmin on snapshots/generate | `grep -n 'requireAdmin' src/routes/api/snapshots/generate/+server.ts` | 2 hits (import + invocation) | PASS |
| SEC-06 snapshotsPreview rate-limit tier | `grep -n 'snapshotsPreview' src/lib/server/rateLimit.ts` | line 325 | PASS |
| SEC-07 hCaptcha fail-closed (VERCEL_ENV-aware) | `grep -n 'VERCEL_ENV' src/lib/server/accessCodes.ts` | lines 171–187 | PASS |
| REL-01 callRpc retry + throw on exhaustion | `npm test -- --run src/lib/server/snapshots/generator.test.ts` | 7/7 | PASS |
| REL-02 viem fallback transport in verifyWalletSignature | `grep -n 'createPublicClient\|fallback' src/lib/server/accessCodes.ts` | lines 2, 11-25, 30, 39 | PASS |
| REL-03 GitHub raw fetch absent + vendored registry | `! grep -E "RAIN_STRATEGIES_COMMIT\|raw\.githubusercontent\.com.*rain\.strategies" src/lib/services/orderDeployment.ts` AND `ls static/registry/manifest` | 0 hits + manifest present | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-01 | 03-01 | Hardcoded Alchemy URL → env-var read with same-shape public fallback | SATISFIED | `grep -r "y3BXawVv5uuP" src/` → 0; `networks.ts:38–42` env-var read |
| SEC-02 | 03-02 | auth.ts/csrf.ts module-load throw on missing secrets; fallback strings removed | SATISFIED | grep gate clean; auth.test 3/3, csrf.test 9/9 pass |
| SEC-03 | 03-08a (infra) + 03-08b (consumer migration) | Wallet-address cookie atomic flip → KV-backed session cookie as authoritative; manual smoke approved | SATISFIED (with HUMAN-UAT carry-forward — see § Human Verification Required) | `cookies.get('wallet-address')` grep → 0 in lib/hooks/api; walletSession.test 7/7 pass; D-04b runtime UX deferred to milestone-exit per audit tech_debt |
| SEC-04 | 03-08a | Session-bound HMAC CSRF; stateless tokens removed | SATISFIED (with HUMAN-UAT carry-forward — same D-04b smoke as SEC-03) | csrf.test SEC-04 block (line 80) 9/9 pass; round-trip pinned |
| SEC-05 | 03-03 | crypto.randomBytes + rejection sampling in accessCodes/referrals | SATISFIED | `Math.random()` grep clean; accessCodes.test 15/15 + referrals.test 5/5 pass |
| SEC-06 | 03-05 | snapshot preview rate-limit tier; generate gated by requireAdmin | SATISFIED | `requireAdmin` at snapshots/generate +server.ts:10,15; `snapshotsPreview` tier at rateLimit.ts:325 |
| SEC-07 | 03-04 | hCaptcha VERCEL_ENV-aware fail-closed | SATISFIED | accessCodes.ts:171–187; tested in accessCodes.test 15/15 |
| REL-01 | 03-06 | callRpc per-RPC retry + throw on chain exhaustion; latestBlock silent fallback removed | SATISFIED | generator.ts:13/73-78; generator.test 7/7 |
| REL-02 | 03-07 | accessCodes signature verification uses viem fallback transport | SATISFIED (with TECH-DEBT carry-forward — see § Anti-Patterns Found) | accessCodes.ts:2/11-25/30/39; tests in accessCodes.test 15/15 |
| REL-03 | 03-10 | Rain registry vendored to static/registry/, no GitHub raw fetch | SATISFIED | grep gate clean; orderDeployment.ts:56-60; manifest + 8 .rain files vendored |

No orphaned requirements: REQUIREMENTS.md Phase 3 mapping = {SEC-01..07, REL-01..03} = 10 IDs, all addressed by Phase 3 plans (numbering reflects 03-08 split into 03-08a/03-08b per checker fix #5). No Phase 1/2/4 REQ-IDs leak into this verification.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (no behavioral anti-patterns introduced by Phase 3) | — | — | — | — |
| `src/lib/server/accessCodes.ts` (REL-02 fallback transport) | 30 (comment) + transport configuration | Per-RPC attribution lost when verifyMessage routes through viem `fallback([...])` Transport — OBS-04 `recordRpcAttempt` cannot disambiguate which underlying transport actually served the request | **TECH-DEBT carry-forward** (Info severity for Phase 3; tracked as `T-03-REL-02-04` in audit) | Operational: chain-exhausted alert metrics will show `'fallback-chain-base'` as a single per-call instrumentation rather than per-RPC attribution. Documented at `accessCodes.ts:112` "stable identifier `'fallback-chain-base'` — single per-call instrumentation per". Not a security or correctness issue; the fallback transport itself works correctly. |
| `tests/lib/stores/partialFillDetection.test.ts` | comment-only reference | Comment string contains `.inputTokenAddress` (not an actual property access) | Info | Pre-existing across Phases 2/3/4 — TRADE-01 grep gate per `04-VERIFICATION.md:65–67` is reported as "0 hits" with the slightly-tighter grep that excludes test-comment fixtures. Not a behavioral violation. |
| `tests/lib/server/rpcMetrics.test.ts` | 182 | `'alertArg' possibly undefined` | Info | Pre-existing svelte-check baseline error (3 total). Acknowledged carry-forward across Phases 2/3/4. |

### Phase 2 Carry-Forward Re-Verification

| Gate | Expected | Actual | Status |
|------|----------|--------|--------|
| TRADE-01 IO-perspective lockdown | 0 raw violations (excluding allowlist + comments) | 1 hit, comment-only in `tests/lib/stores/partialFillDetection.test.ts` (not a behavioral violation) | VERIFIED |
| TRADE-02 cycle severance (`from '$lib/stores/transaction'` in marketOrderExecution.ts) | 0 imports | 0 | VERIFIED |
| failWith count in marketOrderExecution.ts (OBS-03 transcript) | ≥12 | 16 | VERIFIED |
| EMERGENCY_RATIO_MULTIPLIER refs in src/ | 0 | 0 | VERIFIED |
| svelte-check baseline | ≤3 errors | 3 | VERIFIED |
| staleTime: Infinity in queryClient.ts | ≥1 | 1 | VERIFIED |

### Human Verification Required

**SEC-03 + SEC-04 — D-04b runtime UX assertion (HUMAN-UAT carry-forward).** The atomic-flip code path is automated-test-covered (`walletSession.test.ts` 7/7, `csrf.test.ts` SEC-04 block 9/9, `signatureChallenge.test.ts` session_login 7/7), but the end-to-end runtime UX guarantee — that a real wallet sees ONE signature prompt at login, NEVER per request, with the 30-day sliding refresh holding across browser-close+reopen — is a multi-tab, multi-day human flow that cannot be exercised in unit tests without mocking the wallet provider's user-prompt UI.

Per `03-VALIDATION.md:83`, the recipe is documented in `03-RUNBOOK.md` "Session-Cookie Smoke" and was approved manually for plan 03-08b at execution time. Treating it (per `04-VERIFICATION.md:114` framing) as a **milestone-level post-deploy validation** — not a Phase 3 success-criterion condition — keeps phase-completion separate from operational follow-up. The `v1.0-MILESTONE-AUDIT.md` carries this as `tech_debt` for the milestone, not as a Phase 3 gap.

**Recipe (from 03-VALIDATION.md:83):** Vercel preview deploy (= stage; KV shared with prod): login → trade → reload page → trade again → log out → log back in → trade. Verify ONE wallet signature prompt at login, NEVER per request. Verify 30-day sliding refresh holds across browser-close + reopen within 24h.

### Gaps Summary

No phase-completion gaps. All 10 phase requirement IDs satisfied, all phase-exit greps from `03-VALIDATION.md:95–122` return clean, all Phase 2 carry-forward gates green, behavioral spot-checks (`npm test`, `npm run check`, plus 7 SEC/REL targeted runs covering 53 tests) all pass at expected baselines.

Two carry-forwards explicitly tracked (neither blocks Phase 3 closure under the Phase 4 framing):
1. **SEC-03 + SEC-04 D-04b runtime UX** — HUMAN-UAT, deferred to milestone-exit `/gsd-verify-work`. Recipe in 03-RUNBOOK.md.
2. **REL-02 per-RPC attribution loss** — TECH-DEBT (`T-03-REL-02-04`), Info severity. The viem fallback transport routes `verifyMessage` correctly across multiple RPCs, but OBS-04 `recordRpcAttempt` cannot disambiguate which underlying RPC served the request — only `'fallback-chain-base'` is recorded per call. Operational impact only; not a security or correctness issue.

---

*Verified: 2026-05-03T20:35:30Z*
*Verifier: Claude (gsd-verifier)*
