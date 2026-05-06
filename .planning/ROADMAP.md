# Roadmap: st0x

## Milestones

- ✅ **v1.0 Stabilization** — Phases 1-4 (shipped 2026-05-05) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Test & Observe** — Phases 1-2 (in planning) — phase numbering reset; v1.0 phases archived to [milestones/v1.0-phases/](milestones/v1.0-phases/)

## Goal — v1.1 Test & Observe

Lock in trade-execution correctness with UI-driven Anvil-fork E2E tests, and turn the v1.0 observability foundation into a tool that surfaces transacting-user pain before users have to report it.

## Phases

- [ ] **Phase 1: UI-Driven E2E + Order Test Coverage** — Anvil-fork harness against Base mainnet with live Rain counterparties; UI-button-driven E2E for market Buy/Sell (happy + failure) and limit-order deploy/fill; audit-and-remediate existing order tests; UI-coupling discipline for the planned UI→API migration.
- [ ] **Phase 2: Observability for Transacting Users** — Sentry Session Replay (privacy-masked, transaction-biased sampling); transaction event taxonomy in PostHog + pino; funnel/drop-off dashboard; correlation ID threading across Sentry / PostHog / pino; production verification + privacy review.

<details>
<summary>✅ v1.0 Stabilization (Phases 1-4) — SHIPPED 2026-05-05</summary>

- [x] Phase 1: Shrink the Surface, See What's Happening (8/8 plans) — completed 2026-04-29
- [x] Phase 2: Trade-Execution Backbone Refactor (8/8 plans) — completed 2026-04-29
- [x] Phase 3: Production-Grade Hardening (11/11 plans) — completed 2026-04-30
- [x] Phase 4: Boundary Tests & Drift Cleanup (10/10 plans) — completed 2026-05-01

Full milestone detail: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md). Audit: [milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md). Requirements archive: [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md).

</details>

## Phase Details — v1.1

### Phase 1: UI-Driven E2E + Order Test Coverage
**Goal**: A trade-page UI flow has E2E coverage that catches a deliberately introduced regression in side semantics, slippage handling, or freshness — before it reaches a user.
**Depends on**: Nothing (first phase of v1.1; builds on v1.0 anvil-fork suite TEST-03 from `milestones/v1.0-phases/phase-04-boundary-tests-and-drift-cleanup/`)
**Requirements**: TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, TEST-10, TEST-11, TEST-12
**Success Criteria** (what must be TRUE):
  1. Running the test suite spins up a deterministic Base-mainnet Anvil fork at a pinned recent block with live Rain counterparty orders, and per-test snapshot/revert keeps runs reproducible.
  2. Driving the actual trade-page Buy and Sell buttons through the UI executes a market order against forked counterparties and asserts on-chain fill plus correct user/vault state — for both directions.
  3. Each market-order failure mode (slippage exceeded, no liquidity, stale oracle price, insufficient balance, market-hours gating) surfaces the user-visible error the UI is supposed to show, asserted via the rendered UI rather than service internals.
  4. Deploying a limit order through the UI deposits into the correct (output) vault, and a simulated counterparty fill on the fork completes the order and leaves vault state matching expectations.
  5. A written gap report covers every existing order-related test under `tests/`, every "must-fix" gap is closed in this milestone, and a documented convention establishes that E2E tests reference UI selectors / data-testids rather than internal service exports.
**Plans**: TBD
**UI hint**: yes

### Phase 2: Observability for Transacting Users
**Goal**: When a real user's trade fails, an engineer can pick the Sentry event and within minutes see the matching session replay AND the matching server logs, and a funnel dashboard shows where transacting users are dropping off.
**Depends on**: Phase 1 (test harness gives confidence to ship instrumentation changes; v1.0 OBS-01..05 foundation already live: Sentry SDK + pino + transcripts + RPC metrics + Speed Insights)
**Requirements**: OBS-06, OBS-07, OBS-08, OBS-09, OBS-10, OBS-11
**Success Criteria** (what must be TRUE):
  1. Sentry Session Replay is live for transacting users, sampling is biased toward sessions that initiated a Buy / Sell / limit-deploy, and PII fields plus addresses-where-appropriate are masked.
  2. A documented transaction event taxonomy is emitted in PostHog and pino across Buy, Sell, limit-deploy, and DCA-deploy flows — covering open page, quote received, click submit, sign approval, sign trade, broadcast, confirmed/failed — with documented properties (mode, side, amounts, slippage, error class).
  3. A single PostHog dashboard renders trade-page → quote → submit → signed → confirmed funnels with named drop-off steps and counts, broken out by order type (market, limit).
  4. For any failed trade, a shared correlation ID emitted at trade start lets an engineer navigate from Sentry event → PostHog session replay → pino server logs without manual joins.
  5. At least one real production trade roundtrip is captured end-to-end across Sentry replay, PostHog events, and pino server logs, and Session Replay masking + event properties have passed a documented privacy review against `.planning/codebase/CONCERNS.md` PII guidance and the OBS-01 Sentry PII scrubbing config.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Shrink the Surface, See What's Happening | v1.0 | 8/8 | Complete | 2026-04-29 |
| 2. Trade-Execution Backbone Refactor | v1.0 | 8/8 | Complete | 2026-04-29 |
| 3. Production-Grade Hardening | v1.0 | 11/11 | Complete | 2026-04-30 |
| 4. Boundary Tests & Drift Cleanup | v1.0 | 10/10 | Complete | 2026-05-01 |
| 1. UI-Driven E2E + Order Test Coverage | v1.1 | 0/0 | Not started | - |
| 2. Observability for Transacting Users | v1.1 | 0/0 | Not started | - |

**v1.0 Stabilization milestone closed: 2026-05-05** — 33/33 v1 REQ-IDs across 4 phases. HUMAN-UAT carry-forwards (PERF-01 numeric p75 LCP < 2.5s, SEC-03+04 D-04b runtime UX, REL-02 per-RPC attribution) tracked in [STATE.md](STATE.md) `## Deferred Items` for post-deploy verification via `/gsd-verify-work --milestone v1.0 --human-uat`.

## Coverage — v1.1

- v1 requirements mapped: 14/14
  - Phase 1: TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, TEST-10, TEST-11, TEST-12 (8)
  - Phase 2: OBS-06, OBS-07, OBS-08, OBS-09, OBS-10, OBS-11 (6)
- Orphaned: 0
- Duplicates: 0

## Backlog

Items captured at v1.0 close that are not yet sized into a milestone. Use `/gsd-review-backlog` to triage (promote → active milestone, keep, or remove). Numbering convention: `999.x`.

### Operational follow-ups (v1.0 carry-forward)

- **999.1 — HUMAN-UAT batch for v1.0 deferred verifications.** Run `/gsd-verify-work --milestone v1.0 --human-uat` once production has a 24h Speed Insights window. Covers: (a) PERF-01 numeric p75 LCP < 2.5s on `/trade/[id]`; (b) SEC-03 + SEC-04 D-04b real-wallet sign-in UX (one signature on first sign-in, none on subsequent trades, re-prompt after explicit logout); (c) REL-01 Telegram alert path by forcing chain exhaustion per `milestones/v1.0-phases/phase-03-production-grade-hardening/03-RUNBOOK.md §10`. **Source:** v1.0 audit `tech_debt`.
- **999.2 — Alchemy atomic-swap-then-rotate.** The current `BASE_RPC_URL` env var points at the historical Alchemy key (already public via git history pre-SEC-01). Generate fresh key in Alchemy, update `BASE_RPC_URL` + `PUBLIC_BASE_RPC_URL` on Vercel, redeploy, then revoke old key. Recipe in `milestones/v1.0-phases/phase-03-production-grade-hardening/03-RUNBOOK.md §3`. **Source:** v1.0 audit `tech_debt` + Phase 3 D-02.
- **999.3 — Vercel env-var cleanup (orphaned).** After PR #169 dead-code removal, the following Vercel env vars have no code references and can be deleted: `HCAPTCHA_SECRET`, `PUBLIC_HCAPTCHA_SITEKEY`, `MAILERLITE_*` (if any), `RECAPTCHA_SECRET` (newsletter only). Plus `PUBLIC_RHINESTONE_API_KEY` if account-abstraction drift removal in DRIFT-03 also dropped its sole consumer. **Source:** PR #169 + DRIFT-03 follow-up.

### Tech debt — Phase 2 (trade-execution backbone)

- **999.4 — Phase 2 walkResult fills mutation (WR-01).** `walkResult.fills` mutated at `src/lib/services/marketOrderExecution.ts:484` without recomputing `inputAmountFilled` — partial-fill banner anchor inflated post-pre-flight under survivors-only liquidity. Refactor to recompute or treat fills as immutable through the walk. **Source:** Phase 2 `02-REVIEW.md`.
- **999.5 — Phase 2 micro tech debt bundle (WR-02..04 + IN-01..05).** (WR-02) `approvalStore` `EnsureAllowanceParams.token.decimals` declared but never read; (WR-03) `marketTakeStore` `aggregatedTakeCalldataCache` unbounded — eviction only on TTL hit at read time; (WR-04) `deployTransactionStore` `setInterval` polling can interleave overlapping ticks; (IN-01..05) type-laundering at SDK boundary + out-of-rule-scope IO-perspective reads. Combine into one focused refactor PR. **Source:** v1.0 audit `tech_debt` + Phase 2 review.

### Tech debt — Phase 3 (hardening)

- **999.6 — REL-02 per-RPC attribution through viem fallback Transport.** OBS-04 logs lose per-RPC attribution when `verifyMessage` routes through the viem fallback Transport at `src/lib/server/accessCodes.ts`. Restore attribution by either subclassing the fallback transport with per-attempt instrumentation or adding a custom `onResponse` hook. **Source:** v1.0 audit `tech_debt`, Phase 3 plan-text reframing.

### Tech debt — Phase 4 (test coverage + drift)

- **999.7 — `svelte-check` baseline cleanup (3 errors).** `tests/lib/server/rpcMetrics.test.ts:165, 181, 182` — tuple-type narrowing failures (`mockNotifyChainExhausted.mock.calls[0]` typed as `[]`). Fix with explicit non-null assertions or type guards. Once green, drop the `svelte-check baseline = 3 errors` carry-forward contract from CI. **Source:** v1.0 audit `tech_debt` (Phase 4 carry-forward).
- **999.8 — `test-integration` CI job foundry install.** GitHub Actions step `Install Foundry (anvil)` fails with `/home/runner/.foundry/bin/foundryup: No such file or directory` (exit 127). Likely a foundryup version drift or path-handling change in the install script. Re-pin foundryup or switch to the `foundry-rs/foundry-toolchain` action. **Source:** v1.0 PR #169 CI inspection.
- **999.9 — `04-RUNBOOK.md` config-name drift.** References `vitest.integration.config.ts`; the actual file is `vite.config.integration.js`. Cosmetic doc fix; `package.json` script reference is correct. **Source:** v1.0 audit `tech_debt`.
- **999.10 — Phase 4 SUMMARY frontmatter (DRIFT-02 + DRIFT-03).** `04-01-SUMMARY.md` and `04-02-SUMMARY.md` tag `DRIFT-03` / `DRIFT-02` but lack the `requirements-completed` field. Cosmetic; REQUIREMENTS.md and VERIFICATION.md correctly satisfy them. **Source:** v1.0 audit `tech_debt`.
- **999.11 — Anvil-fork CI run with archive `BASE_RPC_URL`.** v1.0 closed without a green CI run of the anvil-fork integration suite against an archive RPC. Once 999.8 is fixed, set `BASE_RPC_URL` in CI env to an archive node and verify the suite passes at `FORK_BLOCK 33_400_000`. **Source:** v1.0 audit `tech_debt` HUMAN-UAT carry-forward.
- **999.12 — OBS-03 transcript-capture refresh.** Phase 4 used 7 synthesized transcripts (Vercel CLI was unavailable at execution time). Refresh from real Vercel logs once the production Sentry stack has captured a sample of real failure modes. **Source:** v1.0 audit `tech_debt`.
- **999.13 — `CLAUDE.md` natural-read review.** Post-DRIFT-03 rewrite, do a fresh natural-language read-through to catch any remaining single-chain / no-AA prose drift, plus reflect the post-v1.0 architecture (Sentry live, session cookie atomic-flipped, vendored Rain registry). **Source:** v1.0 audit `tech_debt`.

---
*Last updated: 2026-05-06 — v1.1 Test & Observe milestone planned; 2 phases, numbering reset to 1, 2.*
