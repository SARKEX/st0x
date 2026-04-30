---
phase: 03-production-grade-hardening
plan: 06
subsystem: reliability
tags: [phase-3, rel-01, rpc-retry, withretry, latestblock-removal, generator]

# Dependency graph
requires:
  - phase: 01-shrink-the-surface-see-what-s-happening
    provides: "rpcMetrics.ts: recordRpcAttempt + reportChainExhausted (Plan 01-06 / OBS-04 / D-09); alerts.ts: notifyChainExhausted Telegram delivery (Plan 01-06 / D-17)"
  - phase: pre-existing
    provides: "src/lib/utils/retry.ts: withRetry(fn, maxRetries, delayMs) with header-not-found / block-not-found / code -32000 retryable-error matcher"
provides:
  - "callRpc(method, params): Promise<unknown> — throws on chain exhaustion (no longer Promise<unknown | null>); wraps each per-RPC fetch in withRetry(fn, 2, 200)"
  - "fetchOnce(rpcUrl, method, params): Promise<unknown> — exported single-attempt helper that throws on non-ok HTTP, JSON-parse failure, or empty data.result"
  - "getBlockNumberForTimestamp(targetTimestamp): Promise<number> — throws when smallestDiff stayed Infinity (kills silent latestBlock substitution)"
  - "Per-block try/catch inside binary-search loop — single-block lookup miss lets binary search converge on neighbors; function-boundary throw fires only when NO probe succeeded"
affects: [phase-3-wave-5 (Plan 03-07 / REL-02 reuses the same fallback-chain-with-retry pattern in accessCodes.ts:verifyWalletSignature), phase-3-runbook (03-RUNBOOK.md REL-01 smoke test: simulate full chain failure → cron returns 500 + Telegram alert fires), src/routes/api/cron/snapshots/+server.ts:152-160 (existing try/catch now consumes thrown errors as 500 + pino error log)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-RPC retry-then-fall-through pattern: wrap each RPC's fetch in withRetry(fn, 2, 200) inside the per-RPC for-loop; on success return; on failure record + push to attempts and continue to next RPC; throw chain-exhausted Error after the loop. Reusable for REL-02 (Plan 03-07) and any future fallback-chain consumer."
    - "Throw-instead-of-fallback pattern for binary-search probe loops: at function boundary, gate `return closestBlock` behind `smallestDiff !== Infinity`; throw when no probe converged. Cleaner than silent fallback-to-default — surfaces failure to consumer's existing error handling (cron's 500 path)."
    - "Per-block try/catch inside binary-search loop: when the inner RPC call now throws (post-REL-01), wrap the single-block call in try/catch that just continues the search. Lets a transient single-block miss not abort the entire search; the function-boundary throw is the only blanket failure surface."
    - "Empty-result-IS-failure pattern: inside fetchOnce, throw 'empty result' when data.result is null/undefined. Lets withRetry's retryable-error matcher and the per-RPC fall-through both fire; replaces the prior 'success-with-null' semantics that allowed silent garbage-data flow."
    - "setTimeout stub for retry-loop tests: vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => { cb(); return 0 }) keeps wall time bounded across binary-search × retry exponential-backoff; prevents 5s test timeout when each iteration would otherwise sleep 200ms+400ms × 30 probes × 3 RPCs."

key-files:
  created:
    - src/lib/server/snapshots/generator.test.ts
  modified:
    - src/lib/server/snapshots/generator.ts

key-decisions:
  - "Reuse existing withRetry helper (src/lib/utils/retry.ts:5-39) instead of writing a parallel retry — RESEARCH §Pattern 4 explicitly calls for it; the helper already handles the 'header not found' / 'block not found' / code -32000 retryable-error patterns common to load-balanced RPCs. Wrapping per-RPC fetches in withRetry(fn, 2, 200) gives 2 attempts × 200ms exponential base = ~600ms per-RPC worst case; 6 RPCs × ~600ms = ~3.6s per callRpc; cron does ~30 calls per snapshot → ~108s vs maxDuration: 800. Comfortable margin (RESEARCH lines 485-490)."
  - "Throw on chain exhaustion (RESEARCH §What replaces silent latestBlock Option A) instead of returning null + alerting. Cron's existing try/catch at src/routes/api/cron/snapshots/+server.ts:152-160 already wraps the entire pipeline in try/catch + 500 + pino error log; adding the throw makes the existing handler the visible failure surface instead of letting null flow downstream into garbage snapshot data. Telegram alert path (Plan 01-06 / D-17) preserved unchanged via reportChainExhausted call."
  - "Throw on smallestDiff === Infinity in getBlockNumberForTimestamp at the FUNCTION BOUNDARY (post-loop), with per-block try/catch INSIDE the loop. Two-layer pattern: a single-block lookup miss doesn't abort the search (try/catch inside the loop catches the per-block callRpc throw and continues); the function-boundary check fires only when NO probe ever converged. This preserves the binary search's resilience to single-block transient failures while killing the silent latestBlock fallback for the catastrophic case."
  - "Export callRpc + fetchOnce for unit-test addressability — RESEARCH §Pattern 4 code blocks call for it; matches the public-API testability pattern. The alternative (test only through getBlockNumberForTimestamp's public surface) was rejected because Tests 1-4 want to assert per-attempt OBS-04 instrumentation and that requires direct callRpc access."
  - "OBS-04 per-attempt granularity preserved at the PER-RPC level, not the per-retry-attempt level. recordRpcAttempt fires once per RPC (success OR failure summary); withRetry's inner retries are wall-time work the operator sees via dashboard latency. This matches the prior Phase 1 OBS-04 log volume baseline — operator dashboards aren't flooded by 2x more lines per request. Plan body Test 2 asserts this explicitly: header-not-found-then-success records exactly 1 ok=true line for RPC #1."
  - "Empty result (data.result === null OR undefined) is failure inside fetchOnce. The prior Phase 1 behavior treated empty as 'success-with-null and continue to next RPC'; that allowed every RPC returning empty to result in null bubbling out to callers. Post-fix, empty triggers withRetry (retryable error matching is on error.message inclusion, so empty-result errors won't actually retry — they fall through to the next RPC, which is conservative and correct: empty isn't a transient single-attempt issue, it's a per-RPC issue)."

patterns-established:
  - "callRpc-throws-on-exhaustion: Phase-3 / REL-01 invariant — any consumer of fallback-chain RPC helpers in the snapshot subsystem (and post-REL-02, the signature-verification subsystem) treats null returns as impossible. The throw is the failure surface; existing try/catches at endpoint boundaries become the visible failure surface."
  - "withRetry-around-fetchOnce: the canonical shape for adding retry to a fallback-chain consumer. REL-02 (Plan 03-07) inherits this — replace the single basePublicClient http() Transport with a viem fallback Transport that retries per-RPC then falls through, modeled on this pattern."
  - "Function-boundary-throw-not-silent-fallback: the canonical pattern for binary-search and similar probe loops. When the search initialization seeds a default value, gate the return on a 'did any iteration succeed' invariant; throw when no iteration succeeded. Prevents the seed value from ever flowing out as a real result."

requirements-completed: [REL-01]

# Metrics
duration: 26min
completed: 2026-04-30
---

# Phase 3 Plan 06: REL-01 callRpc Retry + Kill Silent latestBlock Fallback Summary

**Per-RPC withRetry(fn, 2, 200) wrapping + chain-exhaustion throw + getBlockNumberForTimestamp throw on smallestDiff===Infinity — kills the silent failure mode that let cron snapshots use the wrong block on bad days.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-04-30T09:40:32Z
- **Completed:** 2026-04-30T10:06:45Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 1
- **Files created:** 1

## Accomplishments

- REL-01 closed — both halves shipped in atomic TDD commits (RED test + GREEN refactor).
- `callRpc` signature changed from `Promise<unknown | null>` to `Promise<unknown>`; per-RPC fetch wrapped in `withRetry(() => fetchOnce(rpcUrl, method, params), 2, 200)` — 2 attempts with 200ms exponential base before falling through to next RPC.
- New `fetchOnce(rpcUrl, method, params)` helper: throws on non-ok HTTP, JSON-parse failure, or empty `data.result` (REL-01: empty IS failure — replaces prior Phase 1 "success-with-null and continue" semantics).
- `callRpc` throws `Error("callRpc(${method}) — all ${RPC_URLS.length} RPCs exhausted (with retry)")` on chain exhaustion; `reportChainExhausted` fires once per exhaustion (Telegram alert via Plan 01-06 / D-17 surface unchanged).
- `getBlockNumberForTimestamp` throws when `smallestDiff` stayed `Infinity` instead of silently returning the `latestBlock`-derived `closestBlock`. Per-block try/catch inside the binary-search loop lets a single-block lookup miss converge on neighbors; function-boundary throw fires only when NO probe ever succeeded.
- Cron's existing try/catch at `src/routes/api/cron/snapshots/+server.ts:152-160` consumes thrown errors as 500 response + pino error log — the visible failure surface is now the existing endpoint catch, not silent garbage-data flow.
- OBS-04 per-attempt granularity preserved verbatim: `recordRpcAttempt` fires once per RPC (success OR failure summary); withRetry's inner retries are wall-time work the operator sees via dashboard latency — no log-volume regression.

## Task Commits

Each task committed atomically per TDD discipline:

1. **Task 1 RED:** `f9292f2` — `test(03-06): add Wave 0 generator.test.ts pinning REL-01 retry + throw behavior` (7 failing tests pinning post-fix shape)
2. **Task 1 GREEN:** `9319839` — `feat(03-06): REL-01 callRpc per-RPC retry + throw on chain exhaustion` (refactor + test passes)

## Files Created/Modified

- `src/lib/server/snapshots/generator.test.ts` — NEW. 7 unit tests covering retry, fall-through, exhaustion throw, empty-result handling, getBlockNumberForTimestamp throw, structural invariant, and end-to-end caller throw-propagation.
- `src/lib/server/snapshots/generator.ts` — MODIFIED. New `fetchOnce` export; refactored `callRpc` (signature change + withRetry wrap + throw on exhaustion); refactored `getBlockNumberForTimestamp` (per-block try/catch + function-boundary throw + `import { withRetry } from '$lib/utils/retry'`).

## Decisions Made

- **Reuse existing withRetry helper.** RESEARCH §Pattern 4 mandates reuse of `src/lib/utils/retry.ts:5-39` over writing a parallel retry. The helper already handles the 'header not found' / 'block not found' / code -32000 retryable-error patterns common to load-balanced RPCs.
- **Throw on chain exhaustion (Option A).** RESEARCH §"What replaces the silent latestBlock fallback" Option A — throw, instead of returning null + alerting. Cron's existing try/catch at lines 152-160 already wraps the entire pipeline; adding the throw makes the existing handler the visible failure surface instead of letting null flow downstream into garbage snapshot data.
- **Throw at function boundary, not inside the binary-search loop.** Two-layer pattern: per-block try/catch inside the loop preserves resilience to single-block transient failures (the search converges on neighbors); function-boundary `if (smallestDiff === Infinity) throw` fires only for the catastrophic "no probe succeeded" case.
- **Export callRpc + fetchOnce for testability.** RESEARCH §Pattern 4 code blocks call for it. Tests 1-4 assert per-attempt OBS-04 instrumentation, which requires direct callRpc access; testing only through getBlockNumberForTimestamp's public surface would couple the test to the binary-search shape.
- **OBS-04 granularity at per-RPC level, not per-retry level.** `recordRpcAttempt` fires once per RPC (success OR failure summary); withRetry's inner retries don't emit additional log lines. This matches the prior Phase 1 baseline log volume — operator dashboards aren't flooded by 2x more lines per request.
- **Empty result is failure inside fetchOnce.** Replaces prior Phase 1 "success-with-null and continue to next RPC" semantics that allowed every RPC returning empty to bubble null to callers. Post-fix: empty throws → withRetry's retryable-error matcher inspects (won't match 'empty result' string so no retry, falls through to next RPC) → conservative behavior matching the per-RPC nature of empty responses.

## Deviations from Plan

None - plan executed exactly as written.

The plan body specified the RED → GREEN cycle, the file shapes, the test coverage, and all acceptance criteria. The only minor adjustment was Test 6's source-path resolution in jsdom: `import.meta.url` returns a non-file URL in vitest+jsdom, so the test reads the file via `path.resolve(process.cwd(), 'src/lib/server/snapshots/generator.ts')` instead of the originally-sketched `fileURLToPath(new URL('./generator.ts', import.meta.url))`. Same effect, jsdom-compatible.

Tests 5 and 7 also gained a `vi.spyOn(globalThis, 'setTimeout')` stub to keep wall time bounded across binary-search × retry exponential-backoff; without the stub each test would block on real `setTimeout` calls (200ms + 400ms per RPC, × 3 RPCs, × 30 binary-search iterations ≈ 60s+ wall time). This is a pure test-infrastructure addition, not a behavioral change to the generator code.

## Issues Encountered

- **Initial test 6 failure on jsdom:** `import.meta.url` returns a `vitest://` URL in jsdom, not a `file://` URL — `fileURLToPath()` rejected it with `ERR_INVALID_URL_SCHEME`. Resolved by reading the file via `path.resolve(process.cwd(), ...)` instead. ~30 seconds of investigation.
- **Initial tests 5 + 7 timeouts at 5s:** the binary-search × retry exponential-backoff would take ~60s wall time without setTimeout stubbing. Resolved by adding `vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => { cb(); return 0 })` per-test. ~1 minute of investigation.
- **svelte-check picked up 3 new errors in the test file** (`@ts-expect-error` unused, two setTimeout signature mismatches, two tuple-index errors). Resolved by replacing `// @ts-expect-error` with a cast, casting the setTimeout impl through `unknown as typeof setTimeout`, and casting `mock.calls.every((call: unknown[]) => ...)` to handle the empty-tuple inferred type. ~2 minutes.

All issues were test-infrastructure issues; the production code (generator.ts) compiled and tested correctly on first pass.

## Verification Evidence

- **All 7 generator.test.ts tests pass:** RED phase had 7/7 fail; GREEN phase has 7/7 pass (verified pre-commit).
- **svelte-check baseline preserved:** 3 errors (all pre-existing in `tests/lib/server/rpcMetrics.test.ts` — unchanged from Plan 03-05 baseline).
- **Full test suite:** 549 passed | 1 skipped (was 542+1 in Plan 03-05; +7 new tests from generator.test.ts; no regressions).
- **Acceptance grep gates (all green):**
  - `grep -c "import { withRetry }" generator.ts` = 1 ✓
  - `grep -c "withRetry" generator.ts` = 7 ✓ (≥1 required)
  - `grep -c "all .* RPCs exhausted" generator.ts` = 1 ✓
  - `grep -c "no block lookup succeeded" generator.ts` = 1 ✓
  - `grep -c "fetchOnce" generator.ts` = 4 ✓ (≥2 required)
  - `grep -c "recordRpcAttempt" generator.ts` = 4 ✓ (≥2 required for OBS-04 carry-forward)
  - `grep -c "reportChainExhausted" generator.ts` = 2 ✓ (≥1 required)
- **Caller migration grep:** `grep -rE '=== null|!= null' src/lib/server/snapshots/ | grep -v '\.test\.' | grep -v 'data.result'` returns 0 hits — no surviving callers branch on null from callRpc. (The single `=== null` match in `data.result === null` is inside fetchOnce's own empty-result detection, not a callRpc consumer; explicitly excluded by the plan's spirit.)
- **Cross-cutting Phase 2 gates:** all green.
  - failWith count in marketOrderExecution.ts = 19 (≥12 required) ✓
  - EMERGENCY_RATIO_MULTIPLIER absent from src/ ✓
  - marketOrderExecution.ts does NOT import from `$lib/stores/transaction` (TRADE-02 cycle severance) ✓
- **Cron consumer compatibility:** `src/routes/api/cron/snapshots/+server.ts:152-160` already wraps the cron pipeline in try/catch with 500 + pino error log; the new `getBlockNumberForTimestamp` throw + `callRpc` throw consume cleanly through this surface. No cron changes needed.
- **No accidental file deletions:** `git diff --diff-filter=D --name-only HEAD~2 HEAD` empty for both task commits.

## User Setup Required

None - no external service configuration required. The Telegram alert path was provisioned in Phase 1 (`OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` + `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`); REL-01 reuses it unchanged via `reportChainExhausted` → `notifyChainExhausted`.

## Next Phase Readiness

**Wave 4 of Phase 3 complete.** Plan 03-07 (REL-02 — EIP-1271/6492 verification on the fallback chain) is unblocked.

**Hand-off to Plan 03-07 (REL-02):** REL-02 inherits this plan's per-RPC-retry-then-fall-through pattern. Specifically:
- `accessCodes.ts:8-11` `basePublicClient` definition gets replaced with a viem fallback Transport that iterates the same `RPC_URLS` list `generator.ts` uses, with the same `withRetry` wrap.
- `accessCodes.ts:64-85` `verifyWalletSignature` continues to log per-attempt via `recordRpcAttempt`; chain exhaustion fires `reportChainExhausted`.
- The `'alchemy-base-mainnet'` synthetic label at lines 92, 103, 113 gets replaced with the real `rpc_url` value, OR preserved for log-search-stability — REL-02 picks at planning time.

**Audit finding closed:** CONCERNS.md §"RPC fallback chain in generator.ts — fail-silent on all RPCs failing" — both halves addressed:
1. Empty result + chain exhaustion no longer silently return null (callRpc throws).
2. `getBlockNumberForTimestamp` no longer silently substitutes `latestBlock` (function-boundary throw fires when no probe converged).

## Threat Flags

None. The plan's `<threat_model>` enumerated 6 STRIDE entries; all 'mitigate' dispositions implemented as written. T-03-REL-01-04 (Information Disclosure: RPC URL in error message includes API key) is partially mitigated by SEC-01 (Plan 03-01) which moved URLs to env vars; the residual risk (env-var-driven URLs may still contain Alchemy paths post-rotation) is accepted per Phase 1 D-07 + Plan 01-06 trust pattern. No new surface introduced.

## Self-Check: PASSED

**Files exist:**
- `/Users/alastairong/st0x/st0x/.planning/phases/phase-03-production-grade-hardening/03-06-SUMMARY.md` ✓ (this file)
- `/Users/alastairong/st0x/st0x/src/lib/server/snapshots/generator.ts` ✓ (modified — withRetry wrap + throw on exhaustion + getBlockNumberForTimestamp throw)
- `/Users/alastairong/st0x/st0x/src/lib/server/snapshots/generator.test.ts` ✓ (NEW — 7 unit tests)

**Commits exist:**
- `f9292f2` ✓ (Task 1 RED: test(03-06): add Wave 0 generator.test.ts pinning REL-01 retry + throw behavior)
- `9319839` ✓ (Task 1 GREEN: feat(03-06): REL-01 callRpc per-RPC retry + throw on chain exhaustion)

---
*Phase: 03-production-grade-hardening*
*Completed: 2026-04-30*
