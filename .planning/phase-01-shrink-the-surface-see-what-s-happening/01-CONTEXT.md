# Phase 1: Shrink the Surface, See What's Happening - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Two coupled outcomes:

1. **Reduce bug surface.** Delete dead user-facing rewards (DEPR-01); delete the entire Onramper fiat on-ramp (DEPR-03); surgically prune the rewards layer while keeping the snapshot pipeline that feeds admin TVL + trade volume views (DEPR-02).
2. **Stand up zero-to-one observability** so Phase 2's trade-execution refactor is diagnosable: client-side error tracking with PII scrubbing (OBS-01); structured server logs across SvelteKit endpoints, the cron, and the take-order critical path (OBS-02); take-order failure transcripts that let a dev cold-replay a "no liquidity" report from logs alone (OBS-03); per-RPC failure metrics + alerting when the full fallback chain fails on a single call (OBS-04); trade-page web vitals via Vercel Speed Insights (OBS-05).

This phase **does not refactor trade execution** (Phase 2), **does not fix RPC retry behavior** (Phase 3 — REL-01/02), **does not vendor the Rain strategies registry** (Phase 3 — REL-03), and **does not add tests** (Phase 4 — TEST-*). Phase 1 makes the codebase smaller and visible. That's it.

</domain>

<decisions>
## Implementation Decisions

### DEPR-02 Surgery Boundary

- **D-01:** Delete the rewards layer; keep the snapshot pipeline. "Rewards layer" = user-facing rewards UI (already covered by DEPR-01), `src/routes/admin/rewards/+page.svelte` (4933 lines), rewards leaderboard polling, rewards public APIs (`/api/rewards/*`, `/api/public/wallet/*`), and rewards-specific snapshot consumers. "Snapshot pipeline" = `src/lib/server/snapshots/{scraper,generator,pyth,processor}.ts`, the Vercel cron at `/api/cron/snapshots`, the KV state for the snapshot blocks list, and the Vercel Blob writes — all retained because they feed TVL, total trade volume, per-token TVL, and per-token trade volume views in the internal admin tree. **Consequence:** SEC-06 (rate limiting + admin gate on `/api/snapshots/*`), REL-01 (RPC fallback retry in `generator.ts`), and TEST-04 (snapshot scraper edge cases) survive in Phase 3/4 against the retained subsystem.

- **D-02:** Nansen integration stays — **all surfaces kept**. `src/lib/server/nansenTiers.ts`, public `/api/nansen/tiers` (1-hour cached via `withCache`), and admin `/api/admin/nansen` all remain. Rationale: admin uses Nansen tiers to classify wallet activity in the `admin/+page.svelte` activity tab, not just for rewards weighting. CSP entry stays.

- **D-03:** Delete the per-wallet monthly points calculation entirely from `src/lib/server/snapshots/processor.ts`. `generator.ts` produces only TVL + total volume + per-token TVL + per-token volume aggregates going forward. Faster cron, smaller blobs, no orphan code.

- **D-04:** Existing Vercel Blob snapshots at `snapshots/{tokenSymbol}/{blockNumber}.json` that contain points/rewards fields are **left as-is**. No backfill, no wipe. New blobs going forward use the pruned schema. Historical TVL series stays readable; the unused fields are ignored. Document this in the code comment so future contributors don't try to clean it up.

- **D-05:** Delete the LP attribution subgraph wiring. Remove `LP_SUBGRAPH_URL` from `.env.example` + Vercel project env; remove all consumers; the subgraph URL slug `st0x-rewards-base/1.0.23` confirms it was rewards-only.

- **D-14:** Referrals (`src/lib/server/referrals.ts`, `/api/referrals/*`) are **kept**. They are access-onboarding (waitlist gate), not rewards. SEC-05 in Phase 3 handles the `Math.random()` → `crypto.randomBytes()` hardening separately.

### Observability Stack (locked Claude's Discretion)

- **D-06:** OBS-01 — **Sentry** (SaaS) for client error tracking. Use the SvelteKit SDK (`@sentry/sveltekit`); wire `Sentry.init` in `src/routes/+layout.svelte` (or `src/hooks.client.ts`) and `Sentry.handleErrorWithSentry` in `src/hooks.server.ts`. Free tier (5K errors/month) covers the solo team. PostHog stays for product analytics — **not** repurposed for errors. PII scrubbing via `beforeSend`: regex denylist for `0x[a-f0-9]{40}` (wallet addresses), `0x[a-f0-9]{130}` (signatures), and URL `?signature=...` params. CSP `connect-src` extended to `*.sentry.io` (and the sourcemap-upload host during build). Source maps uploaded at build time via the SvelteKit Sentry plugin. **No `+error.svelte` user-visible page in this phase** (deferred per UI-SPEC Q3).

- **D-07:** OBS-02 — **pino** for structured server logging. JSON output. Request-id injected by middleware in `src/hooks.server.ts` (UUID v4 per request, propagated via async-local-storage so handlers + downstream calls in `accessCodes.ts` / `generator.ts` / `marketOrderExecution.ts` server paths share the same id). **Destination: Vercel Logs only for v1** — pino writes to stdout, Vercel captures it. No external drain (Better Stack / Axiom / Datadog) in this phase. Required fields: `request_id`, `wallet` (lowercased, scrubbed in error contexts), `route`, `method`, `status`, `latency_ms`, `level`, `msg`, `error.*` on errors. Minimum log levels by route class: `/api/cron/*` = info; `/api/admin/*` = info; `/api/access/*` = info; `/api/snapshots/*` = warn (to keep the noisy preview path quiet); take-order critical path in `marketOrderExecution.ts` = info on success, error on failure (always with the OBS-03 transcript fields).

- **D-08:** OBS-03 — Capture take-order failure transcript at the `src/lib/services/marketOrderExecution.ts` aggregated/fallback boundary (around `filterQuotesForSide` + `executeMarketOrder`). Write to **both** sinks: (a) `Sentry.captureException(err, { extra: {...transcript} })` for immediate alerting + breadcrumb context, (b) a single `logger.error('take-order failed', {...transcript})` line through pino for long-term searchability. **Transcript fields:** `subgraphQuoteHash`, full quote payload, on-chain state read (`orderHash`, vault balance, IOIndex), `ratio`, `slippageBps`, `priceCap`, `side` (`bid` | `ask`), `takerAction` (`Buy` | `Sell`), `userAction`, `mode` (anchored type), `walletAddress` (scrubbed in Sentry only — full address allowed in pino server logs since they're admin-only), `timestamp`. **Acceptance test:** a dev given a single failure log entry can re-run the exact subgraph quote + on-chain state read without contacting the user.

- **D-09:** OBS-04 — Per-RPC failure metric: increment a counter (logged as a structured pino line `{event: 'rpc_failed', rpc_url, fn, status_or_error}`) on every RPC call failure in `src/lib/server/snapshots/generator.ts:19-35` (`callRpc`) and `src/lib/server/accessCodes.ts:64-85` (signature verification). Counts are derived via Vercel Logs query (no separate metrics store). **Alert delivery:** synchronous Slack incoming webhook on every chain-exhausted call (every iteration of the fallback chain failed for a single logical call). New env var `OBSERVABILITY_ALERT_WEBHOOK_URL`. **No rollup window** — solo team, chain-exhaust is rare; if it gets noisy, add a dedupe window in a later phase. Alert payload includes: function name, attempted RPC list, last error per RPC, request_id (so the dev can grep the surrounding context).

### UI Surface (carried from UI-SPEC)

- **D-10:** DepositModal collapses **directly to deposit-only** when Onramper is removed. No chooser, no "Add Funds" landing screen, no placeholder tile. Modal title becomes "Deposit". Body: "Send {token} on Base to this address. Funds will appear in your st0x balance once confirmed." (See `01-UI-SPEC.md` for the full copy contract.)

- **D-11:** OBS-05 — **Vercel Speed Insights** is the trade-page web vitals dashboard. It is already injected via `@vercel/speed-insights/sveltekit` after consent (`src/lib/components/CookieConsent.svelte` gates injection). No new st0x UI in this phase. Document the dashboard URL in a phase runbook for the team. **Action item for planner:** confirm Speed Insights is actually receiving data (not blocked by consent for everyone) before declaring OBS-05 done.

- **D-12:** OBS-01 ships **SDK integration only** this phase. No `+error.svelte` page. User-visible error UX deferred to a later phase if needed.

### Phase Scope Guardrails

- **D-13:** Out-of-scope per `.planning/PROJECT.md` and `.planning/REQUIREMENTS.md` — and explicitly **not** widened by Phase 1: no account abstraction, no multi-chain expansion, no architectural refactor of `src/routes/admin/+page.svelte` (2898 lines stays untouched even after `admin/rewards/+page.svelte` is deleted), no replacement on-ramp, no new auth method, no `+error.svelte`, no external log drain. Anything that drifts here gets bounced to Deferred Ideas.

### Claude's Discretion

The following are owned by the planner / executor; the user has not constrained them:

- File-level placement of new modules (e.g., where Sentry init lives — `src/hooks.client.ts` vs an existing client entry; which directory the new pino logger module sits in — `src/lib/server/logger.ts` is the natural slot).
- Exact npm package versions (use latest stable + Sentry's documented Svelte 4 / SvelteKit 2 compatibility matrix).
- Sequencing inside the phase (deletions vs observability vs DepositModal collapse) — planner decides waves; ROADMAP guidance is "OBS-03 must complete before Phase 2 starts; sequence OBS-01/02 first if cheaper."
- Whether the Slack alert webhook (D-09) reuses the team's existing Slack workspace or asks for a new channel — operational detail, captured at deploy time.
- Naming for the request-id middleware and async-local-storage helper.
- Whether to delete each rewards file in a single PR or split across small atomic commits — the GSD plan-phase will pick.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Planning

- `.planning/ROADMAP.md` §"Phase 1: Shrink the Surface, See What's Happening" — phase goal, success criteria (5 bullets), `Depends on: Nothing`, `Requirements: DEPR-01, DEPR-02, DEPR-03, OBS-01, OBS-02, OBS-03, OBS-04, OBS-05`, sequencing notes (OBS-03 prerequisite for Phase 2; OBS-01/02 first if cheaper).
- `.planning/REQUIREMENTS.md` — full text of all 8 phase REQ-IDs (DEPR-01..03, OBS-01..05). Researcher and planner must address every REQ-ID; checker enforces coverage.
- `.planning/PROJECT.md` — milestone constraints (single chain, real-money users, solo / 1-2 dev team, no fixed deadline, observability stack starts from zero), Key Decisions table (especially "observability before refactor" + "outcome-based done").
- `.planning/STATE.md` — current position, blockers (DEPR-02 internal-team confirmation **resolved this session** — see D-01).

### Codebase Audit

- `.planning/codebase/CONCERNS.md` — full audit. Phase 1 explicitly addresses the "Hardcoded Alchemy API key" Tech Debt entry only via observability (REL-01/02 fix the underlying retry; SEC-01 fixes the key — both Phase 3). Use this file to look up exact line numbers for the OBS-04 instrumentation sites (`generator.ts:19-35`, `accessCodes.ts:64-85`).
- `.planning/codebase/INTEGRATIONS.md` — current observability surface (PostHog at `eu.i.posthog.com` with session recording + masked inputs; Vercel Speed Insights + Vercel Analytics injected after consent; **no Sentry / no Rollbar**; only `console.*` for server logs; `src/lib/server/auditLog.ts` exists). Use this to confirm the Sentry CSP additions and to avoid duplicating analytics into PostHog.
- `.planning/codebase/STACK.md` — Tech stack reference. Confirms SvelteKit 2 + Svelte 4 + TypeScript strict; pin Sentry SDK to its documented Svelte 4 compatibility line.
- `.planning/codebase/ARCHITECTURE.md` — System architecture. Confirms server hooks structure (`src/hooks.server.ts`).
- `.planning/codebase/CONVENTIONS.md` — Coding conventions; respect when introducing the pino logger module + Sentry init.
- `.planning/codebase/STRUCTURE.md` — Directory layout reference.

### Phase Artifacts

- `.planning/phase-01-shrink-the-surface-see-what-s-happening/01-UI-SPEC.md` — UI design contract approved 2026-04-28. Pins the DepositModal collapse copy (D-10), confirms Vercel Speed Insights is the OBS-05 dashboard (D-11), and defers `+error.svelte` (D-12). Includes two non-blocking planner recommendations: (a) when DEPR-02 admin nav prunes happen, confirm `admin/+page.svelte` default tab stays `activity`; (b) DEPR-03 visual-debt sweep — grep for orphaned "Buy crypto" / "Add funds" / `Onramper` references across the tree.

### Project Guidance (with drift warning)

- `CLAUDE.md` — project instructions for AI agents. **Drift warning:** aspirationally describes multi-chain (Base/Arbitrum/Optimism/Ethereum) and account abstraction (Rhinestone SDK / EIP-7702 / `account-abstraction/` directory). **None of those exist in code.** DRIFT-03 in Phase 4 fixes this. Researcher/planner: treat single-chain (Base 8453) + two auth paths (wagmi direct + Dynamic embedded) as the only ground truth for Phase 1; ignore CLAUDE.md sections that conflict with `.planning/codebase/`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/lib/utils/monitoring.ts` — has `logQueryFailure` and `errorMessage`; currently routes everything to `console.error`. Natural seam to wire Sentry breadcrumbs without changing call sites.
- `src/lib/server/auditLog.ts` — `createAuditLogger` exists; not yet called by every admin handler (TEST-02 in Phase 4 fixes that). Phase 1 doesn't extend audit-log coverage but should not regress it; deletions inside the rewards layer must not remove audit-log calls that protect surviving admin endpoints.
- PostHog is already initialized in `src/lib/services/analytics.ts` with session recording (`maskAllInputs: true`) and wallet-driven `identify`/`reset` based on the `walletAddress` store. Phase 1 leaves PostHog as product analytics only — Sentry handles errors.
- Vercel Speed Insights + Vercel Analytics already injected after consent. Phase 1 does not re-implement web-vitals collection — it just confirms data is flowing and documents the dashboard URL for the team (OBS-05).
- `src/lib/services/marketOrderExecution.ts:395-431` (`filterQuotesForSide`) and the aggregated/fallback execution path — this is the natural OBS-03 capture site. Existing `src/lib/utils/marketOrderFill.ts` extracted helpers (commit `89571b3`) are the unit-test template if any guard tests are added.
- `src/lib/server/snapshots/generator.ts:19-35` (`callRpc`) — single-attempt-per-RPC iterator. Phase 1 wraps each attempt with the OBS-04 metric increment and the chain-exhausted alert; **does not** add retry-with-backoff (REL-01, Phase 3).
- `src/lib/server/accessCodes.ts:64-85` (`verifyWalletSignature`) — single-Alchemy-RPC signature verification. Phase 1 instruments failures here too (OBS-04 fan-out); REL-02 fixes the single-RPC dependency in Phase 3.

### Established Patterns

- SvelteKit `handleError` hook for unhandled errors. Sentry's SDK provides `Sentry.handleErrorWithSentry` to wrap it.
- `src/hooks.server.ts` already does CSP, CORS, bot-rejection, public-path, admin, wallet-registration classification (lines 152-469). Adding Sentry requires extending the `connect-src` allowlist; adding pino + request-id requires inserting middleware *before* the existing handle chain.
- `withCache` + `KV_KEYS` namespace for cached server-side computation (`src/lib/server/cache.ts`).
- `withRetry` wrapper for resilient fetches.
- `requireAdmin` for admin-gated endpoints; `applyTieredRateLimit` for tier-based rate limiting (`src/lib/server/rateLimit.ts`).
- Cookie consent gate (`src/lib/components/CookieConsent.svelte`) for analytics injection — Sentry runs *without* consent (errors aren't analytics) but PII scrubbing must be airtight.

### Integration Points

- **OBS-01 client init:** `src/routes/+layout.svelte` (or a new `src/hooks.client.ts`).
- **OBS-01 server init:** `src/hooks.server.ts` — wrap or replace `handleError`.
- **OBS-02 logger:** new `src/lib/server/logger.ts` exporting a configured pino instance + a `withRequestContext(request, fn)` helper backed by async-local-storage.
- **OBS-02 request-id middleware:** `src/hooks.server.ts` — first thing in the handle chain, before bot-rejection.
- **OBS-03 capture:** `src/lib/services/marketOrderExecution.ts` (taker-side) and `src/lib/utils/monitoring.ts` (the existing seam) — wrap or extend `logQueryFailure` to attach the transcript and call both Sentry and pino.
- **OBS-04 metric site:** `src/lib/server/snapshots/generator.ts` `callRpc` and `src/lib/server/accessCodes.ts` `verifyWalletSignature`. New helper `src/lib/server/rpcMetrics.ts` exposes `recordRpcAttempt({ rpc_url, fn, ok, error })` and `notifyChainExhausted({ fn, attempts, request_id })`.
- **OBS-04 alert delivery:** new `src/lib/server/alerts.ts` posting to `OBSERVABILITY_ALERT_WEBHOOK_URL` (Slack webhook). Times-out at 3s; failure to deliver an alert is logged but not surfaced to the user.
- **DEPR-01 / DEPR-03 deletion sites:** `src/lib/components/rewards/*`, `src/routes/(main)/+layout.svelte`, `src/lib/components/Header.svelte`, `src/lib/components/OnramperModal.svelte`, `src/lib/components/DepositModal.svelte`, `src/routes/api/onramper/sign-url/+server.ts`, `.env.example` env entries (`ONRAMPER_SECRET_KEY`, `PUBLIC_ONRAMPER_API_KEY`, `PUBLIC_ONRAMPER_ENV`), the rewards public route files in `src/routes/api/rewards/*` and `src/routes/api/public/wallet/*`.
- **DEPR-02 deletion sites:** `src/routes/admin/rewards/+page.svelte` (4933 lines, full file), the per-wallet points step inside `src/lib/server/snapshots/processor.ts` (D-03), `LP_SUBGRAPH_URL` references (D-05). Verify before delete: `admin/+page.svelte` rewards-section grep — CONCERNS.md describes it as `activity / tvl / swaps` tabs only, so there may be no rewards section in the file itself; researcher confirms.
- **CSP additions for Sentry:** `src/hooks.server.ts:152-173` — extend `connect-src` and (for sourcemap upload at build) the build script.

</code_context>

<specifics>
## Specific Ideas

- **The "no liquidity" canary.** OBS-03's transcript exists specifically so that when a user reports "no liquidity but the UI showed a quote," a dev can pull a single log entry and reconstruct: which subgraph quote was used, what the on-chain state was at the moment of submission, what ratio + slippageBps + priceCap were derived, which side, which mode. This is the explicit acceptance test for OBS-03 — write the transcript fields with that exact replay-from-one-log-entry workflow in mind.

- **Outcome-based done, not metrics.** Per `.planning/PROJECT.md` Key Decisions: phase 1 is *necessary infrastructure* for the milestone's done-signal (whackamole stops + ship-without-fear). The phase doesn't need its own dashboard with a target — it needs to be functional enough that Phase 2's refactor has a way to be evaluated.

- **Refactor blind = guaranteed regression.** Per `.planning/PROJECT.md`: "cannot diagnose 'no liquidity' mismatches or validate that a refactor improved anything without monitoring; refactoring blind risks new whackamole on top of old." OBS-03 + OBS-04 must precede any Phase 2 trade-execution work — ROADMAP makes this explicit (`Phase 2 Depends on: Phase 1, specifically OBS-03`).

- **Real users on real money.** Live trading users hold positions today (`PROJECT.md` constraint). Deletions ship safely: feature flags or staged rollouts where appropriate. DEPR-01 (user-facing rewards) is already commented-out per UI-SPEC, so it's a low-risk delete. DEPR-03 (Onramper) replaces `DepositModal`'s 3-view chooser with deposit-only (UI-SPEC Q1) — verify nothing else in the tree links to the now-deleted Onramper view (UI-SPEC's non-blocking recommendation #2).

- **Matching pattern: `CRON_SECRET`.** SEC-02 in Phase 3 says `SESSION_SECRET` and CSRF-secret should follow the same fail-closed pattern as `CRON_SECRET` in `src/routes/api/cron/snapshots/+server.ts:45`. The new `OBSERVABILITY_ALERT_WEBHOOK_URL` (D-09) should use that same pattern: throw at module load in production if missing; log a warning + skip in dev.

</specifics>

<deferred>
## Deferred Ideas

Captured here so they aren't lost. None of these block Phase 1; some are explicitly handled by later phases.

- **External log drain (Better Stack / Axiom / Datadog).** Phase 1 ships with Vercel Logs only. If log volume or search needs prove insufficient during Phase 2 execution, add a drain in a follow-up. Not a Phase 3 commitment — only if the team feels the pain.
- **`+error.svelte` user-visible error page.** Deferred per UI-SPEC Q3. Add only when product needs surface.
- **Sentry alert dedupe windows / rollup thresholds for OBS-04.** D-09 ships with every-occurrence alerting. If chain-exhaust alerts get noisy, add a 5-minute dedupe window. Defer until evidence.
- **Replay tooling for OBS-03 transcripts.** Phase 1 ships fields-in-the-log; manual reconstruction by the dev. A future phase could add an admin-only `/admin/replay/{request_id}` page that loads the transcript and re-runs the exact subgraph quote + on-chain state read. Out of scope here.
- **Referral-code generation hardening.** SEC-05 in Phase 3 — replace `Math.random()` with `crypto.randomBytes()` rejection-sampled into the alphabet for both access codes and referral codes. Phase 1 leaves referrals.ts alone.
- **RPC retry-with-backoff in the fallback chain.** REL-01 in Phase 3 — Phase 1 only adds visibility (OBS-04); the underlying single-attempt-per-RPC behavior in `generator.ts:19-35` and the silent `latestBlock` fallback in `getBlockNumberForTimestamp` survive Phase 1 and get fixed in Phase 3.
- **EIP-1271 / EIP-6492 verification on the fallback chain.** REL-02 in Phase 3 — Phase 1 instruments failures in `accessCodes.ts:64-85` (OBS-04 fan-out) but leaves the single-Alchemy-RPC dependency in place.
- **Vendoring the Rain strategies registry.** REL-03 in Phase 3 — pull the registry out of GitHub-raw runtime fetch into `/static/registry/` or compiled-in. Phase 1 ignores.
- **Hardcoded Alchemy API key removal + rotation.** SEC-01 in Phase 3.
- **Session secret + CSRF secret fail-closed.** SEC-02 in Phase 3.
- **Server-issued session cookie + CSRF binding.** SEC-03 / SEC-04 in Phase 3.
- **hCaptcha fail-closed on Vercel preview.** SEC-07 in Phase 3.
- **Snapshot endpoint rate limiting + admin gating.** SEC-06 in Phase 3 (now applies because we kept the snapshot pipeline per D-01).
- **Hooks.server.ts integration tests.** TEST-01 in Phase 4.
- **Snapshot scraper edge-case tests.** TEST-04 in Phase 4 (now applies because we kept the scraper per D-01).
- **Admin audit-log coverage.** TEST-02 in Phase 4 — every state-mutating admin endpoint calls `createAuditLogger`.
- **Market-order integration tests.** TEST-03 in Phase 4.
- **Token lookup drift cleanup (`getTokenByAnyAddress` / `isPaymentToken` / `getPaymentTokensForNetwork`).** DRIFT-01, DRIFT-02 in Phase 4.
- **`CLAUDE.md` rewrite to match shipped reality.** DRIFT-03 in Phase 4 — single chain, two auth paths, no AA, no `account-abstraction/` directory; pointer to `.planning/codebase/CONCERNS.md`.
- **Trade page first-paint target (specific p75 LCP threshold).** PERF-01 in Phase 2 — set during planning against the OBS-05 baseline this phase establishes.

</deferred>

---

*Phase: 01-shrink-the-surface-see-what-s-happening*
*Context gathered: 2026-04-28*
