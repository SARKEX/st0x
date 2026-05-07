# Phase 2 Privacy Review (OBS-11)

> Operator sign-off checklist for the Phase 2 observability surface. Each
> section ends with a sign-off line that the human operator (or designated
> reviewer) initials and dates after walking through the cited code/policy.
>
> **Audit-of-record reference:** `.planning/codebase/CONCERNS.md` is the
> canonical PII guidance for this codebase; this checklist cross-references it
> and verifies Phase 2 introduces no regression.
>
> **In-scope artefacts under review:**
> - `src/hooks.client.ts` (Sentry Replay integration — Plan 02-02)
> - `src/lib/services/analytics.ts` (PostHog session_recording config — pre-existing)
> - `src/lib/observability/scrub.ts` (Sentry boundary scrubber — pre-existing OBS-01)
> - `src/lib/services/observability/tradeEvents.ts` (Plan 02-01 — `TradeEventProps`, `scrubProps`)
> - `src/lib/services/observability/tradeId.ts` (Plan 02-01 — UUIDv4 lifecycle)
> - `.planning/phases/02-observability-for-transacting-users/02-CONTEXT.md` decisions D-03, D-04

---

## §1. Replay Masking — Sentry vs PostHog Delta

| Surface              | Mask Config                                                      | Source                                            | Rationale                                                                                                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry Replay        | `maskAllText: true`, `maskAllInputs: true`, `blockAllMedia: true` | `src/hooks.client.ts` (Plan 02-02)                | **D-03** — maximum-privacy posture for fintech. Text is rendered as redacted blocks (Sentry replays show structure but no content); inputs are masked; media is blocked. Threat T-2-C mitigated.                                                                |
| PostHog session rec. | `maskAllInputs: true` (no `maskAllText`)                         | `src/lib/services/analytics.ts` lines 27–32       | **D-04** — input masking only. Text is visible because (a) the dashboard sample rate is low (5–10% per RUNBOOK §2), (b) the PostHog UI is admin-only-readable, (c) the trade-page surface contains addresses/balances/error-text that are non-PII per CONCERNS. |

### Delta explanation

Sentry is **stricter** than PostHog (text masking on Sentry, off on PostHog).
PostHog plays the funnel-investigation role per **D-01** — funnel breakdowns
need readable error-text and slippage values to debug drop-offs. The lower
PostHog sample rate (D-04) bounds the data volume. Sentry plays the
error-triage role and gets the maximum-masking treatment because errored
sessions are 100% sampled (D-02 `replaysOnErrorSampleRate: 1.0`).

**No regression vs v1.0 OBS-01 stance:** wallet addresses already classified
as public on-chain identifiers (per `.planning/codebase/CONCERNS.md`). Any
text rendering of wallet addresses in PostHog replays is the same risk class
as wallet addresses in PostHog event payloads (which v1.0 already accepts).

### Sign-off

```
Reviewed by: ________________   Date: ____________
```

---

## §2. Event Property Contract Audit (OBS-07 / `TradeEventProps`)

Every field of `TradeEventProps` from `src/lib/services/observability/tradeEvents.ts`,
classified per project policy:

| Field             | PII Classification | Source / Notes                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_type`      | NOT PII            | Enum: `market` / `limit` / `dca`.                                                                                                                                                                                                                                                     |
| `order_side`      | NOT PII            | Enum: `buy` / `sell`.                                                                                                                                                                                                                                                                 |
| `mode`            | NOT PII            | Enum: `spendUpTo` / `buyUpTo`.                                                                                                                                                                                                                                                        |
| `asset_symbol`    | NOT PII            | Enum drawn from project token list (e.g. `tNVDA`, `tAMZN`).                                                                                                                                                                                                                           |
| `payment_symbol`  | NOT PII            | Enum: `USDC` / `USDT` / `WETH`.                                                                                                                                                                                                                                                       |
| `amount`          | NOT PII            | Decimal string from `formatUnits` — purely numeric.                                                                                                                                                                                                                                   |
| `slippage_bps`    | NOT PII            | Integer.                                                                                                                                                                                                                                                                              |
| `error_class`     | NOT PII            | Enum from `ErrorClass` union (11 members — `slippage_exceeded`, `no_liquidity`, etc.).                                                                                                                                                                                                |
| `error_message`   | **POTENTIAL PII**  | Free text from upstream errors. Plan 01 `scrubProps` redacts `0x[40]` (addresses) and `0x[130]` (signatures) defensively before payload reaches `track()`. Caller responsibility (per `CONCERNS.md`): pass `error.message`, never `error.cause.tx.from` or raw error objects. |
| `trade_id`        | NOT PII            | UUIDv4, opaque, no derivation from PII. Strict regex validation in `requestContextHandle` (Plan 02-01) prevents header-injection.                                                                                                                                                     |
| `wallet_address`  | **PII (project policy)** | Auto-added by `track()` enrichment (`src/lib/services/analytics.ts` lines 91–108) lowercase-normalized. PostHog policy: admin-only-readable. Pre-existing v1.0 OBS-01 stance — Phase 2 does **not** regress.                                                                          |
| `auth_method`     | NOT PII            | Enum: `wallet` / `dynamic` / `none`.                                                                                                                                                                                                                                                  |
| `network`         | NOT PII            | Public chain metadata.                                                                                                                                                                                                                                                                |
| `chain_id`        | NOT PII            | Public chain metadata.                                                                                                                                                                                                                                                                |

### Coverage of legacy call-site extras

The `[key: string]: unknown` escape hatch in `TradeEventProps` tolerates legacy
extras such as `token_symbol`, `intended_trade_size_usd`, `quote_count`,
`avg_price`, `period`, `period_unit`, `limit_price`. None of these introduce
new PII surface — they are all numeric/enum/symbol data.

### Sign-off

```
Reviewed by: ________________   Date: ____________
```

---

## §3. Sentry Boundary Scrubber Coverage

`src/lib/observability/scrub.ts` patterns intact (verified line-by-line):

```ts
const ADDR_RE = /0x[a-fA-F0-9]{40}/g;          // → '[REDACTED_ADDR]'
const SIG_RE  = /0x[a-fA-F0-9]{130}/g;         // → '[REDACTED_SIGNATURE]'
const SIG_QUERY_RE = /([?&])signature=[^&]*/g; // → 'signature=[REDACTED]'
```

`SIG_QUERY_RE` runs **before** `SIG_RE` to catch URL-encoded forms first
(Pitfall 9 from OBS-01 era).

### Wiring verification

Plan 02-02 **regression-guard** test asserts that `beforeSend` and
`beforeBreadcrumb` in `src/hooks.client.ts` are still wired through
`scrubSentryEvent` from `scrub.ts`. The Phase 2 Replay addition was additive
to `Sentry.init`; the OBS-01 scrubber wiring was preserved verbatim.

Test of record: `tests/lib/observability/sentryReplayConfig.test.ts` (Plan 02-02
Test 5 — "OBS-01 scrubber wiring intact").

### Recursive walk

`scrubSentryEvent` walks the full event/breadcrumb tree (see `walk(value)` in
`scrub.ts`). This matters for Replay because Replay events embed deeply nested
DOM-event payloads where addresses might surface in `data.url` or `data.text`
fields of breadcrumbs.

### Sign-off

```
Reviewed by: ________________   Date: ____________
```

---

## §4. Cookie Consent Stance for Sentry Replay

Per `02-RESEARCH.md` Open Question 3:

- **PostHog** is gated behind cookie consent via the existing v1.0
  `initAnalytics()` callback wiring. Session recording (D-04) inherits this
  gating because `posthog-js` is only loaded after consent.
- **Sentry** runs from module load **without** consent. Sentry's
  `replaysOnErrorSampleRate: 1.0` means Replay buffers exist in memory but are
  only uploaded when an error fires (`replaysSessionSampleRate: 0` —
  no proactive recording per **D-02**).

### Stance

Sentry Replay is treated as **"essential"** (error-triage tool, not analytics).
This stance is documented in `02-RUNBOOK.md` §4 and recorded here so a future
operator/legal review has the rationale captured.

### Action item if legal review reverses the stance

Gate `Sentry.replayIntegration` in `src/hooks.client.ts` behind the same
consent callback that wraps `initAnalytics()`. **NOT required** for this phase
per `02-RESEARCH.md` recommendation. Threat T-2-D documented as
"mitigate (documented)" in this plan's threat register.

### Operator/legal sign-off

```
Sentry Replay essential-tool stance approved by: ________________
Date: ____________
```

---

## §5. CONCERNS.md Cross-Reference Audit

Walk every PII-adjacent recommendation in `.planning/codebase/CONCERNS.md`
(the audit-of-record). For each, verify Phase 2 introduces no regression:

- [ ] **Wallet-address handling** — `track()` enrichment in
      `src/lib/services/analytics.ts` lowercase-normalizes wallet addresses
      (existing v1.0 wiring). No Phase 2 code adds raw mixed-case addresses to
      events; verified by inspection of `tradeEvents.ts` and the three component
      submit handlers (Plan 02-03).
- [ ] **Signature handling** — `scrub.ts` `SIG_RE` covers `0x[130]`. No Phase 2
      code logs signatures: verified by `grep -rn "0x[a-fA-F0-9]\{130\}"
      src/lib/services/observability src/lib/components/orders` returning zero
      hits in Plan 01/02/03 modules.
- [ ] **Error-message contents** — Plan 01 `scrubProps` (in `tradeEvents.ts`)
      redacts before payload reaches `track()`. Plan 02-03 component error
      classifiers pass `error.message` (string) to `trackTradeEvent`, never raw
      `error` objects or `error.cause`. Verified by source inspection of
      `MarketOrder.svelte` / `LimitOrder.svelte` / `DcaOrder.svelte` error
      handlers per Plan 02-03 SUMMARY.
- [ ] **Replay capture** — D-03 maximum masking on Sentry side
      (`maskAllText` + `maskAllInputs` + `blockAllMedia`); D-04 input masking
      on PostHog side at low sample rate.

Add specific line-references to `.planning/codebase/CONCERNS.md` sections during
the operator review pass (e.g. "CONCERNS.md §X.Y line N — wallet-address
public-identifier classification").

### Sign-off

```
CONCERNS.md cross-reference complete: ________________   Date: ____________
```

---

## §6. Acceptance Summary

All five sections (§1–§5) signed off → **OBS-11 complete**. The reviewer
countersigns here as the Phase-2 close-out gate:

```
OBS-11 closed by: ________________   Date: ____________
```

After countersignature:
- Mark OBS-11 complete in `.planning/REQUIREMENTS.md`.
- Reference this file path in `02-04-SUMMARY.md` along with the dated
  sign-offs.

> Per `CLAUDE.md` "avoid over-engineering": this is a checklist file, not a
> policy framework. No new abstractions; no new code touched by this document.
