---
phase: 04
plan: 09
subsystem: snapshots
tags: [phase-4, test, scraper, snapshot, edge-cases, TEST-04]
requirements: [TEST-04]
dependency_graph:
  requires:
    - src/lib/server/snapshots/scraper.ts (Phase 1 D-01 retain decision)
    - src/lib/server/snapshots/generator.test.ts (analog)
  provides:
    - edge-case coverage for 3 scraper failure categories (pagination boundary, legacy wrappedTokenTransfers fallback, transient subgraph failure)
  affects: []
tech_stack:
  added: []
  patterns:
    - vitest fetch-mocking with hand-built jsonResponse helper
    - per-subgraph fetch routing via URL substring discrimination
    - GraphQL operation discrimination via body substring check
key_files:
  created:
    - src/lib/server/snapshots/scraper.test.ts
  modified: []
decisions:
  - Used URL-substring discrimination to route mock fetch by subgraph (primary vs legacy) so each subgraph's pagination loop can be asserted independently without cross-talk.
  - Drove the legacy "Cannot query field" GraphQL error against the PRIMARY subgraph (fetchWrapped=true), because that is where the catch block at scraper.ts:189-205 actually executes. Legacy subgraphs are invoked with fetchWrapped=false and never issue wrapped queries.
metrics:
  duration_min: 6
  completed: 2026-05-01
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  it_blocks: 6
  describe_blocks: 3
---

# Phase 4 Plan 09: Snapshot Scraper Edge-Case Tests Summary

**One-liner:** Edge-case unit tests for `src/lib/server/snapshots/scraper.ts` pinning pagination boundary, legacy wrappedTokenTransfers fallback, and transient subgraph failure — completing TEST-04 per Phase 1 D-01 retain decision.

## What Was Built

A single co-located test file `src/lib/server/snapshots/scraper.test.ts` with 3 `describe` categories and 6 `it` blocks. All tests run under jsdom via `npm test` (no anvil tier).

### Categories Covered (per RESEARCH §"TEST-04 Resolution")

| Category | scraper.ts lines | it blocks | What's pinned |
|----------|------------------|-----------|---------------|
| Pagination boundary | 240-241 | 3 | `transfersHasMore = batch.length === BATCH_SIZE` (and the wrapped mirror). Asserts both `< BATCH_SIZE` termination AND exact-multiple `BATCH_SIZE then 0` termination. A regression to `>=` or `>` fails the boundary test. |
| Legacy wrappedTokenTransfers fallback | 189-205 | 1 | GraphQL "Cannot query field \"wrappedTokenTransfers\"" error from a not-yet-migrated subgraph triggers `wrappedHasMore = false`, `console.warn` fires with the legacy-fallback message, sharesTransfers loop continues, no throw escapes. |
| Transient subgraph failure | 269-281 | 2 | Outer per-subgraph catch swallows both HTTP 503 (via `!response.ok` throw) and network rejections (TypeError); `console.warn` fires; failing subgraph contributes [] while other subgraphs still merge their results. |

## Mock Architecture

- `vi.mock('$lib/config/networks', ...)` provides a 2-subgraph config (1 primary + 1 legacy) so the transient-failure test can prove that a partial failure does not poison merged output.
- `vi.mock('$lib/config/tokens', ...)` provides a minimal `TOKENS` array + `getAllTokenAddressesFlat()` stub — required because `scraper.ts` calls them at module-load time.
- `global.fetch = vi.fn()` per test, with `mockImplementation` routing by URL substring (`legacy`) and GraphQL operation (`sharesTransfers` vs `wrappedTokenTransfers` body match).
- `jsonResponse(body, ok, status)` helper mirrors `generator.test.ts:67-73` exactly.

## MEMORY.md Invariant Honored

> "SFT subgraph sharesTransfers already includes mints (from 0x0) and burns (to 0x0). Do NOT also fetch depositWithReceipts or withdrawWithReceipts — they duplicate the same events and cause double-counting."

The test file does NOT mock or reference `depositWithReceipts` or `withdrawWithReceipts`. The mock fetch only handles `sharesTransfers` and `wrappedTokenTransfers` queries — matching the scraper's actual surface. A future regression that re-introduces deposit/withdraw fetching would have no mock coverage and trip up this suite immediately.

## Threat Model Coverage

| Threat ID | Disposition | Test that mitigates |
|-----------|-------------|---------------------|
| T-04-09-01 (Tampering — silent wrong totals) | mitigate | Pagination tests assert exact call counts; a `>= BATCH_SIZE` regression would issue an unbounded loop and fail the boundary test. |
| T-04-09-02 (Repudiation — silent prod failure) | mitigate | Both transient-failure tests assert `console.warn` is called. Preserves OBS-04 observability surface. |

## Verification Results

- `npm test -- src/lib/server/snapshots/scraper.test.ts --run` → 6/6 pass (~14ms)
- `npm test -- --run` (full suite) → 51 files, 661 tests pass, 1 skipped (no cross-file mock leakage)
- `npm run check` → 3 errors / 0 warnings — **baseline preserved unchanged** (the 3 errors are pre-existing in `tests/lib/server/rpcMetrics.test.ts` from Phase 3, unrelated to this plan)
- File evidence:
  - `test -f src/lib/server/snapshots/scraper.test.ts` → exists
  - `grep -c 'describe(' src/lib/server/snapshots/scraper.test.ts` → 3
  - `grep -c 'it(' src/lib/server/snapshots/scraper.test.ts` → 6
  - `grep -E '(pagination|wrappedTokenTransfers|transient)' src/lib/server/snapshots/scraper.test.ts` → multiple matches across all 3 categories

## Deviations from Plan

None — plan executed as written. The plan's example test stubs used a single-network mock; the executed code uses a 2-network mock (primary + legacy) because the transient-failure test materially requires a second subgraph to assert the merge-after-failure behavior. This matches the plan's `acceptance_criteria` ("other subgraph results still merge") and is not a deviation from intent.

## Commits

- `11cd971` — `test(04-09): add edge-case tests for snapshot scraper (TEST-04)`

## Self-Check: PASSED

- `src/lib/server/snapshots/scraper.test.ts` exists ✓
- Commit `11cd971` exists in git log ✓
- All 6 acceptance-criteria evidence checks pass ✓
- TEST-04 acceptance: 3 RESEARCH categories covered, npm test green, svelte-check baseline preserved, MEMORY.md invariant honored ✓
