---
phase: 01
plan: 01
subsystem: e2e-test-infrastructure
tags: [playwright, anvil, eip1193, csp, testid, e2e, TEST-05]
dependency_graph:
  requires:
    - tests/helpers/anvil.ts (v1.0 TEST-03 — startAnvilFork/stopAnvilFork reused)
    - vite.config.integration.js (parallel-config shape analog)
    - src/hooks.server.ts (CSP build host for E2E=1 gate)
  provides:
    - tests/integration/ui/globalSetup.ts (anvil + preview + smoke probe)
    - tests/integration/ui/fixtures.ts (testClient/fundedAccount/tokens fixtures)
    - tests/helpers/eip1193Stub.ts (browser-injected stub source)
    - tests/helpers/anvilControl.ts (snapshot/revert/fundErc20/advanceTime)
    - tests/helpers/previewServer.ts (vite preview lifecycle)
    - playwright.config.ts (workers=1 testDir=tests/integration/ui)
    - 01-RUNBOOK.md (FORK_BLOCK + slot table + freshness window + no-liquidity pair)
    - smoke.spec.ts (CI gate per D-14)
  affects:
    - All future Phase 1 E2E plans (01-04..01-07) build on this scaffold
    - Plan 01-03 extends data-testid retrofit (full UX mode tabs etc.)
    - Plan 01-09 wires CI test-e2e job using these primitives
tech-stack:
  added:
    - "@playwright/test ^1.59.1"
    - "playwright chromium browser"
  patterns:
    - "EIP-1193 stub via addInitScript proxy to anvil RPC (no in-browser secp256k1)"
    - "Snapshot-FIRST then-fund lifecycle (per-test fixture)"
    - "E2E=1 env-gated CSP relaxation (mirrors dev-gated upgrade-insecure-requests)"
    - "sr-only test-only mode-tab buttons alongside Select for click-by-testid"
key-files:
  created:
    - playwright.config.ts
    - tests/helpers/eip1193Stub.ts
    - tests/helpers/anvilControl.ts
    - tests/helpers/previewServer.ts
    - tests/integration/ui/globalSetup.ts
    - tests/integration/ui/globalTeardown.ts
    - tests/integration/ui/fixtures.ts
    - tests/integration/ui/smoke.spec.ts
    - .planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md
  modified:
    - package.json (test:e2e script + @playwright/test devDep)
    - src/hooks.server.ts (E2E=1 connect-src extras)
    - src/lib/components/orders/MarketOrder.svelte (5 data-testids)
    - src/routes/(main)/trade/[id]/+page.svelte (open-trade + side-toggle + 3 mode-tab)
decisions:
  - "FORK_BLOCK=33_400_000 inherited from v1.0 TEST-03 (refresh recipe in 01-RUNBOOK)"
  - "ERC20 funding via anvil_setStorageAt slot derivation (per Discretion #4)"
  - "Custom 80-LOC EIP-1193 stub vs library (per Discretion #3)"
  - "tests/integration/ui/ directory layout (per Discretion #1)"
  - "E2E=1 CSP env gate vs same-origin RPC proxy (per Discretion #5)"
  - "sr-only mode-tab buttons alongside existing <Select> — defers full UX retrofit to 01-03 per D-10"
  - "side-toggle testids on +page.svelte panel buttons (where Buy/Sell live), not MarketOrder.svelte"
metrics:
  duration_minutes: 11
  completed_date: 2026-05-06
  task_count: 3
  commit_count: 3
  file_count: 13
---

# Phase 01 Plan 01: UI-Driven E2E Harness — Bring-Up Summary

One-liner: Playwright + anvil-fork + vite-preview + EIP-1193 stub stack scaffolded with E2E=1 CSP gate, minimal testid retrofit on trade-panel + MarketOrder, and a smoke spec that gates the rest of Phase 01.

## What Shipped

**Test infrastructure (greenfield):**
- `playwright.config.ts` — `workers: 1` (anvil snapshot/revert is process-global), `testDir: tests/integration/ui`, 60s timeouts, retain-on-failure traces.
- `tests/helpers/previewServer.ts` — spawn `npm run preview` with `E2E=1` env, ready-probe via fetch loop, SIGTERM teardown. Mirrors the spawn + ready + grace-delay pattern from `tests/helpers/anvil.ts` so the two long-running test processes have identical lifecycle shape.
- `tests/helpers/anvilControl.ts` — viem TestClient factory bound to `127.0.0.1:8545` plus `withSnapshot`, `fundErc20` (slot-derived setStorageAt), and `advanceTime` (setNextBlockTimestamp + mine, Pitfall 6 mitigation).
- `tests/helpers/eip1193Stub.ts` — ~80-line stub source string for `page.addInitScript()`. Proxies `eth_requestAccounts` / `personal_sign` / `eth_signTypedData_v4` / `eth_sendTransaction` / `eth_chainId` to anvil's RPC. No in-browser secp256k1 — anvil's pre-funded accounts are unlocked.
- `tests/integration/ui/globalSetup.ts` — guards `BASE_RPC_URL`, runs `npm run build` with `E2E=1`, spawns anvil at FORK_BLOCK, starts preview on :4173, smoke-probes `/api/auth/csrf` (Pitfall 7 — fail fast on `vite preview` not serving routes; documented adapter-node fallback in 01-RUNBOOK).
- `tests/integration/ui/globalTeardown.ts` — SIGTERM both processes.
- `tests/integration/ui/fixtures.ts` — `test.extend({...})` providing `testClient` (snapshot-FIRST per-test lifecycle), `fundedAccount` (anvil[0]), `unfundedAccount` (anvil[1] for D-08 insufficient-balance), `tokens` (USDC/wtNVDA/wtAMZN with addresses + balance slots), and `page` extended with EIP-1193 stub injected via `addInitScript` before any `goto()`.
- `tests/integration/ui/smoke.spec.ts` — single Buy happy path. Funds 1000 USDC via `setStorageAt`, opens trade panel via page CTA, switches to Market mode + Buy side via testid clicks, fills `100`, submits, asserts both `[data-testid="success-toast"]` visible AND on-chain `tNVDA.balanceOf > 0n`. Skips when `BASE_RPC_URL` unset (mirrors `anvil-fork.test.ts:17`).

**Production source touches (minimal):**
- `src/hooks.server.ts` — `process.env.E2E === '1'` reads at module load; appends ` http://127.0.0.1:8545` to the existing `connect-src` literal. Mirrors the pre-existing `dev`-gated `upgrade-insecure-requests` pattern.
- `src/lib/components/orders/MarketOrder.svelte` — wraps existing root with outer `data-testid="market-form"` + inner `data-testid="market-form-loaded"`; adds `data-testid="spend-input"` on the TradeAmountInput container; adds `data-testid="trade-submit"` + `data-side` + `data-mode` on the Place Market Order button; adds an `sr-only` `data-testid="success-toast"` rendered when `tradeSubmittedSuccessfully` flips. Total 5 `data-testid` references in the file (plan minimum: ≥5).
- `src/routes/(main)/trade/[id]/+page.svelte` — `data-testid="open-trade"` + `data-side="buy"|"sell"` on the page-level Buy/Sell CTA buttons; `data-testid="side-toggle"` + `data-side` on the panel-internal Buy/Sell toggle; three `sr-only` test-only `data-testid="mode-tab"` buttons that programmatically set `panelStrategy` (rendered alongside the existing `<Select>`, not replacing user-facing UX). 4 `mode-tab` references total (plan minimum: ≥3).

**Documentation:**
- `01-RUNBOOK.md` — 8 verbatim sections per the plan grep gate: FORK_BLOCK (33_400_000 inherited from v1.0 + refresh recipe), ERC20 balance slot table (USDC/wtNVDA/wtAMZN with documented assumptions), Pyth freshness window (300s default, refinement deferred to Plan 01-06), Saturday market-hours timestamp (1745550000 verbatim), No-liquidity pair (primary `(wtAMZN, sell)` + backup `(wtIAU, sell)`), Snapshot/revert state-leakage trap (snapshot-FIRST ordering + per-spec restart escape hatch), evm_setNextBlockTimestamp + Date.now() patch sync (mine after setNextBlockTimestamp; ±2s browser tolerance), E2E=1 environment-variable contract (set ONLY in globalSetup; never in Vercel build).

## Verification Receipts

| Gate | Result |
|------|--------|
| `npm run check` | 3 errors (rpcMetrics.test.ts tuple-type baseline preserved) |
| `npm test -- --run` | 658 passed \| 1 skipped, 0 failed |
| `npx playwright test --list` | 1 test discovered in 1 file |
| `grep -c 'failWith(' src/lib/services/marketOrderExecution.ts` | 16 (≥ 12 baseline) |
| `grep -RE "EMERGENCY_RATIO_MULTIPLIER" src/` | 0 hits |
| `grep -E "from ['\"]\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` | 0 hits |
| `grep -RE "staleTime: 0" src/lib/queries/` | 0 hits |
| `grep -RE "tests/helpers/eip1193Stub" src/` | 0 hits (stub never imported into prod bundle) |
| 01-RUNBOOK.md required `##` headings | 8 (matches grep gate exactly) |
| MarketOrder.svelte data-testid count | 5 (≥ 5 required) |
| +page.svelte mode-tab count | 4 (≥ 3 required) |

The smoke spec was NOT executed end-to-end because `BASE_RPC_URL` is not provisioned in the executor's environment (CI-only secret). Plan 01-09 lands the CI run that validates this. Until then, the spec is exercised by `npx playwright test --list` (config + import resolution).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Side-toggle testids placed in +page.svelte, not MarketOrder.svelte**
- **Found during:** Task 2 action F
- **Issue:** Plan instructed side-toggle (Buy/Sell) testids on `MarketOrder.svelte`, but the actual side-toggle UI lives in `+page.svelte` (panel-internal `panelOrderSide` buttons). MarketOrder.svelte receives `orderSide` as a prop and never renders Buy/Sell selectors.
- **Fix:** Added `data-testid="side-toggle"` + `data-side` on the +page.svelte panel buttons; the smoke-spec selector pattern is unaffected (`page.click('[data-testid="side-toggle"][data-side="buy"]')` resolves cleanly).
- **Files modified:** `src/routes/(main)/trade/[id]/+page.svelte`
- **Commit:** ef71d1d

**2. [Rule 3 - Blocker] Mode-tab buttons added as sr-only alongside <Select>**
- **Found during:** Task 2 action J
- **Issue:** Plan expected `mode-tab` button-per-mode, but the trade-panel mode picker is a `<Select>` dropdown (`<option>` elements aren't clickable via Playwright's click-by-testid).
- **Fix:** Added 3 `sr-only` test-only buttons that programmatically set `panelStrategy`, rendered before the existing `<Select>`. User-facing UX is unchanged; full mode-tab UX retrofit is deferred to Plan 01-03 per CONTEXT D-10. Documented inline as a comment block referencing Plan 01-03.
- **Files modified:** `src/routes/(main)/trade/[id]/+page.svelte`
- **Commit:** ef71d1d

### Documented Assumptions in 01-RUNBOOK

- **FORK_BLOCK=33_400_000** retained from v1.0 TEST-03 because `BASE_RPC_URL` is not available to the executor for re-verification. If first CI run shows archive pruning at this block, Plan 01-09 follows the inline refresh recipe.
- **USDC balance slot=9** (Circle proxy default); **wtNVDA/wtAMZN balance slot=0** (OZ ERC20 default). Slot-discovery loop documented in 01-RUNBOOK §"Slot Discovery Recipe" — smoke spec funding will fail loudly if any slot is wrong, surfacing the issue at first CI run.
- **Pyth freshness window=300s** default until Plan 01-06 (TEST-08 stale-oracle E2E) re-extracts the constant from `static/registry/` Rainlang at FORK_BLOCK.

## Threat Model Re-Walk

All five STRIDE threats from the plan are mitigated by the landed scaffolding:

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-1-01-01 (`process.env.E2E` reaching production) | mitigate | Single literal `process.env.E2E === '1'` only in `src/hooks.server.ts`; CSP gate is one if-clause; Plan 01-09 will add a CI grep guard. 01-RUNBOOK §"E2E=1 environment-variable contract" documents the boundaries. |
| T-1-01-02 (anvil keys committed) | accept | PUBLIC anvil default mnemonic — documented inline in `fixtures.ts` ("DO NOT swap these for real keys"). |
| T-1-01-03 (BASE_RPC_URL secret leak) | mitigate | No echo of secret in any committed file. Plan 01-09 reuses the existing `${{ secrets.BASE_RPC_URL }}` pattern from `test-integration` job. |
| T-1-01-04 (stub bundled into prod) | mitigate | `tests/helpers/eip1193Stub.ts` lives under `tests/`; verified `grep -RE "tests/helpers/eip1193Stub" src/` returns 0. |
| T-1-01-05 (smoke hits production RPC) | mitigate | TestClient transport + EIP-1193 stub both bound to `http://127.0.0.1:8545` literal. anvil's `--fork-url` is read-only against `BASE_RPC_URL`; writes never propagate. |

## Hand-Off

Wave 1 of Phase 01 is complete. Plan 01-02 (TEST-10 audit matrix) and Plan 01-09 (CI plumbing) can run independently of this plan's runtime artifacts (they only need the test directory layout + `01-RUNBOOK.md` references). Plans 01-03..01-07 build on this scaffold and depend on the smoke spec being green in CI.

Outstanding for downstream plans:
- **Plan 01-03:** Extend `data-testid` retrofit (full mode-tab UX, slippage-input, asset-input, error-banner with `data-error-class`, LimitOrder shell). Removes the `sr-only` test-only mode-tab buttons in favor of a real button row.
- **Plan 01-06:** Re-extract Pyth `validTimePeriodSeconds` from `static/registry/` at FORK_BLOCK; update 01-RUNBOOK.
- **Plan 01-09:** CI test-e2e job; grep guards for E2E=1 and stub-import isolation; first archive-RPC green run validates the assumed FORK_BLOCK + slot table.

## Self-Check: PASSED

- All 13 listed files exist on disk and are tracked in git.
- All 3 commits (`8750472`, `ef71d1d`, `c64441b`) exist in `git log`.
- Locked invariants intact (failWith=16, EMERGENCY_RATIO_MULTIPLIER=0, no transaction.ts import, no staleTime:0).
- Playwright config + spec resolve via `npx playwright test --list`.
- `npm run check` at baseline 3 errors; `npm test` 658 passed.
