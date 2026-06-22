---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 02
subsystem: frontend
tags: [rewards, deletion, deprecation, announcement, hooks-server, ui-cleanup]

# Dependency graph
requires: [01-01]
provides:
  - "User-facing rewards UI fully gone (3 components, 1 store, 7 API routes)"
  - "TokenSwapAnnouncementModal preserved at src/lib/components/announcements/ with announcementStore.ts (D-16)"
  - "Wallet-registration carve-out for /api/rewards/global removed from hooks.server.ts (Pitfall 8)"
  - "Layout no longer carries dead RewardsDetailsModal/RewardsLeaderboardModal commented mounts"
  - "Header.svelte no longer carries dead RewardsDisplay comment stubs (desktop + mobile menus)"
affects: [01-03, 01-04, 01-05, 01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-deletion grep audit (Pitfall 5) caught out-of-scope import breakage in referrals modals + (main)/+page.svelte; auto-fixed mechanically (Rule 3) before deletion landed"
    - "D-16 sequencing pattern: extract → move → rewire consumers → delete; landing both halves in separate commits keeps each commit self-consistent (Task 1 alone left rewardsStore intact; Task 2 deletes only after Task 1 had already migrated all surviving consumers)"
    - "Re-export retargeting (same one-line mechanical fix used in 01-01 for computeProjectedDailyPoints): when deleting a re-export module, retarget broken imports to the source module"

key-files:
  created:
    - "src/lib/stores/announcementStore.ts (announcement-only exports extracted from rewardsStore.ts)"
    - "src/lib/components/announcements/TokenSwapAnnouncementModal.svelte (moved via git mv from rewards/; preserves history; import path retargeted to announcementStore)"
  modified:
    - "src/routes/(main)/+layout.svelte (component import path → announcements/; store import → announcementStore; removed dead RewardsDetailsModal/RewardsLeaderboardModal commented mounts)"
    - "src/lib/components/Header.svelte (removed two stale '<!-- RewardsDisplay temporarily hidden -->' comment lines; renamed mobile-menu section header from 'Boost Rewards and Referrals' to 'Referrals')"
    - "src/hooks.server.ts (deleted /api/rewards/ wallet-registration carve-out at line 235 — Pitfall 8)"
    - "src/lib/components/referrals/ReferralLeaderboardModal.svelte (Rule 3 auto-fix: retargeted formatPoints/formatUsd from $lib/stores/rewardsStore to $lib/utils/format)"
    - "src/lib/components/referrals/ReferralDashboardModal.svelte (same Rule 3 auto-fix)"
    - "src/routes/(main)/+page.svelte (Rule 3 auto-fix: removed dead fetchGlobalRewards import + onMount call — banner referenced was already commented out)"
  deleted:
    - "src/lib/components/rewards/RewardsDetailsModal.svelte"
    - "src/lib/components/rewards/RewardsDisplay.svelte"
    - "src/lib/components/rewards/RewardsLeaderboardModal.svelte"
    - "src/lib/components/rewards/ (empty parent directory removed by git rm)"
    - "src/lib/stores/rewardsStore.ts"
    - "src/routes/api/rewards/user/+server.ts"
    - "src/routes/api/rewards/leaderboard/+server.ts"
    - "src/routes/api/rewards/global/+server.ts"
    - "src/routes/api/rewards/pool-apy/+server.ts"
    - "src/routes/api/rewards/ (empty parent directory removed)"
    - "src/routes/api/public/wallet/+server.ts"
    - "src/routes/api/public/rewards-apy/+server.ts"
    - "src/routes/api/public/rocketboost/+server.ts"

key-decisions:
  - "D-16 honored exactly: announcementStore + announcements/ directory created and consumers rewired BEFORE rewards/ + rewardsStore.ts deletion (split across two atomic commits; Task 1 commit f5475d6 added the new module + rewires; Task 2 commit cc6d5b5 deleted the old)"
  - "Pitfall 8 closed: hooks.server.ts no longer carves out /api/rewards/global from the wallet-registration check — the entire /api/rewards/ namespace is gone, so the carve-out became dead"
  - "Rule 3 auto-fixes for 3 out-of-scope consumers (2 referrals modals + (main)/+page.svelte) — same mechanical retargeting pattern 01-01 used for computeProjectedDailyPoints. These are required for type-check to remain green after rewardsStore deletion"
  - "Did NOT delete rewards-only entries from CACHE_KEYS in cache.ts (out of files_modified per scope_guard); logged to deferred-items.md as a follow-up. Surviving CACHE_KEYS consumers (referrals leaderboard, nansen tiers, public TVL/trade-activity) are unaffected"

patterns-established:
  - "When deleting a re-export module, audit ALL consumers across src/ before deletion (Pitfall 5). If any consumer is OUT of files_modified, retarget its import to the source module as a Rule 3 mechanical fix in the same plan — do NOT widen scope to fix unrelated logic"
  - "Per D-16, single-purpose announcement state belongs in its own store (announcementStore.ts) — NOT in a feature store that's being deprecated. Naming follows CONVENTIONS.md: camelCase + Store suffix; directory follows STRUCTURE.md feature-grouping (components/announcements/)"

requirements-completed: [DEPR-01]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 02: User-facing rewards UI deleted; TokenSwap announcement extracted (DEPR-01)

**Deleted 3 rewards components, 1 rewards store, 4 rewards APIs, and 3 public-rewards APIs while preserving the TokenSwap migration announcement (D-16) by extracting `initTokenSwapAnnouncement` + 3 sibling exports into a new `announcementStore.ts` and moving the modal to `src/lib/components/announcements/` BEFORE the rewards layer deletion landed.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-29T09:58:52Z
- **Completed:** 2026-04-29T10:05:00Z (approx)
- **Tasks:** 2 of 2 (atomic commits)
- **Commits:** 2 (Task 1: f5475d6, Task 2: cc6d5b5)

## Accomplishments

- **D-16 honored exactly.** Announcement extraction + modal move + consumer rewires landed in commit f5475d6 (Task 1) BEFORE the rewards layer deletion in commit cc6d5b5 (Task 2). The TokenSwapAnnouncementModal still mounts on `(main)/+layout.svelte` and renders on first visit if `localStorage.getItem('st0x_token_swap_announcement_seen') !== 'true'`.
- **User-facing rewards UI gone.** Three components (`RewardsDetailsModal`, `RewardsDisplay`, `RewardsLeaderboardModal`) deleted; `src/lib/components/rewards/` parent directory removed automatically (empty after git rm).
- **Rewards store gone.** `src/lib/stores/rewardsStore.ts` (234 lines) deleted; the announcement-only exports it carried are now in `src/lib/stores/announcementStore.ts` (37 lines, single-purpose).
- **Rewards APIs gone.** All four `/api/rewards/{user,leaderboard,global,pool-apy}` endpoints deleted; parent `/api/rewards/` directory removed.
- **Public-rewards APIs gone.** `/api/public/{wallet,rewards-apy,rocketboost}` deleted. `/api/public/{trade-activity,tvl}` survive untouched (non-rewards public APIs).
- **Pitfall 8 closed.** `src/hooks.server.ts:235` no longer carves out `/api/rewards/global` from the wallet-registration check — the namespace is gone, so the carve-out became dead.
- **Header dead-code stubs removed.** Two `<!-- RewardsDisplay temporarily hidden -->` comment lines (desktop nav + mobile hamburger) deleted; mobile-menu section header renamed from "Boost Rewards and Referrals" to "Referrals" to reflect the new shape.
- **Layout dead-code stubs removed.** Three lines (`<!-- Rewards Modals - temporarily hidden -->` + two commented-out `<RewardsDetailsModal />` / `<RewardsLeaderboardModal />` mounts) deleted from `(main)/+layout.svelte`.
- **Audit-log non-regression confirmed.** Pre-delete grep + post-delete directory check verified the deleted endpoints were read-only and did NOT call `createAuditLogger`. No surviving endpoint loses coverage. (Threat T-02-01 mitigation per RESEARCH §"Deletion Graph DEPR-01".)
- **Test suite green.** `npm test -- --run` reports 23 test files / 429 passed / 1 skipped — same baseline as 01-01.
- **svelte-check unchanged.** Reports only the 4 pre-existing `transaction.ts` errors flagged by 01-01 (Phase 2 work, deferred). Zero new errors introduced by this plan.

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Extract TokenSwap announcement to announcementStore (D-16)** — `f5475d6` (chore)
   - Created `src/lib/stores/announcementStore.ts` with 4 announcement-only exports
   - `git mv src/lib/components/rewards/TokenSwapAnnouncementModal.svelte → src/lib/components/announcements/TokenSwapAnnouncementModal.svelte`
   - Retargeted moved component's import to `$lib/stores/announcementStore`
   - Updated `(main)/+layout.svelte` import paths + removed dead rewards-modal commented mounts
   - Cleaned up `Header.svelte`'s two `<!-- RewardsDisplay temporarily hidden -->` comment lines
   - Deleted `/api/rewards/` wallet-registration carve-out from `hooks.server.ts` (Pitfall 8)

2. **Task 2: Delete user-facing rewards UI + APIs (DEPR-01)** — `cc6d5b5` (chore)
   - Deleted 3 rewards components + rewardsStore + 7 API routes (4 rewards + 3 public-rewards)
   - Auto-fixed 3 out-of-scope consumers (Rule 3): retargeted formatPoints/formatUsd imports in 2 referrals modals; removed dead `fetchGlobalRewards` call from `(main)/+page.svelte`

(Final docs/metadata commit will follow this SUMMARY.md and STATE.md/ROADMAP.md updates.)

## Files Created/Modified

**New (2):**
- `src/lib/stores/announcementStore.ts` (37 lines — `showTokenSwapAnnouncementModal`, `hasSeenTokenSwapAnnouncement`, `markTokenSwapAnnouncementSeen`, `initTokenSwapAnnouncement`)
- `src/lib/components/announcements/TokenSwapAnnouncementModal.svelte` (moved via `git mv`; rename detected at 98% similarity in commit log)

**Modified (6):**
- `src/routes/(main)/+layout.svelte` — line 6 component import → announcements/; line 10 store import → announcementStore; deleted three lines for dead rewards-modal commented mounts
- `src/lib/components/Header.svelte` — removed `<!-- RewardsDisplay temporarily hidden -->` (two locations: desktop ~line 148, mobile ~line 352); renamed mobile-menu comment header
- `src/hooks.server.ts` — deleted line 235 carve-out + the explanatory comment line above it
- `src/lib/components/referrals/ReferralLeaderboardModal.svelte` — `formatPoints, formatUsd` import retargeted from `$lib/stores/rewardsStore` to `$lib/utils/format` (Rule 3)
- `src/lib/components/referrals/ReferralDashboardModal.svelte` — same Rule 3 retarget
- `src/routes/(main)/+page.svelte` — removed `fetchGlobalRewards` import + onMount call (dead fetch — the rewards-APY banner the data fed was already commented out)

**Deleted (11):**
- `src/lib/components/rewards/RewardsDetailsModal.svelte`
- `src/lib/components/rewards/RewardsDisplay.svelte`
- `src/lib/components/rewards/RewardsLeaderboardModal.svelte`
- `src/lib/stores/rewardsStore.ts`
- `src/routes/api/rewards/user/+server.ts`
- `src/routes/api/rewards/leaderboard/+server.ts`
- `src/routes/api/rewards/global/+server.ts`
- `src/routes/api/rewards/pool-apy/+server.ts`
- `src/routes/api/public/wallet/+server.ts`
- `src/routes/api/public/rewards-apy/+server.ts`
- `src/routes/api/public/rocketboost/+server.ts`

(Plus parent dirs removed automatically: `src/lib/components/rewards/`, `src/routes/api/rewards/`.)

## Decisions Made

- **D-16 split across two atomic commits.** The plan's Task 1 mandates "all of this in a single task because the steps must land coherently for type-check to pass mid-flight." That's what commit f5475d6 does — at the end of Task 1, the new announcementStore exists, the moved modal points at it, all consumers are rewired, and `npm run check` passes (the rewardsStore.ts is intact, so other consumers of it still resolve). Task 2 then deletes the rewards layer cleanly because no consumer needs it anymore.
- **Auto-fixed 3 out-of-scope consumers (Rule 3 — blocking).** Pre-deletion grep audit found 3 imports of `rewardsStore` outside the plan's `files_modified`:
  - `src/lib/components/referrals/ReferralLeaderboardModal.svelte:13` — `formatPoints, formatUsd`
  - `src/lib/components/referrals/ReferralDashboardModal.svelte:15` — same
  - `src/routes/(main)/+page.svelte:15` — `fetchGlobalRewards`
  Per scope_guard, referrals files are kept (D-14) and `(main)/+page.svelte` isn't in files_modified — but svelte-check would fail after `rewardsStore.ts` deletion if these stayed. Same precedent as 01-01's `computeProjectedDailyPoints` retarget: one-line mechanical fix to point at the source module (`$lib/utils/format`) or remove the dead call. No logic change; no widening of plan scope.
- **Did NOT prune rewards-only CACHE_KEYS from cache.ts.** `src/lib/server/cache.ts:140+` exports `CACHE_KEYS` with 7 rewards-specific entries (`rewardsUserSharedData`, `rewardsLeaderboard`, `rewardsPoolApy`, `rewardsGlobalData`, `rewardsApy`, `rocketboost`, `allWalletData`). After Plan 01-02 deletes their callers, those keys become orphaned. But cache.ts is NOT in `files_modified`, and the surviving `CACHE_KEYS` consumers (referrals leaderboard, nansen tiers, public TVL/trade-activity) use unrelated entries. Logged to `deferred-items.md` as a follow-up; do not widen this plan to touch cache.ts.
- **Did NOT prune dead `'/rewards'` protected-page check from hooks.server.ts.** Line 238 still has `path === '/rewards'` in the wallet-registration check. No `/rewards` page route exists in `src/routes/`, so this is dead. But hooks.server.ts wholesale touch is owned by Plans 01-04..06 per the orchestrator notes (Sentry CSP / pino middleware / Onramper carve-out). Logged to `deferred-items.md`.
- **Verified the layout's `<TokenSwapAnnouncementModal />` mount is the only consumer of the moved component.** Grep showed exactly one consumer (`(main)/+layout.svelte:6`), confirming the move was complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Retargeted `formatPoints` / `formatUsd` imports in 2 referrals modals**
- **Found during:** Task 2 pre-deletion grep audit (Pitfall 5)
- **Issue:** `src/lib/components/referrals/ReferralLeaderboardModal.svelte:13` and `src/lib/components/referrals/ReferralDashboardModal.svelte:15` imported `formatPoints, formatUsd` from `$lib/stores/rewardsStore`. The rewards store re-exports these from `$lib/utils/format` (line 228+ of the deleted file). Deleting `rewardsStore.ts` would break both modals' compile.
- **Fix:** Retargeted both imports to `$lib/utils/format` directly. One-line mechanical change per file; no logic change.
- **Files modified:** `src/lib/components/referrals/ReferralLeaderboardModal.svelte:13`, `src/lib/components/referrals/ReferralDashboardModal.svelte:15`
- **Verification:** `npm run check` shows the same 4 pre-existing transaction.ts errors and zero new errors.
- **Committed in:** `cc6d5b5` (Task 2 commit)
- **Why this is in scope:** Same precedent as 01-01's `computeProjectedDailyPoints` retarget. Rule 3 (auto-fix blocking issues) covers mechanical import retargeting that is required for the plan's deletion to leave a green type-check.

**2. [Rule 3 — Blocking] Removed dead `fetchGlobalRewards` import + call from `(main)/+page.svelte`**
- **Found during:** Task 2 pre-deletion grep audit
- **Issue:** `src/routes/(main)/+page.svelte:15` imported `fetchGlobalRewards` from `$lib/stores/rewardsStore` and called it in `onMount` (line 77). Deleting `rewardsStore.ts` would break the landing-page compile.
- **Fix:** Removed the import (line 15) and the `fetchGlobalRewards()` call (line 77) entirely. Inspection confirmed the data the call populated (`globalRewardsData` store) was NOT consumed anywhere in the component — the visible rewards-APY banner around line 190 was already commented out (`<!-- Rewards APY Banner - temporarily hidden -->`). Pure dead-fetch removal.
- **Files modified:** `src/routes/(main)/+page.svelte` (lines 14-16, 76-79)
- **Verification:** `npm run check` shows zero new errors. `npm test` 429 passed / 1 skipped (no landing-page test broke).
- **Committed in:** `cc6d5b5` (Task 2 commit)

### Deferred Items (logged to `deferred-items.md`)

**1. Orphaned rewards-specific CACHE_KEYS entries in `src/lib/server/cache.ts`**
- 7 keys (`rewardsUserSharedData`, `rewardsLeaderboard`, `rewardsPoolApy`, `rewardsGlobalData`, `rewardsApy`, `rocketboost`, `allWalletData`) are now dead — no surviving caller reads or writes them.
- Out of `files_modified`; logged for follow-up plan to prune.

**2. Dead `'/rewards'` protected-page check in `src/hooks.server.ts:238`**
- No `/rewards` page route exists. The wallet-registration check is dead.
- hooks.server.ts wholesale touch is owned by Plans 01-04..06 per the orchestrator. Logged for the next hooks.server.ts-touching plan to drop the check.

---

**Total deviations:** 2 auto-fixed (Rule 3 — both blocking import breakage caused by `rewardsStore.ts` deletion), 2 deferred (out-of-scope, logged to `deferred-items.md`).
**Impact on plan:** All `must_haves.truths` and `acceptance_criteria` satisfied. The plan as written did not anticipate the 3 out-of-scope `rewardsStore` consumers; the Rule 3 auto-fixes close that gap without widening logical scope.

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors (lines 664, 686, 708, 2346) carried over from 01-01. Unchanged by this plan; remain Phase 2 work (TRADE-01..04).
- **`grep -q "from '$lib/stores/announcementStore'"` from a Bash heredoc with shell expansion was inadvertently masking matches:** Worked around by using `grep -E "from '.lib/stores/announcementStore'"` with `.` matching the literal `$`. Acceptance criteria met using the workaround; behavior of the actual files is unchanged.

## Threat Flags

None. All deletions were pre-audited (RESEARCH §"Deletion Graph DEPR-01") and the 3 auto-fixed consumers are pure mechanical retargets (formatters + a dead onMount call). No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `test -f src/lib/stores/announcementStore.ts` — verified
- [x] `grep -q "export function initTokenSwapAnnouncement" src/lib/stores/announcementStore.ts` — verified
- [x] `grep -q "TOKEN_SWAP_ANNOUNCEMENT_SEEN_KEY" src/lib/stores/announcementStore.ts` — verified
- [x] `test -f src/lib/components/announcements/TokenSwapAnnouncementModal.svelte` — verified
- [x] `! test -f src/lib/components/rewards/TokenSwapAnnouncementModal.svelte` — verified
- [x] `! test -d src/lib/components/rewards` — verified (parent dir removed)
- [x] `! test -f src/lib/stores/rewardsStore.ts` — verified
- [x] `! test -d src/routes/api/rewards` — verified (parent dir removed)
- [x] `! test -d src/routes/api/public/wallet` — verified
- [x] `! test -d src/routes/api/public/rewards-apy` — verified
- [x] `! test -d src/routes/api/public/rocketboost` — verified
- [x] `grep -rn "rewardsStore" src/` returns only 1 hit — a doc comment in announcementStore.ts (intentional)
- [x] `grep -rn "RewardsDetailsModal\|RewardsLeaderboardModal\|RewardsDisplay" src/` — 0 hits
- [x] `grep -n "/api/rewards/" src/hooks.server.ts` — 0 hits (Pitfall 8 closed)
- [x] `grep -rn "from '\$lib/components/rewards" src/` — 0 hits
- [x] `grep -rn "announcementStore" src/` — 2 hits (modal + layout, expected)
- [x] `grep -rn "announcements/TokenSwapAnnouncementModal" src/` — 1 hit (layout, expected)
- [x] `npm run check` — same 4 pre-existing transaction.ts errors; zero new errors
- [x] `npm test -- --run` — 429 passed / 1 skipped / 23 test files (matches 01-01 baseline)
- [x] Both task commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `f5475d6`, `cc6d5b5`

## Operational Notes

- **Manual smoke test (recorded, not executed):** Open `/` (landing) or `/dashboard` in dev with `localStorage.removeItem('st0x_token_swap_announcement_seen')` — TokenSwapAnnouncementModal should still appear on first mount. After clicking Dismiss or Swap Tokens, the key is set and the modal is hidden on subsequent loads.
- **No Vercel env changes required.** This plan deletes code only; no env vars (CRON_SECRET, ONRAMPER_*, etc.) are touched. Plan 01-03 owns Onramper env removal.
- **No Vercel KV / Blob writes affected.** The deleted endpoints were read-only; their KV/cache reads simply stop happening. KV entries written by the cron pipeline (TVL aggregates) are unaffected.

## Next Plan Readiness

- **Plan 01-03 (DEPR-03 Onramper) can proceed.** No state from 01-02 blocks it. `src/hooks.server.ts:237` (`path === '/api/onramper/sign-url'` carve-out) is still in place and will be Plan 01-03's responsibility to remove alongside the Onramper code.
- **Header.svelte cleanup follow-up:** Plan 01-03's DepositModal collapse may also touch Header — the mobile-menu rename in this plan ("Boost Rewards and Referrals" → "Referrals") leaves a coherent state for that work.
- **CACHE_KEYS prune** is logged for a future plan to handle when scope_guard relaxes (or when a plan-phase widens to include cache.ts).
- **Dead `'/rewards'` page-protection check** in hooks.server.ts:238 is logged for the next plan that touches hooks.server.ts (Sentry middleware in 01-04, request-id in 01-05, or Onramper carve-out removal in 01-03 — whichever lands first).

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
