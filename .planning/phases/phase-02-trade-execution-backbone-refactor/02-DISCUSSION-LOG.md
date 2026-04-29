# Phase 2: Trade-Execution Backbone Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 02-trade-execution-backbone-refactor
**Areas discussed:** TRADE-01 ban mechanism, TRADE-03 staleness UX, PERF-01 target & approach

---

## Gray Areas Selection

| Option | Description | Selected |
|--------|-------------|----------|
| TRADE-01 ban mechanism | How to structurally prevent direct IO access outside `orderPerspective.ts` | ✓ |
| TRADE-03 staleness UX | Pre-flight on-chain check + UI staleness signaling shape | ✓ |
| PERF-01 target & approach | p75 LCP number + scope (SSR, lazy-load, bundle prune) | ✓ |
| Rollout / risk strategy | Feature-flag mechanism for shipping refactor against live users | (not selected) |
| TRADE-02 split granularity | Strict 4-machine split vs more granular | (not initially selected; offered after main areas; declined) |

---

## TRADE-01 Ban Mechanism

### Q1: How do we structurally prevent direct inputTokenAddress / outputTokenAddress / inputIOIndex / outputIOIndex access outside src/lib/types/orderPerspective.ts?

| Option | Description | Selected |
|--------|-------------|----------|
| ESLint custom rule (Recommended) | Custom rule banning property names outside allowlist; editor surfaces violations as you type; CI fails on red. ~half-day rule auth + migrate 88 sites. | (Claude pick) ✓ |
| Branded TS types + ESLint | Wrap raw fields in branded types; reads outside helpers are type-errors. Strongest guarantee but invasive — every consumer migrates or unwraps. | |
| Comment marker + CI grep gate | `// allow-direct-io` marks intentional bypasses; CI grep counts unmarked occurrences. Lo-fi, no editor feedback while typing. | |
| You decide | Trust Claude/researcher to pick. | |

**User's response:** "What are we discussing here. I don't understand the question."

**Follow-up:** Claude explained the underlying bug class (maker INPUT/OUTPUT vs taker takerWants/takerPays naming collision; commit `89571b3` slippage-on-Sell regression as the canonical example) in plain text and re-presented the three real options with the concrete tradeoffs.

**User's response (second):** "Oh I have no idea. You choose."

**Locked decision:** ESLint custom rule (D-01). Rationale captured in CONTEXT.md: matches CONCERNS.md fix approach; gives editor-time feedback; enforces an existing canonical pattern (`orderPerspective.ts`). Migration as codemod-first then flip-the-rule (D-02), captured as Claude's discretion (D-02a).

**Notes:** User explicitly delegated; further sub-decisions on TRADE-01 (helper API surface, exact rule mechanics, test scope) skipped on the same basis.

---

## TRADE-03 Staleness UX

### Q1: When the pre-flight check finds the on-chain state diverges from the displayed quote, what should the user see?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-block + auto-refresh | Disable submit, auto-trigger refresh, re-enable on new quote. Strongest correctness; forced wait. | |
| Warn + let user decide (Recommended) | Show inline warning + 'Refresh quote' button; user explicitly chooses. | |
| Soft warn, allow submit anyway | Yellow note; rely on slippage cap; OBS-03 transcript captures any failures. | |
| You decide | Trust Claude. | |

**User's response:** "How is the pre-flight check done? My inclination is to let it submit. This is the reason for slippage controls surely?"

**Follow-up:** Claude explained the multicall mechanics (orderbook reads for existence, vault balance, current ratio — single batched RPC call) and clarified the slippage-vs-pre-flight scope distinction with a four-row coverage table:

- Slippage covers: price moved within an order (within OR past tolerance — both produce correct UX)
- Pre-flight covers: order filled/cancelled (slippage can't help — tx reverts with "no order"), vault drained (same)

The user's "no liquidity" reports map to the pre-flight rows, not the slippage rows. Original question reframed.

### Q1-rephrased: When pre-flight discovers your targeted order has vanished or been drained (slippage can't help), what should happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-retry silently against next-best (Recommended) | Pre-flight as silent safety net; auto-walk to next-best on-chain order; user sees nothing if substitute found. | ✓ |
| Warn + let user decide | Inline warning shows new best price; user explicitly chooses to proceed or refresh. | |
| Skip pre-flight, just submit + better failure UX | No multicall; better post-failure error message via OBS-03 transcript. Loosens ROADMAP success criterion. | |

**Locked decision (D-03/D-04):** Auto-retry silently. Pre-flight extends the existing aggregated→fallback→per-order cascade with fresh on-chain truth.

### Q2: When the auto-retry exhausts — every order on-chain is gone or below your size — what does the user see?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline error on the order form (Recommended) | Replace spinner/Buy area with clear error; user keeps inputs and can adjust. | ✓ |
| Toast + reset form | Toast pop + form resets to idle; loses user's input. | |
| Match Phase 1 OBS-03 transcript fields | Whatever copy, ensure failWith() still fires. | |

**Locked decision (D-05/D-06):** Inline error on form, with OBS-03 `failWith()` constraint preserved as a baseline contract regardless of UI copy.

### Q3: More TRADE-03 questions, or move on?

| Option | Description | Selected |
|--------|-------------|----------|
| Move to PERF-01 (Recommended) | TRADE-03 well-scoped; remaining decisions are planner-implementation. | ✓ |
| More TRADE-03 questions | Drill into pre-flight cost, location, debug surface. | |

---

## PERF-01 Target & Approach

### Q1: What's the right framing for the p75 LCP target on /trade/[id]?

| Option | Description | Selected |
|--------|-------------|----------|
| Hit Web Vitals 'good' (under 2.5s) (Recommended) | Fixed industry-standard threshold; clear pass/fail. | ✓ |
| X% relative improvement vs baseline | Anchored to today's baseline; lacks semantic floor. | |
| Defer the number to plan-phase | Researcher proposes target after pulling Speed Insights baseline. | |

**Locked decision (D-07):** p75 LCP < 2.5s, validated against the Vercel Speed Insights dashboard.

### Q2: How aggressive can PERF-01 be on the trade page architecture?

| Option | Description | Selected |
|--------|-------------|----------|
| No SSR — lazy-load + bundle prune only (Recommended) | Keep client-rendered; lazy-load order forms + chart libs; prune bundle; reduce query waterfall. Lower risk during the trade-execution refactor. | ✓ |
| Add SSR + the rest | Introduce +page.server.ts; biggest LCP win but touches auth/network/wallet flow during refactor. | |
| Researcher profiles, planner picks | Decision made on Lighthouse + Speed Insights data during plan-phase. | |

**Locked decision (D-08):** Lazy-load + bundle prune + query-waterfall reduction; no SSR. SSR explicitly deferred to a future milestone.

---

## Final Check

### Q: Anything else to surface before writing CONTEXT.md?

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context (Recommended) | Write CONTEXT.md; TRADE-02 split + rollout strategy as Claude's discretion. | ✓ |
| Explore TRADE-02 split granularity | Decide upfront on 4 vs more granular modules. | |
| Explore rollout / risk strategy | Lock feature-flag shape for refactor rollout. | |

---

## Claude's Discretion

Per the locked CONTEXT.md decisions, the following are explicitly delegated to researcher/planner:

- TRADE-01 helper API surface, exact ESLint rule mechanics, codemod harness choice, test placement
- TRADE-02 split granularity (4 strict machines vs 5–7 modules), naming, file placement, UI-binding migration sequence
- TRADE-03 pre-flight retry depth, exact multicall ABI shape, where the call lives in the code, vaultBalance repopulation into OBS-03 transcript
- PERF-01 specific lazy-load mechanism, bundle-analyzer tool, query-waterfall reorganization details
- Rollout / risk strategy mechanism (env-var gate, wallet-allowlist, parallel-implementation shape)
- Phase-internal sequencing and PERF-01 timing relative to TRADE-* work

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section — not duplicated here.
