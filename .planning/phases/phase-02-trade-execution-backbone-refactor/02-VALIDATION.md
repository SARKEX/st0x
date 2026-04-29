---
phase: 02
slug: trade-execution-backbone-refactor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 02-RESEARCH.md §"Validation Architecture" (lines 1018–1072).
> Per-task verification map is populated by gsd-planner / post-planning audit once plan task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x + @testing-library/svelte (per `package.json`) |
| **Config file** | `vitest.config.ts` (existing) |
| **Setup file** | `vitest-setup.ts` (existing — mocks for `@sentry/sveltekit`, `svelte-wagmi`, `$app/stores`) |
| **Quick run command** | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts tests/lib/services/marketOrderExecution.test.ts` |
| **Full suite command** | `npm test -- --run` (447 tests / 1 skipped at Phase 1 close) |
| **Type-check command** | `npm run check` (3-error baseline acceptable; 4 transaction.ts errors will be cleared by TRADE-02 PR-5) |
| **Lint command** | `npm run lint` (svelte + ts) |
| **Estimated quick runtime** | ~30s |
| **Estimated full runtime** | ~90s |

---

## Sampling Rate

- **After every task commit:** `npm run check && npm test -- --run [scoped-files]` (~30s)
- **After every plan wave:** `npm run check && npm test -- --run && npm run lint` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + all phase-exit greps pass + Speed Insights p75 captured
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> **To be populated by planner / post-plan audit.** Each PLAN.md task ID gets a row; column `Automated Command` comes from each task's `<acceptance_criteria>` block. Stub format below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending — populated post-planning_ | | | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Phase-Wide Verification Anchors (from research §"Phase Requirements → Test Map")

| Req ID | Behavior | Test Type | Automated Command | Status |
|--------|----------|-----------|-------------------|--------|
| TRADE-01 | ESLint rule fires on a known violation fixture | unit (lint) | `npm run lint -- tests/fixtures/io-perspective-violation.ts` | ❌ W0 (fixture file) |
| TRADE-01 | ESLint rule does NOT fire on canonical helper itself | unit (lint) | `npm run lint -- src/lib/types/orderPerspective.ts` | ✅ |
| TRADE-01 | Codemod migration leaves zero raw-access hits in src/ | grep | `grep -rnE "\.(inputTokenAddress\|outputTokenAddress\|inputIOIndex\|outputIOIndex)\b" --include="*.ts" --include="*.svelte" src/ tests/ \| grep -vE "(orderPerspective\|utils/orderbook\|api/orders\|generated-graphql)" \| wc -l` MUST = 0 | ✅ command form |
| TRADE-01 | Helper accessor tests round-trip | unit | `npm test -- --run tests/lib/types/orderPerspective.test.ts` | ✅ extend |
| TRADE-02 | New module files exist | shell | `test -f src/lib/stores/{transactionShared,deployTransactionStore,marketTakeStore,approvalStore,partialFillDetection}.ts` | ❌ W0 (files) |
| TRADE-02 | Circular import absent | grep | `grep -E "from ['\"]\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` MUST return 0 | ✅ command form |
| TRADE-02 | UI bindings (TransactionStatus consumers) compile | type-check | `npm run check` MUST be ≤ 3 errors (rpcMetrics tests only) | ✅ existing |
| TRADE-02 | Existing 19 marketOrderFill tests still pass | unit | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts` | ✅ |
| TRADE-02 | Existing 1 marketOrderExecution test still passes | unit | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` | ✅ |
| TRADE-03 | Pre-flight integration test with mocked stale order | integration | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` (NEW cases mocking `RaindexClient.getOrderQuotesBatch` → `success: false`) | ✅ extend |
| TRADE-03 | Auto-retry exhausted → inline error rendering | component test | `npm test -- --run tests/lib/components/orders/MarketOrder.test.ts` | ❌ W0 (file) |
| TRADE-03 | OBS-03 transcript.vaultBalance populated post-multicall | unit | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` (transcript-shape assertion) | ✅ extend |
| TRADE-04 | Parameterized matrix across 4 mode×side combos | unit (parameterized) | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts` | ✅ extend |
| TRADE-04 | 89571b3 bug class 1 reproduction (slippage symmetry) | unit | `npm test -- --run tests/lib/services/marketOrderExecution.test.ts` (NEW: priceCap symmetry test) | ✅ extend |
| TRADE-04 | 89571b3 bug class 2 reproduction (anchor selection) | unit | `npm test -- --run tests/lib/utils/marketOrderFill.test.ts` (NEW: per-mode partial-fill anchor tests) | ✅ extend |
| PERF-01 | Build emits stats.html | shell | `npm run build && test -f .svelte-kit/output/client/stats.html` | ❌ W0 (visualizer install) |
| PERF-01 | Lazy-load tabs use dynamic import | grep | `grep -cE "await import\(['\"]\$lib/components/orders/(LimitOrder\|DcaOrder)" "src/routes/(main)/trade/[id]/+page.svelte"` MUST be ≥ 2 | ✅ command form |
| PERF-01 | jspdf removed from package.json | grep | `! grep -qE "\"jspdf\":" package.json` | ✅ command form |
| PERF-01 | p75 LCP delta — pre vs post | manual / Speed Insights | Pull p75 LCP from `https://vercel.com/st-0x/st0x/observability/speed-insights` over 7-day window, pre-deploy and post-deploy, both for `/trade/[id]`. PASS = post < 2.5s. | manual |
| PERF-01 | Bundle size delta — pre vs post | manual + visualizer | Compare initial-chunk size in `stats.html` before vs after lazy-load + prune | manual |
| PERF-01 | CLS regression check on tab switch | manual smoke | Open `/trade/[id]`, click Limit tab, click DCA tab — visual content shift must not exceed 20px. CLS in Speed Insights must remain < 0.1 | manual |

---

## Wave 0 Requirements

- [ ] `tests/fixtures/io-perspective-violation.ts` — minimal fixture with 4 raw property reads to prove the ESLint rule fires
- [ ] `tests/lib/components/orders/MarketOrder.test.ts` — new test file for D-05 inline error rendering
- [ ] `src/lib/stores/transactionShared.ts` — TRADE-02 leaf module (TransactionStatus enum + shared types)
- [ ] `src/lib/stores/deployTransactionStore.ts` — TRADE-02 split target
- [ ] `src/lib/stores/marketTakeStore.ts` — TRADE-02 split target (closes circular import)
- [ ] `src/lib/stores/approvalStore.ts` — TRADE-02 split target
- [ ] `src/lib/stores/partialFillDetection.ts` — TRADE-02 split target
- [ ] `scripts/codemod-trade-01.ts` — one-shot codemod harness (delete after merge)
- [ ] `eslint-plugin-local/` (or inline rule in `eslint.config.js`) — TRADE-01 ESLint custom rule
- [ ] `.gitignore` entry for `stats.html`
- [ ] `npm install --save-dev ts-morph rollup-plugin-visualizer`
- [ ] `vite.config.ts` — register `visualizer()` plugin gated on `process.env.ANALYZE === '1'`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| p75 LCP delta on `/trade/[id]` | PERF-01 | Vercel Speed Insights data lives in dashboard; CLI metrics requires Observability Plus | Pull p75 LCP from `https://vercel.com/st-0x/st0x/observability/speed-insights` (last 7 days) pre-deploy and post-deploy. Record numbers in 02-RUNBOOK.md and the PERF-01 plan summary. PASS = post < 2.5s. |
| CLS regression check on lazy-load tab switch | PERF-01 | Visual content shift requires real browser rendering | Open `/trade/[id]` in production, click Limit tab → DCA tab → Market tab. Visual content shift must not exceed 20px. Speed Insights CLS must remain < 0.1. |
| Bundle size delta | PERF-01 | Visualizer requires manual build + open of stats.html | Run `ANALYZE=1 npm run build`, open `.svelte-kit/output/client/stats.html`, record initial-chunk byte size pre and post. Record in plan summary. |
| Real-money smoke test post TRADE-02 PR-2 | TRADE-02 | State-machine split changes write order to vault state; needs a real take-order on Base 8453 with small amount before broader rollout | Execute one Buy and one Sell of $5 each on `/trade/[id]` via test wallet. Confirm: TransactionStatus transitions render in UI; Sentry captures no new error class; partial-fill detection fires correctly. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (12 W0 items above)
- [ ] No watch-mode flags in any verification command
- [ ] Feedback latency < 90s for full suite
- [ ] Phase-exit grep gates from RESEARCH §"Phase-Exit Grep Gates" all pass
- [ ] `failWith(` count ≥ 12 (Phase 1 baseline 9 + 3 new TRADE-03 paths: pre-flight RPC failure, vault-drained, order-vanished)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (post-planning audit)
