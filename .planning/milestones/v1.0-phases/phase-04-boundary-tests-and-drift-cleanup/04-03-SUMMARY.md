---
phase: 04-boundary-tests-and-drift-cleanup
plan: 03
subsystem: infra
tags: [drift, codemod, eslint, ts-morph, token-lookup, no-restricted-syntax]

# Dependency graph
requires:
  - phase: 04
    provides: "TRADE-01 codemod / ESLint pattern (Phase 2 02-01) — DRIFT-01 mirrors it exactly: ts-morph script + no-restricted-syntax block + intentional-violation fixture."
provides:
  - "DRIFT-01 codemod (scripts/codemods/migrate-token-find.ts) — idempotent migration of TOKENS.find / ALL_TOKENS.find (address-equality predicates) to getTokenByAnyAddress(addr)."
  - "DRIFT-01 ESLint rule (no-restricted-syntax) — bans direct TOKENS.find / ALL_TOKENS.find outside the canonical lookup module. Coexists with the TRADE-01 rule."
  - "DRIFT-01 lint fixture (tests/fixtures/eslint/token-lookup-violation.ts) — proves rule fires on intentional violations."
  - "8 call-sites migrated to getTokenByAnyAddress(addr); 4 retained with eslint-disable + justification (3 symbol-based, 4 payment-token-scoped — DRIFT-01 does not apply)."
affects:
  - "Phase 4 Wave 6 phase-exit grep gate — must allow eslint-disabled lines."
  - "Future address-keyed token lookups must use getTokenByAnyAddress(addr); rule enforces this in CI + editor."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ts-morph CallExpression matcher with arrow-predicate AST destructuring (extracts t.address === addr argument)."
    - "ESLint flat-config rule coexistence — multiple no-restricted-syntax blocks merge across rule entries."
    - "eslint-disable + justification escape hatch for non-applicable selector matches."

key-files:
  created:
    - "scripts/codemods/migrate-token-find.ts"
    - "tests/fixtures/eslint/token-lookup-violation.ts"
  modified:
    - "eslint.config.js"
    - "src/lib/utils/tradeTransform.ts"
    - "src/lib/api/subgraph.ts"
    - "src/lib/queries/oracleQuotes.ts"
    - "src/lib/queries/priceFeeds.ts"
    - "src/lib/components/orders/DcaOrder.svelte"
    - "src/lib/components/orders/LimitOrder.svelte"
    - "src/routes/(main)/+page.svelte"
    - "src/routes/(main)/dashboard/+page.svelte"
    - "src/routes/(main)/trade/[id]/+page.svelte"

key-decisions:
  - "Migrate 8 of 12 sites; retain 4 with eslint-disable + justification because DRIFT-01 (silent wrapped-only matching of address variants) does not apply to symbol-based lookups (oracleQuotes, priceFeeds: SPYM by symbol) or to payment-token (USDC) lookups against the network-scoped ALL_TOKENS universe (DcaOrder, LimitOrder: getTokenByAnyAddress only resolves ST0x asset variants, not CRYPTO_TOKENS)."
  - "Wave-6 grep gate (`(TOKENS|ALL_TOKENS).find(`) must allow eslint-disabled lines — the rule itself is the enforcement, not the raw grep."
  - "Fixture is NOT in the DRIFT-01 ignore list. ESLint flat config replaces (not concatenates) `no-restricted-syntax` rule entries when blocks overlap, so ignoring the fixture in the DRIFT-01 block leaves only the TRADE-01 rule active for that path — and no rule fires. Solution: omit the fixture from the ignores list and rely on `lint-check` targeting `src/` only to keep the fixture out of the project lint run."
  - "Codemod is conservative — skips compound predicates (`&&`) including chainId-filter cases. Hand-migrated tradeTransform.ts and subgraph.ts (chainId+address predicates) by post-filtering chainId after getTokenByAnyAddress; the chain-aware semantics are preserved."

patterns-established:
  - "DRIFT-01 codemod (`scripts/codemods/migrate-token-find.ts`) — extracts address argument from arrow predicates of shape `(t) => t.address === addr` (with or without `.toLowerCase()` on either side); skips compound or symbol-based predicates with stderr warnings."
  - "Eslint-disable escape hatch — symbol-based / payment-token-scoped lookups carry a single-line justification documenting why DRIFT-01 does not apply."

requirements-completed: [DRIFT-01]

# Metrics
duration: 7min
completed: 2026-05-01
---

# Phase 04 Plan 03: DRIFT-01 token-lookup codemod + ESLint rule Summary

**ts-morph codemod + ESLint `no-restricted-syntax` rule banning direct `TOKENS.find` / `ALL_TOKENS.find`; 8 sites migrated to `getTokenByAnyAddress(addr)`, 4 retained with documented `eslint-disable` justifications (DRIFT-01 does not apply to symbol or payment-token lookups).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-01T20:37:40Z
- **Completed:** 2026-05-01T20:44:44Z
- **Tasks:** 2
- **Files modified:** 10 (3 created + 7 modified; eslint.config.js counted under modified)

## Accomplishments
- DRIFT-01 ESLint rule active project-wide (`no-restricted-syntax` selector `CallExpression[callee.object.name=/^(TOKENS|ALL_TOKENS)$/][callee.property.name='find']`).
- ts-morph codemod (idempotent) — skips compound predicates conservatively; stderr warnings guide hand-resolution.
- 8 address-keyed call-sites now use `getTokenByAnyAddress(addr)` (matches wrapped/unwrapped/legacy variants).
- 4 non-applicable sites retained with single-line `eslint-disable` + justification documenting why DRIFT-01 does not apply.
- TRADE-01 lockdown intact (cross-cutting grep gate returns 0 matches).
- 569 tests pass; svelte-check baseline = 3 errors (unchanged).

## Task Commits

1. **Task 1: Author codemod + lint fixture + ESLint rule** — `1294e30` (feat)
2. **Task 2: Migrate call-sites + retain non-applicable with eslint-disable** — `7509594` (refactor)

## Files Created/Modified
- `scripts/codemods/migrate-token-find.ts` — ts-morph codemod; matches `<TOKENS|ALL_TOKENS>.find(<address-eq predicate>)`; rewrites to `getTokenByAnyAddress(addr)`; skips compound predicates with stderr warnings.
- `tests/fixtures/eslint/token-lookup-violation.ts` — intentional-violation fixture; rule fires on it (verified `npx eslint <path>` exits non-zero).
- `eslint.config.js` — appended DRIFT-01 `no-restricted-syntax` block; coexists with TRADE-01 block (lines 46-65 untouched).
- `src/lib/utils/tradeTransform.ts` — 2 sites migrated; chainId guard preserved via post-filter.
- `src/lib/api/subgraph.ts` — 1 site migrated; chainId guard preserved via post-filter.
- `src/routes/(main)/trade/[id]/+page.svelte` — 1 site migrated; collapsed two-step lookup (the existing fallback to `getTokenByAnyAddress` made the wrapped-only branch redundant).
- `src/routes/(main)/+page.svelte` — 1 site migrated.
- `src/routes/(main)/dashboard/+page.svelte` — 2 sites migrated.
- `src/lib/queries/oracleQuotes.ts` — 1 site retained with `eslint-disable-next-line` + justification (symbol-based lookup).
- `src/lib/queries/priceFeeds.ts` — 1 site retained with `eslint-disable-next-line` + justification (symbol-based lookup).
- `src/lib/components/orders/DcaOrder.svelte` — 1 site retained with `eslint-disable-next-line` + justification (USDC payment-token lookup against network-scoped ALL_TOKENS).
- `src/lib/components/orders/LimitOrder.svelte` — 1 site retained with `eslint-disable-next-line` + justification (USDC payment-token lookup against network-scoped ALL_TOKENS).

## Decisions Made
- **8/12 migrate, 4/12 retain with eslint-disable.** The codemod's stderr SKIP warnings flagged compound predicates. On audit, 2 `tradeTransform.ts` and 1 `subgraph.ts` sites use chainId+address predicates that ARE genuine DRIFT-01 cases — hand-migrated using `getTokenByAnyAddress(addr)` with chainId post-filter to preserve the chain guard. The remaining 4 sites are NOT DRIFT-01 cases:
  - `oracleQuotes.ts:61`, `priceFeeds.ts:10` — `t.symbol === 'wtSPYM'` is symbol-based; `getTokenByAnyAddress` is address-keyed, not symbol-keyed.
  - `DcaOrder.svelte:41`, `LimitOrder.svelte:81` — settlement-token (USDC) lookup against the network-scoped `ALL_TOKENS` (assets + payment tokens). `getTokenByAnyAddress` only resolves ST0x asset-token address variants and never matches USDC (USDC lives in `CRYPTO_TOKENS`, which is not in the lookup maps). Migration would always hit the fallback path — silent semantic shift.
- **Codemod conservatism over auto-everything.** The codemod's predicate parser only handles the simple-equality shape; it could be extended to deconstruct compound `&&` predicates, but the marginal gain is small (4 sites) and the false-positive risk is high. Chose conservative SKIP + stderr warning so a human auditor decides per-site.
- **Fixture not in DRIFT-01 ignores.** ESLint flat config replaces (not merges) `no-restricted-syntax` rule entries when blocks overlap on a file. Ignoring the fixture from the DRIFT-01 block left the TRADE-01 block as the only active rule for that path — and the rule didn't fire. Solution: omit the fixture from the DRIFT-01 ignore list and rely on `lint-check`/`lint` targeting `src/` only (so the fixture doesn't pollute project lint runs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint fixture file did not initially trigger the rule**
- **Found during:** Task 1 verification (`npx eslint tests/fixtures/eslint/token-lookup-violation.ts` exited 0).
- **Issue:** The plan specified the fixture path in the DRIFT-01 `ignores` list (consistent with the TRADE-01 fixture pattern). But ESLint flat config replaces `no-restricted-syntax` rule entries when blocks overlap. With the fixture in the DRIFT-01 ignores, only the TRADE-01 rule applied to it — and that rule's selector doesn't match `TOKENS.find(...)`, so no violation was reported.
- **Fix:** Removed the fixture path from the DRIFT-01 `ignores` list. Project-wide lint runs (`npm run lint` / `npm run lint-check`) target `src/` only, so the fixture does not pollute normal lint output despite intentionally violating the rule.
- **Files modified:** `eslint.config.js`, `tests/fixtures/eslint/token-lookup-violation.ts` (comment updated)
- **Verification:** `npx eslint tests/fixtures/eslint/token-lookup-violation.ts` exits 1 with two violations.
- **Committed in:** `1294e30` (Task 1)

**2. [Rule 1 - Bug] Plan instruction "import { TOKENS, ALL_TOKENS } from '$lib/config/tokens'" in fixture is unresolvable**
- **Found during:** Task 1 fixture authoring.
- **Issue:** `$lib/config/tokens` exports `TOKENS` but NOT `ALL_TOKENS`. `ALL_TOKENS` is a per-network reactive variable defined inside Svelte components (e.g. `$: ALL_TOKENS = getAllTokensByNetwork($currentNetwork.chainId)`), not a module export. The plan's fixture import would fail tsc.
- **Fix:** Declared `TOKENS` and `ALL_TOKENS` as local consts in the fixture. The ESLint AST selector matches identifier names regardless of import binding source, so the rule fires on local declarations equivalently.
- **Files modified:** `tests/fixtures/eslint/token-lookup-violation.ts`
- **Verification:** `npx eslint <fixture>` exits 1 with both violations reported (`TOKENS.find` AND `ALL_TOKENS.find`).
- **Committed in:** `1294e30` (Task 1)

**3. [Rule 4 alternative — applied as Rule 2] Plan's "all 12 sites migrated" must-have is semantically infeasible for 4 sites; retained with documented eslint-disable**
- **Found during:** Task 2 (codemod execution + site audit).
- **Issue:** The plan's must-have asserted "All 12 TOKENS.find / ALL_TOKENS.find sites migrated to getTokenByAnyAddress(addr)". On audit:
  - `oracleQuotes.ts:61` and `priceFeeds.ts:10` are symbol-based (`t.symbol === 'wtSPYM'`); `getTokenByAnyAddress(addr)` cannot resolve by symbol.
  - `DcaOrder.svelte:41` and `LimitOrder.svelte:81` look up the network's payment-token (USDC); `getTokenByAnyAddress` returns null for USDC (only ST0x asset variants are in the lookup maps), so migration would silently lose the match and depend on the existing fallback path.
  Forcing migration on these 4 sites would either break correctness or introduce silent semantic drift.
- **Fix:** Retained the 4 sites with single-line `// eslint-disable-next-line no-restricted-syntax -- justification: ...` comments documenting why DRIFT-01 does not apply. The ESLint rule's message explicitly documents this escape hatch ("Per-callsite escape: ...").
- **Files modified:** `src/lib/queries/oracleQuotes.ts`, `src/lib/queries/priceFeeds.ts`, `src/lib/components/orders/DcaOrder.svelte`, `src/lib/components/orders/LimitOrder.svelte`
- **Verification:** `npm run lint-check` reports 0 DRIFT-01 errors (15 unrelated pre-existing errors remain — out of scope per deviation-rule scope-boundary).
- **Committed in:** `7509594` (Task 2)

---

**Total deviations:** 3 auto-fixed (2 plan-prescription bugs in Task 1, 1 architectural-correctness deviation in Task 2).

**Impact on plan:** All auto-fixes preserve the plan's intent — DRIFT-01 (silent wrapped-only matching of address variants) is fully closed for every site where it applies. The 4 retained sites are documented non-applicable cases. ESLint rule + fixture function as specified. Codemod is idempotent. No scope creep.

## Issues Encountered

- **Pre-existing project lint errors (15) NOT addressed.** `npm run lint-check` exits 1 with 15 errors in files unrelated to DRIFT-01 (unused-vars, no-explicit-any, no-constant-condition, no-useless-catch). These pre-date this plan; per the GSD scope-boundary rule, out-of-scope errors are deferred. This means the plan's Task 2 acceptance criterion `npm run lint exits 0` is NOT met — but no DRIFT-01 errors are present, which is the actual goal of this plan. The phase-exit plan should track these for cleanup or accept as deferred.

## User Setup Required

None.

## Verification Evidence

```
# DRIFT-01 errors in src/ — 0 (rule fires; sites are migrated or eslint-disabled)
$ npm run lint-check 2>&1 | grep -c 'DRIFT-01'
0

# Fixture fires
$ npx eslint tests/fixtures/eslint/token-lookup-violation.ts; echo $?
✖ 2 problems (2 errors, 0 warnings)
1

# Codemod idempotent (re-run on clean tree)
$ npx tsx scripts/codemods/migrate-token-find.ts
[migrate-token-find] Rewrote 0 call(s) across 0 file(s); skipped 2 non-simple predicate(s).
$ git diff --stat
(empty)

# TRADE-01 lockdown intact
$ grep -RE '\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\b' src/ \
    | grep -v 'src/lib/types/orderPerspective.ts' \
    | grep -v 'src/lib/utils/orderbook.ts' \
    | grep -v 'src/lib/api/orders.ts' \
    | grep -v 'src/generated-graphql.ts'
(empty)

# Wave-6 grep gate (raw) — 4 hits, all eslint-disabled
$ grep -RE '(TOKENS|ALL_TOKENS)\.find\(' src/ | grep -v 'src/lib/config/tokens.ts' | wc -l
4

# Tests
$ npm test -- --run
Test Files  36 passed (36)
     Tests  569 passed | 1 skipped (570)

# svelte-check baseline preserved
$ npm run check 2>&1 | tail -1
svelte-check found 3 errors and 0 warnings in 1 file
```

## Next Phase Readiness

- DRIFT-01 closed for all in-tree address-keyed lookups; rule prevents recurrence in new code.
- Phase 4 Wave 6 phase-exit plan should:
  - Adjust the Wave-6 grep gate to whitelist `eslint-disable-next-line no-restricted-syntax` lines (or scan via lint-check directly).
  - Track the 15 pre-existing lint errors for a separate cleanup plan or accept as out-of-scope.
- DRIFT-02 (USDC hardcoding) and DRIFT-03 (CLAUDE.md drift) are independent of this plan.

## Threat Flags

None — no new trust boundaries; build-time codemod + lint-time rule + behavior-preserving call-site replacements.

## Self-Check: PASSED

- `scripts/codemods/migrate-token-find.ts` — exists
- `tests/fixtures/eslint/token-lookup-violation.ts` — exists
- `eslint.config.js` — modified (DRIFT-01 block appended; TRADE-01 block intact)
- Task 1 commit `1294e30` — present
- Task 2 commit `7509594` — present

---
*Phase: 04-boundary-tests-and-drift-cleanup*
*Plan: 03*
*Completed: 2026-05-01*
