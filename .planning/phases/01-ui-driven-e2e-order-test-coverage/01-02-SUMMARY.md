---
phase: 01
plan: 02
subsystem: test-coverage-audit
tags: [audit, test-coverage, TEST-10, must-fix-bar, D-12, D-13]
dependency_graph:
  requires:
    - .planning/codebase/CONCERNS.md (TRADE-01..04 bug-class register)
    - .planning/REQUIREMENTS.md (TEST-08 a-e + TEST-09 sub-rows)
    - tests/lib/** (units to classify)
    - tests/integration/marketOrder/** (replay-* + anvil-fork to classify)
    - tests/integration/ui/** (Plan 01-01 smoke + planned 01-04..01-07 specs)
  provides:
    - .planning/phases/01-ui-driven-e2e-order-test-coverage/01-AUDIT.md
    - Must-fix list (1 item) → Plan 01-08 mechanical input
    - Nice-to-have / 999.x backlog (9 items) → next milestone triage
  affects:
    - Plan 01-08 (TEST-11) reads the must-fix list verbatim
    - 999.x backlog items captured here will be routed at v1.1 close
tech-stack:
  added: []
  patterns:
    - "D-12 single-matrix audit deliverable (rows = bug-class register, columns = unit/service-integration/UI E2E)"
    - "D-13 must-fix bar applied mechanically (no discretion)"
key-files:
  created:
    - .planning/phases/01-ui-driven-e2e-order-test-coverage/01-AUDIT.md
  modified: []
decisions:
  - "Pre-seeded matrix from 01-RESEARCH §Audit Matrix Template re-verified against on-disk files; one cell corrected (transactionStore.test.ts lives at tests/lib/, not tests/lib/stores/)"
  - "Added 1 row beyond the 14-row template: OBS-03 take-order failure transcripts (captureTakeOrderFailure.test.ts) — observability invariant worth recording so it isn't accidentally regressed by future testid retrofit"
  - "Excluded 2 test files as out-of-scope with rationale: tests/lib/utils/format.test.ts (pure formatting) + tests/lib/utils/costBasis.test.ts (historical PnL math)"
  - "Single must-fix gap surfaced: tests/lib/utils/marketHours.test.ts missing (TEST-08e unit tier). Source src/lib/utils/marketHours.ts ships uncovered at unit tier"
metrics:
  duration_minutes: 6
  completed_date: 2026-05-06
  task_count: 1
  commit_count: 1
  file_count: 1
---

# Phase 01 Plan 02: TEST-10 Order Test Coverage Audit Summary

One-liner: Single-matrix coverage audit per D-12 with D-13 must-fix bar applied mechanically — 15 rows verified against on-disk tests, 1 must-fix gap surfaced (`tests/lib/utils/marketHours.test.ts` missing), 9 nice-to-haves routed to 999.x.

## What Shipped

**Single deliverable:** `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-AUDIT.md` (108 lines).

**Coverage Matrix structure (D-12 shape):**
- 15 rows: TRADE-01, TRADE-02, TRADE-03, TRADE-04, TEST-08a, TEST-08b, TEST-08c, TEST-08d, TEST-08e, Limit-deploy correct-vault deposit, Simulated counterparty fill on fork, DCA-deploy, Hydration failure recovery, Stale wallet session, Slippage cap exceeded (per-order). Plus a 16th row (OBS-03 transcripts) added beyond the RESEARCH template as a defense-in-depth observability anchor.
- 4 columns: unit (`tests/lib/`), service-integration (`tests/integration/marketOrder/`), UI E2E (`tests/integration/ui/`), Gap (must-fix Y/N + rationale).
- Cells contain: verified file paths, "(planned: ... 01-NN)" placeholders for E2E specs not yet shipped (01-04..01-07), or "—" with rationale.

**D-13 must-fix bar applied mechanically:**
- TRADE-01..04: every row has ≥ 2 columns populated post 01-04..01-07. No must-fix from rule (1).
- TEST-08 a..e: every row has UI E2E coverage post 01-06. No must-fix from rule (2) on the E2E side.
- TEST-08e secondary check: `marketHours.ts` ships uncovered at unit tier. **Single must-fix gap.**

**Must-fix list (Plan 01-08 input):**
1. `tests/lib/utils/marketHours.test.ts` — missing. Suggested 8-case table-driven spec covering Mon–Fri RTH edges, Sat/Sun, US holiday, pre-market, DST boundary. ~30 LOC.

**Nice-to-have / 999.x backlog (9 items):**
DCA-deploy E2E, QuickTrade E2E, Hydration-failure UI assertion, Dynamic Labs E2E, EIP-1271 E2E, removeOrder mass-cancellation backup, per-spec anvil-restart backup, orderDeployment service-integration test, 999.7 svelte-check baseline.

## Verification Receipts

| Gate | Result |
|------|--------|
| `test -f .planning/phases/01-ui-driven-e2e-order-test-coverage/01-AUDIT.md` | exists |
| `grep -E "^# Phase 1 — Order Test Coverage Audit"` | present |
| `grep -E "^## Coverage Matrix$"` | present |
| `grep -E "^## Must-Fix Gap List"` | present |
| `grep -E "^## Nice-to-Have"` | present |
| `grep -E "^## Audit Method Notes"` | present |
| Matrix row count (TRADE/TEST-08/Limit/Simulated/DCA/Hydration/Stale/Slippage) | 15 (≥ 12 required) |
| Test files walked / classified / excluded | 19 / 17 / 2 |
| Must-fix list items | 1 |
| 999.x backlog items | 9 |

## Self-Check Method Notes

The audit read the first ~30 lines of every test file under `tests/lib/services/`, `tests/lib/utils/`, `tests/lib/types/`, `tests/lib/stores/`, `tests/integration/marketOrder/`, plus `tests/lib/transactionStore.test.ts` + `tests/lib/validateDeploymentArgs.test.ts` (both at `tests/lib/` root). Every cell that names a test path was verified against the file's describe blocks + imports. The single absence claim (`tests/lib/utils/marketHours.test.ts`) was verified via `find /Users/alastairong/st0x/st0x/tests -name "marketHours*"` returning empty.

## Deviations from Plan

### Deviations from Pre-Seeded RESEARCH Template (verified corrections, not Rule deviations)

The plan instructed: "VERIFY each cell against the actual file existence and content. Update the pre-seeded matrix from RESEARCH (15 rows) to reflect ground truth." The following ground-truth corrections were applied:

1. **`tests/lib/transactionStore.test.ts` location** — RESEARCH template wrote `tests/lib/transactionStore.test.ts`; verified to live at exactly that path (NOT under `tests/lib/stores/` as the analogous transactionShared.test.ts does). Recorded under TRADE-02, TEST-08d, Limit-deploy, DCA-deploy, Hydration rows.
2. **`tests/lib/utils/marketOrderFill.test.ts` case count** — RESEARCH template said "19 cases"; ground truth shows 26+ describe/it markers (clampSlippageBps + computeRatioMultiplier + evaluateMarketOrderFill). Audit notes "19+ cases" / "26+ describe/it markers" rather than carrying forward the lower number.
3. **`tests/lib/utils/marketHours.test.ts` confirmed absent** — RESEARCH template flagged "TBD — likely doesn't exist; check". Verified absent. Source `src/lib/utils/marketHours.ts` ships uncovered. ⇒ Must-Fix gap #1.
4. **`tests/integration/marketOrder/orderDeployment.test.ts` confirmed absent** — RESEARCH template said "(none — currently no integration test for orderDeployment.ts)". Verified — no service-integration test exists for the deployment side. Routed to nice-to-have item 8 (defense-in-depth, not regression-closure, since unit + UI E2E columns are populated).
5. **OBS-03 transcripts row added beyond template** — `tests/lib/services/observability/captureTakeOrderFailure.test.ts` exists and pins the failWith() transcript shape underneath every TEST-08 row. Adding it as a 16th row (beyond RESEARCH's 14-row template + the 15-row plan acceptance bar) makes the regression net visible.

No Rule 1/2/3/4 deviations occurred — the task is pure documentation analysis.

### Auto-fixed Issues

None — pure documentation; no code changes.

## Threat Model Re-Walk

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-1-02-01 (Information Disclosure — false-coverage claim) | mitigate | Each cell that names a test path was verified by reading the first ~30 lines of the file before claiming coverage. Cells using "—" or "(planned: ... 01-NN)" carry explicit rationale. The single absence claim (marketHours.test.ts) was verified via `find` returning empty. |
| T-1-02-02 (Tampering — must-fix list under-counts gaps) | mitigate | D-13 bar applied mechanically without discretion: rule (1) checked TRADE-01..04 rows for all-empty columns post 01-04..01-07 (none); rule (2) checked TEST-08 rows for missing UI E2E post 01-06 (none); secondary check on TEST-08e surfaced the uncovered `marketHours.ts` unit tier. Audit Method Notes records the verification of every pre-seeded matrix cell against ground truth so a reviewer can re-walk the bar. |

## Hand-Off

- **Plan 01-08 (TEST-11):** mechanically reads the Must-Fix Gap List (1 numbered item) and converts it to a task — write `tests/lib/utils/marketHours.test.ts` with the suggested 8-case table-driven spec.
- **Plan 01-04 / 01-05 / 01-06 / 01-07:** the "(planned: ... 01-NN)" cells are forward-references; if any of those plans regress or scope down, the must-fix list expands at v1.1 close.
- **v1.1 close audit:** route the 9 nice-to-have items into 999.x backlog numbering.

## Self-Check: PASSED

- `01-AUDIT.md` exists at the expected path.
- All 4 required `##` sections present (Coverage Matrix, Must-Fix Gap List, Nice-to-Have / Backlog, Audit Method Notes) plus `# Phase 1 — Order Test Coverage Audit (TEST-10)` H1.
- Matrix row count: 15 (≥ 12 required by acceptance criteria).
- Must-fix list enumerated as `1. ...` (single item).
- Audit Method Notes records 19 walked / 17 classified / 2 excluded counts.
- Commit `5064a4d` exists in `git log`.
