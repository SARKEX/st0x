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
