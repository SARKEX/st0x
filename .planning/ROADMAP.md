# Roadmap: st0x — Stabilization Milestone

## Overview

Move st0x from "permanent alpha/early-beta" to production-ready by killing the underlying classes of bugs, not whacking individual moles. Four phases progress from "shrink the surface and see what's happening" (so we can diagnose unknown root causes), through the trade-execution backbone refactor (the bug-factory class), to production-grade hardening of secrets/sessions/RPCs, and finally test coverage at the boundaries the audit flagged plus drift cleanup that misleads future contributors. Done is outcome-based: zero user-reported correctness bugs over a sustained window plus internal "confidence to ship features without fear."

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Shrink the Surface, See What's Happening** - Delete dead/unused subsystems and stand up zero-to-one observability so the trade-execution refactor is diagnosable
- [x] **Phase 2: Trade-Execution Backbone Refactor** - Kill the four-piece bug-factory (side semantics, transaction store, freshness illusion, execution math) and hit the trade-page first-paint target
- [ ] **Phase 3: Production-Grade Hardening** - Close the latent security and reliability holes the audit flagged (secrets, sessions, RPC fallback, vendored registry)
- [ ] **Phase 4: Boundary Tests & Drift Cleanup** - Lock in regression coverage at the audit's high-risk boundaries and remove the documentation/code drift that produces silent breakage

## Phase Details

### Phase 1: Shrink the Surface, See What's Happening
**Goal**: Reduce the codebase to what we actually ship and stand up the observability needed to diagnose the unknown root causes (e.g. "no liquidity" mismatches) before any refactor touches the trade-execution path
**Depends on**: Nothing (first phase)
**Requirements**: DEPR-01, DEPR-02, DEPR-03, OBS-01, OBS-02, OBS-03, OBS-04, OBS-05
**Success Criteria** (what must be TRUE):
  1. The team or solo dev can land in production with a "no liquidity" failure report from a user and pull up the captured state at failure (subgraph quote, on-chain state when checked, ratio, slippage cap, side, taker action) from logs alone — no need to ask the user to reproduce
  2. A baseline LCP / CLS / INP / TTFB number for the trade page is visible on a dashboard, so any subsequent refactor can be evaluated against "did the metric actually move"
  3. Per-RPC failure rate across the fallback chain is recorded and an alert fires when the entire chain fails for a single call — silent degradation is no longer possible
  4. Dead code that no user touches has been deleted (user-facing rewards UI, Onramper integration including the unsigned-cookie auth path), and the internal admin rewards/snapshot subsystem has had an explicit keep-or-delete decision applied
  5. Client-side unhandled errors and selected user-visible errors land in an error tracker with sensitive data (wallet addresses, signatures) scrubbed, so previously invisible production failures become countable
**Plans**: 8 plans (7 waves; sequential 1-5 due to .env.example + hooks.server.ts file conflicts; wave 6 runs OBS-03 + OBS-04 in parallel)

**Wave 1**
- [x] 01-01-PLAN.md — DEPR-02: prune admin rewards UI + per-wallet points pipeline + LP_SUBGRAPH_URL

**Wave 2** *(blocked on Wave 1 — both touch `.env.example` and the rewards/admin surface)*
- [x] 01-02-PLAN.md — DEPR-01: delete user-facing rewards UI + extract TokenSwapAnnouncement to announcements/ (per D-16)

**Wave 3** *(blocked on Wave 2 — `+layout.svelte` rewards mounts + `hooks.server.ts:235` rewards carve-out must already be removed)*
- [x] 01-03-PLAN.md — DEPR-03: delete Onramper integration + collapse DepositModal to deposit-only (per D-10)

**Wave 4** *(blocked on Wave 3 — `.env.example` + `hooks.server.ts` are stable post-deletions; Sentry CSP entry can land cleanly)*
- [x] 01-04-PLAN.md — OBS-01: Sentry SDK init + PII scrubber + CSP additions + sourcemap upload

**Wave 5** *(blocked on Wave 4 — pino's request-id middleware sequences in `hooks.server.ts` ahead of the Sentry handle wired in Wave 4)*
- [x] 01-05-PLAN.md — OBS-02: pino structured logger + AsyncLocalStorage request-id middleware

**Wave 6** *(blocked on Wave 5; 01-06 + 01-07 run in parallel — they touch disjoint files)*
- [x] 01-06-PLAN.md — OBS-04: RPC instrumentation in generator.ts + accessCodes.ts + chain-exhausted Slack alerts
- [x] 01-07-PLAN.md — OBS-03: take-order failure transcript at marketOrderExecution.ts (Sentry + console.error per D-15)

**Wave 7** *(blocked on all prior waves — phase-exit verification + runbook)*
- [x] 01-08-PLAN.md — OBS-05 verification + phase exit (Speed Insights confirmation, runbook, cross-cutting cleanup grep)

**Cross-cutting constraints** (truths that appear in 2+ plans — verify they hold across the phase, not just per-plan):
- **CSP host pinning (Pitfall 1):** `src/hooks.server.ts` `connect-src` must NEVER contain bare `'*.sentry.io'` — wildcards don't cross dot boundaries. Use `'*.ingest.sentry.io'` and `'*.ingest.us.sentry.io'` only. Enforced in 01-04 acceptance criteria; 01-08 phase-exit grep gate re-verifies.
- **REL-01 fence (visibility-only):** OBS-04 (01-06) instruments RPC failures but MUST NOT introduce retry-with-backoff in `generator.ts:callRpc`. Retry/backoff is REL-01 in Phase 3. Enforced by negative grep in 01-06 acceptance criteria.
- **D-13 out-of-scope guardrails:** No account abstraction, no multi-chain expansion, no `+error.svelte`, no admin/+page.svelte refactor, no replacement on-ramp, no external log drain. Asserted in 01-01, 01-04, 01-05, 01-06, 01-07 threat models / must_haves.
- **Audit-log non-regression:** No deleted file (DEPR-01/02/03) carries an audit-log call that protects a surviving admin endpoint. Pre-flight grep in RESEARCH §"Deletion Graph" already cleared this; 01-01, 01-02, 01-03 task acceptance re-verifies before delete.
- **Single-chain Base 8453 + two auth paths (CLAUDE.md drift):** Plans treat single-chain Base + wagmi/Dynamic as ground truth; aspirational multi-chain/AA content in CLAUDE.md is ignored until DRIFT-03 in Phase 4.
**UI hint**: yes

Notes:
- DEPR-02 keep-or-delete decision is the first piece of discovery work in this phase (needs internal team confirmation before the snapshot pipeline / cron / KV state is removed). DEPR-01 and DEPR-03 are unconditional deletions and can land independently.
- OBS-03 (take-order failure instrumentation) is the highest-leverage observability piece — it is the prerequisite for diagnosing the freshness illusion that TRADE-03 will fix. Sequence OBS-01/02 first if they're cheaper, but OBS-03 must complete before Phase 2 starts.
- "UI hint: yes" reflects that DEPR-01 deletes user-facing UI and OBS-05 stands up a trade-page web vitals dashboard; this phase is partially user-visible.

### Phase 2: Trade-Execution Backbone Refactor
**Goal**: Kill the underlying bug classes (side inversions, freshness illusions, orchestration cascades, prioritization errors) by refactoring the four tightly-coupled pieces of the trade-execution backbone, and bring the trade page's first paint to an explicit, measured target
**Depends on**: Phase 1 (specifically OBS-03 instrumentation must exist before TRADE-03/04 land, OBS-05 dashboard must exist before PERF-01 can validate against a baseline)
**Requirements**: TRADE-01, TRADE-02, TRADE-03, TRADE-04, PERF-01
**Success Criteria** (what must be TRUE):
  1. A user clicking Buy or Sell at a displayed price gets filled at that price within their slippage tolerance — across Buy, Sell, spend-anchored, and asset-anchored modes — and a regression suite pins each mode crossing each side so the same bug class cannot recur
  2. When the subgraph lags chain truth, the user sees that staleness in the UI before submitting; "no liquidity" failures (when they happen) are predicted, not silent surprises
  3. Direct access to `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex` outside `src/lib/types/orderPerspective.ts` is structurally prevented (lint rule or marker), so the maker/taker INPUT/OUTPUT naming collision can no longer silently invert sides in new code
  4. The `transaction.ts` monolith is split into focused, independently testable state machines (deploy, market-take, approval, partial-fill detection) with the circular-import surface to `marketOrderExecution.ts` structurally eliminated, not patched
  5. Trade-page p75 LCP hits the explicit target set during planning on representative network/device profiles, validated against the OBS-05 baseline dashboard
**Plans**: 8 plans (8 waves; sequential due to file conflicts on transaction.ts during TRADE-02 split + TRADE-* sequencing constraint TRADE-01 → TRADE-02 → TRADE-03 → TRADE-04 → PERF-01)

**Wave 1**
- [x] 02-01-PLAN.md — TRADE-01: ESLint no-restricted-syntax rule + ts-morph codemod migrating 57 raw IO-perspective property reads + 4 accessor wrappers in orderPerspective.ts + lint fixture

**Wave 2** *(blocked on Wave 1 — codemod touches transaction.ts before TRADE-02 split)*
- [x] 02-02-PLAN.md — TRADE-02 PR-1: extract TransactionStatus enum + 6 interfaces + 4 leaf utilities into transactionShared.ts; transaction.ts becomes a re-export façade for back-compat

**Wave 3** *(blocked on Wave 2)*
- [x] 02-03-PLAN.md — TRADE-02 PR-2: extract 5 market-take methods into marketTakeStore.ts + sever last lexical edge by rewiring marketOrderExecution.ts to import directly (not via transaction.ts façade)

**Wave 4** *(blocked on Wave 3 — file conflict on transaction.ts forces serialization with PR-2)*
- [x] 02-04-PLAN.md — TRADE-02 PR-3: extract 10 deploy/wrap/withdraw methods into deployTransactionStore.ts

**Wave 5** *(blocked on Waves 3+4)*
- [x] 02-05-PLAN.md — TRADE-02 PR-4 + PR-5: extract approvalStore.ts + partialFillDetection.ts; tighten orderDeployment.ts return-type annotations to clear the 4 svelte-check baseline errors; transaction.ts shrinks to ≤ 60-line façade

**Wave 6** *(blocked on Wave 5 — marketTakeStore must exist before pre-flight wires through it)*
- [x] 02-06-PLAN.md — TRADE-03: pre-flight multicall via RaindexClient.getOrderQuotesBatch + auto-walk (≤ 2 levels) + transcript.vaultBalance population (closes Phase 1 D-08 LIMITATION) + 3 new failWith call sites raising the OBS-03 grep gate from ≥ 9 to ≥ 12 + D-05 inline terminal-state error in MarketOrder.svelte

**Wave 7** *(blocked on Wave 6 — TRADE-04 priceCap symmetry test references the post-Phase-2 transcript shape)*
- [x] 02-07-PLAN.md — TRADE-04: 16-case parameterized regression matrix in marketOrderFill.test.ts pinning 89571b3's two coupled bug classes (anchor-side selection + asymmetric slippage) + bug class 1 reproduction in marketOrderExecution.test.ts

**Wave 8** *(blocked on Wave 7 — PERF-01 lands LAST per CONTEXT D-08a to avoid bundle-shape changes mid-refactor)*
- [x] 02-08-PLAN.md — PERF-01: rollup-plugin-visualizer + jspdf removal + lazy-load LimitOrder + DcaOrder + chart libs with CLS-safe skeletons + TanStack Query waterfall reorganization (analyzed-not-changed; preserves staleTime: Infinity per T-02-08-03) + Vercel Speed Insights pre-deploy verified via orchestrator API check (hasData=true since 2025-07-21); numeric p75 LCP < 2.5s validation deferred to post-deploy HUMAN-UAT (programmatic read not available on public Vercel API)

**Cross-cutting constraints** (truths that appear in 2+ plans — verify they hold across the phase, not just per-plan):
- **OBS-03 transcript preservation:** Every new error-return path in `marketOrderExecution.ts` routes through `failWith()`. Phase-exit grep `failWith(` count in marketOrderExecution.ts ≥ 12 (Phase 1 baseline 9 + 3 new TRADE-03 paths: preflight_chain_unreachable, preflight_order_vanished, auto_retry_exhausted). Enforced in 02-06 acceptance criteria; cross-cutting check in 02-04, 02-05, 02-07.
- **TRADE-01 lockdown (post-codemod, post-flip):** Raw access grep `\.(inputTokenAddress|outputTokenAddress|inputIOIndex|outputIOIndex)\b` returns 0 hits in src/ + tests/ outside the allowlist (orderPerspective.ts, utils/orderbook.ts, api/orders.ts, generated-graphql.ts, the io-perspective-violation.ts fixture, and comment-only matches). Enforced 02-01 + re-verified at every subsequent plan that touches the codemod surface.
- **Circular import absence:** `grep -E "from ['\"]\$lib/stores/transaction['\"]" src/lib/services/marketOrderExecution.ts` MUST return 0 lines. The `marketTakeStore.ts` consumes the orchestration helpers without `marketOrderExecution.ts` importing back. Enforced 02-03 + re-verified at every subsequent plan that touches marketOrderExecution.ts.
- **D-13 out-of-scope guardrails (carried from Phase 1):** No account abstraction. No multi-chain expansion. No `+error.svelte`. No admin/+page.svelte refactor. No replacement on-ramp. No external log drain. No SSR for trade page (D-08 explicit).
- **WasmEncodedResult discipline:** All SDK calls (orderDeployment + new pre-flight in TRADE-03) check `.error` before reading `.value`. Pattern from `src/lib/services/orderDeployment.ts:188-193`. Enforced 02-05 + 02-06.
- **TransactionStatus UI binding preservation:** The façade re-export pattern preserves all existing UI bindings (`import transactionStore, { TransactionStatus } from '$lib/stores/transaction'` continues to resolve) during the TRADE-02 migration. Phase-exit grep `import.*TransactionStatus.*from '\$lib/stores/transaction'` MUST still return ≥ 2 hits (TransactionModal.svelte + others) at Phase 2 close.
- **Slippage + pre-flight coexistence:** D-03 rationale (pre-flight catches "order isn't there anymore"; slippage catches "price moved within an order"). Documented in 02-06 plan body so future contributors don't try to remove one or the other.
- **Real-money rollout (D-08 / specifics):** TRADE-02 PR-2 (marketTakeStore extract) is the highest-risk PR — manual smoke test in 02-VALIDATION.md "Manual-Only Verifications" gates real-money rollout before subsequent PRs flip authority.
- **TanStack Query staleTime: Infinity (do not weaken):** PERF-01 query-waterfall reorganization parallelizes/prefetches but DOES NOT reduce staleTime. Manual-invalidation pattern is intentional per CLAUDE.md ground truth. Enforced in 02-08.
- **Single-chain Base 8453 + two auth paths (CLAUDE.md drift):** Plans treat single-chain Base + wagmi/Dynamic as ground truth; aspirational multi-chain/AA content in CLAUDE.md is ignored until DRIFT-03 in Phase 4.
**UI hint**: yes

Notes:
- TRADE-01 (codify side semantics) is the prerequisite for TRADE-02 (split transaction.ts) which feeds into TRADE-03 (pre-flight check) and TRADE-04 (execution math correctness). Plans must respect this chain — do not let plan ordering scatter them.
- The refactor must ship in pieces against live users on real money: PR-by-PR atomic shape with façade preservation through TRADE-02; svelte-check + tests green at every commit; manual smoke test gates PR-2 (marketTakeStore extraction) before subsequent PRs land.
- PERF-01's specific p75 LCP threshold (< 2.5s on /trade/[id], Web Vitals "good") was locked in 02-CONTEXT.md D-07. Pre/post measurement against the OBS-05 Vercel Speed Insights dashboard.
- "UI hint: yes" — TRADE-03 (D-05 inline terminal-state error in MarketOrder.svelte) and PERF-01 (lazy-load tabs with skeletons) are direct user-facing UI work.

### Phase 3: Production-Grade Hardening
**Goal**: Close the latent security and reliability gaps the audit flagged so that no single environmental failure (committed key leak, missing env var, RPC misbehavior, GitHub raw outage) can cause a user-visible outage or expose an unauthenticated attack path
**Depends on**: Phase 2 (Phase 2 isn't a hard prerequisite for the work itself, but ordering Phase 3 after it keeps the trade-execution refactor from racing with session/CSRF cookie changes that touch the same client surface)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, REL-01, REL-02, REL-03
**Success Criteria** (what must be TRUE):
  1. No production secret (Alchemy key, session secret, CSRF secret) appears in source; missing required secrets cause the module to throw at load in production rather than fall back to a hardcoded default; the previously committed Alchemy key has been rotated
  2. Wallet identity on the server is established via a server-issued, HttpOnly + Secure + SameSite=Strict session cookie tied to a verified wallet signature; the spoofable client-set `wallet-address` cookie is no longer accepted as proof of ownership in any surviving endpoint
  3. CSRF tokens are bound to the session cookie (double-submit-cookie pattern) and access/referral codes are generated from `crypto.randomBytes()` — none of these auth-adjacent paths uses `Math.random()` or stateless tokens issued by an unauthenticated endpoint anymore
  4. Heavy/admin endpoints (`/api/snapshots/preview*`, `POST /api/snapshots/generate`) cannot be DoS'd or invoked by non-admins; hCaptcha fails closed in Vercel preview deploys, not just production
  5. The RPC fallback chain (in `generator.ts` and EIP-1271/6492 verification) retries each RPC with backoff, treats empty `result` as failure, never silently substitutes `latestBlock`, and the Rain strategies registry is served from our own bundle — order deployment no longer depends on GitHub raw availability or rate limits
**Plans**: 11 plans (8 waves; SEC-03+SEC-04 paired in Wave 6 per CONTEXT D-01; 03-08 split into 03-08a + 03-08b per checker fix #5 — both ship as a single atomic-flip PR, atomic-flip discipline preserved at PR-shape per Phase 2 D-08 pattern)

**Wave 1** *(SEC-01 unblocks REL-02 by provisioning BASE_RPC_URL env var)*
- [x] 03-01-PLAN.md — SEC-01: Alchemy key removal + env-var swap (networks.ts + raindex.ts + accessCodes.ts + referrals.ts) + .env.example

**Wave 2** *(quick wins; 03-03 and 03-04 sequence after 03-01 due to accessCodes.ts file-modification chain)*
- [ ] 03-02-PLAN.md — SEC-02: auth.ts + csrf.ts module-load fail-closed (mirrors CRON_SECRET precedent) — independent of 03-01
- [ ] 03-03-PLAN.md — SEC-05: crypto.randomBytes + rejection sampling for accessCodes + referrals — depends_on: [03-01]
- [ ] 03-04-PLAN.md — SEC-07: hCaptcha VERCEL_ENV-based fail-closed (preview no longer bypasses) — depends_on: [03-01, 03-03]

**Wave 3**
- [ ] 03-05-PLAN.md — SEC-06: snapshotsPreview tier on rateLimit.ts + applyTieredRateLimit on preview/preview-stream + requireAdmin on POST generate

**Wave 4** *(REL-01 retry pattern unblocks REL-02)*
- [ ] 03-06-PLAN.md — REL-01: generator.ts callRpc per-RPC withRetry + chain-exhaustion throw + kill silent latestBlock fallback in getBlockNumberForTimestamp

**Wave 5** *(depends on Wave 1 SEC-01 env var + Wave 4 retry pattern)*
- [ ] 03-07-PLAN.md — REL-02: viem fallback transport for accessCodes.ts verifyWalletSignature; OBS-04 label rename to fallback-chain-base

**Wave 6** *(SEC-03 + SEC-04 paired atomic flip; manual smoke gate; 03-08a + 03-08b ship as a single PR per Phase 2 D-08 atomic-flip-PR-shape pattern)*
- [ ] 03-08a-PLAN.md — SEC-03 + SEC-04 infrastructure: walletSession.ts + session_login challenge + /api/auth/session + /api/auth/logout + session-bound CSRF + GET /api/auth/csrf gate
- [ ] 03-08b-PLAN.md — SEC-03 consumer migration: hooks.server.ts (async getWalletFromRequest) + logger.ts + /api/access/check + /access/+page.server.ts + snapshot preview/preview-stream consumer migration + +layout.svelte hint downgrade + manual smoke checkpoint — depends_on: [03-08a]

**Wave 7**
- [ ] 03-10-PLAN.md — REL-03: vendor static/registry/ from upstream commit 9dd64902; orderDeployment.ts swap to same-origin /registry

**Wave 8** *(phase-exit + RUNBOOK)*
- [ ] 03-11-PLAN.md — Phase-exit grep gates + 03-RUNBOOK.md (env-var checklist + Alchemy rotation + session smoke + smoke-test KV cleanup + registry refresh + Phase 4 hand-off) — depends_on: all 10 prior plans

**Cross-cutting constraints** (truths that appear in 2+ plans):
- **D-04b hard UX guarantee:** wallet signature is per-session, never per-request. hooks.server.ts reads cookie+KV only; never calls verifyWalletSignature on per-request path. Plan 03-08b manual smoke is the gate.
- **OBS-04 carry-forward:** every retry attempt in generator.ts records via recordRpcAttempt; chain exhaustion fires reportChainExhausted (Telegram alert via Plan 01-06 surface unchanged).
- **TRADE-01 / TRADE-02 / OBS-03 lockdown:** no Phase 3 work touches marketOrderExecution.ts, transaction.ts, or orderPerspective.ts; failWith() count ≥ 12 carried forward; 02-08 cross-cutting gates re-verified at 03-11 phase exit.
- **Single Alchemy key both sides (D-02):** PUBLIC_BASE_RPC_URL = BASE_RPC_URL = same Alchemy app. Splitting into two apps is deferred unless quota abuse becomes measurable.
- **Atomic flip for SEC-03+SEC-04 (D-04):** single coupled PR. One-time wallet-signature prompt at deploy; never per-request. wallet-address cookie downgraded to non-authoritative hint.
- **Single-chain Base 8453 + two auth paths:** treat .planning/codebase/ as ground truth; CLAUDE.md aspirational multi-chain/AA content ignored until DRIFT-03 in Phase 4.
**UI hint**: yes (one-time wallet-signature prompt on next visit post Wave 6 deploy; +layout.svelte comment downgrade)

Notes:
- SEC-03 (session cookie) and SEC-04 (CSRF binding) are coupled and should ship together. SEC-01 (Alchemy key) and SEC-02 (session/CSRF secret fallbacks) are independent and can land first as quick wins.
- REL-01 and REL-02 share the fallback-RPC-with-retry pattern; the work in REL-01's `callRpc` rewrite directly enables REL-02's signature-verification fix.
- Several requirements in this phase touch survivors of Phase 1's deprecation decisions (e.g. SEC-06 only matters if DEPR-02 retained the snapshot pipeline). Plan-phase should re-confirm scope against Phase 1 outcomes.

### Phase 4: Boundary Tests & Drift Cleanup
**Goal**: Lock in regression coverage at the audit's high-risk untested boundaries and eliminate the code/documentation drift that misleads future contributors and produces low-grade silent breakage
**Depends on**: Phase 3 (TEST-01 covers `hooks.server.ts` paths that are still being modified by SEC-03/SEC-04; running it after Phase 3 ensures the tests pin the final shape, not an interim shape)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, DRIFT-01, DRIFT-02, DRIFT-03
**Success Criteria** (what must be TRUE):
  1. The auth/CORS/CSP layering in `hooks.server.ts` has integration tests covering public-path / admin / wallet-registration classification across representative request shapes — a regression that silently exposes an admin endpoint or breaks login flow now fails CI rather than reaching production
  2. The full market-order path through `marketOrderExecution.ts` + `transaction.ts` (aggregated → fallback → per-order, hydration failures, stale-session recovery) has integration coverage; partial-fill misclassification or path-ordering regressions are caught in CI
  3. Every state-mutating admin endpoint (rewards-pool, snapshots, swap-snapshot, tvl, wallet-statement, wallets, team-wallets, excluded-wallets, pool-wallets, nansen, plus survivors of DEPR-02) calls `createAuditLogger` and a test asserts the audit record is emitted on success and failure — admin actions can be reconstructed from logs
  4. Token lookups that have to handle the wrapped/unwrapped/legacy address triplet go through `getTokenByAnyAddress`, scattered hardcoded USDC constants are replaced with `isPaymentToken` / `getPaymentTokensForNetwork`, and a guard (ESLint rule or comment marker) prevents either pattern from regressing
  5. `CLAUDE.md` describes only what's actually shipped — single chain (Base 8453), two auth paths, no Rhinestone / EIP-7702 / `account-abstraction/` — and points at `.planning/codebase/CONCERNS.md` so future contributors land on accurate context
**Plans**: TBD

Notes:
- TEST-04 is conditional: if Phase 1's DEPR-02 decision was "remove," TEST-04 is closed by deletion (no new tests needed); if "keep with bandages," scraper edge-case tests must be written. Plan-phase resolves this against Phase 1 outcomes.
- TEST-03's coverage goals overlap with TRADE-04's regression suite from Phase 2. The Phase 2 suite covers each mode × each side; Phase 4's TEST-03 focuses on the orchestration path (aggregated → fallback → per-order, hydration failures, stale session) — distinct work, do not duplicate.
- DRIFT-01..03 are low-risk cleanups suitable for landing in small PRs at any point in the phase.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shrink the Surface, See What's Happening | 8/8 | Complete | 2026-04-29 |
| 2. Trade-Execution Backbone Refactor | 8/8 | Complete | 2026-04-29 |
| 3. Production-Grade Hardening | 1/11 | In progress | - |
| 4. Boundary Tests & Drift Cleanup | 0/TBD | Not started | - |
