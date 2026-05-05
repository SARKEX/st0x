# Phase 2: Trade-Execution Backbone Refactor - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Kill the four bug-classes in the trade-execution backbone so the same regressions cannot recur, and bring the trade page's first paint to a measured target:

1. **TRADE-01 — Side-semantics lockdown.** Codify INPUT/OUTPUT taker-vs-maker semantics through `src/lib/types/orderPerspective.ts` as the single source of truth. Structurally prevent direct `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex` access outside the helper module. Pin every boundary with unit-test coverage that fails if the side inverts.

2. **TRADE-02 — `transaction.ts` split.** Split the 2373-line monolith into focused, independently testable state machines for deploy, market-take, approval, and partial-fill detection. Structurally eliminate the circular import surface with `marketOrderExecution.ts` (currently survived only by the `marketOrderFill.ts` extraction in commit `89571b3` — patch, not fix).

3. **TRADE-03 — Freshness illusion.** Add an on-chain pre-flight multicall before submitting market takes, used as a *silent safety net* that auto-retries against the next-best on-chain order when the targeted order has vanished or been drained. Surface a clear inline error on the trade form only when the auto-retry chain exhausts.

4. **TRADE-04 — Execution math symmetry.** Make slippage-cap derivation, ratio multipliers, and order prioritization provably symmetric across Buy / Sell × spend-anchored / asset-anchored modes. Pin each mode×side pairing with regression tests that fail if the same bug class returns.

5. **PERF-01 — Trade page first paint.** Trade-page p75 LCP under the 2.5s Web Vitals "good" threshold, validated against the OBS-05 baseline dashboard. Lazy-load + bundle prune approach — no SSR.

This phase **does not** add fallback-RPC retry/backoff (REL-01, Phase 3), **does not** vendor the Rain strategies registry (REL-03, Phase 3), **does not** add hooks.server.ts integration tests (TEST-01, Phase 4), and **does not** add the orchestration-path integration suite for `marketOrderExecution.ts` + `transaction.ts` (TEST-03, Phase 4 — distinct from TRADE-04's mode×side regression tests, see ROADMAP Phase 4 note).

</domain>

<decisions>
## Implementation Decisions

### TRADE-01 — Side-Semantics Ban Mechanism

- **D-01:** Use an **ESLint custom rule** as the structural ban mechanism. The rule flags direct property reads of `inputTokenAddress`, `outputTokenAddress`, `inputIOIndex`, `outputIOIndex` outside an allowlist of files (`src/lib/types/orderPerspective.ts` itself, generated subgraph types, and any explicit per-call-site escape via comment marker). Rationale: matches CONCERNS.md fix approach ("Consider an ESLint custom rule or a comment marker"); gives editor-time feedback (red squiggle while you type the bug) instead of catching it 20 minutes later in CI; enforces an existing pattern (`orderPerspective.ts` is already the canonical helper) rather than designing a new abstraction. Branded TypeScript types and grep-only CI gate were considered and rejected — branded types require migrating every consumer at once (high scope, low solo-team velocity), and grep-only loses editor feedback.

- **D-02:** **Migration sequence: codemod-first, then flip.** Researcher/planner writes a codemod that rewrites the 88 existing direct-access call sites (`grep -rn "inputTokenAddress\|outputTokenAddress\|inputIOIndex\|outputIOIndex" --include="*.ts" --include="*.svelte"` returned 88 hits across 17 files at planning time) into helper calls from `orderPerspective.ts`. Codemod lands first (one PR, no behavior change); ESLint rule flips on after the codemod merges. This avoids the rip-and-replace blast radius of a single mega-PR while still locking the rule down before any new development can re-introduce raw access.

- **D-02a:** **Helper API surface, test coverage, and exact rule-author mechanics are Claude's discretion.** Researcher/planner picks whether `orderPerspective.ts` needs new helpers added (e.g., `getMakerInputToken(order)` accessor wrappers) or whether existing helpers (`deriveMakerSide`, `getUserTakerInfo`, `makerToTakerTokens`, `takerToMakerTokens`) are sufficient with the codemod. The 19 existing tests in `tests/lib/types/orderPerspective.test.ts` are the template for new tests at any boundaries the codemod surfaces.

### TRADE-03 — Freshness Illusion: Silent Pre-flight + Inline Terminal Error

- **D-03:** Pre-flight is a **silent safety net, not a UX interruption.** Before submitting a market take-order, `marketOrderExecution.ts` issues an on-chain `multicall` against the orderbook for each targeted order, reading: order existence (not cancelled / not filled), output vault balance, and current ratio. The multicall result is *not* surfaced to the user as a warning when it diverges — it is consumed by the execution path itself. Rationale captured during discussion: slippage already protects against "price moved within an order" (the user-visible ROADMAP outcome that gets attention); pre-flight specifically catches the case slippage cannot help with — "the order isn't actually there anymore" (filled by another taker, vault drained, maker cancelled). Surfacing this as a proactive UI banner would interrupt every staleness event when the system can transparently retry.

- **D-04:** **On targeted-order-vanished/drained: auto-walk to the next-best on-chain order and submit against that one.** This extends the existing aggregated → fallback → per-order cascade in `marketOrderExecution.ts:328-368`, but informed by fresh on-chain truth from the multicall instead of trusting the (potentially stale) subgraph. User experience: in the common case, they see a fill at a price within their slippage tolerance; the staleness was handled silently. The slippage cap continues to provide its existing guarantee — if the on-chain best price now exceeds the user's tolerance, the take-order reverts as it does today (which is the correct behavior).

- **D-05:** **Terminal-state UX (auto-retry chain exhausted): inline error on the order form** in `MarketOrder.svelte`. Copy: "No liquidity available right now for this size. Try a smaller amount or check back in a minute." The user stays on the trade page with their input intact (they can adjust size and retry). Toast + form-reset was considered and rejected for losing the user's input.

- **D-06:** **OBS-03 transcript constraint preserved regardless of UI copy.** The `failWith()` helper from Plan 01-07 must continue to fire on every error-return path the new pre-flight + auto-retry machinery introduces. Researcher/planner ensures the expanded code paths route through the existing transcript-builder seam in `marketOrderExecution.ts` — the dev-facing observability path is non-negotiable; the user-visible copy is the only choice point. Grep gate from 01-08 (`failWith(` count) extends to cover the new failure modes.

- **D-06a:** **Pre-flight implementation details are Claude's discretion.** Where the multicall is wired (extending the existing client-side `marketOrderExecution.ts` prepare path is the obvious slot — no server endpoint), retry depth (one re-walk vs N levels deep), exact multicall ABI shape, and how `vaultBalance` populates back into the OBS-03 transcript (Phase 1 deliberately deferred this — see Phase 1 D-? `01-07: vaultBalance STAYS null in Phase 1`) are all planner calls.

### PERF-01 — Trade-Page First-Paint Target & Approach

- **D-07:** **Target: p75 LCP < 2.5s** on `/trade/[id]/+page.svelte`, measured against the existing Vercel Speed Insights dashboard (`https://vercel.com/st-0x/st0x/observability/speed-insights`, ~9 months of data accumulated since 2025-07-21 per Phase 1 RUNBOOK). Web Vitals "good" threshold; clear pass/fail. If the current p75 baseline (researcher pulls it during plan-phase) is already under 2.5s, the work focuses on not regressing while TRADE-01..04 land on the same page; if above 2.5s, work scopes to closing the gap.

- **D-08:** **Approach: lazy-load + bundle prune. No SSR.** Three-pronged client-side optimization:
  1. **Lazy-load** `LimitOrder.svelte` and `DcaOrder.svelte` (load only when their tab is opened, not on initial trade-page render — the default tab is Market). Lazy-load chart libraries (`TradingViewChart`, `lightweight-charts`, `TokenMarketCharts`) similarly.
  2. **Bundle prune** — researcher audits the trade-page bundle (rollup-plugin-visualizer or vite-bundle-analyzer) and removes top offenders. The Rain orderbook WASM SDK is an unavoidable cost for trading; everything else is fair game.
  3. **Reduce TanStack Query waterfall** — current trade page imports 5+ query factories (`createTokenOrderbookQuotesQuery`, `createTokenTradeActivityQuery`, `createOracleQuotesQuery`, `createSingleSftQuery`, `createUserVaultsQuery`); some fire in waterfall when they could parallelize or be prefetched.

  **No `+page.server.ts` / no SSR introduction in this phase.** Rationale: the trade-execution refactor (TRADE-01..04) is landing on the same page; adding SSR simultaneously would touch the auth/network/wallet flow at the same time the take-order path is being restructured, multiplying risk on a real-money page. SSR can be revisited in a future milestone if lazy-load + bundle prune doesn't credibly hit 2.5s.

- **D-08a:** **Specific lazy-load mechanism, bundle audit tool choice, and exact query-waterfall reorganization are Claude's discretion.** Researcher/planner picks Svelte dynamic-import vs `await import()` patterns, the bundle-analyzer tool, and which queries to parallelize/prefetch based on the dependency graph. Validation uses the OBS-05 dashboard before/after.

### Claude's Discretion

These were not user-locked and are open for the researcher/planner to decide:

- **TRADE-02 split granularity.** ROADMAP names four state machines (deploy / market-take / approval / partial-fill detection), but `transaction.ts` also owns balance/allowance reads with retry, post-confirmation polling, vault invalidation, multi-tx UI orchestration, and analytics. Whether the split lands as a strict 4-machine partition with a thin orchestrator, or finer-grained (5–7 modules), is the researcher's call. Constraint: the existing `TransactionStatus` enum is bound to UI in many places (`/trade/[id]/+page.svelte`, `MarketOrder.svelte`, `QuickTrade.svelte`, etc.) — split must not break those bindings without a migration plan. Eliminate the `marketOrderExecution.ts` ↔ `transaction.ts` circular import surface structurally (not the patch-by-extracting-a-helper pattern of `89571b3`).

- **Rollout / risk strategy.** ROADMAP says "no everything-breaks-for-a-day migrations; feature flags, parallel implementations, and staged rollouts where appropriate." Codebase has zero feature-flag pattern today. Planner picks the rollout shape based on what's actually needed — likely a combination of (a) keeping the old + new code paths in parallel during TRADE-02 with a runtime selector, (b) PR-by-PR atomic commits with green CI between each, (c) shipping observation-mode-only first (the new code path runs in shadow, logs divergences via OBS-03 transcript fields, but the old path is still authoritative) before flipping authority. Solo-team simplicity bias from Phase 1 (e.g., D-09 plain webhook over Block Kit) suggests no feature-flag SaaS — env-var or wallet-allowlist gate at most.

- **Phase-internal sequencing & wave parallelism.** ROADMAP guidance: TRADE-01 → TRADE-02 → TRADE-03 → TRADE-04 sequentially because they're tightly coupled. PERF-01 timing relative to TRADE-* is open — could run in parallel since lazy-loading order forms is mostly orthogonal to the take-order path, OR could land last to avoid bundle-shape changes mid-refactor. Planner decides.

- **Exact npm dependencies, file placement, naming.** Researcher/planner picks ESLint custom-rule package (custom rule vs eslint-plugin-local), bundle-analyzer tool, codemod harness (jscodeshift vs ts-morph), and any new module locations consistent with `.planning/codebase/CONVENTIONS.md`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Planning

- `.planning/ROADMAP.md` §"Phase 2: Trade-Execution Backbone Refactor" — phase goal, success criteria (5 bullets), `Depends on: Phase 1` (specifically OBS-03 instrumentation must exist before TRADE-03/04 land — already complete; OBS-05 baseline must exist before PERF-01 can validate against it — already complete), `Requirements: TRADE-01, TRADE-02, TRADE-03, TRADE-04, PERF-01`. Sequencing notes (TRADE-01 → TRADE-02 → TRADE-03 → TRADE-04; PERF-01 timing open) and the "no everything-breaks-for-a-day migrations" rollout constraint.

- `.planning/REQUIREMENTS.md` — full text of the 5 phase REQ-IDs (TRADE-01..04, PERF-01). Researcher and planner must address every REQ-ID; checker enforces coverage. Specifically:
  - TRADE-01: codify INPUT/OUTPUT semantics, ban raw access, boundary tests
  - TRADE-02: split `transaction.ts`, eliminate circular import structurally
  - TRADE-03: pre-flight multicall + UI staleness signaling
  - TRADE-04: provably symmetric math across Buy / Sell × spend / asset-anchored, regression tests for each mode×side
  - PERF-01: explicit p75 LCP target validated against OBS-05 baseline (target locked at 2.5s in D-07)

- `.planning/PROJECT.md` — milestone constraints. Especially: single chain (Base 8453); real users on real money (no all-at-once flips); solo / 1-2 dev team; Key Decisions table (refactor full backbone as one connected effort because pieces are tightly coupled; outcome-based done = whackamole stops + ship-without-fear).

- `.planning/STATE.md` — current position. Phase 1 closed 2026-04-29; Phase 2 unblocked. OBS-03 + OBS-04 instrumentation in place; OBS-05 dashboard confirmed receiving data.

### Phase 1 Artifacts (carry-forward)

- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-CONTEXT.md` — Phase 1 decisions (D-01 through D-17). Especially: D-08 (OBS-03 transcript fields and the "replay-from-one-log-entry" acceptance test) is the upstream contract Phase 2's expanded failure paths must continue to satisfy; D-15 (browser-tier OBS-03 = Sentry + console.error JSON) sets the dual-sink pattern Phase 2 inherits when adding new failure modes; D-13 (out-of-scope guardrails — no AA, no multi-chain, no `+error.svelte`) carries forward unchanged.

- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — Operational runbook from Phase 1 close. Documents the Vercel Speed Insights dashboard URL (`https://vercel.com/st-0x/st0x/observability/speed-insights`), confirms OBS-05 has been receiving data since 2025-07-21, and lists Phase 2 / PERF-01 as the explicit hand-off (this baseline is what the 2.5s target is set against).

- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-SUMMARY.md` and per-plan `01-NN-SUMMARY.md` files — Phase 1 plan outcomes; useful for understanding the surface that Phase 2 inherits (especially `01-07-SUMMARY.md` for the OBS-03 `failWith()` seam in `marketOrderExecution.ts`).

- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/deferred-items.md` — open deferred items from Phase 1. Specifically the cache.ts:48-53 stale comment (deferred to next plan that touches `src/lib/server/cache.ts`) — Phase 2 PERF-01 may touch query-cache wiring; if so, opportunistically close.

### Codebase Audit

- `.planning/codebase/CONCERNS.md` — full audit. Tech-debt entry "Order INPUT/OUTPUT perspective semantics — known footgun" is the canonical statement of the bug class TRADE-01 closes. Fragile-areas entry "`src/lib/stores/transaction.ts` (2373 lines)" is the canonical statement of the TRADE-02 problem. Known-bug entry "Slippage tolerance ignored on Sell + false partial-fill flag (FIXED 2026-04-27)" — root cause class is the maker/taker IO inversion; this is the regression that TRADE-04 is preventing structurally. Use this file to look up exact line numbers for code targets (`marketOrderExecution.ts:395-431` `filterQuotesForSide`; `marketOrderExecution.ts:328-368` aggregated→fallback→per-order cascade; `marketOrderExecution.ts:244-247` `*UpTo` precision tolerance comment; `tradeTransform.ts:48-52,138-142` asset detection).

- `.planning/codebase/ARCHITECTURE.md` — system architecture. Confirms client-only trade page (no SSR today), TanStack Query waterfall structure, Svelte 4 + SvelteKit 2 routing.

- `.planning/codebase/STACK.md` — tech stack. Pin ESLint custom-rule mechanics to Svelte 4 + TypeScript strict + the existing `eslint.config.js`.

- `.planning/codebase/CONVENTIONS.md` — coding conventions. Honor when introducing new modules from the TRADE-02 split.

- `.planning/codebase/STRUCTURE.md` — directory layout. Use to pick file placement for new state-machine modules.

- `.planning/codebase/TESTING.md` — testing conventions. Use as the template for new TRADE-04 mode×side regression tests and any new tests added during the codemod.

- `.planning/codebase/INTEGRATIONS.md` — current observability surface. Phase 2 inherits Sentry + pino + Vercel Speed Insights from Phase 1; new failure paths must continue to emit through the existing seams.

### Project Guidance (with drift warning)

- `CLAUDE.md` — project instructions for AI agents. **Drift warning preserved from Phase 1:** aspirationally describes multi-chain (Base/Arbitrum/Optimism/Ethereum) and account abstraction (Rhinestone SDK / EIP-7702 / `account-abstraction/` directory). **None of those exist in code.** DRIFT-03 in Phase 4 fixes this. Researcher/planner: treat single-chain (Base 8453) + two auth paths (wagmi direct + Dynamic embedded) as the only ground truth; ignore CLAUDE.md sections that conflict with `.planning/codebase/`. The `## Order Semantics — INPUT/OUTPUT Perspective (Critical)` section of CLAUDE.md, however, is accurate and is the prose statement of the bug class TRADE-01 is locking down — researcher/planner should treat it as supplementary to `src/lib/types/orderPerspective.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/lib/types/orderPerspective.ts` (196 lines) — single source of truth for maker/taker boundary logic. Existing helpers: `deriveMakerSide`, `getUserTakerInfo`, `makerToTakerTokens`, `takerToMakerTokens`. TRADE-01 codifies access *through* this module by banning bypass paths; researcher decides whether new helpers need to be added or the existing surface is sufficient with the codemod.

- `src/lib/utils/marketOrderFill.ts` (84 lines) — extracted helpers from the `89571b3` partial-fill / slippage-on-Sell fix. Comment at line 5 documents the extraction motive: "the same logic without circular imports, and so the logic is easily unit-tested." Existing 19-test suite at `tests/lib/utils/marketOrderFill.test.ts` is the template for TRADE-04 mode×side regression tests. TRADE-02's circular-import elimination must not regress this property.

- `src/lib/services/marketOrderExecution.ts` (559 lines) — the orchestration surface for take-orders. Key sites for Phase 2:
  - `filterQuotesForSide` at `:395-431` — taker-side filter that crosses against ask for Buy / bid for Sell. Direct boundary subject to TRADE-01 lockdown.
  - Aggregated → fallback → per-order cascade at `:328-368` — the silent auto-retry path TRADE-03 D-04 extends with on-chain truth.
  - `*UpTo` precision tolerance comment at `:244-247` — preserve through TRADE-04 math symmetry work.
  - OBS-03 `failWith()` seam (Plan 01-07) — every new error-return path Phase 2 introduces must route through this for transcript capture (D-06).

- `src/lib/stores/transaction.ts` (2373 lines) — the TRADE-02 target. Single combined `TransactionStatus` enum at `:347` is bound to UI in many components; split must preserve UI bindings or migrate them. Aggregated-take cache, multi-tx orchestration, and partial-fill detection all colocated. Pre-existing 4 svelte-check errors at lines 664, 686, 708, 2346 (baseline since Phase 1 — will be naturally resolved by the split refactor).

- `src/lib/components/orders/MarketOrder.svelte` — host of the existing 20-second client-side quote-freshness banner (`ORDERBOOK_MAX_STALENESS_MS = 20_000` at `:49`; UI strings at `:1044-1046` "Price may be outdated"). TRADE-03 D-05 inline terminal-state error lives in this component. Existing freshness banner is *not* the TRADE-03 staleness signal (it measures fetch age, not chain divergence) and stays as-is.

- `src/lib/api/orders.ts:53-86` (`estimateRatioFromFallback`) — read-from-oracle fallback pattern referenced in CONCERNS.md `SPYM/fallback price` known-bug. Useful as a precedent for how live-cache reads integrate into the trade-execution path.

- Vercel Speed Insights wired in `src/routes/+layout.svelte:31` (consent-gated through `onAnalyticsAccepted` callback wired into `<CookieConsent />`). PERF-01 validates against the data this is already collecting.

### Established Patterns

- **TanStack Query** for server-state with explicit cache keys (`['oracleQuotes', networkId]`, `['orderbook', tokenId, networkId]`). Query waterfall reduction (PERF-01 D-08) operates on this surface.

- **Svelte stores** for client UI state. `transactionStore` is the largest single store; multiple components subscribe. TRADE-02 split must preserve the `subscribe()` contracts UI components depend on, or migrate them atomically.

- **`*UpTo` over `*Exact`** in float arithmetic (`marketOrderExecution.ts:244-247` comment) — chosen specifically to tolerate `0.999...999` vs `1` precision edge cases. TRADE-04 math symmetry work must preserve this.

- **Aggregated → fallback → per-order cascade** in `marketOrderExecution.ts:328-368` — already does subgraph-staleness fallback at the SDK layer. TRADE-03 D-04 extends this with fresh on-chain truth from the multicall, not replaces it.

- **OBS-03 `failWith(reason, errOrMessage, userFacingError)` seam** (introduced in Plan 01-07). Every error-return path in `marketOrderExecution.ts` routes through this; new paths from Phase 2 must too. The 01-08 grep gate (`failWith(` count ≥ 8 in 01-08; current = 9) re-runs as a phase-exit verification step for Phase 2 to prevent observability regression.

- **Pre-existing 4 svelte-check errors baseline** at `src/lib/stores/transaction.ts` lines 664, 686, 708, 2346 — Phase 1's plans treated this as the baseline (don't regress, don't ship-fix). TRADE-02 will naturally clear these as the split progresses.

### Integration Points

- **TRADE-01 ban site:** `eslint.config.js` (root). Custom rule lives in a new `eslint-plugin-local/` directory or as an inline rule. Allowlist: `src/lib/types/orderPerspective.ts`, generated subgraph types, any explicit per-site escape via comment marker.

- **TRADE-01 codemod target files** (88 hits, 17 files): `tests/lib/utils/quote.test.ts`, `tests/lib/utils/marketPrice.test.ts`, `tests/lib/utils/tokenMath.test.ts`, `tests/lib/services/marketOrderExecution.test.ts`, `src/lib/queries/orderbook.ts`, `src/lib/stores/transaction.ts`, `src/lib/utils/tokenMath.ts`, `src/lib/utils/orderbook.ts`, `src/lib/utils/transactionDisplay.ts`, `src/lib/components/TokenSwapModal.svelte`, `src/lib/components/QuickTrade.svelte`, `src/lib/components/orders/MarketOrder.svelte`, `src/lib/components/orders/OrdersTable.svelte`, `src/lib/api/orders.ts`, `src/lib/services/marketOrderExecution.ts`, `src/routes/(main)/trade/[id]/+page.svelte`, `src/routes/(main)/dashboard/+page.svelte`. Researcher should re-grep at planning time to catch drift.

- **TRADE-02 split origin:** `src/lib/stores/transaction.ts`. Likely targets: `src/lib/stores/deployTransaction.ts`, `src/lib/stores/marketTakeTransaction.ts`, `src/lib/stores/approvalTransaction.ts`, `src/lib/stores/partialFillDetection.ts` (or similar — researcher names them). Thin orchestrator (`src/lib/stores/transaction.ts` retained as a re-export façade) preserves UI bindings during migration.

- **TRADE-03 pre-flight call site:** Extend `src/lib/services/marketOrderExecution.ts` — add the multicall before `executeMarketOrder` actually submits. Auto-walk-to-next-best path lives inside the same module's existing aggregated → fallback → per-order cascade.

- **TRADE-03 inline terminal error:** `src/lib/components/orders/MarketOrder.svelte` (and likely `QuickTrade.svelte` if it's also a market-order surface). Surface uses the existing inline-error rendering pattern; researcher confirms.

- **TRADE-04 regression test surface:** `tests/lib/utils/marketOrderFill.test.ts` (extend; existing 19 tests + new mode×side cases) and `tests/lib/services/marketOrderExecution.test.ts` (extend with new boundary cases). Phase 4 TEST-03 covers the orchestration path (aggregated → fallback → per-order, hydration failures, stale session) — distinct work; do not duplicate.

- **PERF-01 lazy-load surface:** `src/routes/(main)/trade/[id]/+page.svelte` imports `MarketOrder.svelte`, `LimitOrder.svelte`, `DcaOrder.svelte`, `TradingViewChart.svelte`, `TradingViewWidget.svelte`, `TokenMarketCharts.svelte`, `lightweight-charts` — each is a candidate for dynamic-import deferral.

- **PERF-01 query-waterfall surface:** `src/routes/(main)/trade/[id]/+page.svelte` imports `createTokenOrderbookQuotesQuery`, `createTokenTradeActivityQuery`, `createTakerTradesQuery`, `createBatchTradesQuery`, `createOracleQuotesQuery`, `createSingleSftQuery`, `createUserVaultsQuery`, plus `prefetchGlobalOrders`, `prefetchUserVaults`. Researcher maps the dependency graph; planner picks the parallelize/prefetch strategy.

- **PERF-01 validation:** Vercel Speed Insights dashboard at `https://vercel.com/st-0x/st0x/observability/speed-insights`. Pull baseline before/after each PERF-01 change; planner picks the cadence.

</code_context>

<specifics>
## Specific Ideas

- **The "why pre-flight at all" question.** During discussion, the user pushed back: "My inclination is to let it submit. This is the reason for slippage controls surely?" The reframe that produced D-03/D-04: slippage protects against "price moved within an order"; pre-flight specifically catches "the order isn't there anymore" (filled by another taker, vault drained, maker cancelled). Both safeguards coexist — slippage is not redundant with pre-flight, and pre-flight is not redundant with slippage. Researcher: when documenting the pre-flight rationale in code or in PR descriptions, make this distinction explicit so future contributors don't try to "simplify" by removing one or the other.

- **Outcome-based done, not metric-checking.** Per `.planning/PROJECT.md`: phase 2 is the bug-factory class. The done-signal is whackamole-stops at the boundary (no more side-inversion regressions, no more freshness-illusion surprises) plus ship-without-fear (the `transaction.ts` monolith no longer scares contributors). TRADE-04's mode×side regression tests are the *evidence* of "whackamole stops" — they should be written so a future regression of the `89571b3`-class fails loudly in CI.

- **Real users on real money.** Live trading users hold positions today. The trade page is the surface they touch every day. Lazy-loading the order forms (D-08) must not introduce a visible content shift (CLS regression) when the user clicks Limit/DCA tabs — researcher/planner accounts for this.

- **The "no liquidity" canary closes.** OBS-03 transcripts captured the failure shape in Phase 1. TRADE-03's pre-flight + auto-retry is the fix that *eliminates* the failure (silent retry against next-best) when liquidity has merely shifted; the inline terminal-state error fires only when there genuinely is none. The OBS-03 transcript continues to capture the genuine no-liquidity case (D-06).

- **The bug class TRADE-04 is preventing.** Commit `89571b3` fixed two coupled bugs: (1) hardcoded `EMERGENCY_RATIO_MULTIPLIER = '2'` for Sell vs `computeRatioMultiplier(slippageBps)` for Buy (asymmetric slippage handling); (2) partial-fill check anchored on `requestedTakerWantsAmount` for spend-anchored modes when it should have been `requestedTakerPaysAmount`. The TRADE-04 regression test surface must pin both classes — symmetric slippage math AND correct anchor-side selection across all four mode×side combinations.

</specifics>

<deferred>
## Deferred Ideas

Captured here so they aren't lost. None block Phase 2; some are explicitly handled by later phases.

- **TRADE-02 split granularity choice (4 vs 5–7 modules).** Captured as Claude's discretion above; planner decides. User-facing impact is zero — purely internal architecture choice.

- **Rollout / risk strategy detail (feature-flag mechanism).** Captured as Claude's discretion above; planner picks shape (parallel implementations during TRADE-02, observation-mode shadow for TRADE-03/04, env-var or wallet-allowlist gate). User signaled solo-team simplicity bias; no feature-flag SaaS expected.

- **Phase-internal sequencing & PERF-01 timing.** Captured as Claude's discretion. Planner decides whether PERF-01 lands in parallel with TRADE-* or last to avoid bundle-shape changes mid-refactor.

- **Pre-flight retry depth (one re-walk vs N levels deep).** Implementation detail under D-04. Planner picks based on cost/benefit.

- **Where the multicall lives (client vs new server endpoint).** Implementation detail under D-04. Client-side extension of `marketOrderExecution.ts` is the obvious slot; no need for a server endpoint based on current architecture.

- **`vaultBalance` repopulation in OBS-03 transcript.** Phase 1's `01-CONTEXT.md` D-08 deliberately left this null; TRADE-03's multicall populates it. Specifically: the pre-flight reads the output vault balance for the targeted order; that value flows into the existing OBS-03 transcript builder so post-Phase-2 failure logs are richer.

- **SSR for the trade page.** Explicitly deferred per D-08. If lazy-load + bundle prune doesn't credibly hit 2.5s, revisit in a future milestone — not Phase 2.

- **`+error.svelte` user-visible error page.** Still deferred per Phase 1 D-12 / `01-UI-SPEC.md` Q3.

- **External log drain.** Still deferred per Phase 1 — Vercel Logs only.

- **DRIFT-03 (CLAUDE.md rewrite to single-chain reality).** Phase 4. Phase 2 honors the existing drift-warning by treating `.planning/codebase/` as ground truth.

- **TRADE-02-adjacent admin rewrites.** `src/routes/admin/+page.svelte` (2898 lines) is bloated but explicitly out-of-scope for this milestone (`.planning/PROJECT.md` Out of Scope) — Phase 2 does not touch it even though `transaction.ts` is being restructured.

- **TEST-03 orchestration-path integration tests** for `marketOrderExecution.ts` + `transaction.ts` (aggregated → fallback → per-order, hydration failures, stale session). Phase 4 work; ROADMAP Phase 4 Notes explicitly distinguishes this from TRADE-04's mode×side regression tests so they don't duplicate.

- **REL-01 (RPC retry-with-backoff in `generator.ts`).** Phase 3. The pre-flight multicall introduced in TRADE-03 may benefit from REL-01 retry semantics later, but Phase 2 does not pull that work forward.

- **REL-02 (EIP-1271/6492 verification on the fallback chain).** Phase 3.

- **REL-03 (vendor the Rain strategies registry).** Phase 3.

- **SEC-01 (Alchemy key removal & rotation).** Phase 3. The TRADE-03 multicall uses the existing RPC chain; SEC-01 cleanup applies orthogonally.

- **DRIFT-01 / DRIFT-02 token-lookup cleanups.** Phase 4 — separate from TRADE-01's IO-perspective lockdown.

</deferred>

---

*Phase: 02-trade-execution-backbone-refactor*
*Context gathered: 2026-04-29*
