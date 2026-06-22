---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 01
subsystem: infra
tags: [snapshots, rewards, deletion, deprecation, vercel-cron, vercel-blob, kv]

# Dependency graph
requires: []
provides:
  - "Pruned admin rewards UI surface (4933-line +page.svelte deleted, /api/admin/rewards-pool deleted)"
  - "Pruned per-wallet monthly points pipeline (points.ts + /api/snapshots/points + recalculate endpoint deleted)"
  - "Cron + preview snapshot pipeline writes only TVL + per-token volume aggregates going forward"
  - "MonthlyPointsData/RewardsPoolConfig types retained in kv.ts with D-04 legacy-data tolerance comment"
  - "LP_SUBGRAPH_URL env wiring removed from .env.example"
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-but-document: D-04 legacy data tolerance — type/KV-key retention is intentional when surviving readers exist"
    - "Cross-plan import retargeting: when deleting a re-export module, retarget broken imports to the source module rather than touching files reserved for future plans"

key-files:
  created: []
  modified:
    - "src/routes/admin/+layout.svelte (Rewards nav entry removed)"
    - "src/lib/server/snapshots/processor.ts (D-03/D-04 comment header)"
    - "src/lib/server/snapshots/index.ts (./points re-export removed)"
    - "src/lib/server/cache.ts (invalidateRewardsCaches + invalidatePublicApiCaches deleted)"
    - "src/lib/server/kv.ts (D-04 comment block above MonthlyPointsData + KV key map)"
    - "src/routes/api/cron/snapshots/+server.ts (updateMonthlyPoints + invalidateRewardsCaches calls removed)"
    - "src/routes/api/snapshots/preview/+server.ts (points step replaced with wallet-holdings aggregation)"
    - "src/routes/api/snapshots/preview-stream/+server.ts (same; SSE per-token progress preserved)"
    - "src/routes/api/admin/snapshots/trigger/+server.ts (points + rewards-cache calls dropped)"
    - "src/routes/api/admin/snapshots/regenerate/+server.ts (misleading 'Recalculate Points' message removed)"
    - "src/routes/api/rewards/global/+server.ts (computeProjectedDailyPoints retargeted to $lib/utils/points)"
    - "src/routes/api/public/rewards-apy/+server.ts (same retarget)"
    - "src/routes/api/public/rocketboost/+server.ts (same retarget)"
    - ".env.example (LP_SUBGRAPH_URL entry + comment block removed)"

key-decisions:
  - "Defer deletion of src/lib/server/rewards/rewardsCommon.ts — it has 8 surviving consumers including admin/referral-programme/leaderboard which is NOT in 01-02's scope"
  - "Retarget computeProjectedDailyPoints imports to $lib/utils/points (source) rather than restoring a stub re-export at the deleted path"
  - "Delete /api/admin/snapshots/recalculate/+server.ts entirely — its sole purpose was monthly-points recalculation; no surviving function once points pipeline goes"
  - "Retain /api/admin/snapshots/{trigger,regenerate}/+server.ts — they generate TVL/volume blobs that admin views consume; only the points-related code paths were removed"

patterns-established:
  - "D-04 legacy data tolerance: when a writer is deleted but readers in retained code (referrals.ts) still touch the same KV keys/types, document the orphaned-fields condition inline rather than ripping types out and breaking surviving consumers"
  - "Pre-deletion grep audit (Pitfall 5) caught a planning error: rewardsCommon.ts has cross-plan consumers; this was deferred to a later plan rather than violating the orchestrator's scope_guard"

requirements-completed: [DEPR-02]

# Metrics
duration: 17min
completed: 2026-04-29
---

# Phase 1 Plan 01: Admin rewards UI + per-wallet points pipeline pruned (DEPR-02)

**Deleted 4933-line admin rewards UI, the per-wallet monthly points calculation pipeline, two rewards-cache invalidation helpers, and the LP_SUBGRAPH_URL env wiring; cron + preview snapshot pipelines now write only TVL + per-token volume aggregates while retaining the orderbook excluded-wallet logic and Nansen integration.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-29T09:29:43Z
- **Completed:** 2026-04-29T09:46:55Z
- **Tasks:** 3 of 3 (all atomic, all committed)
- **Files modified:** 14
- **Files deleted:** 5

## Accomplishments

- Admin rewards UI gone: 4933-line `src/routes/admin/rewards/+page.svelte` deleted; `Rewards` nav entry removed from `src/routes/admin/+layout.svelte`; `src/routes/api/admin/rewards-pool/+server.ts` deleted.
- Per-wallet monthly points pipeline gone: `src/lib/server/snapshots/points.ts` (328 lines), `src/routes/api/snapshots/points/+server.ts`, and `src/routes/api/admin/snapshots/recalculate/+server.ts` (points-only recalc tool, no surviving function) all deleted.
- Cron + preview routes unwired: `cron/snapshots`, `snapshots/preview`, `snapshots/preview-stream`, `admin/snapshots/{trigger,regenerate}` no longer call `updateMonthlyPoints` or `invalidateRewardsCaches`. The cron continues writing per-token TVL/volume blobs and the daily snapshot block records.
- Surviving snapshot pipeline writes only TVL + per-token volume aggregates: preview routes now aggregate wallet holdings + USD value across token snapshots; SSE per-token progress preserved on preview-stream.
- D-04 legacy-data tolerance documented: `kv.ts` carries an inline comment block explaining that `MonthlyPointsData` / `RewardsPoolConfig` types and the `monthlyPoints` / `rewardsPool` KV keys are retained because `referrals.ts` (KEPT per D-14) still reads them; existing KV/Blob entries are left as-is.
- `LP_SUBGRAPH_URL` removed from `.env.example` (rewards-only Goldsky subgraph slug `st0x-rewards-base/1.0.23` confirmed scope). `src/lib/config/networks.ts` had no consumer, so no code change needed there. **Manual deploy-time step:** remove `LP_SUBGRAPH_URL` from Vercel project env settings.
- Nansen integration UNTOUCHED per D-02: `src/lib/server/nansenTiers.ts`, `/api/nansen/tiers`, `/api/admin/nansen` all survive with original behavior; the `/api/nansen/tiers` public-paths classification in `hooks.server.ts` is intact.
- Orderbook excluded-wallet logic UNTOUCHED: `getRewardsExcludedWalletsSet()` in `kv.ts` has 5 surviving consumers including `src/lib/server/snapshots/generator.ts` and `src/lib/server/referrals.ts`.

## Task Commits

Each task was committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Delete admin rewards UI + admin rewards-pool endpoint + admin nav link** — `fd2f3af` (chore)
2. **Task 2: Delete points pipeline + unwire from preview/cron/processor + admin snapshots cleanup** — `87f2999` (chore)
3. **Task 3: Remove LP_SUBGRAPH_URL wiring (D-05)** — `16c0a29` (chore)

(Final docs/metadata commit will follow this SUMMARY.md and STATE.md/ROADMAP.md updates.)

## Files Created/Modified

**Deleted (5):**
- `src/routes/admin/rewards/+page.svelte` — 4933-line admin rewards UI
- `src/routes/api/admin/rewards-pool/+server.ts` — rewards pool config CRUD endpoint
- `src/lib/server/snapshots/points.ts` — per-wallet points calc + WalletPointsMap helpers
- `src/routes/api/snapshots/points/+server.ts` — public monthly points API
- `src/routes/api/admin/snapshots/recalculate/+server.ts` — points-only recalculation tool

**Modified (14):**
- `src/routes/admin/+layout.svelte` — `Rewards` nav entry removed
- `src/lib/server/snapshots/processor.ts` — D-03/D-04 comment header (no functional change)
- `src/lib/server/snapshots/index.ts` — dropped `export * from './points'`
- `src/lib/server/cache.ts` — deleted `invalidateRewardsCaches()` + `invalidatePublicApiCaches()`
- `src/lib/server/kv.ts` — D-04 comment block above `MonthlyPointsData` + `KV_KEYS` map
- `src/routes/api/cron/snapshots/+server.ts` — removed `updateMonthlyPoints` + `invalidateRewardsCaches` import + calls
- `src/routes/api/snapshots/preview/+server.ts` — points step replaced with wallet-holdings aggregation; step counter renumbered 1/5..5/5
- `src/routes/api/snapshots/preview-stream/+server.ts` — same change with SSE per-token progress preserved
- `src/routes/api/admin/snapshots/trigger/+server.ts` — points + rewards-cache calls dropped
- `src/routes/api/admin/snapshots/regenerate/+server.ts` — misleading "Use the Recalculate Points button" message replaced
- `src/routes/api/rewards/global/+server.ts` — `computeProjectedDailyPoints` retargeted to `$lib/utils/points`
- `src/routes/api/public/rewards-apy/+server.ts` — same retarget
- `src/routes/api/public/rocketboost/+server.ts` — same retarget
- `.env.example` — `LP_SUBGRAPH_URL` entry + surrounding comment block removed

## Decisions Made

- **Defer `src/lib/server/rewards/rewardsCommon.ts` deletion to a later plan.** Pre-deletion grep audit (Pitfall 5) discovered 8 surviving consumers across BOTH 01-02's scope (`/api/rewards/{user,leaderboard,pool-apy,global}` and `/api/public/{wallet,rewards-apy,rocketboost}`) AND outside 01-02's scope (`/api/admin/referral-programme/leaderboard/+server.ts` imports `getCurrentMonth`). Deleting `rewardsCommon.ts` now would break files Plan 01-01 may not touch per the orchestrator's `scope_guard` AND would leave one consumer broken even after 01-02 finishes. See **Deviations** below.
- **Retarget `computeProjectedDailyPoints` imports to `$lib/utils/points`.** Three 01-02-owned files imported this from `points.ts` (which was a thin re-export of `$lib/utils/points`). Retargeting the imports is a one-line mechanical fix that keeps svelte-check green during the wave gap; the alternative — leaving a stub re-export at `$lib/server/snapshots/points` — would violate the must_have "points.ts DELETED".
- **Delete `/api/admin/snapshots/recalculate/+server.ts` entirely.** Its sole purpose was per-month points recalculation from existing blob snapshots; with the points pipeline removed (D-03), it has no surviving function. The plan's action text instructed: "If the entire file's purpose was points recalculation (verify by reading), DELETE the file."
- **Retain `/api/admin/snapshots/{trigger,regenerate}`.** Both have admin-gated TVL/volume blob generation logic that survives the rewards prune. Trigger generates ad-hoc daily snapshots; regenerate rewrites blobs from existing block records using updated code. Only their points-related code paths were removed.

## Deviations from Plan

### Deferred Items

**1. [Rule 4 — Architectural / planning gap] Defer `src/lib/server/rewards/rewardsCommon.ts` deletion**
- **Found during:** Task 2 (pre-deletion grep audit per Pitfall 5)
- **Issue:** The plan's must_haves list `src/lib/server/rewards/rewardsCommon.ts` as DELETED. But `rewardsCommon.ts` exports `getCurrentMonth` / `getDaysInMonth` / `fetchRewardsData` / `calculateTotalPoints` / `calculateRocketBoostAmount` and has consumers in:
  - `/api/rewards/{user,leaderboard,pool-apy,global}/+server.ts` (DELETED in Plan 01-02)
  - `/api/public/{wallet,rewards-apy,rocketboost}/+server.ts` (DELETED in Plan 01-02)
  - `/api/admin/referral-programme/leaderboard/+server.ts` (NOT in 01-02's `files_modified`; imports `getCurrentMonth` only)
- **Why this matters:** Plan 01-02's scope deletes all rewards-API consumers but does NOT touch the admin referral-programme leaderboard. After 01-02 finishes, `rewardsCommon.ts` would still have one importer. The orchestrator's `scope_guard` for 01-01 explicitly forbids touching files reserved for later plans, so I cannot proactively edit the admin-referral leaderboard either.
- **Fix:** Left `rewardsCommon.ts` in place. svelte-check passes (the type/helper functions still resolve). All other planned deletions executed normally.
- **Recommendation for next plan owner:** When 01-02 (or whichever plan deletes admin/referral-programme/leaderboard, or refactors `getCurrentMonth` into a non-rewards location) runs, also delete `rewardsCommon.ts`. The cleanest fix is to extract `getCurrentMonth` + `getDaysInMonth` into a non-rewards utility module (e.g., `$lib/utils/dates.ts`), update the admin-referral leaderboard's import, then delete `rewardsCommon.ts` along with its other rewards-API consumers in 01-02.
- **Verification:** `npm run check` exits with 4 pre-existing transaction.ts errors (deferred, see Issues Encountered) — no new errors introduced. All 429 vitest tests pass.

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Retargeted `computeProjectedDailyPoints` imports**
- **Found during:** Task 2 (post-deletion svelte-check)
- **Issue:** Three files in Plan 01-02's deletion scope (`/api/rewards/global`, `/api/public/rewards-apy`, `/api/public/rocketboost`) imported `computeProjectedDailyPoints` from `$lib/server/snapshots/points` — a re-export the deleted `points.ts` carried at line 328 (`export { computeProjectedDailyPoints } from '$lib/utils/points'`). Deleting `points.ts` therefore created 3 broken imports that would cascade-fail svelte-check.
- **Fix:** Retargeted each of the 3 import statements directly to `$lib/utils/points` (the source module, which is unaffected). One-line mechanical change per file; no logic change. The function lives in the same place; only the import path moved up the re-export chain.
- **Files modified:** `src/routes/api/rewards/global/+server.ts:9`, `src/routes/api/public/rewards-apy/+server.ts:6`, `src/routes/api/public/rocketboost/+server.ts:7`
- **Verification:** `npm run check` shows the 3 new errors disappear; only the 4 pre-existing transaction.ts errors remain.
- **Committed in:** `87f2999` (Task 2 commit)

**2. [Rule 3 — Blocking] Deleted `recalculate/+server.ts` entirely (plan said "DELETE if purpose was points recalc")**
- **Found during:** Task 2
- **Issue:** Plan said to "Inspect each file. If it imports from `$lib/server/snapshots/points` or from `$lib/server/rewards/rewardsCommon`, remove those imports and the call sites. If the entire file's purpose was points recalculation (verify by reading), DELETE the file." On reading, `recalculate/+server.ts` was 207 lines that all serve `[Recalculate] Starting recalculation for ${month}` — every code path orchestrates blob fetch → `calculateWalletPointsFromSnapshots` → KV write of `MonthlyPointsData`. With the points pipeline gone, no surviving function.
- **Fix:** Deleted the entire file and removed the empty `recalculate/` directory. All sole-caller paths from the deleted admin/rewards UI are gone.
- **Verification:** `grep -rn "admin/snapshots/recalculate"` returns 0 hits across `src/`.
- **Committed in:** `87f2999` (Task 2 commit)

---

**Total deviations:** 1 deferred (Rule 4 — planning gap on rewardsCommon.ts), 2 auto-fixed (Rule 3 — blocking import + plan-instructed delete).
**Impact on plan:** All 3 must_haves except `rewardsCommon.ts deleted` were satisfied. `rewardsCommon.ts` deferral does not affect this plan's outcome — the per-wallet points pipeline is fully gone, the admin rewards UI is gone, and the LP_SUBGRAPH_URL is gone. Recommend the next plan owner relocate `getCurrentMonth`/`getDaysInMonth` into `$lib/utils/dates.ts` (or similar) before deleting `rewardsCommon.ts`.

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors (`Argument of type 'unknown' is not assignable to parameter of type 'DeploymentTransactionArgs'` at lines 664, 686, 708, 2346) predate Phase 1. They are unrelated to DEPR-02 and are flagged by CLAUDE.md / CONCERNS.md as Phase 2 work (the 2373-line transaction.ts is the bug-factory targeted by TRADE-02 in Phase 2). Logged in `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/deferred-items.md`.
- **`processor.ts` did NOT contain a points calc step (plan's Task 2 step 7 was off):** All per-wallet points logic lived exclusively in `points.ts`. Processor.ts handles balance replay + vault holdings + excluded-wallet flagging only. Action taken: added the planned D-03/D-04 comment header to `processor.ts` as documentation, since the plan's intent (mark the boundary) is satisfied even when no code-line removal applies.
- **`processor.ts` does NOT directly import `getRewardsExcludedWalletsSet`:** It accepts `dynamicExcluded: string[]` as a parameter. The acceptance criterion `grep -q "getRewardsExcludedWalletsSet" src/lib/server/snapshots/processor.ts` thus does not apply to this file — but the surviving call site lives in `generator.ts:9,118,151` (which is NOT modified by this plan) and `referrals.ts:8,323`. The orderbook excluded-wallet logic survives intact.

## Threat Flags

None. All deletions were surgical against an audited file list. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced.

## Self-Check: PASSED

- [x] `! test -f src/routes/admin/rewards/+page.svelte` — verified deleted
- [x] `! test -f src/routes/api/admin/rewards-pool/+server.ts` — verified deleted
- [x] `! test -f src/lib/server/snapshots/points.ts` — verified deleted
- [x] `! test -f src/routes/api/snapshots/points/+server.ts` — verified deleted
- [x] `! test -f src/routes/api/admin/snapshots/recalculate/+server.ts` — verified deleted (deviation: file deleted entirely per plan instruction)
- [x] `grep -r "updateMonthlyPoints" src/` returns 0 hits
- [x] `grep -r "LP_SUBGRAPH_URL" src/ .env.example` returns 0 hits
- [x] `grep "nansen" src/lib/server/nansenTiers.ts` returns ≥1 hit (Nansen retained per D-02)
- [x] `grep -l "getRewardsExcludedWalletsSet" src/` returns ≥1 hit (5 files, orderbook excluded-wallet logic retained)
- [x] `grep -q "MonthlyPointsData" src/lib/server/kv.ts` (type retained for referrals.ts consumer per D-14/D-04)
- [x] D-04 comment present in `kv.ts` and `processor.ts`
- [x] `npm run check` shows only the 4 pre-existing transaction.ts errors (no new errors introduced by this plan)
- [x] `npm test -- --run` shows 429 passed, 1 skipped (test suite green)
- [x] All 3 commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `fd2f3af`, `87f2999`, `16c0a29`

## Operational Notes (deploy-time)

- **Manual Vercel project env removal:** Remove `LP_SUBGRAPH_URL` from the Vercel project's environment-variables panel (Production / Preview / Development). The code change in this plan removes the variable from `.env.example` only; the Vercel-side value must be removed by an operator with project access. Per D-05 / RESEARCH §A9, no surviving code consumes this variable.
- **Existing Vercel Blob snapshots and KV entries left as-is:** Per D-04, blobs at `snapshots/{tokenSymbol}/{blockNumber}.json` containing legacy points/rewards fields and KV entries at `snapshots:points:YYYY-MM` / `rewards:pool:YYYY-MM` are NOT backfilled or wiped. New blobs going forward use the pruned schema (no points fields). Historical TVL series remain readable; the unused fields are ignored by surviving readers.
- **Cron schedule unchanged:** Vercel cron at `/api/cron/snapshots` continues to run on its existing schedule (per `vercel.json`); this plan only removes the per-wallet points step inside the handler.

## Next Plan Readiness

- Plan 01-02 (DEPR-01, user-facing rewards) can proceed. Its deletion targets in `/api/rewards/*` and `/api/public/{wallet,rewards-apy,rocketboost}/*` already had their `computeProjectedDailyPoints` imports retargeted to the source module (no stale dependency on the deleted `points.ts`).
- **Action item for 01-02 (or a follow-up plan):** before deleting `rewardsCommon.ts`, relocate `getCurrentMonth` + `getDaysInMonth` into `$lib/utils/dates.ts` (or similar) and update the surviving consumer at `src/routes/api/admin/referral-programme/leaderboard/+server.ts:6`. Otherwise that endpoint will fail at build time.
- The cron's TVL/volume pipeline is intact: `getRewardsExcludedWalletsSet()` retained in `generator.ts`; per-token blob writes proceed normally; KV `snapshotBlocks` master list still maintained.
- Plan 01-06 (OBS-04 RPC instrumentation) is unblocked — it will instrument `cron/snapshots/+server.ts:callRpc` (in `generator.ts`), and the cron is now stripped of the dead `updateMonthlyPoints` call as the prerequisite per RESEARCH §"Sequencing".

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
