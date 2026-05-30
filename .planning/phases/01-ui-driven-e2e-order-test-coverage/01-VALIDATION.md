---
phase: 1
slug: ui-driven-e2e-order-test-coverage
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-06
updated: 2026-05-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Existing unit framework** | Vitest 1.6.0 + jsdom — `vite.config.js` |
| **Existing service-integration framework** | Vitest 1.6.0 + jsdom — `vite.config.integration.js` (anvil-driven, BASE_RPC_URL gated) |
| **NEW UI E2E framework** | Playwright 1.49.x + Chromium (added in Plan 01-01) |
| **Quick run command (per-task)** | `npm test` (~30s) |
| **Full suite (per-wave)** | `npm test && npm run test:integration && npm run test:e2e` |
| **Estimated runtime** | ~30s (unit) / ~2-5min (test:integration) / ~3-8min (test:e2e) |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (fast unit; <30s). Additionally on commits touching `tests/integration/ui/**`, `playwright.config.ts`, `tests/helpers/eip1193Stub.ts`, or `src/hooks.server.ts` CSP: `BASE_RPC_URL=$BASE_RPC_URL npm run test:e2e -- smoke.spec.ts`.
- **After every plan wave:** Full suite (all three) against archive `BASE_RPC_URL`.
- **Before `/gsd-verify-work`:** All three green; 01-AUDIT.md re-walked; ESLint rule fires on the fixture commit-and-revert.
- **Max feedback latency:** ~30s (unit). E2E feedback: ~3-8min full / <2min smoke pre-flight.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | TEST-05 | T-1-01-01..05 | RUNBOOK pins env values; no production secrets exposed | doc grep | `grep -E "^## (FORK_BLOCK\|ERC20.*\|Pyth.*\|Saturday.*\|No-liquidity.*\|Snapshot/revert.*\|evm_setNextBlockTimestamp.*\|E2E=1.*)" .planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md \| wc -l \| grep -q '^8$'` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | TEST-05 | T-1-01-01,04 | E2E=1 CSP gate live; stub never imported into prod | unit + integration | `npm run check && grep -q "process.env.E2E" src/hooks.server.ts && ! grep -RE "tests/helpers/eip1193Stub" src/` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | TEST-05 | T-1-01-01..05 | smoke spec drives full stack with locked invariants intact | UI E2E | `BASE_RPC_URL=$BASE_RPC_URL npm run test:e2e -- smoke.spec.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | TEST-10 | T-1-02-01,02 | every test classified, must-fix bar applied per D-13 | doc grep | `grep -E "^## (Coverage Matrix\|Must-Fix Gap List\|Nice-to-Have)" 01-AUDIT.md` (≥3 sections) | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | TEST-12 | T-1-03-02 | testid retrofit lands without logic regressions | svelte-check + grep | `npm run check && [ $(grep -c data-testid src/lib/components/orders/MarketOrder.svelte) -ge 8 ]` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | TEST-12 | T-1-03-03 | ESLint rule fires on fixture; production lint clean | lint | `npx eslint tests/fixtures/eslint/ui-test-import-violation.ts \| grep -q no-restricted-imports` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 3 | TEST-06 | T-1-04-01..03 | Buy spend + asset anchored both pass; on-chain delta matches expected sign | UI E2E | `BASE_RPC_URL=$BASE_RPC_URL npm run test:e2e -- marketBuy.spec.ts` | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 3 | TEST-07 | T-1-05-01,02 | Sell asset + spend anchored; tNVDA decreases AND USDC increases | UI E2E | `BASE_RPC_URL=$BASE_RPC_URL npm run test:e2e -- marketSell.spec.ts` | ❌ W0 | ⬜ pending |
| 1-06-01 | 06 | 3 | TEST-08 | T-1-06-01..03 | each of 5 specs asserts the SPECIFIC data-error-class | UI E2E | `BASE_RPC_URL=$BASE_RPC_URL npm run test:e2e -- marketFailures.spec.ts` | ❌ W0 | ⬜ pending |
| 1-07-01 | 07 | 3 | TEST-09 | T-1-07-01..03 | limit deposits to OUTPUT vault; counterparty fill round-trips | UI E2E | `BASE_RPC_URL=$BASE_RPC_URL npm run test:e2e -- limitDeploy.spec.ts` | ❌ W0 | ⬜ pending |
| 1-08-01 | 08 | 4 | TEST-11 | T-1-08-01,02 | every must-fix gap closed or annotated; no `(planned: ...)` cells | doc grep + tests | `! grep -E "\(planned:" 01-AUDIT.md && npm test` | ❌ W0 | ⬜ pending |
| 1-09-01 | 09 | 2 | TEST-05 | T-1-09-01..03 | foundry-toolchain action live; test-e2e CI job present; secret-only RPC | yaml grep | `grep -q "foundry-rs/foundry-toolchain@v1" .github/workflows/test.yml && grep -q "test-e2e:" .github/workflows/test.yml && ! grep -q "curl -L https://foundry.paradigm.xyz" .github/workflows/test.yml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `@playwright/test` installed (Plan 01-01)
- [ ] `playwright.config.ts` (Plan 01-01)
- [ ] `tests/integration/ui/{globalSetup,globalTeardown,fixtures,smoke.spec}.ts` (Plan 01-01)
- [ ] `tests/helpers/{eip1193Stub,anvilControl,previewServer}.ts` (Plan 01-01)
- [ ] `01-RUNBOOK.md` populated with FORK_BLOCK + slot table + freshness window + Saturday timestamp + no-liquidity pair (Plan 01-01)
- [ ] Minimal testid set on MarketOrder.svelte + +page.svelte (Plan 01-01)
- [ ] Full testid retrofit on MarketOrder + LimitOrder + +page.svelte (Plan 01-03)
- [ ] ESLint rule + fixture (Plan 01-03)
- [ ] CI: foundry-toolchain swap + test-e2e job (Plan 01-09)

All Wave 0 items have a `<automated>` verify command in their owning plan's task. None depend on infrastructure that doesn't exist after Plan 01-01.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Archive-RPC CI green run (closes 999.11) | TEST-05 | Requires GitHub Actions execution against `main` with `BASE_RPC_URL` secret provisioned | After Plan 01-09 lands, push the branch. Verify `test-integration` and `test-e2e` jobs both succeed in Actions UI. |
| 01-AUDIT.md correctness review | TEST-10 / TEST-11 | Auditor judgment on whether a test "actually" covers a bug class is human-loop | Reviewer reads 01-AUDIT.md, spot-checks 3-5 cell-cited test paths against actual file contents to confirm coverage claims match describe block titles. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has one)
- [x] Wave 0 covers all MISSING references (Plan 01-01 builds the entire scaffold; 01-03/01-09 extend)
- [x] No watch-mode flags
- [x] Feedback latency < 30s for unit; full suite ≤ 8min
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-06
