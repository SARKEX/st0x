---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 05
subsystem: observability
tags: [pino, observability, logging, async-local-storage, request-id, sveltekit-hooks, structured-logs]

# Dependency graph
requires: [01-04]
provides:
  - "pino@^9.14.0 structured server logger writing JSON to stdout (Vercel Logs captures it)"
  - "AsyncLocalStorage-backed RequestContext (request_id, wallet, route, method, start_ms) propagated to every server-tier code path inside a request"
  - "src/lib/server/logger.ts NEW — exports baseLogger (default + named { logger }), getLogger(), getRequestContext(), requestContextHandle (Handle), pickLevelForRoute helper"
  - "x-request-id response header set on every request (reuses client-supplied value or mints CSPRNG UUIDv4 via crypto.randomUUID)"
  - "pickLevelForRoute matrix per D-07 (5xx=error, 4xx=warn, /api/snapshots/*=warn, /api/cron/*=info, /api/admin/*=info, /api/access/*=info, default=info)"
  - "Pino built-in redact covers req.headers.authorization, req.headers.cookie, *.signature, *.privateKey at any depth (T-05-01 mitigation)"
  - "src/hooks.server.ts handle = sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle) — request-id middleware FIRST so Sentry breadcrumbs and the existing CSP/CORS/auth chain see request_id"
affects: [01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added:
    - "pino@^9.14.0"
  patterns:
    - "Three-task split (dep install + edge-runtime audit → pure module + tests → hooks wiring) keeps svelte-check at the 4-pre-existing-error baseline at every commit; tests land before the hooks edit so the import surface compiles cleanly."
    - "AsyncLocalStorage from node:async_hooks holds the per-request RequestContext. Pino child logger built lazily via getLogger() reads the store and binds {request_id, wallet, route, method} on every log call. No global mutable state; ALS contexts are GC'd when the request promise resolves (T-05-04)."
    - "Sequence chain ordering as a hard contract: request-id FIRST, then Sentry, then existing CSP/CORS/auth/bot-rejection. Documented in the inline comment above `export const handle = sequence(...)` so future plans don't accidentally reshuffle."
    - "CSPRNG-backed request_id via Node's crypto.randomUUID() (V6 ASVS satisfied). NOT Math.random(). Zero new dependency — Node 19+ ships randomUUID; project runs Node 24."
    - "Client-supplied x-request-id is reused for cross-correlation (T-05-03 accepted — attacker only poisons logs with values they already know; Vercel Logs admin-only)."

key-files:
  created:
    - "src/lib/server/logger.ts (130 lines — pino baseLogger + AsyncLocalStorage<RequestContext> + getLogger/getRequestContext/requestContextHandle/pickLevelForRoute)"
    - "tests/lib/server/logger.test.ts (107 lines — 13 unit tests covering pickLevelForRoute matrix exhaustively + AsyncLocalStorage smoke test)"
  modified:
    - "package.json (pino@^9.14.0 added to dependencies)"
    - "package-lock.json (pino + 8 transitive deps)"
    - "src/hooks.server.ts (import requestContextHandle from $lib/server/logger; handle ordering changed from `sequence(Sentry.sentryHandle(), existingHandle)` to `sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)`; comment block above the export updated to document OBS-01 + OBS-02 ordering rule)"

key-decisions:
  - "Use crypto.randomUUID() from node:crypto, not the `uuid` npm package. Node 24 ships it natively (Node ≥19 in general); skipping the dep keeps the tree thin. CSPRNG-backed (T-05-06)."
  - "Wallet retained in FULL in pino logs (not truncated). Per D-07: Vercel Logs is admin-only-readable; Sentry's beforeSend scrubber (Plan 01-04) handles the third-party SaaS exposure separately. Doing both would double-redact and lose forensic value in the admin tier where the wallet is the primary join key."
  - "pino built-in `redact` config (paths array) over a custom serializer. Per RESEARCH §Security V5: pino's redact runs at JSON-emit time, faster than a beforeSend-style walker, and is the canonical pino pattern. Covers Authorization, cookie headers, and any `*.signature` / `*.privateKey` field at any depth."
  - "Lazy child logger via getLogger() (no top-level child cache). Each call rebuilds the child from the active ALS store — cheap (pino child is a constant-time clone), correct under nested als.run() calls, and avoids stale-context bugs if a downstream changes the wallet field mid-request."
  - "Default export + named export of baseLogger for boot-time/background-task callers (no request context yet). Inside a request, getLogger() is the canonical entrypoint."
  - "x-request-id response header set unconditionally — even on 4xx/5xx — so client error reports can quote the id back to the dev. The middleware does NOT 200-check before setting the header."
  - "pickLevelForRoute uses prefix discipline (`/api/snapshots/` with trailing slash, not `/api/snapshots`) so a future `/api/snapshotsfoo` route doesn't accidentally inherit the warn level. Test case explicitly guards this."
  - "`request` is the canonical msg string for the per-request summary log line. Test/observability convention; consistent across the codebase will let Vercel Logs query `msg=\"request\" status>=500` reliably."

patterns-established:
  - "Server module placement: src/lib/server/logger.ts follows the convention from auditLog.ts / accessCodes.ts. Server-only by directory; never imported into client bundles."
  - "AsyncLocalStorage as the request-context primitive. Future server modules that need per-request context (e.g., OBS-04 RPC metrics, OBS-03 take-order transcripts) call getRequestContext() to embed request_id without plumbing it through function signatures."
  - "Pre-install Pitfall 2 verification (`! grep -rqE \"runtime.*['\\\"]edge['\\\"]\" src/routes/`) is a guardrail that should re-run any time a route is added or moved. Documented in the module-level JSDoc."
  - "Per-route log level matrix as a pure helper (pickLevelForRoute) — exported separately so future code (alerting, dashboards, 01-06 RPC metrics) can compute the same level without re-implementing the matrix."

requirements-completed: [OBS-02]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 05: pino structured logging + AsyncLocalStorage request-context middleware (OBS-02) Summary

**Stood up server-side structured logging with pino@^9.14.0 emitting JSON to stdout (Vercel Logs captures it) plus an AsyncLocalStorage-backed request-context middleware injecting CSPRNG-backed UUIDv4 request_ids — wired into hooks.server.ts as `sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)` so Sentry breadcrumbs and the existing CSP/CORS/auth chain all share one request_id.**

## Performance

- **Duration:** ~6 min (3 atomic commits)
- **Started:** 2026-04-29T11:21:29Z
- **Completed:** 2026-04-29T11:26:42Z
- **Tasks:** 3 of 3 (all atomic, all committed)
- **Files modified:** 3 modified + 2 created (5 total)
- **Commits:** 3 (Task 1: 7e51863, Task 2: 67b0716, Task 3: 6ecc7e3) + final docs commit to follow

## Accomplishments

- **pino@^9.14.0 installed.** Resolved to 9.14.0 (latest 9.x at install time, satisfies the ^9.9.5 constraint from RESEARCH §Standard Stack). 9 packages added; verified by `npm ls pino` (project tree shows `pino@9.14.0`; transitive `pino@7.11.0` from `@walletconnect/logger` retained — not our import).
- **Pitfall 2 verified.** `grep -rnE "runtime.*['\"]edge['\"]" src/routes/` returns 0 hits at install time AND after the hooks edit. AsyncLocalStorage requires the Node runtime; documented in the module-level JSDoc on `logger.ts`.
- **src/lib/server/logger.ts (130 lines, NEW).** Module-top JSDoc explains the OBS-02 contract, the Node-only constraint (Pitfall 2), and the wallet-retention rationale (D-07). Single pino instance configured with: `level: dev ? 'debug' : 'info'`; `base: { app: 'st0x', env: dev ? 'dev' : 'prod' }`; `formatters.level: (label) => ({ level: label })` (so log level is a string, not pino's numeric default); `redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.signature', '*.privateKey'], censor: '[REDACTED]' }`; `timestamp: pino.stdTimeFunctions.isoTime`. Default + named `logger` export for boot-time/background-task callers; `getLogger()` for inside-request callers. `getRequestContext()` reads the active ALS store. `requestContextHandle: Handle` is the SvelteKit hook.
- **AsyncLocalStorage from node:async_hooks wraps every request.** Inside `requestContextHandle`, `contextStore.run({ request_id, wallet, route, method, start_ms }, async () => { … })` ensures any code path the resolver ends up calling — direct or async — can call `getRequestContext()` and see the same id. Sentry's hook (which runs after) sees the id too because `als.run` is synchronous-into-the-callback.
- **request_id resolution.** `event.request.headers.get('x-request-id') ?? randomUUID()`. Reuses a client-supplied id (cross-correlation; T-05-03 accepted) or mints a CSPRNG UUIDv4 (T-05-06 mitigation via `crypto.randomUUID()` from `node:crypto` — Node 24 satisfies). Response header `x-request-id` is set unconditionally on the resolved response so client error reports can include it.
- **Per-request summary line.** After resolving, the middleware emits one log line via `getLogger()[level]({ status, latency_ms }, 'request')` where `level = pickLevelForRoute(route, status)`. The base context (request_id, wallet, route, method) comes from the ALS store via the child logger; status + latency_ms are added at emit time.
- **pickLevelForRoute matrix matches D-07 exactly.** Status takes precedence over route: 5xx → error, 4xx → warn. Then route buckets: `/api/snapshots/*` → warn (D-07 noisy-route quieting), `/api/cron/*` → info, `/api/admin/*` → info, `/api/access/*` → info. Default → info. Pure function; pure unit-testable.
- **tests/lib/server/logger.test.ts (107 lines, NEW) — 13 unit tests, all pass.** Covers the matrix exhaustively: status-overrides-route on every bucket (5xx + 4xx variations), route-bucket on 2xx (warn for snapshots; info for cron/admin/access; info default), prefix-discipline against `/api/snapshotsfoo`-style false matches (4 cases). Plus `getRequestContext()` returns undefined outside any request, `getLogger()` returns a usable logger when no context is set (no throw), and an AsyncLocalStorage smoke test that seeds a value, awaits a microtask, and confirms the seeded value survives — guards against a hypothetical Node bug breaking ALS propagation (Pitfall 2 sister case).
- **src/hooks.server.ts surgical edit.** One new import (`import { requestContextHandle } from '$lib/server/logger';` at line 6); one ordering change at the bottom of the file: `export const handle = sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle);` — replacing the previous 2-element chain from Plan 01-04. Updated comment block above the export to document the OBS-01 + OBS-02 ordering rule. NOTHING ELSE in `hooks.server.ts` changed (Sentry init, CSP, existingHandle body, handleError export — all preserved verbatim). `! grep -q "sequence(Sentry\\.sentryHandle(), existingHandle)" src/hooks.server.ts` — old 2-element chain is gone.
- **svelte-check unchanged.** Reports only the 4 pre-existing `transaction.ts` errors flagged by 01-01 (Phase 2 work, deferred). Zero new errors introduced.
- **Test suite: 447 passed / 1 skipped (was 434 + 13 new logger tests).** No regressions across 25 test files.
- **Vite build phase succeeds (`✓ built in 15.99s`).** Post-Vite Vercel adapt step fails on local Node v24 — pre-existing environmental issue documented in 01-04-SUMMARY (adapter-vercel requires Node 18/20/22; Vercel CI runs Node 22 by default).

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Install pino@^9 + verify no Edge runtime exports (Pitfall 2)** — `7e51863` (chore)
   - `npm install pino@^9.9.5` resolved to `pino@9.14.0`
   - Verified `! grep -rqE "runtime.*['\"]edge['\"]" src/routes/`
   - Skipped `uuid` package — Node 24 has `crypto.randomUUID()` built in

2. **Task 2: Create src/lib/server/logger.ts (pino + AsyncLocalStorage middleware) + unit tests** — `67b0716` (feat)
   - 130 lines of pino + ALS code with module-top JSDoc documenting Node-only constraint
   - 107 lines of tests (13 cases) covering pickLevelForRoute exhaustively + ALS smoke test
   - svelte-check at baseline; vitest 13 new tests pass

3. **Task 3: Prepend requestContextHandle to handle sequence in src/hooks.server.ts** — `6ecc7e3` (feat)
   - Single import line added at line 6
   - Single sequence() arg list edit at line 497
   - Comment block above the export updated to document the OBS-01 + OBS-02 ordering contract

(Final docs/metadata commit follows this SUMMARY.md and STATE.md / ROADMAP.md / REQUIREMENTS.md updates.)

## Files Created/Modified

**New (2):**
- `src/lib/server/logger.ts` (130 lines — pino + AsyncLocalStorage<RequestContext>; exports default baseLogger + named `logger`, `getLogger()`, `getRequestContext()`, `requestContextHandle`, `pickLevelForRoute`)
- `tests/lib/server/logger.test.ts` (107 lines — 13 unit tests; pickLevelForRoute matrix exhaustive + AsyncLocalStorage smoke test)

**Modified (3):**
- `package.json` — `pino` `^9.14.0` added to dependencies (verified by `grep "\"pino\"" package.json` — 1 hit at line 93)
- `package-lock.json` — pino + 8 transitive deps
- `src/hooks.server.ts` — 1 import added (line 6); sequence chain reordered (line 497); comment block above the export reworded

## Decisions Made

- **Use `crypto.randomUUID()` from `node:crypto`, not the `uuid` npm package.** Node 24 ships `randomUUID()` natively (any Node ≥19 does). Skipping the dep keeps the tree thin; the CSPRNG guarantee is identical (V6 ASVS satisfied — T-05-06 mitigation).
- **Wallet retained in FULL in pino logs (not truncated).** Per D-07: Vercel Logs is admin-only-readable; Sentry's beforeSend scrubber (Plan 01-04) handles the third-party SaaS exposure separately. Doing both layers would double-redact and lose the forensic value in the admin tier where the wallet is the primary join key for incident correlation.
- **Pino built-in `redact` paths over a custom serializer.** Faster (runs at JSON-emit time, no walker on the entire object) and canonical (RESEARCH §Security V5). Covers Authorization, cookie headers, and any `*.signature` / `*.privateKey` field at any depth.
- **Lazy child logger via `getLogger()` per call (no top-level child cache).** Each call rebuilds the child from the active ALS store — pino's child clone is constant-time, so cost is negligible. Avoids stale-context bugs if a downstream call changes the wallet field mid-request, and is correct under nested `als.run()` (which we don't currently use, but the pattern doesn't preclude).
- **Default export + named `logger` export of `baseLogger`.** Module-scope / boot-time / background-task callers don't have a request context; they import the unscoped `logger` directly. Inside a request handler, prefer `getLogger()` for the bound child. Two named pathways instead of one keep the call-site intent explicit.
- **`x-request-id` response header set unconditionally.** Even on 4xx/5xx the response carries the id, so a client error report (e.g., user copy-pastes the response into a support thread) can quote the id back to the dev for log lookup.
- **Prefix discipline in `pickLevelForRoute`.** `/api/snapshots/` (with trailing slash) instead of `/api/snapshots` so a future `/api/snapshotsfoo` route doesn't inherit the warn level by accident. Test case `route prefix discipline` explicitly guards this.
- **`request` as the canonical `msg` for the per-request summary line.** Future Vercel Logs query: `msg="request" status>=500` lifts every server-side 5xx without false positives. Convention will be inherited by Plans 01-06..08 for downstream `event` / `msg` choices.
- **Single import line + single sequence() reorder in `hooks.server.ts`.** The minimal diff. Sentry init, CSP, existingHandle body, handleError — every other line preserved verbatim from Plan 01-04. Future plans can read the diff as one orderable change.

## Deviations from Plan

**None — plan executed exactly as written.**

The plan's `<action>` blocks and the orchestrator's `<critical_ordering>` and `<grep_proofs>` requirements were satisfied verbatim:
- pino installed at the specified version range; uuid skipped per the plan's NOTE about Node ≥19.
- logger.ts content matches RESEARCH §Pattern 2 with project conventions applied (tabs, single quotes).
- Hooks ordering matches `sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)` exactly.
- Edge runtime audit verified before AND after the hooks edit (0 hits).
- All grep proofs from the orchestrator's `<grep_proofs>` block return the expected counts.

No Rule 1/2/3 auto-fixes triggered. No Rule 4 architectural questions surfaced. No authentication gates encountered (this plan has no external service auth dependency).

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors at lines 664, 686, 708, 2346 — carried over from 01-01 baseline. Unchanged by this plan; remain Phase 2 work (TRADE-01..04). Logged in `deferred-items.md`.
- **Local Node v24 vs adapter-vercel's Node 18/20/22 requirement:** Pre-existing local environment issue identical to 01-04. The Vite build phase succeeds (`✓ built in 15.99s`); only the post-Vite Vercel adapt step fails locally with `Building locally with unsupported Node.js version: v24.1.0`. Vercel CI is unaffected (defaults to Node 22). Documented as environmental, not a regression — see 01-04-SUMMARY §Build smoke test result for the historical context.

## Smoke Test Recipe (for execute-phase deploy validation)

When `gsd/phase-1-shrink-the-surface-see-what-s-happening` reaches a deploy or `npm run dev` smoke step, the following two-step verification confirms OBS-02 is wired end-to-end:

1. **Header echo (client correlation):**
   ```bash
   curl -i http://localhost:5173/api/access/check 2>&1 | grep -i 'x-request-id'
   # expected: x-request-id: <uuid-v4>  (one line, lowercase header name from SvelteKit)
   ```
   Repeat with a client-supplied id to confirm reuse:
   ```bash
   curl -i -H 'x-request-id: trace-abc' http://localhost:5173/api/access/check 2>&1 | grep -i 'x-request-id'
   # expected: x-request-id: trace-abc
   ```

2. **Server log line (Vercel Logs / dev stdout):**
   With dev server running, `npm run dev | grep '"msg":"request"'` should yield a JSON line per request resembling:
   ```json
   {"level":"info","time":"2026-04-29T...","app":"st0x","env":"dev","request_id":"...","wallet":null,"route":"/api/access/check","method":"GET","status":200,"latency_ms":12,"msg":"request"}
   ```

3. **5xx fires `error` level (pickLevelForRoute):** trigger any deliberate 500 (e.g., a known-broken admin endpoint, or temporarily throw inside a handler), confirm the `request` log line carries `"level":"error"`.

These three checks are sufficient to prove (a) request_id propagation works, (b) per-request summary lines flow to stdout, and (c) the level matrix is wired correctly. No external service required.

## User Setup Required

None — pino writes to stdout; Vercel Logs captures it automatically without configuration. The `OBSERVABILITY_ALERT_WEBHOOK_URL` env var (D-09) belongs to Plan 01-06 (OBS-04), not this plan.

## Threat Flags

None new. All work was within the plan's `<threat_model>` scope:

- **T-05-01 mitigated** — pino built-in `redact` covers Authorization, cookie, `*.signature`, `*.privateKey`.
- **T-05-02 accepted** — `event.url.pathname` excludes the query string; verified by reading the middleware.
- **T-05-03 accepted** — client-supplied `x-request-id` is reused for cross-correlation (no info-disclosure gain to attacker; Vercel Logs admin-only).
- **T-05-04 mitigated** — ALS contexts GC'd when the request promise resolves; no global mutable state.
- **T-05-05 mitigated** — Pitfall 2 grep verified at install time AND after the hooks edit; module-top JSDoc documents the constraint.
- **T-05-06 mitigated** — `crypto.randomUUID()` from `node:crypto` is CSPRNG-backed (V6 ASVS).
- **T-05-07 mitigated** — pino auto-escapes JSON; canonical serialization.
- **T-05-08 accepted** — full wallet retained in pino logs (Vercel Logs admin-only-readable; Sentry handles third-party SaaS scrubbing in beforeSend).

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `test -f src/lib/server/logger.ts` — verified
- [x] `test -f tests/lib/server/logger.test.ts` — verified
- [x] `grep -q "\"pino\"" package.json` — 1 hit at line 93 (`"pino": "^9.14.0"`)
- [x] `grep -q "AsyncLocalStorage" src/lib/server/logger.ts` — 5 hits (1 import, 1 instance, 3 doc references)
- [x] `grep -q "async_hooks" src/lib/server/logger.ts` — 2 hits (1 import, 1 doc)
- [x] `grep -q "randomUUID" src/lib/server/logger.ts` — 3 hits (1 import, 1 use, 1 doc)
- [x] `grep -q "export const requestContextHandle" src/lib/server/logger.ts` — 1 hit at line 96
- [x] `grep -q "x-request-id" src/lib/server/logger.ts` — 4 hits (header read, header set, 2 doc references)
- [x] `grep -q "pickLevelForRoute" src/lib/server/logger.ts tests/lib/server/logger.test.ts` — many hits across both files
- [x] `grep -q "import { requestContextHandle } from '\$lib/server/logger'" src/hooks.server.ts` — 1 hit at line 6
- [x] `grep -q "sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle)" src/hooks.server.ts` — 1 hit at line 497
- [x] `! grep -q "sequence(Sentry\\.sentryHandle(), existingHandle)" src/hooks.server.ts` — old 2-element chain is gone (count: 0)
- [x] `! grep -rqE "runtime.*['\"]edge['\"]" src/routes/` — 0 hits (Pitfall 2 verified)
- [x] `npm test -- tests/lib/server/logger.test.ts --run` — 13 tests pass
- [x] `npm test -- --run` — 447 passed / 1 skipped (was 434 + 13 new)
- [x] `npm run check` — 4 pre-existing transaction.ts errors only; 0 new errors
- [x] `SENTRY_AUTH_TOKEN= npm run build` — Vite phase succeeds; post-Vite Vercel adapt fails on local Node v24 (pre-existing env issue documented in 01-04-SUMMARY)
- [x] All 3 task commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `7e51863`, `67b0716`, `6ecc7e3`
- [x] No unintended file deletions across the 3 task commits (`git diff --diff-filter=D --name-only HEAD~3 HEAD` returns empty)
- [x] requestContextHandle order matches D-07 critical ordering: request-id FIRST, then Sentry, then existing handle

## Next Plan Readiness

- **Plan 01-06 (OBS-04 RPC failure metrics + Slack alerts) is unblocked.** New helpers `src/lib/server/rpcMetrics.ts` (count `rpc_failed`) and `src/lib/server/alerts.ts` (post to `OBSERVABILITY_ALERT_WEBHOOK_URL` on chain-exhaust) will both call `getLogger()` for structured emit AND `getRequestContext()` to embed `request_id` in the Slack payload — exactly the pattern OBS-04 needs per CONTEXT D-09.
- **Plan 01-07 (OBS-03 take-order failure transcripts) is unblocked.** The taker-side failure capture in `marketOrderExecution.ts` runs client-side per D-15 (Sentry + console.error JSON line, NOT pino), but if/when a server-relayed take-order path is introduced it will use `getLogger().error('take-order failed', { ...transcript })` for long-term searchability. The plan-01-07 author can copy the `request` log-line shape for consistency.
- **Plan 01-08 (RUNBOOK) can quote the `x-request-id` smoke test recipe verbatim.**
- **Sentry breadcrumbs now carry request_id implicitly.** Because `requestContextHandle` runs BEFORE `Sentry.sentryHandle()`, any breadcrumb Sentry attaches during request handling (HTTP fetches, console.* calls, etc.) inherits the request_id from the ALS store via `getRequestContext()` — Plan 01-07 can extend Sentry's `extra` payload with `getRequestContext()?.request_id` for trivially-correlated triage.
- **OBS-02 is the fifth REQ-ID closed in Phase 1** (after DEPR-02 in 01-01, DEPR-01 in 01-02, DEPR-03 in 01-03, OBS-01 in 01-04). 5 down, 3 to go (OBS-03, OBS-04, OBS-05).
- **No carry-over deferred items closed in this plan.** The CACHE_KEYS orphan from 01-02 and the 4 pre-existing transaction.ts errors remain for future plans.

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
