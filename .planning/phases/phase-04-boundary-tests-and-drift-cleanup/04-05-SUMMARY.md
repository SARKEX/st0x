---
phase: 04-boundary-tests-and-drift-cleanup
plan: 05
subsystem: api
tags: [audit-log, admin, observability, security, sveltekit, kv]

# Dependency graph
requires:
  - phase: 04-boundary-tests-and-drift-cleanup
    provides: createAuditLogger surface (pre-existing in src/lib/server/auditLog.ts) and canonical pattern at src/routes/api/admin/codes/+server.ts
provides:
  - Audit-log emission on success+failure paths for excluded-wallets, pool-wallets, team-wallets, snapshots/trigger, snapshots/regenerate
  - 4 new AuditEventType members (POOL_WALLET_ADDED/REMOVED, SNAPSHOT_TRIGGERED, SNAPSHOT_REGENERATED)
  - WalletListPostOutcome contract on adminWalletList helper, decoupling KV mutation from per-endpoint audit emission
affects: [04-06 TEST-02 runtime per-endpoint tests, phase-exit Wave 6 grep gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-endpoint audit emission with non-blocking inner try/catch around audit.logFailure (cannot mask original error)"
    - "Helper-returns-outcome pattern: walletListPost returns {response, action, address, success, errorMessage} so the caller emits the audit event with the correct event-type mapping"

key-files:
  created: []
  modified:
    - src/lib/server/auditLog.ts
    - src/lib/server/adminWalletList.ts
    - src/routes/api/admin/excluded-wallets/+server.ts
    - src/routes/api/admin/pool-wallets/+server.ts
    - src/routes/api/admin/team-wallets/+server.ts
    - src/routes/api/admin/snapshots/trigger/+server.ts
    - src/routes/api/admin/snapshots/regenerate/+server.ts

key-decisions:
  - "Emit audit-log inline in each +server.ts (rather than inside walletListPost helper) so the phase-exit grep gate (createAuditLogger/logSuccess/logFailure literally present in every state-mutating admin handler) holds and per-endpoint event-type mapping stays explicit and reviewable"
  - "Refactored walletListPost to return WalletListPostOutcome instead of Response so the caller can map (action, success) → AuditEventType correctly without re-parsing the request body"
  - "Wrapped each audit.logSuccess/logFailure call in its own try/catch (T-04-05-03 mitigation): KV outage in audit infrastructure cannot mask the original endpoint error or alter the HTTP response"
  - "Added POOL_WALLET_REMOVED to the union (not strictly required by the plan must_haves, but the wallet helper handles both add and remove verbs symmetrically — emitting the wrong event type for a remove would corrupt the audit ledger)"

patterns-established:
  - "Pattern: state-mutating admin endpoint = requireAdmin → createAuditLogger(request) → try { ...; audit.logSuccess(EVENT, details, {adminUser:'admin'}); return ok } catch (err) { try { audit.logFailure(EVENT, details, err.message, {adminUser:'admin'}) } catch(auditErr) { console.error(...) } ; return err }"
  - "Pattern: shared admin helper returns structured outcome (response + audit metadata) instead of just Response, decoupling KV/business logic from per-route audit emission"

requirements-completed: [TEST-02]

# Metrics
duration: ~25min
completed: 2026-05-01
---

# Phase 04 Plan 05: TEST-02 Audit-Log Emission Summary

**5 state-mutating admin endpoints (excluded-wallets, pool-wallets, team-wallets, snapshots/trigger, snapshots/regenerate) now emit createAuditLogger success+failure events, completing ROADMAP success criteria #3 across all 8 admin handlers.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-01T20:55Z
- **Completed:** 2026-05-01T21:04Z
- **Tasks:** 2 / 2
- **Files modified:** 7

## Accomplishments

- Every state-mutating admin endpoint now emits audit-log events (codes, referral-programme/migrate, referral-programme/refresh were already audited; excluded-wallets, pool-wallets, team-wallets, snapshots/trigger, snapshots/regenerate are now audited).
- AuditEventType union extended with POOL_WALLET_ADDED, POOL_WALLET_REMOVED, SNAPSHOT_TRIGGERED, SNAPSHOT_REGENERATED.
- Behavior preserved across all 5 endpoints: identical status codes, identical response bodies, identical KV side effects on both success and failure paths. Audit emission is purely additive.
- Phase-exit Wave 6 grep gate (audit-log import on every state-mutating admin handler) returns 0 MISSING, ready for plan 04-10 to re-run.
- Plan 04-06 (TEST-02 part 2 — runtime per-endpoint tests) is now unblocked.

## Task Commits

1. **Task 1: Extend AuditEventType union** — `f8f1e7e` (feat)
2. **Task 2: Add audit-log emission to 5 admin handlers** — `6dbaedf` (feat)

## Files Created/Modified

- `src/lib/server/auditLog.ts` — Added 4 new AuditEventType union members (POOL_WALLET_ADDED, POOL_WALLET_REMOVED, SNAPSHOT_TRIGGERED, SNAPSHOT_REGENERATED). EXCLUDED_WALLET_* and TEAM_WALLET_* already existed.
- `src/lib/server/adminWalletList.ts` — Refactored walletListPost to return WalletListPostOutcome (response + action + address + success + errorMessage) so callers can emit per-action audit events. Behavior of every status-code branch is preserved.
- `src/routes/api/admin/excluded-wallets/+server.ts` — POST handler now creates an audit logger, delegates to walletListPost, and emits EXCLUDED_WALLET_ADDED/REMOVED on success or failure (with non-blocking inner try/catch).
- `src/routes/api/admin/pool-wallets/+server.ts` — Same shape, POOL_WALLET_ADDED/REMOVED.
- `src/routes/api/admin/team-wallets/+server.ts` — Same shape, TEAM_WALLET_ADDED/REMOVED.
- `src/routes/api/admin/snapshots/trigger/+server.ts` — POST handler emits SNAPSHOT_TRIGGERED on success (with date, blocks, blobsStored, triggeredAt) and on failure (with date, error.message). Audit emission isolated in nested try/catch — original 500 response still returned if audit-log infra fails.
- `src/routes/api/admin/snapshots/regenerate/+server.ts` — Same shape, SNAPSHOT_REGENERATED with scope (month/blockNumber), totalBlocks, successful, failed, regeneratedAt.

## Decisions Made

See `key-decisions` in frontmatter.

The most consequential decision was inlining audit emission per-endpoint rather than pushing it into `walletListPost`. The plan's evidence requirements were explicit: "grep -c 'logSuccess' on each of the 5 files >= 1" and "grep -c 'logFailure' on each of the 5 files >= 1". A helper-side emission would have failed the grep gate. The chosen shape (helper returns structured outcome, caller emits) keeps the event-type mapping explicit at each route and makes future audit-event additions a one-line change in the route handler.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] Added POOL_WALLET_REMOVED to the union**

- **Found during:** Task 1 (union extension)
- **Issue:** Plan listed only `POOL_WALLET_ADDED` in must_haves, but `walletListPost` handles both `add` and `remove` actions symmetrically. Emitting `POOL_WALLET_ADDED` on a remove operation would corrupt the audit ledger and break point-in-time admin-action reconstruction.
- **Fix:** Added `POOL_WALLET_REMOVED` to the AuditEventType union alongside `POOL_WALLET_ADDED`, mirroring the existing EXCLUDED_WALLET_* / TEAM_WALLET_* pairs.
- **Files modified:** `src/lib/server/auditLog.ts`
- **Verification:** Compiles clean (svelte-check baseline preserved at 3); pool-wallets POST now emits the correct event type for both add and remove.
- **Committed in:** `f8f1e7e` (Task 1 commit)

**2. [Rule 3 — Blocking refactor] Changed walletListPost return type from Response to WalletListPostOutcome**

- **Found during:** Task 2 (audit emission in 3 wallet endpoints)
- **Issue:** Original `walletListPost` returned a `Response` directly. Per-endpoint audit emission needs to know whether the operation was an add/remove and whether it succeeded — but parsing the JSON request body twice (once in helper, once in route) would double-consume the request stream and break behavior.
- **Fix:** Refactored helper to return `{response, action, address, success, errorMessage}`; each route reads `outcome.action` to map to the correct event type and `outcome.success` to choose logSuccess vs logFailure. Status codes and response JSON match the prior implementation exactly.
- **Files modified:** `src/lib/server/adminWalletList.ts`, all 3 wallet `+server.ts`.
- **Verification:** All 627 tests pass. svelte-check baseline preserved (3 errors). Response shapes identical for all branches (admin-guard reject, kv-not-configured, missing-address, invalid-address, duplicate-add, missing-remove, invalid-action, success).
- **Committed in:** `6dbaedf` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 blocking refactor)
**Impact on plan:** Both auto-fixes were necessary to keep the audit ledger correct (deviation 1) and to preserve behavior while satisfying the per-file grep evidence requirements (deviation 2). No scope creep.

## Issues Encountered

- Initial draft pushed audit emission into `walletListPost` (cleaner from a DRY standpoint), but the plan's evidence requirements mandated the literal strings `createAuditLogger`, `logSuccess`, and `logFailure` in each `+server.ts`. Reverted to the helper-returns-outcome pattern. Resolved before commit.

## Threat Mitigations Confirmed

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-04-05-01 (Repudiation) | mitigated | All 5 endpoints emit success+failure events; admin actions reconstructable from logs. |
| T-04-05-02 (Info Disclosure) | mitigated | `details` payloads contain only operational metadata (address, snapshot date/scope, timestamps, counts). No request bodies, headers, cookies, signatures, or secrets logged. |
| T-04-05-03 (Tampering / silenced audit) | mitigated | Inner try/catch around each `audit.logSuccess`/`logFailure` call ensures KV outage in audit infrastructure cannot mask the original error or alter the HTTP response. |
| T-04-05-04 (DoS via slow audit infra) | accepted (per plan) | Audit calls are awaited; latency cost matches existing audited endpoints (codes, referral-programme/*). |

## Verification

- `npm run check` → 3 errors (baseline preserved, in `tests/lib/server/rpcMetrics.test.ts` only)
- `npm test -- --run` → 627 passed, 1 skipped (no regressions)
- `npm run lint` → 15 pre-existing errors (verified by stash; none in modified files; out-of-scope per deviation rules)
- Per-file evidence grep: `createAuditLogger` ✓, `logSuccess` ✓, `logFailure` ✓ in all 5 endpoint files
- Phase-exit Wave 6 grep gate: 0 MISSING admin handlers

## Self-Check: PASSED

Created files:
- FOUND: `.planning/phases/phase-04-boundary-tests-and-drift-cleanup/04-05-SUMMARY.md` (this file)

Commits:
- FOUND: `f8f1e7e` (Task 1)
- FOUND: `6dbaedf` (Task 2)

Modified files (sample verification):
- FOUND: `src/lib/server/auditLog.ts`
- FOUND: `src/routes/api/admin/excluded-wallets/+server.ts`
- FOUND: `src/routes/api/admin/pool-wallets/+server.ts`
- FOUND: `src/routes/api/admin/team-wallets/+server.ts`
- FOUND: `src/routes/api/admin/snapshots/trigger/+server.ts`
- FOUND: `src/routes/api/admin/snapshots/regenerate/+server.ts`
- FOUND: `src/lib/server/adminWalletList.ts`

## Next Phase Readiness

- Plan 04-06 (TEST-02 part 2 — runtime per-endpoint tests) is unblocked: the 5 endpoints now emit audit events that 04-06 tests can assert against.
- Phase-exit grep gate (Wave 6, plan 04-10) for audit-log coverage on state-mutating admin handlers is structurally satisfied.

---
*Phase: 04-boundary-tests-and-drift-cleanup*
*Plan: 05*
*Completed: 2026-05-01*
