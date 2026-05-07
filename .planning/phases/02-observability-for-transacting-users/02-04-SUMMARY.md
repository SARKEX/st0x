---
phase: 02-observability-for-transacting-users
plan: 04
subsystem: observability
tags: [observability, posthog, funnel, privacy-review, runbook, operator, OBS-08, OBS-10, OBS-11]
requires:
  - "Plan 02-01 (trade_id lifecycle + trackTradeEvent + pino RequestContext)"
  - "Plan 02-02 (Sentry Replay integration + CSP worker-src + trade_id Sentry tag)"
  - "Plan 02-03 (component instrumentation + page_viewed + DCA gap-fill)"
provides:
  - "Operator runbook (02-RUNBOOK.md) — Sentry Replay enable, PostHog session-recording sample rate, OBS-08 funnel build, OBS-10 production smoke recipe, rollback recipe"
  - "OBS-11 privacy review checklist (02-PRIVACY-REVIEW.md) — 6 sign-off sections covering D-03/D-04 masking delta, TradeEventProps PII classification, scrub.ts coverage, cookie-consent stance, CONCERNS.md cross-reference"
  - "Empty artifacts/ directory with .gitkeep — placeholder for funnel JSON exports captured during operator-side Task 3"
affects:
  - "Phase 2 close-out — pending operator completion of Tasks 3 + 4 to ship OBS-08 / OBS-10 / OBS-11"
tech_stack:
  added: []
  patterns:
    - "Operator-runbook structure mirrors v1.0 phase-01 RUNBOOK shape (numbered sections, recipe-style steps, screenshot-as-attachment placeholders, rollback table)"
    - "Privacy-review checklist with per-section sign-off lines + final countersignature gate (matches typical fintech security-review-template)"
key_files:
  created:
    - ".planning/phases/02-observability-for-transacting-users/02-RUNBOOK.md"
    - ".planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md"
    - ".planning/phases/02-observability-for-transacting-users/artifacts/.gitkeep"
  modified: []
decisions:
  - "RUNBOOK §3 (OBS-08) uses two funnels in one dashboard with order_type breakdown — Funnel A intent→submit (page_viewed→trade_button_clicked→quote_received) and Funnel B submit→confirmed (trade_button_clicked→sign_trade→broadcast→confirmed/limit_order_deployed). The composite step 4 uses PostHog's OR-step composition because market terminal is `confirmed` while limit/DCA terminal is `limit_order_deployed`."
  - "RUNBOOK §5 OBS-10 recipe makes Pitfall 6 verification (Dynamic embedded wallet path) MANDATORY for at least one smoke trade — documented inline as a numbered step rather than a footnote, because Plan 02-03's submit-handler discipline has only been tested at the source-content level for the wagmi-direct path; the Dynamic-wallet flow is the regression-risk surface."
  - "PRIVACY-REVIEW §4 records the 'Sentry Replay = essential' cookie-consent stance with operator/legal sign-off line. If reversed, the action item is to gate `Sentry.replayIntegration` behind `initAnalytics` consent — explicit follow-up rather than ambiguous deferral."
  - "PRIVACY-REVIEW §2 enumerates ALL TradeEventProps fields including legacy escape-hatch extras (token_symbol, intended_trade_size_usd, quote_count, avg_price, period, period_unit, limit_price) so that future additions to `TradeEventProps` are forced through this checklist (Threat T-2-M mitigation)."
metrics:
  duration: ~3 min
  completed: 2026-05-07T09:55:50Z
  tasks_completed: 2  # Tasks 1+2 of 4 — Tasks 3+4 are operator checkpoints
  tasks_pending: 2    # operator-side dashboard config + OBS-10 smoke
  test_files_added: 0
---

# Phase 2 Plan 4: Operator-Configuration Artifacts Summary

The two repo-side authorings for Plan 02-04 are landed: `02-RUNBOOK.md` (operator
recipes for Sentry Replay enable, PostHog session-recording sample rate, OBS-08
funnel dashboard build, OBS-10 production smoke verification, and rollback) and
`02-PRIVACY-REVIEW.md` (OBS-11 sign-off checklist with six sections and operator
sign-off lines). The plan's other two tasks are **operator-action checkpoints**
that cannot be automated — they require admin access to Sentry / PostHog
dashboards plus a real production trade roundtrip — and are paused for human
operator execution.

## Files Created

| Path                                                                                                | Purpose                                                                  | Lines |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----- |
| `.planning/phases/02-observability-for-transacting-users/02-RUNBOOK.md`                             | Operator runbook — 7 sections, recipe-style                              | 286   |
| `.planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md`                      | OBS-11 sign-off checklist — 6 sections                                   | 210   |
| `.planning/phases/02-observability-for-transacting-users/artifacts/.gitkeep`                        | Placeholder; funnel JSON exports land here during operator Task 3        | 0     |

## RUNBOOK Sections

1. **Sentry project Replay enable** (D-02) — dashboard toggle, CSP `worker-src`
   verify, billing/quota check.
2. **PostHog session-recording sample rate** (D-04, **Pitfall 1** — set in
   PostHog dashboard ingestion settings page, NOT in `posthog-js` init code).
3. **OBS-08 funnel dashboard build** — two funnels (Intent→Submit + Submit→Confirmed)
   in one dashboard, broken out by `order_type`, with custom step labels and
   JSON exports to `artifacts/funnel-market.json` + `funnel-limit.json`.
4. **Cookie consent stance for Sentry Replay** — essential-tool stance with
   operator/legal sign-off.
5. **OBS-10 production smoke verification** — real production trade recipe
   (Buy market + limit deploy + intentional failure) with three-screenshot
   bundle (Sentry / PostHog / Vercel Logs) sharing the same `trade_id`.
   Includes mandatory **Pitfall 6** Dynamic-embedded-wallet verification step.
6. **Rollback recipe** — operator-side first (Sentry toggle / PostHog rate to 0),
   code revert second.
7. **References** — REQUIREMENTS, CONTEXT, RESEARCH, three Plan SUMMARYs,
   Sentry + PostHog official docs.

## PRIVACY-REVIEW Sections

1. **Replay masking — Sentry vs PostHog delta** — table comparing D-03
   (`maskAllText`+`maskAllInputs`+`blockAllMedia`) vs D-04 (`maskAllInputs` only)
   with rationale for the asymmetry.
2. **Event property contract audit** — every field of `TradeEventProps` from
   `tradeEvents.ts` classified (NOT PII / POTENTIAL PII / PII per project
   policy), including legacy escape-hatch extras.
3. **Sentry boundary scrubber coverage** — `scrub.ts` regex constants verbatim
   (`ADDR_RE`, `SIG_RE`, `SIG_QUERY_RE`), wiring verification cross-references
   Plan 02-02 regression test.
4. **Cookie consent stance** — Sentry-Replay-as-essential rationale + reversal
   action item + operator/legal sign-off.
5. **CONCERNS.md cross-reference audit** — four checklist items
   (wallet addresses, signatures, error messages, Replay capture).
6. **Acceptance summary** — countersignature gate that triggers the
   REQUIREMENTS.md OBS-11 close.

## Decisions Implemented (this plan)

- **D-04 (PostHog low session sample rate)** — RUNBOOK §2 documents the 0.05
  baseline (raise to 0.10 if needed), Pitfall 1 explicitly called out so
  operator does NOT add `sampleRate` in `analytics.ts`.
- **D-01 PostHog half** — RUNBOOK §3 OBS-08 funnel build uses the typed
  `TradeEventName` event-name vocabulary from Plan 02-01 verbatim.
- **OBS-08 funnel definition** — fully specified in repo (RUNBOOK §3); the
  PostHog UI build itself is operator Task 3.
- **OBS-10 smoke recipe** — fully specified including Pitfall 6
  Dynamic-wallet step; the actual smoke is operator Task 4.
- **OBS-11 checklist** — fully authored; sign-offs are operator Task 4.

## Tasks 3 + 4 — Operator Checkpoints (paused)

Plan 02-04 was authored as `autonomous: false` because four key actions cannot
be automated:

| Task | Type                       | Action                                                                                  | Why not automatable                                                                                          |
| ---- | -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 3    | `checkpoint:human-action`  | Sentry Replay project toggle ON                                                         | Sentry project-settings dashboard has no public API for the Replay toggle.                                   |
| 3    | `checkpoint:human-action`  | PostHog session sample rate = 0.05                                                      | Per Pitfall 1, this is a dashboard-only setting (not exposed via SDK init or REST API).                      |
| 3    | `checkpoint:human-action`  | OBS-08 funnel dashboard build + JSON export                                             | Funnel-builder UI is operator-driven; JSON export lands `artifacts/funnel-market.json` + `funnel-limit.json`. |
| 4    | `checkpoint:human-verify`  | OBS-10 production smoke (real trade) + screenshot bundle + OBS-11 sign-offs filled in   | Requires real funds, real wallet, real production deploy.                                                    |

These checkpoints are documented in the plan and in this SUMMARY. Phase 2 is
**not** considered shippable until Tasks 3 + 4 are completed by the operator
and the evidence (funnel JSON + OBS-10 screenshots + OBS-11 sign-offs) is
committed.

## Threat Mitigations Landed

| Threat                                                         | Component                                  | Mitigation                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **T-2-K** Wallet addresses in OBS-10 screenshots               | RUNBOOK §5                                 | Recipe instructs operator to redact wallet addresses in screenshots before commit. `trade_id` UUIDv4 is opaque — non-PII.                  |
| **T-2-L** Funnel JSON drift from PostHog dashboard             | RUNBOOK §3 + PostHog dashboard             | Documented as accept — repo JSON is documentation, not source of truth. RUNBOOK instructs re-export when funnel is materially edited.     |
| **T-2-D** Cookie-consent bypass for Sentry Replay              | PRIVACY-REVIEW §4                          | "Essential-tool" stance documented with operator/legal sign-off line. Action item recorded if stance is reversed.                          |
| **T-2-M** OBS-11 review missed a PII-bearing event property    | PRIVACY-REVIEW §2 + §6 countersignature    | Every `TradeEventProps` field enumerated; future additions require revisiting checklist (acceptance gated by §6 countersignature).         |

## Commits

| Hash      | Type | Description                                                  |
| --------- | ---- | ------------------------------------------------------------ |
| `f02783f` | docs | author 02-RUNBOOK.md operator recipes (7 sections + artifacts/) |
| `f04047d` | docs | author 02-PRIVACY-REVIEW.md OBS-11 sign-off checklist (6 sections) |

## Verification

- `test -f .planning/phases/02-observability-for-transacting-users/02-RUNBOOK.md` → **FOUND**
- `test -f .planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md` → **FOUND**
- `grep -c "OBS-08\|OBS-10\|D-02\|D-04\|Pitfall 1" 02-RUNBOOK.md` = **17** (≥5 required)
- `grep -c "SCREENSHOT" 02-RUNBOOK.md` = **6** (≥4 required — placeholders 1, 2, 3, 4a, 4b, 4c)
- `grep -c "trade_id" 02-RUNBOOK.md` = **12** (≥3 required)
- `grep -c "^## §" 02-RUNBOOK.md` = **7** (all 7 sections present)
- `grep -c "Reviewed by\|approved by:\|cross-reference complete:\|closed by:" 02-PRIVACY-REVIEW.md` = **11** (≥5 required, six sign-off lines: §1, §2, §3, §4 (Sentry), §5, §6 countersignature)
- `grep -c "TradeEventProps\|trade_id\|maskAllText\|maskAllInputs" 02-PRIVACY-REVIEW.md` = **8** (≥4 required)
- `grep -c "scrub.ts\|CONCERNS.md" 02-PRIVACY-REVIEW.md` = **13** (≥2 required)
- `grep -c "^## §" 02-PRIVACY-REVIEW.md` = **6** (all 6 sections present)
- `[ -d .planning/phases/02-observability-for-transacting-users/artifacts ]` → **FOUND**

## Deviations from Plan

None — Tasks 1 + 2 executed exactly as the plan specified. Tasks 3 + 4 are
operator checkpoints, paused as designed.

## Open Follow-ups (operator)

1. **Task 3 (checkpoint:human-action)** — operator runs RUNBOOK §1, §2, §3
   in Sentry + PostHog dashboards; commits funnel JSON exports to
   `.planning/phases/02-observability-for-transacting-users/artifacts/`.
2. **Task 4 (checkpoint:human-verify)** — operator runs OBS-10 production
   smoke per RUNBOOK §5 (real trade roundtrip including a Dynamic-embedded-wallet
   trade per Pitfall 6); embeds three screenshots per smoke trade in
   `02-RUNBOOK.md` §5; fills the five operator sign-off lines + countersignature
   in `02-PRIVACY-REVIEW.md`.
3. **Phase 2 close** — after Tasks 3 + 4, mark OBS-08, OBS-10, OBS-11 complete
   in `.planning/REQUIREMENTS.md`; update `.planning/ROADMAP.md` Phase 2
   progress to 4/4 plans + 6/6 REQ-IDs; run `/gsd-verify-work`.

## TDD Gate Compliance

N/A — this plan authors documentation only; no executable code paths added.

## Self-Check: PASSED

- `[ -f .planning/phases/02-observability-for-transacting-users/02-RUNBOOK.md ]` → FOUND
- `[ -f .planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md ]` → FOUND
- `[ -d .planning/phases/02-observability-for-transacting-users/artifacts ]` → FOUND
- `[ -f .planning/phases/02-observability-for-transacting-users/artifacts/.gitkeep ]` → FOUND
- Commit `f02783f` (RUNBOOK) present in `git log` → FOUND
- Commit `f04047d` (PRIVACY-REVIEW) present in `git log` → FOUND
