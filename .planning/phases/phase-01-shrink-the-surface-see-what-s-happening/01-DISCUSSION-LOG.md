# Phase 1: Shrink the Surface, See What's Happening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 1-shrink-the-surface-see-what-s-happening
**Areas discussed:** DEPR-02 surgery boundary; Observability stack defaults (locked as Claude's Discretion)

---

## Pre-discussion: DEPR-02 high-level direction (volunteered before formal areas)

The user volunteered the DEPR-02 high-level call without prompting. This was the primary blocker flagged in `STATE.md` (internal-team confirmation needed) and is now resolved.

**User's direction (confirmed verbatim):**

> Delete the rewards layer (user-facing rewards UI already in DEPR-01 scope, plus admin/rewards/+page.svelte, rewards leaderboard polling, rewards public APIs, rewards-specific snapshot consumers). Keep the snapshot pipeline (src/lib/server/snapshots/, the cron, KV state, scraper) because it feeds TVL, total trade volume, per-token trade volume, and per-token TVL views in the internal admin tree. SEC-06, REL-01, and TEST-04 therefore survive against the retained snapshot subsystem.

**Captured as:** D-01 in CONTEXT.md.

---

## DEPR-02 Surgery Boundary (file-level sub-decisions)

After the high-level direction was locked, four file-level sub-decisions were surfaced to remove ambiguity for the planner.

### Sub-decision 1 — Nansen integration

| Option | Description | Selected |
|--------|-------------|----------|
| Delete everything | Remove `nansenTiers.ts`, `/api/nansen/tiers` (public), `/api/admin/nansen` (admin). Whale-tier tagging was rewards-leaderboard signal. | |
| Keep admin route only | Delete public; keep admin + `nansenTiers.ts` for internal wallet classification. | |
| Keep everything | Treat Nansen as an admin-analytics tool that's just not user-facing. | ✓ |

**User's choice:** Keep everything.
**Notes:** Captured as D-02. Implication: CSP entry stays; Nansen API token + 1-hour cache stay; admin uses tier data for wallet activity classification in `admin/+page.svelte` activity tab.

### Sub-decision 2 — Per-wallet monthly points calculation in `src/lib/server/snapshots/processor.ts`

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the points step entirely | `generator.ts` outputs TVL + volume aggregates only. Cleanest. (Recommended) | ✓ |
| Keep the math but stop calling it | Orphan source code; future contributors will trip over it. | |
| Keep and continue calling | Pretend rewards layer might come back. Contradicts deletion call. | |

**User's choice:** Delete the points step entirely.
**Notes:** Captured as D-03. Faster cron; smaller blobs; no orphan code.

### Sub-decision 3 — Existing Vercel Blob snapshots with rewards/points fields

| Option | Description | Selected |
|--------|-------------|----------|
| Leave existing as-is; new blobs use pruned schema | No backfill. Old TVL series stays readable; new blobs accumulate with the pruned schema. (Recommended) | ✓ |
| Wipe and regenerate from a recent block | Cleaner storage state but loses historical TVL + risky destructive blob op. | |
| Regenerate everything from genesis | Heaviest; hits Pyth + subgraph quota hard, may exceed Vercel timeouts. | |

**User's choice:** Leave existing as-is; new blobs use pruned schema.
**Notes:** Captured as D-04. Lowest risk — no migration script; document the legacy field tolerance in code so future contributors don't try to clean it up.

### Sub-decision 4 — LP attribution subgraph (`LP_SUBGRAPH_URL`)

| Option | Description | Selected |
|--------|-------------|----------|
| Delete | Remove env var + consumers. Subgraph slug `st0x-rewards-base/1.0.23` confirms it was rewards-only. | ✓ |
| Keep — might be useful for analytics | Adds a code path future contributors will trip over. | |
| Investigate during research | Defer to gsd-phase-researcher to grep consumers and recommend. | |

**User's choice:** Delete.
**Notes:** Captured as D-05. Remove `LP_SUBGRAPH_URL` from `.env.example` + Vercel project env; remove all consumers.

---

## Observability Stack (locked as Claude's Discretion)

The user de-selected three observability gray areas in the initial multi-select (Observability stack picks, OBS-03 transcript capture format, OBS-04 alert channel & threshold) and chose only DEPR-02 surgery for deep discussion. Claude proposed concrete defaults for all four observability decisions and asked the user to confirm or override.

### Defaults proposed

- **OBS-01 (client error tracker):** Sentry (SaaS, SvelteKit SDK, free tier 5K errors/month). PII scrubbing via `beforeSend` regex denylist for `0x[a-f0-9]{40}` (wallet addresses), `0x[a-f0-9]{130}` (signatures), and URL `?signature=...` params. PostHog stays for product analytics.
- **OBS-02 (server logs):** pino structured JSON output + request-id middleware in `hooks.server.ts`. Destination: Vercel Logs only for v1; external drain (Better Stack / Axiom / Datadog) deferred. Required fields: `request_id`, `wallet`, `route`, `method`, `status`, `latency_ms`, `level`, `msg`, `error.*`.
- **OBS-03 (take-order transcript):** Captured at `marketOrderExecution.ts` aggregated/fallback boundary; written to **both** Sentry (immediate alert) and a structured pino log line (long-term searchability). Fields per success criterion + `mode` + `request_id` + `walletAddress` (scrubbed in Sentry, full in pino server logs).
- **OBS-04 (RPC failure alerts):** Counter increments per RPC URL flow into pino (counts derived from log query). Chain-exhausted alert: synchronous Slack incoming webhook via new `OBSERVABILITY_ALERT_WEBHOOK_URL` env var. Every occurrence (no rollup); add dedupe later if noisy.

| Option | Description | Selected |
|--------|-------------|----------|
| Lock all four as written | Planner builds against these without re-asking. (Recommended) | ✓ |
| Override one or more | User specifies which to change. | |
| Punt entirely — let researcher recommend | Drop all four to research-then-pick. Slower one round-trip. | |

**User's choice:** Lock all four as written.
**Notes:** Captured as D-06 through D-09. Researcher and planner treat these as locked; checker enforces them as written.

---

## End-of-discussion check

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md with locked decisions + Claude's Discretion + canonical refs. (Recommended) | ✓ |
| Explore more gray areas | Surface 2–4 additional gray areas (DEPR-01 route disposition, referrals confirm, sequencing, etc.). | |

**User's choice:** I'm ready for context.

---

## Claude's Discretion

The following were proposed by Claude and ratified by the user (D-06 through D-09). Captured in CONTEXT.md `<decisions>` § "Observability Stack (locked Claude's Discretion)".

Additional purely-tactical items left to the planner / executor (also captured in CONTEXT.md `<decisions>` § "Claude's Discretion"):

- File-level placement of new modules (Sentry init location, pino logger location).
- Exact npm package versions (latest stable matching Svelte 4 / SvelteKit 2 compatibility).
- Sequencing inside the phase (deletions vs observability waves) — ROADMAP says OBS-03 must precede Phase 2; OBS-01/02 first if cheaper.
- Whether Slack alert webhook reuses an existing workspace or asks for a new channel — operational detail, deploy-time.
- Naming of the request-id middleware and async-local-storage helper.
- PR/commit granularity for the rewards-layer deletion.

---

## Deferred Ideas

Items that came up during discussion (or were carried forward from upstream artifacts) and explicitly belong outside Phase 1 scope. Captured in CONTEXT.md `<deferred>`:

- External log drain (Better Stack / Axiom / Datadog) — only if Vercel Logs proves insufficient.
- `+error.svelte` user-visible error page (deferred per UI-SPEC Q3).
- Sentry alert dedupe windows / rollup thresholds for OBS-04 (only if noisy).
- Replay tooling for OBS-03 transcripts (admin-only `/admin/replay/{request_id}` page).
- All Phase 3 / Phase 4 work (SEC-*, REL-*, TEST-*, DRIFT-*, PERF-01) — referenced in CONTEXT.md so the planner doesn't accidentally pull them into Phase 1.
