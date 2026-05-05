---
phase: 03-production-grade-hardening
plan: 08b
type: execute
wave: 6
depends_on: [03-01, 03-02, 03-05, 03-07, 03-08a]
files_modified:
  - src/hooks.server.ts
  - src/lib/server/logger.ts
  - src/routes/api/access/check/+server.ts
  - src/routes/access/+page.server.ts
  - src/routes/api/snapshots/preview/+server.ts
  - src/routes/api/snapshots/preview-stream/+server.ts
  - src/routes/+layout.svelte
autonomous: false
requirements: [SEC-03]
requirements_addressed: [SEC-03]
tags: [phase-3, sec-03, atomic-flip, wallet-address-consumer-migration, manual-smoke]
must_haves:
  truths:
    - "hooks.server.ts:271 reads 'session' cookie + KV record (NOT 'wallet-address' cookie); existing getWalletFromRequest is now async"
    - "All 5 server-side wallet-address consumers migrated to readSession from $lib/server/walletSession (hooks.server.ts, logger.ts, /api/access/check, /api/snapshots/preview, /api/snapshots/preview-stream)"
    - "src/routes/access/+page.server.ts now ALSO deletes the 'session' cookie + KV record on logout-equivalent flows (deleteSession from walletSession.ts)"
    - "Snapshot preview endpoints (Plan 03-05) updated to read 'session' cookie + KV walletAddress for rate-limit tier (preserves the rate-limit tier behavior 03-05 wired with the 'wallet-address' cookie)"
    - "wallet-address cookie is downgraded to non-authoritative hint per CONTEXT D-04 — set client-side in +layout.svelte but NEVER used for auth on the server side"
    - "Manual smoke-test gate (D-04 VALIDATION) executes in Vercel preview stage BEFORE production deploy: login → trade → reload → trade → log out → log in → trade. Passes only when ONE wallet-signature prompt at sign-in, NEVER per request (D-04b hard guarantee)"
    - "D-04b hard guarantee: once a user signs in, the cookie authenticates every subsequent request — wallet signature is never re-prompted per request"
    - "Phase 2 cross-cutting gates carried forward: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance, failWith() count ≥ 12 in marketOrderExecution.ts, EMERGENCY_RATIO_MULTIPLIER count = 0, svelte-check baseline ≤ 3 errors, staleTime: Infinity"
  artifacts:
    - path: src/hooks.server.ts
      provides: "getWalletFromRequest async; reads 'session' cookie; calls maybeRefreshSession; never reads 'wallet-address' cookie for auth"
      contains: "readSession"
    - path: src/routes/access/+page.server.ts
      provides: "Logout-equivalent flow deletes session cookie + KV record"
      contains: "deleteSession"
    - path: src/routes/+layout.svelte
      provides: "wallet-address cookie hint downgrade — comment explicit non-authoritative"
      contains: "NON-AUTHORITATIVE"
  key_links:
    - from: src/hooks.server.ts (getWalletFromRequest)
      to: src/lib/server/walletSession.ts (readSession + maybeRefreshSession)
      via: "cookies.get('session') → readSession → record.walletAddress"
      pattern: "readSession"
    - from: src/routes/api/access/check/+server.ts
      to: src/lib/server/walletSession.ts (readSession)
      via: "rate-limit tier read uses session-cookie-derived walletAddress"
      pattern: "readSession"
    - from: src/routes/api/snapshots/preview/+server.ts
      to: src/lib/server/walletSession.ts (readSession)
      via: "rate-limit tier (snapshotsPreview) read uses session-cookie-derived walletAddress; replaces the wallet-address cookie read 03-05 wired"
      pattern: "readSession"
---

<objective>
Per SEC-03 (CONTEXT D-04 atomic flip; D-04b hard UX constraint). This plan is the SECOND half of the SEC-03+04 atomic flip — consumer migration. Plan 03-08a introduced the new infrastructure (walletSession.ts module, auth routes, SEC-04 csrf.ts rewrite). This plan migrates the 5 server-side wallet-address consumers to read the new 'session' cookie + KV record instead, and downgrades the client-side wallet-address cookie to a non-authoritative personalization hint.

**Plan-shape note (per checker fix #5 split):** 03-08a + 03-08b ship as a single atomic-flip PR (Wave 6 still represents the SEC-03+SEC-04 paired ship per CONTEXT D-01). 03-08b depends_on 03-08a so the consumer migration cannot land before the new infrastructure is in place. **No partial deploy** — both plans must merge in the same PR. Atomic-flip discipline preserved at PR-shape, NOT plan-shape (consistent with Phase 2 D-08 pattern).

**5 server-side wallet-address consumers migrated in this plan** (verified via grep at planning time; re-verify at execution):
1. `src/hooks.server.ts:271` — `cookies.get('wallet-address')` read in `getWalletFromRequest` → readSession + maybeRefreshSession (`getWalletFromRequest` becomes async)
2. `src/lib/server/logger.ts:98` — wallet read for log enrichment → readSession (or read from `event.locals.walletAddress` if hooks.server.ts populates it; pick the simpler shape during execution)
3. `src/routes/api/access/check/+server.ts:25` — rate-limit tier read uses session-cookie-derived walletAddress
4. `src/routes/api/snapshots/preview/+server.ts` (post Plan 03-05) — rate-limit tier (snapshotsPreview) read migrates from wallet-address cookie to session
5. `src/routes/api/snapshots/preview-stream/+server.ts` (post Plan 03-05) — same migration as preview

**Plus: 1 client-side downgrade** (not a server-auth migration but an explicit non-authoritative hint comment):
6. `src/routes/+layout.svelte:65-80` — setWalletCookie body unchanged; preceding comment marks the cookie as NON-AUTHORITATIVE per CONTEXT D-04

**Plus: 1 logout cleanup hand-off**:
7. `src/routes/access/+page.server.ts:8` — existing `cookies.delete('wallet-address', { path: '/' })` augmented to ALSO `await deleteSession(sessionId)` + `cookies.delete('session', { path: '/' })`

Per D-04b (hard UX constraint): once a user signs in, the cookie authenticates every subsequent request — the wallet signature is never re-prompted per request. The double-submit-cookie CSRF pattern (SEC-04, Plan 03-08a) does NOT require re-signing — it's an HTTP-level check (HMAC the session-id with CSRF_SECRET). The migrations in this plan never call `verifyWalletSignature` on the per-request path; they only read the KV record bound to a previously-verified wallet.

**Manual smoke-test gate (Task 2):** stage smoke recipe per D-04 VALIDATION runs in Vercel preview deploy BEFORE production. KV isolation note: Vercel KV is shared between preview and production unless overridden — assume shared; cleanup recipe (delete `wallet_session:*` records by wallet address used in smoke test) is documented in 03-RUNBOOK.md (Plan 03-11). The Vercel preview deploy IS the stage per checker fix #8.

Purpose: Closes SEC-03 consumer-side. Combined with Plan 03-08a (infrastructure) + Plan 03-08b (consumer migration), the SEC-03 + SEC-04 audit findings close: spoofable client-set wallet-address cookie is no longer accepted as auth; CSRF tokens stop being forgeable by anyone with the secret.

Output: 7 file modifications + 1 manual smoke checkpoint task.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/phase-03-production-grade-hardening/03-CONTEXT.md
@.planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md
@.planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md
@.planning/phases/phase-03-production-grade-hardening/03-VALIDATION.md
@.planning/phases/phase-03-production-grade-hardening/03-05-SUMMARY.md
@.planning/phases/phase-03-production-grade-hardening/03-08a-SUMMARY.md
@src/hooks.server.ts
@src/lib/server/logger.ts
@src/routes/api/access/check/+server.ts
@src/routes/access/+page.server.ts
@src/routes/api/snapshots/preview/+server.ts
@src/routes/api/snapshots/preview-stream/+server.ts
@src/routes/+layout.svelte

<interfaces>
<!-- Surfaces 03-08a provides for this plan to consume -->

From src/lib/server/walletSession.ts (Plan 03-08a):
```typescript
export async function readSession(sessionId: string): Promise<WalletSessionRecord | null>
export async function maybeRefreshSession(sessionId: string, record: WalletSessionRecord): Promise<void>
export async function deleteSession(sessionId: string): Promise<void>
export interface WalletSessionRecord {
    walletAddress: string;
    issuedAt: number;
    lastSeenAt: number;
}
```

From src/hooks.server.ts:267-279 (existing getWalletFromRequest — currently SYNC, becomes ASYNC post-this-plan):
```typescript
function getWalletFromRequest(cookies: { get: (name: string) => string | undefined }): string | null {
    const walletAddress = cookies.get('wallet-address');
    if (walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return walletAddress.toLowerCase();
    }
    return null;
}
```

Wallet-address consumer sites (all 5 server-side — verified by grep at planning time):
- `src/hooks.server.ts:271` — `const walletAddress = cookies.get('wallet-address');`
- `src/lib/server/logger.ts:98` — `const wallet = event.cookies.get('wallet-address') ?? null;`
- `src/routes/api/access/check/+server.ts:25` — `const cookieWallet = cookies.get('wallet-address');`
- `src/routes/api/snapshots/preview/+server.ts` (post Plan 03-05 — `cookies.get('wallet-address')` for rate-limit tier read)
- `src/routes/api/snapshots/preview-stream/+server.ts` (post Plan 03-05 — same)

Plus client-side site (NOT a server-auth read — comment downgrade only):
- `src/routes/+layout.svelte:63-80` — client-side `document.cookie = ...`

Plus logout-equivalent site (cookie cleanup):
- `src/routes/access/+page.server.ts:8` — `cookies.delete('wallet-address', { path: '/' });`

Manual smoke recipe (D-04 / 03-VALIDATION.md):
```
1. Connect wallet → page loads, wallet visible
2. Sign in modal → click Sign → wallet sig prompt → success
3. /trade/[id] → place order → ONE tx prompt (NO sig prompt)
4. Reload page → still authed (cookie persists)
5. /trade/[id] → place order → still NO sig prompt
6. POST /api/auth/logout → cookie cleared
7. Reload → access/sign-in modal reappears
8. Sign in again → sig prompt → continues working
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: SEC-03 atomic-flip consumer migration — 5 server-side wallet-address consumers + +layout.svelte hint downgrade + access/+page.server.ts logout cleanup</name>
  <read_first>
    - src/hooks.server.ts (lines 240-280 — getWalletFromRequest at 267-279; verify caller list via grep)
    - src/lib/server/logger.ts (line 98 — wallet read for log enrichment)
    - src/routes/access/+page.server.ts (line 8 — cookies.delete)
    - src/routes/api/access/check/+server.ts (lines 10-40 — cookieWallet read)
    - src/routes/api/snapshots/preview/+server.ts (post Plan 03-05 — cookieWallet read for rate-limit tier)
    - src/routes/api/snapshots/preview-stream/+server.ts (post Plan 03-05 — same)
    - src/routes/+layout.svelte (lines 60-85 — setWalletCookie function)
    - src/lib/server/walletSession.ts (created in Plan 03-08a — readSession, maybeRefreshSession, deleteSession exports)
    - .planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md §"src/hooks.server.ts (server module, per-request middleware) — SEC-03 + SEC-04" lines 920-955
    - .planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md §"src/routes/+layout.svelte (client component, side-effect) — SEC-03 hint downgrade" lines 991-1009
    - .planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md §"Pattern 6: Atomic-Flip Authorization Cookie Migration" lines 591-619
  </read_first>
  <files>src/hooks.server.ts, src/lib/server/logger.ts, src/routes/api/access/check/+server.ts, src/routes/access/+page.server.ts, src/routes/api/snapshots/preview/+server.ts, src/routes/api/snapshots/preview-stream/+server.ts, src/routes/+layout.svelte</files>
  <action>
**Pre-flight grep audit:** Run `grep -rn "wallet-address" src/` and verify the consumer list matches the 7 sites enumerated in `<read_first>` (5 server-auth reads + 1 client-side hint + 1 logout-cleanup). If new consumers have appeared since planning (unlikely in this phase — Plan 03-08a did not add any), add them to the migration. Atomic flip per CONTEXT D-04 — leave NO server-side consumer reading 'wallet-address' as auth.

**File 1 — `src/hooks.server.ts`:**

Add to imports (top of file):
```typescript
import { readSession, maybeRefreshSession } from '$lib/server/walletSession';
```

REPLACE `getWalletFromRequest` (currently sync at line 267-279) with the async version per 03-PATTERNS.md lines 938-949:

```typescript
async function getWalletFromRequest(
    cookies: { get: (name: string) => string | undefined }
): Promise<string | null> {
    const sessionId = cookies.get('session');
    if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
    const record = await readSession(sessionId);
    if (!record) return null;
    // Fire-and-forget sliding refresh; throttled to 1 KV write per 24h
    void maybeRefreshSession(sessionId, record);
    return record.walletAddress;
}
```

`getWalletFromRequest` becomes ASYNC. Update every call site within hooks.server.ts to `await` the call. Locate via `grep -n "getWalletFromRequest" src/hooks.server.ts`. Each site needs an `await` prefix. svelte-check will catch missing awaits at type-check time.

**File 2 — `src/lib/server/logger.ts`:**

Locate the existing line 98 `const wallet = event.cookies.get('wallet-address') ?? null;`. Replace with a session-cookie-derived read.

Since `logger.ts` is called from inside the request handle path (not a SvelteKit handler that has `event.locals` populated yet at log-time), the cleanest migration is:

```typescript
import { readSession } from './walletSession';

// Inside the function that builds log enrichment context:
const sessionId = event.cookies.get('session');
let wallet: string | null = null;
if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
    const record = await readSession(sessionId);
    wallet = record?.walletAddress ?? null;
}
```

If logger.ts is called in a sync context (e.g. middleware that runs before the handle finishes), the simpler approach is to use `event.locals.walletAddress` set by hooks.server.ts (which already has `event.locals.walletAddress = await getWalletFromRequest(event.cookies)` somewhere). Read hooks.server.ts at execution time to confirm whether `event.locals.walletAddress` is set; if so, change logger.ts to read it from locals (no extra KV roundtrip).

**File 3 — `src/routes/access/+page.server.ts`:**

Locate `cookies.delete('wallet-address', { path: '/' })`. Augment to ALSO delete the session cookie + KV record:

```typescript
import { deleteSession } from '$lib/server/walletSession';

// Inside the existing function:
const sessionId = cookies.get('session');
if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
    await deleteSession(sessionId);
}
cookies.delete('session', { path: '/' });
cookies.delete('wallet-address', { path: '/' });   // hint cookie — clear too
```

**File 4 — `src/routes/api/access/check/+server.ts`:**

Currently at line 25: `const cookieWallet = cookies.get('wallet-address');`

Replace with:
```typescript
import { readSession } from '$lib/server/walletSession';

// Inside the handler:
const sessionId = cookies.get('session');
let cookieWallet: string | null = null;
if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
    const record = await readSession(sessionId);
    cookieWallet = record?.walletAddress ?? null;
}
const isOwnAddress = cookieWallet?.toLowerCase() === address.toLowerCase();
const walletForRateLimit = isOwnAddress ? address : null;
// ... rest of the handler unchanged ...
```

**Files 5 + 6 — `src/routes/api/snapshots/preview/+server.ts` and `src/routes/api/snapshots/preview-stream/+server.ts`:**

Plan 03-05 added these handlers reading `cookies.get('wallet-address')` for rate-limit tier (intentional staged migration; this plan completes the migration). Same pattern as access/check above:

```typescript
import { readSession } from '$lib/server/walletSession';

const sessionId = cookies.get('session');
let wallet: string | null = null;
if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
    const record = await readSession(sessionId);
    wallet = record?.walletAddress ?? null;
}
const rateLimitResponse = await applyTieredRateLimit(
    request,
    'snapshotsPreview',
    'snapshots-preview',  // or 'snapshots-preview-stream' for the stream endpoint
    wallet
);
if (rateLimitResponse) return rateLimitResponse;
```

**File 7 — `src/routes/+layout.svelte`:**

Locate the existing setWalletCookie function (lines 60-85). The cookie SET continues client-side (D-04 — cookie is downgraded to a non-authoritative hint, NOT removed). Per 03-PATTERNS.md lines 998-1006, update the COMMENT immediately above setWalletCookie to:

```svelte
<script lang="ts">
    // 'wallet-address' cookie is a NON-AUTHORITATIVE personalization hint for tiered
    // rate-limit resolution only (e.g. /api/access/check tier promotion when the cookie
    // matches the queried address). Authentication is established by the server-issued
    // 'session' cookie minted at /api/auth/session via wallet signature verification.
    // Do NOT use this cookie to grant any permission server-side.
    function setWalletCookie(address: string | null) {
        // ... existing body lines 65-80 unchanged ...
    }
</script>
```

The body of setWalletCookie is unchanged — cookie continues to be set/cleared client-side.

**Compile + test:**

Run `npm run check` — svelte-check should still be at baseline (≤ 3 errors). The async getWalletFromRequest may surface new errors at call sites that didn't `await`; fix those.

Run `npm test` — full suite passes.

**Phase-exit grep verification (carry-forward gate for the migration):**

After this task, run `grep -rn "cookies.get('wallet-address')" src/`:
- Expected: 0 hits in server-side code (`src/lib/server/`, `src/routes/api/`, `src/hooks.server.ts`, `src/routes/+page.server.ts`, etc.)
- ALLOWED hits: `src/routes/+layout.svelte` (client-side cookie set/clear remains; that's `document.cookie =` not `cookies.get`)
- ALLOWED hit: `src/routes/access/+page.server.ts` may have `cookies.delete('wallet-address', ...)` — that's a hint-cookie cleanup, not a read

If any unexpected hit remains, migrate that file. The atomic-flip invariant is "no surviving server-side consumer reads 'wallet-address' as auth proof".
  </action>
  <verify>
    <automated>! grep -rn "cookies.get('wallet-address')" src/lib src/hooks.server.ts src/routes/api 2>/dev/null &amp;&amp; grep -c "readSession" src/hooks.server.ts | xargs test 1 -le &amp;&amp; grep -c "readSession" src/routes/api/access/check/+server.ts | xargs test 1 -le &amp;&amp; grep -c "readSession" src/routes/api/snapshots/preview/+server.ts | xargs test 1 -le &amp;&amp; grep -c "readSession" src/routes/api/snapshots/preview-stream/+server.ts | xargs test 1 -le &amp;&amp; grep -c "deleteSession" src/routes/access/+page.server.ts | xargs test 1 -le &amp;&amp; grep -c "NON-AUTHORITATIVE" src/routes/+layout.svelte | xargs test 1 -le &amp;&amp; npm run check 2>&amp;1 | tail -3 &amp;&amp; npm test 2>&amp;1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `! grep -rn "cookies.get('wallet-address')" src/lib src/hooks.server.ts src/routes/api` returns 0 hits (server-side AUTH read fully migrated)
    - `grep -c "readSession" src/hooks.server.ts` returns ≥ 1
    - getWalletFromRequest is async (verify by reading the function definition — `async function getWalletFromRequest`)
    - All 5 server consumers (hooks.server.ts, logger.ts, /api/access/check, /api/snapshots/preview, /api/snapshots/preview-stream) use readSession (or read from `event.locals.walletAddress` populated by hooks)
    - `grep -c "deleteSession" src/routes/access/+page.server.ts` returns 1
    - `grep -c "NON-AUTHORITATIVE" src/routes/+layout.svelte` returns 1 (hint downgrade comment present)
    - svelte-check baseline ≤ 3 errors preserved (any new errors from async getWalletFromRequest awaits must be fixed)
    - Full test suite passes
  </acceptance_criteria>
  <done>
    - All 7 wallet-address sites migrated atomically (5 server-auth reads + 1 hint downgrade + 1 logout cleanup)
    - getWalletFromRequest async; reads session cookie + KV record
    - Atomic flip complete — no in-flight broken state
    - +layout.svelte cookie set/clear retained but documented as non-authoritative hint
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manual smoke test — atomic-flip session cookie + 30-day sliding (D-04 VALIDATION) — Vercel preview is the stage</name>
  <what-built>
    Plan 03-08a + 03-08b together ship SEC-03 + SEC-04: server-issued session cookie minted via wallet signature, 30-day sliding expiry, all 5 server-side wallet-address consumers migrated, CSRF tokens session-bound. Per CONTEXT D-04 + 03-VALIDATION.md "Manual-Only Verifications", a stage-environment smoke test gates production deploy.

    **Stage environment definition (per checker fix #8):**
    - The Vercel preview deploy of the 03-08a + 03-08b PR IS the stage. No separate "stage" environment is provisioned for v1.
    - Vercel KV is shared between preview and production unless overridden via separate env vars. Assume shared. Smoke-test session-id KV records will land under the `wallet_session:*` namespace and persist for 30 days unless explicitly deleted.
    - **Cleanup recipe (post-smoke):** see 03-RUNBOOK.md (Plan 03-11) "Smoke-test cleanup" section — operator manually deletes `wallet_session:*` KV records keyed by the wallet address(es) used during the smoke test, OR waits 30 days for natural TTL expiry. Recipe lives in 03-RUNBOOK.md so future smoke tests can reuse.
  </what-built>
  <how-to-verify>
    Push the 03-08a + 03-08b PR branch to a Vercel preview deploy BEFORE merging to main. The preview URL is the stage. Run the recipe verbatim:

    1. **Connect wallet** (existing connected session — wallet-address cookie still set from pre-deploy). Page loads, wallet address visible in nav.
    2. **First post-deploy visit:** sign-in modal should appear (or whichever UI prompt the app shows when getWalletFromRequest returns null because no session cookie is set yet). Click "Sign in".
    3. Wallet client (MetaMask / WalletConnect / Dynamic) prompts for ONE message signature. Sign it. Modal dismisses; nav shows authenticated state.
    4. **Place a market order** on /trade/[id]. There should be ONE wallet prompt: the transaction prompt. NOT a signature prompt.
    5. Trade succeeds; receipt visible; balance updated.
    6. **Reload the page** (Ctrl+R / Cmd+R). Page loads — should still be authenticated (session cookie persists; nav still shows wallet).
    7. **Place another order.** Again ONE wallet prompt (the tx prompt). NOT a signature prompt.
    8. **POST /api/auth/logout** (e.g., click a Logout button if wired, or paste `await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })` in console). Cookie should clear.
    9. Reload — sign-in modal reappears.
    10. Sign in again — wallet signature prompt appears, click Sign — proceed normally. Trade flows continue working.

    **Pass criteria:**
    - Step 3 prompts ONCE (per session)
    - Step 4 + 7 do NOT prompt for signature (only tx prompt)
    - Step 8 clears the cookie (verify via DevTools → Application → Cookies)
    - Step 10 prompts again (new session)

    **Fail criteria (block production deploy):**
    - Any per-request signature prompt (D-04b violation)
    - Reload (step 6) loses auth (cookie not persisting)
    - 401s on /api/auth/csrf or other endpoints after sign-in
    - Trade flow breaks anywhere

    **Cleanup after smoke (per checker fix #8):**
    - The smoke session creates a `wallet_session:<sessionId>` KV record. After approval, the operator either (a) leaves the record to expire naturally at 30 days (acceptable — record is bound to the operator's own wallet), or (b) manually deletes via `vercel kv del wallet_session:<sessionId>` once the sessionId is identified from DevTools. Recipe is in 03-RUNBOOK.md (Plan 03-11) "Smoke-test cleanup".

    Capture screenshots/notes; document any anomalies in 03-08b-SUMMARY.md.
  </how-to-verify>
  <resume-signal>
    Type "approved" to proceed with merging 03-08a + 03-08b together to main and triggering production deploy, or describe specific issues observed (per-request signature prompts, cookie persistence failures, etc.) for revision.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client-set cookie ('wallet-address') | Pre-Phase-3 was used as auth proof; spoofable via JS console. Post-this-plan: downgraded to non-authoritative hint; never read server-side as auth. |
| Server-issued cookie ('session') | HttpOnly + Secure + SameSite=Strict; Plan 03-08a mints; this plan reads via readSession. |
| Vercel preview deploy (the stage) | KV shared with production unless overridden; smoke-test cleanup recipe in 03-RUNBOOK.md. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-SEC-03-01 | Spoofing | Client-set 'wallet-address' cookie can be set by anyone in JS console — pre-Phase-3, server treated this as auth proof | mitigate (BLOCKER — closes the audit finding) | Atomic flip: hooks.server.ts:271 + 4 other server consumers migrated to read 'session' cookie + KV record. Wallet-address cookie remains as non-authoritative hint per CONTEXT D-04. |
| T-03-SEC-03-06 | Per-request signature regression (UX disaster) | Implementation accidentally prompts for wallet signature on every request | mitigate (BLOCKER — D-04b hard rejection) | hooks.server.ts reads cookie + KV record only via readSession; never calls verifyWalletSignature on the per-request path. Manual smoke test (Task 2) is the gate. |
| T-03-SEC-03-08 | Tampering / Stale-state | Atomic flip lands consumer migration without infrastructure (or vice versa) — broken intermediate state | mitigate | depends_on: [03-08a] enforces 03-08a lands first; both plans merge as a single PR (CONTEXT D-04 atomic-flip discipline). 03-08a defines the surfaces; this plan consumes them. |
| T-03-SEC-03-09 | Smoke-test KV pollution | Smoke test creates `wallet_session:*` KV records that persist 30 days in Vercel KV (shared between preview and production) | accept (with cleanup recipe) | Cleanup recipe in 03-RUNBOOK.md (Plan 03-11) "Smoke-test cleanup". Records are bound to operator wallet only; no security impact, just KV-namespace hygiene. |
</threat_model>

<verification>
- `! grep -rn "cookies.get('wallet-address')" src/lib src/hooks.server.ts src/routes/api` returns 0 hits
- `grep -c "readSession" src/hooks.server.ts` ≥ 1
- All 5 server-side wallet-address consumers use readSession (or event.locals.walletAddress populated by hooks)
- +layout.svelte hint-downgrade comment present
- access/+page.server.ts deletes session + KV record on logout-equivalent flows
- Manual smoke test (Task 2) approved before production deploy
- `npm test` passes
- `npm run check` passes at Phase 2 baseline (≤ 3 errors)

**Phase 2 carry-forward gates (must remain green):**
- TRADE-01 IO-perspective lockdown — no changes
- TRADE-02 cycle severance — no changes
- failWith() count ≥ 12 — no changes
- EMERGENCY_RATIO_MULTIPLIER = 0 — no changes
- staleTime: Infinity — no changes
</verification>

<success_criteria>
- All 5 server-side wallet-address consumers migrated atomically (no in-flight broken state)
- wallet-address cookie downgraded to non-authoritative hint (server never reads it for auth)
- Logout-equivalent flow deletes session cookie + KV record
- Manual smoke test passes (login → trade → reload → trade → log out → log in → trade with one signature only at sign-in)
- Phase 2 cross-cutting gates green
- 03-08a + 03-08b merge as a single atomic-flip PR
</success_criteria>

<output>
After completion (including manual smoke approval), create `.planning/phases/phase-03-production-grade-hardening/03-08b-SUMMARY.md` documenting:
- The consumer-migration outcome (which 5 server sites + 1 client downgrade + 1 logout cleanup landed; any deviations)
- Manual smoke test outcome (approved/issues; pass/fail per pass-criterion)
- Smoke-test KV record IDs created during smoke (so the operator can run cleanup recipe in 03-RUNBOOK.md)
- Cross-cutting gate snapshot
- Confirmation that 03-08a + 03-08b shipped together in a single PR (atomic-flip discipline preserved at PR-shape)
</output>
