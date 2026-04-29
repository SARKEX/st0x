---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Plan 01-04 (OBS-01) complete. Wave 4 done — @sentry/sveltekit@10.50.0 wired client + server with errors-only config (no Replay/Performance/Feedback); recursive PII scrubber (scrubSentryEvent at $lib/observability/scrub.ts) covers wallet + signature + ?signature= URL params via beforeSend AND beforeBreadcrumb (Pitfall 9); CSP connect-src extended with *.ingest.sentry.io + *.ingest.us.sentry.io (Pitfall 1); sourcemap upload via Vite plugin gated on !!process.env.SENTRY_AUTH_TOKEN (Pitfall 4); src/hooks.client.ts greenfield + hooks.server.ts handle wrapped in sequence(Sentry.sentryHandle(), existingHandle). SDK ships inert until Vercel env vars set — operational follow-up documented in SUMMARY. Next up: Wave 5 (01-05 OBS-02 pino + AsyncLocalStorage request-id middleware).
last_updated: "2026-04-29T11:14:11Z"
last_activity: 2026-04-29 -- Plan 01-04 complete (3 commits, ~6min, 0 new svelte-check errors, 434 vitest tests pass)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 4
  percent: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** A user clicking Buy or Sell gets correct, predictable execution at the price and size they were shown — every time.
**Current focus:** Phase 1 — Shrink the Surface, See What's Happening

## Current Position

Phase: 1 (Shrink the Surface, See What's Happening) — EXECUTING
Plan: 5 of 8 (01-01 DEPR-02 + 01-02 DEPR-01 + 01-03 DEPR-03 + 01-04 OBS-01 complete; next up 01-05 OBS-02)
Status: Executing Phase 1
Last activity: 2026-04-29 -- Plan 01-04 complete

Progress: [█████░░░░░] 50.0% (4/8 plans complete in Phase 1; 0/4 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: ~8.75min
- Total execution time: 35min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 | 35min | ~8.75min |

**Recent Trend:**

- Last 5 plans: 01-04 OBS-01 (6min, 3 commits), 01-03 DEPR-03 (6min, 3 commits), 01-02 DEPR-01 (6min, 2 commits), 01-01 DEPR-02 (17min, 3 commits)
- Trend: Wave 4 matched the Wave 2/3 pace — three-task split (dep + scrubber/tests; vite plugin + hooks.client; server init + CSP + sequence-wrap) kept svelte-check green at every commit. SDK ships inert pending operator Sentry-org creation; gating means PR previews build cleanly without SENTRY_AUTH_TOKEN.

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
Stopped at: Plan 01-04 (OBS-01) complete. Wave 4 done — Sentry SDK errors-only wired client + server with PII scrubbing and CSP additions; SDK ships inert until Vercel env vars (SENTRY_DSN, PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT) are set. Operator must create the Sentry org/project before deploys begin emitting events. Next up: Wave 5 (Plan 01-05 OBS-02 pino structured logger + AsyncLocalStorage request-id middleware; per Pattern 1 the request-id middleware will be prepended to `sequence(Sentry.sentryHandle(), existingHandle)`).
Resume file: .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-05-PLAN.md
Next step: `/gsd-execute-phase 1` (continues into Wave 5)
