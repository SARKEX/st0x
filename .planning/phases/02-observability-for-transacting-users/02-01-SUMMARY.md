---
phase: 02-observability-for-transacting-users
plan: 01
subsystem: observability
tags: [observability, sentry, posthog, pino, correlation-id, trade-id, OBS-07, OBS-09]
requires: []
provides:
  - "src/lib/services/observability/tradeId.ts (mintTradeId, getCurrentTradeId, clearTradeId, TRADE_ID_HEADER)"
  - "src/lib/services/observability/tradeEvents.ts (trackTradeEvent, TradeEventName, ErrorClass, TradeEventProps)"
  - "src/lib/server/logger.ts (RequestContext.trade_id, X-Trade-Id header extraction with UUIDv4 validation)"
affects:
  - "Plan 02-02 (Sentry Replay tagging) — consumes getCurrentTradeId"
  - "Plan 02-03 (component instrumentation) — consumes trackTradeEvent + mintTradeId/clearTradeId"
tech_stack:
  added: []
  patterns:
    - "Typed discriminated unions for event names (TradeEventName) and error classes (ErrorClass) — single source of truth for funnel-event contract"
    - "Module-level lifecycle state with explicit clear() — same shape as Sentry scope tag"
    - "Strict-regex header validation in pino requestContextHandle — mirrors existing sessionId regex defense"
    - "Per-property scrubbing of error_message at PostHog boundary (parallel to Sentry scrub.ts)"
key_files:
  created:
    - "src/lib/services/observability/tradeId.ts"
    - "src/lib/services/observability/tradeEvents.ts"
    - "tests/lib/services/observability/tradeId.test.ts"
    - "tests/lib/services/observability/tradeEvents.test.ts"
    - "tests/lib/services/observability/tradeEvents.privacy.test.ts"
    - "tests/lib/server/logger.tradeId.test.ts"
  modified:
    - "src/lib/server/logger.ts (RequestContext + requestContextHandle + getLogger)"
decisions:
  - "Strict UUIDv4 regex (8-4-4-4-12 with version `4` + variant `[89ab]`) for X-Trade-Id validation — stricter than RESEARCH Pattern 3's loose form, costs nothing, rejects more attacker-supplied junk (T-2-A)"
  - "Duplicated ADDR_RE/SIG_RE constants in tradeEvents.ts (not imported from scrub.ts) — scrub.ts targets only the Sentry boundary; PostHog property scrubbing is parallel coverage per RESEARCH §V8 (T-2-B)"
  - "trade_id key omitted from logger child bindings when null/absent — keeps existing log shape orthogonal to the OBS-09 extension (no spurious `trade_id: null` in every server log line)"
  - "Mint-site selection deferred to Plan 03 — this module exposes only lifecycle primitives per D-claim (OBS-09 mint at submit-click only)"
metrics:
  duration: ~7 min
  completed: 2026-05-07T09:22:05Z
  tasks_completed: 3
  test_files_added: 4
  test_count_added: 21  # 7 (tradeId) + 5 (tradeEvents) + 4 (tradeEvents.privacy) + 5 (logger.tradeId)
---

# Phase 2 Plan 1: OBS-07/OBS-09 Foundation Modules Summary

OBS-07/OBS-09 infrastructure laid: a typed `trackTradeEvent` wrapper, a browser-side `trade_id` lifecycle (`mintTradeId`/`getCurrentTradeId`/`clearTradeId`), and pino `RequestContext` extension that propagates the `X-Trade-Id` header into server logs after strict UUIDv4 validation. No caller wiring — that lives in Plan 02-03.

## Modules Created and Exports

### `src/lib/services/observability/tradeId.ts` (~50 LOC)
- `TRADE_ID_HEADER = 'X-Trade-Id'` — browser→server header name
- `mintTradeId(): string` — creates UUIDv4, sets `Sentry.setTag('trade_id', id)`, stores in module state
- `getCurrentTradeId(): string | null` — accessor for the active trade id
- `clearTradeId(): void` — resets module state and clears the Sentry tag
- All Sentry calls wrapped in try/catch (never-throws-back convention)

### `src/lib/services/observability/tradeEvents.ts` (~95 LOC)
- `TradeEventName` — 12-member union: `trade_panel_opened` | `trade_button_clicked` | `quote_received` | `trade_initiated` | `sign_approval` | `sign_trade` | `broadcast` | `confirmed` | `trade_failed` | `trade_panel_abandoned` | `trade_error_shown` | `limit_order_deployed`
- `ErrorClass` — 11-member union: `slippage_exceeded` | `no_liquidity` | `stale_oracle` | `insufficient_balance` | `market_closed` | `user_rejected` | `rpc_error` | `preflight_chain_unreachable` | `preflight_order_vanished` | `auto_retry_exhausted` | `unknown`
- `TradeEventProps` — typed event payload with `[key: string]: unknown` escape hatch for legacy call-site extras
- `trackTradeEvent(name, props): void` — delegates to `analytics.track`, enriches with `trade_id` from `getCurrentTradeId()`, scrubs `error_message` for `0x[40]` addresses + `0x[130]` sigs

### `src/lib/server/logger.ts` (modified)
- `RequestContext.trade_id: string | null` field added
- `requestContextHandle` reads `x-trade-id` header, validates against strict UUIDv4 regex, stores in context
- `getLogger()` includes `trade_id` in child bindings only when non-null

## Test Coverage Delta

4 new test files, 21 new tests total — all passing. Existing `logger.test.ts` (13 tests) unchanged and still green.

| File | Tests |
|---|---|
| `tests/lib/services/observability/tradeId.test.ts` | 7 |
| `tests/lib/services/observability/tradeEvents.test.ts` | 5 |
| `tests/lib/services/observability/tradeEvents.privacy.test.ts` | 4 |
| `tests/lib/server/logger.tradeId.test.ts` | 5 |

## Threat Mitigations Landed

| Threat | Component | Mitigation |
|---|---|---|
| **T-2-A** Tampering — `X-Trade-Id` header injection / log forgery | `requestContextHandle` (logger.ts) | Strict UUIDv4 regex `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` rejects newline-injected, oversized, SQL/JS-payload values. Test 3 covers 7 hostile inputs. |
| **T-2-B** Information disclosure — PII leak via `error_message` | `tradeEvents.ts` | `scrubProps` strips `0x[40]` addresses + `0x[130]` signatures before payload reaches `track()`. Privacy test asserts no `0x[40]` substring in `track` mock payload. |
| **T-2-E** Information disclosure — `trade_id` cross-request leakage via module-level state | `tradeId.ts` | `clearTradeId()` primitive provided; Plan 03 component tasks enforce try/finally usage. Test 4 (consecutive distinctness) is the regression guard. |

## Decisions Implemented

- **D-01 (PostHog primary funnel-investigation surface)** — `trackTradeEvent` is the single source for trade-event payload shape; `TradeEventProps` typed contract.
- **OBS-07 foundation** — typed wrapper exists; component wiring deferred to Plan 02-03.
- **OBS-09 partial** — browser-side mint primitive + server-side header validation + pino propagation in place; mint-site call wiring deferred to Plan 02-03.

## Commits

| Hash | Type | Description |
|---|---|---|
| `6c4477c` | test | RED for tradeId lifecycle tests |
| `842968a` | feat | GREEN tradeId lifecycle module |
| `71b2daa` | test | RED for trackTradeEvent + privacy tests |
| `e14bac6` | feat | GREEN trackTradeEvent typed wrapper |
| `f87ebbd` | test | RED for pino RequestContext trade_id tests |
| `62e56ea` | feat | GREEN pino RequestContext extension |

## Verification

- `npx vitest run tests/lib/services/observability/ tests/lib/server/logger.tradeId.test.ts tests/lib/server/logger.test.ts` — **40/40 pass** (across 6 test files)
- `grep -c "trade_id" src/lib/server/logger.ts` = **5** (≥4 required: interface + extraction + run-context + getLogger child + comments)
- `grep -rn "TRADE_ID_HEADER\|trackTradeEvent\|mintTradeId\|getCurrentTradeId\|clearTradeId" src/` shows only definitions in `tradeId.ts`/`tradeEvents.ts` — no consumer wiring (per plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test 5 (tradeEvents.test.ts) initial failure due to mock-reset ordering**
- **Found during:** Task 2 GREEN run
- **Issue:** `getCurrentTradeIdMock.mockReturnValue('test-uuid')` was set in beforeEach before `vi.restoreAllMocks()`, so the value was wiped before tests ran (`trade_id: undefined` instead of `'test-uuid'`).
- **Fix:** Reordered `vi.restoreAllMocks()` to first line of beforeEach, then mock setup.
- **Files modified:** `tests/lib/services/observability/tradeEvents.test.ts`
- **Commit:** Folded into `e14bac6`.

**2. [Rule 3 — Blocking] Test 3 (logger.tradeId.test.ts) crashed jsdom Headers constructor on a newline-bearing invalid value**
- **Found during:** Task 3 GREEN run
- **Issue:** `'550e8400\\ne29b-...'` rejected at the Headers constructor before reaching the validator under test.
- **Fix:** Replaced the newline-injection sample with a bad-variant-nibble UUIDv4 (`...c716...`). HTTP-level newline injection is rejected at the Headers boundary by browsers and Node's fetch/jsdom implementations, so the test case did not reflect a reachable attack vector. The remaining 6 invalid samples cover the threat surface (oversized, SQL/JS payloads, malformed UUID).
- **Files modified:** `tests/lib/server/logger.tradeId.test.ts`
- **Commit:** Folded into `f87ebbd` (pre-commit) and `62e56ea` (test edit).

**3. [Rule 3 — Blocking] Test type spy on `baseLogger.child`**
- **Found during:** Task 3 `npm run check`
- **Issue:** pino's `child()` overload signature was incompatible with `vi.spyOn`'s default inferred mock implementation type.
- **Fix:** Cast the mock implementation `as unknown as typeof baseLogger.child`.
- **Files modified:** `tests/lib/server/logger.tradeId.test.ts`
- **Commit:** Folded into `62e56ea`.

### Deferred (Out of Scope)

- **rpcMetrics test type errors** at `tests/lib/server/rpcMetrics.test.ts:165,181,182` — pre-existing as of commit `66958043` (2026-05-05). Logged in `.planning/phases/02-observability-for-transacting-users/deferred-items.md`. Not addressed in this plan.

## Open Follow-ups

- **Plan 02-03 (component instrumentation):** wire `mintTradeId()` at submit-click sites (Buy/Sell buttons), `clearTradeId()` in `finally` blocks, `trackTradeEvent(...)` at the 12 funnel points. Plan 03 acceptance criteria + component tests enforce the try/finally discipline (T-2-E residual risk).
- **Plan 02-02 (Sentry Replay tagging):** consume `getCurrentTradeId()` in `captureTakeOrderFailure.ts` to attach `trade_id` tag and feed it into Replay context.
- **Browser→server propagation wiring:** the browser fetch-layer must add `X-Trade-Id` to outgoing API requests during an active trade (deferred to Plan 02-03 alongside the mint sites).

## TDD Gate Compliance

All three tasks followed RED → GREEN: each `feat` commit is preceded by a `test` commit on the same scope.

| Task | RED commit | GREEN commit |
|---|---|---|
| 1 (tradeId) | `6c4477c` | `842968a` |
| 2 (tradeEvents) | `71b2daa` | `e14bac6` |
| 3 (logger.tradeId) | `f87ebbd` | `62e56ea` |

No REFACTOR commits required — initial implementations were minimal.

## Self-Check: PASSED

- `[ -f src/lib/services/observability/tradeId.ts ]` → FOUND
- `[ -f src/lib/services/observability/tradeEvents.ts ]` → FOUND
- `[ -f src/lib/server/logger.ts ]` → FOUND (modified)
- `[ -f tests/lib/services/observability/tradeId.test.ts ]` → FOUND
- `[ -f tests/lib/services/observability/tradeEvents.test.ts ]` → FOUND
- `[ -f tests/lib/services/observability/tradeEvents.privacy.test.ts ]` → FOUND
- `[ -f tests/lib/server/logger.tradeId.test.ts ]` → FOUND
- Commits `6c4477c 842968a 71b2daa e14bac6 f87ebbd 62e56ea` all present in `git log` → FOUND
