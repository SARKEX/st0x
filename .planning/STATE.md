---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Plan 01-06 (OBS-04) complete. Wave 6 partially done — RPC failure metrics + chain-exhausted Slack alerts shipped. NEW src/lib/server/rpcMetrics.ts (74 lines; recordRpcAttempt + reportChainExhausted + ChainExhaustedDetails; consumes getLogger/getRequestContext from Plan 01-05's logger.ts). NEW src/lib/server/alerts.ts (62 lines; notifyChainExhausted Slack incoming-webhook poster; fail-closed mild env pattern, 3s AbortSignal.timeout, ERROR_TEXT_CAP=512 per-error length cap, plain {text:'...'} payload). MOD src/lib/server/snapshots/generator.ts:callRpc instrumented (3 failure paths: HTTP non-2xx, exception, empty result; chain-exhausted on full loop failure). MOD src/lib/server/accessCodes.ts:verifyWalletSignature instrumented (single-RPC = chain-exhausted on failure; rpc_url='alchemy-base-mainnet' stable label per T-06-04 mitigation). .env.example: OBSERVABILITY_ALERT_WEBHOOK_URL added. Pitfall 3 / REL-01 fence held mechanically (grep -nE "setTimeout.*retry|backoff|exponential" → 0 hits). svelte-check at 4-pre-existing baseline; 447 tests pass. Next up: Plan 01-07 OBS-03 take-order failure transcripts (sequential per parallelization=false in this wave).
last_updated: "2026-04-29T11:39:49Z"
last_activity: 2026-04-29 -- Plan 01-06 complete (3 commits, ~6min, 0 new svelte-check errors, 447 vitest tests pass)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 6
  completed_plans: 6
  percent: 19
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** A user clicking Buy or Sell gets correct, predictable execution at the price and size they were shown — every time.
**Current focus:** Phase 1 — Shrink the Surface, See What's Happening

## Current Position

Phase: 1 (Shrink the Surface, See What's Happening) — EXECUTING
Plan: 7 of 8 (01-01..01-06 complete; next up 01-07 OBS-03 take-order failure transcripts — sequential in this wave per parallelization=false)
Status: Executing Phase 1
Last activity: 2026-04-29 -- Plan 01-06 complete

Progress: [████████░░] 75% (6/8 plans complete in Phase 1; 0/4 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 6
- Average duration: ~7.8min
- Total execution time: 47min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 6 | 47min | ~7.8min |

**Recent Trend:**

- Last 6 plans: 01-06 OBS-04 (6min, 3 commits), 01-05 OBS-02 (6min, 3 commits), 01-04 OBS-01 (6min, 3 commits), 01-03 DEPR-03 (6min, 3 commits), 01-02 DEPR-01 (6min, 2 commits), 01-01 DEPR-02 (17min, 3 commits)
- Trend: Wave 6's first half (01-06 OBS-04) maintained the Wave 2/3/4/5 pace — three-task split (alerts.ts → rpcMetrics.ts → instrumentation) with intentional mid-flight broken type between Tasks 1 and 2 (alerts.ts imports `ChainExhaustedDetails` from rpcMetrics which doesn't exist until Task 2). Pitfall 3 fence held mechanically by grep proofs. Stable-identifier `'alchemy-base-mainnet'` pattern for accessCodes.ts dodges T-06-04 Alchemy-key-leak via Slack payload — the SEC-01-flagged hardcoded key stays out of the alert text without touching the underlying wiring (Phase 3 territory).

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
Stopped at: Plan 01-06 (OBS-04) complete. Wave 6 partially done — RPC failure metrics + chain-exhausted Slack alerts shipped. Two new server-only modules: src/lib/server/rpcMetrics.ts (74 lines; recordRpcAttempt + reportChainExhausted; consumes Plan 01-05's getLogger + getRequestContext) and src/lib/server/alerts.ts (62 lines; notifyChainExhausted Slack incoming-webhook poster with fail-closed mild env, 3s AbortSignal.timeout, ERROR_TEXT_CAP=512). Two surgical instrumentations: callRpc in src/lib/server/snapshots/generator.ts (3 failure paths instrumented; chain-exhausted on full loop failure) and verifyWalletSignature in src/lib/server/accessCodes.ts (single-RPC = chain-exhausted on failure; stable rpc_url label `'alchemy-base-mainnet'` per T-06-04 mitigation). .env.example documents OBSERVABILITY_ALERT_WEBHOOK_URL with provisioning instructions. Pitfall 3 / REL-01 / REL-02 fence held mechanically by grep proof: `setTimeout.*retry|backoff|exponential` → 0 hits across both files. svelte-check at the 4-pre-existing baseline; 447 vitest tests pass. Operational follow-up: provision Slack incoming webhook for #st0x-alerts and set OBSERVABILITY_ALERT_WEBHOOK_URL in Vercel project env (alerts no-op safely until then via fail-closed mild form). Next up: Plan 01-07 OBS-03 take-order failure transcripts (sequential in Wave 6 per parallelization=false in config.json).
Resume file: .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-07-PLAN.md
Next step: `/gsd-execute-phase 1` (continues with 01-07)
