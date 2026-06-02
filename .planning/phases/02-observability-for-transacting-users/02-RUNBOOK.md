# Phase 2 Operator Runbook — Observability for Transacting Users

> Operator-facing recipes for the SaaS-side configuration that Phase 2 code (Plans
> 02-01..02-03) depends on, plus the OBS-10 production-smoke verification bundle.
>
> **Audience:** the human operator with admin access to the project's Sentry and
> PostHog accounts (EU region) and Vercel project. Code changes are out of scope
> for this document — see the Plan SUMMARY files in this directory for code
> deltas.
>
> **Decisions referenced:** D-01..D-04 from `.planning/phases/02-observability-for-transacting-users/02-CONTEXT.md`.

---

## §1. Sentry Project Replay Enable (D-02)

Phase 2 Plan 02-02 added `replayIntegration` to `src/hooks.client.ts` with
`replaysSessionSampleRate: 0` and `replaysOnErrorSampleRate: 1.0` (D-02 — no
proactive recording, full capture on error). The SDK call is in place but Sentry
also requires a project-level toggle in the dashboard before Replay events are
ingested.

### Steps

1. **Sign in** to https://sentry.io (EU region tenant per
   `02-CONTEXT.md` canonical_refs) using an admin account with project-settings
   permission.
2. Navigate to **Settings → Projects → [st0x project] → Replay**.
3. Toggle **"Session Replay"** to **ON** for the project.
4. Verify the Replay billing/quota tier supports `replaysOnErrorSampleRate: 1.0`
   (every errored session uploads a replay buffer). If quota is insufficient,
   either upgrade the plan or temporarily reduce the SDK sample rate in
   `hooks.client.ts` and redeploy — but D-02 prefers the full-rate-on-error
   stance, so the right path is usually the quota upgrade.
5. **After deploy of Plan 02-02 to production**, open a production trade page in
   Chrome DevTools and:
   - Confirm there are no CSP `worker-src` violations in the Console (Plan 02-02
     added `worker-src 'self' blob:` via `src/lib/server/csp.ts` to allow
     Sentry's replay worker — Pitfall 3 / Threat T-2-G).
   - Confirm a `POST` request to `*.sentry.io/api/.../envelope/` appears in the
     Network tab when an error fires (Replay flush).
6. Embed evidence:

```
[SCREENSHOT-1: Sentry project Replay settings page showing the Session Replay
toggle ON for the st0x project. Add the redacted screenshot here once captured.]
```

---

## §2. PostHog Session-Recording Sample Rate (D-04, Pitfall 1)

> **Critical — Pitfall 1 from `02-RESEARCH.md`:** PostHog session-recording
> sampling is configured in the **PostHog dashboard ingestion settings page**,
> NOT in the `posthog-js` init config in `src/lib/services/analytics.ts`. Setting
> `sampleRate` in `posthog.init({...})` does **not** apply to session recording
> in current PostHog SDK versions; only the dashboard control governs the
> on-recording sample. Do NOT add a `sampleRate` field to the SDK init.

### Steps

1. **Sign in** to https://eu.posthog.com (EU region per `02-CONTEXT.md`).
2. Navigate to **Settings → Replay** (the "Replay ingestion settings" page).
3. Set **"Session sample rate"** to **`0.05`** (5%) per D-04. This is the
   conservative starting point; if funnel-investigation usage demands more
   samples, raise to **`0.10`** (10%) — but never higher without revisiting
   `02-PRIVACY-REVIEW.md` and the cookie-consent stance.
4. Verify **`maskAllInputs: true`** is reported as active in the same panel
   (PostHog reads the SDK config from the most recent session). Code source of
   truth: `src/lib/services/analytics.ts` lines 27–32 — Plan 02-02 verified this
   stays intact (D-04).
5. **Smoke verify the rate-limit:** clear local site data, open a fresh
   incognito window, visit `/trade/[id]` on production, perform a small action
   (click a tab, scroll). In PostHog **"Replays"** tab, the recording should
   either appear (your session won the 5% bucket) or NOT appear (rate-limited).
   Repeat ~10 times to see the 0.05 rate in action — most attempts should NOT
   produce a stored recording.
6. Embed evidence:

```
[SCREENSHOT-2: PostHog Settings → Replay page showing Session sample rate 0.05
and maskAllInputs reported as active. Add the redacted screenshot here.]
```

---

## §3. OBS-08 Funnel Dashboard Build

Per `02-RESEARCH.md` Open Question 2 + Wave 4c: build **two funnels in one
dashboard**, each broken out by `order_type`. The events are emitted by the code
landed in Plan 02-03 — see `02-03-SUMMARY.md` for the per-component event
sequences.

### Dashboard

- **Name:** `Trade Funnels — Phase 2 Observability`
- **Owner:** product / observability lead
- **Date range:** rolling 7d default (operator can adjust per investigation)

### Funnel A — Intent → Submit (broken out by `order_type`)

| Step | Event                  | Filter              | Custom step label |
| ---- | ---------------------- | ------------------- | ----------------- |
| 1    | `page_viewed`          | `page = 'trade'`    | "Page Visit"      |
| 2    | `trade_button_clicked` | (any `order_type`)  | "Button Click"    |
| 3    | `quote_received`       | `order_type='market'` (limit/DCA do not have a pre-submit quote step — note this in dashboard description) | "Quote Shown"     |

Breakdown: enable **"Breakdown by event property → `order_type`"** so the funnel
renders three lines (`market`, `limit`, `dca`). The `quote_received` step will
show 0 for `limit` and `dca` — flag this in the dashboard description so a
viewer doesn't misread it as a drop-off.

### Funnel B — Submit → Confirmed (broken out by `order_type`)

| Step | Event                                                | Custom step label |
| ---- | ---------------------------------------------------- | ----------------- |
| 1    | `trade_button_clicked`                               | "Submit Click"    |
| 2    | `sign_trade`                                         | "User Signed"     |
| 3    | `broadcast`                                          | "Tx Broadcast"    |
| 4    | `confirmed` OR `limit_order_deployed` (composite step) | "Tx Confirmed"    |

Breakdown: **"Breakdown by event property → `order_type`"**.

Note on the composite step 4: `confirmed` is the market-order terminal event;
`limit_order_deployed` is the limit/DCA deploy terminal event. Per Plan 02-03
SDK-callback-collapse decision (`broadcast` and `confirmed` emitted back-to-back
at a single boundary), both events fire reliably for market flows. For
limit/DCA the deploy-confirmation event is `limit_order_deployed`. Use
PostHog's "OR" step composition feature, or build two funnels and overlay.

### Export funnel definitions

After the funnels render with real data:

1. PostHog UI: each funnel has an **"Export funnel definition"** action (or
   "Export as JSON" depending on UI version).
2. Save the exports to:
   - `.planning/phases/02-observability-for-transacting-users/artifacts/funnel-market.json`
   - `.planning/phases/02-observability-for-transacting-users/artifacts/funnel-limit.json`
   (If PostHog only exports the entire dashboard, save it as
   `funnel-trade.json` and note the combined nature in `02-04-SUMMARY.md`.)
3. The `artifacts/` directory must exist before commit:
   `mkdir -p .planning/phases/02-observability-for-transacting-users/artifacts`
4. Verify each JSON parses: `jq . artifacts/funnel-market.json`.
5. Commit the JSON exports as part of the operator-config commit.

> **Threat T-2-L (drift):** these JSON exports are documentation, not the source
> of truth. The PostHog dashboard is canonical. If the dashboard is materially
> edited, re-export and re-commit.

### Evidence

```
[SCREENSHOT-3: PostHog dashboard "Trade Funnels — Phase 2 Observability"
rendering Funnel A and Funnel B side-by-side, each with the order_type breakdown
populated by real events from a smoke trade. Add the redacted screenshot here.]
```

---

## §4. Cookie Consent Stance for Sentry Replay (D-02 + RESEARCH Open Question 3)

The operator decision recorded here, cross-referenced from `02-PRIVACY-REVIEW.md`
§4, is:

> **Sentry Replay is treated as "essential", not "analytics"**, because it
> activates only when an error fires (`replaysOnErrorSampleRate: 1.0`,
> `replaysSessionSampleRate: 0`) and is the primary error-triage tool. PostHog
> session recording (D-04, ~5–10% sample) is gated behind the existing cookie
> consent flow via `initAnalytics()`. Sentry is not gated.

If a future legal review reverses this stance, the change required is to gate
`Sentry.replayIntegration` in `src/hooks.client.ts` behind the same consent
callback that already wraps `initAnalytics`. This is documented as a follow-up
in `02-PRIVACY-REVIEW.md` §4.

### Operator/legal sign-off

```
Sentry Replay essential-tool stance approved by: ________________
Date: ____________
```

---

## §5. OBS-10 Production Smoke Verification

Per `02-RESEARCH.md` §"How OBS-10's real production trade roundtrip is captured"
— this mirrors the v1.0 PERF-01 HUMAN-UAT pattern (post-deploy human
verification, not synchronous CI gate).

### Recipe

1. **Deploy Phase 2 code** (Plans 02-01, 02-02, 02-03) to production AND complete
   §§1–3 above (Sentry Replay enable, PostHog sample rate, funnel dashboard).
2. **One Buy market trade** from a real wallet on production:
   - Small size, e.g. **$5 USDC of tNVDA** or any other tToken.
   - Use during NYSE hours so the trade goes through.
3. **One limit-order deploy** from a real wallet on production:
   - Either cancel immediately after deploy, or wait for natural fill.
4. **(Optional) One DCA deploy** if the operator's risk tolerance permits a
   real-funds DCA strategy. DCA was gap-filled from zero analytics in Plan 02-03
   so this is the first time DCA events flow end-to-end in production.
5. **One intentional failure case** to verify Sentry Replay attaches:
   - Submit a market order **outside NYSE hours** (e.g. weekend) — the
     `market_closed` error class fires and Sentry's on-error replay buffer
     uploads.
   - Or trigger a `slippage_exceeded` failure by setting an unrealistic
     slippage_bps.
6. **Pitfall 6 verification — Dynamic embedded wallet path:**
   At least ONE of the trades above MUST use a **Dynamic embedded wallet**
   (not just a wagmi-direct wallet like MetaMask). This verifies Assumption A6
   from `02-RESEARCH.md`: the embedded-wallet signing flow does not lose
   `trade_id` synchronous context across the SDK boundary. If the
   `trade_id` is missing from the Sentry event for the Dynamic flow but present
   for the wagmi flow, file a regression against Plan 02-03 — the
   submit-handler `try/finally` discipline may need to wrap the Dynamic-specific
   sign callback explicitly.

### Capture three screenshots per smoke trade

For each trade (especially the failure case + the Dynamic-wallet case), capture
all three:

```
[SCREENSHOT-4a: Sentry event detail page for the failure (or attached Replay
for an intentional failure). Verify the `trade_id` tag is visible in the tag
panel and the attached Replay loads. Add the redacted screenshot here.]

[SCREENSHOT-4b: PostHog event timeline filtered by `trade_id = <uuid>`.
Verify the OBS-07 step sequence appears in order: page_viewed → trade_button_clicked
→ (quote_received for market) → sign_trade → broadcast → confirmed
(or trade_failed for the intentional failure). Add the redacted screenshot here.]

[SCREENSHOT-4c: Vercel Logs filter showing pino lines with the matching
`trade_id` field. Verify at least one server-side log line carries the same
trade_id (proves X-Trade-Id header propagation works). Add the redacted
screenshot here.]
```

### Cross-tool correlation acceptance

For each smoke trade, **verify all three screenshots show the same `trade_id`
UUID value**. If yes → OBS-10 PASS. Record the verification in
`02-04-SUMMARY.md` along with timestamps and the redacted `trade_id` values.

---

## §6. Rollback Recipe

If post-deploy issues arise:

| Issue                                              | Action                                                                             | Effective                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| Sentry Replay quota burn / privacy concern         | Disable in Sentry dashboard (Settings → Replay → toggle OFF)                       | Immediate, no deploy               |
| PostHog session-recording too noisy                | Set sample rate to **0** in PostHog Settings → Replay                              | Immediate, no deploy               |
| `trade_id` cross-leaking between trades            | Revert Plan 02-03 component-side mint/clear edits — Plan 02-01/02-02 modules can stay (no consumer = no effect on Plan 02-01 modules) | Revert + redeploy                  |
| Funnel events flooding PostHog                     | Comment out `trackTradeEvent` calls in the noisiest component, redeploy             | One redeploy                       |
| CSP `worker-src` violations breaking Sentry Replay | Verify `src/lib/server/csp.ts` still has `'worker-src \'self\' blob:'` (Plan 02-02 added it; the unit test in `tests/lib/server/csp.test.ts` is the regression guard) | Code-fix + redeploy                |

The rollback prioritization is **operator-side first** (no deploy needed), then
code revert if the operator-side actions don't address the issue.

---

## §7. References

- `.planning/REQUIREMENTS.md` — OBS-06..OBS-11 acceptance criteria
- `.planning/phases/02-observability-for-transacting-users/02-CONTEXT.md` —
  D-01..D-04 locked decisions
- `.planning/phases/02-observability-for-transacting-users/02-RESEARCH.md` —
  full technical context including Pitfall 1 (PostHog dashboard sampling) and
  Pitfall 6 (Dynamic-wallet `trade_id` synchronous context)
- `.planning/phases/02-observability-for-transacting-users/02-01-SUMMARY.md` —
  trade_id lifecycle module + trackTradeEvent + pino RequestContext
- `.planning/phases/02-observability-for-transacting-users/02-02-SUMMARY.md` —
  Sentry Replay config + CSP extraction + Sentry trade_id tag
- `.planning/phases/02-observability-for-transacting-users/02-03-SUMMARY.md` —
  component-side instrumentation (MarketOrder + LimitOrder + DcaOrder + page_viewed)
- `.planning/phases/02-observability-for-transacting-users/02-PRIVACY-REVIEW.md` —
  OBS-11 sign-off checklist
- Sentry SvelteKit Replay docs: https://docs.sentry.io/platforms/javascript/guides/sveltekit/session-replay/
- PostHog session sampling docs: https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record

> Per `CLAUDE.md` "avoid over-engineering": this RUNBOOK is operator-facing prose,
> not code. No new abstractions; recipe-style throughout.
