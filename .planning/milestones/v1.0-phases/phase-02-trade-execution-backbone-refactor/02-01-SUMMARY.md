---
phase: 02-trade-execution-backbone-refactor
plan: 02-01
subsystem: trade-execution
tags: [eslint, ts-morph, codemod, ast, typescript, svelte, io-perspective, no-restricted-syntax]

# Dependency graph
requires:
  - phase: 01-shrink-the-surface-see-what-s-happening
    provides: "Phase 1 closed; svelte-check baseline (4 transaction.ts + 3 rpcMetrics test = 7 errors); failWith() seam in marketOrderExecution.ts at 9 call sites which now route IO reads through the canonical accessors"
provides:
  - "4 canonical accessor wrappers in src/lib/types/orderPerspective.ts: getMakerInputTokenAddress, getMakerOutputTokenAddress, getMakerInputIOIndex, getMakerOutputIOIndex"
  - "ESLint no-restricted-syntax rule banning direct .inputTokenAddress / .outputTokenAddress / .inputIOIndex / .outputIOIndex MemberExpression reads outside the IO-perspective allowlist"
  - "Codemod harness scripts/codemod-trade-01.ts (one-shot ts-morph rewriter; 43 .ts reads migrated)"
  - "Hand-edited migration of 14 reads across 4 .svelte files (QuickTrade, MarketOrder, trade/[id]/+page, dashboard/+page)"
  - "tests/fixtures/io-perspective-violation.ts — intentionally fails lint to prove the rule fires"
  - "5 unit tests pinning round-trip behavior of the 4 accessors (tests/lib/types/orderPerspective.test.ts)"
  - "Allowlist: src/lib/types/orderPerspective.ts (canonical), src/lib/utils/orderbook.ts (ProcessedQuote interface), src/lib/api/orders.ts (convertApiOrderToProcessedQuote populator), src/generated-graphql.ts (codegen output)"
affects:
  - 02-02-transaction-store-split (will import the accessors when splitting transaction.ts)
  - 02-03-freshness-illusion-preflight (pre-flight transcript reads route through the same accessors)
  - 02-04-execution-math-symmetry (mode×side test cases assert IO semantics structurally)
  - 02-05/02-06/02-07 (PERF-01 — orthogonal but landings on same pages must keep ESLint rule green)
  - 02-08 (phase-exit re-runs the grep gate)

# Tech tracking
tech-stack:
  added: ["ts-morph@28.0.0 (devDep, codemod harness)"]
  patterns:
    - "Field-only structural-generic accessor pattern: <T extends { field?: unknown }>(o: T): T['field']"
    - "Codemod-first then flip-the-rule (Decision D-02) — migrate call sites before activating ban"
    - "ESLint no-restricted-syntax MemberExpression selector for property-name bans (avoids fork-of-rule complexity)"
    - "Lint fixture file convention: tests/fixtures/*.ts holds intentionally-failing lint examples; outside Vitest's *.test.ts glob"
    - "Reverse-iteration codemod walking — descendant rewrites don't invalidate outer collected nodes"

key-files:
  created:
    - "scripts/codemod-trade-01.ts (one-shot ts-morph rewriter)"
    - "tests/fixtures/io-perspective-violation.ts (lint-rule fixture)"
  modified:
    - "src/lib/types/orderPerspective.ts (+4 accessor wrappers, structural-generic typed)"
    - "tests/lib/types/orderPerspective.test.ts (+5 tests; total now 17)"
    - "eslint.config.js (no-restricted-syntax block + 4-file allowlist)"
    - "package.json + package-lock.json (ts-morph@28.0.0 devDep)"
    - "src/lib/queries/orderbook.ts (4 codemod rewrites)"
    - "src/lib/services/marketOrderExecution.ts (5 codemod rewrites — preserves failWith() seam)"
    - "src/lib/stores/transaction.ts (24 codemod rewrites — largest single migration)"
    - "src/lib/utils/tokenMath.ts (2 codemod rewrites in describeQuote)"
    - "src/lib/utils/transactionDisplay.ts (1 codemod rewrite in summary→display)"
    - "src/lib/components/QuickTrade.svelte (4 hand-edits)"
    - "src/lib/components/orders/MarketOrder.svelte (6 hand-edits across 3 sites)"
    - "src/routes/(main)/trade/[id]/+page.svelte (8 hand-edits across 4 sites)"
    - "src/routes/(main)/dashboard/+page.svelte (1 hand-edit)"

key-decisions:
  - "Accessor type signatures are field-only structural generics, not `quote: ProcessedQuote`"
  - "Codemod iterates PropertyAccessExpression descendants in REVERSE so nested matches don't invalidate outer collected nodes"
  - "Codemod skips .svelte files entirely; those 14 hand-edits are cheaper than building a Svelte-preprocessor extraction step"
  - "`scripts/codemod-trade-01.ts` is committed with the migration PR (not deleted post-run); Plan 02-08 phase-exit decides on deletion"
  - "Allowlist contains exactly the 4 files identified in CONTEXT D-02 + the codegen exclusion already present"
  - "Plan-stated baselines (19 existing tests, 447 total tests) didn't match actual repo (12 + 468 respectively); tracked but does not affect any acceptance criterion"
  - "Plan-stated count of 88 sites was a planning-time count; current repo has 57 raw read sites — 43 .ts (codemod) + 14 .svelte (hand-edit). Ratio same; smaller absolute"

patterns-established:
  - "Type-transparent accessor wrapper: returns whatever type the field is declared as on the receiver, by using `T['field']` lookup type — preserves optional semantics across diverse receivers (ProcessedQuote / inline shapes / SDK types)"
  - "ESLint flat-config rule placement: rule blocks go after the global ignores block; per-rule allowlist via the block's own `ignores` field"
  - "Codemod re-import insertion using getImportDeclaration + addNamedImports so existing `from '$lib/types/orderPerspective'` imports get extended, not duplicated"
  - "Lint-fixture convention: tests/fixtures/*.ts is auto-excluded from Vitest's test glob (vite.config.js test glob is tests/**/*.{test,spec}.{js,ts}) — fixtures don't run as tests but ARE picked up by ESLint"

requirements-completed: [TRADE-01]

# Metrics
duration: ~11min
completed: 2026-04-29
---

# Phase 02 Plan 01: Codify INPUT/OUTPUT Side-Semantics Summary

**ESLint structural ban on raw `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex` MemberExpression reads, with 57 existing call sites migrated to 4 canonical accessor wrappers in `src/lib/types/orderPerspective.ts` (43 by ts-morph codemod across 5 .ts files, 14 by hand-edit across 4 .svelte files), and a permanent fixture file proving the rule fires in CI.**

## Performance

- **Duration:** 10m52s
- **Started:** 2026-04-29T20:31:45Z
- **Completed:** 2026-04-29T20:42:37Z
- **Tasks:** 2
- **Files modified:** 12 (10 source/config + 2 created)

## Accomplishments

- 4 canonical accessor wrappers exported from `$lib/types/orderPerspective` with JSDoc: `getMakerInputTokenAddress`, `getMakerOutputTokenAddress`, `getMakerInputIOIndex`, `getMakerOutputIOIndex`. Structural-generic signatures (`<T extends { field?: unknown }>`) make them type-transparent across the diverse receiver shapes the codebase exposes (`ProcessedQuote`, the inline shape in `transaction.ts:handleRemoveOrder`, `QuoteLike` in `tokenMath.ts`, `TakeOrderConfigV4` from the Rain SDK with `inputIOIndex: string`).
- ESLint `no-restricted-syntax` rule active in `eslint.config.js` with a `MemberExpression[property.name=/^(...)$/]` selector that fires only on property reads (not declarations or object-literal keys). 4-file allowlist matches Decision D-02. Per-callsite escape requires `// eslint-disable-next-line no-restricted-syntax -- justification: ...` (currently 0 such escapes anywhere in the repo).
- `tests/fixtures/io-perspective-violation.ts` permanently demonstrates the rule fires (4 errors when linted) — gives Plan 02-08 phase-exit a concrete pass/fail signal beyond the grep gate.
- 5 new unit tests (total now 17 in `tests/lib/types/orderPerspective.test.ts`) pin round-trip behavior of all 4 accessors plus their primitive return types.
- Phase-exit grep gate returns 0 raw reads outside the allowlist + fixture.
- svelte-check baseline preserved at 7 errors (unchanged from Phase 1 close).
- Test suite: 473 tests pass (468 baseline + 5 new). 0 regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install ts-morph + add 4 accessor wrappers + helper tests (TDD)** — `f090790` (feat)
   - TDD RED commit folded into the GREEN commit: tests authored first (failed locally), then implementation, then re-tested. Single commit per repo convention since the diff is small and self-contained; the commit message documents both phases.
2. **Task 2: Author + run codemod, hand-edit .svelte files, add ESLint rule, add fixture** — `2fa6419` (refactor)
   - Single atomic commit per Decision D-02 ("codemod-first, then flip"). 13 files changed, 299 insertions, 85 deletions.

## Files Created/Modified

**Created:**
- `scripts/codemod-trade-01.ts` — one-shot ts-morph rewriter; reverse-iterates PropertyAccessExpression descendants to handle nested matches (e.g. `fill.quote.inputIOIndex`); skips `.svelte` files; uses an in-file allowlist as a fail-safe parallel to the ESLint allowlist; auto-merges new imports into existing `from '$lib/types/orderPerspective'` declarations.
- `tests/fixtures/io-perspective-violation.ts` — 4 banned property reads on a `ProcessedQuote` declaration. Documents in the file header that it is *expected* to fail lint and must NOT be allowlisted.

**Modified — Canonical accessor module:**
- `src/lib/types/orderPerspective.ts` — adds 4 generic accessor wrappers with JSDoc explaining the `T['field']` return-type design and how it serves multiple receiver shapes without forcing widening.

**Modified — Test surface:**
- `tests/lib/types/orderPerspective.test.ts` — adds a `TRADE-01 accessor wrappers` describe block with 5 tests covering each accessor + a primitive-type sanity check.

**Modified — Lint config:**
- `eslint.config.js` — appends a new flat-config block with `files: ['src/**/*.ts', 'src/**/*.svelte', 'tests/**/*.ts']`, the 4-file allowlist, and the `no-restricted-syntax` rule.

**Modified — Migrated codebase (codemod targets, .ts):**
- `src/lib/queries/orderbook.ts` — 4 reads in token-filter predicates
- `src/lib/services/marketOrderExecution.ts` — 5 reads (preserved `failWith()` seam unchanged; transcript IOIndex population now uses `getMakerInputIOIndex(firstQuote) ?? null` etc.)
- `src/lib/stores/transaction.ts` — 24 reads (largest single migration; covers `handleRemoveOrder` log objects, vault-discovery calls, post-confirmation polling, multi-tx orchestration)
- `src/lib/utils/tokenMath.ts` — 2 reads in `describeQuote(quote: QuoteLike)`
- `src/lib/utils/transactionDisplay.ts` — 1 read in `MarketOrderSummary` direction selector

**Modified — Hand-edited (.svelte targets):**
- `src/lib/components/QuickTrade.svelte` — 4 reads in askQuotes/bidQuotes filters
- `src/lib/components/orders/MarketOrder.svelte` — 6 reads in 3 quote-filter blocks
- `src/routes/(main)/trade/[id]/+page.svelte` — 8 reads (4 sites: user-orders filter, token-orders filter, two best-quote scanners)
- `src/routes/(main)/dashboard/+page.svelte` — 1 read in `tokenAddress = isBuy ? input : output` ternary

**Modified — Tooling:**
- `package.json` + `package-lock.json` — `ts-morph: ^28.0.0` added under devDependencies

## Decisions Made

- **Field-only structural generics for accessors.** Initial implementation typed `getMakerInputTokenAddress(quote: ProcessedQuote): string`, but the codemod correctly rewrote 14 sites where receivers are NOT `ProcessedQuote` (they're `QuoteLike`, partial inline shapes, or `TakeOrderConfigV4` with `inputIOIndex: string`). Fixing forward by widening the wrapper signature to `<T extends { inputTokenAddress?: unknown }>(quote: T): T['inputTokenAddress']` is structurally correct: the IO-perspective ban is about the **field name**, not a specific receiver type. The wrapper is now type-transparent — it returns whatever the field is declared as on the receiver. See "Deviations" Rule 1 below.
- **Reverse-iteration codemod walk.** Forward iteration crashed with `Attempted to get information from a node that was removed or forgotten` when an outer node like `fill.quote.inputIOIndex` was rewritten before the inner `fill.quote` PropertyAccessExpression — ts-morph invalidates the cached descendant. Reverse-iterating the descendants array (and adding a `wasForgotten()` guard) handles nested matches correctly without two passes.
- **Codemod skips `.svelte` files entirely.** Per RESEARCH §"Pattern 2", building a Svelte-preprocessor pass to extract the `<script lang="ts">` block, run ts-morph on it, and stitch back is more work than 14 hand-edits. The 14 hand-edits each look like `quote.inputTokenAddress` → `getMakerInputTokenAddress(quote)` — the same transformation, manually applied with the same accessor mapping the codemod uses.
- **Allowlist exactly D-02's 4 files.** No expansion. `convertApiOrderToProcessedQuote` in `src/lib/api/orders.ts` populates the fields from raw subgraph data — that's the boundary where the IO-perspective semantics enter the system, so it's allowlisted to write/read raw. Same logic for `utils/orderbook.ts` (defines `ProcessedQuote`) and the codegen output.
- **Codemod harness committed, not deleted.** Plan 02-08 phase-exit will decide. Keeping it lets future plans re-run the migration if new direct-read sites slip in via merges from a feature branch.
- **Single commit for Task 2.** Per Decision D-02 ("codemod-first, then flip" as one PR), the codemod, hand-edits, ESLint rule, fixture, and bug fix all land together. Splitting them would leave the working tree in a state where the rule is on but call sites haven't migrated (fails lint everywhere) or call sites migrated but rule is off (no enforcement).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Accessor signatures too narrow caused 31 svelte-check errors after codemod**

- **Found during:** Task 2, post-codemod verification
- **Issue:** Initial implementation in Task 1 declared `function getMakerInputTokenAddress(quote: ProcessedQuote): string`. The codemod correctly identified all 43 .ts read sites as IO-perspective reads and rewrote them, but 14 of those receivers were NOT `ProcessedQuote`:
  - `src/lib/utils/tokenMath.ts:391-392` — `describeQuote(quote: QuoteLike)` (a 3-field structural shape, not the full `ProcessedQuote`)
  - `src/lib/stores/transaction.ts:887-922, 1007, 1147-1205, 1246` — inline-typed `quote: { inputTokenAddress?: string; outputTokenAddress?: string; ... }` in `handleRemoveOrder` (optional fields)
  - `src/lib/stores/transaction.ts:2081-2225` — `TakeOrderConfigV4` from `@rainlanguage/orderbook` (with `inputIOIndex: string`, not `number`)
  - `src/lib/services/marketOrderExecution.ts:341-342, 458-459` — `firstQuote` is structurally narrowed during transcript population
- **Fix:** Widened all 4 accessor signatures from concrete-type parameters to field-only structural generics: `<T extends { inputTokenAddress?: unknown }>(quote: T): T['inputTokenAddress']`. The wrapper is now type-transparent — it returns whatever the field is declared as on the receiver, preserving optional semantics for callers that have them and `string` returns for callers that don't. The IO-perspective ban is about field-name access patterns (the ESLint rule), not about a specific receiver type, so this fix is structurally correct.
- **Files modified:** `src/lib/types/orderPerspective.ts` (4 accessor signatures + import removal of `ProcessedQuote` since the type is no longer used)
- **Verification:**
  - `npm run check` → 7 errors (unchanged baseline)
  - `npm test -- --run tests/lib/types/orderPerspective.test.ts` → 17 tests pass
  - `npm test -- --run` → 473 tests pass
  - `npx eslint tests/fixtures/io-perspective-violation.ts` → 4 errors as expected
- **Committed in:** `2fa6419` (Task 2 atomic commit)

**2. [Rule 1 - Bug] Codemod crashed on nested PropertyAccessExpression rewrites (`fill.quote.inputIOIndex`)**

- **Found during:** Task 2, sub-step B (first codemod run)
- **Issue:** ts-morph's `getDescendantsOfKind` collects nodes in document order. Forward-iterating and rewriting `fill.quote.inputIOIndex` invalidated the inner `fill.quote` PropertyAccessExpression node we'd already collected; the next iteration called `node.getName()` on a forgotten node and threw `InvalidOperationError: Attempted to get information from a node that was removed or forgotten. Node text: fill.quote`.
- **Fix:** Reverse the descendants array before iteration so deeper nodes are rewritten first, and add a `wasForgotten()` guard at the top of the loop body as a fail-safe for any remaining edge case. Documented inline in the codemod.
- **Files modified:** `scripts/codemod-trade-01.ts` (loop ordering + guard)
- **Verification:** Re-ran codemod successfully. 43 rewrites across 5 files. No exceptions.
- **Committed in:** `2fa6419` (Task 2 atomic commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 — bugs in Plan-Author / Codemod-Author code I introduced).
**Impact on plan:** Both fixes were necessary for correctness. The structural-generic accessor pattern is arguably an improvement over the plan's stated `quote: ProcessedQuote` signature, since it correctly serves the diverse receivers the codebase actually has. No scope creep — the wrapper API surface is unchanged from the consumer's perspective; only the type signature widened.

## Issues Encountered

- **Plan baseline counts didn't match actual repo at execution time.** Plan said "19 existing tests" in `orderPerspective.test.ts`; actual was 12. Plan said "447 baseline tests"; actual was 468. Plan said "88 raw-read sites"; actual was 57 (43 `.ts` + 14 `.svelte`). All ratios remain similar; counts just shifted between planning time and execution. Acceptance criteria were satisfied against actuals.
- **`tests/lib/services/marketOrderExecution.test.ts` was untouched by the codemod** even though plan listed it under `<files>`. The file's existing content uses object-literal `{ inputTokenAddress: 'val', ... }` (PropertyAssignment) for fixtures, NOT property reads, so the `MemberExpression` selector correctly skipped it. Same for `quote.test.ts`, `marketPrice.test.ts`, `tokenMath.test.ts` — Pitfall 1 mitigation working as designed.

## User Setup Required

None — no external service configuration required. The ESLint rule is active immediately upon `npm install` (no editor restart needed for VS Code's ESLint extension; flat-config files reload automatically).

## Next Phase Readiness

- **For Plan 02-02 (transaction-store split):** the accessors are stable and preserve the lift-and-shift property. As long as new modules import from `$lib/types/orderPerspective`, the split can proceed without re-introducing raw reads. The 24 codemod rewrites in `transaction.ts` will translate directly to the new state-machine modules.
- **For Plan 02-03 (pre-flight multicall):** the `marketOrderExecution.ts` `failWith()` seam is preserved and the `transcript.onChainStateRead.IOIndex.{input,output}` population sites are now using `getMakerInputIOIndex(firstQuote) ?? null` — Plan 02-03's vaultBalance population will route through the same accessor module.
- **For Plan 02-04 (math symmetry tests):** new mode×side regression tests must use the accessors (no escape hatches). The existing `marketOrderExecution.test.ts` mocking pattern (the test file uses object literals, not property reads, so the rule never fires) is the template.
- **For Plan 02-08 (phase-exit):** decision needed on whether to delete `scripts/codemod-trade-01.ts` once we're confident no merge-from-feature-branch can re-introduce raw reads. Recommendation: keep until end of Phase 2.

## Threat Surface Scan

No new security-relevant surface introduced. The ESLint rule and accessor wrappers are pure dev-tooling additions with no runtime effect (the wrappers are inlinable trivial getters). The codemod is a one-shot dev script that runs offline. The fixture file is in the test tree and never reaches production.

## Self-Check: PASSED

Verified all claims:
- `src/lib/types/orderPerspective.ts` exists ✓
- `tests/lib/types/orderPerspective.test.ts` updated (17 tests) ✓
- `eslint.config.js` updated (no-restricted-syntax block) ✓
- `scripts/codemod-trade-01.ts` exists ✓
- `tests/fixtures/io-perspective-violation.ts` exists ✓
- All 12 file modifications confirmed via `git diff --stat HEAD~2 HEAD` ✓
- Commit `f090790` exists in `git log` ✓
- Commit `2fa6419` exists in `git log` ✓
- `npm run check` returns 7 errors (baseline) ✓
- `npm test -- --run` returns 473 passing ✓
- Phase-exit grep gate returns 0 ✓
- `npx eslint tests/fixtures/io-perspective-violation.ts` returns 4 errors ✓
- `npx eslint src/lib/types/orderPerspective.ts` returns 0 errors ✓
- 0 `eslint-disable.*no-restricted-syntax` escape hatches across repo ✓

---
*Phase: 02-trade-execution-backbone-refactor*
*Completed: 2026-04-29*
