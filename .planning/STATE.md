---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: phase_2_pending_planning
stopped_at: Phase 2 (Trade-Execution Backbone Refactor) discuss-phase complete. NEW .planning/phases/phase-02-trade-execution-backbone-refactor/02-CONTEXT.md (locked 8 decisions D-01..D-08) and 02-DISCUSSION-LOG.md (alternatives audit). Three gray areas discussed (TRADE-01 ban mechanism, TRADE-03 staleness UX, PERF-01 target & approach); two captured as Claude's discretion (TRADE-02 split granularity, rollout/risk strategy). Locked decisions — TRADE-01 (D-01/D-02): ESLint custom rule banning direct inputTokenAddress / outputTokenAddress / inputIOIndex / outputIOIndex reads outside src/lib/types/orderPerspective.ts; codemod-first migration over the 88 existing call sites (17 files), then flip the rule on. TRADE-03 (D-03/D-04/D-05/D-06): pre-flight multicall as silent safety net (not a UX interruption); on targeted-order-vanished/drained auto-walk to the next-best on-chain order using fresh on-chain truth instead of the stale subgraph (extending the existing aggregated→fallback→per-order cascade in marketOrderExecution.ts:328-368); inline terminal-state error on the order form only when the auto-retry chain exhausts ('No liquidity available right now for this size'); OBS-03 failWith() transcript constraint preserved through all new failure paths (Plan 01-07 seam re-verified by phase-exit grep). Reframed during discussion in response to user's 'why not just submit and let slippage handle it' pushback — pre-flight specifically catches 'order isn't there anymore' which slippage cannot help with; slippage and pre-flight coexist non-redundantly. PERF-01 (D-07/D-08): p75 LCP < 2.5s on /trade/[id] (Web Vitals 'good' threshold) validated against the existing Vercel Speed Insights dashboard; lazy-load (LimitOrder.svelte / DcaOrder.svelte / chart libs) + bundle prune + query-waterfall reduction; NO SSR (explicitly deferred to a future milestone to avoid concurrent surgery on the trade page during TRADE-01..04 landing). Phase 2 ready for /gsd-plan-phase 2.
last_updated: "2026-04-29T13:30:00Z"
last_activity: 2026-04-29 -- Phase 2 discuss-phase complete (3 gray areas, 8 locked decisions, 1 commit) — Phase 2 ready to plan
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 8
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** A user clicking Buy or Sell gets correct, predictable execution at the price and size they were shown — every time.
**Current focus:** Phase 2 — Trade-Execution Backbone Refactor (context gathered; ready to plan)

## Current Position

Phase: 2 (Trade-Execution Backbone Refactor) — context gathered, ready to plan
Plan: 0 of TBD (next: /gsd-plan-phase 2)
Status: 02-CONTEXT.md and 02-DISCUSSION-LOG.md committed; 8 implementation decisions locked (D-01..D-08)
Last activity: 2026-04-29 -- Phase 2 discuss-phase complete

Progress: [██████████] 100% (8/8 Phase 1 plans complete; 1/4 phases complete; 8/30 milestone REQ-IDs complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Average duration: ~9.5min
- Total execution time: 76min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 8 | 76min | ~9.5min |

**Recent Trend:**

- Last 8 plans: 01-08 OBS-05+RUNBOOK+phase-exit (12min, 1 task commit), 01-07 OBS-03 (17min, 2 commits), 01-06 OBS-04 (6min, 3 commits), 01-05 OBS-02 (6min, 3 commits), 01-04 OBS-01 (6min, 3 commits), 01-03 DEPR-03 (6min, 3 commits), 01-02 DEPR-01 (6min, 2 commits), 01-01 DEPR-02 (17min, 3 commits)
- Trend: Phase 1 closed with 01-08 — verify-only + documentation plan; no source-code edits. Task 1 (Speed Insights human-verify) was resolved by orchestrator-side Vercel API check (user delegated; speedInsights.hasData=true since 2025-07-21). Task 2 wrote the 328-line operational runbook (Vercel project URL filled in, D-17 Telegram phrasing throughout, doc correction recorded that injectSpeedInsights() lives in +layout.svelte:31 not CookieConsent.svelte). Task 3 ran the phase-exit verification battery read-only: type-check at 4-pre-existing-error baseline; 447 tests pass; Vite build clean; 7 of 8 cross-cutting cleanup greps clean; 1 stale-comment hit in cache.ts:48-53 logged as deferred (NOT auto-fixed per scope_guard — owned by next plan that touches cache.ts). OBS-03 failWith count = 9, ≥8 required.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Frame the milestone as "stop the bug whackamole at the source," not "fix everything in CONCERNS.md"
- Init: Observability comes before any refactor (cannot diagnose blind, cannot validate that refactor improved anything)
- Init: Refactor full trade-execution backbone (TRADE-01..04) as one connected effort — pieces are tightly coupled
- Init: Done = outcome-based (whackamole stops + ship-without-fear), not metrics or audit-checklist
- Init: Coarse phase granularity (4 phases for this milestone)
- 01-01: Defer `src/lib/server/rewards/rewardsCommon.ts` deletion — surviving consumer at `/api/admin/referral-programme/leaderboard` is NOT in 01-02's scope; relocate `getCurrentMonth`/`getDaysInMonth` into `$lib/utils/dates.ts` before deletion
- 01-01: Retarget `computeProjectedDailyPoints` imports to `$lib/utils/points` (source) rather than restoring a stub re-export module at the deleted `points.ts` path
- 01-01: Delete `/api/admin/snapshots/recalculate/+server.ts` entirely — its sole purpose was monthly-points recalculation; no surviving function with the points pipeline gone
- 01-02: Honor D-16 by splitting work across two atomic commits — Task 1 extracts announcementStore + moves modal + rewires consumers (rewardsStore.ts intact); Task 2 deletes the rewards layer. svelte-check stays green at every step
- 01-02: Auto-fixed 3 out-of-scope `rewardsStore` consumers via Rule 3 mechanical retargeting — same pattern 01-01 used for `computeProjectedDailyPoints` (referrals modals' formatPoints/formatUsd → `$lib/utils/format`; landing-page `fetchGlobalRewards` was a dead call removed entirely)
- 01-02: Did NOT prune rewards-only entries from `CACHE_KEYS` in cache.ts — out of `files_modified` per scope_guard; logged to deferred-items.md
- 01-02: Did NOT remove dead `'/rewards'` page-protection check in `hooks.server.ts:238` — wholesale hooks.server.ts changes belong to Plans 01-04..06; logged to deferred-items.md
- 01-03: Three-commit deletion shape (delete leaves → strip server-chain artifacts → rewrite consumer + cross-cutting copy) — svelte-check fails between Tasks 1-2 and 3 by design; each commit message calls out the intentional mid-flight broken state
- 01-03: Honored orchestrator success_criteria over plan text on CTA copy — orchestrator forbade 'Buy Crypto' / 'Add Funds' in src/ (grep_proofs require 0 hits); plan said 'Add Funds' was OPTIONAL to rename. Renamed all 3 instances + deleted Onramper-specific Buy Crypto button at dashboard:1965
- 01-03: Closed deferred '/rewards' page-protection check from 01-02 opportunistically — orchestrator note explicitly allowed cleanup if editing same hooks.server.ts line range; the dead check on line 238 fell within the same edit block as the Onramper carve-out removal at line 235
- 01-03: DepositModal final size 174 lines (over 130 soft target) — bulk above target is preserved-verbatim inline SVG paths from the original deposit branch; trimming further would violate "no new icons" guardrail. Acceptance criteria all satisfied (chooser scaffolding gone; copy contract verbatim; svelte-check 0 new errors)
- 01-04: Three-task split for Sentry wiring (dep + pure module/tests → vite plugin + client init → server init + CSP + sequence-wrap) keeps svelte-check green at every commit. The pure scrubber + tests must land before any init code so the import surface compiles cleanly.
- 01-04: Init gated by `!dev && Boolean(env.{PUBLIC_,}SENTRY_DSN)` — dev no-ops, missing DSN in prod degrades gracefully (no crash). Sentry plugin's `autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN` mirrors this for build time. Both are deliberate ungated-mode-friendly designs for solo-team operations.
- 01-04: CSP appended NOT replaced — every existing connect-src host preserved verbatim; only added `*.ingest.sentry.io` + `*.ingest.us.sentry.io`. EU region (`*.ingest.de.sentry.io`) deferred to deploy-time decision when org region is chosen.
- 01-04: handleError callback typed explicitly `{ error: unknown; event: unknown }` to satisfy svelte-check strict — caught implicit-any on first commit and fixed in same task before commit.
- 01-05: Three-task split for pino logging (dep install + Pitfall 2 audit → pure module + 13 unit tests → hooks sequence reorder) keeps svelte-check at the 4-pre-existing-error baseline at every commit. Tests landed before the hooks edit so the import surface compiled cleanly throughout.
- 01-05: Use Node-built-in `crypto.randomUUID()` from `node:crypto` instead of the `uuid` npm package. CSPRNG-backed (V6 ASVS satisfied — T-05-06); zero new dependency in addition to pino. Project runs Node 24, well above the Node 19 minimum for randomUUID.
- 01-05: Wallet retained in FULL in pino logs (not truncated). Per D-07: Vercel Logs is admin-only-readable; Sentry's beforeSend scrubber from 01-04 handles third-party SaaS exposure separately. Doing both layers would double-redact and lose forensic value in the admin tier where the wallet is the primary join key.
- 01-05: Pino built-in `redact` config (paths array) chosen over a custom serializer — faster (runs at JSON-emit time, not a walker) and canonical (RESEARCH §Security V5). Covers Authorization, cookie, `*.signature`, `*.privateKey` at any depth.
- 01-05: Sequence chain ordering as a hard contract: request-id middleware FIRST, then Sentry, then existing handle. Documented inline above the export so future plans don't reshuffle. Sentry breadcrumbs now inherit request_id from the ALS store via getRequestContext(), enabling Plan 01-07 to embed request_id in Sentry `extra` payloads for trivial triage correlation.
- 01-06: Three-task split for OBS-04 (alerts.ts → rpcMetrics.ts → instrumentation) with intentional mid-flight broken type between Tasks 1 and 2. alerts.ts imports `ChainExhaustedDetails` from rpcMetrics.ts (doesn't exist yet at Task 1 commit point) — Task 2 closes the cycle and svelte-check passes at the 4-pre-existing-error baseline from there. Same surgical-edit philosophy as 01-04 + 01-05.
- 01-06: Stable-identifier `'alchemy-base-mainnet'` for accessCodes.ts:verifyWalletSignature's `rpc_url` label — NOT the actual URL (which contains the SEC-01-flagged hardcoded Alchemy key). T-06-04 mitigation: prevents the key from leaking into Slack alert payloads without touching the underlying wiring (SEC-01 / Phase 3 fixes by env-var-izing). Residual risk in generator.ts:callRpc (RPC_URLS may also contain keys) accepted for Phase 1 — Slack channel + codebase share the same trust boundary.
- 01-06: Pitfall 3 / REL-01 / REL-02 fence held mechanically. JSDoc comment in callRpc initially said "no retry/backoff" which matched the orchestrator's `setTimeout.*retry|backoff|exponential` grep proof (false-positive on `backoff`); reworded to "single-attempt-per-RPC behavior is preserved verbatim" — same meaning, no bait words. Final grep returns 0 hits across both modified files.
- 01-06: Empty-result `continue` semantics in callRpc preserved verbatim. Phase 1 records visibility around the existing behavior; REL-01 in Phase 3 will treat empty as a hard failure across the chain. The silent latestBlock fallback in getBlockNumberForTimestamp is also REL-01 territory — NOT touched.
- 01-06: alerts.ts re-throws on fetch failure → rpcMetrics.reportChainExhausted catches and logs alert-delivery-failure separately. Two-layer separation: alerts.ts is the delivery surface (no pino knowledge), rpcMetrics is the metric layer (owns sequencing). One Vercel Logs query reveals both the chain-exhausted event and any delivery failure adjacent.
- 01-06: Plain `{text: '...'}` Slack payload (NOT Block Kit) per RESEARCH §"Don't Hand-Roll" — Block Kit is over-engineered for solo-team scale. Per-error length cap at 512 chars (`ERROR_TEXT_CAP`) prevents log spam DoS from attacker-controlled multi-MB error responses (V5 ASVS / T-06-02). 3s `AbortSignal.timeout` (tighter than pyth.ts's 5s) — alert delivery feels synchronous from caller; don't extend tail latency.
- 01-07: Two-task split (NEW captureTakeOrderFailure.ts → MOD marketOrderExecution.ts wiring) instead of three — the helper module + the wiring are tightly coupled and live in the same plan scope. svelte-check stays green at every commit; no need for the 01-04..06 mid-flight broken state pattern.
- 01-07: Single-seam transcript-builder pattern (RESEARCH §Pattern 3 line 530): transcript built at function entry, mutated forward as data becomes available, closure-captured by `failWith(reason, errOrMessage, userFacingError)` helper, dispatched on every error-return path. Replaces the miss-able per-branch wrapping pattern. New failure paths added in Phase 2 / TRADE-04 cannot accidentally bypass capture without explicitly returning a non-`failWith` error object.
- 01-07: `failWith` 3-arg signature: second arg accepts both real exceptions (catch block) AND synthetic `new Error('...')` for control-flow returns. Sentry needs an Error-shaped object for proper stack-trace context; synthetic errors at control-flow sites give Sentry meaningful "where did this fire" frames. Third arg preserves the existing user-facing error string verbatim — Phase 1 fence enforced mechanically.
- 01-07: `transcript.subgraphQuoteHash` populated via `crypto.subtle.digest('SHA-256', JSON.stringify(externalQuotes))` immediately after externalQuotes is computed — checker W2 requires non-null at emit time. Hex-encoded with `0x` prefix. Wrapped in try/catch with null fallback so a missing `crypto.subtle` (shouldn't happen in supported browsers) cannot break the trade UI.
- 01-07: `transcript.onChainStateRead.IOIndex.{input,output}` populated from `firstQuote.{inputIOIndex,outputIOIndex}` — locally available, no new on-chain read needed (checker W3). `vaultBalance` STAYS null in Phase 1 — populating it would require a new on-chain `getVaultBalance()` call at submission time, which is exactly the freshness-illusion fix scoped for Phase 2 / TRADE-03.
- 01-07: `transcript.onChainStateRead` populated AFTER `firstQuote = walkResult.fills[0].quote` is identified but BEFORE the `firstQuote.orderData/sgOrder` validity gate. Reason: `orderHash`, `inputIOIndex`, `outputIOIndex` are populated unconditionally by `convertApiOrderToProcessedQuote` (src/lib/api/orders.ts:104, 144, 145) regardless of whether the order has been hydrated with full `orderData`/`sgOrder`. So an `unhydrated_fills` failure transcript still carries those fields. Earlier-stage failures (no_quotes_available, no_walk_fills, the two `caught_exception` sites in the ratio computation) legitimately have null IOIndex.
- 01-07: ProcessedQuote re-exported from marketOrderExecution.ts (one-line `export type { ProcessedQuote }`). Plan Task 1 notes outlined two options: (a) re-export, (b) inline shape. Picked (a) per the plan's recommendation — single-line addition, no behavior change, keeps the observability helper's import path matching what the plan specified.
- 01-07: Auto-fixed Rule 3 — `vi.mock('@sentry/sveltekit', ...)` added to vitest-setup.ts. The new transitive Sentry import broke `tests/lib/services/marketOrderExecution.test.ts` (which only uses `excludeTakerOwnedQuotes` — a pure function) because the SDK's browser entry imports `from '$app/stores'` from inside node_modules; Vite's test-mode resolver cannot reach SvelteKit virtual modules from there. The mock provides no-op stubs (init, captureException, captureMessage, addBreadcrumb, setUser, setTag, setContext, setExtra, withScope, sentryHandle, handleErrorWithSentry, sentrySvelteKit). Same trust pattern as the existing svelte-wagmi + $app/stores mocks. Production Sentry init in hooks.{client,server}.ts is environmentally gated on `!dev && DSN`, so the mock only applies under Vitest.
- 01-07: Discovery — orchestrator's pre-flight line-drift table listed 8 INCLUDE failure paths; current source has 9. The `indexedFills.length === 0` branch in the per-order fallback path (lines 339-344 of current source) was missed. Wrapped as `aggregated_failed` (same reason already required ≥2 times by acceptance criteria). Surfaces as deviation; strengthens coverage without scope creep.
- 01-08: Task 1 (Speed Insights human-verify) resolved by orchestrator-side Vercel API check (NOT user roundtrip) — user delegated the check; orchestrator queried project_id prj_tTuOMTtlZKU2tOXN4UQCfnsDxlmv directly: speedInsights.hasData=true, enabledAt 2025-07-21 (~9 months of LCP/CLS/INP/TTFB data), webAnalytics also enabled. Resolved URL https://vercel.com/st-0x/st0x/observability/speed-insights captured for runbook.
- 01-08: RUNBOOK records a doc correction over original CONTEXT/PLAN — injectSpeedInsights() lives in src/routes/+layout.svelte:31 (consent-gated via onAnalyticsAccepted callback wired into <CookieConsent />), NOT in CookieConsent.svelte. Same net effect; future debugging now lands on the right file.
- 01-08: Phase exit verification ran read-only per scope_guard. The 1 stale-comment hit in src/lib/server/cache.ts:48-53 (references deleted /api/rewards/* helpers in past tense) was NOT auto-fixed — logged as deferred per the existing 01-02 deferred-items entry (orphaned CACHE_KEYS cluster + stale comment block) which already scoped this for the next plan that touches cache.ts. failWith count grep `-c "failWith("` returned 9 (call sites only — the helper definition `const failWith = (` is not counted because no `(` immediately follows the identifier; 9 ≥ 8 required).

### Pending Todos

None yet.

### Blockers/Concerns

- ~~Phase 1 carries an open decision (DEPR-02) that requires internal team confirmation before the snapshot pipeline can be deleted.~~ **Resolved 2026-04-28** in `01-CONTEXT.md` D-01: delete the rewards layer; keep the snapshot pipeline because it feeds admin TVL + per-token volume views. SEC-06, REL-01, and TEST-04 therefore survive against the retained subsystem.
- Phase 4 TEST-04 ~~is conditional on the Phase 1 DEPR-02 outcome~~ **applies** — DEPR-02 retained the scraper; scraper edge-case tests (pagination boundaries, legacy `wrappedTokenTransfers` fallback, transient subgraph failure) are scoped for Phase 4.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-04-29
Stopped at: Phase 2 (Trade-Execution Backbone Refactor) discuss-phase complete. NEW .planning/phases/phase-02-trade-execution-backbone-refactor/02-CONTEXT.md (8 locked decisions D-01..D-08, full canonical-refs surface for downstream agents) and 02-DISCUSSION-LOG.md (alternatives audit). User selected three gray areas (TRADE-01 ban mechanism, TRADE-03 staleness UX, PERF-01 target & approach); TRADE-02 split granularity and rollout/risk strategy captured as Claude's discretion. Locked: ESLint custom rule for the IO-perspective ban (codemod 88 sites first, flip rule on after); silent pre-flight multicall safety net with auto-walk to next-best on-chain order — slippage-vs-pre-flight scope distinction explicit per discussion (slippage covers price-moved-within-order, pre-flight covers order-vanished-or-drained — they coexist non-redundantly); inline 'No liquidity available' terminal-state error only when auto-retry chain exhausts; OBS-03 failWith() transcript constraint preserved through all new failure paths; p75 LCP < 2.5s on /trade/[id] via lazy-load + bundle prune + query-waterfall reduction (NO SSR — explicitly deferred). Phase 2 ready for /gsd-plan-phase 2.
Resume file: .planning/phases/phase-02-trade-execution-backbone-refactor/02-CONTEXT.md
Next step: `/gsd-plan-phase 2`
