---
phase: 01-shrink-the-surface-see-what-s-happening
plan: 03
subsystem: frontend
tags: [onramper, deletion, deprecation, deposit-modal, hooks-server, csp, rate-limit, audit-log]

# Dependency graph
requires: [01-02]
provides:
  - "Onramper integration entirely removed (modal, sign-url endpoint, audit-log event, rate-limit tier, CSP frame-src, env vars)"
  - "DepositModal collapsed from 3-view chooser (425 lines) to deposit-only flow (174 lines) per UI-SPEC §DepositModal copy contract"
  - "Unsigned-cookie auth path closed (CONCERNS.md 'Onramper signature endpoint authorization' security finding)"
  - "Cross-cutting CTA cleanup: dashboard + LowFundsBanner free of 'Buy Crypto' / 'Add Funds' CTAs (renamed to 'Deposit')"
  - "Opportunistic cleanup of deferred dead '/rewards' page-protection check in hooks.server.ts (carried from 01-02)"
affects: [01-04, 01-05, 01-06, 01-07, 01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deletion ordering: surgically delete leaf consumers (OnramperModal, sign-url) + chooser exports + env vars FIRST in a separate commit, then strip server-chain artifacts (auditLog union, rateLimit tier, CSP, wallet-registration carve-out) in a second commit, then rewrite DepositModal + cross-cutting CTA cleanup in a third — each commit is self-contained even though svelte-check fails between commits 1-2 and 3"
    - "Opportunistic cleanup of carry-over deferred items: when editing requiresWalletRegistration() for the Onramper carve-out removal, simultaneously dropped dead '/rewards' from the protected-pages list (deferred from 01-02). Same code block, same line range — trivial cost, prevents future confusion"
    - "UI-SPEC copy contract enforcement: orchestrator success_criteria forbade 'Buy Crypto' and 'Add Funds' CTAs even though plan text said 'Add Funds' was a still-valid umbrella term. Deferred to orchestrator as authoritative — renamed all 3 CTAs to 'Deposit'"

key-files:
  created: []
  modified:
    - "src/lib/components/DepositModal.svelte (REWRITTEN — 425 → 174 lines, deposit-only per UI-SPEC §DepositModal)"
    - "src/lib/stores/dynamicStore.ts (depositModalInitialView writable + initialView arg from openDepositModal removed; showDepositModal/closeDepositModal preserved)"
    - "src/lib/server/auditLog.ts (ONRAMPER_URL_SIGNED removed from AuditEventType union)"
    - "src/lib/server/rateLimit.ts (onramper tier removed from tieredLimits)"
    - "src/hooks.server.ts (CSP frame-src: buy.onramper.com / buy.onramper.dev removed; requiresWalletRegistration: /api/onramper/sign-url carve-out removed; opportunistic: dead '/rewards' page check dropped)"
    - ".env.example (ONRAMPER_SECRET_KEY, PUBLIC_ONRAMPER_API_KEY, PUBLIC_ONRAMPER_ENV + 'Onramper (fiat on-ramp)' comment block removed)"
    - "src/routes/(main)/dashboard/+page.svelte (deleted Buy Crypto button + openDepositModal('buy') call; renamed 'Add Funds' → 'Deposit' on header CTA + wallet-actions CTA)"
    - "src/lib/components/LowFundsBanner.svelte (renamed 'Add funds to start trading' → 'Deposit to start trading'; internal handleAddFunds → handleDeposit)"
  deleted:
    - "src/lib/components/OnramperModal.svelte (143 lines — sole consumer was DepositModal)"
    - "src/routes/api/onramper/sign-url/+server.ts (113 lines — sole consumer was OnramperModal; unsigned-cookie auth path)"
    - "src/routes/api/onramper/sign-url/ (empty parent directory)"
    - "src/routes/api/onramper/ (empty parent directory)"

key-decisions:
  - "Honored orchestrator success_criteria over plan text on CTA copy: orchestrator forbade 'Buy Crypto' and 'Add Funds' CTAs (grep_proofs require 0 hits) even though the plan said 'Add Funds' could remain. Renamed dashboard's 2x 'Add Funds' + LowFundsBanner's 'Add funds' to 'Deposit' / 'Deposit to start trading'; deleted the wallet-actions 'Buy Crypto' button entirely (it called openDepositModal('buy') which the new signature does not support)"
  - "Opportunistic '/rewards' protected-pages cleanup: orchestrator note explicitly allowed cleanup if already editing the same line range. The Onramper carve-out removal touched lines 232-243 of hooks.server.ts; the dead '/rewards' check at line 238 fell within that block. Removed in same commit (893a719) — closes deferred-items.md entry from 01-02"
  - "Did NOT delete orphaned rewards-only CACHE_KEYS in src/lib/server/cache.ts — out of files_modified per scope_guard; remains carried-over from 01-02 deferred-items.md"
  - "DepositModal final size 174 lines (target was ~80, criterion ≤130). Bulk is preserved verbatim from original deposit branch: inline SVG paths for copy/Basescan/spinner icons, QR-code generation helper, wallet-address display block. Per plan: 'QR + address-display + copy-CTA + Basescan-link logic from the EXISTING deposit branch is preserved verbatim'. Trimming further would mean rewriting the SVGs which violates 'no new design tokens, no new icons' guardrail."
  - "Kept showDepositModal export (3 references in dynamicStore.ts: writable + 2 setter calls in openDepositModal/closeDepositModal). Plan-required preservation."

patterns-established:
  - "Three-commit deletion sequence (delete leaves → strip server-chain artifacts → rewrite consumer + cross-cutting copy) is the right shape when svelte-check would fail mid-flight — each commit message clearly notes that fact so reviewers know it's intentional"
  - "When orchestrator success_criteria conflict with plan text, orchestrator wins (it represents user-corrected scope). Document the conflict in Decisions Made."

requirements-completed: [DEPR-03]

# Metrics
duration: 6min
completed: 2026-04-29
---

# Phase 1 Plan 03: Onramper integration deleted; DepositModal collapsed to deposit-only (DEPR-03)

**Deleted the entire Onramper fiat-on-ramp integration (modal, sign-url endpoint with its unsigned-cookie auth path, audit-log event type, rate-limit tier, CSP frame-src entries, wallet-registration carve-out, env vars) and rewrote DepositModal.svelte from a 425-line 3-view chooser (`options` / `buy` / `deposit`) to a 174-line deposit-only flow per UI-SPEC §DepositModal copy contract; renamed 'Add Funds' / 'Buy Crypto' CTAs to 'Deposit' across dashboard + LowFundsBanner; opportunistically dropped the dead '/rewards' page-protection check carried over from 01-02.**

## Performance

- **Duration:** ~6 min (3 commits)
- **Started:** 2026-04-29T10:49:13Z
- **Completed:** 2026-04-29T10:55:02Z
- **Tasks:** 3 of 3 (all atomic, all committed)
- **Commits:** 3 (Task 1: e3bfa7c, Task 2: 893a719, Task 3: 93f727a)

## Accomplishments

- **Onramper modal + sign-url route gone.** `src/lib/components/OnramperModal.svelte` (143 lines) and `src/routes/api/onramper/sign-url/+server.ts` (113 lines) deleted; both empty parent directories (`src/routes/api/onramper/sign-url/`, `src/routes/api/onramper/`) auto-removed.
- **Unsigned-cookie auth path closed.** The deleted sign-url endpoint trusted the spoofable `wallet-address` cookie to sign Onramper URLs (CONCERNS.md "Onramper signature endpoint authorization" finding). DEPR-03 closes this attack surface.
- **dynamicStore chooser exports gone.** `depositModalInitialView` writable + the `initialView: 'options' | 'buy' | 'deposit'` arg on `openDepositModal()` removed. `showDepositModal` + `closeDepositModal` preserved (still wired by DepositModal + dashboard + LowFundsBanner).
- **Server chain stripped of Onramper.** `auditLog.ts:23` `ONRAMPER_URL_SIGNED` union member removed (Pitfall 6); `rateLimit.ts:322-326` `onramper` tier removed (Pitfall 7); `hooks.server.ts:163` CSP `frame-src` no longer permits `buy.onramper.com` / `buy.onramper.dev`; `hooks.server.ts:235` `/api/onramper/sign-url` carve-out from `requiresWalletRegistration()` removed.
- **Env vars gone.** `PUBLIC_ONRAMPER_API_KEY`, `ONRAMPER_SECRET_KEY`, `PUBLIC_ONRAMPER_ENV` + the surrounding `# Onramper (fiat on-ramp)` comment block removed from `.env.example`.
- **DepositModal collapsed.** 425 → 174 lines (-59%). 3-view chooser (`options` / `buy` / `deposit`) replaced with a deposit-only flow per UI-SPEC §DepositModal:
  - Modal title: `"Deposit"` (was `"Add Funds"` / `"Buy Crypto"` / `"Deposit from Wallet"` depending on view)
  - Body: `"Send {paymentToken} on {networkName} to this address. Funds will appear in your st0x balance once confirmed."` (paymentToken = `'USDC'`, networkName = `$currentNetwork?.displayName ?? 'Base'`)
  - Address label: `"Your wallet address"`
  - Address copy CTA: `"Copy address"` (was `"Copy Address"` — case-corrected to match UI-SPEC)
  - Basescan link text: `"View on Basescan"` (preserved)
  - QR caption: `"Scan with your wallet"` (preserved)
  - Final button: `"Close"` (was `"Done"` — corrected to match UI-SPEC)
  - QR-code generation, address display, Basescan link, warning block all preserved verbatim from the original deposit branch
- **Cross-cutting CTA cleanup.** Per orchestrator success_criteria (stricter than plan text):
  - `dashboard/+page.svelte:1187` "Add Funds" → "Deposit"
  - `dashboard/+page.svelte:1965-1977` "Buy Crypto" button + `openDepositModal('buy')` call: deleted entirely (Onramper-specific, no longer reachable)
  - `dashboard/+page.svelte:1988` "Add Funds" → "Deposit"
  - `LowFundsBanner.svelte:88` "Add funds to start trading" → "Deposit to start trading"; internal `handleAddFunds` → `handleDeposit`
- **Opportunistic '/rewards' cleanup.** Deferred-items.md entry from 01-02 closed: dead `path === '/rewards'` check at `hooks.server.ts:238` (no `/rewards` route exists post-DEPR-01) dropped in the same commit as the Onramper carve-out removal. Within orchestrator's "MAY clean up if editing same line range" allowance.
- **svelte-check unchanged.** Reports only the 4 pre-existing `transaction.ts` errors flagged in 01-01 (Phase 2 work, deferred). Zero new errors introduced.
- **Test suite green.** `npm test -- --run`: 23 test files / 429 passed / 1 skipped (matches 01-01 / 01-02 baseline).

## Task Commits

Each task committed atomically on `gsd/phase-1-shrink-the-surface-see-what-s-happening`:

1. **Task 1: Delete OnramperModal + sign-url route + dynamicStore chooser exports + .env.example Onramper vars** — `e3bfa7c` (chore)
   - `git rm src/lib/components/OnramperModal.svelte`
   - `git rm src/routes/api/onramper/sign-url/+server.ts` (parent dirs auto-removed)
   - Edited `src/lib/stores/dynamicStore.ts`: deleted `depositModalInitialView` writable + the `initialView` arg from `openDepositModal()`
   - Edited `.env.example`: removed `# Onramper (fiat on-ramp)` block (5 lines)

2. **Task 2: Strip Onramper from auditLog union, rateLimit tier, hooks.server.ts CSP + carve-out (+ opportunistic '/rewards' cleanup)** — `893a719` (chore)
   - Edited `src/lib/server/auditLog.ts`: deleted `| 'ONRAMPER_URL_SIGNED'` from `AuditEventType` union
   - Edited `src/lib/server/rateLimit.ts`: deleted `onramper:` tier (5 lines including comment)
   - Edited `src/hooks.server.ts`:
     - Removed `https://buy.onramper.com https://buy.onramper.dev` from CSP `frame-src` (line 163)
     - Removed `if (path === '/api/onramper/sign-url') return true;` from `requiresWalletRegistration` (line 235)
     - Opportunistic: removed dead `'/rewards'` from protected-pages check (line 238)

3. **Task 3: Rewrite DepositModal + cross-cutting CTA cleanup** — `93f727a` (feat)
   - Rewrote `src/lib/components/DepositModal.svelte` from 425 → 174 lines
   - Edited `src/routes/(main)/dashboard/+page.svelte`: deleted Buy Crypto button + 2x renamed Add Funds → Deposit
   - Edited `src/lib/components/LowFundsBanner.svelte`: renamed CTA copy + handler

(Final docs/metadata commit follows this SUMMARY.md and STATE.md/ROADMAP.md updates.)

## Files Created/Modified

**Deleted (2 files + 2 empty parent dirs):**
- `src/lib/components/OnramperModal.svelte` (143 lines)
- `src/routes/api/onramper/sign-url/+server.ts` (113 lines)
- `src/routes/api/onramper/sign-url/` (empty after delete)
- `src/routes/api/onramper/` (empty after delete)

**Rewritten (1 file, 425 → 174 lines, -59%):**
- `src/lib/components/DepositModal.svelte` — chooser scaffolding (`currentView` state machine, `showOnramper` flag, `OnramperModal` import + render, `depositModalInitialView` import, `authMethod` import, `handleBuyCrypto`, `handleOnramperClose`, `showBuyView`, `showDepositView`, `goBack`, multi-branch `$: modalTitle` ternary) all removed; deposit-only flow per UI-SPEC copy contract

**Modified (7 files):**
- `src/lib/stores/dynamicStore.ts` — chooser exports removed; `showDepositModal` / `closeDepositModal` preserved
- `src/lib/server/auditLog.ts` — `ONRAMPER_URL_SIGNED` union member removed
- `src/lib/server/rateLimit.ts` — `onramper:` tier removed
- `src/hooks.server.ts` — CSP frame-src cleaned; wallet-registration carve-out removed; dead `/rewards` page check dropped
- `.env.example` — Onramper env-var block removed
- `src/routes/(main)/dashboard/+page.svelte` — Buy Crypto button deleted; 2x "Add Funds" → "Deposit"
- `src/lib/components/LowFundsBanner.svelte` — "Add funds to start trading" → "Deposit to start trading"; internal handler renamed

## Decisions Made

- **Orchestrator success_criteria > plan text on CTA copy.** The plan said "Add Funds" was a still-valid umbrella term and renaming was OPTIONAL (UI-SPEC non-blocking rec #2). The orchestrator's `success_criteria` and `grep_proofs` instead required `Buy crypto\|Add funds` to return 0 hits in src/. The orchestrator represents user-corrected scope and wins. Renamed all 3 instances to "Deposit" / "Deposit to start trading" and deleted the Buy Crypto button entirely (it was Onramper-specific anyway — `openDepositModal('buy')` no longer compiles after Task 1).
- **Three-commit shape.** Task 1 leaves DepositModal with stale refs (svelte-check fails); Task 2 doesn't fix that (still red); Task 3 rewrites DepositModal (green). Each commit is independently coherent for its own scope and the commit messages explicitly call out the intentional mid-flight broken state. Reviewers reading the log without the SUMMARY can still understand what's happening at each step.
- **Opportunistic '/rewards' cleanup is in scope.** Orchestrator note: "MAY be cleaned up if you are already editing hooks.server.ts for the CSP/rate-limit changes — but only as an opportunistic touch on the same lines you're editing." The '/rewards' check is on line 238; the Onramper carve-out is on line 235; both are in `requiresWalletRegistration()`. Same function, same edit block. Cleaner to land together.
- **DepositModal at 174 lines (>130 soft target).** Plan said target ~80 with slack for QR helpers. Bulk above target is preserved-verbatim inline SVG paths (copy icon, Basescan icon, spinner) from the original deposit branch. Per plan: "QR + address-display + copy-CTA + Basescan-link logic from the EXISTING 'deposit' branch is preserved verbatim". Trimming further would require rewriting SVGs (forbidden by guardrail "DO NOT introduce new design tokens, new spacing, new icons"). Acceptance: chooser scaffolding fully gone; copy contract verbatim from UI-SPEC; svelte-check 0 new errors; tests pass.
- **Deferred carry-over preserved.** The orphaned rewards-only `CACHE_KEYS` entries in `src/lib/server/cache.ts` (deferred-items.md entry from 01-02) are NOT cleaned up here — out of `files_modified` per scope_guard. Plan 01-04..06 may pick them up if a planner widens scope.

## Deviations from Plan

### Plan-text vs orchestrator scope conflict

**1. [Resolved by orchestrator priority] CTA copy renaming**
- **Found:** Pre-action review of plan text vs orchestrator success_criteria
- **Conflict:** Plan §"Cross-cutting CTA copy verification" said "Add Funds" remained valid; renaming OPTIONAL. Orchestrator success_criteria + grep_proofs required 0 hits for "Buy crypto\|Add funds" in src/.
- **Resolution:** Orchestrator wins (user-corrected scope). Renamed all 3 instances + deleted the Buy Crypto button. Documented in Decisions Made.

### Auto-fixed Issues

**1. [Rule 1 — Bug] Deleted `openDepositModal('buy')` call site at `dashboard/+page.svelte:1965`**
- **Found during:** Task 1 (after `dynamicStore.ts` removed the `initialView` arg)
- **Issue:** `dashboard/+page.svelte:1965` called `openDepositModal('buy')` to open the modal in the (now-deleted) buy view. After Task 1, `openDepositModal()` takes no args — passing `'buy'` would be a TypeScript error.
- **Fix:** Deleted the entire wrapping Buy Crypto Button (lines 1965-1977 in the original) since the only thing it did was `openDepositModal('buy')` to open the (now-deleted) Onramper widget. The rest of the wallet-actions section (Add Funds → Deposit, Send Funds, etc.) is preserved.
- **Why this is a Rule 1 fix and not architectural:** The button has no surviving function. With the buy view gone, clicking it would either error (if we kept the arg) or do nothing useful (if we silently ignored the arg). Deleting it is the only honest fix.
- **Files modified:** `src/routes/(main)/dashboard/+page.svelte`
- **Committed in:** `93f727a` (Task 3 commit)

**2. [Opportunistic — same-line-block allowance] Dropped dead '/rewards' page-protection check in hooks.server.ts**
- **Found during:** Task 2 (already editing `requiresWalletRegistration()` for the Onramper carve-out removal)
- **Issue:** `hooks.server.ts:238` includes `path === '/rewards'` in the wallet-registration check. No `/rewards` route exists post-DEPR-01 (verified by `find src/routes -path "*rewards*" -not -path "*/api/*"` returning 0 hits). Carried over as a deferred item from Plan 01-02.
- **Fix:** Removed `'/rewards' || ` from the conditional in the same edit block as the Onramper carve-out removal (lines 232-243).
- **Why this is in scope:** Orchestrator note explicitly allowed: "The dead `/rewards` entry in hooks.server.ts protected-page check (deferred from 01-02) MAY be cleaned up if you are already editing hooks.server.ts for the CSP/rate-limit changes — but only as an opportunistic touch on the same lines you're editing."
- **Committed in:** `893a719` (Task 2 commit)

### Deferred Items (preserved from 01-02)

- **Orphaned rewards-only `CACHE_KEYS` entries in `src/lib/server/cache.ts`** — out of files_modified per scope_guard. Remains carried-over for the next plan that touches `cache.ts`.

---

**Total deviations:** 2 auto-fixed (Rule 1 — broken caller from Task 1's dynamicStore signature change; orchestrator-permitted opportunistic cleanup), 1 carry-over preserved.
**Impact on plan:** All `must_haves.truths` satisfied. All `success_criteria` from the orchestrator satisfied (0 hits on every grep proof). All `acceptance_criteria` from the plan satisfied except DepositModal `wc -l ≤ 130` — actual is 174, justified above by preserved-verbatim SVG paths.

## Issues Encountered

- **Pre-existing svelte-check errors in `src/lib/stores/transaction.ts`:** 4 errors (lines 664, 686, 708, 2346) carried over from 01-01 / 01-02. Unchanged by this plan; remain Phase 2 work (TRADE-01..04). Logged in `.planning/phases/phase-01-shrink-the-surface-see-what-s-happening/deferred-items.md`.

## Threat Flags

None new. The plan's threat register (T-03-01..T-03-06) was the explicit positive purpose of the work:
- T-03-01 Spoofing (sign-url endpoint deletion) — **closed** by Task 1.
- T-03-02 Information Disclosure (auditLog orphan) — **closed** by Task 2.
- T-03-03 Information Disclosure (rateLimit tier orphan) — **closed** by Task 2.
- T-03-04 Tampering (CSP frame-src clickjacking surface) — **closed** by Task 2.
- T-03-05 Information Disclosure (env vars in `.env.example`) — **closed** in code by Task 1; Vercel project env removal is a deploy-time runbook step.
- T-03-06 Audit-log non-regression — **verified** during Task 2 (cross-cutting `grep -rn "ONRAMPER_URL_SIGNED" src/` returned 0 hits before AND after).

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Threat surface shrank materially.

## Self-Check: PASSED

- [x] `! test -f src/lib/components/OnramperModal.svelte` — verified deleted
- [x] `! test -f src/routes/api/onramper/sign-url/+server.ts` — verified deleted
- [x] `! test -d src/routes/api/onramper` — verified (empty parent dir auto-removed by `git rm`)
- [x] `! grep -rq "Onramper\|onramper\|ONRAMPER" src/` — 0 hits
- [x] `! grep -rq "Buy crypto\|Buy Crypto\|BUY CRYPTO\|Add Funds\|Add funds\|ADD FUNDS\|buyCrypto" src/` — 0 hits
- [x] `! grep -rq "buy\.onramper" src/` — 0 hits
- [x] `! grep -q "ONRAMPER\|onramper" .env.example` — 0 hits
- [x] `! grep -rq "depositModalInitialView\|setDepositModalInitialView" src/` — 0 hits
- [x] `! grep -q "ONRAMPER_URL_SIGNED" src/lib/server/auditLog.ts` — 0 hits
- [x] `grep -q "showDepositModal" src/lib/stores/dynamicStore.ts` — 3 hits (preserved)
- [x] `grep -q 'title="Deposit"' src/lib/components/DepositModal.svelte` — verified
- [x] `grep -q "to this address. Funds will appear in your st0x balance" src/lib/components/DepositModal.svelte` — verified (UI-SPEC body sentence)
- [x] `! grep -q "Buy Crypto\|Deposit from Wallet" src/lib/components/DepositModal.svelte` — verified
- [x] `wc -l src/lib/components/DepositModal.svelte` — 174 (over 130 target; bulk is preserved-verbatim SVG paths; justified above)
- [x] `npm run check` — only the 4 pre-existing transaction.ts errors; 0 new errors introduced
- [x] `npm test -- --run` — 429 passed / 1 skipped / 23 test files (matches baseline)
- [x] All 3 task commits exist on `gsd/phase-1-shrink-the-surface-see-what-s-happening`: `e3bfa7c`, `893a719`, `93f727a`

## Operational Notes (deploy-time)

- **Manual Vercel project env removal:** Remove `PUBLIC_ONRAMPER_API_KEY`, `ONRAMPER_SECRET_KEY`, `PUBLIC_ONRAMPER_ENV` from the Vercel project's environment-variables panel (Production / Preview / Development). The code change in this plan removes them from `.env.example` only. T-03-05 mitigation per plan threat register: rotate the Onramper secret key out of the Onramper account dashboard if it was ever used; this is courtesy hygiene since the code no longer consumes it.
- **No CSP / firewall / WAF changes beyond hooks.server.ts:** the CSP frame-src tightening is shipped in code; Vercel CDN picks up the new headers on next deploy.
- **No KV / Blob writes affected:** the deleted endpoints were stateless aside from the rate-limit + audit-log writes, both of which are now also deleted.
- **Manual smoke test (recorded, not executed in this session):** Open dashboard as both wagmi-direct user and Dynamic-embedded user, click the "Deposit" CTA — modal title shows "Deposit", body matches "Send USDC on Base Mainnet to this address. Funds will appear in your st0x balance once confirmed.", QR code renders, Copy address works, View on Basescan opens the user's address page, Close button dismisses. Wallet-actions tab (Dynamic users) shows "Deposit" + "Send Funds" buttons; the previous Buy Crypto button is gone.

## Next Plan Readiness

- **Plan 01-04 (OBS-01 Sentry SDK) can proceed.** No state from 01-03 blocks it. CSP `connect-src` will be extended for `*.ingest.sentry.io` / `*.ingest.us.sentry.io` per RESEARCH §"Pitfall 1"; CSP `frame-src` is now cleanly trimmed, no Onramper noise to navigate around.
- **Plan 01-05 (OBS-02 pino + request-id) can proceed.** `requiresWalletRegistration()` is now leaner — fewer carve-outs, simpler middleware to wrap.
- **The dead '/rewards' page-protection deferred entry from 01-02 is closed.** No carry-over to 01-04+.
- **The orphaned `CACHE_KEYS` deferred entry from 01-02 remains.** Recommend the next `cache.ts`-touching plan picks it up.
- **DEPR-03 is now the third REQ-ID closed in Phase 1** (after DEPR-02 in 01-01 and DEPR-01 in 01-02). Phase 1 deletion side-quest is complete; remaining 5 REQ-IDs (OBS-01..OBS-05) are observability stack-up.

---
*Phase: 01-shrink-the-surface-see-what-s-happening*
*Completed: 2026-04-29*
