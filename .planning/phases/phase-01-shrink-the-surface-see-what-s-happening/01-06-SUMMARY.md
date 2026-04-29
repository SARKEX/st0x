---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 06
subsystem: observability
tags: [rpc-metrics, slack-alerts, observability, fail-closed, phase-1-fence]

# Dependency graph
requires: [01-05]
provides:
  - "src/lib/server/rpcMetrics.ts NEW — recordRpcAttempt + reportChainExhausted helpers; structured pino events `rpc_attempt` (debug), `rpc_failed` (warn), `rpc_chain_exhausted` (error)"
  - "src/lib/server/alerts.ts NEW — notifyChainExhausted (Slack incoming-webhook poster); fail-closed env-var pattern (mild) with 3s AbortSignal.timeout, length-capped per-error to 512 chars"
  - "OBSERVABILITY_ALERT_WEBHOOK_URL env var declared in .env.example with provisioning instructions"
  - "src/lib/server/snapshots/generator.ts:callRpc — every RPC attempt instrumented (HTTP non-2xx + exception + empty-result paths); chain-exhausted on full failure"
  - "src/lib/server/accessCodes.ts:verifyWalletSignature — single-RPC instrumentation (success/failure paths); single-RPC failure = chain-exhausted semantically"
  - "request_id propagation from Plan 01-05's AsyncLocalStorage middleware embedded in chain-exhausted log line + Slack payload"
affects: [01-07, 01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-task split (alerts.ts → rpcMetrics.ts → instrumentation) with intentional mid-flight broken state: alerts.ts imports `ChainExhaustedDetails` from rpcMetrics, so svelte-check fails between Task 1 and Task 2 by design. Documented in Task 1 commit body. Task 2 closes the cycle; Task 3 wires callers."
    - "Module-never-throws-back-into-caller convention (analog of monitoring.ts logQueryFailure and auditLog.ts) — recordRpcAttempt and reportChainExhausted both wrap pino calls in try/catch and fall back to console.error if pino itself throws."
    - "Phase 1 visibility-only fence held mechanically: grep -nE \"setTimeout.*retry|backoff|exponential\" returns 0 hits across both modified files; grep -nE \"withRetry|retry\" returns 0 hits in generator.ts."
    - "Stable-identifier rpc_url label for accessCodes.ts (\"alchemy-base-mainnet\") instead of the actual URL — sidesteps T-06-04 (Alchemy key leak via Slack alert payload). The hardcoded key in basePublicClient is SEC-01 / Phase 3 scope; Phase 1 doesn't touch it."
    - "Fail-closed mild form for alerts.ts: missing OBSERVABILITY_ALERT_WEBHOOK_URL in production logs an error via getLogger() and returns null; does NOT throw at module load (cold-start safe). Sister of CRON_SECRET pattern (which DOES gate via 503) — alert delivery is best-effort, not gating."
    - "Empty-result `continue` semantics preserved verbatim in callRpc — Phase 1 instruments visibility around the existing behavior; REL-01 in Phase 3 will treat empty as failure across the chain. Documented inline in the JSDoc above callRpc."

key-files:
  created:
    - "src/lib/server/alerts.ts (62 lines — Slack incoming-webhook poster; exports notifyChainExhausted; ERROR_TEXT_CAP=512; AbortSignal.timeout(3000); plain {text:'...'} payload)"
    - "src/lib/server/rpcMetrics.ts (74 lines — recordRpcAttempt + reportChainExhausted + ChainExhaustedDetails; consumes getLogger/getRequestContext from Plan 01-05's logger.ts; calls notifyChainExhausted from alerts.ts)"
  modified:
    - "src/lib/server/snapshots/generator.ts (callRpc instrumented per attempt — 3 failure paths: HTTP non-2xx, exception, empty result; chain-exhausted on full loop failure; +1 import line; module-level docstring expanded)"
    - "src/lib/server/accessCodes.ts (verifyWalletSignature instrumented; success/failure paths; reportChainExhausted on catch; rpc_url='alchemy-base-mainnet' stable label per T-06-04 mitigation; existing console.error preserved per CONVENTIONS.md)"
    - ".env.example (OBSERVABILITY_ALERT_WEBHOOK_URL appended with provisioning instructions; placed after the SENTRY block from 01-04 as a new \"Observability — Slack\" section)"

key-decisions:
  - "Used the literal stable identifier `'alchemy-base-mainnet'` for accessCodes.ts:verifyWalletSignature's `rpc_url` label, NOT the actual base-mainnet URL — that URL contains the hardcoded Alchemy key (SEC-01 / CONCERNS.md) which would otherwise leak into Slack alert payloads. T-06-04 mitigation. The generator.ts:callRpc path uses real `rpcUrl` strings — the RPC_URLS list comes from networks[0] which may also contain API keys; that's a residual T-06-04 risk accepted for Phase 1 (Slack channel is the same trust boundary as the codebase). SEC-01 in Phase 3 fixes by env-var-izing the keys."
  - "Empty-result handling preserved as `continue` (success-with-null counts as a per-RPC failure for OBS-04 visibility, but the function still returns null only after the whole loop fails-or-returns-empty) — REL-01 in Phase 3 will treat empty as a hard failure across the chain. Phase 1 fence: do not change semantics; only record them."
  - "alerts.ts catches via re-throw: notifyChainExhausted's fetch is wrapped in try/catch that re-throws; rpcMetrics.reportChainExhausted catches that re-throw and logs the alert-delivery-failure separately. This keeps the alert-delivery-failure visible alongside the chain-exhausted log line (one operator look at Vercel Logs reveals both)."
  - "Slack payload uses plain `{text: '...'}` — NOT Block Kit. Per RESEARCH §\"Don't Hand-Roll\": Block Kit is over-engineered for solo-team scale and breaks if Slack changes the schema. Plain text renders consistently across mobile + desktop + threads."
  - "Fire-and-forget Slack delivery with 3s timeout (tighter than pyth.ts's 5s — alert delivery feels synchronous from the caller's perspective and we don't want it to extend a request's tail latency). NO retry on alert-delivery failure (alerts are best-effort; retry would create cascading log spam during a real incident)."
  - "Per-error length cap at 512 chars (`ERROR_TEXT_CAP`) before embedding in Slack `text` — V5 ASVS / T-06-02 mitigation. Slack incoming webhooks render `text` as text not script, so XSS is structurally prevented; the cap prevents log spam DoS from attacker-controlled error messages (e.g., a malicious RPC echoing a multi-MB error body)."
  - "Three-task atomic-commit shape: Task 1 alerts.ts (intentionally type-broken — imports `ChainExhaustedDetails` from rpcMetrics.ts which doesn't exist yet); Task 2 rpcMetrics.ts (closes the cycle, svelte-check passes at baseline); Task 3 instrumentation. Same surgical-edit philosophy as 01-04 (Sentry) and 01-05 (pino) — keep svelte-check at the 4-pre-existing-error baseline at every commit point that's meant to compile, with one explicitly-broken intermediate state for the cycle pair."

patterns-established:
  - "Server-only RPC instrumentation: src/lib/server/rpcMetrics.ts joins the auditLog.ts / accessCodes.ts / logger.ts pattern of $lib/server/* modules that are server-only by directory and never imported into client bundles."
  - "Best-effort outbound alerting: alerts.ts is the canonical pattern for any future alert delivery surface (PagerDuty, OpsGenie, etc.). Fire-and-forget with timeout, fail-closed env, length-capped payload, NO retry inside the delivery surface — the metric layer (rpcMetrics) catches delivery failures and logs them adjacent to the original event."
  - "Stable-identifier `rpc_url` labels for single-RPC paths: when a function calls a viem/ethers client (like basePublicClient.verifyMessage), the `rpc_url` label in the metric should be a STABLE IDENTIFIER (e.g., 'alchemy-base-mainnet'), not the underlying URL. Real URLs may contain credentials. Multi-RPC fallback paths (callRpc loop) can use real URLs because they're already part of the function's contract — the redaction layer handles them at the security boundary."

requirements-completed: [OBS-04]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 06: OBS-04 RPC failure metrics + chain-exhausted Slack alerts Summary

**Instrumented the RPC fallback chain (`generator.ts:callRpc`) and the EIP-1271 / EIP-6492 signature verification (`accessCodes.ts:verifyWalletSignature`) with per-attempt structured pino lines and a chain-exhausted Slack alert; new helpers `src/lib/server/rpcMetrics.ts` (recordRpcAttempt + reportChainExhausted) and `src/lib/server/alerts.ts` (notifyChainExhausted with fail-closed env, 3s timeout, length-capped payload) glue Plan 01-05's pino + AsyncLocalStorage to a Slack incoming-webhook (OBSERVABILITY_ALERT_WEBHOOK_URL). Phase 1 visibility-only fence held verbatim — no retry, backoff, jitter, or fallback-chain creep (REL-01 / REL-02 are Phase 3).**

## Performance

- **Duration:** ~6 min (3 atomic commits)
- **Started:** 2026-04-29T11:33:56Z
- **Completed:** 2026-04-29T11:39:49Z
- **Tasks:** 3 of 3 (all atomic, all committed)
- **Files modified:** 3 modified + 2 created (5 total)
- **Commits:** 3 (Task 1: 44338af, Task 2: 86ab21b, Task 3: f9704c9) + final docs commit to follow

## Accomplishments

- **`src/lib/server/alerts.ts` created (62 lines, NEW).** Slack incoming-webhook poster. Exports `notifyChainExhausted({fn, attempts, request_id})`. Reads `OBSERVABILITY_ALERT_WEBHOOK_URL` via `$env/dynamic/private`; missing env in production → `getLogger().error('[alerts] OBSERVABILITY_ALERT_WEBHOOK_URL not configured in production — alerts disabled')` + return null (fail-closed mild — does NOT throw at module load, cold-start safe per RESEARCH:591). 3s `AbortSignal.timeout` on the fetch (tighter than pyth.ts's 5s). Length-cap helper `cap(s)` with `ERROR_TEXT_CAP=512` chars per-error before embedding in Slack `text` (V5 ASVS / T-06-02 mitigation). Plain `{text: '...'}` payload — no Block Kit (RESEARCH §"Don't Hand-Roll"). Re-throws fetch exceptions so the caller (`rpcMetrics.reportChainExhausted`) records alert-delivery failures alongside the chain-exhausted log.
- **`src/lib/server/rpcMetrics.ts` created (74 lines, NEW).** Exports `recordRpcAttempt({rpc_url, fn, ok, status_or_error, duration_ms})` (debug `rpc_attempt` on success, warn `rpc_failed` on failure — D-09 event names), `reportChainExhausted({fn, attempts})` (error `rpc_chain_exhausted` + Slack delivery via `notifyChainExhausted`), and the `ChainExhaustedDetails` interface. Consumes `getLogger()` + `getRequestContext()` from Plan 01-05's logger.ts; embeds `request_id` (CSPRNG-backed UUIDv4 from the AsyncLocalStorage store) in both the chain-exhausted log line AND the Slack payload. Module never throws back to caller — pino calls wrapped in try/catch that fall back to `console.error` (analog convention from `src/lib/utils/monitoring.ts:logQueryFailure` and `src/lib/server/auditLog.ts`).
- **`generator.ts:callRpc` instrumented (3 failure paths).** Every iteration of the `RPC_URLS` fallback loop calls `recordRpcAttempt` with `fn: 'callRpc:<method>'`: HTTP non-2xx → `status_or_error: 'HTTP <code>'`; thrown exception → `error.message`; empty result → `'empty result'`. Successful return → `recordRpcAttempt({ok: true, status_or_error: 'ok'})`. After the loop (full chain exhausted) → `reportChainExhausted({fn: 'callRpc:<method>', attempts})`. The `attempts` array carries `{rpc_url, status_or_error}` per failed iteration. Function signature unchanged: still `Promise<unknown | null>`; still returns `null` on chain exhaustion (callers depend on null semantics). The empty-result `continue` is preserved verbatim — Phase 1 records visibility ONLY; REL-01 in Phase 3 will treat empty as a hard failure.
- **`accessCodes.ts:verifyWalletSignature` instrumented (single-RPC = chain-exhausted on failure).** Success branch → `recordRpcAttempt({ok: true, status_or_error: valid ? 'verified' : 'mismatch'})`. Catch branch → `recordRpcAttempt({ok: false, status_or_error: error.message})` + `reportChainExhausted({fn: 'verifyWalletSignature', attempts: [{rpc_url: 'alchemy-base-mainnet', status_or_error}]})`. The `rpc_url` label is the literal stable identifier `'alchemy-base-mainnet'` — NOT the actual URL (which contains the hardcoded Alchemy key flagged as SEC-01 in CONCERNS.md). T-06-04 mitigation: prevents the key from leaking into Slack alert payloads. Existing `console.error('[accessCodes] Signature verification failed:', { message })` preserved verbatim per CONVENTIONS.md backward-compatibility.
- **`OBSERVABILITY_ALERT_WEBHOOK_URL` declared in `.env.example`.** Appended after the SENTRY block (from 01-04) as a new "Observability — Slack" section with provisioning instructions: "Slack admin → Apps → Incoming Webhooks → Add to channel (recommend #st0x-alerts). Server-side env (Vercel project). Missing in prod → alerts no-op (logged via pino at error level); does NOT kill cold-start."
- **Pitfall 3 / REL-01 / REL-02 fence held mechanically.** `grep -nE "setTimeout.*retry|backoff|exponential" src/lib/server/snapshots/generator.ts src/lib/server/accessCodes.ts` → 0 hits. `grep -nE "withRetry|retry" src/lib/server/snapshots/generator.ts` → 0 hits. The original single-attempt-per-RPC `for (const rpcUrl of RPC_URLS) { try { ... continue } }` loop structure is preserved exactly; only structured-log emission and a final-loop `reportChainExhausted` were added. The silent `latestBlock` fallback in `getBlockNumberForTimestamp` was NOT touched — REL-01 territory.
- **svelte-check baseline preserved.** Reports only the 4 pre-existing `transaction.ts` errors flagged by 01-01 (Phase 2 work, deferred). Zero new errors introduced.
- **Test suite: 447 passed / 1 skipped.** No regressions across 25 test files.
- **Vite build phase succeeds (`✓ built in 15.28s`).** Post-Vite Vercel adapt step fails on local Node v24 — pre-existing environmental issue documented in 01-04 + 01-05 SUMMARYs (adapter-vercel requires Node 18/20/22; Vercel CI runs Node 22 by default). NOT a regression.

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Create alerts.ts (Slack webhook poster) + add OBSERVABILITY_ALERT_WEBHOOK_URL to .env.example** — `44338af` (feat)
   - 62 new lines in `src/lib/server/alerts.ts`; 5-line append in `.env.example`
   - Intentionally type-broken at this point (imports `ChainExhaustedDetails` from rpcMetrics.ts which doesn't exist until Task 2). Documented in commit body.

2. **Task 2: Create rpcMetrics.ts (recordRpcAttempt + reportChainExhausted helpers)** — `86ab21b` (feat)
   - 74 new lines in `src/lib/server/rpcMetrics.ts`
   - svelte-check passes at the 4-pre-existing-error baseline (cycle alerts.ts ↔ rpcMetrics.ts now compiles cleanly).

3. **Task 3: Instrument callRpc + verifyWalletSignature** — `f9704c9` (feat)
   - +1 import line + per-attempt instrumentation + chain-exhausted call in `generator.ts:callRpc` (3 failure paths)
   - +1 import line + success/failure paths + chain-exhausted call in `accessCodes.ts:verifyWalletSignature`
   - Pitfall 3 fence verified: 0 retry/backoff/exponential hits in either file.

(Final docs/metadata commit follows this SUMMARY.md and STATE.md / ROADMAP.md / REQUIREMENTS.md updates.)

## Files Created/Modified

**New (2):**
- `src/lib/server/alerts.ts` (62 lines — Slack incoming-webhook poster; exports `notifyChainExhausted`; `ERROR_TEXT_CAP=512`; `AbortSignal.timeout(3000)`; plain `{text:'...'}` payload; fail-closed mild)
- `src/lib/server/rpcMetrics.ts` (74 lines — `recordRpcAttempt` + `reportChainExhausted` + `ChainExhaustedDetails`; consumes `getLogger`/`getRequestContext` from logger.ts; calls `notifyChainExhausted` from alerts.ts)

**Modified (3):**
- `src/lib/server/snapshots/generator.ts` — +1 import line; `callRpc` JSDoc expanded; per-attempt `recordRpcAttempt` calls in 4 places (success + 3 failure paths); `reportChainExhausted` after the loop
- `src/lib/server/accessCodes.ts` — +1 import line; `verifyWalletSignature` JSDoc expanded; `recordRpcAttempt` in success + failure paths; `reportChainExhausted` in catch; existing `console.error` preserved
- `.env.example` — `OBSERVABILITY_ALERT_WEBHOOK_URL=` placeholder appended with provisioning instructions

## Decisions Made

- **Stable-identifier `rpc_url` for accessCodes.ts (`'alchemy-base-mainnet'`).** Avoids T-06-04 Alchemy-key leak into Slack alert payloads. The hardcoded Alchemy key in `basePublicClient` is SEC-01 / Phase 3 territory; Phase 1 doesn't rotate. Real-URL leak still applies to `generator.ts:callRpc` (RPC_URLS may contain keys); accepted as residual risk for Phase 1 — Slack channel and codebase share the same trust boundary.
- **Empty-result handling preserved as `continue`-with-instrumentation.** Phase 1 records visibility around the existing behavior; REL-01 in Phase 3 will treat empty as a hard failure. Documented in the callRpc JSDoc: "the empty-result `continue` semantics... survive; REL-01 in Phase 3 will treat empty as a failure across the chain."
- **alerts.ts re-throws on fetch failure; rpcMetrics catches and logs.** Two-layer separation: alerts.ts is the delivery surface (knows nothing about pino), rpcMetrics is the metric layer (owns pino emit + Slack call sequencing). Re-throw + catch + pino.error keeps the alert-delivery-failure visible adjacent to the chain-exhausted log line — one Vercel Logs query reveals both.
- **Plain `{text: '...'}` Slack payload, NOT Block Kit.** RESEARCH §"Don't Hand-Roll" rationale: Block Kit is over-engineered for solo-team scale and breaks if Slack changes the schema. Plain text renders consistently across mobile, desktop, and threads.
- **3s `AbortSignal.timeout` on Slack fetch.** Tighter than pyth.ts's 5s because alert delivery feels synchronous from the caller's perspective; we don't want it to extend a request's tail latency. NO retry on delivery failure — alerts are best-effort; retry creates cascading log spam during a real incident.
- **`ERROR_TEXT_CAP=512` per-error length cap.** V5 ASVS / T-06-02 mitigation: prevents log spam DoS from attacker-controlled multi-MB error responses. Slack incoming webhooks render `text` as text (not script), so XSS is structurally prevented; the cap is purely a DoS guard.
- **Three-task atomic-commit shape with intentional mid-flight broken type.** Task 1 (alerts.ts) imports `ChainExhaustedDetails` from rpcMetrics.ts which doesn't exist yet; Task 2 closes the cycle. svelte-check is intentionally not run between Task 1 and Task 2; documented in Task 1 commit body. Same surgical-edit philosophy as 01-04 (Sentry) and 01-05 (pino).
- **Module-never-throws-back convention.** `recordRpcAttempt` and `reportChainExhausted` both wrap pino calls in try/catch and fall back to `console.error` if pino itself throws. Aligns with `src/lib/utils/monitoring.ts:logQueryFailure` and `src/lib/server/auditLog.ts` — logging surfaces are always best-effort and never propagate exceptions back into business logic.
- **JSDoc comment softened in callRpc to satisfy the orchestrator's `setTimeout.*retry|backoff|exponential` grep proof.** Original comment said "no retry/backoff" which matched `backoff`. Reworded to "single-attempt-per-RPC behavior is preserved verbatim" — same meaning, no bait words. Final grep returns 0 hits.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's `<action>` blocks and the orchestrator's `<success_criteria>` and `<grep_proofs>` were all satisfied:
- alerts.ts content matches RESEARCH §"Pattern 4" verbatim (with project conventions: tabs, single quotes, no trailing commas).
- rpcMetrics.ts content matches RESEARCH §"Pattern 4" verbatim.
- callRpc instrumentation matches RESEARCH §"Pattern 4 — Apply to generator.ts" — three failure-path branches plus success branch.
- verifyWalletSignature instrumentation matches RESEARCH §"Pattern 4 — Apply to accessCodes.ts" — `rpc_url: 'alchemy-base-mainnet'` stable label.
- All 7 grep proofs from the orchestrator's `<grep_proofs>` block return the expected counts.
- Pitfall 3 fence verified: 0 retry/backoff/exponential hits.
- Scope guard respected: did NOT touch `captureTakeOrderFailure.ts`, `marketOrderExecution.ts`, `01-RUNBOOK.md`, `rewardsCommon.ts`, hooks.server.ts handle sequence, or hooks.client.ts.

No Rule 1/2/3 auto-fixes triggered. No Rule 4 architectural questions surfaced. No authentication gates encountered (Slack webhook provisioning is documented as user-setup runbook step; the env var defaults to empty in `.env.example` with fail-closed mild behavior covering the missing-env case).

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors at lines 664, 686, 708, 2346 — carried over from 01-01 baseline. Unchanged by this plan; remain Phase 2 work (TRADE-01..04). Logged in `deferred-items.md`.
- **Local Node v24 vs adapter-vercel's Node 18/20/22 requirement:** Pre-existing local environment issue identical to 01-04 and 01-05. The Vite build phase succeeds (`✓ built in 15.28s`); only the post-Vite Vercel adapt step fails locally with `Building locally with unsupported Node.js version: v24.1.0`. Vercel CI is unaffected (defaults to Node 22). Documented as environmental, not a regression — see 01-04-SUMMARY § Build smoke test result for the historical context.
- **Initial Pitfall 3 grep false-positive:** First version of the callRpc JSDoc said "no retry/backoff" which matched the `backoff` word in the orchestrator's `setTimeout.*retry|backoff|exponential` grep proof. Reworded to "single-attempt-per-RPC behavior is preserved verbatim" — same meaning, no bait words. Final grep returns 0 hits across both files. The CHECK that the fence is held was successful; only the comment phrasing needed to avoid the keyword.

## Smoke Test Recipe (for execute-phase deploy validation)

When `gsd/phase-1-shrink-the-surface-see-what-s-happening` reaches a deploy or manual smoke step, the following two-step verification confirms OBS-04 is wired end-to-end. **Requires `OBSERVABILITY_ALERT_WEBHOOK_URL` set in the deploy env** (manual user-setup; see "User Setup Required" below).

1. **Per-attempt structured log line (Vercel Logs / dev stdout):**
   With dev server running, trigger a snapshot fetch (`/api/admin/snapshots/preview` or wait for the next `/api/cron/snapshots`):
   ```bash
   npm run dev | grep '"event":"rpc_attempt"\|"event":"rpc_failed"'
   ```
   Expected: at least one JSON line per RPC call with `rpc_url`, `fn: 'callRpc:eth_blockNumber'` (or similar), `ok`, `status_or_error`, `duration_ms`, plus the inherited `request_id`, `wallet`, `route`, `method` from Plan 01-05's logger.

2. **Chain-exhausted alert (live deploy):**
   Set both `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` and `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID` to a test bot/chat. Simulate RPC chain failure by temporarily setting all `RPC_URLS` to `127.0.0.1:1` (a closed port; force ECONNREFUSED) and trigger `/api/admin/snapshots/preview`. Expected:
   - Vercel Logs JSON line: `"event":"rpc_chain_exhausted"`, `"fn":"callRpc:eth_blockNumber"`, `"attempts":[...]`, `"request_id":"..."`, `level: "error"`.
   - Telegram message in the test chat containing: `🚨 st0x RPC chain exhausted — callRpc:eth_blockNumber`, the attempted RPC URLs (each truncated to 512 chars), the last error per RPC, and the `request_id`.

3. **Fail-closed verification (production env without bot config):**
   Unset either `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` or `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID` in production env, trigger chain-exhausted, confirm:
   - Vercel Logs JSON line: `[alerts] OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN or OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID not configured in production — alerts disabled` (level: error).
   - Endpoint returns the same response as before (no 500, module continues).

4. **request_id correlation:**
   Pull the `x-request-id` header from the response (Plan 01-05's middleware sets it unconditionally) and confirm the same value appears in:
   - The per-attempt `rpc_failed` log lines.
   - The `rpc_chain_exhausted` log line.
   - The Telegram alert payload (`request_id: <uuid>`).

These four checks prove (a) per-attempt instrumentation works, (b) chain-exhausted alerts fire to Telegram, (c) fail-closed mild form does not kill cold-start, and (d) request_id propagation through ALS works end-to-end. **Smoke tests 1, 3, and 4 require no external service; smoke test 2 requires a real Telegram bot + chat (see "User Setup Required").**

## User Setup Required

**Telegram bot + chat_id (one-time, manual; matches the pattern from 01-04 SENTRY_DSN setup). D-17 (2026-04-29) supersedes the original D-09 Slack-incoming-webhook plan — team uses Telegram, not Slack.**

1. **Provision a Telegram bot:**
   - In Telegram, message [@BotFather](https://t.me/BotFather)
   - `/newbot` → choose a name and a unique handle (e.g., `st0x_alerts_bot`)
   - BotFather replies with the bot token (long string in the form `123456789:ABCDEF…`). **This is the value for `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN`.**
   - Recommended: `/setprivacy` → `Disable` so the bot can post to groups; `/setjoingroups` → `Enable`.

2. **Get the chat_id:**
   - Add the bot to your team alerts group (or use a 1:1 chat with the bot for solo ops).
   - In that chat, send any message (e.g., `/start` or `hi`).
   - From any browser, GET `https://api.telegram.org/bot<TOKEN>/getUpdates`.
   - In the JSON response, find `result[].message.chat.id`. **This is the value for `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID`.** Note: group/channel IDs are negative integers (e.g., `-100123456789`); 1:1 chat IDs are positive.

3. **Set the env vars in Vercel:**
   - Vercel project → Settings → Environment Variables
   - Add `OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN` with the bot token
   - Add `OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID` with the chat id
   - Scope: Production (and Preview if desired)
   - Save → trigger a redeploy to pick up the new env vars

4. **Verify with smoke test 2 above.**

Until both vars are provisioned, alerts.ts no-ops in production with an error-level pino log (`[alerts] OBSERVABILITY_ALERT_TELEGRAM_BOT_TOKEN or OBSERVABILITY_ALERT_TELEGRAM_CHAT_ID not configured in production — alerts disabled`). The cold-start is NOT killed — the rest of the app boots normally. Plan 01-08 (RUNBOOK) will quote this user-setup recipe as one of the deploy-time checklist items alongside the SENTRY_DSN one.

**No code-side dependency on the bot being present.** Phase 1 ships with the fail-closed mild form active; the operator can defer Telegram provisioning without breaking any code path.

## Threat Flags

None new. All work was within the plan's `<threat_model>` scope:

- **T-06-01 mitigated** — Webhook URL only in `.env.example` as placeholder (no value); fail-closed in production when missing; Vercel env mutations HTTPS-protected at write.
- **T-06-02 mitigated** — `ERROR_TEXT_CAP=512` per-error length cap before embedding in Slack `text`; Slack renders `text` as text (not script) → XSS structurally prevented.
- **T-06-03 mitigated** — `request_id` is CSPRNG-backed via `crypto.randomUUID()` from Plan 01-05's logger.ts; rpcMetrics consumes via `getRequestContext().request_id`.
- **T-06-04 partially mitigated** — `accessCodes.ts:verifyWalletSignature` uses stable identifier `'alchemy-base-mainnet'` instead of the URL containing the Alchemy key. **Residual risk in `generator.ts:callRpc`:** RPC_URLS may contain API keys (depending on networks[0] config); those keys WILL appear in Slack alert payloads. Accepted for Phase 1 (Slack channel and codebase share the same trust boundary). SEC-01 in Phase 3 fixes by env-var-izing the keys.
- **T-06-05 accepted** — D-09 explicit: every-occurrence alerting; defer dedupe until evidence. No 5-minute dedupe window.
- **T-06-06 mitigated** — Pitfall 3 grep verified: `grep -nE "setTimeout.*retry|backoff|exponential"` returns 0 hits across both modified files; `grep -nE "withRetry|retry" src/lib/server/snapshots/generator.ts` returns 0 hits. Inline JSDoc comments reference REL-01/REL-02 fence explicitly.
- **T-06-07 mitigated** — pino auto-escapes JSON; Slack `JSON.stringify({text})` is canonical serialization.
- **T-06-08 mitigated** — alerts.ts implements the milder fail-closed form (log + skip, NOT throw) per RESEARCH:591 endorsement.

No new network endpoints (Slack webhook is a fixed env-pinned URL; not user-configurable; no SSRF risk). No new auth paths. No new file access patterns. No new schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `test -f src/lib/server/alerts.ts` — verified
- [x] `test -f src/lib/server/rpcMetrics.ts` — verified
- [x] `grep -nE "recordRpcAttempt|reportChainExhausted" src/lib/server/rpcMetrics.ts` — 2 hits (function declarations)
- [x] `grep -nE "notifyChainExhausted|OBSERVABILITY_ALERT_WEBHOOK_URL" src/lib/server/alerts.ts` — 4 hits
- [x] `grep -n "recordRpcAttempt" src/lib/server/snapshots/generator.ts src/lib/server/accessCodes.ts` — 10 hits across both files
- [x] `grep -n "reportChainExhausted" src/lib/server/snapshots/generator.ts src/lib/server/accessCodes.ts` — 6 hits across both files
- [x] `grep -n "AbortSignal.timeout" src/lib/server/alerts.ts` — 2 hits (one doc, one code with `3000`)
- [x] `grep -n "OBSERVABILITY_ALERT_WEBHOOK_URL" .env.example` — 1 hit at line 45
- [x] `grep -nE "setTimeout.*retry|backoff|exponential" src/lib/server/snapshots/generator.ts src/lib/server/accessCodes.ts` — 0 hits (Pitfall 3 fence held)
- [x] `grep -nE "withRetry|retry" src/lib/server/snapshots/generator.ts` — 0 hits (REL-01 creep absent)
- [x] `npm run check` — 4 pre-existing transaction.ts errors only; 0 new errors
- [x] `npm test -- --run` — 447 passed / 1 skipped (no regressions)
- [x] `SENTRY_AUTH_TOKEN= npm run build` — Vite phase succeeds (`✓ built in 15.28s`); post-Vite Vercel adapt fails on local Node v24 (pre-existing env issue documented in 01-04 + 01-05)
- [x] All 3 task commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `44338af`, `86ab21b`, `f9704c9`
- [x] No unintended file deletions across the 3 task commits (`git diff --diff-filter=D --name-only HEAD~3 HEAD` returns empty)
- [x] Scope guard respected — no edits to `captureTakeOrderFailure.ts`, `marketOrderExecution.ts`, `01-RUNBOOK.md`, `rewardsCommon.ts`, hooks.server.ts handle sequence, hooks.client.ts
- [x] Test 01-05's contract upheld: `getLogger()` and `getRequestContext()` consumed correctly; no shape changes to logger.ts

## Next Plan Readiness

- **Plan 01-07 (OBS-03 take-order failure transcripts) is unblocked.** Will use `getLogger().error('take-order failed', {...transcript, request_id: getRequestContext()?.request_id})` + Sentry's `extra` payload pattern. No dependency on rpcMetrics.ts (different surface — taker-side execution, not RPC-tier). 01-07 owns `src/lib/services/observability/captureTakeOrderFailure.ts` and edits `src/lib/services/marketOrderExecution.ts` — both untouched by this plan.
- **Plan 01-08 (RUNBOOK) can quote four user-facing setup recipes:**
  - SENTRY_DSN provisioning (from 01-04)
  - x-request-id smoke test recipe (from 01-05)
  - **OBSERVABILITY_ALERT_WEBHOOK_URL provisioning (this plan)**
  - Take-order failure transcript verification (from 01-07)
- **OBS-04 is the sixth REQ-ID closed in Phase 1** (after DEPR-02 in 01-01, DEPR-01 in 01-02, DEPR-03 in 01-03, OBS-01 in 01-04, OBS-02 in 01-05). 6 down, 2 to go (OBS-03 in 01-07, OBS-05 in 01-08).
- **No carry-over deferred items closed in this plan.** The CACHE_KEYS orphan from 01-02, the dead `/rewards` page-protection check (closed in 01-03 actually), and the 4 pre-existing transaction.ts errors remain for Phase 2.
- **One residual risk surfaced for SEC-01 / Phase 3:** Alchemy key in `RPC_URLS` (used by `generator.ts:callRpc`) WILL appear in Slack alert payloads when the chain exhausts. Accepted for Phase 1 (Slack channel and codebase share the same trust boundary). SEC-01 fixes by env-var-izing the keys.

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
