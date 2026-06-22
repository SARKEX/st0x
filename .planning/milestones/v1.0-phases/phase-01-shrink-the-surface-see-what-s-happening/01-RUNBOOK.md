# Phase 1 — Operational Runbook

**Phase:** 01-shrink-the-surface-see-what-s-happening
**Created:** 2026-04-29
**Status:** Phase 1 plans complete; deployment handoff items below

This runbook is the deployment handoff artifact for Phase 1. Per CONTEXT D-15 the take-order
failure capture is browser-tier dual-sink (Sentry + `console.error` JSON) — there is no
server-relayed take-order endpoint. Per CONTEXT D-17 the chain-exhausted alert transport is
Telegram (NOT Slack as originally drafted in D-09). Read all sections before deploying.

## Observability Dashboards

### Vercel Speed Insights (OBS-05) — Trade-page web vitals baseline

- **URL:** `https://vercel.com/st-0x/st0x/observability/speed-insights`
- **Status:** receiving data — confirmed via Vercel API (`speedInsights.hasData: true`,
  enabled 2025-07-21, ~9 months of historical data; webAnalytics also enabled with data).
  Verification was done by the orchestrator against the Vercel project state — no end-user
  roundtrip was required at Phase 1 closure.
- **Project slugs:** `team = st-0x`, `project = st0x`, `project_id =
  prj_tTuOMTtlZKU2tOXN4UQCfnsDxlmv`
- **Production URLs:** primary `https://www.st0x.io` (also `https://st0x.io`,
  `https://platform.st0x.io`)
- **Latest production deploy at Phase 1 close:** `dpl_6HPaU2XzxMfxUPS2H8MugpXYsrdx`
  (status: Ready, Node 22.x)
- **Metrics tracked:** LCP, CLS, INP, TTFB
- **Per-route focus:** `/trade/[token]` (highest-traffic page; baseline against which
  Phase 2 / PERF-01 will set the explicit p75 LCP target)
- **Phase 2 / PERF-01 hand-off:** This dashboard is the baseline against which the explicit
  p75 LCP threshold is set during Phase 2 planning. PERF-01 is the requirement that turns
  this baseline into an actionable target.
- **Cookie consent:** Speed Insights injection is consent-gated. **Documentation correction:**
  the original 01-CONTEXT/01-04-PLAN text stated `injectSpeedInsights()` lives in
  `src/lib/components/CookieConsent.svelte`. In the actual codebase it lives in
  `src/routes/+layout.svelte:31` and is invoked via the `onAnalyticsAccepted` prop callback
  wired into the `<CookieConsent />` component (see `src/routes/+layout.svelte:107`). Same
  net effect — consent-gated injection — but if the dashboard ever empties, look at the
  layout file's `enableAnalytics()` function, not `CookieConsent.svelte`.

### Sentry — Client + Server error tracking (OBS-01)

- **Org URL:** `https://sentry.io/organizations/{slug}/` — to be filled in at Sentry
  provisioning time. Until provisioned, Sentry init in `hooks.{client,server}.ts` is gated
  on `!dev && Boolean(env.{PUBLIC_,}SENTRY_DSN)` so missing DSN no-ops gracefully (no
  cold-start crash; `Sentry.captureException` calls become safe no-ops).
- **Project URL:** `https://sentry.io/organizations/{slug}/projects/{project-slug}/` — same
  caveat.
- **Region:** US (default per RESEARCH A2). The CSP `connect-src` in `src/hooks.server.ts`
  permits `https://*.ingest.sentry.io` and `https://*.ingest.us.sentry.io`. **If the
  operator picks EU at Sentry account-creation time**, they MUST also add
  `https://*.ingest.de.sentry.io` to the CSP `connect-src` BEFORE deploying with the EU
  DSN — otherwise events will silently fail with browser CSP violations (Pitfall 1 — CSP
  wildcards do not cross dot boundaries).
- **DSN env vars** (Vercel project):
    - `SENTRY_DSN` (server) — same value as below
    - `PUBLIC_SENTRY_DSN` (client; `PUBLIC_`-prefixed for SvelteKit Vite bundling)
- **Build env vars** (Vercel project, scope: Production only — Pitfall 4: PR previews
  build cleanly without these):
    - `SENTRY_AUTH_TOKEN` — auth token for sourcemap upload at build time
    - `SENTRY_ORG` — org slug
    - `SENTRY_PROJECT` — project slug
- **Configuration:** errors-only (`tracesSampleRate: 0`, `integrations: []`, no Replay,
  no Performance, no Feedback widget — free-tier conservation per CONTEXT D-06).
- **PII scrubbing:** Recursive `beforeSend` + `beforeBreadcrumb` walker (Pitfall 9 — both
  hooks; breadcrumbs include URLs which can carry `?signature=` params). Regex denylist for
  `0x[a-f0-9]{40}` (wallet → `[REDACTED_ADDR]`), `0x[a-f0-9]{130}` (signature →
  `[REDACTED_SIGNATURE]`), and `?signature=...` URL params (→ `?signature=[REDACTED]`).
  Implementation in `src/lib/observability/scrub.ts`; 5 unit tests at
  `tests/lib/observability/scrub.test.ts`.
- **Free-tier limit:** 5K events/month. Per RESEARCH A6, if take-order failure rates
  exhaust the budget, add per-error-class `ignoreErrors` (e.g., user-rejected wallet
  errors).

### Telegram bot — Chain-exhausted RPC alerts (OBS-04, D-17 supersedes the original D-09 Slack choice)

- **Bot:** name to be confirmed at provisioning time (e.g., `st0x_alerts_bot` from
  BotFather).
- **Chat:** team alerts group on Telegram — confirm at provisioning time.
- **Env vars** (Vercel project, scope: Production):
    - `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN`
    - `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`
- **Fail-closed pattern:** if either var is missing in production, alerts no-op (logged
  via pino at error level via `[alerts] OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN or
  OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID not configured in production — alerts disabled`);
  cold-start NOT killed. Mild form per RESEARCH §"Pattern 4" (`src/lib/server/alerts.ts`).
- **Alert payload:** function name, attempted RPC list, last error per RPC (each capped to
  512 chars per V5 ASVS — `ERROR_TEXT_CAP`), `request_id` from `getRequestContext()`. POSTed
  as plain text (no `parse_mode`) to avoid MarkdownV2 escape pitfalls. Telegram
  `sendMessage` cap is 4096 chars; 8 RPCs × 512 = 4096 — well within when truncated per-error.
- **Dedupe:** none in Phase 1 (every-occurrence per CONTEXT D-09). If chain-exhaust alerts
  get noisy, add a 5-minute dedupe window in a follow-up phase.
- **Known limitation (T-06-04):** the `rpcUrl` strings in `generator.ts:callRpc` contain
  the hardcoded Alchemy API key (per CONCERNS.md SEC-01). These will appear in Telegram
  alert payloads. SEC-01 in Phase 3 fixes this by env-var-izing the key. Phase 1 leak is
  bounded by who can read the team Telegram chat (same trust boundary as the codebase, so
  accepted as residual risk). The `accessCodes.ts:verifyWalletSignature` instrumentation
  uses the stable identifier `'alchemy-base-mainnet'` instead of the URL precisely to avoid
  this leak path on that surface.

### pino structured logging → Vercel Logs (OBS-02)

- **No external drain in Phase 1.** Vercel Logs only.
- **Vercel Logs URL pattern:** `https://vercel.com/st-0x/st0x/logs`
- **Required fields per request:** `request_id`, `wallet`, `route`, `method`, `status`,
  `latency_ms`, `level`, `msg`, `error.*`.
- **Per-route log levels** (from `pickLevelForRoute` in `src/lib/server/logger.ts`):
    - `5xx` → error (status takes precedence over route bucket)
    - `4xx` → warn (status takes precedence over route bucket)
    - `/api/snapshots/*` → warn (D-07 noisy-route quieting)
    - `/api/cron/*`, `/api/admin/*`, `/api/access/*` → info
    - default → info
- **request_id propagation:** AsyncLocalStorage from `node:async_hooks`; first link in the
  SvelteKit `handle` sequence chain (`sequence(requestContextHandle,
  Sentry.sentryHandle(), existingHandle)`). Echoed in `x-request-id` response header for
  client correlation. Sentry breadcrumbs inherit the request_id automatically because
  `requestContextHandle` runs BEFORE `Sentry.sentryHandle()` in the sequence.
- **request_id source:** `event.request.headers.get('x-request-id') ?? randomUUID()` from
  `node:crypto` (CSPRNG-backed, V6 ASVS — T-05-06 mitigation). Reuses a client-supplied id
  for cross-correlation when present.
- **Wallet retention:** full wallet retained in pino logs (NOT truncated). Per D-07: Vercel
  Logs is admin-only-readable; Sentry's `beforeSend` scrubber handles the third-party SaaS
  exposure separately. Two-layer redaction would lose forensic value.
- **redact paths:** pino built-in redact covers `req.headers.authorization`,
  `req.headers.cookie`, `*.signature`, `*.privateKey` at any depth (T-05-01 mitigation).
- **Pitfall 2:** Edge runtime breaks AsyncLocalStorage. Verified at Plan 01-05 install
  time (and re-verified at Phase 1 exit) that no route exports
  `config = { runtime: 'edge' }`. If a future route needs Edge, it MUST opt out of pino
  logging.

## Vercel Project Environment — Deploy Checklist

The following manual steps are required at deploy time. Code changes alone are not
sufficient. Until each section is completed, the corresponding observability surface
no-ops gracefully.

### Add (new in Phase 1)

| Env var | Scope | Source |
|---------|-------|--------|
| `SENTRY_DSN` | Production + Preview | Sentry Project Settings → Client Keys (DSN) |
| `PUBLIC_SENTRY_DSN` | Production + Preview | Same value as `SENTRY_DSN` |
| `SENTRY_AUTH_TOKEN` | Production only (Pitfall 4 — PR previews skip sourcemap upload) | Sentry → Settings → Auth Tokens (scopes: `project:write` + `project:releases`) |
| `SENTRY_ORG` | Production only | Sentry org slug (visible in dashboard URL) |
| `SENTRY_PROJECT` | Production only | Sentry project slug |
| `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` | Production only | Telegram → @BotFather → /newbot (D-17) |
| `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID` | Production only | Add bot to alerts group → GET `https://api.telegram.org/bot{TOKEN}/getUpdates` → `result[].message.chat.id` (D-17; group/channel IDs are negative integers, e.g. `-100123456789`) |

### Remove (Phase 1 deletions)

| Env var | Reason | Plan |
|---------|--------|------|
| `LP_SUBGRAPH_URL` | LP attribution subgraph deleted (D-05) | 01-01 (DEPR-02) |
| `ONRAMPER_SECRET_KEY` | Onramper integration deleted (DEPR-03) | 01-03 |
| `PUBLIC_ONRAMPER_API_KEY` | Same | 01-03 |
| `PUBLIC_ONRAMPER_ENV` | Same | 01-03 |

## Smoke Tests

Run after deploy to verify Phase 1 observability is live. Each smoke test is independent;
the operator can run any in any order.

### Smoke 1: Sentry receives a test error with PII scrubbed (OBS-01)

1. In dev or staging (with `PUBLIC_SENTRY_DSN` set in `.env.local`), throw a test error
   from a `+page.svelte`:
   `throw new Error('test [0xabcdef0123456789abcdef0123456789abcdef01]');`
2. Refresh the page.
3. Open the Sentry project dashboard → Issues. The new event should appear within ~30s.
4. Verify the event title contains `[REDACTED_ADDR]` (NOT the raw `0xabcdef...` hex).
5. Browser DevTools Network tab: confirm a successful POST to
   `*.ingest.us.sentry.io/api/.../envelope/...` (HTTP 200).
6. Browser DevTools Console: confirm NO CSP violations on Sentry endpoints. (If you DO see
   a CSP violation: the Sentry org region is EU — add `https://*.ingest.de.sentry.io` to
   the connect-src in `src/hooks.server.ts` per the CSP note above.)

### Smoke 2: pino emits a request log line with request_id (OBS-02)

1. `curl -i https://www.st0x.io/api/access/check?code=ST0X-TEST-TEST` (or any logged
   route).
2. The response includes a header: `x-request-id: <uuid-v4>`.
3. Repeat with a client-supplied id to confirm reuse:
   `curl -i -H 'x-request-id: trace-abc' https://www.st0x.io/api/access/check`
   → response header `x-request-id: trace-abc`.
4. Open Vercel Logs → filter by route `/api/access/check`. The most recent log line is a
   JSON object with the same `request_id` and fields `route`, `method`, `status`,
   `latency_ms`, `msg: "request"`.

### Smoke 3: Chain-exhausted Telegram alert fires (OBS-04, D-17)

Manual triggering is invasive (needs all RPCs blocked). Postpone until first natural
occurrence — the chat will fire automatically on real chain-exhausts. To pre-validate
end-to-end:

1. In a staging deploy with both `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` and
   `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID` set to a test bot/chat, deliberately
   misconfigure `RPC_URLS` in a feature branch (`'http://127.0.0.1:1'` — closed port,
   forces ECONNREFUSED) and trigger `/api/admin/snapshots/preview`.
2. Confirm a `🚨 st0x RPC chain exhausted — <fn>` message arrives in Telegram with
   function name + attempted RPC URLs (each capped at 512 chars) + last error per RPC +
   `request_id`.
3. Confirm a pino `rpc_chain_exhausted` JSON line appears in Vercel Logs with the same
   `request_id` and `level: error`.
4. Fail-closed validation: unset either Telegram env var in a separate staging deploy,
   trigger chain-exhausted, confirm the pino log line `[alerts]
   OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN or OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID not
   configured in production — alerts disabled` appears at error level and the endpoint
   still returns its normal response (no 500, cold-start not killed).
5. Revert the misconfiguration.

### Smoke 4: Take-order failure transcript is captured (OBS-03 / D-08 acceptance)

1. In dev with `PUBLIC_SENTRY_DSN` set, open the trade UI for any token (e.g.,
   `/trade/tNVDA`).
2. Force a "no liquidity" path. Easiest options:
   - Open a Sell order with an asset balance of 0, OR
   - Browser DevTools → Network tab → block requests to `*goldsky.com*` (the orderbook
     subgraph) → click Buy/Sell with any amount.
3. Click Sell → triggers `executeMarketOrder`.
4. Open browser DevTools console → confirm a single line of the form:
   `[take-order failed] {"ts":"...","reason":"no_quotes_available","fullQuotePayload":[],...}`.
5. Open Sentry → Issues. Confirm a new event with `tags.failure_reason =
   no_quotes_available` (or whatever reason fired) and `extra.fullQuotePayload` matching
   the input.
6. Confirm `extra.walletAddress` is `[REDACTED_ADDR]` in the Sentry event (Plan 01-04's
   `beforeSend` handles this; the console-line JSON shows it UNREDACTED — that's
   intentional per D-15 since the browser console is the wallet owner's own machine and
   PostHog session-replay is admin-only-readable).
7. **D-08 acceptance check:** verify a developer can replay the exact subgraph quote
   (from `extra.fullQuotePayload`) + on-chain state (from `extra.onChainStateRead`) without
   contacting the user. The fields are sufficient for manual replay; an admin replay tool
   (`/admin/replay/{request_id}`) is deferred per CONTEXT Deferred Ideas.

**D-08 Phase 1 transcript completeness — known limitation (per checker W3 audit):**

- `transcript.subgraphQuoteHash` — POPULATED via SHA-256 of `fullQuotePayload`
  (`crypto.subtle.digest('SHA-256', JSON.stringify(externalQuotes))`, hex-encoded with
  `0x` prefix; verified at Phase 1 exit by
  `grep -q "crypto.subtle.digest" src/lib/services/marketOrderExecution.ts`).
- `transcript.fullQuotePayload` — POPULATED with the filtered external quotes (the exact
  local-walk input).
- `transcript.onChainStateRead.orderHash` — POPULATED from
  `firstQuote.sgOrder.orderHash ?? firstQuote.orderHash` (locally available; no new
  on-chain read).
- `transcript.onChainStateRead.IOIndex.input` / `.output` — POPULATED from
  `firstQuote.inputIOIndex` / `firstQuote.outputIOIndex` (locally available; same data the
  existing `dispatchTakeOrders` call already uses).
- `transcript.onChainStateRead.vaultBalance` — **NULL in Phase 1**. Reading vault balance
  requires a new on-chain `getVaultBalance` call at submission time, which is **Phase 2 /
  TRADE-03** scope (the freshness-illusion fix introduces a server-side pre-flight read
  that surfaces vault balance at the failure point). The `fullQuotePayload` + Sentry stack
  + `IOIndex.*` populated above provide sufficient replay context for Phase 1's
  failure-mode debugging — a developer with the failure event can pull the on-chain vault
  balance manually via `cast call` against the orderbook + IOIndex pair if needed.

## Cross-Cutting Cleanup Verification

Run after all Phase 1 plans complete (UI-SPEC non-blocking rec #2). Each grep MUST return
0 hits except the explicitly-allowed retentions called out in the comments.

```bash
# DEPR-03 — Onramper integration removed
grep -rn "Onramper\|onramper\|ONRAMPER" src/                                    # MUST return 0 hits
grep -rn "Buy crypto\|buyCrypto" src/                                            # MUST return 0 hits
grep -rn "Add Funds\|Add funds" src/                                             # MAY have hits — review for context

# DEPR-01 — User-facing rewards removed (referrals + announcement modal kept per D-14 + D-16)
grep -rn "rewards" src/lib/ src/routes/                                          # ONLY announcement-related survivors (TokenSwapAnnouncementModal — moved to announcements/) + referrals.ts (kept per D-14)

# DEPR-02 — LP attribution subgraph removed (D-05)
grep -rn "LP_SUBGRAPH_URL" src/ .env.example                                    # MUST return 0 hits

# DEPR-02 — Per-wallet monthly points removed (snapshot pipeline retained for TVL/volume aggregates per D-01)
grep -rn "monthlyPoints\|MonthlyPointsData" src/                                 # ONLY src/lib/server/kv.ts (type def with D-04 comment) + src/lib/server/referrals.ts (consumer, kept per D-14) + Phase 4 / TEST-04 remnants if any

# DEPR-01 / DEPR-03 — Public/server routes deleted
grep -rn "/api/onramper" src/                                                    # MUST return 0 hits
grep -rn "/api/rewards" src/                                                     # MUST return 0 hits
grep -rn "/api/public/wallet\|/api/public/rewards-apy\|/api/public/rocketboost" src/  # MUST return 0 hits

# Pitfall 2 — No Edge runtime introduced (would break AsyncLocalStorage in OBS-02)
grep -rnE "runtime.*['\"]edge['\"]" src/routes/                                  # MUST return 0 hits

# OBS-03 — All take-order failure paths wrapped (D-08 / Plan 01-07 acceptance)
grep -c "failWith(" src/lib/services/marketOrderExecution.ts                     # MUST be ≥8 (actual: 11 — 9 call sites + 2 helper-definition references)
```

## Deferred Items (Phase 2/3/4 scope)

Captured for handoff. None blocks Phase 1 closure.

| Item | Phase | Notes |
|------|-------|-------|
| Trade-page p75 LCP target | Phase 2 / PERF-01 | Set against this Speed Insights baseline |
| Take-order replay admin tool (`/admin/replay/{request_id}`) | Future | Out of Phase 1 |
| External log drain (Better Stack / Axiom / Datadog) | If Vercel Logs proves insufficient | If pain shows |
| Sentry alert dedupe windows | If chain-exhaust alerts get noisy | TBD |
| hCaptcha fail-closed on Vercel preview | Phase 3 / SEC-07 | Phase 3 |
| Hardcoded Alchemy key removal | Phase 3 / SEC-01 | Closes T-06-04 (Telegram alert leak) |
| RPC retry-with-backoff in callRpc | Phase 3 / REL-01 | Phase 3 |
| EIP-1271/6492 fallback chain in accessCodes | Phase 3 / REL-02 | Phase 3 |
| Vendor Rain strategies registry | Phase 3 / REL-03 | Phase 3 |
| `+error.svelte` user-visible error page | If product needs surface | Out of Phase 1 (D-12) |
| `transcript.onChainStateRead.vaultBalance` in OBS-03 | Phase 2 / TRADE-03 | D-08-LIMITATION; requires server-side pre-flight vault read |
| OBS-03 take-order failure UX re-classification | Phase 2 / TRADE-04 | User-facing error strings preserved verbatim through Phase 1 |
| Orphaned rewards-only `CACHE_KEYS` entries in `src/lib/server/cache.ts` | Phase 2 or follow-up cleanup | Logged in `.planning/phases/.../deferred-items.md` (01-02 discovery) |
| 4 pre-existing svelte-check errors in `src/lib/stores/transaction.ts` | Phase 2 / TRADE-01..04 | Lines 664, 686, 708, 2346; baseline since 01-01 |

## Phase 1 → Phase 2 Hand-off

- **OBS-03 capture is wired and verified.** Phase 2 / TRADE-03 (freshness illusion fix)
  can rely on the transcript fields to confirm regressions: every "no liquidity" failure
  on the live system already emits a complete Sentry event + console-line JSON containing
  the input quote payload + the on-chain order identity. A dev can pull the event, replay
  the quote, and validate that the refactor actually fixed the failure mode.
- **OBS-03 transcript completeness limit:** `vaultBalance` is null in Phase 1
  (D-08-LIMITATION). TRADE-03 introduces the server-side pre-flight vault read that
  populates it. Until then, manual `cast call` against the orderbook + IOIndex pair
  retrieves vault balance ad-hoc.
- **All 8 Phase 1 REQ-IDs closed:** DEPR-01, DEPR-02, DEPR-03, OBS-01, OBS-02, OBS-03,
  OBS-04, OBS-05.
- **Sentry org / Telegram bot are operational follow-ups** — code ships inert until the
  operator provisions both. See "Vercel Project Environment — Deploy Checklist" above.

---

*Phase: 01-shrink-the-surface-see-what-s-happening*
*Runbook authored: 2026-04-29 at Phase 1 exit (Plan 01-08, Task 2).*
