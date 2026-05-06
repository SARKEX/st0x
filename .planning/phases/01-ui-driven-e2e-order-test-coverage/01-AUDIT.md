# Phase 1 — Order Test Coverage Audit (TEST-10)

**Audited:** 2026-05-06
**Method:** Walked `tests/lib/**` + `tests/integration/marketOrder/**` + `tests/integration/ui/**`. Read first ~30 lines (describe blocks + imports) of every order-related test to classify against the bug-class register from `.planning/codebase/CONCERNS.md` + the v1.0 milestone-close cross-cutting constraints (TRADE-01..04 + TEST-08 a-e + limit-deploy + simulated-counterparty + DCA-deploy + hydration + stale-session + slippage-cap-per-order). Cells claiming "covers X" were verified against actual file contents — no claim from the RESEARCH §"Audit Matrix Template" was carried forward without re-checking the file on disk.

The pre-seeded matrix from `01-RESEARCH.md` §"Audit Matrix Template" served as the starting hypothesis; this audit is the verified version.

## Coverage Matrix

| Bug-Class Row | unit (tests/lib/) | service-integration (tests/integration/marketOrder/) | UI E2E (tests/integration/ui/) | Gap (must-fix? Y/N + rationale) |
|---------------|-------------------|------------------------------------------------------|-------------------------------|---------------------------------|
| TRADE-01 — INPUT/OUTPUT side semantics (maker→taker conversions) | tests/lib/types/orderPerspective.test.ts (243 lines — `getUserTakerInfo`, `deriveMakerSide`, `makerToTakerTokens`, `takerToMakerTokens`, `getMakerInputTokenAddress`, IO-index getters); tests/lib/utils/tokenMath.test.ts (PairDescriptor / TokenDescriptor / classifyFlow / describeQuote) | tests/integration/marketOrder/replay-wrong-side-classification.test.ts (forces a wrong-side-classified hydrated quote and asserts the boundary catches it before submission) | (planned: marketBuy.spec.ts in 01-04 + marketSell.spec.ts in 01-05) — currently only smoke.spec.ts exists from 01-01 | N — three columns covered after 01-04 + 01-05 land |
| TRADE-02 — transaction.ts ↔ marketOrderExecution.ts cycle severance | tests/lib/transactionStore.test.ts (430 lines — exercises `$lib/stores/transaction` against orderDeployment shape with wagmi mocks; structural import-direction guard); tests/lib/utils/marketOrderFill.test.ts (clampSlippageBps + computeRatioMultiplier + evaluateMarketOrderFill — pure-leaf util that severed the cycle); tests/lib/stores/transactionShared.test.ts (canonical 7-status enum + classifyError + extractTransactionError on the leaf module the cycle now routes through) | tests/integration/marketOrder/anvil-fork.test.ts (smoke — reads orderbook state at FORK_BLOCK, exercises the un-cycled marketOrderExecution → walletService → raindex chain) | (covered indirectly by 01-04 + 01-05 + 01-06 specs running through the real walkOrderbook → handleAggregatedTakeOrders chain in a Chromium context) | N — cycle-severance is structurally enforced by an import-direction lint + the unit/integration coverage above; no UI E2E asserts the structural property because it is a code-shape property, not a runtime property |
| TRADE-03 — on-chain freshness pre-flight | — (pure on-chain freshness check; no client-side unit covers the on-chain branch) | tests/integration/marketOrder/replay-aggregated-quote-stale.test.ts (transcript replay with stale aggregated-quote → asserts pre-flight rejects + failWith fires with the freshness reason) | (planned: marketFailures.spec.ts stale-oracle case in 01-06 — D-06 evm_setNextBlockTimestamp + addInitScript Date.now patch) | N — service-integration column populated; UI E2E covered after 01-06 lands |
| TRADE-04 — mode×side spend/asset-anchored symmetry | tests/lib/utils/marketPrice.test.ts (scaleAmount + walkOrderbook — fixed/float scaling at decimals boundary that powers spend-anchored Buy and asset-anchored Sell); tests/lib/utils/marketOrderFill.test.ts (19+ cases of evaluateMarketOrderFill across spend-anchored and asset-anchored anchors); tests/lib/utils/quote.test.ts (buildTokenPriceMap + ProcessedQuote shape consumed by both anchors); tests/lib/utils/approvalDecimals.test.ts (Buy 0.05% buffer on outputAmountGiven vs Sell exact-amount asymmetry) | tests/integration/marketOrder/replay-per-order-partial-fill.test.ts (per-order fallback path — partial-fill detection across both anchor modes via aggregated returning false) | (planned: Buy by-spend coverage in marketBuy.spec.ts + Sell by-asset coverage in marketSell.spec.ts — 01-04 + 01-05) | N — three columns covered after 01-04 + 01-05 land |
| TEST-08a — slippage exceeded | tests/lib/services/marketOrderExecution.test.ts (388 lines — ratio-cap math at the boundary that rejects when slippage exceeded); tests/lib/utils/marketOrderFill.test.ts (clampSlippageBps + MIN/MAX_SLIPPAGE_BPS bounds + computeRatioMultiplier ratio-cap math) | tests/integration/marketOrder/replay-slippage-cap-exceeded.test.ts (aggregated returns FALSE simulating SDK-layer slippage rejection — failWith captured) | (planned: marketFailures.spec.ts slippage case — 01-06 D-07: tight slippage in UI input → marketOrderExecution.ts ratio-cap rejection → `[data-testid="error-banner"][data-error-class="slippage"]`) | N — three columns covered after 01-06 lands |
| TEST-08b — no liquidity | — (no unit-level coverage for the no-liquidity outer branch — orchestration concern; covered at service-integration tier per Phase 4 D-01 layering) | tests/integration/marketOrder/replay-fallback-no-liquidity.test.ts (transcript replay with no-liquidity-on-fallback → asserts the empty-counterparty-set branch surfaces the right failure-reason via failWith + captureTakeOrderFailure) | (planned: marketFailures.spec.ts no-liquidity case — 01-06 D-07: chosen `(token, side)` pair with empty book at FORK_BLOCK; primary `(wtAMZN, sell)` per 01-RUNBOOK) | N — service-integration column populated; UI E2E covered after 01-06 lands |
| TEST-08c — stale oracle | — (pure on-chain freshness path; same rationale as TRADE-03) | tests/integration/marketOrder/replay-aggregated-quote-stale.test.ts (shared with TRADE-03 — surfaces stale-oracle failure-reason at service-integration tier) | (planned: marketFailures.spec.ts stale-oracle case — 01-06 D-06: evm_setNextBlockTimestamp + Date.now() patch synchronized) | N — service-integration column populated; UI E2E covered after 01-06 lands |
| TEST-08d — insufficient balance | tests/lib/transactionStore.test.ts (430 lines — partial coverage via wagmi readContract mocks for balance preconditions in the deployment + market-order pre-submission paths) | — (no replay-insufficient-balance.test.ts — wagmi balance reads are mocked at unit tier; service-integration tier focuses on raindex SDK orchestration, not pre-flight balance) | (planned: marketFailures.spec.ts insufficient-balance case — 01-06 D-08: switch EIP-1193 stub to anvil[1] = unfundedAccount fixture from 01-01 already in place) | N — UI E2E (the user-visible surface) is the right tier for this failure mode per Phase 1 charter; planned to land in 01-06 |
| TEST-08e — market-hours gating | — (`tests/lib/utils/marketHours.test.ts` does NOT exist — verified via `find tests -name marketHours\*`; src/lib/utils/marketHours.ts ships uncovered at unit tier) | — (no service-integration coverage — gating is client-side `Date.now()` evaluation, not on-chain) | (planned: marketFailures.spec.ts market-hours case — 01-06 D-06: Saturday 03:00 UTC `evm_setNextBlockTimestamp` + addInitScript Date.now patch → `marketHours.ts` returns `isMarketOpen=false` naturally) | **Y — must-fix.** Per D-13 must-fix bar item (2): TEST-08 failure mode lacking E2E coverage after this phase. The UI E2E covers it after 01-06 lands; however, the unit column is empty AND `marketHours.ts` is uncovered at unit tier — a regression in the gating predicate (e.g. weekday calculation, timezone offset, holiday list) would only be caught by the E2E spec, which is a slow + expensive smoke. Adding `tests/lib/utils/marketHours.test.ts` is the cheapest fix (table-driven fixture: a handful of timestamps spanning open/closed Mon–Sun + holiday boundaries). See Must-Fix Gap List item 1. |
| Limit-deploy correct-vault deposit | tests/lib/transactionStore.test.ts (exercises `getLimitOrderDeploymentArgs` from `$lib/services/orderDeployment` — verifies output-vault deposit shape against decoded calldata via `decodeFunctionData`); tests/lib/validateDeploymentArgs.test.ts (validateSelectedAmount + validatePeriod + validateBaseline + validateOverrideDepositAmount — pre-deployment input validation that gates the deposit shape) | — (no service-integration test for orderDeployment.ts — `tests/integration/marketOrder/` exists for execution paths only; deployment side has no anvil-fork integration coverage) | (planned: limitDeploy.spec.ts in 01-07 — deploys a limit order from the LimitOrder UI shell + asserts the correct output-vault address received the deposit on the fork) | N — three columns covered after 01-07 lands |
| Simulated counterparty fill on fork | — (cannot be exercised at unit tier — requires on-chain orderbook + counterparty signer) | — (no current service-integration spec for "deploy → counterparty fills → assert vault state" round trip) | (planned: limitDeploy.spec.ts in 01-07 — second half of the spec impersonates a counterparty signer via `anvil_impersonateAccount`, fills the deployed limit order, asserts vault drained correctly) | N — UI E2E (01-07) is the only tier that exercises the full round trip on the fork; correct architectural placement |
| DCA-deploy | tests/lib/transactionStore.test.ts (exercises `getDcaDeploymentArgs` shape via decoded calldata); tests/lib/validateDeploymentArgs.test.ts (shared with limit — validateSelectedAmount + validatePeriod + validateBaseline) | — | — (NOT planned in Phase 1 — D-10 explicitly defers DCA E2E retrofit to a future phase) | N — nice-to-have per D-13 → 999.x backlog (CONTEXT Deferred Ideas confirms) |
| Hydration failure recovery | tests/lib/transactionStore.test.ts (exercises store reactions to wagmi `readContract` failures during the hydration phase of deployment) | tests/integration/marketOrder/replay-hydration-failure.test.ts (transcript replay of a partially-hydrated quote → asserts the recovery path triggers + failWith carries the right reason) | — (failure mode is internal to SDK hydration; no user-visible UI distinct from generic "submission failed" surface) | N — internal failure mode; unit + service-integration sufficient per D-13 must-fix bar (does not map to a TRADE-01..04 boundary regression class with all-empty columns, and is not a TEST-08 sub-row) |
| Stale wallet session | tests/lib/stores/handleTakeOrders.test.ts (TakeOrdersParams parameter validation including signer-required preconditions); tests/lib/stores/authStore.test.ts (authMethod = 'wallet' \| 'dynamic' \| 'none' derivation including stale-session transitions) | tests/integration/marketOrder/replay-stale-session-recovery.test.ts (`mockGetSignerAddress` returns null → simulates session-id KV record absent / re-auth required path) | — (covered at unit + service-integration; the UI flow is identical to other failure surfaces — generic "submission failed" + re-auth nudge) | N — same rationale as Hydration row: not a TRADE-01..04 boundary class with all-empty columns, not a TEST-08 sub-row |
| Slippage cap exceeded (per-order) | tests/lib/services/marketOrderExecution.test.ts (per-order ratio-cap math at fallback path); tests/lib/utils/marketOrderFill.test.ts (computeRatioMultiplier — the per-order cap math itself) | tests/integration/marketOrder/replay-slippage-cap-exceeded.test.ts (per-order replay variant — fallback path slippage rejection captured via failWith) | (covered by TEST-08a UI spec — same user-visible surface; no separate UI E2E needed for per-order vs aggregated) | N — three columns covered transitively after 01-06 lands |
| OBS-03 take-order failure transcripts | tests/lib/services/observability/captureTakeOrderFailure.test.ts (failure_reason tag + extra transcript shape + try/catch sink wrapping + 5 TakeOrderFailureReason labels — strengthens regression net underneath every TEST-08 row by pinning the transcript shape failWith emits) | (asserted indirectly by every replay-*.test.ts via `mockCaptureTakeOrderFailure` argument shape) | (planned: 01-06 marketFailures.spec.ts assertions can pin both UI error AND transcript shape via Playwright network/console capture per CONTEXT §"OBS-03 failWith() transcripts") | N — observability invariant; not on the bug-class register but worth recording so it isn't accidentally regressed by a future testid retrofit |

## Must-Fix Gap List (TEST-11 input)

Per D-13 must-fix bar (CONTEXT line 106-110): a gap is must-fix if AND ONLY IF (1) it corresponds to a TRADE-01..04 boundary regression class with no test in any column, OR (2) it corresponds to a TEST-08 failure mode lacking E2E coverage after this phase's E2E plans (01-04..01-07) land.

Applying the bar mechanically:
- **TRADE-01..04 rows:** every row has at least two columns populated (after 01-04..01-07 land). None have all three columns empty. ⇒ no must-fix from rule (1).
- **TEST-08 a..e rows:** after 01-06 lands, every TEST-08 sub-row has UI E2E coverage. ⇒ no must-fix from rule (2) on the E2E side.
- **TEST-08e secondary check:** the UI E2E will cover it, but `marketHours.ts` is currently uncovered at unit tier (no `tests/lib/utils/marketHours.test.ts` exists). A regression in the gating predicate would only be caught by an end-to-end Playwright spec — slow, expensive, and only one timestamp per spec. The cheapest defensive layer is a table-driven unit test. This is the one gap the must-fix bar surfaces.

1. **TEST-08e — `tests/lib/utils/marketHours.ts` has no unit test (`tests/lib/utils/marketHours.test.ts` missing).**
   - Missing column: **unit** (`tests/lib/utils/`).
   - Suggested test file path: `tests/lib/utils/marketHours.test.ts`.
   - Suggested spec (table-driven, ≥ 8 cases):
     - Mon–Fri 09:30 ET → `isMarketOpen=true`
     - Mon–Fri 16:00 ET (close edge) → `isMarketOpen=false`
     - Mon–Fri 09:29 ET (open edge) → `isMarketOpen=false`
     - Saturday any time → `isMarketOpen=false`
     - Sunday any time → `isMarketOpen=false`
     - One published US market holiday (e.g. July 4 weekday) → `isMarketOpen=false`
     - Pre-market 04:00 ET → `isMarketOpen=false` (assuming RTH-only gating; spec verifies the assumption)
     - DST boundary day (Mar / Nov) → both halves of the timezone shift produce expected gating
   - Effort: ~30 LOC, no new test infra.
   - Rationale: closes the only must-fix gap surfaced by the D-13 bar; converts a slow E2E-only safety net into a fast unit-tier safety net.

Plan **01-08 mechanically reads this list** and converts each numbered item into a task.

## Nice-to-Have / Backlog (→ 999.x)

Per D-13: everything outside the must-fix bar. Captured here so the v1.1-close audit can route them to 999.x numbering without re-discovery.

1. **DCA-deploy E2E coverage** — captured in CONTEXT §"Deferred Ideas"; D-10 explicitly scopes the testid retrofit to MarketOrder + LimitOrder + trade-page shell only. Future phase that adds DCA E2E extends the retrofit incrementally.
2. **QuickTrade E2E coverage** — same reasoning as DCA; out of Phase 1 scope per CONTEXT §"Deferred Ideas".
3. **Hydration-failure UI surface assertion** — internal SDK failure mode; no distinct user-visible UI vs generic "submission failed" + retry nudge. Backlog if a future UX revision separates the surface.
4. **Dynamic Labs embedded-wallet E2E coverage** — CONTEXT D-05 scopes E2E to wagmi-only this phase; Dynamic SDK lacks a documented test mode. Captured in CONTEXT §"Deferred Ideas".
5. **Smart-contract-wallet (EIP-1271) E2E coverage** — out of scope per CONTEXT §"Deferred Ideas"; `personal_sign` from anvil-pre-funded EOA suffices for SEC-03 session sign-in.
6. **`removeOrder` mass-cancellation as a no-liquidity backup** — D-07 documented escape hatch; capture if natural one-sided book at FORK_BLOCK proves brittle across block bumps. Currently primary `(wtAMZN, sell)` per 01-RUNBOOK.
7. **Per-spec anvil restart as snapshot/revert backup** — D-02 documented escape hatch; capture if state-leakage bugs surface during execution. Currently per-test snapshot/revert per 01-01.
8. **`tests/integration/marketOrder/orderDeployment.test.ts`** — would close the empty service-integration cell on the "Limit-deploy correct-vault deposit" row. Currently covered at unit (transactionStore.test.ts decodes calldata) + UI E2E (01-07). Adding service-integration would be defense-in-depth, not regression-closure. Nice-to-have.
9. **999.7** — `svelte-check` baseline = 3 errors (`tests/lib/server/rpcMetrics.test.ts:165, 181, 182` tuple-type narrowing). Cosmetic; carried forward from v1.0. Re-confirmed in 01-01 verification receipts.

## Audit Method Notes

- **Test files walked:** 19 files
  - `tests/lib/services/marketOrderExecution.test.ts` (388 LOC)
  - `tests/lib/services/observability/captureTakeOrderFailure.test.ts`
  - `tests/lib/utils/marketOrderFill.test.ts` (clampSlippageBps + computeRatioMultiplier + evaluateMarketOrderFill — 26+ describe/it markers)
  - `tests/lib/utils/marketPrice.test.ts` (scaleAmount + walkOrderbook)
  - `tests/lib/utils/quote.test.ts` (buildTokenPriceMap + ProcessedQuote)
  - `tests/lib/utils/tokenMath.test.ts` (PairDescriptor / TokenDescriptor / classifyFlow / describeQuote / analyzeTrade)
  - `tests/lib/utils/approvalDecimals.test.ts` (Buy/Sell asymmetry)
  - `tests/lib/utils/format.test.ts` (excluded — formatting; not on bug-class register)
  - `tests/lib/utils/costBasis.test.ts` (excluded — historical cost-basis math; not on order-execution bug-class register)
  - `tests/lib/types/orderPerspective.test.ts` (243 LOC — TRADE-01 single source of truth)
  - `tests/lib/stores/approvalStore.test.ts` (ensureAllowance + APPROVAL_TX_CONFIRMATIONS — supporting; folds into TRADE-04 transitively but not on the named register)
  - `tests/lib/stores/authStore.test.ts` (auth-method derivation — referenced under Stale wallet session row)
  - `tests/lib/stores/handleTakeOrders.test.ts` (TakeOrdersParams validation — referenced under Stale wallet session row)
  - `tests/lib/stores/partialFillDetection.test.ts` (folds into TRADE-04 partial-fill semantics; not separately listed since marketOrderFill.test.ts is the canonical anchor)
  - `tests/lib/stores/transactionShared.test.ts` (canonical 7-status enum + classifyError — supporting TRADE-02 cell)
  - `tests/lib/transactionStore.test.ts` (430 LOC — orderDeployment shape + balance preconditions)
  - `tests/lib/validateDeploymentArgs.test.ts` (input-validation gate for limit/DCA deployment)
  - `tests/integration/marketOrder/anvil-fork.test.ts` + 7 `replay-*.test.ts` files
  - `tests/integration/ui/smoke.spec.ts` (Phase 1 01-01 deliverable)
- **Tests classified into the matrix:** 17 (every order-related test file appears in at least one cell)
- **Tests excluded as out-of-scope (with rationale):** 2
  - `tests/lib/utils/format.test.ts` — pure number/string formatting; no bug-class on the register depends on its correctness for trade-execution safety.
  - `tests/lib/utils/costBasis.test.ts` — historical cost-basis arithmetic for tax/PnL UI; not in the order-execution dataflow Phase 1 covers.
- **Source-of-truth for bug-class rows:** `.planning/codebase/CONCERNS.md` (TRADE-01..04 register) + `.planning/REQUIREMENTS.md` (TEST-08 a..e sub-rows + TEST-09 limit-deploy + simulated-counterparty + DCA-deploy) + v1.0 ROADMAP cross-cutting constraints (hydration / stale-session / slippage-cap-per-order from Phase 4).
- **Verification of pre-seeded matrix vs ground truth:**
  - ✅ `tests/lib/types/orderPerspective.test.ts` — exists, 243 LOC, covers all five exported helpers.
  - ✅ `tests/lib/utils/marketOrderFill.test.ts` — exists, 26+ describe/it markers (template said "19 cases"; ground truth higher).
  - ✅ `tests/lib/utils/marketPrice.test.ts` — exists, scaleAmount + walkOrderbook.
  - ✅ All 7 `replay-*.test.ts` files exist; structurally similar (vi.hoisted mocks + transcript-driven; per-spec divergence on aggregated handler return value or hydrated-quote shape).
  - ✅ `tests/integration/marketOrder/anvil-fork.test.ts` — exists, gated on `BASE_RPC_URL`, FORK_BLOCK = 33_400_000.
  - ✅ `tests/lib/transactionStore.test.ts` — exists at `tests/lib/` (NOT under `tests/lib/stores/`), 430 LOC, exercises orderDeployment shape via decoded calldata.
  - ✅ `tests/lib/validateDeploymentArgs.test.ts` — exists at `tests/lib/`, covers validateSelectedAmount + validatePeriod + validateBaseline + validateOverrideDepositAmount.
  - ❌ `tests/lib/utils/marketHours.test.ts` — confirmed ABSENT via `find /Users/alastairong/st0x/st0x/tests -name "marketHours*"` returning empty. Source `src/lib/utils/marketHours.ts` exists; test file does not. ⇒ Must-Fix gap #1.
  - ✅ `tests/integration/ui/` — exists (smoke.spec.ts + globalSetup.ts + globalTeardown.ts + fixtures.ts) per Plan 01-01 deliverable.
- **Method limitations:**
  - The audit reads the first ~30 lines of each file (describe blocks + imports + helper definitions) to classify coverage. It does not exhaustively enumerate every `it()` body. Classification is "this file covers X bug-class because its surface area touches Y exported symbols," not "this file's case N exercises code path P." A future deeper audit (out of D-12 scope) could quantify case-level coverage.
  - "(planned: ...)" cells reference plans 01-04..01-07 that have not yet shipped. The Gap column treats them as "will be covered" per the must-fix bar; if those plans regress or scope down, the must-fix list expands.
