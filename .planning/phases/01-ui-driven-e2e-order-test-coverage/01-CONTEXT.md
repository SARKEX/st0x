# Phase 1: UI-Driven E2E + Order Test Coverage - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Drive market Buy/Sell + limit-order deploy E2E flows from the actual trade-page UI buttons against an Anvil fork of Base mainnet with live Rain counterparty orders, surface every TEST-08 failure mode through the rendered UI rather than service internals, audit and gap-fill all existing order-related tests, and lock in a `data-testid` UI-coupling convention that survives the planned UI→API logic migration.

Eight REQ-IDs in scope (all from milestone v1.1 Test & Observe):

1. **TEST-05** — UI-driven Anvil-fork harness wired into the test runner; Base-mainnet fork at a pinned recent block with live Rain counterparty orders; reproducible per-test snapshot/revert.
2. **TEST-06** — Buy market order triggered from the trade-page UI button executes against forked counterparties and asserts on-chain fill + correct user/vault state.
3. **TEST-07** — Sell market order triggered from the UI button executes against forked counterparties and asserts on-chain fill + correct user/vault state.
4. **TEST-08** — Each market-order failure mode (slippage exceeded, no liquidity, stale oracle price, insufficient balance, market-hours gating) surfaces the user-visible UI error.
5. **TEST-09** — Limit order deployment from the UI deposits into the correct (output) vault; a simulated counterparty fill on the fork completes the order and asserts vault state.
6. **TEST-10** — Audit every existing unit + integration test under `tests/` related to order deployment, market execution, side semantics, and freshness; produce a written gap report.
7. **TEST-11** — Every gap classified "must-fix" in TEST-10 has tests added in this milestone.
8. **TEST-12** — UI-coupling discipline — E2E tests reference UI selectors / data-testids, not internal service exports; documented as a convention so the UI→API migration doesn't break the suite.

This phase **introduces a new top-level test surface** (Playwright UI E2E driving a built SvelteKit preview server against an Anvil fork) on top of the v1.0 anvil-fork harness already shipped under TEST-03. It does NOT add new product features, new chains, new tokens, new order types, or any account-abstraction work — those are explicitly out of scope per `.planning/REQUIREMENTS.md ## Out of Scope`.

</domain>

<decisions>
## Implementation Decisions

### UI Test Runtime (the discussed area)

- **D-01: Playwright + vite preview of production build.** Tests drive a real Chromium against `npm run build && vite preview` (Vercel-adapter output, minified bundle, real CSP from `hooks.server.ts`). Closest fidelity to what users see; preserves the EU-Sentry-CSP class of bug that v1.0 PR #170 caught. Build runs once in Playwright `globalSetup` and the preview server is reused across specs to amortize the build cost.

  - Rejected: `vite dev` (CSP differs from production — same drift class as v1.0 EU-Sentry incident); `@sveltejs/kit/test` adapter (untested in this codebase, would itself need a spike).

- **D-02: Anvil lifecycle — single fork in `globalSetup`, `evm_snapshot`/`evm_revert` per test.** One `anvil --fork-url $BASE_RPC_URL --fork-block-number $FORK_BLOCK` process spawned in Playwright `globalSetup` (mirrors v1.0 `tests/helpers/anvil.ts` shape). Each test takes a snapshot in `beforeEach` and reverts in `afterEach`. Document the well-known anvil snapshot/revert state-leakage trap in 01-RUNBOOK so the planner builds a defensive teardown helper.

  - Rejected: per-spec restart (5–10s slower per spec; reach for it only if snapshot leakage proves unworkable); single-fork-no-snapshot-with-test-ordering (couples tests to each other; masks regressions).

### Wallet/Signer Wiring (the discussed area)

- **D-03: Inject EIP-1193 stub via Playwright `addInitScript`.** Before each test, `page.addInitScript()` installs a `window.ethereum` provider that proxies `eth_requestAccounts` / `personal_sign` / `eth_sendTransaction` / `eth_signTypedData_v4` to a viem `WalletClient` bound to anvil at `http://127.0.0.1:8545` with a known anvil pre-funded private key. wagmi's `injected` connector picks it up natively — no MetaMask extension, no Dappwright/synpress overhead. The Phase 3 SEC-03+04 atomic-flip session-cookie sign-in flow runs end-to-end through this stub (`personal_sign` returns a real signature anvil can verify).

  - Rejected: Dappwright/synpress (CI cost 2–3× heavier; brittle to MetaMask UI changes; we don't ship a custom extension flow); store-stub bypass (skips `walletService.ts` codepath entirely — exactly the surface Phase 1 needs to exercise).

- **D-04: Fresh anvil pre-funded key + on-fork token funding.** Use one of anvil's 10 pre-funded accounts (`anvil --accounts 10`, default 10000 ETH each). For each test, fund the asset and payment tokens needed via either:
  - `anvil_setStorageAt` on the ERC20 storage slots (ERC20 balance slot derivable per token; document table in 01-RUNBOOK), OR
  - `anvil_impersonateAccount` of a known on-fork whale and `transfer()` to the test account in `beforeEach`.

  Deterministic; reproducible; no production-key leakage. Smart-contract-wallet (EIP-1271) signing path stays out of E2E scope (`personal_sign` is sufficient for SEC-03 session sign-in).

- **D-05: wagmi (direct-wallet) auth path only in this phase.** Dynamic Labs embedded-wallet path stays covered by the existing unit suite (`tests/lib/stores/authStore.test.ts` already exercises `authMethod = 'dynamic'` derivation). Adding a Dynamic shim in E2E doubles fixture surface and breaks every Dynamic SDK major version. Add a deferred backlog item for Dynamic E2E once the SDK exposes a documented test mode (see Deferred Ideas).

### Failure-Mode Forcing for TEST-08 (the discussed area)

Each failure mode has a single deterministic trigger — chosen to exercise the on-chain freshness path and the real `marketHours` util rather than route-mocking around them.

- **D-06: Stale oracle + market-hours gating — `evm_setNextBlockTimestamp`.**
  - Stale oracle: advance fork time past Pyth's freshness window so the on-chain pre-flight (TRADE-03 surface) sees stale data. Combined with a browser-side `Date.now()` patch via `addInitScript` so client-side time mirrors anvil time. This exercises the real freshness check rather than mocking the Pyth fetcher.
  - Market-hours gating: set timestamp to a Saturday 03:00 UTC and let `marketHours.ts` gate naturally via the patched `Date.now()`. No `marketHours.ts` stub.

  Rejected: route-intercepting Pyth payloads + stubbing `isMarketOpen()` (misses the bug class where UI says open but on-chain says stale — exactly the "no liquidity" mismatch class of issue the milestone is built to surface); fork-block selection for natural Sat or stale Pyth state (brittle to fork-block refresh).

- **D-07: Slippage + no-liquidity — UI input + token/side selection.**
  - Slippage exceeded: enter an absurdly tight slippage value in the trade-page slippage input; send a market order. The `marketOrderExecution.ts` ratio-cap math rejects naturally. Real codepath, no anvil manipulation.
  - No liquidity: pick a `(token, side)` pair at the chosen fork block where the orderbook genuinely has zero matching counterparties (tightly-liquid tokens like tNVDA frequently have one-sided books at any given block). Document the chosen pair in 01-RUNBOOK alongside the fork-block refresh recipe so a future block bump can find a replacement pair.

  Rejected: `removeOrder` mass-cancellation in setup (doable as fallback if natural one-sided books prove unreliable across fork-block bumps; capture as deferred technique); synthetic hand-crafted Rain orderbook on the fork (contradicts milestone principle "forked, not mocked — exercise the real ones").

- **D-08: Insufficient balance — separate prefunded-no-balance account.** Account #1 holds tokens (happy-path tests via D-04 funding); account #2 is a different pre-funded anvil account that holds ETH (for gas) but no ERC20 balance for the asset / payment token under test. The TEST-08 insufficient-balance case switches the EIP-1193 stub's signer to account #2.

  Rejected: burn-balance-via-transfer-to-zero on the same account (couples balance state across tests if snapshot/revert misses an ERC20 storage slot — anvil has known quirks here).

### data-testid Convention (the discussed area)

- **D-09: Compound testids — stable `data-testid` + semantic `data-*` attributes.** Selector grammar:
  - `data-testid` is the stable target name (e.g., `trade-submit`, `slippage-input`, `error-banner`, `success-toast`, `mode-tab`).
  - Semantic state lives in adjacent attributes (`data-side="buy"|"sell"`, `data-mode="market"|"limit"|"dca"`, `data-error-class="slippage"|"no_liquidity"|"stale_oracle"|"insufficient_balance"|"market_closed"`).
  - E2E selectors compose them: `[data-testid="trade-submit"][data-side="buy"]`, `[data-testid="error-banner"][data-error-class="slippage"]`.

  Survives feature additions: a new mode adds a `data-mode` value, not a new testid. Namespace stays bounded; tests stay readable.

  Rejected: flat hierarchical (`trade-buy-submit`, `trade-sell-submit`, `trade-buy-submit-market`...) — namespace grows linearly with feature combinations; BEM-ish `trade__form__submit--buy` — verbose without compensating benefit.

- **D-10: Retrofit scope — trade-page interactive shell only.** Concretely scoped to:
  - `src/lib/components/orders/MarketOrder.svelte` (1253 lines)
  - `src/lib/components/orders/LimitOrder.svelte` (lazy-loaded; testids land on the rendered shell)
  - `src/routes/(main)/trade/[id]/+page.svelte` (mode tabs, error/success surfaces, wallet-connect button shell)

  Not in this phase: DCA, QuickTrade, admin pages, dashboard, strategies. Capture as deferred ideas — future phases that add E2E coverage for those flows extend the testid retrofit incrementally.

  - Pitfall to flag in 01-RUNBOOK: TanStack lazy-loaded order components (Phase 2 v1.0 PERF-01 D-04 `{#await import()}` pattern) mean Playwright must `waitFor` the component-loaded state before testid selectors resolve. Reuse the CLS-safe skeleton testid as a "loading complete" anchor.

- **D-11: Convention documented in `.planning/codebase/TESTING.md` + light ESLint enforcement.**
  - Add a "UI Test Selectors" section to `.planning/codebase/TESTING.md` (the canonical testing doc, last updated 2026-04-28). Documents D-09 grammar, D-10 scope, and the rationale (UI→API migration survival).
  - Lint via a focused ESLint rule that flags new files under `tests/integration/ui/**` importing from `$lib/services/marketOrderExecution`, `$lib/stores/transaction`, or any other internal-logic module. Trusts the convention doc + code review for the rest.

  Rejected: no-lint convention-doc-only (erodes silently); strict ban on `getByText`/`getByRole` in E2E (over-rigid — semantic role/text is sometimes the right selector for accessibility-aligned assertions like the wallet-connect button label).

### Audit Format + Must-Fix Bar (the discussed area)

- **D-12: Audit deliverable — per-REQ coverage matrix tied to TRADE-01..04 + Phase 1 failure surfaces.** TEST-10 produces a single matrix:
  - **Rows:** the bug-class register from `.planning/codebase/CONCERNS.md` + v1.0 milestone close — TRADE-01 (INPUT/OUTPUT side semantics), TRADE-02 (transaction.ts cycle severance), TRADE-03 (on-chain freshness pre-flight), TRADE-04 (mode×side spend/asset-anchored symmetry), the 5 TEST-08 failure modes, limit-deploy correct-vault-deposit, simulated counterparty fill, DCA-deploy (lighter touch — coverage-only, no E2E).
  - **Columns:** `unit` (current `tests/lib/**`), `service-integration` (current `tests/integration/marketOrder/**`), `UI E2E` (new in this phase), `gap`.
  - **Cell content:** test file paths or "—".

- **D-13: Must-fix bar (TEST-11).** A gap is must-fix if AND ONLY IF:
  1. It corresponds to a TRADE-01..04 boundary regression class with no test in any of the three columns, OR
  2. It corresponds to a TEST-08 failure mode lacking E2E coverage after this phase's E2E plans land.

  Everything else (test redundancy, edge-case branches not on the bug-class register, DCA-deploy E2E gaps) is "nice-to-have" and goes to the milestone backlog (`999.x` numbering) for the next milestone to triage.

  Rationale: the milestone goal is "stop user-affecting trade-execution bugs," not "achieve coverage parity." The must-fix bar maps directly to the bug classes the milestone is built to close.

  Rejected: per-test classification table (file-by-file `keep / refactor-to-UI / delete-redundant / gap-fill`) — generates busywork on tests that don't map to user-facing risk; hybrid (matrix + appendix file walk) — adds write-up cost without changing the decision criterion.

### CI-Plumbing Scope (the discussed area)

- **D-14: Phase 1 absorbs backlog 999.8 + 999.11.** This phase ships green CI for both:
  - `npm run test:integration` against archive `BASE_RPC_URL` at the pinned fork block — closes 999.8 (current `Install Foundry (anvil)` step `exit 127` failure, recommended fix: switch to `foundry-rs/foundry-toolchain` GitHub Action) and closes 999.11 (no green archive-RPC CI run yet).
  - `npm run test:e2e` (NEW) — Playwright + vite preview + anvil; CI installs Playwright browsers (cached across runs) + Foundry; gated on the same `BASE_RPC_URL` archive secret.

  Without this, the suite is local-only, doesn't gate PR merges, and the milestone's "lock in trade-execution correctness" goal is unfulfilled. Folding the CI fix into Phase 1 keeps the scope aligned with the goal.

  Pre-flight in CI: a smoke step that runs ONE happy-path E2E test, fails fast on Foundry/Playwright/RPC config drift before the full suite.

  Rejected: defer Playwright CI to a Phase-1 follow-up plan ("follow-up plan becomes never"); defer all CI plumbing to backlog (E2E suite never gates merges).

### Claude's Discretion

- **Test directory layout** — `tests/integration/ui/` (parallel to existing `tests/integration/marketOrder/`) vs `tests/e2e/` is a planner choice. Either works; the `vite.config.integration.js` and any new `playwright.config.ts` reflect the chosen path.
- **Fork block selection** — researcher picks the specific `FORK_BLOCK` (current v1.0 value is 33_400_000 from May 2026; "recent block where live counterparty orders exist" per TEST-05 may need a refresh). Selection criteria: archive-RPC reachable, the chosen no-liquidity `(token, side)` pair holds at the block, post-Phase-3 contract addresses unchanged.
- **EIP-1193 stub library** — researcher chooses between rolling a minimal `addInitScript` snippet vs adopting an existing stub like `@web3-mock/wagmi-mock`. Either works as long as D-03 invariants hold.
- **ERC20 balance-slot discovery** — researcher picks the technique for D-04 funding (`anvil_setStorageAt` slot derivation per token vs whale impersonation per token). Document the table in 01-RUNBOOK regardless.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Milestone Planning
- `.planning/PROJECT.md` — Core value (correct trade execution), milestone framing, Out-of-Scope hard exclusions, Key Decisions log.
- `.planning/REQUIREMENTS.md` — TEST-05..12 full text + Scope Principles (UI-first / forked-not-mocked / transactions-are-the-failure-surface / no-new-features) + Out of Scope.
- `.planning/ROADMAP.md` — Phase 1 success criteria (5 bullets); backlog items 999.8 + 999.11 absorbed by D-14.
- `.planning/STATE.md` — milestone v1.1 status; v1.0 close-out summary including HUMAN-UAT carry-forwards.

### Codebase Audit (the source-of-truth for what Phase 1 covers)
- `.planning/codebase/CONCERNS.md` — Tech debt, known bugs, fragile areas, test coverage gaps (the audit motivating TEST-10/11 must-fix bar).
- `.planning/codebase/TESTING.md` — Vitest/jsdom/@testing-library/svelte conventions; the **destination doc for D-11 "UI Test Selectors" section**.
- `.planning/codebase/ARCHITECTURE.md` — wallet/auth two-path flow; INPUT/OUTPUT semantics single-source-of-truth (`src/lib/types/orderPerspective.ts`).
- `.planning/codebase/STACK.md` — Vitest 1.6.0 baseline; pinned Rain alpha versions; Playwright NOT yet installed.
- `.planning/codebase/INTEGRATIONS.md` — Goldsky / Pyth / Raindex / RPC fallback structure (relevant to TEST-08 stale-oracle forcing path).
- `.planning/codebase/STRUCTURE.md` — file layout; trade page at `src/routes/(main)/trade/[id]/+page.svelte` (2063 lines), MarketOrder at `src/lib/components/orders/MarketOrder.svelte` (1253 lines), LimitOrder lazy-loaded.
- `.planning/codebase/CONVENTIONS.md` — naming, import conventions; constraints for the data-testid retrofit.

### v1.0 Phase 4 Carry-Forward (anvil-fork harness — REUSE, do not rebuild)
- `.planning/milestones/v1.0-phases/phase-04-boundary-tests-and-drift-cleanup/04-CONTEXT.md` — TEST-03 fixture-strategy decisions (D-01 layered: anvil + replay JSON + hand-built); D-01a CI implications (BASE_RPC_URL provisioning, `foundryup` step); D-01b OBS-03 transcript-capture format pre-existing.
- `.planning/milestones/v1.0-phases/phase-04-boundary-tests-and-drift-cleanup/04-RUNBOOK.md` — anvil-fork operational recipe; foundry CI install gap (999.8) is tracked here.
- `tests/helpers/anvil.ts` — `startAnvilFork(forkBlock)` / `stopAnvilFork()` reference implementation. Phase 1 either reuses or wraps this; do not rebuild from scratch.
- `vite.config.integration.js` — separate Vitest config for anvil-driven tests; testTimeout / hookTimeout 60s. New Playwright config sits alongside, not replacing this.
- `tests/integration/marketOrder/anvil-fork.test.ts` + `replay-*.test.ts` — existing service-level integration coverage. Phase 1's TEST-10 audit references these directly to map current-vs-needed coverage.
- `package.json` `test:integration` script — Phase 1 adds a `test:e2e` sibling.

### Order Semantics + Trade Execution (under test)
- `CLAUDE.md` §"Order Semantics — INPUT/OUTPUT Perspective (Critical)" — maker-vs-taker boundary semantics; the bug-class register Phase 1 E2E tests must cover.
- `src/lib/types/orderPerspective.ts` — single source of truth for side semantics; covered by `tests/lib/types/orderPerspective.test.ts`.
- `src/lib/services/marketOrderExecution.ts` — aggregated → fallback → per-order paths; ratio-cap math; covered by `tests/lib/services/marketOrderExecution.test.ts` and `tests/integration/marketOrder/anvil-fork.test.ts`.
- `src/lib/utils/marketOrderFill.ts` — partial-fill detection; covered by `tests/lib/utils/marketOrderFill.test.ts` (19 cases).
- `src/lib/services/orderDeployment.ts` — limit-order deposit-into-output-vault path (TEST-09 surface).

### Backlog items absorbed
- `.planning/ROADMAP.md ## Backlog 999.8` — `test-integration` CI job foundry install fails (`foundry-rs/foundry-toolchain` action recommended fix).
- `.planning/ROADMAP.md ## Backlog 999.11` — anvil-fork CI run with archive `BASE_RPC_URL` not yet green; post-999.8 verification needed.

### Backlog items adjacent (NOT absorbed — flag for Phase 2 / future)
- `.planning/ROADMAP.md ## Backlog 999.7` — `svelte-check` baseline = 3 errors (`tests/lib/server/rpcMetrics.test.ts:165, 181, 182` tuple-type narrowing). Tangentially related; cosmetic.
- `.planning/ROADMAP.md ## Backlog 999.9` — `04-RUNBOOK.md` config-name drift (cosmetic doc fix).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`tests/helpers/anvil.ts`** — `startAnvilFork(forkBlock)` / `stopAnvilFork()` already implemented for v1.0 TEST-03; spawns anvil child process, waits for RPC ready, returns viem PublicClient. Phase 1 wraps this from Playwright `globalSetup` rather than rebuilding. Add a thin `evm_snapshot`/`evm_revert` helper alongside.
- **`vite.config.integration.js`** — pattern for a parallel test config gated behind a separate npm script. New `playwright.config.ts` follows the same isolation principle (don't pollute `npm test` feedback loop with multi-second E2E runs).
- **OBS-03 `failWith()` transcripts** — Phase 2 v1.0 added 12+ `failWith()` call sites in `marketOrderExecution.ts` emitting structured failure transcripts (`subgraph_quote`, `on_chain_state`, `ratio`, `slippage_cap`, `side`, `taker_action`). The TEST-08 E2E assertions can pin both the rendered UI error AND the underlying transcript shape via Playwright network/console capture — strengthens the regression net.
- **TanStack lazy-loaded order components** — Phase 2 v1.0 PERF-01 D-04 converted LimitOrder/DcaOrder to `{#await import()}` with CLS-safe skeleton placeholders. Skeleton testids double as "loading complete" anchors for Playwright `waitFor`.

### Established Patterns

- **Test layout convention** (TESTING.md §"Test File Organisation"): `tests/lib/<mirror-of-src>/<name>.test.ts` for client units, co-located `<name>.test.ts` for server-only modules. New UI E2E suite extends this with a third location: `tests/integration/ui/**` (planner's call vs `tests/e2e/`).
- **Atomic-commits-with-svelte-check-green discipline** carries forward unchanged from Phase 2 + Phase 3 + Phase 4. Every Phase 1 commit leaves svelte-check at the established baseline (3 errors, with 999.7 noted), every commit passes the test suite, no mid-flight broken states.
- **Cross-cutting Phase 2 + Phase 3 gates that MUST hold green at Phase 1 close**: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance (no `marketOrderExecution.ts` import from `$lib/stores/transaction`), `failWith()` count ≥ 12, `EMERGENCY_RATIO_MULTIPLIER` count = 0, `staleTime: Infinity` preserved, the SEC-03+04 atomic-flip session-cookie invariant intact.
- **Layered fixture strategy from Phase 4 D-01** (anvil + replay JSON + hand-built) — Phase 1 layers UI E2E on top as a fourth tier. UI E2E exercises the integrated stack; replay JSON still owns subgraph-lag scenarios; hand-built still owns pure-logic glue; anvil-direct integration still owns service-level orchestration.

### Integration Points

- **EIP-1193 stub injection** at `page.addInitScript()` (Playwright per-context) — must run before any `+page.svelte` script imports `svelte-wagmi` so the `injected` connector finds `window.ethereum` on first read. Validate via a smoke test in Plan 1.
- **Anvil control plane from the test layer** — `evm_snapshot` / `evm_revert` / `anvil_setStorageAt` / `anvil_impersonateAccount` / `evm_setNextBlockTimestamp` calls go through a viem `TestClient` bound to 127.0.0.1:8545, NOT through the in-browser EIP-1193 stub. Two distinct viem clients in the test process: one for control (TestClient), one for impersonation-as-signer (WalletClient).
- **CSP allowlist for Playwright runs** — production CSP at `hooks.server.ts` may not allow `127.0.0.1:8545` in `connect-src`. Plan 1 either (a) preview-mode CSP relaxation gated on an `E2E=1` env var, OR (b) routes the EIP-1193 stub through `window.fetch` to same-origin paths so CSP isn't a factor. Researcher picks; document the choice in 01-RUNBOOK.
- **Trade-page mode-tab routing** — `+page.svelte` switches between MarketOrder / LimitOrder / DcaOrder via mode tabs. E2E selectors must `[data-testid="mode-tab"][data-mode="market"]` click first, then wait for component lazy-load (CLS-safe skeleton anchor), then interact.

</code_context>

<specifics>
## Specific Ideas

- **EIP-1193 stub** — researcher should evaluate `@web3-mock/wagmi-mock` (or equivalent) before rolling a custom stub. The library only needs to forward `eth_requestAccounts`, `personal_sign`, `eth_sendTransaction`, `eth_signTypedData_v4`, `eth_accounts`, `eth_chainId`, plus the `accountsChanged` / `chainChanged` event emitter contract. Anything more is YAGNI for Phase 1.
- **Smoke test gate in CI** — before running the full Playwright suite, run ONE happy-path test (Buy market order, account-with-balance, default slippage). If that fails, exit fast with a clear "Foundry/Playwright/RPC misconfigured" diagnostic rather than burning CI minutes on a doomed full run.
- **Document the no-liquidity `(token, side)` pair in 01-RUNBOOK** alongside the fork-block refresh recipe so a future block bump can find a replacement pair without spelunking through orderbook history.

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion but belong in other phases or backlog. Don't lose them; don't act on them in Phase 1.

- **Dynamic Labs embedded-wallet E2E coverage.** D-05 scopes E2E to wagmi-only this phase. Add a backlog item for Dynamic E2E once the SDK exposes a documented test mode. Capture as `999.x` in the v1.1-close audit.
- **DCA-deploy E2E coverage.** D-10 scopes the testid retrofit to MarketOrder + LimitOrder + trade-page shell. DCA stays unit-tested this milestone. Future phase that adds DCA E2E extends the retrofit incrementally.
- **QuickTrade E2E coverage.** Same reasoning as DCA. Out of Phase 1 scope.
- **Admin-page E2E coverage.** Hard-out per `.planning/REQUIREMENTS.md ## Out of Scope` ("Admin-page observability deepening — internal-only").
- **`removeOrder` mass-cancellation in setup as a no-liquidity backup.** D-07 chose natural one-sided book at the chosen fork block. If that proves brittle across fork-block bumps in execution, fall back to impersonating order owners and cancelling. Capture the technique in 01-RUNBOOK as a documented escape hatch but don't build it preemptively.
- **Per-spec anvil restart as a snapshot/revert backup.** D-02 chose globalSetup-once + per-test snapshot/revert. If state-leakage bugs surface during execution, fall back to per-spec restart. Same pattern: document in 01-RUNBOOK as escape hatch.
- **Smart-contract-wallet (EIP-1271) E2E coverage.** Out of scope — `personal_sign` from anvil pre-funded EOA is sufficient for SEC-03 session sign-in. EIP-1271 path is unit-tested via `tests/lib/server/accessCodes.test.ts` + viem-fallback-Transport coverage from Phase 3 REL-02.

</deferred>

---

*Phase: 1-UI-Driven E2E + Order Test Coverage*
*Context gathered: 2026-05-06*
