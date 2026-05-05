---
phase: 03-production-grade-hardening
plan: 07
subsystem: infra
tags: [phase-3, rel-02, viem-fallback, signature-verification, fallback-chain-base, eip-1271, eip-6492]

# Dependency graph
requires:
  - phase: 03-production-grade-hardening
    provides: "Plan 03-01 SEC-01 — env.BASE_RPC_URL provisioned + module-load throw; Plan 03-04 SEC-07 — VERCEL_ENV fail-closed precedent for accessCodes.ts; Plan 03-06 REL-01 — RPC_URLS shape (networks[0].rpcUrl + networks[0].fallbackRpcUrls) as single source of truth, ratified by generator.ts:14"
provides:
  - "basePublicClient on viem fallback Transport — fallback([http(URL_1), ..., http(URL_6)], { retryCount: 2, retryDelay: 200, rank: false }) — closes audit finding T-03-REL-02-01 (single Alchemy hiccup blocks ALL EIP-1271/6492 verification)"
  - "OBS-04 fan-out relabel: 'fallback-chain-base' (single stable identifier per logical call) replaces synthetic 'alchemy-base-mainnet' from Plan 01-06"
  - "RESEARCH Pitfall 7 fence in production: NO outer-retry wrap around verifyMessage — viem's fallback transport handles per-transport retry internally; multiplicative-retry trap mitigated structurally"
affects: [03-08a, sec-03, session-cookie-flow, signature-verification, eip-1271, eip-6492]

# Tech tracking
tech-stack:
  added: ["viem fallback Transport (existing dep, new usage)"]
  patterns:
    - "viem fallback([http(URL_1), ...], { retryCount, retryDelay, rank }) Transport for read-only signature-verification publicClient"
    - "RPC_URLS = (PRIMARY ? [PRIMARY] : []).concat(networks[0].fallbackRpcUrls) — same shape as generator.ts:14, single source of truth in src/lib/config/networks.ts"
    - "Single per-call OBS-04 instrumentation with synthetic stable identifier (per-RPC granularity deferred to Phase 4)"

key-files:
  created: []
  modified:
    - "src/lib/server/accessCodes.ts (basePublicClient swap to fallback Transport + label rename)"
    - "src/lib/server/accessCodes.test.ts (REL-02 describe block — 4 new tests)"
    - "src/lib/server/referrals.test.ts (Rule 3 blocker fix: viem mock extended with `fallback` export — referrals.ts transitively imports accessCodes.ts)"

key-decisions:
  - "Use viem's NATIVE retryCount + retryDelay Transport options (NOT $lib/utils/retry.ts withRetry) per RESEARCH Pitfall 7 — outer retry wrapper would multiply retries (N transports × M retryCount × K outer)"
  - "rank: false to keep deterministic ordering (Alchemy primary first); per-RPC latency ranking is incompatible with our preference for the paid endpoint"
  - "Single per-call OBS-04 instrumentation with 'fallback-chain-base' synthetic label (RESEARCH Open Question 4) — per-RPC attribution deferred to Phase 4 (would require custom wrapped Transport with per-attempt instrumentation hooks)"
  - "RPC_URLS derived from networks[0] (single source of truth) rather than a hardcoded list — same shape as generator.ts:14 ratified by Plan 03-06"

patterns-established:
  - "viem fallback Transport with retry options for any read-only publicClient that needs RPC resilience"
  - "Test mock contract: every test file that transitively imports accessCodes.ts (via referrals.ts, etc.) must mock viem's `fallback` export — otherwise module-load fails"
  - "Comments referencing avoided patterns must be phrased to NOT include the literal token if a grep-based acceptance gate forbids it (e.g., 'outer retry wrapper' instead of 'withRetry')"

requirements-completed: [REL-02]

# Metrics
duration: 4min
completed: 2026-04-30
---

# Phase 3 Plan 07: REL-02 viem Fallback Transport for Signature Verification Summary

**viem fallback Transport (6 RPCs × retryCount=2 × retryDelay=200ms) backs basePublicClient.verifyMessage for EIP-1271/6492 signature verification; OBS-04 label relabeled to 'fallback-chain-base'; no outer retry wrap (Pitfall 7 mitigated)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-30T10:13:20Z
- **Completed:** 2026-04-30T10:17:31Z
- **Tasks:** 1 (TDD: 2 commits — RED + GREEN)
- **Files modified:** 3 (1 source, 2 tests)

## Accomplishments
- Replaced single `http(PRIMARY_RPC_URL)` Transport at `accessCodes.ts:22-25` with `fallback(RPC_URLS.map((url) => http(url)), { retryCount: 2, retryDelay: 200, rank: false })` — RESEARCH §"Pattern 3" code copied verbatim
- RPC_URLS reads from `networks[0]` (shared with `generator.ts:14`) — single source of truth in `src/lib/config/networks.ts`; primary first when env.BASE_RPC_URL is set, otherwise the 6 publicnode/llamarpc/meowrpc/blastapi/tenderly fallbacks alone
- Relabeled all 3 OBS-04 fan-out sites from `'alchemy-base-mainnet'` (Plan 01-06 synthetic) → `'fallback-chain-base'` (RESEARCH Open Question 4)
- Mitigated multiplicative-retry trap (RESEARCH Pitfall 7): no outer retry helper wraps `basePublicClient.verifyMessage(...)` — viem's fallback transport handles per-transport retry internally (verified by grep gate)
- 4 new TDD-pinned tests in `accessCodes.test.ts`: transport construction shape (retryCount/retryDelay/rank), happy path (verified), mismatch (ok=true status_or_error=mismatch), chain-exhausted (ok=false + reportChainExhausted with `fallback-chain-base` attempt entry)
- Fixed regression in `src/lib/server/referrals.test.ts` (Rule 3 blocker): the existing viem mock was missing the `fallback` export — `referrals.ts` transitively imports `accessCodes.ts` whose new module-load `fallback(...)` call fails without the mock entry

## Task Commits

Atomic TDD sequence:

1. **Task 1 RED — REL-02 fallback-transport tests** — `da65ced` (test)
2. **Task 1 GREEN — REL-02 viem fallback chain implementation** — `8252c2d` (feat)

## Files Created/Modified

- `src/lib/server/accessCodes.ts` — basePublicClient swap; `fallback`+`networks` imports added; OBS-04 fan-out label rename at 3 sites; comment block rewritten (drop literal `withRetry` token, refer to "outer retry wrapper" instead — preserves RESEARCH Pitfall 7 documentation while satisfying the grep gate)
- `src/lib/server/accessCodes.test.ts` — top-level viem mock extended (`createPublicClient` delegates to hoisted `mockCreatePublicClient`; `fallback` + `http` mocked via hoisted refs); new `vi.mock('$lib/server/rpcMetrics')` to capture recordRpcAttempt + reportChainExhausted; new `describe('REL-02 fallback transport for verifyWalletSignature')` block with 4 tests
- `src/lib/server/referrals.test.ts` — viem mock extended with `fallback: vi.fn(() => ({}))` (Rule 3 fix; documented inline)

## Decisions Made

- **Native viem retry over withRetry helper:** RESEARCH Pitfall 7 — viem's fallback Transport already retries each underlying http() Transport `retryCount` times before falling through. Wrapping verifyMessage in `withRetry` from `$lib/utils/retry.ts` would multiply retries (N transports × M retryCount × K outer). Use the native primitive.
- **rank: false:** deterministic ordering preserves Alchemy-first preference (paid endpoint, lowest latency in normal operation). Latency-based ranking would interfere with that contract.
- **Single per-call instrumentation with `fallback-chain-base` synthetic label:** per RESEARCH Open Question 4. Per-RPC granularity in OBS-04 logs is deferred to Phase 4 (custom wrapped Transport with per-attempt instrumentation hooks). Phase 3 trade-off accepted: T-03-REL-02-04 (Repudiation — per-attempt RPC URL no longer in OBS-04 logs) is structurally accepted as a known limitation.
- **RPC_URLS derived from networks[0] (not duplicated hardcoded list):** same shape as `generator.ts:14`. Single source of truth; one rotation event affects both signature verification and snapshot scraping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Comment-text vs. grep gate] Reworded `withRetry` references in comments**
- **Found during:** Task 1 GREEN — running acceptance grep gate `! grep -E "withRetry" src/lib/server/accessCodes.ts`
- **Issue:** Two documentation comments correctly described the absence of an outer retry wrapper using the literal token `withRetry` ("DO NOT layer withRetry on top" / "verifyMessage is NOT wrapped in withRetry"). The literal text tripped the grep gate that enforces no withRetry import or call.
- **Fix:** Reworded comments to describe the same RESEARCH Pitfall 7 invariant using the phrase "outer retry wrapper" / "outer retry helper" instead of the literal token. Functional content preserved; grep gate now passes (0 occurrences in source).
- **Files modified:** `src/lib/server/accessCodes.ts` (comment text only)
- **Verification:** `grep -c "withRetry" src/lib/server/accessCodes.ts` returns 0; tests still pass.
- **Committed in:** `8252c2d` (Task 1 GREEN commit)

**2. [Rule 3 — Blocking import-side-effect regression] Add `fallback` to viem mock in referrals.test.ts**
- **Found during:** Task 1 GREEN — full test suite run after `accessCodes.ts` swap
- **Issue:** `referrals.ts` imports from `./accessCodes`; the new module-load call `fallback(...)` in `accessCodes.ts` triggers `[vitest] No "fallback" export is defined on the "viem" mock` and breaks all 5 SEC-05 referrals tests.
- **Fix:** Added `fallback: vi.fn(() => ({}))` to the existing `vi.mock('viem', ...)` block in `src/lib/server/referrals.test.ts` with an explanatory inline comment.
- **Files modified:** `src/lib/server/referrals.test.ts` (mock block only — no test logic changed)
- **Verification:** Full suite: 553 passed | 1 skipped | 0 failed.
- **Committed in:** `8252c2d` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 cosmetic comment phrasing, 1 Rule 3 test-mock blocker)
**Impact on plan:** Both fixes preserve the documented intent of the plan exactly; neither expands scope. The first deviation reconciles literal grep gate vs. comment documentation; the second is a mechanical test-mock contract update for the new module-load side effect (the same kind of update SEC-01 + SEC-07 required when they introduced new viem usage in earlier waves).

## Issues Encountered

None during planned work — TDD cycle ran cleanly. RED phase failed exactly the 4 expected tests (transport shape + 3 label-rename / behavioral assertions); GREEN phase passed all 4 + preserved the 11 prior tests.

## Threat Surface Scan

No new security-relevant surface introduced. The change is structurally a reliability improvement (more RPCs in the chain, retries per transport) — same trust boundaries as before (server → 6 RPC providers; viem internals trusted). T-03-REL-02-05 (Spoofing — attacker-controlled RPC could feed forged signature-verification result) is unchanged from REL-01-06; structural and out of REL-02 scope.

## Cross-cutting Phase 2 Gates (carry-forward)

- TRADE-01 IO-perspective lockdown: not touched in this plan ✓
- TRADE-02 cycle severance: not touched ✓
- failWith() count ≥ 12: not touched ✓
- EMERGENCY_RATIO_MULTIPLIER = 0: not touched ✓
- staleTime: Infinity: not touched ✓
- svelte-check baseline: 3 errors (all pre-existing in tests/lib/server/rpcMetrics.test.ts) ✓ preserved

## Acceptance Gate Results

- `grep -c "fallback(" src/lib/server/accessCodes.ts` → 2 (≥ 1 ✓)
- `grep -cE "import \{ fallback.*from 'viem'" src/lib/server/accessCodes.ts` → 1 ✓ (note: bare `grep -c` without `-E` and unescaped `$` returns 0 due to shell quoting; the import is verified present at line 2)
- `grep -cE "import \{ networks \} from '\\\$lib/config/networks'" src/lib/server/accessCodes.ts` → 1 ✓
- `grep -c "retryCount: 2"` → 1 ✓
- `grep -c "retryDelay: 200"` → 1 ✓
- `grep -c "rank: false"` → 2 (1 in code + 1 in comment; ≥ 1 satisfied ✓)
- `grep -c "alchemy-base-mainnet"` → 0 ✓ (label fully removed)
- `grep -c "fallback-chain-base"` → 4 (3 OBS-04 sites + 1 comment; ≥ 3 ✓)
- `grep -c "withRetry"` → 0 ✓ (RESEARCH Pitfall 7 mitigated)
- `npm test -- --run accessCodes.test` → 15 passed ✓ (was 11; +4 REL-02)
- Full suite `npm test -- --run` → 553 passed | 1 skipped | 0 failed ✓ (was 549 in 03-06; +4)
- `npm run check` → 3 errors preserved ✓

## Next Phase Readiness

- **Plan 03-08a (SEC-03) unblocked.** The session-cookie flow consumes `verifyWalletSignature` — REL-02 lands first so SEC-03 routes its critical-path through a reliability-hardened verification primitive. Confidence: a single Alchemy hiccup can no longer cascade into all-users-locked-out-of-SEC-03-flow.
- **Wave 5 ✓ COMPLETE** (single-plan wave). Next: Wave 6 (Plan 03-08a SEC-03).
- **Phase 3 progress:** 7/11 plans complete; 7/10 phase REQ-IDs closed (SEC-01 + SEC-02 + SEC-05 + SEC-06 + SEC-07 + REL-01 + REL-02). Remaining: SEC-03 + SEC-04 + REL-03 + Phase 3 RUNBOOK/exit (4 plans).

## Self-Check: PASSED

- [x] `src/lib/server/accessCodes.ts` modified (verified via `git log` da65ced/8252c2d)
- [x] `src/lib/server/accessCodes.test.ts` modified (verified)
- [x] `src/lib/server/referrals.test.ts` modified (verified)
- [x] Commit `da65ced` exists in git log (RED — test additions)
- [x] Commit `8252c2d` exists in git log (GREEN — feat)
- [x] All acceptance grep gates pass
- [x] Full test suite green (553 passed | 1 skipped | 0 failed)
- [x] svelte-check baseline preserved (3 errors)

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
