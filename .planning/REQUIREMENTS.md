# Requirements: st0x — Stabilization Milestone

**Defined:** 2026-04-28
**Core Value:** A user clicking Buy or Sell gets correct, predictable execution at the price and size they were shown — every time.

## v1 Requirements

Requirements for the stabilization milestone. Each maps to exactly one roadmap phase.

### Observability

Foundational visibility that must come before refactor work, so we can both diagnose unknown root causes (e.g. "no liquidity" mismatches) and validate that subsequent changes actually improve the metric.

- [ ] **OBS-01**: Client-side error tracking is wired into the SvelteKit app with sensitive-data scrubbing (wallet addresses + signatures redacted), capturing unhandled errors, promise rejections, and selected user-visible errors with breadcrumbs
- [ ] **OBS-02**: Server-side structured logging is in place across SvelteKit endpoints (`src/routes/api/`), the cron entry point, and the take-order critical path, with consistent fields (request id, wallet, route, latency) and minimum log levels by route class
- [ ] **OBS-03**: Take-order failure instrumentation captures the state at failure (subgraph quote, on-chain state when checked, ratio, slippage cap, side, taker action) so "no liquidity" and partial-fill misclassifications become diagnosable from logs alone
- [ ] **OBS-04**: RPC failure metrics record per-RPC failure rate across the fallback chain (`generator.ts`, `accessCodes.ts`), with alerting when the entire chain fails for a single call
- [ ] **OBS-05**: Trade-page web vitals dashboard exists (LCP, CLS, INP, TTFB at minimum) so first-paint regressions are visible against a baseline

### Trade Execution

The bug-factory class. Refactor four tightly-coupled pieces of the trade-execution backbone so the underlying bug classes (side inversions, freshness illusions, orchestration cascades, prioritization errors) cannot recur — not just the specific instances we've already fixed.

- [ ] **TRADE-01**: INPUT/OUTPUT taker-vs-maker side semantics are codified through a single source of truth (`src/lib/types/orderPerspective.ts`); raw `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex` access outside the helpers is banned (lint rule or comment marker); every boundary has unit-test coverage that pins the side
- [ ] **TRADE-02**: `src/lib/stores/transaction.ts` (2373 lines) is split into focused, independently testable state machines for deploy, market-take, approval, and partial-fill detection; the circular import surface with `marketOrderExecution.ts` is structurally eliminated (not just patched as it was in commit 89571b3)
- [ ] **TRADE-03**: Market-order submission performs an on-chain pre-flight check (multicall against current orderbook state) before submitting take-orders; UI staleness is visible to the user when the subgraph lags chain truth, so "no liquidity" failures stop being silent surprises
- [ ] **TRADE-04**: Market-order execution math is provably symmetric across Buy / Sell / spend-anchored / asset-anchored modes — slippage-cap derivation, ratio multipliers, and order prioritization produce equivalent semantics; regression tests exist for each mode crossing each side

### Performance

User-visible latency that drives bounce on the only page that actually matters for trading.

- [ ] **PERF-01**: Trade-page first-paint hits an explicit target (specific p75 LCP threshold to be set in planning) on representative network/device profiles; achieved through some combination of SSR/streaming, query-waterfall reduction, and bundle pruning, validated against the OBS-05 dashboard

### Security

Latent risks the audit (`.planning/codebase/CONCERNS.md`) flagged. Not yet exploited but each represents a real attack path.

- [ ] **SEC-01**: Hardcoded Alchemy API key is removed from source (`raindex.ts`, `networks.ts`, `accessCodes.ts`) and replaced with environment variables (`PUBLIC_BASE_RPC_URL` for client, `BASE_RPC_URL` for server); the existing committed key is rotated on deploy
- [ ] **SEC-02**: `SESSION_SECRET` and CSRF-secret fallback strings are removed; missing secrets cause the module to throw at load time in production (mirror the pattern already used for `CRON_SECRET`)
- [ ] **SEC-03**: A server-issued session cookie (HttpOnly + Secure + SameSite=Strict) is bound to a verified wallet signature (extending the `signatureChallenge.ts` flow); the existing `wallet-address` cookie is downgraded to a non-authoritative hint and no longer accepted as proof of ownership in any remaining endpoints (`/api/access/check` plus any others surviving the deprecations in DEPR-01..DEPR-03)
- [ ] **SEC-04**: CSRF tokens are bound to the session cookie via the double-submit-cookie pattern (server-issued session-id, validated on each CSRF-protected call) instead of being stateless and issued by an unauthenticated endpoint
- [ ] **SEC-05**: Access codes (`accessCodes.ts`) and referral codes (`referrals.ts`) are generated with `crypto.randomBytes()` and rejection-sampled into the alphabet — `Math.random()` is removed from these paths
- [ ] **SEC-06**: `/api/snapshots/preview` and `/api/snapshots/preview-stream` have tiered rate limiting applied (`applyTieredRateLimit`); `POST /api/snapshots/generate` is admin-gated (`requireAdmin`)
- [ ] **SEC-07**: hCaptcha verification fails closed in non-production environments where `HCAPTCHA_SECRET` is missing on Vercel preview deploys (not just `process.env.NODE_ENV === 'production'`)

### Reliability

Failure modes that have caused user-visible outages or silent data corruption.

- [ ] **REL-01**: The RPC fallback chain in `src/lib/server/snapshots/generator.ts` retries each RPC with backoff, treats empty `result` fields as failure, and never silently falls back to `latestBlock` when all RPCs misbehave during `getBlockNumberForTimestamp`
- [ ] **REL-02**: EIP-1271 / EIP-6492 signature verification in `accessCodes.ts` uses the same fallback RPC chain (with retry) as the snapshot generator, instead of a single hardcoded Alchemy RPC
- [ ] **REL-03**: The Rain strategies registry is vendored into the bundle (`/static/registry/` or compiled-in) instead of being fetched live from GitHub raw at a pinned commit, so order deployment no longer depends on external SaaS availability or rate limits

### Test Coverage

Coverage at the boundaries that the audit flagged as both high-risk and currently untested.

- [ ] **TEST-01**: Integration tests for `src/hooks.server.ts` exercise public-path / admin / wallet-registration classification, CORS, CSP, and bot-rejection ordering across representative request shapes
- [ ] **TEST-02**: Admin endpoints have audit-log coverage — every admin endpoint that mutates state (rewards-pool, snapshots, swap-snapshot, tvl, wallet-statement, wallets, team-wallets, excluded-wallets, pool-wallets, nansen, plus any survivors of DEPR-02) calls `createAuditLogger`; a test asserts each handler emits an audit record on success and failure
- [ ] **TEST-03**: Integration tests cover the full market-order path through `marketOrderExecution.ts` + `transaction.ts` for aggregated → fallback → per-order, hydration failures, and stale-session recovery
- [ ] **TEST-04**: If the rewards/snapshot subsystem is retained per DEPR-02, snapshot scraper edge cases (pagination boundaries, legacy `wrappedTokenTransfers` fallback, transient subgraph failure) get test coverage; if removed, this requirement is closed by deletion

### Drift

Documentation and code drift that misleads future contributors and produces low-grade silent breakage.

- [ ] **DRIFT-01**: Direct `TOKENS.find(...)` lookups against the wrapped address only are replaced with `getTokenByAnyAddress(addr)` in `tradeTransform.ts`, `api/orders.ts`, `api/subgraph.ts`, `oracleQuotes.ts`, `priceFeeds.ts`, `QuickTrade.svelte`, `LimitOrder.svelte`, and `DcaOrder.svelte`; an ESLint rule or comment marker prevents recurrence outside the canonical lookup module
- [ ] **DRIFT-02**: Hardcoded USDC address constants in `admin/+page.svelte` and `api/admin/nansen/+server.ts` are replaced with `isPaymentToken(addr, network)` / a new `getPaymentTokensForNetwork(network)` helper resolved from `src/lib/config/tokens.ts`
- [ ] **DRIFT-03**: `CLAUDE.md` is rewritten to match actual code — single chain (Base 8453), two auth paths (wagmi + Dynamic embedded), no Rhinestone / EIP-7702 / `account-abstraction/` directory; this file is added as a counterweight pointer to `.planning/codebase/CONCERNS.md`

### Unused-Subsystem Deprecation

Three subsystems that ship but no longer earn their bug surface: dead user-facing rewards UI, internal "nice to have" admin/rewards views, and the entire Onramper fiat on-ramp. Removing these eliminates whole bug categories before we even touch the trade-execution refactor.

- [x] **DEPR-01**: User-facing rewards code is removed: leaderboard pages, monthly points UI, statement views, public rewards APIs that feed the user UI, leaderboard polling — anything users currently see (which is all dead) is deleted, not gated **[Completed 01-02, 2026-04-29: 3 rewards components, rewardsStore.ts, 4 rewards APIs, and 3 public-rewards APIs deleted; TokenSwapAnnouncementModal preserved per D-16 in new src/lib/components/announcements/ + announcementStore.ts; Pitfall 8 carve-out closed in hooks.server.ts]**
- [x] **DEPR-02**: Internal admin rewards/TVL views (`admin/rewards/+page.svelte` 4933 lines, the rewards section of `admin/+page.svelte`) and the snapshot pipeline (`src/lib/server/snapshots/`, the cron, the KV state) are either fully removed (preferred — eliminates the bug surface) or explicitly retained with bandages applied (per-RPC retry, rate limits, monitoring) — decision made during Phase 1 discovery after confirming with the internal team **[Completed 01-01: admin rewards UI deleted; snapshot pipeline RETAINED per D-01 (feeds admin TVL/volume views); per-wallet points step deleted per D-03; LP_SUBGRAPH_URL wiring removed per D-05]**
- [ ] **DEPR-03**: Onramper fiat on-ramp integration is fully removed — `OnramperModal.svelte`, `/api/onramper/sign-url/+server.ts`, related routes/links/docs, and the `ONRAMPER_SECRET_KEY` / `PUBLIC_ONRAMPER_API_KEY` / `PUBLIC_ONRAMPER_ENV` env vars; the feature is unused and represents pure bug surface (including the unsigned-cookie auth path flagged in CONCERNS.md security)

## v2 Requirements

(None for this milestone — see Out of Scope for explicit deferrals.)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-chain expansion (Arbitrum / Optimism / Ethereum mainnet) | `CLAUDE.md` mentions this but only Base exists in code; stabilizing one chain comes first. Multi-chain requires a separate milestone after the bug factory is closed. |
| Account abstraction (Rhinestone SDK / EIP-7702 / USDC gas sponsorship) | `CLAUDE.md` drift; no AA code exists. Adding AA on top of an unstable trade-execution backbone would multiply bug surface. |
| New features, asset classes, or order types | No perps, options, advanced order types, new tokens, or new asset categories during stabilization. Stabilize what exists; expand later. |
| Admin-page architectural refactor | `admin/+page.svelte` (2898 lines) and `admin/rewards/+page.svelte` (4933 lines) are bloated but internal-only. Not user-visible; deferred to a separate cleanup milestone unless DEPR-02 eliminates one as a side effect. |
| Mobile app | Web-only for this milestone. |
| Compliance / regulatory programs (KYC, AML, tax reporting infra beyond what already exists) | Not on the bug-whackamole critical path. |
| Replacing `svelte-wagmi` shim with direct wagmi-core | Listed in audit as "dependency at risk" but doesn't currently produce user-visible bugs; defer unless wagmi/svelte-wagmi drift breaks something during this milestone. |
| Comprehensive snapshot/cron rearchitecture (Inngest, Trigger.dev, dedicated worker) | Only relevant if DEPR-02 retains the subsystem; covered there with a "harden in place" approach, not a re-platform. |
| Onramper fiat on-ramp (and any replacement on-ramp integration) | Currently shipped but unused; being removed in this milestone via DEPR-03. Not part of go-forward scope. |

## Traceability

Populated by the roadmapper agent on 2026-04-28. All 30 v1 requirements mapped across 4 phases.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBS-01 | Phase 1 | Pending |
| OBS-02 | Phase 1 | Pending |
| OBS-03 | Phase 1 | Pending |
| OBS-04 | Phase 1 | Pending |
| OBS-05 | Phase 1 | Pending |
| TRADE-01 | Phase 2 | Pending |
| TRADE-02 | Phase 2 | Pending |
| TRADE-03 | Phase 2 | Pending |
| TRADE-04 | Phase 2 | Pending |
| PERF-01 | Phase 2 | Pending |
| SEC-01 | Phase 3 | Pending |
| SEC-02 | Phase 3 | Pending |
| SEC-03 | Phase 3 | Pending |
| SEC-04 | Phase 3 | Pending |
| SEC-05 | Phase 3 | Pending |
| SEC-06 | Phase 3 | Pending |
| SEC-07 | Phase 3 | Pending |
| REL-01 | Phase 3 | Pending |
| REL-02 | Phase 3 | Pending |
| REL-03 | Phase 3 | Pending |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 (conditional on DEPR-02) | Pending |
| DRIFT-01 | Phase 4 | Pending |
| DRIFT-02 | Phase 4 | Pending |
| DRIFT-03 | Phase 4 | Pending |
| DEPR-01 | Phase 1 | Complete (01-02, 2026-04-29) |
| DEPR-02 | Phase 1 | Complete (01-01, 2026-04-29) |
| DEPR-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30 ✓
- Unmapped: 0
- By phase: Phase 1 = 8 (DEPR-01..03, OBS-01..05); Phase 2 = 5 (TRADE-01..04, PERF-01); Phase 3 = 10 (SEC-01..07, REL-01..03); Phase 4 = 7 (TEST-01..04, DRIFT-01..03)

---
*Requirements defined: 2026-04-28*
*Last updated: 2026-04-28 after roadmapper phase mapping*
