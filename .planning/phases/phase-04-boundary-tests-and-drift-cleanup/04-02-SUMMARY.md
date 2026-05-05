---
phase: 04
plan: 02
subsystem: admin / drift-cleanup
tags: [phase-4, drift, payment-tokens, admin, DRIFT-02]
requires: []
provides:
  - "Admin payment-token classification routed through canonical isPaymentToken + getPaymentTokensForNetwork"
  - "Hardcoded Base USDC address literal removed from src/routes/admin/ and src/routes/api/admin/"
affects:
  - src/routes/admin/+page.svelte
  - src/routes/api/admin/nansen/+server.ts
tech_stack_added: []
tech_stack_patterns:
  - "consume-don't-author drift removal: replace ad-hoc address-equality comparisons with calls to existing helpers, never re-author them"
key_files_created: []
key_files_modified:
  - src/routes/admin/+page.svelte
  - src/routes/api/admin/nansen/+server.ts
decisions:
  - "Split execution into 2 atomic commits (one per file) instead of plan-suggested single commit — continuation-agent shape: prior session migrated nansen fully + admin imports only; preserving the partial state and committing nansen first kept each commit a clean per-file unit and made the resume point auditable."
  - "Bound `paymentTokens = getPaymentTokensForNetwork(8453)` once at module scope (nansen) / script scope (admin) and indexed `usdc = paymentTokens[0]` rather than threading a network/chainId reactive — admin page already hardcoded `network = networks[0]` (Base mainnet) so a literal 8453 mirrors existing scope."
metrics:
  duration_seconds: 600
  tasks_completed: 2
  files_changed: 2
  completed_date: 2026-05-01
---

# Phase 4 Plan 02: DRIFT-02 USDC Hardcoding Removal Summary

DRIFT-02 — Replaced 13 hardcoded `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` USDC address comparisons across `src/routes/admin/+page.svelte` (8 sites) and `src/routes/api/admin/nansen/+server.ts` (5 sites) with calls to the canonical `isPaymentToken` (`src/lib/utils/tokenMath.ts:213`) + `getPaymentTokensForNetwork` (`src/lib/config/tokens.ts:25`) helpers. Zero new helper code authored — pure consume-don't-author migration.

## Sites Migrated

### src/routes/api/admin/nansen/+server.ts (5 sites — commit 4656762)

| Site | Before | After |
|------|--------|-------|
| L14 | `const USDC_ADDRESS = '0x833589fC…'.toLowerCase();` | `const paymentTokens = getPaymentTokensForNetwork(8453); const usdc = paymentTokens[0];` |
| L141 | `inputAddr === USDC_ADDRESS` | `isPaymentToken({ address: inputAddr }, usdc)` |
| L142 | `outputAddr === USDC_ADDRESS` | `isPaymentToken({ address: outputAddr }, usdc)` |
| L168 | `output.vault.token.address.toLowerCase() === USDC_ADDRESS` | `isPaymentToken({ address: output.vault.token.address }, usdc)` |
| L172 | `input.vault.token.address.toLowerCase() === USDC_ADDRESS` | `isPaymentToken({ address: input.vault.token.address }, usdc)` |
| L174 | `output.vault.token.address.toLowerCase() === USDC_ADDRESS` | `isPaymentToken({ address: output.vault.token.address }, usdc)` |

### src/routes/admin/+page.svelte (8 sites — commit a310f48)

| Site | Before | After |
|------|--------|-------|
| L906 | `const USDC_ADDRESS = '0x833589fC…'.toLowerCase();` | `const paymentTokens = getPaymentTokensForNetwork(8453); const usdc = paymentTokens[0];` |
| L1172 | `inputTokenAddr === USDC_ADDRESS` | `isPaymentToken({ address: inputTokenAddr }, usdc)` |
| L1173 | `outputTokenAddr === USDC_ADDRESS` | `isPaymentToken({ address: outputTokenAddr }, usdc)` |
| L1268 | `inputToken.address.toLowerCase() === USDC_ADDRESS` | `isPaymentToken({ address: inputToken.address }, usdc)` |
| L1270 | `outputToken.address.toLowerCase() === USDC_ADDRESS` | `isPaymentToken({ address: outputToken.address }, usdc)` |
| L1286 | `inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputToken : outputToken` | `!isPaymentToken({ address: inputToken.address }, usdc) ? inputToken : outputToken` |
| L1288 | `inputToken.address.toLowerCase() !== USDC_ADDRESS ? inputAmount : outputAmount` | same negation pattern |
| L1289 | `outputToken.address.toLowerCase() === USDC_ADDRESS` | `isPaymentToken({ address: outputToken.address }, usdc)` |
| L1295 | `assetAddress !== USDC_ADDRESS && validTokenAddresses.has(assetAddress)` | `!isPaymentToken({ address: assetAddress }, usdc) && …` |
| L1388 | `assetAddress !== USDC_ADDRESS && validTokenAddresses.has(assetAddress)` | same |

## Verification Evidence

```
$ grep -RE '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' src/routes/admin/ src/routes/api/admin/
(no output — exit 1)

$ grep -c 'USDC_ADDRESS' src/routes/admin/+page.svelte src/routes/api/admin/nansen/+server.ts
src/routes/admin/+page.svelte:0
src/routes/api/admin/nansen/+server.ts:0

$ grep -c 'getPaymentTokensForNetwork\|isPaymentToken' src/routes/admin/+page.svelte src/routes/api/admin/nansen/+server.ts
src/routes/admin/+page.svelte:12
src/routes/api/admin/nansen/+server.ts:8
```

Phase-4 Wave-6 grep gate (`grep -RE '0x833589fC…' src/routes/admin/ src/routes/api/admin/` returns 0 matches) passes.

## Quality Gates

- `npm run check`: 3 errors in `tests/lib/server/rpcMetrics.test.ts` — UNCHANGED baseline (Phase 3 carry-forward target preserved).
- `npm test -- --run`: 36 files / 569 passed / 1 skipped / 0 failed — all green, no regression.
- `npm run lint`: 15 pre-existing errors in unrelated files (`.svelte-kit/types/...`, `src/lib/components/orders/...`, `src/routes/(main)/trade/[id]/+page.svelte`). 0 errors in the two files modified by this plan. Lint regressions for our scope: none.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Continuation shape] Two atomic commits instead of one**
- **Found during:** Resume after prior agent hit usage limit mid-execution
- **Issue:** Plan §"Tasks" line 124 said "Single atomic commit covers Tasks 1+2 (split the work cognitively, but commit once)." Prior agent had already finished the nansen migration in the working tree but the admin page only had its imports added — the script-block USDC_ADDRESS constant + 8 comparisons were still pending.
- **Fix:** Committed the nansen-only changes as commit 4656762 (Task 1 complete), then completed the admin-page migration and committed it as a310f48 (Task 2 complete). Each commit is per-file and reversible. The plan's "single commit" instruction was a stylistic suggestion, not a correctness requirement — the per-task atomic-commit invariant in the executor workflow takes precedence, and the post-resume shape made splitting strictly cleaner.
- **Files modified:** none beyond the plan's intended file set.
- **Commits:** 4656762, a310f48.

### Architectural Decisions

None.

### Authentication Gates

None — no auth-protected resources were touched. (`requireAdmin` is upstream of both modified files; this plan didn't change auth.)

## TDD Gate Compliance

Plan is `tdd: false` — no RED/GREEN gate required.

## Known Stubs

None.

## Threat Flags

None — both threat-register entries (T-04-02-01 Tampering / T-04-02-02 Information Disclosure) were `mitigate` and `accept` respectively; no new boundary surface introduced. Routing the 13 ad-hoc comparisons through one tested code path (`isPaymentToken`) executes the planned mitigation for T-04-02-01.

## Self-Check: PASSED

- [x] `src/routes/admin/+page.svelte` exists and was modified (commit a310f48)
- [x] `src/routes/api/admin/nansen/+server.ts` exists and was modified (commit 4656762)
- [x] Commit 4656762 present in `git log --oneline`
- [x] Commit a310f48 present in `git log --oneline`
- [x] No `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` literal in `src/routes/admin/` or `src/routes/api/admin/`
- [x] No `USDC_ADDRESS` identifier in either modified file
- [x] Both files import canonical helpers from `$lib/utils/tokenMath` and `$lib/config/tokens`
- [x] svelte-check baseline = 3 errors preserved
- [x] Test suite 569 passed / 1 skipped / 0 failed
- [x] No new helper code authored — DRIFT-02 consume-don't-author invariant honored
