---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Plan 01-02 (DEPR-01) complete. Wave 2 done — user-facing rewards UI + 7 API routes deleted; TokenSwapAnnouncement preserved per D-16 in new announcementStore + announcements/ directory; Pitfall 8 carve-out closed in hooks.server.ts. Next up: Wave 3 (01-03 DEPR-03 Onramper delete + DepositModal collapse).
last_updated: "2026-04-29T10:10:00Z"
last_activity: 2026-04-29 -- Plan 01-02 complete (2 commits, ~6min, 0 new svelte-check errors, 429 vitest tests pass)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 2
  percent: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** A user clicking Buy or Sell gets correct, predictable execution at the price and size they were shown — every time.
**Current focus:** Phase 1 — Shrink the Surface, See What's Happening

## Current Position

Phase: 1 (Shrink the Surface, See What's Happening) — EXECUTING
Plan: 3 of 8 (01-01 DEPR-02 + 01-02 DEPR-01 complete; next up 01-03 DEPR-03)
Status: Executing Phase 1
Last activity: 2026-04-29 -- Plan 01-02 complete

Progress: [██░░░░░░░░] 25.0% (2/8 plans complete in Phase 1; 0/4 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 2 | 23min | 11.5min |

**Recent Trend:**

- Last 5 plans: 01-02 DEPR-01 (6min, 2 commits), 01-01 DEPR-02 (17min, 3 commits)
- Trend: Wave 2 ran fast — pure deletion + 1 extraction; less inline cross-cutting work than Wave 1

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
Stopped at: Plan 01-02 (DEPR-01) complete. Wave 2 done. Next up: Wave 3 (Plan 01-03 DEPR-03 Onramper delete + DepositModal collapse to deposit-only per D-10).
Resume file: .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-03-PLAN.md
Next step: `/gsd-execute-phase 1` (continues into Wave 3)
