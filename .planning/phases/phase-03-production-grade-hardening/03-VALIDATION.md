---
phase: 3
slug: production-grade-hardening
status: revised
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-30
revised: 2026-04-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (jsdom) + svelte-check |
| **Config file** | vite.config.ts (test block), tsconfig.json |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm run check && npm test -- --run` |
| **Estimated runtime** | ~60-90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` (test files relevant to changed surface)
- **After every plan wave:** Run `npm run check && npm test -- --run` (full suite + svelte-check)
- **Before `/gsd-verify-work`:** Full suite must be green AND svelte-check baseline ≤ 3 errors AND all phase-exit greps from 03-11 pass
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

> Populated by gsd-planner from phase RESEARCH.md §"Validation Architecture". Final task IDs and commands populated post-revision (this iteration filled the TBD W0 placeholders per checker fix #9).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1, 03-01-T2 | 01 | 1 | SEC-01 | T-03-SEC-01 | Hardcoded Alchemy URL absent from src/ — env var read instead | unit + grep | `! grep -r "y3BXawVv5uuP" src/ && npm test -- --run accessCodes` | ✅ tests/lib/server/accessCodes.test.ts (existing) | ⬜ pending |
| 03-02-T1, 03-02-T2 | 02 | 2 | SEC-02 | T-03-SEC-02 | auth.ts/csrf.ts throw at module load when secret missing in prod | unit | `npm test -- --run auth.test csrf.test` | ✅ src/lib/server/auth.test.ts + csrf.test.ts (NEW in 03-02-T1, 03-02-T2) | ⬜ pending |
| 03-03-T1, 03-03-T2 | 03 | 2 | SEC-05 | T-03-SEC-05 | accessCodes.ts + referrals.ts use crypto.randomBytes; rejection-sampled | unit | `npm test -- --run accessCodes referrals && ! grep -E "Math\\.random\\(\\)" src/lib/server/{accessCodes,referrals}.ts` | ✅ accessCodes.test.ts (existing, extended in 03-03-T1) + src/lib/server/referrals.test.ts (NEW in 03-03-T2) | ⬜ pending |
| 03-04-T1 | 04 | 2 | SEC-07 | T-03-SEC-07 | hCaptcha fails closed when HCAPTCHA_SECRET missing on Vercel preview | unit | `npm test -- --run accessCodes` | ✅ accessCodes.test.ts (existing, extended in 03-04-T1) | ⬜ pending |
| 03-05-T1, 03-05-T2 | 05 | 3 | SEC-06 | T-03-SEC-06 | snapshot preview tier-rate-limited; generate gated by requireAdmin | unit + integration | `npm test -- --run rateLimit snapshots` | ⚠ rateLimit.test scaffolding deferred to in-plan stub if missing — Plan 03-05 verify hits npm test with full suite | ⬜ pending |
| 03-06-T1 | 06 | 4 | REL-01 | T-03-REL-01 | callRpc retries with backoff; empty result = failure; latestBlock fallback removed | unit | `npm test -- --run snapshots/generator.test withRetry` | ✅ src/lib/server/snapshots/generator.test.ts (NEW in 03-06-T1 RED step) | ⬜ pending |
| 03-07-T1 | 07 | 5 | REL-02 | T-03-REL-02 | accessCodes signature verification uses viem fallback transport | unit | `npm test -- --run accessCodes` | ✅ accessCodes.test.ts (existing, extended in 03-07-T1) | ⬜ pending |
| 03-08a-T1, 03-08a-T2, 03-08a-T3 | 08a | 6 | SEC-04 + SEC-03 infra (SEC-03 completion claimed by 03-08b after consumer migration) | T-03-SEC-03 / T-03-SEC-04 | walletSession.ts module + auth routes + session-bound CSRF | unit + integration | `npm test -- --run walletSession signatureChallenge csrf` | ✅ src/lib/server/walletSession.test.ts (NEW in 03-08a-T1) + signatureChallenge.test.ts (existing, extended) + csrf.test.ts (existing from 03-02, extended in 03-08a-T3 SEC-04 block) | ⬜ pending |
| 03-08b-T1, 03-08b-T2 | 08b | 6 | SEC-03 (consumer migration) | T-03-SEC-03 | hooks.server.ts reads session cookie + KV; wallet-address downgraded to non-authoritative hint; manual smoke gate passes | grep + manual smoke | `! grep -rn "cookies.get('wallet-address')" src/lib src/hooks.server.ts src/routes/api && npm test -- --run hooks` | ⚠ hooks integration tests deferred to Phase 4 / TEST-01 per CONTEXT; this plan relies on grep gates + manual smoke | ⬜ pending |
| 03-10-T1, 03-10-T2 | 10 | 7 | REL-03 | T-03-REL-03 | Rain registry served from /static/registry/, no GitHub raw fetch | integration | `npm test -- --run orderDeployment && ! grep -E "raw\\.githubusercontent\\.com" src/lib/services/orderDeployment.ts` | ⚠ orderDeployment.test scaffolding deferred — registry fetch is mocked at test boundary; this plan relies on grep gates + Wave 7 manual UAT | ⬜ pending |
| 03-11-T1, 03-11-T2, 03-11-T3, 03-11-T4 | 11 | 8 | All | — | Phase-exit greps + cross-cutting Phase 2 gates re-verified; 03-RUNBOOK.md landed; manual hand-off gate | grep + manual | See §Phase-Exit Verification below | n/a (verification + RUNBOOK + manual gate) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Plan numbering reflects checker fix #5 split: 03-08 split into 03-08a (infrastructure) + 03-08b (consumer migration), both ship as a single PR per Phase 2 D-08 atomic-flip-PR-shape pattern. Existing 03-09 (REL-03) renumbered to 03-10; existing 03-10 (phase-exit) renumbered to 03-11. Total plan count: 11. Wave count: 8.*

---

## Wave 0 Requirements

- [ ] `tests/lib/server/auth.test.ts` (or `src/lib/server/auth.test.ts` — match codebase convention) — stubs for SEC-02 module-load throw behavior, created at start of 03-02-T1 RED step
- [ ] `tests/lib/server/csrf.test.ts` (or `src/lib/server/csrf.test.ts`) — stubs for SEC-02 module-load throw + SEC-04 session-bound HMAC round-trip, SEC-02 portion created in 03-02-T2 RED step, SEC-04 portion appended in 03-08a-T3 RED step
- [ ] `src/lib/server/accessCodes.test.ts` — existing file, extended for SEC-05 (03-03-T1) + SEC-07 (03-04-T1) + REL-02 (03-07-T1)
- [ ] `src/lib/server/referrals.test.ts` — NEW file created in 03-03-T2 RED step for SEC-05 referral code coverage
- [ ] `src/lib/server/snapshots/generator.test.ts` — NEW file created in 03-06-T1 RED step for REL-01 retry + getBlockNumberForTimestamp throw-on-exhaustion
- [ ] `src/lib/server/walletSession.test.ts` — NEW file created in 03-08a-T1 RED step for SEC-03 session-id KV record lifecycle
- [ ] `src/lib/server/signatureChallenge.test.ts` — existing file, extended for `'session_login'` purpose in 03-08a-T1 RED step
- [ ] `src/lib/server/rateLimit.test.ts` (if present in repo; otherwise this stub is informal — 03-05 ships rate-limit tier addition without dedicated unit test, defers to Phase 4 / TEST-02)
- [ ] `tests/lib/services/orderDeployment.test.ts` (if present; otherwise informal — 03-10 ships static-registry vendor without dedicated unit test, defers to Phase 4)

*Existing vitest infrastructure already covers `src/lib/{utils,services,types}` per Phase 1+2 patterns. Wave 0 adds stubs for the new server-side surface introduced by Phase 3 (walletSession.ts, signatureChallenge.ts session_login purpose, csrf.ts SEC-04 rewrite).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alchemy key rotation | SEC-01 (D-02a) | Off-codebase Vercel env-var setup + Alchemy dashboard rotation | 03-RUNBOOK.md "Alchemy Rotation" steps 1-6: provision new app, set both PUBLIC_BASE_RPC_URL + BASE_RPC_URL in Vercel (production + preview), deploy SEC-01 code, verify in Vercel Logs `recordRpcAttempt` lines show new rpc_url, revoke old key in Alchemy dashboard. |
| Session-cookie smoke recipe | SEC-03+04 (D-04 atomic flip, D-04b no-per-request-signature) | Real wallet signature interaction; bisect line for atomic flip | Plan 03-08b Task 2 manual smoke (Vercel preview deploy = stage; KV shared with prod; cleanup recipe in 03-RUNBOOK.md): login → trade → reload page → trade again → log out → log back in → trade. Verify ONE wallet signature prompt at login, NEVER per request. Verify 30-day sliding refresh holds across browser-close + reopen within 24h. |
| Vercel preview hCaptcha fail-closed | SEC-07 | Requires Vercel preview deploy environment to validate | Push branch to Vercel preview deploy WITHOUT `HCAPTCHA_SECRET`; attempt access-code submission → expect 500/closed; set HCAPTCHA_SECRET → retry → expect normal flow. |
| Rain registry refresh procedure | REL-03 | Off-codebase rsync + commit + redeploy workflow | 03-RUNBOOK.md "Registry Refresh" steps: `rsync` from upstream pinned commit into `static/registry/`, commit + push, Vercel auto-deploys, verify order deployment still works against new registry. |
| Numeric LCP HUMAN-UAT | PERF-01 carry-forward | Vercel Speed Insights dashboard not programmatically readable | Operator reviews Speed Insights p75 LCP on /trade/[id] before + after Phase 3 deploy; documents pre/post numbers in 02-RUNBOOK.md per Phase 2 close. Phase 3 must NOT regress p75 LCP. |
| Phase 2 cross-cutting gate manual confirmation | TRADE-01 / TRADE-02 / OBS-03 carry-forward | Mechanical greps but the *outcome* (no IO-perspective reversal in any new code, no new failWith path in marketOrderExecution.ts) is a phase-shape correctness check | 03-11 phase-exit grep gates execute these verifications mechanically. |

---

## Phase-Exit Verification (Wave 8 / 03-11 grep gates)

> Per CONTEXT D-01 wave shape, RESEARCH §"Phase-exit verification", and Plan 02-08 / 01-08 precedent. The Wave 8 plan (03-11) re-runs all of these as its acceptance criteria.

```bash
# SEC-01 evidence — committed Alchemy key absent from src/
! grep -r "y3BXawVv5uuP" src/

# SEC-05 evidence — Math.random() removed from auth-adjacent paths
! grep -E "Math\.random\(\)" src/lib/server/accessCodes.ts src/lib/server/referrals.ts

# SEC-02 evidence — fallback secret strings removed
! grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts

# REL-03 evidence — runtime GitHub raw fetch removed; vendored registry served same-origin
! grep -E "RAIN_STRATEGIES_COMMIT|raw\.githubusercontent\.com.*rain\.strategies" src/lib/services/orderDeployment.ts

# Phase 2 carry-forward — TRADE-01 IO-perspective lockdown
test "$(grep -rE '\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\b' src/ tests/ | grep -vE 'orderPerspective\.ts|utils/orderbook\.ts|api/orders\.ts|generated-graphql\.ts|io-perspective-violation\.ts' | wc -l)" = "0"

# Phase 2 carry-forward — TRADE-02 cycle severance
! grep -E "from ['\"]\\\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts

# Phase 2 carry-forward — failWith() count ≥ 12 in marketOrderExecution.ts (OBS-03 transcript)
test "$(grep -c 'failWith(' src/lib/services/marketOrderExecution.ts)" -ge 12

# Phase 2 carry-forward — EMERGENCY_RATIO_MULTIPLIER count = 0
test "$(grep -rc 'EMERGENCY_RATIO_MULTIPLIER' src/ | grep -v ':0$' | wc -l)" = "0"

# Phase 2 carry-forward — svelte-check baseline ≤ 3 errors
npm run check 2>&1 | tail -3
```

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — populated in this revision (per checker fix #9)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test stubs above; both NEW and existing-extended files enumerated)
- [x] No watch-mode flags (vitest `--run` only)
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter (per checker fix #9)

**Approval:** revision iteration 1 — 5 BLOCKERs + 4 WARNINGs addressed; ready for re-check.
