# Phase 2: Observability for Transacting Users - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the v1.0 observability foundation (Sentry SDK + PII scrubber, pino server logger with `request_id`, PostHog with `maskAllInputs`, `captureTakeOrderFailure` Sentry sink) into an end-to-end view of trade flows so an engineer can pivot from a Sentry event to the matching session replay and matching pino server logs via a shared correlation ID, and a funnel dashboard surfaces where transacting users drop off before users have to report it.

Six REQ-IDs in scope (all from milestone v1.1 Test & Observe):

1. **OBS-06** — Sentry Session Replay integrated for transacting users; privacy-masked (PII fields, addresses where appropriate); sampling biased toward sessions that initiated a Buy / Sell / limit-deploy.
2. **OBS-07** — Transaction event taxonomy defined and emitted in PostHog + pino across Buy, Sell, limit-deploy, and DCA-deploy flows. Steps: open page, quote received, click submit, sign approval, sign trade, broadcast, confirmed/failed. Documented properties (mode, side, amounts, slippage, error class).
3. **OBS-08** — Single PostHog dashboard with trade-page → quote → submit → signed → confirmed funnel; named drop-off steps and counts; broken out by order type (market, limit).
4. **OBS-09** — Correlation ID threading: every failed trade is navigable from a Sentry event to the matching PostHog session replay and pino server logs via a shared correlation ID emitted at trade start.
5. **OBS-10** — At least one real production trade roundtrip captured end-to-end across Sentry replay, PostHog events, and pino server logs.
6. **OBS-11** — Privacy review: Session Replay masking + event properties reviewed against `.planning/codebase/CONCERNS.md` PII guidance and the OBS-01 Sentry PII scrubbing config.

This phase **builds on** the v1.0 OBS-01..05 foundation and does NOT add new product features, new chains, new tokens, new order types, account-abstraction work, generic uptime checks, or admin-page observability — those are explicitly out of scope per `.planning/REQUIREMENTS.md ## Out of Scope`.

</domain>

<decisions>
## Implementation Decisions

### Replay Stack (the discussed area)

- **D-01: Dual-stack — Sentry Replay + PostHog session_recording coexist with separate roles.** Sentry Replay attaches replays to Sentry events natively (one-click pivot from a Sentry error to the matching replay) — primary triage path for failed trades. PostHog session_recording stays on at low rate to give the OBS-08 funnel a per-session replay trail when an engineer is investigating a drop-off (no Sentry event needed). Two replay products, two storage costs, two privacy surfaces — accepted because each serves a distinct workflow (error triage vs funnel investigation). Rejected: Sentry-only (loses funnel-investigation replays); PostHog-only (loses native Sentry-event-to-replay one-click pivot — would force OBS-09 correlation ID to do the work Sentry Replay does natively; weakens the OBS-06 "Sentry Replay specifically" intent).

- **D-02: Sentry Replay sampling — `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`.** No proactive recording. When a Sentry event fires (notably `captureTakeOrderFailure` from `src/lib/services/observability/captureTakeOrderFailure.ts:79`), Sentry attaches the buffered last ~30–60s of the session as a replay. Lowest cost, lowest privacy surface, perfectly aligned with "engineer triages a Sentry event → sees the replay" workflow that OBS-09 sets up. Misses replays for trades that succeed-but-look-weird (no Sentry event = no Sentry replay) — those are caught by the PostHog low-rate sampling per D-04. Rejected: trade-page-session bias (`replaysSessionSampleRate: 1.0` while on `/trade/[id]`) for higher storage cost without a clear "we'll actually use this" workflow; trade-action bias (start replay on first Buy/Sell click) for similar reasons plus added wiring complexity.

- **D-03: Sentry Replay masking — defaults (`maskAllText: true` + `maskAllInputs: true`).** Maximum privacy. Addresses, balances, amounts, error messages all rendered as redacted blocks in the replay. Diagnostic value is weaker (replay shows "user clicked button, saw redacted block") but privacy review (OBS-11) is straightforward — no per-selector mask catalog to audit, no "did we forget to mark this node sensitive" risk. Rejected: mask-inputs-only with explicit `data-sensitive` for addresses (more diagnostic value but introduces a discipline burden — every new sensitive node needs marking, every privacy review re-audits the catalog); reused-scrubber DOM-walk via `beforeAddRecordingEvent` (more code, more CPU per recorded mutation, marginal gain over Sentry defaults at this stage).

- **D-04: PostHog session_recording — keep current `maskAllInputs: true`, low session sample rate for funnel-context replay.** Don't change the existing `src/lib/services/analytics.ts:27-32` config beyond confirming/setting `session_recording.sampleRate` to a low value (e.g., 0.05–0.1) so PostHog replay is supplementary — not a primary triage tool. Wallet-driven `identify`/`reset` already wired (`analytics.ts:50-85`). Rejected: tighten PostHog masking to match Sentry defaults (single privacy review covers both, but funnel-context value drops further and PostHog's role then duplicates Sentry); trade-flow-only PostHog recording (more wiring, smaller storage win, breaks the "PostHog session = funnel context regardless of where the user came from" model).

### Claude's Discretion

These were not user-locked and are open for the researcher/planner to decide. The user explicitly chose to leave the rest as discretion in this discussion.

- **OBS-07 event taxonomy schema.** Step coverage is fixed by the REQ-ID (open page, quote received, click submit, sign approval, sign trade, broadcast, confirmed/failed across Buy/Sell/limit-deploy/DCA-deploy). Open: namespacing convention (`trade.market.buy.submitted` vs flat `market_buy_submitted` vs the existing `wallet_connected` snake_case shape in `src/lib/services/analytics.ts:69`), property contract (units for `amount`, redaction policy for any PII not already handled by the existing `track()` enrichment, `error_class` enum surface), pino-mirror format (same JSON keys as PostHog event properties? or pino-canonical with PostHog as a transformation?). Researcher should check whether the existing PostHog `track()` helper (`src/lib/services/analytics.ts:91`) needs extension for `event.kind`/`flow_id` or whether a new helper module makes more sense for the trade taxonomy specifically. Constraint: the existing PII scrubber (`src/lib/observability/scrub.ts`) operates on the Sentry boundary only — PostHog event properties go through `track()` enrichment unscrubbed; researcher decides whether the trade taxonomy needs a parallel scrub layer or whether disciplined property design (no raw addresses in event properties; use `wallet_address` already added by `track()` lowercase normalization) is sufficient.

- **OBS-08 funnel dashboard mechanism.** "Single PostHog dashboard, broken out by order type" is fixed; how it's built is open. Manual PostHog UI configuration vs declared as code (PostHog API or Terraform). Solo-team simplicity bias from v1.0 (e.g., Phase 3 D-09 plain webhook over Block Kit; Phase 2 D-09 compound testids over flat namespace) suggests: manual PostHog UI config + a screenshot/export checked into `02-RUNBOOK.md` is likely sufficient unless researcher finds a strong reason for as-code. Named drop-off steps follow directly from D-01 event taxonomy decisions.

- **OBS-09 correlation ID lifecycle.** "Shared correlation ID emitted at trade start" is fixed. Open: where minted (trade-start click handler in `MarketOrder.svelte` / `LimitOrder.svelte` vs page-load in `+page.svelte` route load), how threaded (Sentry tag via `Sentry.setTag('trade_id', ...)`, PostHog property via `track('...', { trade_id })`, pino field via request header → `getRequestContext()` extension), relationship to existing pino `request_id` (correlation ID is per-trade-flow; `request_id` is per-HTTP-request — they're orthogonal and both need to coexist in pino logs). Server propagation mechanism (request header is the obvious slot since the trade path already issues HTTP requests; researcher confirms which routes are hit during a trade and whether they all need to participate). Constraint: must work for both authenticated wallet flows and Dynamic embedded-wallet flows (both auth paths route through `src/lib/services/walletService.ts`).

- **OBS-10 verification protocol.** "At least one real trade roundtrip captured end-to-end across Sentry replay, PostHog events, and pino server logs" — open: manual single-trade smoke from a real wallet vs scripted; in-prod after deploy vs staging; who runs the human check. Solo-team default: manual smoke from the operator's wallet on production after deploy, screenshots of all three sinks captured into `02-RUNBOOK.md`, mirrors v1.0 Phase 2 PERF-01 HUMAN-UAT pattern (post-deploy human verification, not synchronous CI gate).

- **OBS-11 privacy review protocol.** "Reviewed against `.planning/codebase/CONCERNS.md` PII guidance and the OBS-01 Sentry PII scrubbing config" is fixed; format is open. Internal checklist committed alongside `02-RUNBOOK.md` vs standalone documented policy file. Researcher decides bar for "passes review" — likely a written checklist mapping each masking decision (D-03 Sentry defaults, D-04 PostHog `maskAllInputs`) and each event-taxonomy property (D-01 surface, when finalized) to its PII risk classification with a sign-off line for the operator.

- **Phase-internal sequencing.** Likely OBS-07 (taxonomy) → OBS-09 (correlation ID, depends on event surface) → OBS-08 (funnel, depends on events firing) → OBS-06 (Sentry Replay configuration, can land in parallel) → OBS-10 (verification, requires all four above live) → OBS-11 (privacy review, requires masking decisions implemented). Planner picks final sequence + wave parallelism.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Planning

- `.planning/ROADMAP.md` §"Phase 2: Observability for Transacting Users" — phase goal, success criteria (5 bullets), `Depends on: Phase 1` (test harness gives confidence to ship instrumentation; v1.0 OBS-01..05 foundation already live), `Requirements: OBS-06, OBS-07, OBS-08, OBS-09, OBS-10, OBS-11`.

- `.planning/REQUIREMENTS.md` — full text of the 6 phase REQ-IDs (OBS-06..11). Researcher and planner must address every REQ-ID; checker enforces coverage.

- `.planning/PROJECT.md` — milestone constraints. Especially: single chain (Base 8453); real users on real money (no all-at-once flips); solo / 1-2 dev team; "transactions are the failure surface" scope principle; Out of Scope (no AA, no multi-chain, no admin observability deepening, no replacing PostHog or Sentry, no generic synthetic uptime).

- `.planning/STATE.md` — current position. v1.1 Phase 1 closed 2026-05-06; v1.1 Phase 2 unblocked.

### v1.0 Foundation (carry-forward — OBS-01..05 ground truth)

- `milestones/v1.0-phases/phase-01-shrink-the-surface-see-what-s-happening/01-CONTEXT.md` — Phase 1 v1.0 decisions D-01..D-17. Especially: D-08 (OBS-03 transcript fields and the "replay-from-one-log-entry" acceptance test) sets the contract that OBS-07 events must be compatible with; D-15 (browser-tier OBS-03 = Sentry + console.error JSON) sets the dual-sink pattern OBS-07 inherits; D-13 (out-of-scope guardrails — no AA, no multi-chain) carries forward.

- `milestones/v1.0-phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — operational runbook. Documents the existing observability surfaces (Sentry SDK, pino, PostHog, Speed Insights) and their wiring points.

- `milestones/v1.0-phases/phase-03-production-grade-hardening/03-RUNBOOK.md` — REL-02 viem fallback transport for signature verification + per-RPC attribution deferral note (currently `'fallback-chain-base'` label only). Phase 2 OBS-09 correlation ID does NOT supersede this; per-RPC attribution remains a separate v1.1+ deferred item (backlog 999.6).

### v1.1 Phase 1 Artifacts (carry-forward)

- `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-CONTEXT.md` — Phase 1 v1.1 decisions. Especially: D-09 compound `data-testid` + `data-*` semantic-state convention (OBS-09 may reuse the same `data-*` attribute discipline if event taxonomy emits per-component context); D-11 ESLint rule banning E2E imports of internal services (OBS-07 event taxonomy must not regress this — events fire from the components/services, not from a test-only path).

- `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md` — Phase 1 RUNBOOK. Documents the trade-page interactive surface (`MarketOrder.svelte`, `LimitOrder.svelte`, `+page.svelte`) that OBS-07 events fire from.

### Codebase Audit

- `.planning/codebase/CONCERNS.md` — full audit. PII guidance section is the canonical reference for OBS-11 privacy review. Tech-debt entries do not directly bear on this phase but researcher should scan for any observability-adjacent items.

- `.planning/codebase/INTEGRATIONS.md` — current observability surface (PostHog, Sentry, pino, Vercel Speed Insights, audit log, CSP allow-list including `*.ingest.sentry.io` / `*.ingest.de.sentry.io` / `*.posthog.com` / `*.i.posthog.com`). **Drift warning:** the "Error tracking" subsection states "No external error tracking SDK (no Sentry/Rollbar)" — this is stale; v1.0 OBS-01 added `@sentry/sveltekit` ^10.50.0 (verified in `package.json` and `src/hooks.client.ts` / `src/hooks.server.ts`). Researcher: trust the code, flag the doc drift for a side-update or carry it to a future docs phase.

- `.planning/codebase/ARCHITECTURE.md` — system architecture. Two auth paths (wagmi direct + Dynamic embedded), single chain, client-only trade page.

- `.planning/codebase/STACK.md` — tech stack. Pin observability work to Svelte 4 + SvelteKit 2 + TypeScript strict + `@sentry/sveltekit` ^10.50.0 + `posthog-js` + `pino`.

- `.planning/codebase/CONVENTIONS.md` — coding conventions. Honor when introducing new modules for the event taxonomy and correlation ID propagation.

- `.planning/codebase/STRUCTURE.md` — directory layout. Use to pick file placement (likely `src/lib/services/analytics.ts` extension or new `src/lib/services/observability/events.ts` companion to `captureTakeOrderFailure.ts`).

- `.planning/codebase/TESTING.md` — testing conventions; v1.1 Phase 1 added the "UI Test Selectors" section. OBS-07 events should be assertion-friendly from the new UI E2E suite if events are user-visible; planner decides depth.

### Project Guidance

- `CLAUDE.md` — project instructions for AI agents. v1.0 DRIFT-03 rewrote this to single-chain reality; treat as ground truth for this phase. The `## Order Semantics — INPUT/OUTPUT Perspective (Critical)` section is the prose statement of the bug class TRADE-04 locked down — relevant context for OBS-07 event property design (Buy/Sell/spend-anchored/asset-anchored mode×side surface).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/lib/services/analytics.ts` (169 lines) — PostHog initialization + wallet-driven `identify`/`reset` + `track(eventName, properties)` helper that auto-enriches with `wallet_address` (lowercase), `auth_method`, `network`, `chain_id`. Existing events: `wallet_connected`, `wallet_disconnected`, `page_viewed`. The OBS-07 event taxonomy lands as new `track()` call sites (or a thin wrapper around `track()` that adds taxonomy-specific enrichment like `flow_id` / `trade_id`). `session_recording: { maskAllInputs: true, maskInputOptions: { password: true } }` already configured at `:27-32` — D-04 keeps this and adds a low session sample rate.

- `src/lib/observability/scrub.ts` — Sentry PII scrubber (`beforeSend` + `beforeBreadcrumb`). Strips `?signature=...` URL params, `0x[130]` signatures, `0x[40]` addresses. Recursive over event tree. OBS-11 privacy review uses this as the reference contract for what "Sentry-side PII scrubbing" already covers.

- `src/lib/services/observability/captureTakeOrderFailure.ts` (~115 lines) — existing Sentry sink for failed take-orders, called from `src/lib/services/marketOrderExecution.ts:199`. Routes failures to Sentry with the OBS-03 transcript. **OBS-09 correlation ID hooks into this** — the `trade_id` minted at trade start should be set as a Sentry tag (or attached to the captured event) so the Sentry-attached replay (D-02 on-error) is discoverable from the same correlation ID that PostHog and pino use.

- `src/lib/server/logger.ts` — pino server logger with AsyncLocalStorage request context: `request_id`, `wallet`, `route`, `method`, `status`, `latency_ms`. Per-route log level matrix in `pickLevelForRoute`. **OBS-09 correlation ID extends `RequestContext`** with a per-trade-flow `trade_id` field (orthogonal to `request_id` which is per-HTTP-request — both coexist in pino logs). NODE-only (`node:async_hooks`); no Edge runtime usage today (verified at v1.0 install time).

- `src/hooks.client.ts` + `src/hooks.server.ts` — `@sentry/sveltekit` wiring with `beforeSend`/`beforeBreadcrumb` already routed through `scrub.ts`. Add `Sentry.replayIntegration(...)` here for OBS-06 (D-02/D-03 config).

- `src/lib/components/orders/MarketOrder.svelte` (1253 lines) — host of Buy/Sell market-order submit. Where `trade_id` is minted at trade-start click (D-claude's-discretion above). Existing `data-testid` attributes from v1.1 Phase 1 D-09 ready for event-taxonomy reuse.

- `src/lib/components/orders/LimitOrder.svelte` — host of limit-order deploy. Lazy-loaded per v1.0 Phase 2 D-08; OBS-07 event taxonomy lands inside the component (events fire after import resolution).

- `src/lib/components/orders/DcaOrder.svelte` — host of DCA-deploy. Lazy-loaded per v1.0 Phase 2 D-08. OBS-07 explicitly covers DCA-deploy.

- `src/routes/(main)/trade/[id]/+page.svelte` — trade-page route. Where `trade-page-opened` event fires (OBS-07 step 1) and where the funnel begins (OBS-08).

- `src/lib/services/walletService.ts` — unified auth surface (wagmi direct + Dynamic embedded). OBS-09 correlation ID propagation must work through both paths.

### Established Patterns

- **`track(eventName, properties)` enrichment** — call sites pass minimal properties; `track()` adds wallet/auth/network/chain context automatically. New OBS-07 events follow this pattern.

- **Sentry `beforeSend` PII scrubbing** — single source of truth at the SaaS boundary; route all new Sentry capture call sites through the existing `Sentry.captureException` / `Sentry.captureMessage` paths so the scrubber runs.

- **pino `getRequestContext()` accessor + `pino-bound` automatic context propagation** — server-side new fields (e.g., `trade_id`) added once to `RequestContext` propagate everywhere via AsyncLocalStorage.

- **Wallet-driven PostHog identify/reset** — already wired at `analytics.ts:50-85`. OBS-07 event taxonomy should not re-identify; it just calls `track()`.

- **CSP allow-list for SaaS endpoints** — `src/hooks.server.ts:194` already permits `*.ingest.sentry.io` / `*.ingest.de.sentry.io` / `*.posthog.com` / `*.i.posthog.com`. Sentry Replay uses the same Sentry ingest origin — no CSP change expected. Researcher confirms with a CSP-violation test on a recorded trade page (PR #170 EU-region drift class).

- **Cookie consent gating** — `initAnalytics()` runs after consent (`src/lib/components/CookieConsent.svelte` callback). Sentry Replay config must respect the same consent surface — researcher decides whether to gate `Sentry.replayIntegration()` behind consent or accept Sentry's default behavior (consent isn't built into Sentry Replay the way PostHog gates it; researcher reads Sentry docs for the policy-aligned approach).

### Integration Points

- **OBS-06 wiring:** `src/hooks.client.ts` — add `Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true })` to the existing `Sentry.init({...})` call. Set `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0` per D-02. Confirm CSP allows the Sentry Replay endpoints (likely same `*.ingest.de.sentry.io` already permitted).

- **OBS-06 PostHog tweak:** `src/lib/services/analytics.ts:27-32` — confirm/add `session_recording.sampleRate` (default 1.0; D-04 lowers to ~0.05–0.1). No mask config change.

- **OBS-07 event-emission sites:** `MarketOrder.svelte`, `LimitOrder.svelte`, `DcaOrder.svelte`, `+page.svelte`, `marketOrderExecution.ts`, `orderDeployment.ts` (limit/DCA deploy paths), and any wallet-signing helpers (researcher maps the exact functions). Each step (open page, quote received, click submit, sign approval, sign trade, broadcast, confirmed/failed) lands as a `track()` call (or wrapper) at the right code site.

- **OBS-08 dashboard:** PostHog UI (per Claude's discretion above; manual configuration likely). Funnel inputs are the OBS-07 event names defined in the taxonomy.

- **OBS-09 correlation ID propagation:** Mint at trade-start click (`MarketOrder.svelte` / `LimitOrder.svelte` / `DcaOrder.svelte` submit handler — researcher confirms exact site). Set as Sentry tag via `Sentry.setTag('trade_id', id)` so it lands on `captureTakeOrderFailure` events. Pass as PostHog property via `track('...', { trade_id })`. Send to server via request header (e.g., `X-Trade-Id`) extracted in `hooks.server.ts` `requestContextHandle` and stored in `RequestContext.trade_id` so all downstream pino logs include it. Coexist with existing `request_id` (per-HTTP-request) — they are orthogonal.

- **OBS-10 verification:** Production smoke after deploy. RUNBOOK captures the recipe + screenshots from all three sinks (Sentry replay, PostHog event/funnel/replay, pino logs in Vercel Logs).

- **OBS-11 privacy review surface:** A checklist file (`02-PRIVACY-REVIEW.md` or section of `02-RUNBOOK.md` — planner picks) mapping each masking + event-property decision to its PII classification, with reference to `.planning/codebase/CONCERNS.md` PII guidance and `src/lib/observability/scrub.ts` Sentry contract.

</code_context>

<specifics>
## Specific Ideas

- **PostHog session_recording is already enabled — privacy bar is set.** The `maskAllInputs: true` baseline at `src/lib/services/analytics.ts:27-32` is the floor that OBS-06 Sentry Replay must meet or exceed. D-03 (Sentry defaults: `maskAllText` + `maskAllInputs`) exceeds it; OBS-11 review documents this delta.

- **The on-error replay workflow is the primary OBS-09 payoff.** Engineer triages a failed trade → opens the Sentry event from `captureTakeOrderFailure` → clicks the attached replay → sees the user's last 30–60s of trade-page interaction (with masked content per D-03) → uses the `trade_id` Sentry tag to grep pino logs in Vercel Logs → reconstructs the full server-side picture. The replay does not need to be readable in fine detail (D-03 maximum masking) because the OBS-03 transcript + pino server logs carry the diagnostic detail; the replay's job is "confirm the user's path through the UI matches what the transcript says happened."

- **PostHog replay is the funnel-investigation tool, not the triage tool.** D-04 keeps PostHog session_recording at low rate so when an engineer is investigating an OBS-08 funnel drop-off (where there's no Sentry event to trigger Sentry Replay), there's still a PostHog replay attached to the session. Two different workflows, two different replay products.

- **Privacy review is single-source-of-truth, not duplicate.** Even though there are two replay products (Sentry + PostHog) and two event sinks (PostHog + pino), the privacy contract is one document referencing both — the existing `src/lib/observability/scrub.ts` (Sentry boundary), `analytics.ts:27-32` (PostHog mask config), and the to-be-defined OBS-07 event property surface (properties posted to PostHog).

</specifics>

<deferred>
## Deferred Ideas

Captured here so they aren't lost. None block Phase 2; some are explicitly handled by later milestones or are open-by-design as Claude's discretion.

- **OBS-07 event taxonomy schema details** (namespacing, property contract, pino-mirror format, DCA scope details) — Claude's discretion above; researcher/planner decides during plan-phase.

- **OBS-08 funnel dashboard mechanism** (manual UI vs as-code) — Claude's discretion above. Solo-team simplicity bias suggests manual + screenshot-in-RUNBOOK unless researcher finds a reason for as-code.

- **OBS-09 correlation ID lifecycle details** (mint site, header name, pino field schema) — Claude's discretion above. Researcher confirms which routes participate and how Dynamic embedded-wallet flows handle the propagation.

- **OBS-10 verification protocol** (manual smoke vs scripted; staging vs prod-after-deploy) — Claude's discretion above. Default expected: manual prod smoke + RUNBOOK screenshots, mirroring v1.0 Phase 2 PERF-01 HUMAN-UAT pattern.

- **OBS-11 privacy review format** (checklist vs policy file) — Claude's discretion above. Researcher picks structure.

- **Phase-internal sequencing & wave parallelism** — Claude's discretion. Likely OBS-07 → OBS-09 → OBS-08 → OBS-06 (parallel) → OBS-10 → OBS-11; planner finalizes.

- **Per-RPC attribution restoration through viem fallback Transport** (REL-02 follow-up, backlog 999.6). Phase 2 OBS-09 correlation ID does NOT supersede this; per-RPC granularity in OBS-04 logs remains separately deferred.

- **Replacing PostHog or Sentry with another platform** — explicitly out of scope per `.planning/REQUIREMENTS.md`.

- **Admin-page observability deepening** — explicitly out of scope per `.planning/REQUIREMENTS.md`. OBS-07 events fire from the trade-page surface only.

- **Generic synthetic uptime checks** — explicitly out of scope per `.planning/REQUIREMENTS.md`.

- **Performance budgets / synthetic monitoring for the trade page** — listed as future requirements in `.planning/REQUIREMENTS.md ## Future Requirements`; not in v1.1.

- **Cross-environment test parity (Vercel preview running E2E suite against a fork)** — listed as future; not in v1.1.

- **`INTEGRATIONS.md` "No external error tracking SDK" drift correction.** The v1.0 OBS-01 install added `@sentry/sveltekit` but the codebase audit doc was not updated. Phase 2 researcher: opportunistically flag for a side-update or carry to a future docs phase.

- **HUMAN-UAT batch for v1.0 deferred verifications** (backlog 999.1). Separate work; not Phase 2.

- **Alchemy atomic-swap-then-rotate** (backlog 999.2) — separate v1.0 carry-forward; not Phase 2.

- **Vercel env-var cleanup (orphaned)** (backlog 999.3) — separate v1.0 carry-forward; not Phase 2.

- **Phase 2 walkResult fills mutation (WR-01) + micro tech debt bundle (WR-02..04 + IN-01..05)** (backlog 999.4 + 999.5) — separate v1.0 Phase 2 carry-forward; not v1.1 Phase 2.

- **`svelte-check` baseline cleanup (3 errors)** (backlog 999.7) — separate v1.0 Phase 4 carry-forward; not Phase 2.

- **`test-integration` CI job foundry install fix** (backlog 999.8) — separate v1.0 PR #169 follow-up; not Phase 2.

</deferred>

---

*Phase: 02-observability-for-transacting-users*
*Context gathered: 2026-05-06*
