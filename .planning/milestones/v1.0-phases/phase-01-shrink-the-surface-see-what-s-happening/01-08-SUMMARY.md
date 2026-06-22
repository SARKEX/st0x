---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 08
subsystem: observability
tags: [obs-05, runbook, phase-exit, speed-insights, telegram, sentry, pino]

# Dependency graph
requires: [01-01, 01-02, 01-03, 01-04, 01-05, 01-06, 01-07]
provides:
  - "01-RUNBOOK.md NEW — Phase 1 operational runbook with Speed Insights URL (https://vercel.com/st-0x/st0x/observability/speed-insights), Sentry org/Telegram bot provisioning state, env-var deploy checklist (5 add + 4 remove), 4 smoke tests (Sentry/pino/Telegram/OBS-03), cross-cutting cleanup grep recipe, deferred items table"
  - "Phase exit verification battery passed: npm run check (4 pre-existing transaction.ts errors, baseline since 01-01), npm test (447 pass / 1 skipped, no regressions), SENTRY_AUTH_TOKEN= npm run build (Vite phase ✓ built in 16.65s; post-Vite Vercel adapt fails on local Node v24 — pre-existing env issue documented since 01-04), 8 cross-cutting cleanup greps (7 clean + 1 stale-comment hit logged as deferred), Pitfall 2 (no Edge runtime), failWith count = 9 ≥ 8"
  - "Vercel Speed Insights confirmed receiving data — orchestrator-verified via Vercel API at Phase 1 exit (speedInsights.hasData=true, enabled 2025-07-21, ~9 months of data; webAnalytics also enabled). NO end-user roundtrip needed — user delegated the check."
  - "Documentation correction recorded in runbook: injectSpeedInsights() lives in src/routes/+layout.svelte:31 (consent-gated via onAnalyticsAccepted callback wired into <CookieConsent />), NOT src/lib/components/CookieConsent.svelte as the original CONTEXT/PLAN text stated."
  - "Phase 1 → Phase 2 hand-off documented: OBS-03 capture wired and verified; TRADE-03 (freshness illusion fix) can rely on transcript fields; transcript.onChainStateRead.vaultBalance stays null in Phase 1 (D-08-LIMITATION → TRADE-03)."
affects: ["Phase 2"]

# Tech tracking
tech-stack:
  added: []  # No code changes in this plan — verification + documentation only
  patterns:
    - "Verify-only + documentation plan: no source-code edits; phase-exit verifier runs read-only against the codebase. Deviations surfaced to deferred-items.md instead of fixing in-flight (per scope_guard)."
    - "Orchestrator-mediated checkpoint resolution: Task 1's human-verify checkpoint was resolved by the orchestrator querying the Vercel API (project state) instead of round-tripping to the user. Resolved URL + data-confirmed status fed forward into Task 2's RUNBOOK template."
    - "RUNBOOK as deployment artifact: documents the inert-until-provisioned state of Sentry org + Telegram bot; until each is provisioned, the corresponding observability surface no-ops gracefully (Sentry init gated on !dev && DSN; alerts.ts logs error + returns null when bot env vars missing)."

key-files:
  created:
    - ".planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md (328 lines — Speed Insights URL + Sentry/Telegram provisioning state + env-var deploy checklist (5 add / 4 remove) + 4 smoke tests + cross-cutting cleanup grep recipe + deferred items table + Phase 1 → Phase 2 hand-off)"
  modified: []  # Phase exit verification only; no code changes

key-decisions:
  - "Task 1 checkpoint resolved by orchestrator-side Vercel API call (not user). Per the resume-context, the user delegated verification — orchestrator queried Vercel project state directly: speedInsights.hasData=true (since 2025-07-21, ~9 months of historical data), webAnalytics also enabled with data, project_id prj_tTuOMTtlZKU2tOXN4UQCfnsDxlmv. No end-user round-trip needed."
  - "RUNBOOK records a documentation correction over the original plan: injectSpeedInsights() lives in src/routes/+layout.svelte:31 (consent-gated via onAnalyticsAccepted prop callback wired into <CookieConsent />), NOT in CookieConsent.svelte as the original 01-CONTEXT and 01-08-PLAN text stated. Same net effect — consent-gated injection — but file pointer was wrong; future debugging will be easier with the correct location."
  - "Verbatim D-17 Telegram phrasing throughout RUNBOOK: 12 Telegram references, 2 Slack references (both historical context — explaining D-09 Slack-incoming-webhook was superseded by D-17 Telegram during execution). Env vars are OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN + OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID, NOT OBSERVABILITY_ALERT_WEBHOOK_URL — matches the actual code in src/lib/server/alerts.ts post-Plan 01-06 D-17 amendment."
  - "Phase exit verification ran without modifying source code per scope_guard. The two pre-existing local-environment issues (post-Vite Vercel adapt failure on Node v24; 4 svelte-check errors in transaction.ts) are explicitly carried forward as documented baselines, NOT regressions. Both are owned by Phase 2 / TRADE-01..04."
  - "One stale comment hit (src/lib/server/cache.ts:48-53) surfaced during the /api/rewards grep — comments reference deleted helpers in present tense. Logged as a deferred item; NOT auto-fixed (scope_guard prohibits source-code edits in this plan; cleanup is owned by the next plan that touches cache.ts per the existing 01-02 deferred-items entry)."

patterns-established:
  - "Phase-exit verification battery as a documented set: type-check + test + build + cross-cutting cleanup grep + Pitfall 2 + OBS-03 failWith count + Sentry-init gating sanity check. Reusable for Phase 2/3/4 phase-exit plans by adapting the grep set to the phase's deletion graph."
  - "Pre-existing baselines explicitly recorded: each phase exit notes which pre-existing failures (svelte-check errors, build adapter issues) are unchanged from the phase-start baseline so future phase-exit plans can compare apples-to-apples."

requirements-completed: [OBS-05]

# Metrics
duration: 12min  # Includes Task 2 (RUNBOOK write) + Task 3 (verification battery)
completed: 2026-04-29
---

# Phase 1 Plan 08: OBS-05 Speed Insights confirmation + RUNBOOK + phase-exit verification

**Closed Phase 1 by writing the operational runbook (`01-RUNBOOK.md`, 328 lines) documenting the Vercel Speed Insights dashboard URL (`https://vercel.com/st-0x/st0x/observability/speed-insights` — confirmed receiving data via Vercel API at orchestration time, no user roundtrip needed), Sentry org + Telegram bot provisioning state (D-17 supersedes D-09 Slack), the env-var deploy checklist (5 adds / 4 removes), 4 smoke tests, the cross-cutting cleanup grep recipe, and the deferred items table — then ran the phase-exit verification battery (type-check at 4-pre-existing-error baseline, 447 tests pass, Vite build clean, 7 of 8 cross-cutting greps clean with 1 stale-comment hit logged as deferred, Pitfall 2 re-verified, OBS-03 failWith count = 9). All 8 Phase 1 REQ-IDs closed (DEPR-01..03, OBS-01..05). Phase 2 unblocked.**

## Performance

- **Duration:** ~12 min (1 RUNBOOK commit + verification battery + final docs commit)
- **Started:** 2026-04-29T12:34:00Z (continuation agent spawned post-Task-1 orchestrator-verified checkpoint)
- **Completed:** 2026-04-29T12:46:00Z (this SUMMARY)
- **Tasks:** 3 of 3 (Task 1 = verify-only, resolved by orchestrator-side Vercel API check; Task 2 = RUNBOOK write; Task 3 = phase-exit verification battery)
- **Commits:** 1 task commit (Task 2: 58a5825) + 1 final docs commit to follow

## Accomplishments

### Task 1 (Resolved by orchestrator pre-check — no user roundtrip)

- **Vercel Speed Insights confirmed receiving data.** Orchestrator queried the Vercel API for project `st0x` (team `st-0x`, project_id `prj_tTuOMTtlZKU2tOXN4UQCfnsDxlmv`) and verified `speedInsights.hasData: true` with `enabledAt: 1753100699206` (2025-07-21 — ~9 months of LCP/CLS/INP/TTFB data). Web Analytics also enabled with data.
- **Documentation correction discovered.** The original 01-CONTEXT.md (line 37) and 01-08-PLAN.md (interfaces block) stated `src/lib/components/CookieConsent.svelte` calls `injectSpeedInsights()`. In the actual codebase the call lives in `src/routes/+layout.svelte:31` and is invoked via the `onAnalyticsAccepted` prop callback wired into `<CookieConsent />` at line 107 (the `<CookieConsent />` component fires the callback after consent is accepted; the layout's `enableAnalytics()` function does the actual injection). Same net effect — consent-gated injection — but the file pointer was wrong. Recorded in the RUNBOOK so future debugging lands on the correct file.
- **Resolved URL captured for Task 2:** `https://vercel.com/st-0x/st0x/observability/speed-insights`.

### Task 2 (RUNBOOK creation — `58a5825`)

- **`.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` created (328 lines).**
- **Observability Dashboards section:** documents Vercel Speed Insights URL (with data-confirmed status), Sentry org/project URL stubs (with EU-region warning per Pitfall 1), Telegram bot/chat provisioning steps (D-17 supersedes D-09 — env vars `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` + `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`, NOT the original `OBSERVABILITY_ALERT_WEBHOOK_URL`), and pino → Vercel Logs (no external drain in Phase 1, per-route level matrix from `pickLevelForRoute`).
- **Vercel Project Environment — Deploy Checklist:** 5 adds (SENTRY_DSN + PUBLIC_SENTRY_DSN, SENTRY_AUTH_TOKEN/ORG/PROJECT, OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN/CHAT_ID — table totals 7 rows since SENTRY_DSN/PUBLIC are listed separately for clarity) and 4 removes (LP_SUBGRAPH_URL, ONRAMPER_SECRET_KEY, PUBLIC_ONRAMPER_API_KEY, PUBLIC_ONRAMPER_ENV).
- **4 Smoke Tests:** Sentry test event with PII redaction (Smoke 1), pino x-request-id header echo + Vercel Logs JSON line (Smoke 2), Telegram chain-exhausted alert + fail-closed validation (Smoke 3), OBS-03 take-order failure transcript replay (Smoke 4 — includes the D-08 acceptance check + the D-08-LIMITATION on `vaultBalance` flagged as Phase 2 / TRADE-03).
- **Cross-Cutting Cleanup Verification:** 9 grep recipes covering Onramper, Buy crypto / buyCrypto, LP_SUBGRAPH_URL, /api/onramper, /api/rewards, /api/public/wallet|/api/public/rewards-apy|/api/public/rocketboost, monthlyPoints/MonthlyPointsData (with allowed retentions per D-04 + D-14), Edge runtime (Pitfall 2), and `failWith` count.
- **Deferred Items table:** 12 rows covering PERF-01 (LCP target), `/admin/replay/{request_id}`, external log drain, Sentry alert dedupe, SEC-07 (hCaptcha preview), SEC-01 (Alchemy key removal), REL-01/REL-02/REL-03, `+error.svelte` (D-12), TRADE-03 (vaultBalance), TRADE-04 (UX re-classification), CACHE_KEYS orphan, and the 4 pre-existing transaction.ts svelte-check errors.
- **Phase 1 → Phase 2 Hand-off:** OBS-03 wired & verified, all 8 Phase 1 REQ-IDs closed, vaultBalance limit + Sentry/Telegram operational follow-ups noted.

### Task 3 (Phase-exit verification — read-only, no source edits)

| # | Verification | Result | Notes |
|---|---|---|---|
| 1 | `npm run check` | 4 errors (pre-existing baseline since 01-01) | Same 4 lines in `src/lib/stores/transaction.ts`: 664, 686, 708, 2346. Phase 2 / TRADE-01..04 work. **0 NEW errors introduced by this plan or any prior Phase 1 plan.** |
| 2 | `npm test -- --run` | 447 passed / 1 skipped (25 test files) | Same baseline as 01-06 / 01-07. No regressions. |
| 3 | `SENTRY_AUTH_TOKEN= npm run build` (Pitfall 4) | Vite phase: ✓ built in 16.65s. Post-Vite Vercel adapt fails locally with `Building locally with unsupported Node.js version: v24.1.0. Please use Node 18, 20 or 22`. | Pre-existing local-environment issue documented in 01-04..07 SUMMARYs. Vercel CI runs Node 22 by default — uneffected. Sentry plugin produced zero output (Pitfall 4 gating verified). |
| 4 | `grep -rn "Onramper\|onramper\|ONRAMPER" src/` | 0 hits ✓ | DEPR-03 cross-cutting cleanup verified. |
| 5 | `grep -rn "Buy crypto\|buyCrypto" src/` | 0 hits ✓ | UI-SPEC non-blocking rec #2 verified. |
| 6 | `grep -rn "LP_SUBGRAPH_URL" src/ .env.example` | 0 hits ✓ | D-05 verified. |
| 7 | `grep -rn "/api/onramper" src/` | 0 hits ✓ | DEPR-03 routes deleted. |
| 8 | `grep -rn "/api/rewards" src/` | **1 hit (stale comment in `src/lib/server/cache.ts:48-53`)** | The 01-02 deferred-items.md already logged the orphaned `CACHE_KEYS` cluster + stale comment. Comment references deleted helper functions in past tense; the actual route is gone. **Logged as a deferred item; NOT auto-fixed (scope_guard prohibits source-code edits in this plan).** |
| 9 | `grep -rn "/api/public/wallet\|/api/public/rewards-apy\|/api/public/rocketboost" src/` | 0 hits ✓ | DEPR-01 public-rewards APIs deleted. |
| 10 | `grep -rn "monthlyPoints\|MonthlyPointsData" src/` | Only retentions per D-04 + D-14: `kv.ts` (type def with D-04 comment) + `referrals.ts` (consumer per D-14) + `rewards/rewardsCommon.ts` (surviving consumer for `/api/admin/referral-programme/leaderboard` per 01-01 D-01 deferred decision) | All hits documented; `rewardsCommon.ts` is the surviving "extract `getCurrentMonth`/`getDaysInMonth` to `$lib/utils/dates.ts` before deletion" item from 01-01 — explicit retention. |
| 11 | `grep -rnE "runtime.*['\"]edge['\"]" src/routes/` | 0 hits ✓ | Pitfall 2 re-verified — no Edge route added during Phase 1. |
| 12 | `grep -c "failWith(" src/lib/services/marketOrderExecution.ts` | 9 (≥8 required) ✓ | OBS-03 transcript completeness — all 9 INCLUDE failure paths wrapped (no_quotes_available x1, no_walk_fills x1, unhydrated_fills x1, aggregated_failed x3, caught_exception x3). The 'Wallet not connected' branch at line 193 remains EXCLUDED per RESEARCH §OBS-03 (not a no-liquidity scenario). |
| 13 | Sentry init gating sanity check (`grep "enabled: !dev"`) | 2 hits (`hooks.client.ts:16`, `hooks.server.ts:19`) ✓ | Both tiers gated on `!dev && Boolean(env.{PUBLIC_,}SENTRY_DSN)`; SDK no-ops cleanly when DSN is absent. |

**Net new errors / test failures introduced by Phase 1:** 0.
**Cross-cutting cleanup hit count:** 7 of 8 grep categories return exactly the expected 0; 1 returns a stale comment which was already known and logged before this plan as a deferred item (orphaned CACHE_KEYS + stale comment block in `cache.ts` — owned by the next plan that touches `cache.ts`).

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1 (verify-only):** No commit — read-only verification done at orchestrator level via Vercel API. The resolved URL was passed forward to Task 2 in the executor's prompt context.

2. **Task 2: Create Phase 1 operational runbook (OBS-05 + deploy checklist)** — `58a5825` (docs)
   - NEW `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` (328 lines)
   - Verification: 14 acceptance-criteria grep proofs all PASS

3. **Task 3 (verification battery):** No source-code commit — read-only phase-exit verification only. Results recorded in this SUMMARY (table above) and in the cross-cutting cleanup section of the runbook.

(Final docs/metadata commit follows this SUMMARY.md and STATE.md / ROADMAP.md / REQUIREMENTS.md updates.)

## Files Created/Modified

**New (1):**
- `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` (328 lines)

**Modified (0):**
None. Phase-exit verification was read-only against source code. State/Roadmap/Requirements updates land in the final docs commit alongside this SUMMARY.

## Decisions Made

- **Task 1's checkpoint was resolved by the orchestrator querying the Vercel API (project state), NOT by an end-user round-trip.** The user explicitly delegated this check. Outcome: `speedInsights.hasData: true`, `enabledAt: 1753100699206` (2025-07-21, ~9 months of data). The continuation agent (this executor) treated the orchestrator-supplied URL + status as the resolved checkpoint output and recorded the verified URL verbatim in the runbook.
- **The runbook records a documentation correction over the original plan/CONTEXT text.** `injectSpeedInsights()` lives in `src/routes/+layout.svelte:31`, NOT in `src/lib/components/CookieConsent.svelte`. The `<CookieConsent />` component invokes the layout-defined `enableAnalytics()` callback via the `onAnalyticsAccepted` prop, which then calls `injectSpeedInsights()` along with `injectAnalytics()` and `initAnalytics()` (PostHog). Same consent-gating semantics. Future debugging of Speed Insights gaps should look at the layout file's `enableAnalytics()` function.
- **The runbook fully reflects D-17 Telegram-not-Slack.** 12 Telegram references, 2 Slack references (both clearly historical context — "D-09 Slack-incoming-webhook was superseded by D-17 Telegram during execution"). Env vars are `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` + `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`, matching the post-D-17 code in `src/lib/server/alerts.ts`.
- **Task 3's stale-comment hit in `cache.ts:48-53` was logged as a deviation, NOT auto-fixed.** The comment references deleted helper functions (`invalidatePublicApiCaches`, `invalidateRewardsCaches`) in past tense and the `/api/rewards/*` and `/api/public/*` paths in present tense ("still read them"). The actual routes are deleted; only the stale doc text survives. Per scope_guard ("You are NOT editing source code"), this plan does not fix the comment. The fix is owned by the next plan that touches `cache.ts` (per the existing entry in `deferred-items.md` from 01-02).
- **Pre-existing local-environment issues are documented as baselines, NOT regressions.** Two known issues survive Phase 1 unchanged: (a) 4 svelte-check errors in `src/lib/stores/transaction.ts` (Phase 2 / TRADE-01..04 work, baseline since 01-01); (b) post-Vite Vercel adapt fails locally on Node v24 (Vercel CI uses Node 22 — unaffected). Both documented in 01-04 through 01-07 SUMMARYs; this SUMMARY confirms they remain unchanged at Phase 1 exit.
- **`failWith` count interpretation:** the verification expects ≥8; current count is 9 (matches Plan 01-07's 9 INCLUDE paths discovered when the orchestrator's pre-flight table over-counted to 8). 9 ≥ 8 = pass. The grep `-c "failWith("` counts only lines with `failWith(`, which excludes the helper definition line `const failWith = (` (no `(` immediately follows the identifier). 01-07-SUMMARY's "11" was a different grep variant; the contract is the count of call sites, and 9 is correct.

## Deviations from Plan

### Logged-not-fixed (per scope_guard)

**1. [Rule 1 — Documentation drift] Stale `/api/rewards/*` reference in `src/lib/server/cache.ts:48-53` comment block**
- **Found during:** Task 3 cross-cutting cleanup grep (`grep -rn "/api/rewards" src/`)
- **Issue:** The comment block at lines 48-53 references deleted helper functions and routes in the present tense ("the surviving rewards APIs in `/api/rewards/*` and `/api/public/*` still read them"). The actual routes were deleted in Plans 01-01 + 01-02; only this stale comment survives.
- **Decision:** NOT auto-fixed. Per scope_guard ("You are NOT editing source code. The phase-exit verification is read-only against the codebase. Any code changes that surface during verification are deviations — surface as Rule 1 / Rule 4, do NOT fix in this plan."), this plan recorded the discovery without modifying source.
- **Owner:** The next plan that touches `cache.ts` (per the existing deferred-items.md entry from 01-02 — the orphaned `CACHE_KEYS` cluster needs pruning at the same time).
- **Files affected:** `src/lib/server/cache.ts` (lines 48-53 only)
- **Impact:** Zero behavioral. Comment-only documentation drift; misleading to future readers but doesn't change runtime behavior.

### Discrepancies vs the orchestrator's plan/CONTEXT text

**2. `injectSpeedInsights()` location was misstated in the original plan**
- **Found during:** Task 1 pre-check (orchestrator-mediated)
- **Original plan/CONTEXT text:** "`src/lib/components/CookieConsent.svelte` calls `injectSpeedInsights()`"
- **Actual codebase:** `injectSpeedInsights()` is called in `src/routes/+layout.svelte:31`, inside the `enableAnalytics()` function which is passed as the `onAnalyticsAccepted` prop callback to `<CookieConsent />` (line 107 of `+layout.svelte`).
- **Decision:** Recorded as a documentation correction in the RUNBOOK; the original plan/CONTEXT text was not edited (those are immutable historical artifacts of the planning phase). The correction is forward-looking — future debugging lands on the right file.
- **Impact:** Zero behavioral. Same net effect (consent-gated injection); only the file pointer was wrong.

---

**Total deviations:** 1 logged-not-fixed (Rule 1 — documentation drift, scope_guard) + 1 documentation correction (orchestrator pre-flight discovery).

**Impact on plan:** All `must_haves.truths`, `acceptance_criteria`, and the orchestrator's `success_criteria` from the resume_instructions are satisfied. Phase 1's phase-level `success_criteria` from `01-08-PLAN.md` are all met.

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors at lines 664, 686, 708, 2346 — carried over from 01-01 baseline. Unchanged. Owned by Phase 2 / TRADE-01..04.
- **Local Node v24 vs adapter-vercel's Node 18/20/22 requirement:** Pre-existing local environment issue identical to 01-04..07. Vite phase succeeds (`✓ built in 16.65s`); only post-Vite Vercel adapt step fails. Vercel CI is unaffected.
- **Stale `/api/rewards/*` reference in `cache.ts:48-53` comment block:** Logged as a deviation (Rule 1 — documentation drift), NOT auto-fixed per scope_guard. Owned by the next plan that touches `cache.ts`.

## Threat Flags

None new. All work was within the plan's `<threat_model>` scope:

- **T-08-01 accepted** — RUNBOOK.md contents (Vercel team/project slugs `st-0x` / `st0x`, Sentry org/project URL patterns, Telegram bot setup recipe) are not secrets; the actual secrets (DSN, auth token, bot token, chat id) live in Vercel env vars and are NOT committed.
- **T-08-02 accepted** — Phase exit verification was carried out manually by this executor and reported through the SUMMARY; the GSD framework's plan-checker re-runs at orchestrator level when the planning phase is closed.
- **T-08-03 mitigated** — Speed Insights data flow confirmed at orchestrator level via Vercel API (not "empty dashboard" — actual `hasData: true` since 2025-07-21). The empty-dashboard recovery path is documented in the RUNBOOK in case the dashboard ever empties post-deploy.

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `test -f .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — verified
- [x] `grep -q "Vercel Speed Insights" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 1 hit (heading)
- [x] `grep -q "speed-insights" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — multi-hits (URL and section)
- [x] `grep -q "Sentry" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 24 hits
- [x] `grep -q "Telegram" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 12 hits
- [x] `grep -q "OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 5 hits
- [x] `grep -q "OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 5 hits
- [x] `grep -q "Smoke 1" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 1 hit
- [x] `grep -q "Smoke 2" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 1 hit
- [x] `grep -q "Smoke 4" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 1 hit
- [x] `grep -q "vaultBalance" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 3 hits (W3 Phase 1 limitation note)
- [x] `grep -q "TRADE-03" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 4 hits
- [x] `grep -q "Vercel Project Environment — Deploy Checklist" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 2 hits (TOC anchor + heading)
- [x] `grep -q "LP_SUBGRAPH_URL" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 2 hits (env removal table + cleanup grep)
- [x] `grep -q "ONRAMPER_SECRET_KEY" .planning/phases/phase-01-shrink-the-surface-see-what-s-happening/01-RUNBOOK.md` — 1 hit (env removal table)
- [x] `npm run check` — only the 4 pre-existing transaction.ts errors; 0 new errors
- [x] `npm test -- --run` — 447 passed / 1 skipped (25 test files); same baseline as 01-06 / 01-07
- [x] `SENTRY_AUTH_TOKEN= npm run build` — Vite phase succeeds (`✓ built in 16.65s`); post-Vite Vercel adapt fails on local Node v24 (pre-existing env issue documented since 01-04)
- [x] All cross-cutting cleanup greps return expected results (7 of 8 categories at 0 hits; 1 stale-comment hit logged as deferred)
- [x] Pitfall 2 re-verified (`! grep -rqE "runtime.*['\"]edge['\"]" src/routes/`)
- [x] OBS-03 transcript completeness: 9 `failWith(` call sites in marketOrderExecution.ts (≥8 required)
- [x] Sentry init gating: `enabled: !dev && Boolean(env.{PUBLIC_,}SENTRY_DSN)` confirmed in both `hooks.client.ts:16` and `hooks.server.ts:19`
- [x] Task 2 commit `58a5825` exists on `gsd/phase-1-shrink-the-surface-see-what-s-happening` (verified via `git log --oneline -3`)
- [x] No unintended file deletions in Task 2 commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` returns empty)

## Phase 1 → Phase 2 Hand-off

This SUMMARY closes Phase 1. All 8 phase requirements are addressed:

| REQ-ID | Status | Closing Plan |
|---|---|---|
| DEPR-01 (user-facing rewards) | Complete | 01-02 |
| DEPR-02 (admin rewards + LP_SUBGRAPH_URL + per-wallet points) | Complete | 01-01 |
| DEPR-03 (Onramper + DepositModal collapse) | Complete | 01-03 |
| OBS-01 (Sentry SDK + PII scrubber + CSP) | Complete | 01-04 |
| OBS-02 (pino + AsyncLocalStorage request-id) | Complete | 01-05 |
| OBS-04 (RPC failure metrics + chain-exhausted Telegram alerts) | Complete | 01-06 (with D-17 amendment) |
| OBS-03 (take-order failure transcripts) | Complete | 01-07 |
| OBS-05 (Vercel Speed Insights confirmation + RUNBOOK) | Complete | 01-08 |

Phase 1's success criteria from `ROADMAP.md`:
1. ✓ `Phase 1 plans land "no liquidity" report → state-at-failure replay from logs.` OBS-03 transcript-builder + dual-sink (Sentry + console.error JSON line) makes failure-mode replay possible from a single log entry. D-08-LIMITATION on `vaultBalance` documented for Phase 2 / TRADE-03.
2. ✓ `Trade-page LCP/CLS/INP/TTFB baseline visible.` Vercel Speed Insights confirmed receiving data since 2025-07-21; Phase 2 / PERF-01 sets the explicit p75 LCP target against this baseline.
3. ✓ `Per-RPC failure metric + chain-exhausted alert.` `recordRpcAttempt` + `reportChainExhausted` instrument both `generator.ts:callRpc` and `accessCodes.ts:verifyWalletSignature`; Telegram alerts fire fail-closed-mild on missing env per D-17.
4. ✓ `Dead code deleted, internal admin rewards/snapshot decision applied.` All 3 DEPR REQs closed; snapshot pipeline retained per D-01 (feeds admin TVL/volume); per-wallet points removed per D-03; LP_SUBGRAPH_URL wiring deleted per D-05.
5. ✓ `Client-side errors → Sentry with PII scrubbed.` `@sentry/sveltekit@10.50.0` errors-only init gated on `!dev && DSN`; recursive `beforeSend` + `beforeBreadcrumb` PII walker covers wallet/signature/`?signature=` URL params.

**Phase 2 unblocked.** Phase 2 / TRADE-01..04 + PERF-01 can begin: OBS-03 transcript fields (modulo `vaultBalance` which TRADE-03 itself populates) provide the regression-validation surface for the trade-execution refactor; OBS-05 baseline is the dashboard against which PERF-01's p75 LCP target is set.

## Next Plan Readiness

- **Phase 2 unblocked.** All Phase 1 prerequisites for Phase 2 are met:
  - **OBS-03 capture wired and verified** — TRADE-03 (freshness illusion fix) can rely on the transcript fields to confirm regressions; every "no liquidity" failure on the live system already emits a complete Sentry event + console-line JSON. The `vaultBalance` field will be populated by TRADE-03's server-side pre-flight read.
  - **OBS-05 baseline visible** — PERF-01 sets the explicit p75 LCP target against the Vercel Speed Insights dashboard at orchestration-confirmed `https://vercel.com/st-0x/st0x/observability/speed-insights`.
  - **Side-semantics single source of truth** — `src/lib/types/orderPerspective.ts` exists today; TRADE-01 enforces the lint/marker that bans bypassing it.
  - **Bug factory smaller** — Onramper + user-facing rewards code deleted; `transaction.ts` is still 2373 lines but the rewards-coupling has been removed.
- **No carry-over deferred items closed in this plan.** The orphaned `CACHE_KEYS` cluster + stale `cache.ts` comment block (from 01-02) and the 4 pre-existing `transaction.ts` errors (from 01-01) remain for Phase 2.
- **Operational follow-ups for Phase 1 deploy:** Sentry org provisioning (5 env vars), Telegram bot provisioning (2 env vars), and removing the 4 deleted env vars (LP_SUBGRAPH_URL, 3x ONRAMPER_*) from the Vercel project. All documented in `01-RUNBOOK.md` § "Vercel Project Environment — Deploy Checklist". Until each is provisioned, the corresponding observability surface no-ops gracefully — no crash, no test failure, no deploy-time fence.

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
*Phase 1 closed: 8/8 plans, 8/8 REQ-IDs complete*
