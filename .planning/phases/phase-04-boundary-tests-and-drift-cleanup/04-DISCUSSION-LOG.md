# Phase 4: Boundary Tests & Drift Cleanup — Discussion Log

**Discussed:** 2026-05-01
**Areas selected:** TEST-03 fixture strategy, TEST-01 / TEST-02 enforcement style, DRIFT-01 prevention + DRIFT-03 scope, Phase sequencing & coverage threshold

This log is for human reference only (audits, retrospectives). Downstream agents (researcher, planner, executor) read CONTEXT.md, not this file.

---

## Area 1 — TEST-03 fixture strategy

**Q1.1: TEST-03 fixture strategy — replay vs hand-built vs hybrid.**
Options presented: (a) replay OBS-03 transcripts, (b) hand-built mocks, (c) hybrid (hand-built happy path + replayed edges).
User reply: "I don't know what replay means. Can you explain."

**Clarification provided.** Explained: replay = capture real OBS-03 production transcripts as JSON fixtures, load and feed into code under test as if from the live subgraph/RPC. Benefit: catches partial-fill misclassifications because fixtures came from real failures. Cost: capture step + schema-sync discipline.

**Q1.1 (re-asked): Hybrid (hand-built happy + replay edges) vs Replay-everything vs Hand-built only vs Hand-built-now-defer-replay.**
User reply: "In general your approach, but bear in mind we could use anvil to literally run it on a forked blockchain."

**Insight expanded.** Anvil (`anvil --fork-url <BASE_RPC>`) is a local Base mainnet fork — highest fidelity for the on-chain half (multicall, vault state). Replay JSON is the right tool for the subgraph half (Goldsky indexer lag). Combined with hand-built for ratio glue, this is a layered strategy.

**Q1.2: Anvil scope and CI implications.**
Options: (a) Anvil + replay + hand-built layered (Recommended), (b) replay + hand-built only, (c) anvil-only, (d) defer anvil.
User reply: "Anvil fork (on-chain) + replay JSON (subgraph) + hand-built (logic) (Recommended)."

**Decision locked → D-01 + D-01a + D-01b + D-01c.**

---

## Area 2 — TEST-01 + TEST-02 enforcement style

**Q2.1: TEST-01 file shape.**
Options: (a) split per concern (Recommended), (b) one big file, (c) co-located.
User reply: "Split per concern (Recommended)."

**Decision locked → D-02 + D-02a.**

**Q2.2: TEST-02 enforcement style.**
Options: (a) runtime per-endpoint test (Recommended), (b) static AST/grep guard, (c) ESLint rule, (d) hybrid runtime+static.
User reply: "Runtime per-endpoint test (Recommended)."

**Decision locked → D-03 + D-03a + D-03b** (D-03b adds a phase-exit grep guard as secondary tripwire — runtime test stays the primary mechanism).

---

## Area 3 — DRIFT-01 prevention + DRIFT-03 scope

**Q3.1: DRIFT-01 recurrence prevention mechanism.**
Options: (a) TRADE-01 codemod + ESLint pattern (Recommended), (b) codemod migration only, (c) comment marker only.
User reply: "TRADE-01 codemod + ESLint pattern (Recommended)."

**Decision locked → D-04 + D-04a + D-04b.**

**Q3.2: DRIFT-03 CLAUDE.md edit scope.**
Options: (a) surgical edit + CONCERNS.md pointer (Recommended), (b) full rewrite from `.planning/codebase/`, (c) append-only correction note.
User reply: "Surgical edit + CONCERNS.md pointer (Recommended)."

**Decision locked → D-05 + D-05a + D-05b.**

---

## Area 4 — Phase sequencing + coverage threshold

**Q4.1: Wave order — DRIFT first vs TEST first vs interleaved.**
Options: (a) DRIFT first → TEST after (Recommended), (b) TEST first → DRIFT after, (c) interleaved.
User reply: "DRIFT first → TEST after (Recommended)."

**Decision locked → D-06 + D-06a.**

Rationale captured: DRIFT-01's codemod touches `oracleQuotes.ts` + `priceFeeds.ts` which TEST-03 fixtures will reference. DRIFT-first ordering means fixtures pin post-codemod shape, no double-migration.

**Q4.2: Coverage gate — per-REQ-ID vs numeric threshold vs both.**
Options: (a) per-REQ-ID assertion only (Recommended), (b) numeric line-coverage threshold on key files, (c) both.
User reply: "Per-REQ-ID assertion only (Recommended)."

**Decision locked → D-07 + D-07a.**

---

## Items deferred to Claude's discretion

Surfaced during discussion but not user-locked:
- TEST-04 scope and fixture style (researcher reads scraper.ts at planning time).
- TEST-03 fixture count (D-01 says 5–10; researcher picks exact number from OBS-03 log).
- Anvil-CI shape — inline `npm test` vs gated `npm run test:integration`.
- DRIFT-02 helper signature (`getPaymentTokensForNetwork`: return shape + file location).
- DRIFT-01 ESLint rule placement and allowlist mechanism.
- TEST-02 endpoint inventory (researcher walks `routes/api/admin/**/+server.ts` + cross-references Phase 1 DEPR-* SUMMARY).
- Phase-exit Wave 6 plan content (mirrors 03-11 phase-exit pattern).

---

## Scope-creep redirects

None during this discussion. The user kept proposals within the existing REQ-ID set.

---

## Deferred ideas captured

See `04-CONTEXT.md` `<deferred>` section for the full list. Notable items:
- Numeric coverage threshold in CI — rejected; revisit if a future phase needs a coarse regression signal.
- Full CLAUDE.md rewrite — rejected; surgical edit is the chosen path.
- Anvil-only / replay-only for TEST-03 — rejected; layered strategy is the chosen path.
- HUMAN-UAT carry-forward items (PERF-01 LCP, SEC-03+04 D-04b) — flagged for milestone-close handoff in 04-RUNBOOK.md.

---

*Discussion: 2026-05-01*
*Phase: 04-boundary-tests-and-drift-cleanup*
