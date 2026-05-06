# st0x

## What This Is

st0x is a single-chain (Base) decentralized exchange for trading tokenized securities — stocks, ETFs, and commodities issued as on-chain assets — with limit, market, and DCA orders running on the Rain orderbook protocol. It serves crypto-native traders directly via wagmi-connected wallets and non-crypto-native users via Dynamic Labs embedded wallets. The product has been live in alpha/early-beta long enough that real users hold positions and trade real money against it.

## Core Value

**A user clicking Buy or Sell gets correct, predictable execution at the price and size they were shown — every time.** When trade execution misbehaves, trust evaporates immediately because real money is on the line. Everything else (rewards, dashboards, admin tools) can degrade; correct trade execution cannot.

## Requirements

### Validated

<!-- Existing capabilities, inferred from codebase + reflected in `.planning/codebase/`. -->

- ✓ Single-chain DEX on Base (8453) for tokenized securities — existing
- ✓ Limit orders, market orders, and DCA strategies via Rain orderbook (`@rainlanguage/orderbook`) — existing
- ✓ Asset tokens supported: tNVDA, tAMZN, tTSLA, tMSTR, tIAU, tCOIN, tSPLG, tSIVR, tCRCL, tBMNR, tPPLT (with wrapped/unwrapped/legacy address triplets) — existing
- ✓ Payment tokens: USDC, USDT, WETH — existing
- ✓ Two unified auth paths through `walletService.ts`: direct wallet (wagmi) + Dynamic Labs embedded wallet — existing
- ✓ Pyth Network price feeds for asset pricing; SPYM uses external `LIQUIDITY_MONITOR_URL` proxy — existing
- ✓ Goldsky subgraphs for orderbook events, SFT vaults, metadata; Raindex for order data — existing
- ✓ NYSE market-hours gating for tokenized-security trading — existing
- ✓ Recent fix (commit 89571b3): slippage tolerance honored on Sell orders + correct partial-fill detection in spend-anchored modes — existing
- ✓ Recent fix (commit 6c1919f): live oracle price used for `ioRatio` estimation instead of stale hardcoded fallback — existing

**v1.0 Stabilization milestone — shipped 2026-05-05:**

- ✓ **Observability foundation** — Sentry client/server SDK with PII scrubbing (OBS-01); pino structured logging across SvelteKit endpoints, cron, take-order critical path (OBS-02); failed-take-order transcript capture with breadcrumbs (OBS-03); per-RPC failure metrics + Telegram chain-exhaustion alerts (OBS-04); Vercel Speed Insights wired (OBS-05) — v1.0
- ✓ **Trade-execution backbone refactor** — INPUT/OUTPUT side semantics codified with single-source-of-truth helpers + ESLint banned patterns (TRADE-01); 2,373-line `transaction.ts` split into focused stores with cycle severance (TRADE-02); pre-flight on-chain freshness check + visible UI staleness signaling (TRADE-03); Buy/Sell/spend-anchored/asset-anchored modes provably symmetric (TRADE-04) — v1.0
- ✓ **Trade-page first-paint performance** — ~250KB minified bundle reduction via visualizer/jspdf removal + Svelte 4 lazy-load with CLS-safe skeletons (PERF-01) — v1.0; numeric p75 LCP < 2.5s capture deferred to post-deploy HUMAN-UAT
- ✓ **Security hardening** — hardcoded Alchemy key removed → env vars (SEC-01); module-load fail-closed for `auth.ts` + `csrf.ts` (SEC-02); atomic-flip server-signed session cookie tied to wallet signature (SEC-03); session-bound HMAC CSRF (SEC-04); CSPRNG access codes + referrals (SEC-05); snapshot rate-limit + admin gate (SEC-06); Vercel-preview captcha fail-closed (SEC-07) — v1.0
- ✓ **Reliability hardening** — per-RPC retry + chain-exhausted throws (REL-01); viem fallback transport for EIP-1271/EIP-6492 verification (REL-02); Rain strategies registry vendored to `static/registry/` (REL-03) — v1.0
- ✓ **Test coverage at danger boundaries** — `hooks.server.ts` boundary tests (TEST-01); audit-log fan-out tests across 8 admin endpoints (TEST-02); anvil-fork integration suite + replay tests at FORK_BLOCK 33_400_000 (TEST-03); snapshot scraper edge-case tests (TEST-04) — v1.0
- ✓ **Drift cleanup** — `getTokenByAnyAddress(addr)` codemod across all `TOKENS.find` call sites + ESLint rule (DRIFT-01); `isPaymentToken(addr, network)` + `getPaymentTokensForNetwork(network)` helpers (DRIFT-02); CLAUDE.md rewritten to match actual code — single chain, no AA/Rhinestone/EIP-7702 (DRIFT-03) — v1.0
- ✓ **Unused-subsystem deprecation** — user-facing rewards code, points pipeline, Onramper integration, captcha + newsletter scaffolding all removed (DEPR-01..03 + post-execution cleanup PR #169) — v1.0

### Active

**v1.1 Test & Observe milestone — in planning:**

- **TEST-05**: UI-driven Anvil-fork E2E harness — Base mainnet fork at a recent block with live counterparty orders, wired into the test runner so trades can be simulated end-to-end
- **TEST-06**: E2E coverage — market order Buy/Sell happy path triggered from the actual UI button, asserting on-chain fill
- **TEST-07**: E2E coverage — market order failure paths (slippage exceeded, no liquidity, stale price, insufficient balance, market-hours gating)
- **TEST-08**: E2E coverage — limit order deployment + simulated counterparty fill, asserting vault state
- **TEST-09**: Order-test audit — review all existing order-related unit + integration tests, identify gaps, remediate in-milestone
- **TEST-10**: UI-first test orientation — tests drive through routes/components rather than internal services, so they survive the planned UI→API logic migration
- **OBS-06**: Sentry Session Replay integrated for transacting users — privacy-masked, sampling biased toward trade flows
- **OBS-07**: Transaction event taxonomy — defined event names, properties, and step coverage for Buy/Sell/limit/DCA flows in PostHog + pino
- **OBS-08**: Funnel + drop-off dashboard — PostHog funnel from "opened trade page" → "tx confirmed" with named drop-off steps
- **OBS-09**: Correlation ID threading — Sentry event ↔ PostHog session ↔ pino server log linkable for any failed trade

## Current Milestone: v1.1 Test & Observe

**Goal:** Lock in trade-execution correctness with UI-driven Anvil-fork E2E tests, and turn the v1.0 observability foundation into a tool that surfaces transacting-user pain before users have to report it.

**Target features:**
- UI-driven Anvil-fork E2E test harness covering market orders (happy + failure paths) and limit order deployment + fill
- Audit and gap-fill of all existing order tests, oriented around the UI so they survive the planned UI→API migration
- Sentry Session Replay scoped to transacting users (privacy-masked)
- Transaction event taxonomy + funnel/drop-off dashboard in PostHog
- Cross-tool correlation: Sentry ↔ PostHog ↔ pino linked by correlation ID for any failed trade

### Out of Scope

<!-- Hard exclusions for this milestone. Reasons recorded to prevent drift back in. -->

- **Multi-chain expansion (Arbitrum / Optimism / Ethereum mainnet)** — `CLAUDE.md` aspirationally describes this but only Base exists; stabilizing one chain comes first. Multi-chain requires a separate milestone after the bug factory is closed.
- **Account abstraction (Rhinestone SDK / EIP-7702 smart EOAs / USDC gas sponsorship)** — Also `CLAUDE.md` drift; no AA code exists. Adding AA on top of an unstable trade-execution backbone would multiply bug surface.
- **New features, asset classes, or order types** — No perps, options, advanced order types, new tokens, or new asset categories during stabilization. Stabilize what exists; expand later.
- **Admin-page architectural refactor** — `admin/+page.svelte` (2898 lines) and `admin/rewards/+page.svelte` (4933 lines) are bloated but internal-only. Painful for team velocity but doesn't affect end users; deferred to a separate cleanup milestone unless the rewards-subsystem deprecation eliminates one of them as a side effect.
- **Mobile app** — Out of scope; web-only for this milestone.
- **Compliance / regulatory programs (KYC, AML, tax reporting infrastructure beyond what already exists)** — Out of scope; not on the bug-whackamole critical path.
- **Onramper fiat on-ramp** — Currently shipped but unused; being removed in this milestone (see Active deprecation requirements). Not part of go-forward scope.

## Context

**Why this milestone exists.** st0x has been live in "permanent alpha/early-beta" long enough that real users hold positions and have been hit by real bugs. The pattern is "continuous one-shot bugs that we fix" — bug whackamole — where each fixed bug is replaced by another from the same underlying class. Recent user-affecting incidents include trading correctness bugs (e.g. the slippage-on-Sell bug fixed in commit 89571b3, where Sell orders ignored user slippage and could fill at deep discounts), UI/chain liquidity mismatches ("no liquidity" errors when the UI showed liquidity), market-order prioritization issues, and RPC outages. The team does not yet know the root cause of "no liquidity" mismatches — observability is the first gap to close.

**Current codebase state (mapped 2026-04-28).** Brownfield. SvelteKit 2 + Svelte 4 + TypeScript strict on Vercel, single-chain (Base 8453), Rain orderbook via `@rainlanguage/orderbook` WASM SDK pinned to alpha versions. Core trade-execution path is concentrated in `src/lib/stores/transaction.ts` (2373 lines, owns deploy + market-take state, recently de-cycled by extracting `marketOrderFill.ts`), `src/lib/services/marketOrderExecution.ts` (aggregated → fallback → per-order paths, ratio cap math), and `src/lib/types/orderPerspective.ts` (the side-semantics single source of truth — but bypassed by several call sites). Two auth paths through `src/lib/services/walletService.ts`. The full audit lives in `.planning/codebase/CONCERNS.md` (tech debt, known bugs, security considerations, performance bottlenecks, fragile areas, scaling limits, dependencies at risk, test coverage gaps).

**Known structural traps.** The naming collision between maker-perspective INPUT/OUTPUT (chain ABI) and taker-perspective takerWants/takerPays (UI) is a permanent footgun and the root-cause class behind multiple recent bugs. `transaction.ts` size + circular-import history make it a bug factory. The RPC fallback chain in `generator.ts` fails silent when all RPCs misbehave (silently uses `latestBlock` as the closest block). The Rain strategies registry is fetched live from GitHub raw at a pinned commit (rate-limit + availability dependency). User-facing rewards/leaderboard code is dead but still ships; internal-team rewards usage is a "nice to have" the team can drop.

**Observability is currently zero.** No Sentry, no APM, no structured server logging — only Vercel logs. This means user-reports are the primary bug-detection channel and root causes for issues like the "no liquidity" mismatch are not currently knowable. Building observability is a prerequisite to safely refactoring the trade-execution backbone, because we need to be able to see whether the refactor actually moves the metric.

**Done signal.** Two outcome-based signals together:
1. Zero user-reported correctness bugs for a sustained period (specific N to be set during execution — likely measured as a rolling window).
2. Internal "confidence to ship features without fear" — changes to neighbouring code don't carry existential risk because tests + monitoring + reduced surface area catch regressions early.

These are deliberately not metrics-based or audit-checklist-based: the user explicitly chose outcomes (whackamole stops; team fear drops) over box-checking.

## Constraints

- **Tech stack** — SvelteKit 2 + Svelte 4 + TypeScript strict + Vercel + Rain orderbook + Dynamic Labs + wagmi/viem. No reframing onto a different framework or platform during this milestone.
- **Single chain** — Base (8453) only. Multi-chain explicitly deferred.
- **Real users on real money** — Live trading users hold positions today. No "everything breaks for a day" migrations; refactors must ship safely (feature flags, parallel implementations, staged rollouts where appropriate).
- **Team size** — Solo / 1-2 developers. Phase granularity must respect serial execution; phases need to be independently shippable so progress is incremental.
- **No fixed deadline** — But "no deadline" risks drift. Phases must each deliver a visible improvement so velocity is observable.
- **Existing observability stack** — None. Phase 1 must build from zero (Sentry-class client + server logging + alerting), not extend an existing system.
- **Dependency risk** — `@rainlanguage/orderbook` is alpha-version and changes upstream; `svelte-wagmi` shim lags wagmi releases; the Rain strategies registry is a GitHub-raw URL pinned to a commit. Any of these can break orders without warning.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Frame the milestone as "stop the bug whackamole at the source," not "fix everything in CONCERNS.md" | The audit covers a lot of ground; outcome-based framing keeps scope honest | ✓ Good (v1.0) |
| Refactor the full trade-execution backbone (boundary semantics + transaction store + freshness + execution path) as one connected effort | The four pieces are tightly coupled; fixing one without the others leaves the bug factory open | ✓ Good (v1.0 Phase 2) |
| Observability comes before any refactor | Cannot diagnose "no liquidity" mismatches or validate that a refactor improved anything without monitoring; refactoring blind risks new whackamole on top of old | ✓ Good (v1.0 Phase 1 — observability stack live + transcripts captured before Phase 2 touched trade execution) |
| Out-of-scope: multi-chain, AA, new features, admin refactor | Each adds bug surface to a system whose core is unstable; expand only after stabilization | ✓ Held (v1.0; carry-forward to next milestone scope review) |
| Remove user-facing rewards/leaderboard code; defer internal admin rewards decision to Phase 1 discovery | User-facing is dead and shipping risk; internal is a "nice to have" the team can drop, but worth confirming before deletion | ✓ Resolved (D-01 in Phase 1 CONTEXT — keep snapshot pipeline for admin TVL/volume; delete user-facing rewards layer) |
| Done = outcome-based (whackamole stops + ship-without-fear), not metrics or audit-checklist | User explicitly chose outcomes over checklists when offered both | ⚠ Revisit — early signal good but needs sustained user-bug-report window post-v1.0 |
| Coarse phase granularity (3-5 phases, 1-3 plans each) | Solo / 1-2 dev team can't parallelize across many phases; coarse keeps focus | ⚠ Revisit — landed at 4 phases / 8-11 plans each; coarser-by-phase but not coarser-by-plan |
| Captcha + newsletter scaffolding kept SEC-07 fail-closed plumbing for inactive flows | Originally treated as live; later audit during v1.0 close found zero production callers | ✓ Resolved — both removed in PR #169 post-execution cleanup; tracked as drift sourced from never-completed wiring |
| EU-region Sentry CSP entry added in PR #170 | Phase 1 CSP allowlist anticipated US-region only; the actual project DSN is EU-region. Wildcards don't cross dot boundaries (Phase 1 OBS-01 RUNBOOK Pitfall 1) | ✓ Resolved (PR #170) — verified live on production deploy 2026-05-05 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-06 — v1.1 Test & Observe mini-milestone opened. Phase numbering reset to 1, 2 (v1.0 phases archived to `.planning/milestones/v1.0-phases/`). Scope: UI-driven Anvil-fork E2E tests + observability deepening (Sentry Session Replay, event taxonomy, funnel, correlation IDs).*
