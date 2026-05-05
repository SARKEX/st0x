# Phase 4: Boundary Tests & Drift Cleanup - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock in regression coverage at the audit's high-risk untested boundaries (hooks.server.ts auth/CORS/CSP layering, admin audit-log fan-out, full marketOrderExecution.ts orchestration path, retained snapshot scraper edges) and eliminate the documentation/code drift that misleads future contributors and produces low-grade silent breakage.

Seven REQ-IDs in scope:

1. **TEST-01 — hooks.server.ts integration tests.** Public-path / admin / wallet-registration classification, CORS, CSP, and bot-rejection ordering across representative request shapes. The post-Phase-3 wallet-session-cookie surface (SEC-03+04) is the shape under test, not the legacy `wallet-address` cookie.

2. **TEST-02 — admin audit-log fan-out coverage.** Every state-mutating admin endpoint (rewards-pool, snapshots, swap-snapshot, tvl, wallet-statement, wallets, team-wallets, excluded-wallets, pool-wallets, nansen, plus survivors of DEPR-02) calls `createAuditLogger`; tests assert audit records are emitted on success AND failure paths.

3. **TEST-03 — marketOrderExecution.ts integration suite.** Full market-order path through `marketOrderExecution.ts` + `transaction.ts`: aggregated → fallback → per-order, hydration failures, stale-session recovery. Distinct from TRADE-04's mode×side regression suite (Phase 2) — this is orchestration-path coverage.

4. **TEST-04 — snapshot scraper edge cases.** DEPR-02 retained the snapshot pipeline per Phase 1 D-01, so this is in scope: pagination boundaries, legacy `wrappedTokenTransfers` fallback, transient subgraph failure.

5. **DRIFT-01 — token-lookup canonicalization.** Direct `TOKENS.find(...)` lookups in 8 files (`tradeTransform.ts`, `api/orders.ts`, `api/subgraph.ts`, `oracleQuotes.ts`, `priceFeeds.ts`, `QuickTrade.svelte`, `LimitOrder.svelte`, `DcaOrder.svelte`) replaced with `getTokenByAnyAddress(addr)`; recurrence prevented by ESLint rule.

6. **DRIFT-02 — payment-token canonicalization.** Hardcoded USDC address constants in `admin/+page.svelte` and `api/admin/nansen/+server.ts` replaced with `isPaymentToken(addr, network)` / a new `getPaymentTokensForNetwork(network)` helper resolved from `src/lib/config/tokens.ts`.

7. **DRIFT-03 — CLAUDE.md ground-truth alignment.** Strike the false claims (multi-chain table, Account Abstraction section, `account-abstraction/` in Project Structure, Rhinestone in Tech Stack); add a Ground Truth header pointing at `.planning/codebase/` and `CONCERNS.md`; preserve accurate sections (Order Semantics INPUT/OUTPUT, Rainlang).

This phase **does not** add any new behavioral code — every change is either a test, a codemod (DRIFT-01 mechanical migration), or a documentation correction. No SEC / REL / TRADE / PERF requirements remain. All Phase 2 + Phase 3 cross-cutting gates must hold green at Phase 4 close.

</domain>

<decisions>
## Implementation Decisions

### Phase-Internal Sequencing (the discussed area)

- **D-06: Wave shape — DRIFT first, then TEST.** Five waves, ordered to land documentation + drift cleanup before the heavier test work, so TEST fixtures pin the post-codemod shape rather than the pre-codemod one:

  | Wave | REQ | Surface | Rationale |
  |---|---|---|---|
  | 1 | DRIFT-03 | `CLAUDE.md` surgical edit + `.planning/codebase/CONCERNS.md` pointer | Single-commit doc-only change. No code risk. Frees the planner from drift-warning notes in subsequent plans. |
  | 2 | DRIFT-02 | `admin/+page.svelte` + `api/admin/nansen/+server.ts` USDC hardcoding → `isPaymentToken` / `getPaymentTokensForNetwork` | Touches admin surfaces only. Independent of DRIFT-01. New helper `getPaymentTokensForNetwork(network)` lives in `src/lib/config/tokens.ts`. |
  | 3 | DRIFT-01 | ts-morph codemod migrating 8 files to `getTokenByAnyAddress` + ESLint `no-restricted-syntax` rule banning `TOKENS.find` outside the canonical lookup module | Mechanical migration. Touches `oracleQuotes.ts` + `priceFeeds.ts` which TEST-03 fixtures will reference — DRIFT-01 lands BEFORE TEST so the fixtures pin the post-codemod shape. |
  | 4 | TEST-01 + TEST-02 | hooks.server.ts split-per-concern test files + admin audit-log runtime fan-out tests | Hooks tests pin Phase 3 SEC-03+04 surface. Audit-log tests pin Phase 1 + Phase 3 audit-log invariants. Files disjoint from DRIFT waves. |
  | 5 | TEST-03 + TEST-04 | marketOrderExecution.ts orchestration suite (anvil fork + replay JSON + hand-built) + scraper edge tests | Heaviest. Anvil fork wires Foundry into CI; replay JSON fixtures captured from production OBS-03 logs. TEST-04 covers retained snapshot pipeline edges. |
  | 6 | Phase-exit | Phase-exit grep gates + 04-RUNBOOK.md | Mirrors 01-08 / 02-08 / 03-11 phase-exit pattern. Re-verifies Phase 2 + Phase 3 cross-cutting gates green. |

  Wave 1–3 ship as small atomic PRs (drift cleanup is low-risk). Wave 4 may split into 04-TEST-01 + 04-TEST-02 plans for parallel review tractability. Wave 5 is the heaviest plan and may split further (anvil-fork scaffolding as a separate plan ahead of the orchestration tests).

- **D-06a: Atomic-commits-with-svelte-check-green discipline carries forward unchanged from Phase 2 + Phase 3.** Every commit leaves svelte-check at the established baseline (3 errors after Phase 2 close), every commit passes the test suite, no mid-flight broken states. The `EMERGENCY_RATIO_MULTIPLIER` count = 0, `failWith()` count ≥ 12 in `marketOrderExecution.ts`, TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance (no `marketOrderExecution.ts` import from `$lib/stores/transaction`), staleTime: Infinity preserved. The Phase 4 phase-exit wave re-verifies these mechanically.

### TEST-03 — Fixture Strategy (the discussed area)

- **D-01: Layered fixture strategy — anvil fork (on-chain) + replay JSON (subgraph) + hand-built (logic).** Three techniques combine according to which half of the orchestration each scenario stresses:

  - **Anvil fork for the on-chain half.** `anvil --fork-url <BASE_RPC_URL> --fork-block-number <N>` spins up a local Base mainnet fork at a pinned block where the relevant orders existed. Tests drive `viem` against `http://127.0.0.1:8545` and call the real Orderbook + Multicall contracts. Used for: pre-flight multicall (TRADE-03 surface), take-order submission, partial-fill detection against actual on-chain vault state. Catches "we misread vault balance" bugs that hand-built RPC mocks would miss.

  - **Replay JSON for the subgraph half.** Capture 5–10 representative transcripts from OBS-03 production logs (the `failWith()` transcripts already include `subgraph_quote`, `on_chain_state`, `ratio`, `slippage_cap`, `side`, `taker_action`). Save under `tests/fixtures/marketOrder/<scenario>.json`. Used for: stale-quote scenarios, hydration failures, "no liquidity" classifications, partial-fill misclassifications — exactly the bug classes the audit flagged. Anvil cannot simulate Goldsky indexer lag; replay is the right tool here.

  - **Hand-built mocks for pure-logic glue.** Ratio multipliers, slippage-cap derivation, order prioritization. Most of this is already covered by TRADE-04's mode×side suite (Phase 2 02-07); TEST-03 reuses where possible and adds glue tests only where TRADE-04 doesn't already pin the shape.

- **D-01a: CI implications.** Adding anvil to CI requires:
  1. Foundry installation step in the GitHub Actions workflow (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).
  2. A `BASE_RPC_URL` secret (Phase 3 SEC-01 already provisioned this; CI gets read access to the same value used by production server-side code).
  3. Test-time anvil startup helper (`tests/helpers/anvil.ts`) that spawns anvil before the test suite, exposes `http://127.0.0.1:8545`, and tears down on suite exit.
  4. Test runtime budget — anvil-driven tests are ~seconds vs ~ms for mocked tests; the planner picks whether to gate them behind `npm run test:integration` (separate from `npm test`) or run them inline.

- **D-01b: OBS-03 transcript-capture format pre-existing.** OBS-03 already produces JSON-shaped transcripts (Plan 01-07 + 02-06 added 12+ `failWith()` call sites). Capture is a one-time operator step: pull recent failures from Vercel Logs, redact wallet addresses, save as fixtures. The planner specifies the fixture schema (matches the in-source `TakeOrderFailureTranscript` type) and the redaction recipe.

- **D-01c: Fixture refresh policy.** Captured transcripts pin a specific OBS-03 transcript schema. If a future phase adds a new transcript field (e.g., a new diagnostic property), existing fixtures stay valid as long as the field is optional in the consuming code. Schema-incompatible changes require a fixture refresh as part of that phase — documented in 04-RUNBOOK.md.

### TEST-01 — File Layout (the discussed area)

- **D-02: Split per concern.** `tests/hooks/` directory with one file per concern:
  - `tests/hooks/cors.test.ts` — Origin classification (production domains, Vercel previews, public endpoints, denied origins), preflight handling, header allowlist.
  - `tests/hooks/csp.test.ts` — `connect-src` host pinning (Sentry ingest hosts, no bare `*.sentry.io` wildcards — Phase 1 cross-cutting Pitfall 1), Speed Insights, no `unsafe-eval`, frame-src absence (post-DEPR-03 Onramper removal).
  - `tests/hooks/public-paths.test.ts` — Path classification (`/api/public/*`, `/api/access/*`, etc.) honored before auth checks.
  - `tests/hooks/admin-gate.test.ts` — `requireAdmin` enforcement on admin routes; SEC-06 cron-route exemption shape (CRON_SECRET-only, no admin gate).
  - `tests/hooks/wallet-session.test.ts` — Phase 3 SEC-03+04 session cookie classification: HttpOnly/Secure/SameSite=Strict cookie present → `event.locals.walletAddress` set; missing/expired session-id KV record → request unauthenticated; legacy `wallet-address` cookie present without session cookie → NOT treated as authoritative (D-04 atomic-flip invariant).
  - `tests/hooks/bot-rejection.test.ts` — Bot-detection heuristic ordering relative to OPTIONS / public path / auth checks. Asserts the documented ordering at `hooks.server.ts:152-469` is preserved.

  Rationale: each file < 300 lines, easier to extend when a new concern lands, failure messages point at the concern. Aligns with the "co-located + tests/ mirroring src/lib" convention but adds a `tests/hooks/` subdirectory because hooks.server.ts is the only top-level file (not under src/lib/).

- **D-02a: Shared test scaffolding.** A `tests/hooks/_helpers.ts` (underscore prefix to avoid Vitest auto-discovery) provides: `createMockRequestEvent({ method, url, headers, cookies })` helper, `createMockKv()` for session-id lookups, `createMockSession({ walletAddress })` factory. Reuses Phase 1 + Phase 3 fixture style.

### TEST-02 — Audit-Log Enforcement (the discussed area)

- **D-03: Runtime per-endpoint test.** For each admin endpoint with state-mutating verbs (POST/PUT/PATCH/DELETE), a Vitest test:
  1. Imports the handler.
  2. Mocks `createAuditLogger` via `vi.mock('$lib/server/auditLog', ...)`.
  3. Invokes the handler with a representative success-path RequestEvent.
  4. Asserts `createAuditLogger` was called with the expected verb / actor / target / outcome shape.
  5. Invokes the handler again with a failure-path setup (e.g., DB write fails, validation fails, missing required field).
  6. Asserts `createAuditLogger` was called on the failure path with `outcome: 'failure'` (or equivalent).

  Catches behavioral regressions where a developer accidentally moves `createAuditLogger` behind a `try/catch` such that failures stop being logged — exactly the regression a static AST guard would miss.

- **D-03a: Endpoint inventory at planning time.** The researcher enumerates the admin endpoints requiring coverage by walking `src/routes/api/admin/**/+server.ts` and noting which export `POST` / `PUT` / `PATCH` / `DELETE` handlers. Read-only `GET` handlers are NOT in scope (no state mutation = no audit-log requirement). The list anchored in the REQ-ID (rewards-pool, snapshots, swap-snapshot, tvl, wallet-statement, wallets, team-wallets, excluded-wallets, pool-wallets, nansen, plus survivors of DEPR-02) is the starting set; researcher confirms against the tree.

- **D-03b: Phase-exit grep guard.** In addition to the runtime tests, the phase-exit wave grep-checks that every state-mutating admin handler imports from `$lib/server/auditLog`. Belt-and-braces: if a developer ships a new admin endpoint without the import, the grep catches it even before the runtime test author writes the matching test. Cheap secondary tripwire.

### DRIFT-01 — Token-Lookup Migration (the discussed area)

- **D-04: TRADE-01 codemod + ESLint pattern.** Same proven pattern from Phase 2 02-01 (TRADE-01):
  1. ts-morph codemod migrates the 8 sites from `TOKENS.find(t => t.address === ...)` to `getTokenByAnyAddress(...)`. Codemod is idempotent and committed under `scripts/codemods/migrate-token-find.ts`.
  2. ESLint `no-restricted-syntax` rule bans `TOKENS.find` (and equivalent `TOKENS.filter` / direct iteration) outside an allowlist of canonical lookup modules (`src/lib/config/tokens.ts` and any `*.test.ts` files using fixtures).
  3. Lint fixture asserts the rule fires on a violation file (`tests/fixtures/eslint/token-lookup-violation.ts`).

- **D-04a: Allowlist scope.** The canonical lookup module is `src/lib/config/tokens.ts` — the file that defines `TOKENS` AND exports `getTokenByAnyAddress`. The ESLint rule allows `TOKENS.find` only there. Test files using TOKENS-find as a fixture get an explicit allowlist (mirroring TRADE-01's `orderPerspective.ts` exemption pattern from Plan 02-01).

- **D-04b: Codemod-then-lint, not lint-then-fix.** The codemod ships first as a one-shot migration; the ESLint rule lands in the same PR but is the recurrence guard, not the migration tool. This matches TRADE-01's ordering and avoids the "lint catches violations but auto-fix breaks behavior" failure mode.

### DRIFT-03 — CLAUDE.md Edit Scope (the discussed area)

- **D-05: Surgical edit + Ground Truth pointer.** Strike the four false claims, add a header, preserve accurate content:

  - **Strike (multi-chain table at "Multi-Chain Support"):** the table claiming Arbitrum/Optimism/Ethereum support. Replace with: "Single chain: Base 8453. Multi-chain expansion deferred to a future milestone (see `.planning/codebase/CONCERNS.md` and Out of Scope in `.planning/REQUIREMENTS.md`)."
  - **Strike (Account Abstraction section):** the "Account Abstraction" section claiming Rhinestone SDK / EIP-7702 / USDC gas sponsorship. Replace with: "No account abstraction — the `account-abstraction/` directory and Rhinestone integration referenced in earlier drafts of this file do not exist in code."
  - **Strike (Project Structure entry `account-abstraction/`):** remove the line `│   │   ├── account-abstraction/  # Rhinestone SDK integration`.
  - **Strike (Tech Stack Rhinestone mention):** remove "Rhinestone SDK (account abstraction)" from the Tech Stack list.

  - **Add a Ground Truth header at the top of CLAUDE.md (immediately after the title):**
    ```
    ## Ground Truth

    This file is a high-level orientation. The authoritative codebase audit lives in
    `.planning/codebase/` (ARCHITECTURE.md, STACK.md, CONVENTIONS.md, INTEGRATIONS.md,
    STRUCTURE.md, TESTING.md) and the audit-of-record is `.planning/codebase/CONCERNS.md`.
    When this file conflicts with `.planning/codebase/`, the latter is correct.
    ```

  - **Preserve unchanged:** the `## Order Semantics — INPUT/OUTPUT Perspective (Critical)` section (it is the prose statement of TRADE-01 / `src/lib/types/orderPerspective.ts` and is accurate), the Rainlang section, the Dev Commands section, the Project Overview, Tech Stack (minus Rhinestone), and Project Structure (minus account-abstraction/).

- **D-05a: No backfill of accurate content from `.planning/codebase/`.** Surgical edit deliberately does NOT pull additional content from `STACK.md` / `ARCHITECTURE.md` into CLAUDE.md. Risk of full-rewrite is over-stuffing CLAUDE.md and introducing new drift; the Ground Truth pointer makes redundancy unnecessary.

- **D-05b: Drift-guard recurrence prevention.** Phase-exit grep guard: `grep -E "Rhinestone|EIP-7702|account-abstraction" CLAUDE.md` returns 0 hits. Future contributors who re-introduce these strings via PR get caught at the phase-exit-style verification (or at PR review if a reviewer runs the grep recipe in the RUNBOOK). Lighter than the TRADE-01-style ESLint rule because the surface is one file and the violations are textual.

### Coverage Gate (the discussed area)

- **D-07: Per-REQ-ID assertion only — no numeric coverage threshold.** Each TEST-01..04 REQ-ID has specific scenario-based acceptance criteria verified by the phase-exit grep gate (e.g., "TEST-01 success criteria: tests/hooks/wallet-session.test.ts exists and asserts session-id KV record drives `event.locals.walletAddress`"). No `npx vitest --coverage` threshold added to CI.

  Rationale: matches the scenario-based gates Phase 1–3 used. Avoids the "gaming the metric" failure mode where developers write trivial assertions to hit a 80% line-coverage number; quality of assertions is the actual goal, not their count. Phase-exit verification grep-checks that the specific scenarios listed in each REQ-ID have a corresponding test file and a corresponding `describe` / `it` block.

- **D-07a: Coverage instrumentation as a developer tool, not a CI gate.** Developers can run `npx vitest --coverage` ad-hoc to see which lines aren't exercised; the output informs which scenarios deserve a test. The output is NOT a CI check. This preserves the "every REQ-ID has explicit acceptance criteria, met by named tests" pattern that Phase 2's TRADE-04 mode×side matrix already established.

### Claude's Discretion

These were not user-locked and are open for the researcher/planner to decide:

- **TEST-04 scope and fixture style.** The REQ-ID lists three categories (pagination boundaries, legacy `wrappedTokenTransfers` fallback, transient subgraph failure). Researcher reads `src/lib/server/snapshots/scraper.ts` to enumerate the actual code paths under each category, then picks the fixture style — likely hand-built mocks of the Goldsky GraphQL responses since (a) anvil doesn't help with subgraph data, (b) replay-from-prod is overkill for scraper edges that haven't actually fired in prod logs. Researcher decides whether to use `vitest-mock-extended` for typed deep mocks of the subgraph client.

- **TEST-03 fixture count and capture procedure.** D-01 says 5–10 transcripts; researcher picks the exact number based on which OBS-03 failure modes are in the log. Capture procedure documented in 04-RUNBOOK.md: which Vercel Logs query, redaction recipe (wallet addresses → `0x...redacted`), where to land the JSON files (`tests/fixtures/marketOrder/`).

- **Anvil-CI shape.** Whether anvil-driven tests run inline as part of `npm test` or behind a separate `npm run test:integration` script. Trade-off: inline keeps "one command" simplicity but adds Foundry as a hard CI dependency; gated keeps the developer experience fast for non-orchestration changes. Researcher picks; the existing `npm test` contract is the constraint to honor.

- **DRIFT-02 helper signature.** `getPaymentTokensForNetwork(network: Network)`: returns `Token[]` (all payment-class tokens) or `Map<Address, Token>` (lookup-friendly)? Where does it live — `src/lib/config/tokens.ts` (with the existing `TOKENS` array) or `src/lib/utils/payment.ts` (alongside `isPaymentToken` if that's where it lives)? Researcher reads existing `isPaymentToken` to confirm the pattern, then picks.

- **DRIFT-01 ESLint rule placement.** Custom rule lives in `eslint.config.js` (or `.eslintrc.cjs` — whichever the repo uses) using `no-restricted-syntax`. Allowlist mechanism: AST node + filename pattern OR comment marker (`// eslint-disable-next-line drift-01-token-lookup`). TRADE-01's `orderPerspective.ts` allowlist used the filename pattern; researcher matches that unless there's a reason to diverge.

- **TEST-02 endpoint inventory.** Researcher walks `src/routes/api/admin/**/+server.ts` at planning time and produces the explicit list. Some admin endpoints listed in the REQ-ID may have been deleted by Phase 1 DEPR-* (e.g., rewards-pool may no longer exist); researcher cross-references against the Phase 1 SUMMARY to filter.

- **Phase-exit Wave 6 plan content.** Researcher/planner adds a Wave 6 / 04-08 (or whatever count the planner picks) phase-exit plan analogous to 03-11: phase-exit verification grep gates (DRIFT-03 evidence, DRIFT-01 allowlist evidence, TEST-01..04 file-existence evidence, audit-log import grep across admin endpoints, Phase 2 + Phase 3 cross-cutting gates re-verified) plus 04-RUNBOOK.md documenting (a) anvil + Foundry CI setup steps for future contributors, (b) OBS-03 transcript-capture procedure for refreshing TEST-03 fixtures, (c) milestone-close handoff (REQUIREMENTS.md ticks for TEST-* + DRIFT-* and milestone exit).

- **Cross-phase HUMAN-UAT items carry-forward.** PERF-01 numeric p75 LCP < 2.5s validation (Phase 2 deferred to post-deploy HUMAN-UAT), SEC-03+04 D-04b runtime UX assertion (Phase 3 deferred to post-deploy HUMAN-UAT). Phase 4 does not directly run these; the milestone-close handoff in 04-RUNBOOK.md flags them so the operator runs `/gsd-verify-work` against them as part of milestone closure.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Planning

- `.planning/ROADMAP.md` §"Phase 4: Boundary Tests & Drift Cleanup" — phase goal, 5 success criteria, `Depends on: Phase 3`, `Requirements: TEST-01..04, DRIFT-01..03`. Notes: TEST-04 is conditional on Phase 1 DEPR-02 outcome (retained, so in scope). TEST-03 distinct from TRADE-04 (orchestration path vs mode×side). DRIFT-01..03 are low-risk and suitable for small PRs.
- `.planning/REQUIREMENTS.md` §"Test Coverage" + §"Drift" — full text of the 7 phase REQ-IDs (TEST-01..04, DRIFT-01..03). Researcher and planner must address every REQ-ID; checker enforces coverage. Traceability table confirms TEST-04 is in scope (DEPR-02 closed by retention, not deletion).
- `.planning/PROJECT.md` — milestone constraints. Especially: real-money users, single chain Base 8453, solo / 1-2 dev team, outcome-based done (zero user-reported correctness bugs over a sustained window + internal "confidence to ship without fear"). Phase 4 closes the milestone.
- `.planning/STATE.md` — current position. Phase 3 closed 2026-04-30 (10/10 SEC + REL REQ-IDs).

### Phase 1–3 Artifacts (carry-forward)

- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-CONTEXT.md` — Phase 1 decisions. Especially:
  - **D-01:** Snapshot pipeline retained — TEST-04 IS in scope.
  - **D-13:** Out-of-scope guardrails carry forward unchanged — no AA, no multi-chain, no `+error.svelte`, no admin/+page.svelte refactor, no replacement on-ramp, no external log drain.
  - **D-15:** OBS-03 dual-sink (Sentry + console.error JSON line on browser tier). The transcript shape produced here is the source for TEST-03 replay JSON fixtures.
- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-SUMMARY.md` (per-plan summaries) — Phase 1 deletions; researcher cross-references to filter the TEST-02 admin endpoint inventory (e.g., DEPR-01/02/03 may have removed endpoints listed in the REQ-ID).
- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-CONTEXT.md` — Phase 2 decisions. Cross-cutting gates that must survive Phase 4 unchanged: TRADE-01 IO-perspective lockdown (ESLint allowlist precedent for DRIFT-01), TRADE-02 cycle severance, `failWith()` count ≥ 12, `EMERGENCY_RATIO_MULTIPLIER` count = 0, staleTime: Infinity preserved.
- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-01-PLAN.md` (or its SUMMARY) — TRADE-01's codemod + ESLint pattern. **The proven precedent for DRIFT-01.** Researcher reads the plan to mirror codemod shape, allowlist syntax, and fixture-test wiring.
- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-07-PLAN.md` — TRADE-04 mode×side regression matrix (16-case parameterized test). TEST-03 reuses fixtures and patterns where the orchestration path overlaps; otherwise the suite is distinct.
- `.planning/phases/phase-02-trade-execution-backbone-refactor/02-RUNBOOK.md` — Phase 2 RUNBOOK.
- `.planning/phases/phase-03-production-grade-hardening/03-CONTEXT.md` — Phase 3 decisions. Especially:
  - **D-04:** SEC-03+04 atomic-flip session cookie shape — TEST-01 covers the post-flip surface (session-id cookie + KV record), NOT the legacy `wallet-address` cookie which is downgraded to non-authoritative hint.
  - **D-04a:** 30-day sliding session lifetime — TEST-01 wallet-session test covers expiry handling.
  - **D-04b:** Per-request wallet-signature regression rejected — TEST-01 wallet-session test asserts the per-request path NEVER calls `verifyWalletSignature` (D-04b code-level guarantee).
- `.planning/phases/phase-03-production-grade-hardening/03-RUNBOOK.md` — Phase 3 operational runbook. The session-cookie smoke recipe is the precedent for the TEST-01 wallet-session integration test scaffolding.

### Codebase Audit (the source-of-truth for what Phase 4 covers)

- `.planning/codebase/CONCERNS.md` — full audit. Direct mappings to Phase 4 REQ-IDs:
  - "hooks.server.ts auth/CORS/CSP layering is untested" → TEST-01.
  - "Admin endpoints lack audit-log coverage assertions" → TEST-02.
  - "marketOrderExecution.ts orchestration path is untested at the boundaries" → TEST-03.
  - "snapshot scraper has no edge-case tests" → TEST-04 (conditional, in scope per Phase 1 D-01).
  - Tech Debt §"Token lookups scatter direct TOKENS.find" → DRIFT-01.
  - Tech Debt §"USDC address hardcoded in admin paths" → DRIFT-02.
  - Documentation Drift §"CLAUDE.md describes multi-chain + AA that don't exist" → DRIFT-03.
- `.planning/codebase/ARCHITECTURE.md` — system architecture; confirms hooks layering and auth flow.
- `.planning/codebase/STACK.md` — tech stack; confirms Vitest 1.6.0 + jsdom + @testing-library/svelte; pin TEST-* tooling to existing test framework.
- `.planning/codebase/CONVENTIONS.md` — coding conventions. Honor when adding new test files and the new `getPaymentTokensForNetwork` helper.
- `.planning/codebase/STRUCTURE.md` — directory layout. `tests/` mirrors `src/lib/`; `src/lib/server/*.test.ts` co-located. `tests/hooks/` is a new subdirectory for TEST-01.
- `.planning/codebase/INTEGRATIONS.md` — observability integration points. OBS-03 transcript shape source for TEST-03 replay.
- `.planning/codebase/TESTING.md` — testing conventions. Vitest 1.6.0, jsdom, @testing-library/svelte, vitest-mock-extended, anvil NOT yet in CI (Phase 4 introduces it via TEST-03).

### Project Guidance

- `CLAUDE.md` — project instructions for AI agents. **Phase 4 DRIFT-03 directly modifies this file.** Treat it as a target of work, not a source of truth, until DRIFT-03 lands. After DRIFT-03 lands, the surgical edit + Ground Truth pointer make CLAUDE.md safe to read but `.planning/codebase/` remains authoritative for any disagreement.

### Anvil + Foundry Reference

- Foundry book — https://book.getfoundry.sh/anvil/ — anvil CLI reference. Researcher reads the `--fork-url` + `--fork-block-number` flags + the JSON-RPC compat surface for `viem`'s `http` transport.
- Existing `BASE_RPC_URL` env var — Phase 3 SEC-01 provisioned this in Vercel; Phase 4 CI wiring reuses the same secret with read access.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`src/lib/types/orderPerspective.ts`** — TRADE-01 canonical lookup module. The pattern (canonical helpers + ESLint `no-restricted-syntax` allowlist + lint fixture) is the proven precedent DRIFT-01 mirrors. Existing `tests/fixtures/eslint/io-perspective-violation.ts` (Plan 02-01) is the fixture-test pattern for the new DRIFT-01 fixture.

- **`src/lib/config/tokens.ts`** — defines `TOKENS` array, `getTokenByAnyAddress(addr)`, and (per Phase 1 memory) `getSnapshotSymbolForAddress`. The canonical lookup module for DRIFT-01 ESLint allowlist. DRIFT-02's new `getPaymentTokensForNetwork(network)` helper lives here (or in a sibling file alongside `isPaymentToken` — researcher confirms).

- **`src/lib/services/marketOrderExecution.ts`** — TEST-03's primary subject. Phase 1 OBS-03 + Phase 2 TRADE-03 raised `failWith()` count to ≥ 12 — the failure-path transcript shape that TEST-03 replays from. TEST-03 covers aggregated → fallback → per-order, hydration failures, stale-session recovery (per ROADMAP success criteria #2).

- **`src/lib/stores/transaction.ts`** + post-Phase-2 split (`transactionShared.ts`, `marketTakeStore.ts`, `deployTransactionStore.ts`, `approvalStore.ts`, `partialFillDetection.ts`) — TEST-03 covers the orchestration through these. Distinct from existing `tests/lib/stores/transactionShared.test.ts`, `tests/lib/stores/approvalStore.test.ts`, `tests/lib/stores/partialFillDetection.test.ts` which are unit tests; TEST-03 drives the integration path.

- **`src/lib/server/auditLog.ts`** — `createAuditLogger`. TEST-02 mocks this via `vi.mock('$lib/server/auditLog', ...)` per-test and asserts invocation on success + failure paths.

- **`src/hooks.server.ts`** — TEST-01's primary subject. Auth flow at lines 152-469. Post-Phase-3 surface: SEC-03+04 wallet-session cookie + KV lookup + CSRF binding. TEST-01 covers the post-flip shape, not the legacy `wallet-address` cookie.

- **`src/lib/server/snapshots/scraper.ts`** — TEST-04's primary subject. DEPR-02 retained the snapshot pipeline per Phase 1 D-01. Three categories under test: pagination boundaries, legacy `wrappedTokenTransfers` fallback, transient subgraph failure.

- **`src/lib/server/walletSession.ts`** (Phase 3 SEC-03 introduction, exact path TBD) — session-id KV record helpers. TEST-01 wallet-session test mocks this layer (or the underlying `kv.ts`) to drive session presence/absence/expiry.

- **`vite.config.js` `test` block** — Vitest 1.6.0 + jsdom + `deps.inline` for ESM-only chain libraries. TEST-* additions inherit this config; anvil-driven tests need a parallel `test.integration` config OR a runtime `process.env` switch (researcher picks).

- **`vitest-setup.ts`** — global mocks for `svelte-wagmi`, `$lib/stores`, `$app/stores`. TEST-01 + TEST-03 inherit; anvil-driven tests may need a per-suite override.

- **`tests/mocks/mockStores.ts` + `tests/utils/mockStores.ts` + `tests/fixtures/`** — existing fixture/mocks scaffolding. TEST-* additions extend this surface.

### Established Patterns

- **TRADE-01 codemod + ESLint pattern** — Plan 02-01 shipped a ts-morph codemod migrating 57 raw IO-perspective property reads + an ESLint `no-restricted-syntax` rule + a lint fixture (`io-perspective-violation.ts`). DRIFT-01 mirrors this exactly: ts-morph codemod for 8 files + ESLint rule + lint fixture (`token-lookup-violation.ts`).

- **Phase-exit grep-gate pattern** — Plans 01-08 / 02-08 / 03-11 each shipped a phase-exit plan with grep gates. Phase 4's phase-exit wave (Wave 6) inherits this pattern: greps for DRIFT-03 evidence (no Rhinestone/EIP-7702/account-abstraction in CLAUDE.md), DRIFT-01 evidence (TOKENS.find allowlisted only), TEST-01..04 file-existence evidence, audit-log import-grep across admin endpoints. Cross-cutting Phase 2 + Phase 3 gates re-verified (TRADE-01, TRADE-02 cycle severance, failWith ≥ 12, no Alchemy hardcoding, no Math.random in accessCodes/referrals, no fallback secrets).

- **Atomic-commits-with-svelte-check-green** — Phase 2 + Phase 3 discipline carried forward. Every commit leaves svelte-check at the established baseline + tests green. DRIFT-01 codemod ships in a single atomic commit; ESLint rule + lint fixture in a follow-up commit if needed for review tractability, but both inside one PR per the TRADE-01 plan-shape precedent.

- **Per-REQ-ID acceptance criteria** — Phase 1–3 plan pattern: every REQ-ID has explicit named scenarios with file/line evidence, verified at phase-exit. TEST-01..04 follow this — each test file maps to specific scenarios listed in the REQ-ID, no numeric coverage threshold (D-07).

### Integration Points

- **TEST-01 hooks.server.ts test wiring:** new directory `tests/hooks/` with 6 files (D-02). Each file imports the relevant `hooks.server.ts` `handle` export, drives mock RequestEvents through it, asserts on response shape / `event.locals` mutations / cookie sets / next() invocation. `tests/hooks/_helpers.ts` provides factories.

- **TEST-02 admin audit-log test wiring:** for each admin endpoint, a co-located `*.test.ts` (or grouped under `tests/lib/admin/`). Mocks `$lib/server/auditLog`; invokes handler; asserts mock called with success-path then failure-path shapes (D-03).

- **TEST-03 marketOrderExecution.ts test wiring:**
  - Anvil scaffolding: `tests/helpers/anvil.ts` spawns `anvil --fork-url $BASE_RPC_URL --fork-block-number <N>` before suite, exposes `http://127.0.0.1:8545`, tears down on suite exit. `tests/integration/marketOrder/anvil-fork.test.ts` (or split per scenario) drives `viem` against the fork.
  - Replay JSON fixtures: `tests/fixtures/marketOrder/<scenario>.json` captures redacted OBS-03 transcripts. Fixture loader: `tests/helpers/loadTranscript.ts`. Tests at `tests/integration/marketOrder/replay-*.test.ts` consume them.
  - Hand-built glue: extends existing `tests/lib/services/marketOrderExecution.test.ts` (current Phase 1 + 2 unit tests) with orchestration-level assertions where TRADE-04 doesn't already cover.

- **TEST-04 scraper test wiring:** co-located `src/lib/server/snapshots/scraper.test.ts`. Hand-built mocks of Goldsky GraphQL responses for the three edge categories (pagination, legacy wrappedTokenTransfers fallback, transient subgraph failure). `vitest-mock-extended` for typed deep mocks of the subgraph client.

- **DRIFT-01 codemod + ESLint site:**
  - `scripts/codemods/migrate-token-find.ts` — ts-morph codemod (one-shot, idempotent). Migrates 8 files: `tradeTransform.ts`, `api/orders.ts`, `api/subgraph.ts`, `oracleQuotes.ts`, `priceFeeds.ts`, `QuickTrade.svelte`, `LimitOrder.svelte`, `DcaOrder.svelte`.
  - `eslint.config.js` (or `.eslintrc.cjs`) — new `no-restricted-syntax` rule banning `TOKENS.find` outside `src/lib/config/tokens.ts` allowlist.
  - `tests/fixtures/eslint/token-lookup-violation.ts` — lint fixture. Mirror of TRADE-01's `io-perspective-violation.ts`.

- **DRIFT-02 helper site:** new `getPaymentTokensForNetwork(network)` helper in `src/lib/config/tokens.ts` (or `src/lib/utils/payment.ts` alongside `isPaymentToken` if that's the convention). Replace hardcoded USDC address constants in `admin/+page.svelte` and `api/admin/nansen/+server.ts` with calls to the new helper.

- **DRIFT-03 edit site:** `CLAUDE.md` (top-level project file). Surgical edits per D-05. Phase-exit grep-gate verifies no Rhinestone/EIP-7702/account-abstraction strings remain.

- **Phase-exit wave (Wave 6):** new plan `04-NN-PLAN.md` (planner picks the number — likely 04-08 or 04-09 depending on how the test plans split). Mirrors 03-11 phase-exit pattern.

</code_context>

<specifics>
## Specific Ideas

- **Hybrid fixture strategy is the audit-grade answer.** TEST-03's audit motivation is "partial-fill misclassification or path-ordering regressions caught in CI" (ROADMAP success criteria #2). Hand-built mocks alone fail this because the developer writing the mock has to imagine the bug to write the assertion. Anvil + replay covers both halves of the orchestration: anvil pins the on-chain truth (vault state, multicall results), replay pins the subgraph truth (stale quotes, hydration failures). Together they catch the bug classes Phase 1 OBS-03 was added to make diagnosable.

- **DRIFT first as wave order.** DRIFT-01's codemod touches `oracleQuotes.ts` and `priceFeeds.ts`, which TEST-03's replay JSON fixtures or hand-built setups will reference. Landing DRIFT-01 BEFORE TEST-03 means the test fixtures pin the post-codemod shape, not the pre-codemod shape that gets immediately migrated. TEST-first ordering would force fixtures to migrate twice.

- **Per-REQ-ID acceptance criteria over numeric coverage.** The Phase 1–3 plan pattern proved that scenario-based gates produce higher-quality tests than line-coverage chasing. Adding a numeric threshold would introduce a "hit the number" pressure that's orthogonal to test quality. TEST-01..04's audit motivation is "specific bug classes can no longer recur" — that maps directly to scenario-based assertions, not %.

- **TRADE-01 codemod+ESLint as the proven DRIFT-01 precedent.** Phase 2 02-01 (TRADE-01) is fresh in the team's muscle memory and shipped the exact codemod-then-lint pattern DRIFT-01 needs. Researcher reads the plan and SUMMARY at planning time and mirrors the shape — same ts-morph approach, same allowlist mechanism, same fixture-test wiring.

- **CLAUDE.md surgical-edit preserves accurate content.** The Order Semantics INPUT/OUTPUT section is accurate AND is the prose statement of TRADE-01's bug class — full rewrite from `.planning/codebase/` would lose this content because CONVENTIONS.md doesn't replicate it. Surgical edit + Ground Truth pointer is the minimum-risk change.

- **Real-money / non-regression discipline carries forward.** Every Phase 2 + Phase 3 cross-cutting gate must hold green at Phase 4 close: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance, `failWith()` count ≥ 12, `EMERGENCY_RATIO_MULTIPLIER` count = 0, svelte-check baseline = 3, staleTime: Infinity preserved, no Alchemy hardcoding, no Math.random in accessCodes/referrals, no fallback secrets, session-cookie shape preserved. The Phase 4 phase-exit wave (Wave 6) re-verifies these mechanically. DRIFT-01's codemod especially must not regress TRADE-01 (the codemod's allowlist is disjoint from TRADE-01's).

</specifics>

<deferred>
## Deferred Ideas

Captured here so they aren't lost. None block Phase 4; some are explicit milestone-close handoffs.

- **Numeric line-coverage threshold in CI.** Rejected per D-07 — per-REQ-ID assertion is the gate. Revisit only if a future post-milestone phase needs a coarse regression signal AND the team is willing to write the supporting test discipline.

- **Full CLAUDE.md rewrite.** Rejected per D-05 — surgical edit + Ground Truth pointer is cheaper and lower-risk. Revisit only if `.planning/codebase/` evolves enough that the surgical-edit content is materially out of date.

- **Append-only correction note in CLAUDE.md.** Rejected per D-05 — surgical edit removes the misleading content rather than annotating it.

- **Replay-everything for TEST-03.** Rejected per D-01 — anvil for on-chain half + replay for subgraph half is the right split.

- **Anvil-only for TEST-03 (skip replay).** Rejected per D-01 — anvil cannot simulate Goldsky indexer lag, which is the source of the freshness illusion bug class.

- **Static AST/grep-only enforcement for TEST-02 audit-log.** Rejected per D-03 — runtime per-endpoint test catches behavioral regressions a static guard would miss. The phase-exit grep gate (D-03b) is a secondary tripwire, not the primary mechanism.

- **ESLint rule for TEST-02 audit-log requirement.** Considered but not selected — ESLint's coverage of cross-file behavioral invariants is weaker than runtime testing for this class of guarantee. The phase-exit grep gate covers the import-presence check.

- **One big tests/hooks.server.test.ts file.** Rejected per D-02 — split-per-concern keeps each file <300 lines and produces concern-pointed failure messages.

- **TEST-02 inventory pinned to the ROADMAP REQ-ID list.** Open per D-03a — researcher cross-references against Phase 1 DEPR-* SUMMARY to filter out endpoints that have been deleted.

- **Anvil tests inline in `npm test` vs gated behind `npm run test:integration`.** Open per Claude's discretion — researcher picks based on Foundry CI cost.

- **DRIFT-02 helper return type.** Open per Claude's discretion — `Token[]` or `Map<Address, Token>`.

- **Future drift cleanups.** Out of scope — Phase 4 handles DRIFT-01..03 explicitly. Future drift fixes get their own milestone or land opportunistically.

- **TEST-03 fixture refresh as a recurring task.** Open per Claude's discretion — RUNBOOK documents the procedure but does NOT mandate a refresh cadence. Refresh happens on (a) OBS-03 transcript schema change, (b) marketOrderExecution.ts behavior change, (c) periodic operator review.

- **External integration test environment (Tenderly / fork-as-a-service).** Out of scope. Anvil is the chosen tool; alternatives revisited only if Foundry CI becomes a measurable cost.

- **Coverage tooling adoption (`npx vitest --coverage` as developer tool, not CI gate).** Captured per D-07a — developers can run ad-hoc; not a CI check.

- **HUMAN-UAT carry-forward items.** PERF-01 numeric p75 LCP < 2.5s validation (Phase 2 deferred), SEC-03+04 D-04b runtime UX assertion (Phase 3 deferred). Neither is Phase 4 work. The 04-RUNBOOK.md milestone-close handoff lists them so the operator runs `/gsd-verify-work` against them as part of milestone exit.

- **DRIFT-01 prevention via comment marker only.** Rejected per D-04 — TRADE-01 codemod+ESLint precedent is proven and gives a stronger guarantee at minimal extra cost.

- **DRIFT-01 codemod migration only, no ESLint rule.** Rejected per D-04 — without the rule, recurrence is left to code review, which is brittle as new contributors land.

- **Multi-chain expansion / account abstraction / new features.** Out of scope for the milestone (carried from Phase 1 D-13 + PROJECT.md Out of Scope).

- **Admin-page architectural refactor.** Out of scope for the milestone (`admin/+page.svelte` 2898 lines stays as-is; DRIFT-02 only changes 1 line in it for the USDC hardcoding fix). PROJECT.md Out of Scope.

- **External log drain / `+error.svelte`.** Still deferred per Phase 1 D-07 + D-12.

</deferred>

---

*Phase: 04-boundary-tests-and-drift-cleanup*
*Context gathered: 2026-05-01*
