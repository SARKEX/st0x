# Requirements — Milestone v1.1 Test & Observe

> v1.0 Stabilization requirements (TRADE-01..04, OBS-01..05, PERF-01, SEC-01..07, REL-01..03, TEST-01..04, DRIFT-01..03, DEPR-01..03) all shipped — see `PROJECT.md ## Validated` and `MILESTONES.md`.

## Goal

Lock in trade-execution correctness with UI-driven Anvil-fork E2E tests, and turn the v1.0 observability foundation into a tool that surfaces transacting-user pain before users have to report it.

## Scope Principles

- **UI-first.** Tests drive through real routes/components/buttons, not directly through `marketOrderExecution.ts` or other internal services. Logic is migrating to the API over time; tests written today must survive that move.
- **Forked, not mocked.** Use Anvil-fork against Base mainnet at a recent block where live counterparty orders exist on Rain. Don't hand-craft synthetic order books — exercise the real ones.
- **Transactions are the failure surface.** Almost all current user dissatisfaction comes from transacting. Observability work is scoped to making that surface visible end-to-end (replay + events + funnel + correlation), not generic app monitoring.
- **No new features.** This is a quality-and-visibility milestone. No new order types, asset categories, chains, or AA work.

## v1 Requirements

### Testing — Anvil-Fork E2E + Order Test Coverage

- [x] **TEST-05**: UI-driven Anvil-fork harness wired into the test runner — Base mainnet fork at a pinned recent block with live Rain counterparty orders; reproducible, deterministic per-test snapshot/revert
- [ ] **TEST-06**: E2E test — Buy market order triggered from the actual trade-page UI button executes against forked counterparties and asserts on-chain fill + correct user/vault state
- [ ] **TEST-07**: E2E test — Sell market order triggered from the UI button executes against forked counterparties and asserts on-chain fill + correct user/vault state
- [ ] **TEST-08**: E2E test — market order failure paths each fail gracefully with the user-visible error the UI is supposed to show: slippage exceeded, no liquidity, stale oracle price, insufficient balance, market-hours gating
- [ ] **TEST-09**: E2E test — limit order deployment from the UI deposits into the correct (output) vault and the on-chain order is matchable; a simulated counterparty fill on the fork completes the order and asserts vault state
- [ ] **TEST-10**: Order-test coverage audit — review every existing unit + integration test under `tests/` related to order deployment, market execution, side semantics, and freshness; produce a written gap report mapped to the audit
- [ ] **TEST-11**: Gap remediation — every gap classified "must-fix" in TEST-10 has tests added in this milestone
- [ ] **TEST-12**: UI-coupling discipline — E2E tests reference UI selectors/data-testids, not internal service exports; documented as a convention so the UI→API migration doesn't break the suite

### Observability — Transacting-User Visibility

- [ ] **OBS-06**: Sentry Session Replay integrated, privacy-masked (PII fields, addresses where appropriate), sampling biased toward sessions that initiated a Buy/Sell/limit-deploy
- [ ] **OBS-07**: Transaction event taxonomy defined and emitted — named events at every meaningful step of Buy, Sell, limit deployment, and DCA deployment flows (open page, quote received, click submit, sign approval, sign trade, broadcast, confirmed/failed); each event carries documented properties (mode, side, amounts, slippage, error class)
- [ ] **OBS-08**: PostHog funnel + drop-off dashboard — single dashboard showing trade-page → quote → submit → signed → confirmed funnel with named drop-off steps and counts; one per order type (market, limit)
- [ ] **OBS-09**: Correlation ID threading — every failed trade can be navigated from a Sentry event to the matching PostHog session replay and pino server logs via a shared correlation ID emitted at trade start
- [ ] **OBS-10**: Replay + taxonomy live in production — verified with at least one real trade roundtrip captured end-to-end across Sentry replay, PostHog events, and server logs
- [ ] **OBS-11**: Privacy review — Session Replay masking rules and event properties reviewed against `.planning/codebase/CONCERNS.md` PII guidance and Sentry SDK PII scrubbing config from OBS-01

## Future Requirements

- Performance budgets / synthetic monitoring for the trade page (post-v1.1)
- Cross-environment test parity (Vercel preview running the E2E suite against a fork)
- Multi-chain expansion (still deferred; see Out of Scope)
- Account abstraction (still deferred)

## Out of Scope

- **New chains, new tokens, new order types** — Same exclusions as v1.0; v1.1 is a quality milestone.
- **Backend API extraction itself** — UI→API migration is the *reason* tests are UI-first, but the migration work itself is a separate future milestone. v1.1 only ensures tests don't block it.
- **Admin-page observability deepening** — Internal-only; Phase 2 scope is transacting users, not admin tooling.
- **Replacing PostHog or Sentry** — Build on existing tools; no platform re-evaluation in this milestone.
- **Load / chaos testing of the orderbook itself** — Out of scope; concerns the Rain protocol upstream, not st0x UX.
- **Generic synthetic uptime checks** — Vercel + existing alerting cover this; not what users are complaining about.

## Traceability

Coverage: 14/14 v1 REQ-IDs mapped — no orphans, no duplicates.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-05 | Phase 1 — UI-Driven E2E + Order Test Coverage | Complete |
| TEST-06 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| TEST-07 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| TEST-08 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| TEST-09 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| TEST-10 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| TEST-11 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| TEST-12 | Phase 1 — UI-Driven E2E + Order Test Coverage | Pending |
| OBS-06  | Phase 2 — Observability for Transacting Users | Pending |
| OBS-07  | Phase 2 — Observability for Transacting Users | Pending |
| OBS-08  | Phase 2 — Observability for Transacting Users | Pending |
| OBS-09  | Phase 2 — Observability for Transacting Users | Pending |
| OBS-10  | Phase 2 — Observability for Transacting Users | Pending |
| OBS-11  | Phase 2 — Observability for Transacting Users | Pending |
