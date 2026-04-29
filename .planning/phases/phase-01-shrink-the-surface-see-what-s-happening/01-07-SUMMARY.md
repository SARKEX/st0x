---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 07
subsystem: observability
tags: [obs-03, take-order, sentry, dual-sink, transcript, marketOrderExecution, failure-capture, sha-256, async-local-storage]

# Dependency graph
requires: [01-04, 01-05]
provides:
  - "src/lib/services/observability/captureTakeOrderFailure.ts NEW — TakeOrderTranscript interface (D-08 shape) + TakeOrderFailureReason union + captureTakeOrderFailure dual-sink dispatcher"
  - "Browser-tier dual-sink dispatcher per CONTEXT D-15: Sentry.captureException with {tags: {failure_reason, side}, extra: transcript} + console.error('[take-order failed]', JSON.stringify(...))"
  - "9 OBS-03 failure-return paths in src/lib/services/marketOrderExecution.ts wrapped via failWith(reason, errOrMessage, userFacingError) helper closing over a transcript built at function entry"
  - "transcript.subgraphQuoteHash populated via crypto.subtle.digest('SHA-256', JSON.stringify(externalQuotes)) — hex-encoded with 0x prefix per checker W2 (field non-null when emitted)"
  - "transcript.onChainStateRead.IOIndex.{input,output} populated from firstQuote.{inputIOIndex,outputIOIndex} per checker W3 (no new on-chain read needed)"
  - "transcript.onChainStateRead.vaultBalance stays null in Phase 1 (D-08-LIMITATION → Phase 2 / TRADE-03 freshness-illusion fix)"
  - "vitest-setup.ts: @sentry/sveltekit mocked to no-op stubs for test env (Rule 3 — Sentry's browser entry transitively imports $app/stores from inside node_modules; Vite resolver cannot reach SvelteKit virtual modules in node_modules)"
  - "ProcessedQuote re-exported from $lib/services/marketOrderExecution so observability helpers can consume the shape without reaching through to $lib/api/orders"
affects: [01-08, "Phase 2 / TRADE-03", "Phase 2 / TRADE-04"]

# Tech tracking
tech-stack:
  added: []  # No new npm dependencies — uses @sentry/sveltekit installed by Plan 01-04
  patterns:
    - "Two-task split (NEW helper module → MOD service-tier instrumentation): the helper module lands first (Task 1) so the consumer can import its types without forward references; the seam wires in second (Task 2). svelte-check at 4-pre-existing-error baseline at every commit."
    - "Single-seam transcript-builder pattern: transcript built at function entry, mutated forward as data becomes available, dispatched on every error-return path via a closure-capturing failWith helper. Replaces the miss-able per-branch wrapping pattern; new failure paths added later cannot accidentally bypass capture without explicitly returning a non-failWith error object."
    - "Phase fence enforced via verbatim error-string preservation: every removed `return { success: false, error: '...' }` reappears as the third arg to failWith with the SAME string. git diff verifies no UX change. Phase 2 / TRADE-04 owns any UX refactor."
    - "Browser-tier dual-sink (Sentry + console.error JSON line) per CONTEXT D-15 — NOT a server-relayed endpoint. PostHog session replay + Vercel browser-console capture provide long-term searchability without an extra endpoint or extra network call per failure. Sentry's beforeSend (Plan 01-04) handles PII scrubbing recursively."
    - "Crypto-subtle SHA-256 for content-hash addressing of the quote payload: stable identifier across multiple failure events with the same input set; O(1) integrity check + dedupe vector in addition to the full payload itself. Browser-only (crypto.subtle is available in jsdom + browsers; this module is client-side)."

key-files:
  created:
    - "src/lib/services/observability/captureTakeOrderFailure.ts (101 lines — TakeOrderTranscript interface, TakeOrderFailureReason union, captureTakeOrderFailure dual-sink dispatcher; both sinks wrapped in try/catch — logging never throws back into caller per project convention)"
  modified:
    - "src/lib/services/marketOrderExecution.ts (+154 -21): re-exports ProcessedQuote (one-line export); imports captureTakeOrderFailure + types; transcript built at function entry; failWith helper at every error-return path; 9 paths wrapped, 1 path EXCLUDED (Wallet not connected — not a no-liquidity scenario per RESEARCH §OBS-03)"
    - "vitest-setup.ts (+27): vi.mock('@sentry/sveltekit', ...) added (Rule 3 fix — Sentry browser entry transitively imports $app/stores from inside node_modules; Vite resolver cannot reach SvelteKit virtual modules in node_modules in test env). Production unaffected — Sentry init in hooks.{client,server}.ts is gated on !dev && DSN."

key-decisions:
  - "Two-task split (vs three-task) chosen because the new helper module + the marketOrderExecution wiring are tightly coupled (same plan owner, same file scope). svelte-check stays green at every commit. No need for a deliberate mid-flight broken state as 01-04..06 used."
  - "Single-seam transcript-builder pattern adopted (RESEARCH §Pattern 3 line 530): transcript built at function entry, closure-captured by failWith, mutated forward as data becomes available. Replaces the miss-able per-branch wrapping. New failure paths added in future cannot accidentally bypass capture without explicitly returning a non-failWith error object."
  - "ProcessedQuote re-exported from marketOrderExecution.ts (one-line `export type { ProcessedQuote }`). Plan Task 1 notes outlined two options: (a) re-export, (b) inline shape. Picked (a) per the plan's recommendation — single-line addition; no behavior change; keeps the observability helper's import path matching what the plan specified."
  - "`failWith(reason, errOrMessage, userFacingError)` 3-arg signature: the second arg accepts a synthetic `new Error(...)` for control-flow returns AND the actual exception object for the catch block. The third arg preserves the existing user-facing error string verbatim. Phase 1 fence: NO refactor of execution semantics; NO change to UX strings."
  - "transcript.onChainStateRead populated AFTER `firstQuote` is computed but BEFORE the `firstQuote.orderData/sgOrder` validity check — so even an unhydrated_fills failure transcript carries orderHash + IOIndex (those fields are populated unconditionally by convertApiOrderToProcessedQuote in src/lib/api/orders.ts even when orderData is missing). Earlier-stage failure transcripts (no_quotes_available, no_walk_fills, the two caught_exception sites in the ratio computation) legitimately have null IOIndex because firstQuote isn't valid yet."
  - "vaultBalance stays null in Phase 1 — populating it would require introducing a new on-chain getVaultBalance() RPC call at submission time, which is exactly the freshness-illusion fix scoped for Phase 2 / TRADE-03. The fullQuotePayload + Sentry stack + IOIndex.* + orderHash provide sufficient replay context for Phase 1's debugging needs. D-08-LIMITATION is documented in three inline comments + the SUMMARY frontmatter."
  - "Mock @sentry/sveltekit in vitest-setup.ts (Rule 3 fix). The @sentry/sveltekit browser entry transitively imports `from '$app/stores'`; Vite's test-mode resolver cannot resolve SvelteKit virtual modules from inside node_modules (only the SvelteKit Vite plugin produces those, and it doesn't process node_modules). The mock provides no-op stubs for init/captureException/sentryHandle/handleErrorWithSentry/sentrySvelteKit; tests now load the new transitive Sentry import without crashing. Production Sentry init is unaffected — the mock only applies under Vitest's process. Same trust boundary as the existing svelte-wagmi + $app/stores mocks already in vitest-setup.ts."
  - "Both sinks wrapped in try/catch. Sentry SDK glitches OR JSON serialization edge cases (e.g., a circular reference in the quote payload) MUST NOT crash the trade UI. Project convention from src/lib/utils/monitoring.ts and src/lib/server/auditLog.ts: logging never throws back into the caller."

patterns-established:
  - "Single-seam transcript-builder: build context at function entry → closure-capture into a failWith helper → every error-return path routes through failWith. Reusable for future server-side capture seams (e.g., a server-relayed take-order path if/when it is introduced — uses pino instead of Sentry+console per D-15)."
  - "Re-export source-of-truth types from the service module so observability helpers don't reach into deeper layers (api/utils): keeps the import graph layered."
  - "Module-tag conventions for browser-tier observability: `[take-order failed]` for the data line, `[captureTakeOrderFailure]` for internal helper errors. Mirrors the `[monitor]` / `[hooks.server]` / `[hooks.client]` patterns established by 01-04..06."
  - "Test-env Sentry SDK mocking pattern: when a runtime module transitively pulls in `@sentry/sveltekit` browser entry, mock the SDK to no-op stubs in vitest-setup.ts. Avoids per-test mocks; production behavior unaffected because Sentry init is environmentally gated."

requirements-completed: [OBS-03]

# Metrics
duration: 17min
completed: 2026-04-29
---

# Phase 1 Plan 07: OBS-03 take-order failure transcripts (single-seam transcript-builder + dual-sink dispatcher)

**Wired a single-seam transcript-builder + `failWith` helper into `executeMarketOrder` so all 9 OBS-03 failure-return paths emit a complete take-order failure transcript through Sentry (`captureException` with tags + extra) AND a `console.error('[take-order failed]', JSON.stringify(...))` JSON line — D-15 browser-tier dual-sink with NO server-relayed endpoint. PII scrubbing handled by Plan 01-04's `beforeSend` hook (no extra scrubbing in capture site). `subgraphQuoteHash` populated via `crypto.subtle.digest('SHA-256', ...)`; `IOIndex.{input,output}` populated from `firstQuote` (no new on-chain read); `vaultBalance` stays null in Phase 1 (Phase 2 / TRADE-03 territory). User-facing error strings preserved verbatim — Phase 1 does NOT refactor execution.**

## Performance

- **Duration:** ~17 min (2 atomic commits + 1 final docs commit)
- **Started:** 2026-04-29T12:52:00Z
- **Completed:** 2026-04-29T13:09:35Z
- **Tasks:** 2 of 2 (all atomic, all committed)
- **Files modified:** 2 modified + 1 created (3 total touched)
- **Commits:** 2 task commits + 1 docs commit (Task 1: 505e343, Task 2: 58f8e97; final docs commit follows this SUMMARY.md and STATE/ROADMAP/REQUIREMENTS updates)

## Accomplishments

- **src/lib/services/observability/captureTakeOrderFailure.ts (NEW, 101 lines).** Module-top JSDoc explains the OBS-03 contract, browser-tier dual-sink rationale (D-15), PII scrubbing handoff to Plan 01-04's beforeSend, and the D-08-LIMITATION on vaultBalance. Exports: `captureTakeOrderFailure(err, transcript, reason)`, `TakeOrderTranscript` interface (D-08 shape), `TakeOrderFailureReason` union (5 reasons). Sink 1: `Sentry.captureException(err, { tags: { failure_reason, side }, extra: { ...transcript, errorMessage } })`. Sink 2: `console.error('[take-order failed]', JSON.stringify({ ts, reason, ...transcript, error: errorMessage }))`. Both sinks wrapped in try/catch — logging never throws back into caller (project convention).
- **src/lib/services/marketOrderExecution.ts (MOD).** Transcript built at function entry of `executeMarketOrder` with all D-08-locked fields initialized (subgraphQuoteHash null, fullQuotePayload `quotes ?? []`, onChainStateRead all null, ratio null, slippageBps from input, priceCap null, side derived from orderSide, takerAction/userAction = orderSide, mode derived from orderSide+inputMode, walletAddress null, request_id null, timestamp = now ISO). The transcript is mutated forward as data becomes available: walletAddress after getSignerAddress, fullQuotePayload + subgraphQuoteHash after excludeTakerOwnedQuotes, ratio after worstFill check, priceCap after priceCapStrForSdk computation, onChainStateRead.{orderHash,IOIndex.input,IOIndex.output} after firstQuote is identified.
- **subgraphQuoteHash via SHA-256.** `await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(externalQuotes)))` → `Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')` with `0x` prefix → hex-encoded 64-char hash. Wrapped in try/catch with null fallback so a missing `crypto.subtle` (shouldn't happen in supported browsers) cannot break the trade UI.
- **failWith single-seam helper (3-arg: reason, errOrMessage, userFacingError).** Closure-captures the transcript object, calls `captureTakeOrderFailure(errOrMessage, transcript, reason)`, returns the existing `{ success: false, error: userFacingError }` shape. Used at every error-return path. The errOrMessage second arg accepts either a real exception (catch block) or a synthetic `new Error(...)` for control-flow returns where no exception was thrown (Sentry needs an Error-shaped object for stack-trace context).
- **9 failure-return paths wrapped (8 from orchestrator's table + 1 the orchestrator's table missed — `indexedFills.length === 0` in the fallback path; surfaced as a deviation below).** Per-reason coverage: `no_quotes_available` x1 (externalQuotes empty), `no_walk_fills` x1 (walkResult empty), `unhydrated_fills` x1 (firstQuote.orderData/sgOrder missing after hydration), `aggregated_failed` x3 (indexedFills empty in fallback + TransactionStatus.ERROR + terminal fall-through), `caught_exception` x3 (worstFill ratio missing + emergencyRatioHex null + outer try/catch). Total: 9 `failWith(` call sites + 2 helper-definition references = 11 total `failWith` mentions.
- **Wallet-not-connected return path EXCLUDED per RESEARCH §OBS-03 + plan instruction.** This branch fires when the user disconnects the wallet mid-trade — it's a session-state issue, not a no-liquidity scenario, so capturing it would pollute the OBS-03 channel.
- **User-facing error strings preserved verbatim.** Each removed `return { success: false, error: '...' }` reappears as the third arg to `failWith` with the SAME string. Verified by `grep -nE "'No external orders|'No orders available|'Unable to calculate|'Unable to prepare|'Order failed'|'Order did not complete|'Unknown error occurred"` — all 8 distinct strings present at call sites. Phase 2 / TRADE-04 owns any UX refactor of these messages.
- **ProcessedQuote re-exported from marketOrderExecution.** Single-line addition: `export type { ProcessedQuote };` after the existing `import { type ProcessedQuote, ... }`. Lets the observability helper import the type from the service module without reaching through to `$lib/api/orders`. Zero runtime cost (type-only export); zero behavior change.
- **vitest-setup.ts: @sentry/sveltekit mocked.** New transitive import via `marketOrderExecution → captureTakeOrderFailure → @sentry/sveltekit` broke `tests/lib/services/marketOrderExecution.test.ts` because the SDK's browser entry imports `from '$app/stores'` from inside node_modules — Vite's test-mode resolver cannot reach SvelteKit virtual modules from there. Rule 3 fix: mock the SDK to no-op stubs (init, captureException, captureMessage, addBreadcrumb, setUser, setTag, setContext, setExtra, withScope, sentryHandle, handleErrorWithSentry, sentrySvelteKit). Production unaffected — Sentry init in hooks.{client,server}.ts is gated on `!dev && DSN`.
- **svelte-check unchanged.** Reports only the 4 pre-existing transaction.ts errors (lines 664, 686, 708, 2346 — Phase 2 / TRADE-01..04 work, deferred). Zero new errors introduced.
- **Test suite: 447 passed / 1 skipped.** Same baseline as 01-06; no regressions across 25 test files.
- **Vite build phase succeeds (`✓ built in 15.65s`).** Post-Vite Vercel adapt step fails on local Node v24 — pre-existing environmental issue documented in 01-04-SUMMARY (adapter-vercel requires Node 18/20/22; Vercel CI runs Node 22 by default).

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Create captureTakeOrderFailure.ts dual-sink dispatcher (OBS-03 / D-08 / D-15)** — `505e343` (feat)
   - NEW `src/lib/services/observability/captureTakeOrderFailure.ts` (101 lines): TakeOrderTranscript interface, TakeOrderFailureReason union, captureTakeOrderFailure dispatcher
   - MOD `src/lib/services/marketOrderExecution.ts`: re-export `ProcessedQuote` (one-line addition)
   - Verification: svelte-check at 4-pre-existing-error baseline (0 new errors)

2. **Task 2: Wire OBS-03 transcript-builder + failWith into marketOrderExecution + vitest mock** — `58f8e97` (feat)
   - MOD `src/lib/services/marketOrderExecution.ts`: imports + transcript builder + failWith helper + 9 wrapped failure paths + subgraphQuoteHash via SHA-256 + onChainStateRead population from firstQuote
   - MOD `vitest-setup.ts`: @sentry/sveltekit no-op mock (Rule 3 fix)
   - Verification: svelte-check at baseline; 447/1-skipped tests pass; Vite build clean

(Final docs/metadata commit follows this SUMMARY.md and STATE.md / ROADMAP.md / REQUIREMENTS.md updates.)

## Files Created/Modified

**New (1):**
- `src/lib/services/observability/captureTakeOrderFailure.ts` (101 lines — TakeOrderTranscript interface; TakeOrderFailureReason union; captureTakeOrderFailure dual-sink dispatcher with both sinks wrapped in try/catch)

**Modified (2):**
- `src/lib/services/marketOrderExecution.ts` (+154 −21): re-export ProcessedQuote (1 line); import captureTakeOrderFailure + 2 types (5 lines); transcript builder at function entry (24 lines); failWith helper definition (10 lines); subgraphQuoteHash SHA-256 computation (15 lines); onChainStateRead population from firstQuote (10 lines); 9 failure-return paths converted from `{ success: false, error: ... }` to `failWith(reason, errOrMessage, userFacingError)` (control-flow restructured but error strings preserved verbatim)
- `vitest-setup.ts` (+27): `vi.mock('@sentry/sveltekit', ...)` — no-op stubs for init/captureException/captureMessage/addBreadcrumb/setUser/setTag/setContext/setExtra/withScope/sentryHandle/handleErrorWithSentry/sentrySvelteKit. Same pattern as the existing svelte-wagmi + $app/stores mocks.

## Decisions Made

- **Two-task split chosen.** Plans 01-04..06 used three-task splits to keep svelte-check green at every intermediate commit (sometimes with intentional mid-flight broken state). For 01-07, the helper module + the wiring are tightly coupled and live in the same plan scope; splitting further didn't add safety. Each task's verification (svelte-check, tests, build) ran cleanly.
- **Single-seam transcript-builder pattern (RESEARCH §Pattern 3).** Per CONTEXT D-08 + plan must_haves: the transcript is built at function entry, mutated forward, and dispatched on every error-return path via a closure-capturing `failWith` helper. Replaces the miss-able per-branch wrapping pattern. New failure paths added later in Phase 2 / TRADE-04 cannot accidentally bypass capture without explicitly returning a non-`failWith` error object — a clear convention violation that future code review will flag.
- **`failWith(reason, errOrMessage, userFacingError)` 3-arg signature.** Second arg accepts both real exceptions (catch block) AND synthetic `new Error('...')` for control-flow returns. Sentry needs an Error-shaped object for proper stack-trace context; synthetic errors at control-flow sites give Sentry a meaningful "where did this fire" frame even when no exception was thrown. Third arg preserves the existing user-facing error string verbatim — Phase 1 fence enforced mechanically.
- **Re-export ProcessedQuote from marketOrderExecution (vs inline shape).** Plan Task 1 notes outlined two options; chose re-export per the plan's recommendation. One-line addition; no behavior change; keeps the observability helper's import path matching what the plan specified.
- **transcript.onChainStateRead populated AFTER `firstQuote` is identified but BEFORE the `firstQuote.orderData/sgOrder` validity gate.** Reason: `orderHash`, `inputIOIndex`, `outputIOIndex` are populated unconditionally by `convertApiOrderToProcessedQuote` (src/lib/api/orders.ts:104, 144, 145) regardless of whether the order has been hydrated with full `orderData`/`sgOrder`. So an `unhydrated_fills` failure transcript still carries those fields. Earlier-stage failures (no_quotes_available, no_walk_fills, the two `caught_exception` sites in the ratio computation) legitimately have null IOIndex because `firstQuote` isn't valid yet.
- **vaultBalance stays null in Phase 1 (D-08-LIMITATION).** Populating it would require a new on-chain `getVaultBalance()` call at submission time — exactly the freshness-illusion fix scoped for Phase 2 / TRADE-03. The fullQuotePayload + Sentry stack + IOIndex.* + orderHash provide sufficient replay context for Phase 1's debugging needs. Documented in three inline comments (transcript builder JSDoc, transcript builder field comment, post-firstQuote populating comment) + the SUMMARY frontmatter.
- **Mock @sentry/sveltekit globally in vitest-setup.ts (Rule 3 fix).** The new transitive Sentry import broke an existing test (`tests/lib/services/marketOrderExecution.test.ts`) because the Sentry browser entry imports `from '$app/stores'` from inside node_modules, and Vite's test-mode resolver cannot reach SvelteKit virtual modules from there. The cleanest fix is a no-op mock in the global setup (same trust pattern as the existing svelte-wagmi + $app/stores mocks). Production Sentry init in hooks.{client,server}.ts is environmentally gated on `!dev && DSN`, so the mock only applies under Vitest. No other tests touched.
- **Both sinks wrapped in try/catch.** Sentry SDK glitches OR JSON serialization edge cases (e.g., a hypothetical circular reference in the quote payload) MUST NOT crash the trade UI. Project convention from `src/lib/utils/monitoring.ts:43` and `src/lib/server/auditLog.ts`: logging never throws back into the caller. The catch handlers fall back to `console.error` so the failure is at minimum visible somewhere.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Mock @sentry/sveltekit in vitest-setup.ts**
- **Found during:** Task 2, post-edit `npm test -- --run`
- **Issue:** After wiring `import { captureTakeOrderFailure, ... } from '$lib/services/observability/captureTakeOrderFailure'` into marketOrderExecution.ts, the existing test at `tests/lib/services/marketOrderExecution.test.ts` (which only uses `excludeTakerOwnedQuotes` — a pure function) failed with `Error: Cannot find package '$app' imported from /node_modules/@sentry/sveltekit/build/esm/client/browserTracingIntegration.js`. The Sentry browser entry transitively imports `from '$app/stores'`, and Vite's test-mode resolver cannot reach SvelteKit virtual modules from inside node_modules.
- **Fix:** Added `vi.mock('@sentry/sveltekit', ...)` to `vitest-setup.ts` returning no-op stubs for the SDK surface (init, captureException, captureMessage, addBreadcrumb, setUser, setTag, setContext, setExtra, withScope, sentryHandle, handleErrorWithSentry, sentrySvelteKit). Same trust pattern as the existing `vi.mock('svelte-wagmi', ...)` + `vi.mock('$app/stores', ...)` mocks already in vitest-setup.ts.
- **Files modified:** `vitest-setup.ts` (+27 lines)
- **Verification:** `npm test -- --run` returns 447 passed / 1 skipped — same baseline as 01-06 (was 446 + 1 broken test before this fix). Production unaffected because Sentry init in `hooks.{client,server}.ts` is gated on `!dev && DSN` and the mock only applies under Vitest's process.
- **Committed in:** `58f8e97` (Task 2 commit, alongside the marketOrderExecution.ts changes)

### Discrepancies vs the orchestrator's line-drift table

The orchestrator's pre-flight enumeration listed 8 failure-return paths to wrap (excluding the Wallet-not-connected branch). Re-discovering from the current source surfaced **9 INCLUDE paths**, not 8 — the orchestrator's table missed the `indexedFills.length === 0` branch in the per-order fallback path (lines 339-344 of the current source).

**Per-reason breakdown actually wrapped (matches plan acceptance: ≥1, ≥1, ≥1, ≥2, ≥3 = 8 minimum; 9 actual):**

| # | Source line | Reason label | User-facing error string (verbatim) |
|---|---|---|---|
| 1 | 218-222 | `no_quotes_available` | `'No external orders available to fill'` |
| 2 | 238-242 | `no_walk_fills` | `'No orders available to fill'` |
| 3 | 248-252 | `caught_exception` | `'Unable to calculate order price. Please try again.'` |
| 4 | 267-271 | `caught_exception` | `'Unable to calculate order price. Please try again.'` |
| 5 | 344-348 | `unhydrated_fills` | `'Unable to prepare aggregated order route. Please refresh and retry.'` |
| 6 | 446-450 | `aggregated_failed` | `'Unable to prepare order transaction. Please refresh quotes and retry.'` |
| 7 | 481-485 | `aggregated_failed` | `txError \|\| 'Order failed'` |
| 8 | 487-491 | `aggregated_failed` | `'Order did not complete. Please try again.'` |
| 9 | 494-498 | `caught_exception` | `error instanceof Error ? error.message : 'Unknown error occurred'` |

The Wallet-not-connected branch (line 193 in the current source — was line 142 per orchestrator) remains EXCLUDED per the plan's must_have #3.

The catch block at line 222 (inside the per-order hydration loop) is INSIDE a try/catch in inner-loop logic that does `console.warn` and continues; it's not a function-exit failure-return — left untouched per the orchestrator's instruction.

---

**Total deviations:** 1 auto-fixed (Rule 3 — Blocking, vitest mock) + 1 discovery (orchestrator's table over-counted to 8; current source has 9 INCLUDE paths).
**Impact on plan:** Both deviations are mechanical and within scope. The Rule 3 fix preserves test isolation without modifying any test files. The 9th wrapped path (indexedFills empty) is the same `aggregated_failed` reason already required ≥2 times by acceptance criteria — wrapping a 9th call site instead of 8 strengthens coverage without scope creep. All `must_haves.truths`, `acceptance_criteria`, and orchestrator `success_criteria` satisfied.

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors at lines 664, 686, 708, 2346 — carried over from 01-01 baseline. Unchanged by this plan; remain Phase 2 work (TRADE-01..04). Logged in `deferred-items.md`.
- **Local Node v24 vs adapter-vercel's Node 18/20/22 requirement:** Pre-existing local environment issue identical to 01-04 + 01-05 + 01-06. The Vite build phase succeeds (`✓ built in 15.65s`); only the post-Vite Vercel adapt step fails locally. Vercel CI is unaffected (defaults to Node 22). Documented as environmental, not a regression — see 01-04-SUMMARY §Build smoke test result.

## D-08 Acceptance Smoke Test Recipe (deploy-time / dev verification)

The plan's `<verification>` calls for a manual smoke test in `gsd-execute-phase`. Recipe:

1. **Set up a local trade-page session.**
   - `npm run dev` and open `http://localhost:5173/trade/<asset>`.
   - Connect a wallet (any wallet — Dynamic embedded works fine).

2. **Force a `no_quotes_available` failure.** The cleanest no-mock trigger is to disable the asset's network temporarily:
   - Pick an asset whose price feed exists but whose orderbook subgraph is unresponsive at the moment, OR
   - Open browser DevTools → Network tab → block requests to `*goldsky.com*` (the orderbook subgraph) → click "Buy" / "Sell" with any amount.

3. **Verify Sentry sink (if `PUBLIC_SENTRY_DSN` is set in `.env.local`):**
   - Sentry dashboard → Issues view → look for a new event with `tags.failure_reason = no_quotes_available` and `tags.side = ask` (Buy) or `tags.side = bid` (Sell).
   - Open the event → "Additional Data" / "Extras" panel → confirm `fullQuotePayload` (the full quote array), `subgraphQuoteHash` (0x-prefixed 64-char hex), `onChainStateRead.{orderHash,IOIndex.input,IOIndex.output}` (orderHash present if firstQuote was identified; IOIndex populated; vaultBalance null per D-08-LIMITATION), `slippageBps`, `priceCap`, `side`, `takerAction`, `userAction`, `mode`, `walletAddress = [REDACTED_ADDR]` (Plan 01-04's beforeSend redacted it), `timestamp` (ISO 8601).

4. **Verify console sink:**
   - Browser DevTools → Console tab → look for a single `[take-order failed] {...}` line.
   - The JSON contents should match the Sentry "Extras" but with `walletAddress` UNREDACTED (per D-15 + D-08 wording: "scrubbed in Sentry only — full address allowed in pino server logs since they're admin-only"; PostHog session replay storage is admin-only-readable per INTEGRATIONS.md).

5. **Replay the quote independently (D-08 acceptance test core):**
   - Copy `extra.fullQuotePayload` from the Sentry event.
   - Plug into `walkOrderbook({ quotes: ... })` in a Node REPL or another browser session — it should produce the same fills + ratio + price.
   - Cross-reference `extra.onChainStateRead.orderHash` against `https://api.raindex.app/orders/{orderHash}` (or whatever the equivalent introspection URL is at deploy time) — should resolve to the same maker order.

   **Pass criterion:** the dev can replay the failure WITHOUT contacting the user — only the Sentry event JSON or the console-line JSON is required input.

6. **Verify NO server-relayed endpoint** (D-15 invariant):
   - Browser DevTools → Network tab during the failure → no requests to any new endpoint that didn't exist before this plan.
   - The only Sentry-related requests should be to `*.ingest.us.sentry.io` (already permitted by Plan 01-04's CSP).

This smoke test is operator-driven and does NOT block the plan — Phase 1 ships the seam; the operator verifies it once Sentry org/project + DSN are provisioned (per 01-04-SUMMARY operational notes).

## User Setup Required

None — no new infrastructure or env vars introduced by this plan. The dual-sink uses:
- The Sentry SaaS account already provisioned (or to-be-provisioned) per Plan 01-04's operational notes.
- `console.error` which is captured by PostHog session replay (already configured in Plan 01-04's INTEGRATIONS.md baseline) + Vercel browser-console capture (already on by default).

Operational follow-up: when the Sentry org+project is created (per 01-04-SUMMARY operational notes step 4), the OBS-03 capture seam will start emitting events automatically. No additional setup needed.

## Threat Flags

None new. All work was within the plan's `<threat_model>` scope:

- **T-07-01 mitigated** — `walletAddress` field in transcript is recursively scrubbed by Plan 01-04's `beforeSend` hook before Sentry transmits. Verified by reading scrubSentryEvent's recursive walker logic: it visits every string field in the event tree (including `extra.walletAddress`, `extra.onChainStateRead.orderHash`, `extra.fullQuotePayload[*].outputTokenAddress`, etc.) and applies the regex denylist.
- **T-07-02 accepted** — `console.error` JSON line in browser DevTools is visible to the wallet owner. Their own wallet address in their own console is NOT a leak. PostHog session replay storage is admin-only-readable per INTEGRATIONS.md A8.
- **T-07-03 mitigated (Phase 1 design)** — Sentry events configured errors-only by Plan 01-04 (`tracesSampleRate: 0`, `integrations: []`); free-tier 5K/month covers the solo team. If take-order failure rate spikes, follow-up plan adds `ignoreErrors` for known noise.
- **T-07-04 mitigated** — Both sinks wrapped in try/catch. Logging never throws back to caller. Verified by reading captureTakeOrderFailure implementation.
- **T-07-05 mitigated** — Phase fence enforced mechanically: user-facing error strings preserved verbatim (verified by `grep -nE` for each removed string reappearing inside a failWith call); no new logic between call sites and returns; no new on-chain reads; transaction store integration untouched. The 9th wrapped path (`indexedFills.length === 0`) was added inside scope — same `aggregated_failed` reason already required ≥2 times by acceptance criteria.
- **T-07-06 mitigated** — Type-only re-export of `ProcessedQuote` (`export type { ProcessedQuote }`) creates zero runtime dependency cycle. svelte-check verified at the 4-pre-existing-error baseline. captureTakeOrderFailure imports `ProcessedQuote` (type) from marketOrderExecution; marketOrderExecution imports `captureTakeOrderFailure` (value) + `TakeOrderTranscript`/`TakeOrderFailureReason` (types) from captureTakeOrderFailure. Acyclic at runtime.
- **T-07-07 accepted** — PostHog session replay capture verification deferred to deploy-time smoke test. Per D-15: either Sentry OR console-line JSON satisfies the acceptance test. Sentry alone is sufficient.

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `test -f src/lib/services/observability/captureTakeOrderFailure.ts` — verified
- [x] `grep -c "export function captureTakeOrderFailure" src/lib/services/observability/captureTakeOrderFailure.ts` — 1 hit
- [x] `grep -c "export interface TakeOrderTranscript" src/lib/services/observability/captureTakeOrderFailure.ts` — 1 hit
- [x] `grep -c "export type TakeOrderFailureReason" src/lib/services/observability/captureTakeOrderFailure.ts` — 1 hit
- [x] `grep -c "Sentry\.captureException" src/lib/services/observability/captureTakeOrderFailure.ts` — 2 hits (1 doc + 1 code)
- [x] `grep -c "\[take-order failed\]" src/lib/services/observability/captureTakeOrderFailure.ts` — 2 hits (1 doc + 1 code)
- [x] `grep -c "JSON\.stringify" src/lib/services/observability/captureTakeOrderFailure.ts` — 2 hits (1 doc + 1 code)
- [x] No server-relayed endpoint: `grep -E "fetch\(|XMLHttpRequest|axios" src/lib/services/observability/captureTakeOrderFailure.ts` — 0 hits
- [x] `grep -c "captureTakeOrderFailure\|TakeOrderTranscript\|TakeOrderFailureReason" src/lib/services/marketOrderExecution.ts` — 6 hits (3 imports + transcript type usage + helper signature + helper invocation)
- [x] `grep -c "const transcript: TakeOrderTranscript" src/lib/services/marketOrderExecution.ts` — 1 hit
- [x] `grep -c "const failWith" src/lib/services/marketOrderExecution.ts` — 1 hit (helper definition)
- [x] `grep -c "failWith(" src/lib/services/marketOrderExecution.ts` — 11 hits (1 helper definition + 1 helper signature + 9 call sites; ≥6 required)
- [x] All 9 failure-return paths covered by reason: no_quotes_available x1, no_walk_fills x1, unhydrated_fills x1, aggregated_failed x3, caught_exception x3 (sums to 9; matches all acceptance criteria minimums)
- [x] `grep -c "transcript.subgraphQuoteHash" src/lib/services/marketOrderExecution.ts` — 4 hits (1 init + 2 assignments + 1 catch fallback)
- [x] `grep -c "crypto\.subtle\.digest" src/lib/services/marketOrderExecution.ts` — 1 hit
- [x] `grep -c "transcript.onChainStateRead.IOIndex.input\|transcript.onChainStateRead.IOIndex.output" src/lib/services/marketOrderExecution.ts` — 2 hits (1 each)
- [x] `grep -c "firstQuote.inputIOIndex\|firstQuote.outputIOIndex" src/lib/services/marketOrderExecution.ts` — 4 hits (transcript pop + aggregatedParams pop on each)
- [x] `grep -c "vaultBalance" src/lib/services/marketOrderExecution.ts` — 3 hits (transcript JSDoc + field init + post-firstQuote comment, all flagging D-08-LIMITATION → TRADE-03)
- [x] `grep -nE "'Wallet not connected" src/lib/services/marketOrderExecution.ts` — 1 hit at line 193 (still in plain `return { success: false, error: ... }` form — EXCLUDED from failWith per plan)
- [x] User-facing error strings preserved verbatim — every removed string verified to reappear inside a failWith call
- [x] `npm run check` — only the 4 pre-existing transaction.ts errors; 0 new errors
- [x] `npm test -- --run` — 447 passed / 1 skipped (was 447/1 baseline at 01-06; net 0 regressions)
- [x] `SENTRY_AUTH_TOKEN= npm run build` — Vite phase succeeds (`✓ built in 15.65s`); post-Vite Vercel adapt fails on local Node v24 (pre-existing env issue)
- [x] All 2 task commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `505e343`, `58f8e97`
- [x] No unintended file deletions across the 2 task commits (`git diff --diff-filter=D --name-only HEAD~2 HEAD` returns empty)

## Next Plan Readiness

- **Plan 01-08 (RUNBOOK) is unblocked.** Wave 6 closes with this plan; Wave 7 (01-08) writes the operational runbook documenting Sentry org provisioning, Telegram bot setup (D-17), the OBS-03 D-08 acceptance smoke test recipe (this plan's §"D-08 Acceptance Smoke Test Recipe" can be quoted verbatim), and the Vercel Speed Insights dashboard URL (D-11 / OBS-05). All upstream observability seams (OBS-01 / OBS-02 / OBS-03 / OBS-04) are in place; OBS-05 is operator-only confirmation.
- **Phase 2 / TRADE-03 (freshness-illusion fix) has its replay vector ready.** When the trade-execution refactor begins, every "no liquidity" failure on the live system already emits a complete Sentry event + console-line JSON containing the input quote payload + the on-chain order identity. A dev can pull the event, replay the quote, and validate that the refactor actually fixed the failure mode.
- **Phase 2 / TRADE-04 (UX of error messages) is next-gen.** Once the failure-mode surface is observable, TRADE-04 can re-classify errors (e.g., distinguish stale-vault from no-liquidity in the user-visible message). The Phase 1 fence preserved every user-facing string verbatim — TRADE-04 will replace them.
- **OBS-03 is the seventh REQ-ID closed in Phase 1** (after DEPR-02 in 01-01, DEPR-01 in 01-02, DEPR-03 in 01-03, OBS-01 in 01-04, OBS-02 in 01-05, OBS-04 in 01-06). 7 down, 1 to go (OBS-05 — operator confirmation only, scoped to 01-08 RUNBOOK).
- **Wave 6 closes.** With 01-06 + 01-07 both complete, Wave 6 is done. 01-08 is the only plan in Wave 7.
- **No carry-over deferred items closed in this plan.** The CACHE_KEYS orphan from 01-02 and the 4 pre-existing transaction.ts errors remain for future plans.

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
