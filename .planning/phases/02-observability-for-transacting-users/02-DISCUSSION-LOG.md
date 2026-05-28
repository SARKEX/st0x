# Phase 2: Observability for Transacting Users - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 02-observability-for-transacting-users
**Areas discussed:** Sentry Replay vs PostHog recording

---

## Replay Stack — Sentry vs PostHog Roles

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry Replay only — disable PostHog recording | Single replay tool. Sentry attaches replays to events natively (one-click pivot from event → replay). PostHog session_recording removed; PostHog stays for events/funnel only. | |
| Both — Sentry on errors, PostHog always-sampled | Sentry: low/zero `replaysSessionSampleRate`, high `replaysOnErrorSampleRate`. PostHog continues low-rate session recording for funnel/replay-from-PostHog-event. Two replay products, two storage costs, two privacy surfaces. | ✓ |
| PostHog Replay only — don't add Sentry Replay | Skip Sentry Replay; OBS-09 correlation flows through shared correlation ID linking Sentry event → PostHog session → pino logs (no native one-click). Re-interprets OBS-06 as "replay coverage exists" rather than "Sentry Replay specifically." | |

**User's choice:** Both — Sentry on errors, PostHog always-sampled (D-01)
**Notes:** Each tool has a distinct workflow — Sentry for error triage, PostHog for funnel investigation. Two privacy surfaces accepted as the cost of the dual workflow.

---

## Sentry Replay Trigger Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| On-error only (`replaysOnErrorSampleRate: 1.0`, session: 0) | No proactive recording. When a Sentry event fires (e.g., `captureTakeOrderFailure`), Sentry attaches the buffered last ~30–60s as a replay. Lowest cost, lowest privacy surface, perfectly aligned with OBS-09 triage workflow. Misses replays for trades that succeed-but-look-weird. | ✓ |
| Trade-page session bias (low rate global, 100% on trade pages) | `replaysSessionSampleRate: 0.05` globally; bump to `1.0` after route enter on `/trade/[id]`. Plus on-error at 1.0. Captures trade-page sessions even when no error fires. Higher storage cost. | |
| Trade-action bias (start replay on first Buy/Sell click) | `replaysSessionSampleRate: 0`; replay starts when user clicks Buy/Sell/limit-deploy submit. Tightest "transacting users only" framing, lowest noise. Misses pre-submit confusion (e.g., 5 min staring at form). | |

**User's choice:** On-error only (D-02)
**Notes:** Tight scope. Sentry Replay's job is to give the on-error triage flow a visual; PostHog low-rate sampling per D-04 catches succeed-but-look-weird sessions.

---

## Sentry Replay Masking Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Sentry defaults (mask all text + inputs) | `maskAllText: true` + `maskAllInputs: true`. Maximum privacy: addresses, balances, amounts, error messages all rendered as redacted blocks. Diagnostic value weak; privacy review trivial. | ✓ |
| Mask inputs + sensitive nodes only, unmask the rest | `maskAllInputs: true`, `maskAllText: false`, plus `mask` for wallet addresses (`data-sensitive`). Error banners, mode tabs, slippage labels visible. Higher diagnostic value; per-selector mask catalog discipline burden. | |
| Mask inputs only, addresses redacted via existing scrubber-style DOM walk | `maskAllInputs: true`, `maskAllText: false`, plus `beforeAddRecordingEvent` hook running the same address/signature regex from `src/lib/observability/scrub.ts`. Reuses v1.0 PII contract structurally. More code, more CPU per recorded mutation. | |

**User's choice:** Sentry defaults (D-03)
**Notes:** Privacy-first. The OBS-03 transcript + pino server logs carry the diagnostic detail; the replay's job is "confirm the user's path through the UI matches what the transcript says happened" — high-detail rendering not required.

---

## PostHog Session Recording Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Keep PostHog as-is, low session sampling for funnel context | Don't change `maskAllInputs: true`. Set/confirm `session_recording.sampleRate` low (e.g., 0.05–0.1) so funnel-driven replays exist for the PostHog dashboard but aren't a primary triage tool. PostHog replay supplementary; Sentry on-error replay primary. | ✓ |
| Tighten PostHog masking to match Sentry defaults | Add `maskAllText: true` + sensitive-class blocks so PostHog and Sentry replays have the same privacy bar. Single privacy review covers both. Funnel-context value drops further. | |
| Trade-flow only — disable PostHog replay outside trade pages | Stop PostHog session recording on non-trade pages; start on `/trade/*`. Aligns PostHog replay with "transacting users" framing; reduces storage cost. More wiring. | |

**User's choice:** Keep PostHog as-is, low session sampling for funnel context (D-04)
**Notes:** PostHog replay's role is funnel-investigation context, not error triage — current config already matches that intent; only the sample rate needs lowering.

---

## Claude's Discretion

User explicitly chose to wrap up after the Replay Stack area, leaving the following open for the researcher/planner:

- **OBS-07 event taxonomy schema** (namespacing convention, property contract, pino-mirror format, DCA-deploy event scope details)
- **OBS-08 funnel dashboard mechanism** (manual PostHog UI vs as-code; named drop-off step list)
- **OBS-09 correlation ID lifecycle** (mint site, header name, pino field schema, Dynamic embedded-wallet propagation)
- **OBS-10 verification protocol** (manual smoke vs scripted; staging vs prod-after-deploy; sign-off owner)
- **OBS-11 privacy review format** (checklist vs policy file; bar for "passes review")
- **Phase-internal sequencing & wave parallelism**
- **PostHog session_recording exact `sampleRate` value** (D-04 says low, e.g., 0.05–0.1; researcher picks based on storage cost vs funnel-investigation coverage)
- **CSP-violation re-test for Sentry Replay endpoints** (likely no change needed — same `*.ingest.de.sentry.io` already permitted — but researcher confirms with a recorded trade page)
- **Cookie-consent gating policy for Sentry Replay** (PostHog gates via `initAnalytics()` + consent callback; Sentry Replay's interaction with consent surface is researcher's call)

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section. Highlights:

- Per-RPC attribution restoration through viem fallback Transport (REL-02 follow-up, backlog 999.6) — not superseded by OBS-09 correlation ID
- `INTEGRATIONS.md` "No external error tracking SDK" drift correction — Sentry was added in v1.0 OBS-01 but the audit doc was not updated; opportunistic side-update or future docs phase
- Performance budgets / synthetic monitoring for the trade page — listed as future requirement; not v1.1
- Cross-environment test parity (Vercel preview running E2E suite against fork) — listed as future requirement; not v1.1
- Various v1.0 carry-forward backlog items (999.1–999.5, 999.7, 999.8) — separate from Phase 2 scope
