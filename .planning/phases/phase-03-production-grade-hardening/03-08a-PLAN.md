---
phase: 03-production-grade-hardening
plan: 08a
type: execute
wave: 6
depends_on: [03-01, 03-02, 03-07]
files_modified:
  - src/lib/server/walletSession.ts
  - src/lib/server/walletSession.test.ts
  - src/lib/server/signatureChallenge.ts
  - src/lib/server/signatureChallenge.test.ts
  - src/lib/server/csrf.ts
  - src/lib/server/csrf.test.ts
  - src/routes/api/auth/session/challenge/+server.ts
  - src/routes/api/auth/session/+server.ts
  - src/routes/api/auth/logout/+server.ts
  - src/routes/api/auth/csrf/+server.ts
autonomous: true
requirements: [SEC-04]
requirements_addressed: [SEC-04]
tags: [phase-3, sec-03, sec-04, session-cookie, csrf, wallet-session, auth-routes]
user_setup:
  - service: "Vercel KV (Redis)"
    why: "Session-id → wallet record storage (already present from signatureChallenge.ts; this plan adds wallet_session:* namespace)"
    env_vars: []
    dashboard_config: []
must_haves:
  truths:
    - "src/lib/server/walletSession.ts exports createSession / readSession / maybeRefreshSession / deleteSession with KV-backed lifecycle (30-day TTL, 24h sliding refresh — CONTEXT D-04a)"
    - "src/lib/server/signatureChallenge.ts exports issueSessionLoginChallenge + verifySessionLoginChallenge under the new 'session_login' purpose (atomic GET+DEL Lua script preserved)"
    - "POST /api/auth/session/challenge issues nonce; POST /api/auth/session verifies signature via REL-02 fallback chain → mints HttpOnly+Secure+SameSite=Strict 'session' cookie with path=/ and maxAge 30 days"
    - "POST /api/auth/logout deletes the KV session record AND clears the 'session' cookie (with path: '/' per RESEARCH Pitfall 10)"
    - "csrf.ts replaces stateless generateCsrfToken/validateCsrfToken with session-bound generateCsrfTokenForSession/validateCsrfTokenForSession (HMAC(sessionId, CSRF_SECRET).slice(0,32); crypto.timingSafeEqual compare)"
    - "GET /api/auth/csrf returns 401 unless 'session' cookie present; otherwise returns { token: HMAC(sessionId, CSRF_SECRET).slice(0,32) }"
    - "SEC-02 module-load throw from Plan 03-02 preserved at top of csrf.ts (carry-forward gate — phase-exit grep for fallback strings stays green)"
    - "Phase 2 cross-cutting gates carried forward: TRADE-01 IO-perspective lockdown, TRADE-02 cycle severance, failWith() count ≥ 12 in marketOrderExecution.ts, EMERGENCY_RATIO_MULTIPLIER count = 0, svelte-check baseline ≤ 3 errors, staleTime: Infinity"
  artifacts:
    - path: src/lib/server/walletSession.ts
      provides: "createSession / readSession / maybeRefreshSession / deleteSession KV-backed lifecycle"
      contains: "createSession"
    - path: src/lib/server/walletSession.test.ts
      provides: "NEW unit test pinning createSession + readSession + sliding refresh + delete"
      contains: "createSession"
    - path: src/routes/api/auth/session/challenge/+server.ts
      provides: "NEW POST: issues 'session_login' nonce via signatureChallenge.ts new purpose"
      contains: "issueSessionLoginChallenge"
    - path: src/routes/api/auth/session/+server.ts
      provides: "NEW POST: verifies signature via REL-02 chain → mints session cookie"
      contains: "createSession"
    - path: src/routes/api/auth/logout/+server.ts
      provides: "NEW POST: deletes session KV + clears cookie"
      contains: "deleteSession"
    - path: src/lib/server/signatureChallenge.ts
      provides: "Extended with 'session_login' purpose (issueSessionLoginChallenge / verifySessionLoginChallenge)"
      contains: "session_login"
    - path: src/lib/server/csrf.ts
      provides: "generateCsrfTokenForSession + validateCsrfTokenForSession (HMAC-bound to session-id)"
      contains: "generateCsrfTokenForSession"
    - path: src/routes/api/auth/csrf/+server.ts
      provides: "GET requires 'session' cookie; issues HMAC(sessionId, CSRF_SECRET) token"
      contains: "generateCsrfTokenForSession"
  key_links:
    - from: src/routes/api/auth/session/+server.ts
      to: src/lib/server/accessCodes.ts (verifyWalletSignature)
      via: "REL-02 fallback chain — Plan 03-07 already shipped"
      pattern: "verifyWalletSignature"
    - from: src/routes/api/auth/session/+server.ts
      to: src/lib/server/walletSession.ts (createSession)
      via: "creates KV record + returns sessionId; cookies.set('session', sessionId, ...)"
      pattern: "createSession"
    - from: src/routes/api/auth/csrf/+server.ts
      to: src/lib/server/csrf.ts (generateCsrfTokenForSession)
      via: "session cookie required → HMAC(sessionId, CSRF_SECRET)"
      pattern: "generateCsrfTokenForSession"
---

<objective>
Per SEC-03 + SEC-04 (CONTEXT D-04 atomic flip; D-04a 30-day sliding; D-04b no-per-request-signature). This plan is the FIRST half of the SEC-03+04 atomic flip. It introduces the new infrastructure (walletSession.ts module, signatureChallenge.ts new purpose, 3 new auth routes, SEC-04 csrf.ts rewrite, /api/auth/csrf gate) but does NOT migrate existing wallet-address consumers — that is Plan 03-08b.

**Plan-shape note (per checker fix #5 split):** 03-08a + 03-08b ship as a single atomic-flip PR (Wave 6 still represents the SEC-03+SEC-04 paired ship per CONTEXT D-01). The split is internal — splitting a 5-task / 16-file plan into two scoped plans (03-08a 3 tasks / 9 files; 03-08b 2 tasks / 7 files) keeps each plan within the 2-3 task budget and the file-modification threshold from the planner spec. Both plans must merge together; 03-08b depends_on 03-08a so the consumer migration cannot land before the new infrastructure is in place. Atomic-flip discipline preserved at PR-shape, NOT plan-shape (consistent with Phase 2 D-08 pattern).

The session-id is server-side random 32-byte CSPRNG (createSession). The 30-day sliding session (D-04a) is implemented by `maybeRefreshSession` throttled to once per 24h (RESEARCH A2); KV TTL is reset on refresh. Re-sign happens only on (a) 30-day inactivity (KV record expired), (b) explicit logout (new endpoint), (c) admin invalidation (KV delete via console), (d) cookie clear / device change.

The CSRF double-submit-cookie pattern (SEC-04) binds the token to the session-id via HMAC(sessionId, CSRF_SECRET). Stateless tokens issued by an unauthenticated endpoint are removed; GET /api/auth/csrf returns 401 unless the session cookie is present. crypto.timingSafeEqual prevents timing-leak compare. Per D-04b: validation is HTTP-level (HMAC compare) — never re-prompts wallet signature.

Purpose: Closes the infrastructure half of SEC-03 + SEC-04. Plan 03-08b closes the consumer-migration half + manual smoke gate. The two together close the audit findings; neither alone is sufficient. Deploy boundary: BOTH plans must merge together (no intermediate state).

Output: 1 NEW server module (walletSession.ts) + 1 NEW test file + 3 NEW route handlers + extended signatureChallenge.ts purpose + extended signatureChallenge.test.ts + rewritten csrf.ts (post Plan 03-02 SEC-02 retains module-load throw) + extended csrf.test.ts SEC-04 block + modified /api/auth/csrf endpoint.
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
@.planning/phases/phase-03-production-grade-hardening/03-02-SUMMARY.md
@.planning/phases/phase-03-production-grade-hardening/03-07-SUMMARY.md
@src/lib/server/signatureChallenge.ts
@src/lib/server/signatureChallenge.test.ts
@src/lib/server/kv.ts
@src/lib/server/auth.ts
@src/lib/server/csrf.ts
@src/lib/server/accessCodes.ts
@src/routes/api/auth/csrf/+server.ts
@src/routes/api/access/challenge/+server.ts
@src/routes/api/access/register/+server.ts

<interfaces>
<!-- Existing precedents the executor must mirror verbatim -->

From src/lib/server/signatureChallenge.ts (existing purpose enum + KV record + atomic GET+DEL Lua script — extend with 'session_login' purpose):
```typescript
// Existing purposes: 'access_register', 'referral_join', 'referral_update_nickname'
// NEW purpose: 'session_login'
// Pattern: issueAccessRegistrationChallenge → verifyAccessRegistrationChallenge
// Add: issueSessionLoginChallenge → verifySessionLoginChallenge (same shape)
```

From src/lib/server/kv.ts (KV access surface):
```typescript
export async function getKv(): Promise<RedisClientType | null>
// Methods on the returned client: kv.set(key, value, { PX: ttlMs }), kv.get(key), kv.del(key)
```

From src/routes/api/access/register/+server.ts:1-127 (canonical "verify signature → server-side state mutation" route handler — mirror the shape for /api/auth/session POST):
```typescript
import { verifyWalletSignature } from '$lib/server/accessCodes';  // post-REL-02
import { applyRateLimit, rateLimiters } from '$lib/server/rateLimit';
import { verifyAccessRegistrationChallenge } from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'register');
    if (rateLimitResponse) return rateLimitResponse;
    const { address, code, signature, challengeNonce, referralCode } = await request.json();
    // ... validation (4 if-statements) ...
    const challenge = await verifyAccessRegistrationChallenge(address, challengeNonce, code);
    if (!challenge.valid || !challenge.message) {
        return json({ success: false, error: challenge.error }, { status: 400 });
    }
    const result = await processRegistration(address, code, signature, challenge.message);
    // ...
};
```

From src/routes/api/access/challenge/+server.ts:1-43 (canonical "issue challenge nonce" route — mirror for /api/auth/session/challenge POST).

From src/lib/server/auth.ts:24-30 (timingSafeEqual precedent — already proven in this codebase for constant-time compare).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SEC-03 walletSession.ts module + 'session_login' purpose extension + tests</name>
  <read_first>
    - src/lib/server/signatureChallenge.ts (full file — purpose enum, issueX/verifyX pairs, KV key shape)
    - src/lib/server/signatureChallenge.test.ts (full file — testing boilerplate to copy)
    - src/lib/server/kv.ts (full file — getKv() surface)
    - .planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md §"src/lib/server/walletSession.ts (NEW server module)" lines 692-779
    - .planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md §"src/lib/server/walletSession.test.ts (NEW)" lines 1075-1106
    - .planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md §"Pattern 1: Server-Issued Session Cookie" lines 279-390
  </read_first>
  <files>src/lib/server/walletSession.ts, src/lib/server/walletSession.test.ts, src/lib/server/signatureChallenge.ts, src/lib/server/signatureChallenge.test.ts</files>
  <behavior>
    - Test 1 (createSession round-trip): createSession('0xABC...') returns { sessionId, expiresAt }; sessionId matches /^[a-f0-9]{64}$/; readSession(sessionId) returns { walletAddress: '0xabc...' (lowercased), issuedAt, lastSeenAt }
    - Test 2 (readSession unknown id): readSession('unknown-id') returns null
    - Test 3 (maybeRefreshSession throttle): record with lastSeenAt = now - 1h → maybeRefreshSession is a no-op (KV.set NOT called); record with lastSeenAt = now - 25h → maybeRefreshSession calls kv.set with new lastSeenAt
    - Test 4 (deleteSession): deleteSession(sessionId) calls kv.del; subsequent readSession returns null
    - Test 5 (signatureChallenge.ts session_login purpose): issueSessionLoginChallenge(address) returns { nonce, message, expiresAt }; verifySessionLoginChallenge(address, nonce) returns { valid: true, message } on first call AND { valid: false } on second call (atomic GET+DEL invariant — same Lua script as existing 'access_register' purpose)
  </behavior>
  <action>
RED → GREEN cycle for walletSession.ts + signatureChallenge.ts purpose extension.

**Step 1 (RED) — Create NEW `src/lib/server/walletSession.test.ts`:**

Mirror `src/lib/server/signatureChallenge.test.ts:1-90` boilerplate verbatim (same vi.hoisted + vi.mock('./kv') shape). Test the 4 lifecycle behaviors above. Keep tests pure (mock kv at module-private scope).

**Step 2 (RED) — Add SEC-03 'session_login' purpose tests to `src/lib/server/signatureChallenge.test.ts`:**

Append a new `describe('session_login purpose (SEC-03)', () => { ... })` block. Mirror existing 'access_register' tests; verify Lua script atomic GET+DEL by attempting to verify the same nonce twice — second call returns `{ valid: false }`.

**Step 3 (GREEN) — Create NEW `src/lib/server/walletSession.ts`:**

Per RESEARCH §"Pattern 1" lines 287-341 + 03-PATTERNS.md lines 692-779, copy verbatim:

```typescript
import crypto from 'crypto';
import { getKv } from './kv';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;       // 30 days (CONTEXT D-04a)
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;       // refresh once per 24h (RESEARCH A2)

export interface WalletSessionRecord {
    walletAddress: string;
    issuedAt: number;
    lastSeenAt: number;
}

function sessionKey(sessionId: string): string {
    return `wallet_session:${sessionId}`;
}

export async function createSession(walletAddress: string): Promise<{ sessionId: string; expiresAt: number }> {
    const sessionId = crypto.randomBytes(32).toString('hex');  // 64 hex chars
    const now = Date.now();
    const record: WalletSessionRecord = {
        walletAddress: walletAddress.toLowerCase(),
        issuedAt: now,
        lastSeenAt: now
    };
    const kv = await getKv();
    if (!kv) throw new Error('Session storage unavailable');
    await kv.set(sessionKey(sessionId), JSON.stringify(record), { PX: SESSION_TTL_MS });
    return { sessionId, expiresAt: now + SESSION_TTL_MS };
}

export async function readSession(sessionId: string): Promise<WalletSessionRecord | null> {
    const kv = await getKv();
    if (!kv) return null;
    const raw = await kv.get(sessionKey(sessionId));
    if (!raw) return null;
    try { return JSON.parse(raw) as WalletSessionRecord; } catch { return null; }
}

export async function maybeRefreshSession(sessionId: string, record: WalletSessionRecord): Promise<void> {
    const now = Date.now();
    if (now - record.lastSeenAt < REFRESH_THRESHOLD_MS) return;
    const kv = await getKv();
    if (!kv) return;
    record.lastSeenAt = now;
    await kv.set(sessionKey(sessionId), JSON.stringify(record), { PX: SESSION_TTL_MS });
}

export async function deleteSession(sessionId: string): Promise<void> {
    const kv = await getKv();
    if (!kv) return;
    await kv.del(sessionKey(sessionId));
}
```

**Step 4 (GREEN) — Extend `src/lib/server/signatureChallenge.ts`:**

Locate the existing purpose enum/union at line 14-17. Add `'session_login'` to the union. Add new exports `issueSessionLoginChallenge(address)` and `verifySessionLoginChallenge(address, nonce)` that mirror the shape of `issueAccessRegistrationChallenge` / `verifyAccessRegistrationChallenge` — same KV TTL (5 minutes), same Lua-script atomic GET+DEL on verify, same `crypto.randomBytes(16).toString('hex')` nonce generator.

The `message` returned by issueSessionLoginChallenge should be a clear human-readable string like:
```
Sign in to st0x

Wallet: <address>
Nonce: <nonce>
Issued: <ISO timestamp>

This signature does not authorize any transaction; it only proves wallet ownership for the session cookie. Expires in 5 minutes.
```

Adjust the exact wording to fit the existing style of `buildAccessRegistrationMessage` (read that function to mirror).

Run `npm test -- --run walletSession.test signatureChallenge.test` — all tests pass.

Commits:
- `test(03-08a): add Wave 0 walletSession.test.ts + signatureChallenge.ts session_login purpose tests`
- `feat(03-08a): SEC-03 walletSession.ts KV-backed session lifecycle + session_login challenge purpose`
  </action>
  <verify>
    <automated>npm test -- --run walletSession.test signatureChallenge.test 2>&amp;1 | tail -10 &amp;&amp; grep -c "createSession\|readSession\|maybeRefreshSession\|deleteSession" src/lib/server/walletSession.ts | xargs test 4 -le &amp;&amp; grep -c "session_login" src/lib/server/signatureChallenge.ts | xargs test 1 -le &amp;&amp; grep -c "issueSessionLoginChallenge\|verifySessionLoginChallenge" src/lib/server/signatureChallenge.ts | xargs test 2 -le &amp;&amp; npm run check 2>&amp;1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "createSession\|readSession\|maybeRefreshSession\|deleteSession" src/lib/server/walletSession.ts` ≥ 4 (definitions present)
    - `grep -c "30 \* 24 \* 60 \* 60 \* 1000" src/lib/server/walletSession.ts` returns 1 (30-day TTL)
    - `grep -c "session_login" src/lib/server/signatureChallenge.ts` ≥ 1
    - `grep -c "issueSessionLoginChallenge\|verifySessionLoginChallenge" src/lib/server/signatureChallenge.ts` ≥ 2
    - `npm test -- --run walletSession.test` passes
    - `npm test -- --run signatureChallenge.test` passes (existing + new SEC-03 block)
    - svelte-check baseline ≤ 3 errors preserved
  </acceptance_criteria>
  <done>
    - walletSession.ts has 4-method lifecycle backed by KV with 30-day TTL + 24h sliding refresh threshold
    - signatureChallenge.ts has session_login purpose with same atomic GET+DEL Lua precedent
    - Tests pin lifecycle + atomic single-use semantics
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: SEC-03 NEW route handlers — /api/auth/session/challenge POST + /api/auth/session POST + /api/auth/logout POST</name>
  <read_first>
    - src/routes/api/access/challenge/+server.ts:1-43 (canonical issue-challenge route)
    - src/routes/api/access/register/+server.ts:1-127 (canonical verify-signature-and-mint-state route)
    - src/lib/server/walletSession.ts (just created in Task 1)
    - src/lib/server/signatureChallenge.ts (just extended in Task 1)
    - src/lib/server/accessCodes.ts (post Plan 03-07 — verifyWalletSignature with REL-02 fallback chain)
    - .planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md §"src/routes/api/auth/session/* + logout/+server.ts" lines 781-916
    - .planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md §"Pattern 1" lines 343-374 (session POST shape)
    - .planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md §"Pitfall 8: SvelteKit 2 cookie path required" lines 752-770
    - .planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md §"Pitfall 10: cookies.delete also requires path" lines 794-797
  </read_first>
  <files>src/routes/api/auth/session/challenge/+server.ts, src/routes/api/auth/session/+server.ts, src/routes/api/auth/logout/+server.ts</files>
  <action>
**File 1 — `src/routes/api/auth/session/challenge/+server.ts` (NEW):**

Mirror `src/routes/api/access/challenge/+server.ts:1-43` shape verbatim. Per 03-PATTERNS.md lines 786-815:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import {
    issueSessionLoginChallenge,
    ChallengeStorageUnavailableError
} from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'session-challenge');
    if (rateLimitResponse) return rateLimitResponse;
    try {
        const { address } = await request.json();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return json({ error: 'Invalid wallet address' }, { status: 400 });
        }
        const challenge = await issueSessionLoginChallenge(address);
        return json({
            success: true,
            nonce: challenge.nonce,
            message: challenge.message,
            expiresAt: challenge.expiresAt
        });
    } catch (error) {
        if (error instanceof ChallengeStorageUnavailableError) {
            return json({ error: error.message }, { status: 503 });
        }
        return json({ error: 'Invalid request body' }, { status: 400 });
    }
};
```

**File 2 — `src/routes/api/auth/session/+server.ts` (NEW):**

Per 03-PATTERNS.md lines 845-893 + 03-RESEARCH.md §"Pattern 1" lines 343-374:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { verifyWalletSignature } from '$lib/server/accessCodes';
import { verifySessionLoginChallenge } from '$lib/server/signatureChallenge';
import { createSession } from '$lib/server/walletSession';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'session-login');
    if (rateLimitResponse) return rateLimitResponse;
    try {
        const { address, nonce, signature } = await request.json();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return json({ error: 'Invalid wallet address' }, { status: 400 });
        }
        if (!nonce || typeof nonce !== 'string') {
            return json({ error: 'Challenge nonce required' }, { status: 400 });
        }
        if (!signature || typeof signature !== 'string') {
            return json({ error: 'Signature required' }, { status: 400 });
        }
        const challenge = await verifySessionLoginChallenge(address, nonce);
        if (!challenge.valid || !challenge.message) {
            return json(
                { success: false, error: challenge.error || 'Invalid challenge' },
                { status: 400 }
            );
        }
        const valid = await verifyWalletSignature(address, challenge.message, signature as `0x${string}`);
        if (!valid) {
            return json({ success: false, error: 'Signature verification failed' }, { status: 401 });
        }
        const { sessionId, expiresAt } = await createSession(address);
        cookies.set('session', sessionId, {
            httpOnly: true,
            secure: !dev,
            sameSite: 'strict',
            path: '/',                       // RESEARCH Pitfall 8 — REQUIRED in SvelteKit 2
            maxAge: 30 * 24 * 60 * 60        // seconds (NOT ms — RESEARCH Pitfall 8)
        });
        return json({ success: true, walletAddress: address.toLowerCase(), expiresAt });
    } catch (error) {
        return json({ error: 'Invalid request body' }, { status: 400 });
    }
};
```

**File 3 — `src/routes/api/auth/logout/+server.ts` (NEW):**

Per 03-PATTERNS.md lines 895-916 + RESEARCH §"Pattern 1" line 215 + Pitfall 10:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/walletSession';

export const POST: RequestHandler = async ({ cookies }) => {
    const sessionId = cookies.get('session');
    if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
        await deleteSession(sessionId);
    }
    cookies.delete('session', { path: '/' });   // RESEARCH Pitfall 10 — path REQUIRED
    return new Response(null, { status: 204 });
};
```

**Public-path classification reminder:** RESEARCH §"Pattern 2" line 436 — `/api/auth/session/*` and `/api/auth/logout` will be encountered by hooks.server.ts before any wallet-cookie check. They should remain in `isPublicPath()` (the auth-routing classification) — the endpoints validate session/signature themselves. Confirm during execution by reading hooks.server.ts:152-220 area. If `isPublicPath()` is gate-keyed by an explicit path-prefix list, ADD `/api/auth/session` and `/api/auth/logout` to that list.

Run `npm test 2>&1 | tail -10` — full suite still green; new endpoints have no tests yet (integration tests deferred to Phase 4 / TEST-01 per CONTEXT).
  </action>
  <verify>
    <automated>test -f src/routes/api/auth/session/challenge/+server.ts &amp;&amp; test -f src/routes/api/auth/session/+server.ts &amp;&amp; test -f src/routes/api/auth/logout/+server.ts &amp;&amp; grep -c "createSession" src/routes/api/auth/session/+server.ts | xargs test 1 -le &amp;&amp; grep -c "deleteSession" src/routes/api/auth/logout/+server.ts | xargs test 1 -le &amp;&amp; grep -c "issueSessionLoginChallenge" src/routes/api/auth/session/challenge/+server.ts | xargs test 1 -le &amp;&amp; grep -c "verifyWalletSignature" src/routes/api/auth/session/+server.ts | xargs test 1 -le &amp;&amp; grep -c "path: '/'" src/routes/api/auth/session/+server.ts src/routes/api/auth/logout/+server.ts | wc -l | xargs -I {} test {} -ge 2 &amp;&amp; npm run check 2>&amp;1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - All 3 NEW route files exist
    - `grep -c "issueSessionLoginChallenge" src/routes/api/auth/session/challenge/+server.ts` returns 1
    - `grep -c "verifyWalletSignature" src/routes/api/auth/session/+server.ts` returns 1 (REL-02 fallback chain consumer)
    - `grep -c "createSession" src/routes/api/auth/session/+server.ts` returns 1
    - `grep -c "deleteSession" src/routes/api/auth/logout/+server.ts` returns 1
    - `grep -c "path: '/'" src/routes/api/auth/session/+server.ts` returns 1 (Pitfall 8)
    - `grep -c "path: '/'" src/routes/api/auth/logout/+server.ts` returns 1 (Pitfall 10)
    - `grep -c "httpOnly: true" src/routes/api/auth/session/+server.ts` returns 1
    - `grep -c "sameSite: 'strict'" src/routes/api/auth/session/+server.ts` returns 1
    - svelte-check baseline ≤ 3 errors preserved
    - Full test suite still passes
  </acceptance_criteria>
  <done>
    - 3 NEW route handlers in /api/auth/session/{challenge,index} + /api/auth/logout
    - Session POST verifies signature via REL-02 fallback chain and mints HttpOnly+Secure+SameSite=Strict cookie
    - Logout deletes KV record + clears cookie with path: '/'
    - isPublicPath() includes /api/auth/session/* and /api/auth/logout (verified during execution)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: SEC-04 csrf.ts session-bound HMAC + GET /api/auth/csrf swap + tests</name>
  <read_first>
    - src/lib/server/csrf.ts (post Plan 03-02 — module-load throw + existing generateCsrfToken / validateCsrfToken bodies; this plan REPLACES these)
    - src/lib/server/csrf.test.ts (post Plan 03-02 — extend with SEC-04 tests; do NOT delete SEC-02 tests; SEC-02 module-load tests must continue to pass per checker fix #3 carry-forward)
    - src/lib/server/auth.ts:24-30 (timingSafeEqual precedent)
    - src/routes/api/auth/csrf/+server.ts (existing — current 13-line stateless GET)
    - .planning/phases/phase-03-production-grade-hardening/03-PATTERNS.md §"src/routes/api/auth/csrf/+server.ts (route handler) — SEC-04" lines 958-989
    - .planning/phases/phase-03-production-grade-hardening/03-RESEARCH.md §"Pattern 2: Session-Bound CSRF Token" lines 392-436
  </read_first>
  <files>src/lib/server/csrf.ts, src/lib/server/csrf.test.ts, src/routes/api/auth/csrf/+server.ts</files>
  <behavior>
    - Test 1 (round-trip — checker fix #3 round-trip coverage moved here from 03-02): generateCsrfTokenForSession(sessionId) returns 32-hex-char token; validateCsrfTokenForSession(token, sessionId) returns true
    - Test 2 (cross-session rejection): generateCsrfTokenForSession('session-A') token; validateCsrfTokenForSession(tokenA, 'session-B') returns false (HMAC mismatch)
    - Test 3 (missing inputs): validateCsrfTokenForSession('', sessionId) returns false; validateCsrfTokenForSession(token, '') returns false; validateCsrfTokenForSession(token, undefined as never) returns false
    - Test 4 (length-mismatch): validateCsrfTokenForSession('short', sessionId) returns false (length pre-check before timingSafeEqual)
    - Test 5 (constant-time): validateCsrfTokenForSession uses crypto.timingSafeEqual — assert via spy that timingSafeEqual was called when token + sessionId both present and length matches
    - Test 6 (route handler): GET /api/auth/csrf without session cookie returns 401; with session cookie returns { token: ... } and the token validates against generateCsrfTokenForSession
    - Carry-forward (checker fix #3): existing SEC-02 module-load throw tests from Plan 03-02 must continue to pass after this rewrite. The post-rewrite csrf.ts still throws at module-load when CSRF_SECRET + SESSION_SECRET are both missing in production; the post-rewrite csrf.ts no longer exports generateCsrfToken / validateCsrfToken (those are deleted). Plan 03-02's csrf.test.ts SEC-02 tests assert only `expect(mod).toBeDefined()` (per the 03-02 revision for checker fix #3), so the SEC-04 rewrite cannot break them.
  </behavior>
  <action>
RED → GREEN cycle for SEC-04 csrf.ts rewrite + GET /api/auth/csrf swap.

**Step 1 (RED) — Extend `src/lib/server/csrf.test.ts`:**

Append `describe('SEC-04 session-bound CSRF', () => { ... })` block per `<behavior>`. Re-use the existing test file's setup (NODE_ENV swap, vi.resetModules between tests). Mock auth setup — `process.env.SESSION_SECRET = 'test-secret'` so module-load doesn't throw.

**Step 2 (GREEN) — Modify `src/lib/server/csrf.ts`:**

Per RESEARCH §"Pattern 2" lines 401-420 + 03-PATTERNS.md "Constant-Time HMAC Compare" section:

KEEP the SEC-02 module-load throw block (Plan 03-02) at top. KEEP `import crypto from 'crypto'`.

ADD new functions (per RESEARCH §"Pattern 2"):

```typescript
export function generateCsrfTokenForSession(sessionId: string): string {
    return crypto.createHmac('sha256', CSRF_SECRET).update(sessionId).digest('hex').slice(0, 32);
}

export function validateCsrfTokenForSession(token: string, sessionId: string): boolean {
    if (!token || !sessionId) return false;
    const expected = generateCsrfTokenForSession(sessionId);
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
}
```

**Decision: REMOVE old generateCsrfToken / validateCsrfToken (round-trip coverage moves here per checker fix #3):**

Per RESEARCH §"Anti-Patterns to Avoid" line 626: "The existing csrf.ts approach (timestamp-encoded token) is replaced by session-id-bound HMAC. The timestamp goes away — session expiry handles freshness." Therefore: REMOVE the old functions. Find all consumers via `grep -rn "generateCsrfToken\|validateCsrfToken" src/` (should be only `/api/auth/csrf/+server.ts` GET handler at this point — Plan 03-02 deliberately did NOT add a round-trip test that would break here per checker fix #3). The atomic flip migrates this consumer to the new function in this same plan.

**Step 3 (GREEN) — Modify `src/routes/api/auth/csrf/+server.ts`:**

Per RESEARCH §"Pattern 2" lines 423-433 + 03-PATTERNS.md lines 974-984:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCsrfTokenForSession } from '$lib/server/csrf';

export const GET: RequestHandler = async ({ cookies }) => {
    const sessionId = cookies.get('session');
    if (!sessionId) return json({ error: 'Session required' }, { status: 401 });
    return json({ token: generateCsrfTokenForSession(sessionId) });
};
```

The endpoint stays in `isPublicPath()` (no admin auth needed) but now requires the session cookie self-checked inside the handler — RESEARCH §"Pattern 2" closing note line 436.

**Step 4 — Audit other CSRF consumers:**

Run `grep -rn "validateCsrfToken\|generateCsrfToken" src/` — expected hits only in csrf.ts (definitions, now renamed) and the GET endpoint (just modified). If any OTHER consumer exists (e.g. POST handlers that validate CSRF tokens), they must be migrated to `validateCsrfTokenForSession` in this same plan. CONTEXT D-04 atomic flip — no in-flight broken state.

Commits:
- `test(03-08a): add SEC-04 session-bound CSRF tests for csrf.ts`
- `feat(03-08a): SEC-04 csrf.ts session-bound HMAC; GET /api/auth/csrf requires session cookie`
  </action>
  <verify>
    <automated>npm test -- --run csrf.test 2>&amp;1 | tail -10 &amp;&amp; grep -c "generateCsrfTokenForSession\|validateCsrfTokenForSession" src/lib/server/csrf.ts | xargs test 2 -le &amp;&amp; grep -c "timingSafeEqual" src/lib/server/csrf.ts | xargs test 1 -le &amp;&amp; grep -c "Session required" src/routes/api/auth/csrf/+server.ts | xargs test 1 -le &amp;&amp; npm run check 2>&amp;1 | tail -3</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "generateCsrfTokenForSession" src/lib/server/csrf.ts` returns ≥ 1
    - `grep -c "validateCsrfTokenForSession" src/lib/server/csrf.ts` returns ≥ 1
    - `grep -c "timingSafeEqual" src/lib/server/csrf.ts` returns ≥ 1
    - `grep -c "createHmac" src/lib/server/csrf.ts` returns ≥ 1
    - `grep -c "Session required" src/routes/api/auth/csrf/+server.ts` returns 1
    - `grep -c "generateCsrfTokenForSession" src/routes/api/auth/csrf/+server.ts` returns 1
    - `npm test -- --run csrf.test` passes (existing SEC-02 module-load + new SEC-04 blocks)
    - svelte-check baseline ≤ 3 errors preserved
    - **Phase-exit gate**: `! grep -E "'st0x-session-secret-2024'|'default-csrf-secret-change-in-production'" src/lib/server/auth.ts src/lib/server/csrf.ts` returns 0 (carry-forward from Plan 03-02)
  </acceptance_criteria>
  <done>
    - csrf.ts has session-bound HMAC token API (generateCsrfTokenForSession + validateCsrfTokenForSession)
    - Old stateless API removed; consumers migrated in same plan
    - GET /api/auth/csrf requires session cookie (401 otherwise)
    - SEC-04 tests pin round-trip + cross-session rejection + constant-time compare
    - SEC-02 module-load tests from Plan 03-02 continue to pass (per checker fix #3 — 03-02 tests assert only `expect(mod).toBeDefined()`)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Server-issued cookie ('session') | HttpOnly + Secure + SameSite=Strict; cannot be set or read by JS |
| Vercel KV (wallet_session:* namespace) | Stores verified wallet binding; admin can invalidate via console |
| viem fallback chain (REL-02) | Verifies signature via 6 RPCs with retry |
| HMAC(sessionId, CSRF_SECRET) | Forgeable only by anyone holding CSRF_SECRET (server-only) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-SEC-03-02 | Tampering | Session cookie value is server-side random (32-byte CSPRNG = 64 hex chars) — cannot be guessed/forged | mitigate | createSession uses crypto.randomBytes(32); KV lookup binds to verified wallet. Forging requires reading the session-id from another user's cookie (HttpOnly blocks JS read) AND matching SameSite=Strict (cross-origin requests blocked) AND Secure (HTTPS only). |
| T-03-SEC-03-03 | Repudiation | Lost session = lost evidence of who placed an action | accept | KV record retains issuedAt + lastSeenAt; admin can read for forensic correlation. Logout deletes the record (intended; user-initiated). |
| T-03-SEC-03-04 | Denial of Service | Vercel KV downtime → no auth surface | accept | KV is the same surface signatureChallenge.ts already depends on (Phase 1+ already accepted this single-point dependency). Phase 4 may add an in-memory L1 if measured. |
| T-03-SEC-03-05 | Elevation of Privilege | Stolen session cookie persists for up to 30 days | mitigate (partial) | 30-day cap (D-04a); KV-based admin invalidation; explicit logout endpoint deletes the record server-side (cookie clear + KV.del). |
| T-03-SEC-04-01 | Tampering / CSRF | Pre-Phase-3 stateless tokens with shared secret = anyone with read access to JS bundle could forge tokens | mitigate (BLOCKER — closes the audit finding) | Session-id-bound HMAC; tokens regenerated on session change; constant-time compare via timingSafeEqual |
| T-03-SEC-04-02 | Bypass | GET /api/auth/csrf without session cookie → 401 (no token issued) — non-authenticated callers can't get a forgeable token | mitigate | Endpoint returns 401 when session cookie missing. Public-path classification preserved (auth-routing); the handler self-checks. |
| T-03-SEC-04-03 | Replay | Stale CSRF token from old session is presented post-login | mitigate (UX-doc) | RESEARCH Pitfall 3: re-fetch token after login. New session-id ⇒ new HMAC ⇒ stale tokens fail validation cleanly. Documented in 03-RUNBOOK.md (Plan 03-11). |
| T-03-SEC-04-04 | Cross-session attack | A malicious tab in a shared browser uses session A to issue a CSRF token, then tries to validate against session B | mitigate | HMAC bound to session-id; cross-session tokens fail validation. Constant-time compare prevents timing leakage. |
| T-03-SEC-03-07 | Information Disclosure | Session record fields (issuedAt, lastSeenAt, walletAddress) accessible to anyone with KV read | accept | KV is admin-only; wallet address is already in many other server logs/records (auditLog, accessCodes); no new exposure. |
</threat_model>

<verification>
- `npm test -- --run walletSession.test signatureChallenge.test csrf.test` passes
- `npm run check` passes at Phase 2 baseline (≤ 3 errors)
- 3 NEW route handlers exist and pass acceptance criteria
- `grep -c "session_login" src/lib/server/signatureChallenge.ts` ≥ 1
- `grep -c "generateCsrfTokenForSession" src/lib/server/csrf.ts` ≥ 1
- Plan 03-08b will consume these surfaces (readSession in hooks.server.ts; deleteSession in /access; etc.)

**Phase 2 carry-forward gates (must remain green):**
- TRADE-01 IO-perspective lockdown — no changes (none of these files touch trade-execution)
- TRADE-02 cycle severance — no changes
- failWith() count ≥ 12 — no changes
- EMERGENCY_RATIO_MULTIPLIER = 0 — no changes
- staleTime: Infinity — no changes
</verification>

<success_criteria>
- 'session' cookie can be minted at /api/auth/session POST after wallet signature verification (REL-02 fallback chain)
- 30-day sliding session via maybeRefreshSession (24h refresh threshold)
- POST /api/auth/logout deletes KV record + clears cookie
- CSRF tokens HMAC-bound to session-id (timingSafeEqual compare)
- GET /api/auth/csrf gates on session cookie
- Plan 03-08b can consume readSession/maybeRefreshSession/deleteSession to migrate the 6 wallet-address consumers atomically
- Phase 2 cross-cutting gates green
- D-04b hard guarantee: validation is HMAC-only, never re-prompts wallet signature (per-request-signature rejection happens at Plan 03-08b hooks.server.ts wiring; this plan provides the surfaces for that wiring)
</success_criteria>

<output>
After completion, create `.planning/phases/phase-03-production-grade-hardening/03-08a-SUMMARY.md` documenting:
- The 3 task outcomes (walletSession + signatureChallenge purpose; auth route handlers; csrf SEC-04 rewrite)
- Any deviations from the plan-text vs plan-intent (Rule 1 / 2 / 3 deviations)
- Cross-cutting gate snapshot
- Hand-off to Plan 03-08b: the surfaces 03-08b consumes (readSession, maybeRefreshSession, deleteSession, validateCsrfTokenForSession)
</output>
