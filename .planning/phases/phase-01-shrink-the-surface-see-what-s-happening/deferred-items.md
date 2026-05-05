# Phase 1 — Deferred Items

Out-of-scope discoveries logged during plan execution. Per executor SCOPE BOUNDARY rule:
do not auto-fix issues unrelated to the current task's changes; log here so the team picks
them up later.

## Pre-existing svelte-check errors (discovered during 01-01)

`src/lib/stores/transaction.ts` has 4 pre-existing TypeScript errors (`Argument of type
'unknown' is not assignable to parameter of type 'DeploymentTransactionArgs'`) at lines
664, 686, 708, 2346. These predate Phase 1 and are unrelated to DEPR-02's deletion graph.

The transaction.ts file is the 2373-line bug-factory flagged in CLAUDE.md and CONCERNS.md;
fixing these errors is part of the Phase 2 trade-execution backbone refactor (TRADE-01..04)
or a precursor cleanup, not Phase 1. svelte-check thus does not exit 0 even on a clean
working tree against the parent branch — Plan 01-01 acceptance criteria treat "no NEW
errors introduced by this plan" as the operative bar.

Discovered: 2026-04-29 in Plan 01-01 (DEPR-02 admin-rewards prune)

## Orphaned rewards-specific CACHE_KEYS entries (discovered during 01-02)

`src/lib/server/cache.ts` exports `CACHE_KEYS` (line 140+) which still includes rewards-only
keys (`rewardsUserSharedData`, `rewardsLeaderboard`, `rewardsPoolApy`, `rewardsGlobalData`,
`rewardsApy`, `rocketboost`, `allWalletData`). After Plan 01-02 deleted all rewards APIs and
their public-rewards companions (`/api/rewards/{user,leaderboard,global,pool-apy}`,
`/api/public/{wallet,rewards-apy,rocketboost}`), no surviving caller reads or writes any of
these keys.

The plan's `files_modified` does NOT include `src/lib/server/cache.ts`, and the surviving
`CACHE_KEYS` consumers (referrals leaderboard, nansen tiers, public TVL/trade-activity) use
unrelated entries — pruning the rewards keys is a clean follow-up but is out-of-scope for 01-02
per the orchestrator's `scope_guard`. The dead-code comment block at `cache.ts:48-53` (added
in 01-01) also references `/api/rewards/* and /api/public/*` in present tense and should be
updated when the keys are pruned.

**Recommended fix:** delete the rewards-only keys from `CACHE_KEYS` and replace the cache.ts
dead-code comment block with a final-state note. Defer to Phase 2 or a follow-up cleanup
plan in Phase 1 if a planner widens scope.

Discovered: 2026-04-29 in Plan 01-02 (DEPR-01 user-facing rewards prune)

## Dead `/rewards` protected-page check in hooks.server.ts (discovered during 01-02)

`src/hooks.server.ts:238` includes `path === '/rewards'` in the wallet-registration check
for protected pages. After Plan 01-02 deleted the rewards UI, no `/rewards` route file exists
under `src/routes/(main)/` or anywhere else — `find src/routes -path "*rewards*" -not -path
"*/api/*"` returns 0 hits. The check is dead code.

Out of scope for 01-02 per `files_modified` and the orchestrator's scope_guard
(hooks.server.ts wholesale touch belongs to Plans 01-04..06 per the orchestrator notes).
Recommended fix: when the next plan edits hooks.server.ts (Sentry CSP / pino middleware /
Onramper carve-out), drop `'/rewards'` from the protected-pages check on line 238.

Discovered: 2026-04-29 in Plan 01-02 (DEPR-01 user-facing rewards prune)

