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

### Active

<!-- Stabilization milestone scope. Hypotheses until shipped. -->

**Observability foundation (must come first — you can't refactor blind):**

- [ ] Client-side error tracking (e.g. Sentry / Highlight) wired into the SvelteKit app, with sensitive-data scrubbing
- [ ] Server-side structured logging across SvelteKit endpoints, the cron job, and the take-order critical path
- [ ] Take-order instrumentation: capture failed take-order attempts with breadcrumbs (subgraph state, on-chain state, ratio, slippage cap, side) so "no liquidity" failures become diagnosable
- [ ] RPC failure metrics + alerting (track per-RPC failure rate across the fallback chain; alert when total chain fails)
- [ ] Trade-page web vitals dashboard so first-paint regressions are visible

**Trade-execution backbone refactor (the bug-factory class):**

- [ ] Codify INPUT/OUTPUT taker-vs-maker side semantics so side-inversion bugs cannot recur — single source of truth helpers, banned raw access patterns, comprehensive boundary tests
- [ ] Split `src/lib/stores/transaction.ts` (2373 lines) into focused, independently testable state machines for deploy, market-take, approval, partial-fill detection — eliminate circular import surface
- [ ] Address UI/chain freshness illusion: pre-flight on-chain check before submitting market takes; visible UI staleness signaling so "no liquidity" failures aren't a surprise
- [ ] Fix market-order execution path: prioritization correctness, ratio-multiplier math, slippage-cap derivation — make Buy/Sell/spend-anchored/asset-anchored modes provably symmetric

**Trade-page first-paint performance:**

- [ ] Reduce trade-page first paint to acceptable target (specific metric to be set in planning) — likely combination of SSR/streaming, query-waterfall reduction, bundle pruning

**Security hardening:**

- [ ] Replace hardcoded Alchemy API key (`raindex.ts`, `networks.ts`, `accessCodes.ts`) with environment variables; rotate the live key on next deploy
- [ ] Replace hardcoded `SESSION_SECRET` and `CSRF_SECRET` fallbacks with fail-closed checks at module load in production
- [ ] Issue server-signed session cookie tied to verified wallet signature; mark HttpOnly + Secure + SameSite=Strict; downgrade `wallet-address` cookie to a non-authoritative hint
- [ ] Bind CSRF tokens to a server-issued session-id cookie (double-submit-cookie pattern) instead of stateless tokens issued by an unauthenticated endpoint
- [ ] Replace `Math.random()` with `crypto.randomBytes()` for access-code and referral-code generation
- [ ] Apply tiered rate limiting to `/api/snapshots/preview*` and admin-gate the `POST /api/snapshots/generate` endpoint
- [ ] Fail captcha closed in Vercel preview deploys (not just production)

**Reliability hardening:**

- [ ] Per-RPC retry with backoff in the fallback chain (`generator.ts`); treat empty `result` as failure, not success-with-null; never silently fall back to `latestBlock` when RPCs are misbehaving
- [ ] Use the fallback RPC chain (with retry) for EIP-1271/EIP-6492 signature verification in `accessCodes.ts` instead of a single Alchemy RPC
- [ ] Vendor the Rain strategies registry (currently fetched live from GitHub raw at a pinned commit) into the bundle or `/static/` to remove the GitHub-raw rate-limit/availability dependency

**Test coverage at danger boundaries:**

- [ ] Unit + integration tests for `src/hooks.server.ts` — public-path / admin / wallet-registration classification, CORS, CSP, bot-rejection ordering
- [ ] Tests for `/api/onramper/sign-url` authorization (CSRF, cookie match, rejection of mismatched wallet)
- [ ] Tests for snapshot scraper edge cases — pagination boundaries, legacy `wrappedTokenTransfers` fallback, transient subgraph failure
- [ ] Integration tests for the full market-order path (`marketOrderExecution.ts` + `transaction.ts`): aggregated → fallback → per-order, hydration failures, stale session

**Drift cleanup:**

- [ ] Replace direct `TOKENS.find(...)` lookups against the wrapped address only with `getTokenByAnyAddress(addr)` in `tradeTransform.ts`, `api/orders.ts`, `api/subgraph.ts`, `QuickTrade.svelte`, `LimitOrder.svelte`, `DcaOrder.svelte`; consider an ESLint rule to prevent recurrence
- [ ] Replace scattered hardcoded USDC address constants with `isPaymentToken(addr, network)` / `getPaymentTokensForNetwork(network)`
- [ ] Rewrite `CLAUDE.md` to match actual code (single chain, no AA/Rhinestone/EIP-7702, no `account-abstraction/` directory)

**Unused-subsystem deprecation:**

- [ ] Remove user-facing dead rewards code: leaderboard, monthly points, public rewards APIs, statement views, leaderboard polling
- [ ] Decide and act on internal admin rewards/TVL views (`admin/rewards/+page.svelte` 4933 lines, the rewards section of `admin/+page.svelte`): if internal team accepts dropping it, remove the cron, snapshot pipeline (`src/lib/server/snapshots/`), and KV state to eliminate the bug surface; otherwise keep with bandages and accept the risk
- [ ] Remove the entire Onramper fiat-on-ramp integration — `OnramperModal.svelte`, the `/api/onramper/sign-url` endpoint, `ONRAMPER_SECRET_KEY` / `PUBLIC_ONRAMPER_API_KEY` / `PUBLIC_ONRAMPER_ENV` env vars, and any docs/links pointing to it; the feature is unused and represents pure bug surface

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
| Frame the milestone as "stop the bug whackamole at the source," not "fix everything in CONCERNS.md" | The audit covers a lot of ground; outcome-based framing keeps scope honest | — Pending |
| Refactor the full trade-execution backbone (boundary semantics + transaction store + freshness + execution path) as one connected effort | The four pieces are tightly coupled; fixing one without the others leaves the bug factory open | — Pending |
| Observability comes before any refactor | Cannot diagnose "no liquidity" mismatches or validate that a refactor improved anything without monitoring; refactoring blind risks new whackamole on top of old | — Pending |
| Out-of-scope: multi-chain, AA, new features, admin refactor | Each adds bug surface to a system whose core is unstable; expand only after stabilization | — Pending |
| Remove user-facing rewards/leaderboard code; defer internal admin rewards decision to Phase 1 discovery | User-facing is dead and shipping risk; internal is a "nice to have" the team can drop, but worth confirming before deletion | — Pending |
| Done = outcome-based (whackamole stops + ship-without-fear), not metrics or audit-checklist | User explicitly chose outcomes over checklists when offered both | — Pending |
| Coarse phase granularity (3-5 phases, 1-3 plans each) | Solo / 1-2 dev team can't parallelize across many phases; coarse keeps focus | — Pending |

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
*Last updated: 2026-04-28 after initialization*
