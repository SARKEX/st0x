# Phase 3: Production-Grade Hardening - Pattern Map

**Mapped:** 2026-04-30
**Files analyzed:** 23 (modified + new)
**Analogs found:** 23 / 23 (every file has a strong existing analog in src/)

Every pattern below is grounded in a concrete file:line reference to existing code. The planner should copy patterns by reference, not invent new shapes. Scope is server-side hardening + one client-bundled env var swap; no new external dependencies.

## File Classification

| New/Modified File | Wave | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `src/lib/config/networks.ts` | 1 | config | static-import | (in-place env-var read; no analog needed) | self |
| `src/lib/clients/raindex.ts` | 1 | client | static-import | (in-place env-var interpolation; no analog needed) | self |
| `src/lib/server/accessCodes.ts` (SEC-01 + REL-02 + SEC-05 + SEC-07) | 1, 2, 5 | server module | request-response | self (file-internal refactor) + `src/lib/server/snapshots/generator.ts:14` for `RPC_URLS` reuse | exact |
| `src/lib/server/auth.ts` (SEC-02) | 2 | server module | module-load guard | `src/routes/api/cron/snapshots/+server.ts:42-49` | exact |
| `src/lib/server/csrf.ts` (SEC-02 + SEC-04) | 2, 6 | server module | module-load guard + HMAC | `src/routes/api/cron/snapshots/+server.ts:42-49` (throw); existing `src/lib/server/csrf.ts:21-25` (HMAC); `src/lib/server/auth.ts:24-30` (timingSafeEqual) | exact |
| `src/lib/server/referrals.ts` (SEC-05) | 2 | server module | request-response | `src/lib/server/signatureChallenge.ts:58-60` (CSPRNG) | exact |
| `src/routes/api/snapshots/preview/+server.ts` (SEC-06) | 3 | route handler | request-response | `src/routes/api/access/check/+server.ts:25-36` | exact |
| `src/routes/api/snapshots/preview-stream/+server.ts` (SEC-06) | 3 | route handler | streaming (SSE) | `src/routes/api/access/check/+server.ts:25-36` (rate-limit wrap) + own existing SSE body | role-match |
| `src/routes/api/snapshots/generate/+server.ts` (SEC-06) | 3 | route handler | request-response | `src/routes/api/admin/snapshots/regenerate/+server.ts:13-15` | exact |
| `src/lib/server/rateLimit.ts` (SEC-06 tier add) | 3 | server module | configuration | `src/lib/server/rateLimit.ts:311-322` (existing `tieredLimits` map) | self-extension |
| `src/lib/server/snapshots/generator.ts` (REL-01) | 4 | server module | RPC fan-out | `src/lib/utils/retry.ts:5-39` (withRetry) + `src/lib/server/rpcMetrics.ts:32-43` + `src/lib/server/snapshots/generator.ts:31-91` (own existing `callRpc` shape) | self-extension |
| `src/lib/server/walletSession.ts` | 6 | server module (NEW) | KV record | `src/lib/server/signatureChallenge.ts:124-182` (storeChallenge / consumeChallenge) | exact |
| `src/routes/api/auth/session/+server.ts` | 6 | route handler (NEW) | request-response | `src/routes/api/access/register/+server.ts:16-127` | exact |
| `src/routes/api/auth/session/challenge/+server.ts` | 6 | route handler (NEW) | request-response | `src/routes/api/access/challenge/+server.ts:9-43` | exact |
| `src/routes/api/auth/logout/+server.ts` | 6 | route handler (NEW) | request-response | `src/routes/api/access/register/+server.ts` (cookie delete + KV del minimal POST) | role-match |
| `src/hooks.server.ts` (SEC-03 + SEC-04) | 6 | server module | per-request middleware | self (`getWalletFromRequest` at line 268-279) | self-extension |
| `src/routes/api/auth/csrf/+server.ts` (SEC-04) | 6 | route handler | request-response | `src/routes/api/access/check/+server.ts:10-15` (cookie read pattern) | role-match |
| `src/routes/+layout.svelte` (SEC-03 hint downgrade) | 6 | client component | side-effect | self (lines 63-80; just a comment downgrade) | self |
| `src/lib/services/orderDeployment.ts` (REL-03) | 7 | service | static-import | self (lines 54-91; URL string swap) | self-extension |
| `static/registry/` (REL-03) | 7 | static asset | file-system serve | `static/docs/`, `static/assets/` (existing static directories Vercel serves at `/`) | exact |
| `src/lib/server/walletSession.test.ts` (NEW) | 6 | test | unit | `src/lib/server/signatureChallenge.test.ts:1-90` | exact |
| `src/lib/server/auth.test.ts` (NEW) | 2 | test | unit | `src/lib/server/signatureChallenge.test.ts:11-34` (NODE_ENV swap pattern) | exact |
| `src/lib/server/csrf.test.ts` (NEW) | 2, 6 | test | unit | `src/lib/server/signatureChallenge.test.ts:11-34` | exact |
| `src/lib/server/referrals.test.ts` (NEW) | 2 | test | unit | `src/lib/server/accessCodes.test.ts:1-58` | exact |
| `src/lib/server/snapshots/generator.test.ts` (NEW) | 4 | test | unit | `src/lib/server/accessCodes.test.ts:1-58` (mocked viem pattern; here mock `fetch`) | role-match |

## Pattern Assignments

### Wave 1 — SEC-01 (env-var swap)

#### `src/lib/config/networks.ts` (config, static-import)

**Analog:** none — in-place `$env/dynamic/public` swap. Existing precedent for `PUBLIC_*` env reads is `src/routes/+layout.svelte:5` (`PUBLIC_WALLETCONNECT_ID`).

**Imports pattern** (existing — line 1 area, add new import):
```typescript
import { env as publicEnv } from '$env/dynamic/public';
```

**Core swap pattern** (REPLACE lines 48 and 51; the literal Alchemy URL `'https://base-mainnet.g.alchemy.com/v2/y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9'`):
```typescript
const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com'; // dev fallback
// ...
rpcUrl: PRIMARY_RPC,
fallbackRpcUrls: [
  'https://base-rpc.publicnode.com',
  PRIMARY_RPC,                            // duplicated as fallback — OK; simpler than de-dup
  'https://base.llamarpc.com',
  'https://base.meowrpc.com',
  'https://base-mainnet.public.blastapi.io',
  'https://gateway.tenderly.co/public/base'
],
```

**Source:** RESEARCH §"SEC-01: Client-side env-var read" (lines 848-868).

---

#### `src/lib/clients/raindex.ts` (client, static-import)

**Analog:** self — SETTINGS_YAML is hand-maintained at lines 22-44. Replace literal Alchemy URL on line 26 with template-literal interpolation.

**Imports pattern** (add):
```typescript
import { env as publicEnv } from '$env/dynamic/public';
```

**Core swap pattern** (REPLACE lines 22-44; current `SETTINGS_YAML` is a const string with literal URL on line 26):
```typescript
const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com';
const SETTINGS_YAML = `version: 5
networks:
  base:
    rpcs:
      - ${PRIMARY_RPC}
    chain-id: 8453
    network-id: 8453
    currency: ETH
subgraphs:
  base: https://api.goldsky.com/...
...`;
```

**Source:** RESEARCH §"SEC-01: Client-side env-var read" raindex.ts block (lines 870-888).

---

#### `src/lib/server/accessCodes.ts` (server module, request-response) — SEC-01 portion

**Analog:** the `RPC_URLS` const at `src/lib/server/snapshots/generator.ts:14` is the single source of truth — REL-02 reuses it.

**Imports pattern** (existing line 1-5, add):
```typescript
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
```

**Core swap pattern** (REPLACE existing `basePublicClient` at lines 9-12):
```typescript
const PRIMARY_RPC_URL = env.BASE_RPC_URL;
if (!dev && !PRIMARY_RPC_URL) {
  throw new Error('[accessCodes] BASE_RPC_URL required in production');
}
// REL-02 turns this into a fallback chain — see Wave 5 below
```

**Source:** existing `src/routes/api/cron/snapshots/+server.ts:42-49` (CRON_SECRET fail-closed precedent) + RESEARCH §"SEC-01 + REL-02: Fallback transport" (lines 802-844).

---

### Wave 2 — SEC-02, SEC-05, SEC-07 (independent quick wins)

#### `src/lib/server/auth.ts` (server module, module-load guard) — SEC-02

**Analog:** `src/routes/api/cron/snapshots/+server.ts:42-49` — module-local fail-closed pattern.

**Existing target** (REPLACE the existing line 9 fallback string `'st0x-session-secret-2024'`):
```typescript
// Current src/lib/server/auth.ts:6-12:
export function createSessionToken(timestamp: number): string {
    const user = env.BASIC_AUTH_USER || '';
    const pass = env.BASIC_AUTH_PASS || '';
    const secret = env.SESSION_SECRET || 'st0x-session-secret-2024';  // FALLBACK STRING — DELETE
    const data = `${timestamp}-${user}:${pass}-${secret}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}
```

**Pattern to copy from** (`src/routes/api/cron/snapshots/+server.ts:42-49`):
```typescript
const cronSecret = env.CRON_SECRET;
// Fail closed in production if CRON_SECRET is missing
if (!cronSecret && !dev) {
    console.error('[Cron] CRON_SECRET is not configured');
    return json({ error: 'Cron endpoint not configured' }, { status: 503 });
}
```

**Adapted to module-top throw** (NEW shape at top of `auth.ts`):
```typescript
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!dev && !env.SESSION_SECRET) {
  throw new Error('[auth] SESSION_SECRET required in production');
}
const SESSION_SECRET = env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');

// rest of the file: replace line 9 inside createSessionToken with:
//   const data = `${timestamp}-${user}:${pass}-${SESSION_SECRET}`;
```

**Why module-top, not function-body:** RESEARCH Pitfall 2 (lines 674-694). Module-top fires at lambda cold-start; function-body fires at first request. Cold-start crash is faster to bisect in Vercel Logs.

**Source:** existing `src/routes/api/cron/snapshots/+server.ts:42-49`.

---

#### `src/lib/server/csrf.ts` (server module, module-load guard) — SEC-02 portion

**Analog:** same as auth.ts — module-local throw at the top.

**Existing target** (REPLACE line 10 `'default-csrf-secret-change-in-production'`):
```typescript
// Current src/lib/server/csrf.ts:10:
const CSRF_SECRET = env.SESSION_SECRET || 'default-csrf-secret-change-in-production';
```

**Adapted shape** (top of file, before line 10):
```typescript
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!dev && !env.SESSION_SECRET && !env.CSRF_SECRET) {
  throw new Error('[csrf] CSRF_SECRET or SESSION_SECRET required in production');
}
const CSRF_SECRET = env.CSRF_SECRET || env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');
```

**Note on aliasing:** RESEARCH Assumption A4 — current code reads `env.SESSION_SECRET` as the source of CSRF secret. Preserve this aliasing (both env vars supported, prefer dedicated CSRF_SECRET if set).

**Source:** existing `src/routes/api/cron/snapshots/+server.ts:42-49` + existing `src/lib/server/csrf.ts:10`.

---

#### `src/lib/server/accessCodes.ts` (SEC-05 portion + SEC-07 portion)

**Analog (SEC-05):** `src/lib/server/signatureChallenge.ts:58-60`:
```typescript
function generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}
```

**SEC-05 swap target** (REPLACE `accessCodes.ts:46-52` `generateAccessCode`):
```typescript
// Current src/lib/server/accessCodes.ts:46-52:
export function generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomPart = (length: number) =>
        Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `ST0X-${randomPart(4)}-${randomPart(4)}`;
}
```

**Replace with rejection-sampled CSPRNG** (RESEARCH §"SEC-05: CSPRNG-backed access code" lines 915-937; alphabet 32 chars preserved verbatim):
```typescript
function pickFromAlphabet(alphabet: string): string {
    const n = alphabet.length;
    const limit = Math.floor(256 / n) * n;
    while (true) {
        const byte = crypto.randomBytes(1)[0];
        if (byte < limit) return alphabet[byte % n];
    }
}

export function generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 32 chars, preserved verbatim
    const part = (length: number) =>
        Array.from({ length }, () => pickFromAlphabet(chars)).join('');
    return `ST0X-${part(4)}-${part(4)}`;
}
```

**Note on rejection sampling:** RESEARCH Pitfall 9 — for the 32-char alphabet `limit = 256` (no rejections; clean modulo). For the 31-char referral alphabet `limit = 248` (~3% rejection rate; negligible cost).

**Analog (SEC-07):** existing target `src/lib/server/accessCodes.ts:122-149` `verifyCaptcha`. Replace `process.env.NODE_ENV === 'production'` (line 126) with `env.VERCEL_ENV !== 'development'`.

**SEC-07 swap target** (REPLACE lines 122-149; current shape):
```typescript
// Current src/lib/server/accessCodes.ts:124-133:
export async function verifyCaptcha(token: string): Promise<boolean> {
    const secret = env.HCAPTCHA_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {  // BYPASS BUG — Vercel preview is NOT 'production'
            console.error('HCAPTCHA_SECRET not configured in production');
            return false;
        }
        console.warn('HCAPTCHA_SECRET not configured, skipping captcha verification');
        return true;
    }
    // ...
}
```

**Replace with VERCEL_ENV-based fail-closed** (RESEARCH §"SEC-07: VERCEL_ENV-based fail-closed" lines 1000-1029):
```typescript
export async function verifyCaptcha(token: string): Promise<boolean> {
    const secret = env.HCAPTCHA_SECRET;
    if (!secret) {
        // Fail closed everywhere except local development (Vercel preview is "preview", not "development")
        if (env.VERCEL_ENV !== 'development') {
            console.error('[accessCodes] HCAPTCHA_SECRET not configured (VERCEL_ENV=' + env.VERCEL_ENV + ')');
            return false;
        }
        console.warn('[accessCodes] HCAPTCHA_SECRET not configured, skipping in development');
        return true;
    }
    // ...rest of body unchanged (lines 135-148)
}
```

**Source:** RESEARCH §"SEC-05: CSPRNG-backed access code" + §"SEC-07: VERCEL_ENV-based fail-closed".

---

#### `src/lib/server/referrals.ts` (server module, request-response) — SEC-05

**Analog:** existing `src/lib/server/signatureChallenge.ts:58-60` (CSPRNG nonce) — same shape used in `accessCodes.ts` SEC-05 swap.

**Existing target** (REPLACE lines 63-70 `generateReferralCode`):
```typescript
// Current src/lib/server/referrals.ts:63-70:
export function generateReferralCode(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';  // 31 chars
    const randomPart = Array.from(
        { length: 6 },
        () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return `st0x-ref-${randomPart}`;
}
```

**Adapted shape** (preserve alphabet + length verbatim; swap the picker):
```typescript
function pickFromAlphabet(alphabet: string): string {
    const n = alphabet.length;
    const limit = Math.floor(256 / n) * n;
    while (true) {
        const byte = crypto.randomBytes(1)[0];
        if (byte < limit) return alphabet[byte % n];
    }
}

export function generateReferralCode(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';  // 31 chars, preserved verbatim
    const part = Array.from({ length: 6 }, () => pickFromAlphabet(chars)).join('');
    return `st0x-ref-${part}`;
}
```

**Source:** RESEARCH §"SEC-05" referrals.ts block (lines 939-957).

---

### Wave 3 — SEC-06 (rate-limit + admin gate)

#### `src/lib/server/rateLimit.ts` (server module, configuration) — add tier

**Analog:** the existing `tieredLimits` map at lines 311-322 — extend in place.

**Existing pattern** (`src/lib/server/rateLimit.ts:311-322`):
```typescript
export const tieredLimits: Record<string, TieredRateLimitConfig> = {
    rewards: {
        anonymous: { windowMs: 60 * 1000, maxRequests: 10 },
        authenticated: { windowMs: 60 * 1000, maxRequests: 60 }
    },
    accessCheck: {
        anonymous: { windowMs: 60 * 1000, maxRequests: 20 },
        authenticated: { windowMs: 60 * 1000, maxRequests: 120 }
    }
};
```

**Add new entry** (RESEARCH Pitfall 4 + §"SEC-06: Tier definition" lines 962-971):
```typescript
export const tieredLimits: Record<string, TieredRateLimitConfig> = {
    rewards: { /* unchanged */ },
    accessCheck: { /* unchanged */ },
    snapshotsPreview: {
        anonymous: { windowMs: 60 * 1000, maxRequests: 1 },     // 1/min — preview takes 10-60s
        authenticated: { windowMs: 60 * 1000, maxRequests: 3 }  // 3/min for connected wallets
    }
};
```

**Source:** existing `src/lib/server/rateLimit.ts:311-322`.

---

#### `src/routes/api/snapshots/preview/+server.ts` (route handler, request-response) — SEC-06

**Analog:** `src/routes/api/access/check/+server.ts:10-36` — exact pattern for `applyTieredRateLimit` wrapping a GET handler.

**Imports pattern** (`src/routes/api/access/check/+server.ts:1-5`):
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyTieredRateLimit } from '$lib/server/rateLimit';
```

**Core wrap pattern** (`src/routes/api/access/check/+server.ts:10-36`):
```typescript
export const GET: RequestHandler = async ({ url, request, cookies }) => {
    // ... arg validation first (existing) ...

    // Get wallet address from cookie for tiered rate limiting
    const cookieWallet = cookies.get('wallet-address');  // Phase 3: post-SEC-03, read 'session' instead
    const isOwnAddress = cookieWallet?.toLowerCase() === address.toLowerCase();
    const walletForRateLimit = isOwnAddress ? address : null;

    const rateLimitResponse = await applyTieredRateLimit(
        request,
        'accessCheck',
        'access-check',
        walletForRateLimit
    );
    if (rateLimitResponse) return rateLimitResponse;

    // ... handler body unchanged ...
};
```

**Adapted target** (REPLACE the GET signature at `src/routes/api/snapshots/preview/+server.ts:13`; current shape `async ({ url })`; add `request` + `cookies`):
```typescript
export const GET: RequestHandler = async ({ url, request, cookies }) => {
    // SEC-06: tiered rate-limit; for the snapshot preview tier, anonymous gets 1/min,
    // authenticated wallets get 3/min. Use post-SEC-03 'session' cookie if Wave 6 has shipped;
    // fall back to 'wallet-address' until then. Wave 3 ships first → use 'wallet-address'.
    const cookieWallet = cookies.get('wallet-address');
    const wallet = cookieWallet && /^0x[a-fA-F0-9]{40}$/.test(cookieWallet)
        ? cookieWallet
        : null;
    const rateLimitResponse = await applyTieredRateLimit(
        request,
        'snapshotsPreview',
        'snapshots-preview',
        wallet
    );
    if (rateLimitResponse) return rateLimitResponse;

    // ... existing handler body lines 14-153 unchanged ...
};
```

**Source:** existing `src/routes/api/access/check/+server.ts:10-36`.

---

#### `src/routes/api/snapshots/preview-stream/+server.ts` (route handler, streaming) — SEC-06

**Analog:** same `applyTieredRateLimit` wrap as preview/+server.ts above; the SSE body is left unchanged. The wrap fires BEFORE the `new ReadableStream(...)` is constructed so a 429 response is plain JSON, not an SSE stream.

**Adapted pattern** (REPLACE the GET signature at `src/routes/api/snapshots/preview-stream/+server.ts:12`):
```typescript
export const GET: RequestHandler = async ({ url, request, cookies }) => {
    // SEC-06: rate-limit BEFORE constructing the SSE stream
    const cookieWallet = cookies.get('wallet-address');
    const wallet = cookieWallet && /^0x[a-fA-F0-9]{40}$/.test(cookieWallet)
        ? cookieWallet
        : null;
    const rateLimitResponse = await applyTieredRateLimit(
        request,
        'snapshotsPreview',
        'snapshots-preview-stream',
        wallet
    );
    if (rateLimitResponse) return rateLimitResponse;

    const blockParam = url.searchParams.get('block');
    // ... existing body lines 13-205 unchanged: stream construction + sendEvent loop ...
};
```

**Source:** `src/routes/api/access/check/+server.ts:10-36` (rate-limit early return) + own existing SSE body.

---

#### `src/routes/api/snapshots/generate/+server.ts` (route handler, request-response) — SEC-06

**Analog:** `src/routes/api/admin/snapshots/regenerate/+server.ts:13-15` — the canonical `requireAdmin` guard pattern, used 10+ places under `src/routes/api/admin/`.

**Imports pattern** (`src/routes/api/admin/snapshots/regenerate/+server.ts:11`):
```typescript
import { requireAdmin } from '$lib/server/adminAuth';
```

**Core guard pattern** (`src/routes/api/admin/snapshots/regenerate/+server.ts:13-15`):
```typescript
export const POST: RequestHandler = async ({ request, cookies }) => {
    const guardResponse = await requireAdmin(request, cookies, 'admin-snapshots-regenerate');
    if (guardResponse) return guardResponse;
    // ... handler body ...
};
```

**Adapted target** (REPLACE the POST signature at `src/routes/api/snapshots/generate/+server.ts:11`; current shape `async ({ request })`; add `cookies`):
```typescript
export const POST: RequestHandler = async ({ request, cookies }) => {
    const guardResponse = await requireAdmin(request, cookies, 'snapshots-generate');
    if (guardResponse) return guardResponse;

    // ... existing handler body lines 12-62 unchanged ...
};
```

**Cron does NOT call this endpoint:** RESEARCH Pitfall 5 verified by grep. Cron uses `CRON_SECRET` and calls `generateAllTokenSnapshots()` directly from the generator module. Adding `requireAdmin` is safe — no fallback `CRON_SECRET` escape needed (CONTEXT D-03 Option A).

**Source:** existing `src/routes/api/admin/snapshots/regenerate/+server.ts:13-15`.

---

### Wave 4 — REL-01 (RPC retry + kill silent latestBlock fallback)

#### `src/lib/server/snapshots/generator.ts` (server module, RPC fan-out)

**Analog:** the existing `callRpc` shape at `src/lib/server/snapshots/generator.ts:31-91` is preserved verbatim aside from per-RPC retry; the `withRetry` helper at `src/lib/utils/retry.ts:5-39` provides the retry pattern.

**Existing `withRetry` helper** (`src/lib/utils/retry.ts:5-39`):
```typescript
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000
): Promise<T> {
    if (maxRetries < 1) {
        throw new Error('maxRetries must be at least 1');
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const errorMessage = String(error);
            if (
                errorMessage.includes('header not found') ||
                errorMessage.includes('block not found') ||
                (error as { code?: number })?.code === -32000
            ) {
                if (attempt < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
                    continue;
                }
            }
            throw error;
        }
    }
    throw lastError;
}
```

**Existing `callRpc` shape to refactor** (`src/lib/server/snapshots/generator.ts:31-91`; current body wraps `fetch` + `recordRpcAttempt`/`reportChainExhausted`):
```typescript
async function callRpc(method: string, params: unknown[]): Promise<unknown | null> {  // RETURNS null TODAY — REL-01: throw
    const attempts: Array<{ rpc_url: string; status_or_error: string }> = [];
    for (const rpcUrl of RPC_URLS) {
        const start = Date.now();
        try {
            const response = await fetch(rpcUrl, { method: 'POST', headers: ..., body: ... });
            if (!response.ok) { /* record + push + continue */ }
            const data = await response.json();
            if (data.result) { /* recordRpcAttempt OK + return */ return data.result; }
            // Empty result = per-attempt failure (Phase 1 visibility-only)
            recordRpcAttempt({ ..., ok: false, status_or_error: 'empty result', ... });
            attempts.push({ rpc_url: rpcUrl, status_or_error: 'empty result' });
        } catch (err) { /* record + push + continue */ }
    }
    await reportChainExhausted({ fn: `callRpc:${method}`, attempts });
    return null;  // SILENT RETURN — REL-01: throw instead
}
```

**Adapted shape** (RESEARCH §"Pattern 4: Per-RPC Retry" lines 479-545):
```typescript
import { withRetry } from '$lib/utils/retry';

async function fetchOnce(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.result) throw new Error('empty result');  // REL-01: empty IS failure
    return data.result;
}

async function callRpc(method: string, params: unknown[]): Promise<unknown> {  // returns unknown, NOT unknown | null
    const attempts: Array<{ rpc_url: string; status_or_error: string }> = [];
    for (const rpcUrl of RPC_URLS) {
        const start = Date.now();
        try {
            const result = await withRetry(() => fetchOnce(rpcUrl, method, params), 2, 200);
            recordRpcAttempt({ rpc_url: rpcUrl, fn: `callRpc:${method}`, ok: true, status_or_error: 'ok', duration_ms: Date.now() - start });
            return result;
        } catch (err) {
            const status_or_error = err instanceof Error ? err.message : String(err);
            recordRpcAttempt({ rpc_url: rpcUrl, fn: `callRpc:${method}`, ok: false, status_or_error, duration_ms: Date.now() - start });
            attempts.push({ rpc_url: rpcUrl, status_or_error });
        }
    }
    await reportChainExhausted({ fn: `callRpc:${method}`, attempts });
    throw new Error(`callRpc(${method}) — all ${RPC_URLS.length} RPCs exhausted (with retry)`);
}
```

**Kill silent latestBlock fallback** (RESEARCH §"What replaces the silent latestBlock fallback" Option A — throw):

Existing target at `src/lib/server/snapshots/generator.ts:112-143` (`getBlockNumberForTimestamp`):
```typescript
// Current line 142:
return closestBlock;  // FALLS BACK TO latestBlock if smallestDiff stayed at Infinity
```

Replace with:
```typescript
if (smallestDiff === Infinity) {
    throw new Error(
        `getBlockNumberForTimestamp(${targetTimestamp}) — no block lookup succeeded after ${RPC_URLS.length} RPCs`
    );
}
return closestBlock;
```

The cron consumer at `src/routes/api/cron/snapshots/+server.ts:71-72` already wraps the call in try/catch (lines 152-160) and returns 500 with structured error — RESEARCH §"What replaces the silent latestBlock fallback" Option A.

**Time budget arithmetic:** RESEARCH §"Time budget" — worst-case retry chain ~4.8s per `callRpc`; cron does ~30 calls → ~144s worst-case vs `maxDuration: 800`. Comfortable margin.

**OBS-04 instrumentation preserved verbatim:** every retry attempt records via `recordRpcAttempt`; chain exhaustion fires `reportChainExhausted` (RESEARCH carry-forward gate from Phase 1).

**Source:** existing `src/lib/utils/retry.ts:5-39` + existing `src/lib/server/snapshots/generator.ts:31-143` + RESEARCH §"Pattern 4".

---

### Wave 5 — REL-02 (verifyWalletSignature on fallback chain)

#### `src/lib/server/accessCodes.ts` (server module, request-response) — REL-02 portion

**Analog:** viem's `fallback([http(...), ...])` Transport. RESEARCH §"Pattern 3: viem fallback Transport" (lines 438-477) + §"SEC-01 + REL-02: Fallback transport with env-var-driven URL list" code example (lines 802-844). The same `RPC_URLS` shape that `src/lib/server/snapshots/generator.ts:14` already builds is the single source of truth.

**Existing pattern** (`src/lib/server/snapshots/generator.ts:14`):
```typescript
const RPC_URLS = [networks[0].rpcUrl, ...networks[0].fallbackRpcUrls];
```

**Existing target** (REPLACE `src/lib/server/accessCodes.ts:1-12`; current single-RPC):
```typescript
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
const basePublicClient = createPublicClient({
    chain: base,
    transport: http('https://base-mainnet.g.alchemy.com/v2/y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9')
});
```

**Adapted shape** (combined SEC-01 + REL-02 from RESEARCH lines 805-829):
```typescript
import { createPublicClient, fallback, http } from 'viem';
import { base } from 'viem/chains';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { networks } from '$lib/config/networks';

const PRIMARY_RPC_URL = env.BASE_RPC_URL;
if (!dev && !PRIMARY_RPC_URL) {
    throw new Error('[accessCodes] BASE_RPC_URL required in production');
}
// Same fallback list as generator.ts — networks.ts is the single source of truth
const RPC_URLS = (PRIMARY_RPC_URL ? [PRIMARY_RPC_URL] : []).concat(networks[0].fallbackRpcUrls);

const basePublicClient = createPublicClient({
    chain: base,
    transport: fallback(
        RPC_URLS.map((url) => http(url)),
        { retryCount: 2, retryDelay: 200, rank: false }  // preserve order; primary tried first
    )
});
```

**`verifyWalletSignature` body** (lines 75-120 — keep OBS-04 instrumentation, update label):
```typescript
// REL-02 fence: do NOT wrap verifyMessage in withRetry — viem's fallback transport already
// retries per-transport (RESEARCH Pitfall 7). Single-call instrumentation only.
export async function verifyWalletSignature(
    address: string,
    message: string,
    signature: `0x${string}`
): Promise<boolean> {
    const start = Date.now();
    try {
        const valid = await basePublicClient.verifyMessage({
            address: address as `0x${string}`, message, signature
        });
        recordRpcAttempt({
            rpc_url: 'fallback-chain-base',  // was 'alchemy-base-mainnet' — Open Question 4 in RESEARCH
            fn: 'verifyWalletSignature',
            ok: true,
            status_or_error: valid ? 'verified' : 'mismatch',
            duration_ms: Date.now() - start
        });
        return valid;
    } catch (error) {
        const status_or_error = error instanceof Error ? error.message : 'Unknown verification error';
        recordRpcAttempt({
            rpc_url: 'fallback-chain-base',
            fn: 'verifyWalletSignature',
            ok: false,
            status_or_error,
            duration_ms: Date.now() - start
        });
        await reportChainExhausted({
            fn: 'verifyWalletSignature',
            attempts: [{ rpc_url: 'fallback-chain-base', status_or_error }]
        });
        console.error('[accessCodes] Signature verification failed:', { message: status_or_error });
        return false;
    }
}
```

**Note on `referrals.ts`:** the same `basePublicClient` pattern duplicated at `src/lib/server/referrals.ts:14-18`. REL-02 should **either** consolidate via shared module OR apply the same swap to both. Planner picks; consolidation reduces drift but expands wave scope.

**Source:** RESEARCH §"Pattern 3" + §"SEC-01 + REL-02" code example + existing `src/lib/server/accessCodes.ts:75-120` body.

---

### Wave 6 — SEC-03 + SEC-04 (session cookie + CSRF binding)

#### `src/lib/server/walletSession.ts` (NEW server module, KV record)

**Analog:** `src/lib/server/signatureChallenge.ts:124-182` — same `getKv()` lifecycle, same `crypto.randomBytes(...).toString('hex')` ID generation, same atomic GET+DEL precedent.

**Imports pattern** (matches `signatureChallenge.ts:1-2`):
```typescript
import crypto from 'crypto';
import { getKv } from './kv';
```

**KV record + key pattern** (`signatureChallenge.ts:80-86,124-139`):
```typescript
function keyForChallenge(purpose, address, nonce): string {
    return `signature_challenge:${purpose}:${address}:${nonce}`;
}

async function storeChallenge(record: SignatureChallengeRecord): Promise<void> {
    const key = keyForChallenge(record.purpose, record.address, record.nonce);
    const client = await getKv();
    if (client) {
        await client.set(key, JSON.stringify(record), { PX: CHALLENGE_TTL_MS });
        return;
    }
    // dev-mode in-memory fallback...
}
```

**Adapted shape** (RESEARCH §"Pattern 1: Server-Issued Session Cookie" lines 287-341):
```typescript
import crypto from 'crypto';
import { getKv } from './kv';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;       // 30 days (CONTEXT D-04a)
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;      // refresh once per 24h (RESEARCH A2)

interface WalletSessionRecord {
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
    if (now - record.lastSeenAt < REFRESH_THRESHOLD_MS) return;  // throttle to 1 KV write per 24h
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

**Source:** existing `src/lib/server/signatureChallenge.ts:124-182` + RESEARCH §"Pattern 1".

---

#### `src/routes/api/auth/session/challenge/+server.ts` (NEW route handler) — SEC-03

**Analog:** `src/routes/api/access/challenge/+server.ts:1-43`. Same shape: rate-limit → input validation → call `issue<Purpose>Challenge` → return `{ nonce, message, expiresAt }`. SEC-03 adds a new purpose `'session_login'` to `signatureChallenge.ts` (extend the union at line 14-17 + add `issueSessionLoginChallenge` + `verifySessionLoginChallenge` in the same shape as the existing 3 purposes).

**Pattern to copy** (`src/routes/api/access/challenge/+server.ts:1-43`):
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import {
    issueAccessRegistrationChallenge,
    ChallengeStorageUnavailableError
} from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'access-challenge');
    if (rateLimitResponse) return rateLimitResponse;
    try {
        const { address, code } = await request.json();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return json({ error: 'Invalid wallet address' }, { status: 400 });
        }
        // ... validation ...
        const challenge = await issueAccessRegistrationChallenge(address, code);
        return json({ success: true, nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt });
    } catch (error) {
        if (error instanceof ChallengeStorageUnavailableError) {
            return json({ error: error.message }, { status: 503 });
        }
        return json({ error: 'Invalid request body' }, { status: 400 });
    }
};
```

**Source:** existing `src/routes/api/access/challenge/+server.ts:1-43`.

---

#### `src/routes/api/auth/session/+server.ts` (NEW route handler) — SEC-03

**Analog:** `src/routes/api/access/register/+server.ts:1-127`. Same shape: rate-limit → input validation → consume challenge → verify signature via `verifyWalletSignature` (post-REL-02 fallback chain) → mint session.

**Pattern to copy — relevant slices of `src/routes/api/access/register/+server.ts:16-67`:**
```typescript
export const POST: RequestHandler = async ({ request }) => {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'register');
    if (rateLimitResponse) return rateLimitResponse;
    const audit = createAuditLogger(request);
    try {
        const { address, code, signature, challengeNonce, referralCode } = await request.json();
        // ... validation (4 if-statements, lines 28-46) ...
        const challenge = await verifyAccessRegistrationChallenge(address, challengeNonce, code);
        if (!challenge.valid || !challenge.message) {
            return json({ success: false, error: challenge.error || 'Invalid registration challenge' }, { status: 400 });
        }
        const result = await processRegistration(address, code, signature as `0x${string}`, challenge.message);
        // ... result handling ...
    } catch (error) { /* ... */ }
};
```

**Adapted shape** (RESEARCH §"Pattern 1" lines 343-374):
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { verifyWalletSignature } from '$lib/server/accessCodes';  // REL-02 fallback-chain-backed
import { verifySessionLoginChallenge } from '$lib/server/signatureChallenge';  // NEW purpose
import { createSession } from '$lib/server/walletSession';

export const POST: RequestHandler = async ({ request, cookies }) => {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'session-login');
    if (rateLimitResponse) return rateLimitResponse;
    try {
        const { address, nonce, signature } = await request.json();
        // Input validation (mirror access/register lines 28-46 shape)
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return json({ error: 'Invalid wallet address' }, { status: 400 });
        }
        if (!nonce || typeof nonce !== 'string') {
            return json({ error: 'Challenge nonce required' }, { status: 400 });
        }
        if (!signature || typeof signature !== 'string') {
            return json({ error: 'Signature required' }, { status: 400 });
        }
        // Consume challenge (atomic GET+DEL via signatureChallenge.ts)
        const challenge = await verifySessionLoginChallenge(address, nonce);
        if (!challenge.valid || !challenge.message) {
            return json({ success: false, error: challenge.error || 'Invalid challenge' }, { status: 400 });
        }
        // Verify signature via REL-02 fallback chain
        const valid = await verifyWalletSignature(address, challenge.message, signature as `0x${string}`);
        if (!valid) return json({ success: false, error: 'Signature verification failed' }, { status: 401 });
        // Mint session — KV record + cookie
        const { sessionId, expiresAt } = await createSession(address);
        cookies.set('session', sessionId, {
            httpOnly: true,
            secure: !dev,
            sameSite: 'strict',
            path: '/',                        // REQUIRED in SvelteKit 2 (RESEARCH Pitfall 8)
            maxAge: 30 * 24 * 60 * 60         // seconds, NOT milliseconds
        });
        return json({ success: true, walletAddress: address.toLowerCase(), expiresAt });
    } catch (error) {
        return json({ error: 'Invalid request body' }, { status: 400 });
    }
};
```

**Source:** existing `src/routes/api/access/register/+server.ts:1-127` + RESEARCH §"Pattern 1".

---

#### `src/routes/api/auth/logout/+server.ts` (NEW route handler) — SEC-03

**Analog:** minimal POST handler — read session cookie → delete KV record → clear cookie → 204. No exact analog endpoint exists; the closest body shape is the rate-limit early-return + cookie ops in `src/routes/api/access/check/+server.ts` and `src/routes/access/+page.server.ts:8` (`cookies.delete('wallet-address')`).

**Adapted shape:**
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/walletSession';

export const POST: RequestHandler = async ({ cookies }) => {
    const sessionId = cookies.get('session');
    if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
        await deleteSession(sessionId);  // KV del; safe to call with unknown id
    }
    cookies.delete('session', { path: '/' });   // RESEARCH Pitfall 10 — path REQUIRED
    return new Response(null, { status: 204 });
};
```

**Source:** RESEARCH §"Pattern 1" logout section (line 215) + Pitfall 10.

---

#### `src/hooks.server.ts` (server module, per-request middleware) — SEC-03 + SEC-04

**Analog:** self — `getWalletFromRequest` at lines 268-279 currently reads `cookies.get('wallet-address')`. Replace with session cookie read + KV lookup.

**Existing shape** (`src/hooks.server.ts:267-279`):
```typescript
function getWalletFromRequest(cookies: { get: (name: string) => string | undefined }): string | null {
    const walletAddress = cookies.get('wallet-address');
    if (walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        return walletAddress.toLowerCase();
    }
    return null;
}
```

**Adapted shape** (RESEARCH §"Pattern 1: Server-Issued Session Cookie" hooks.server.ts block lines 378-388):
```typescript
import { readSession, maybeRefreshSession } from '$lib/server/walletSession';

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

**Caller change:** `getWalletFromRequest` becomes `async`. Update every call site in `hooks.server.ts` to `await`. Existing call sites must be located via `grep -n "getWalletFromRequest" src/hooks.server.ts`.

**Source:** existing `src/hooks.server.ts:267-279` + RESEARCH §"Pattern 1".

---

#### `src/routes/api/auth/csrf/+server.ts` (route handler) — SEC-04

**Analog:** existing `src/routes/api/auth/csrf/+server.ts:1-13` (current stateless issuance).

**Existing shape** (full file):
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCsrfToken } from '$lib/server/csrf';

export const GET: RequestHandler = async () => {
    const token = generateCsrfToken();
    return json({ token });
};
```

**Adapted shape** (RESEARCH §"Pattern 2: Session-Bound CSRF" lines 423-433):
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

The existing `csrf.ts:17-28` `generateCsrfToken()` and `:34-69` `validateCsrfToken()` are replaced with the session-bound HMAC versions (RESEARCH §"Pattern 2" lines 401-420; reuses `crypto.timingSafeEqual` from existing `auth.ts:30`).

**Source:** existing `src/routes/api/auth/csrf/+server.ts:1-13` + existing `src/lib/server/csrf.ts:17-69` + RESEARCH §"Pattern 2".

---

#### `src/routes/+layout.svelte` (client component, side-effect) — SEC-03 hint downgrade

**Analog:** self — lines 63-80 (existing `setWalletCookie` function). The client-set `wallet-address` cookie remains BUT is now non-authoritative. The comment must be updated to reflect this; the cookie value is used only for the rate-limit tier optimization at `/api/access/check` (and equivalent surfaces).

**Adapted comment** (REPLACE the existing comment at lines 63-64):
```svelte
<script lang="ts">
    // 'wallet-address' is a NON-AUTHORITATIVE personalization hint for tiered rate-limit
    // resolution only. Authentication is established by the server-issued 'session' cookie
    // (see /api/auth/session). Do NOT use this cookie to grant any permission server-side.
    function setWalletCookie(address: string | null) {
        // ... existing body lines 65-80 unchanged ...
    }
</script>
```

**Source:** existing `src/routes/+layout.svelte:63-80` + CONTEXT D-04 + RESEARCH §"Pattern 6".

---

### Wave 7 — REL-03 (vendor Rain registry)

#### `src/lib/services/orderDeployment.ts` (service, static-import)

**Analog:** self — lines 54-91. The `RAIN_STRATEGIES_COMMIT` constant at line 55 + `REGISTRY_URL` template at line 58 are deleted; `REGISTRY_URL` becomes a static path.

**Existing shape** (`src/lib/services/orderDeployment.ts:54-58`):
```typescript
/** Pinned commit for rain.strategies registry */
const RAIN_STRATEGIES_COMMIT = '9dd64902161158395d588335f0a02e3a6d52f772';

/** Registry URL for rain.strategies */
const REGISTRY_URL = `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/registry`;
```

**Adapted shape** (RESEARCH §"REL-03: Vendored registry URL" lines 1035-1054):
```typescript
import { env as publicEnv } from '$env/dynamic/public';

const REGISTRY_URL = publicEnv.PUBLIC_REGISTRY_URL || '/registry';
// RAIN_STRATEGIES_COMMIT constant DELETED — registry is vendored under static/registry/
// and bumped via the procedure in 03-RUNBOOK.md
```

The remaining body (`getRegistry`, lines 75-92) is unchanged — `DotrainRegistry.new(REGISTRY_URL)` is transparent to whether the URL is same-origin or remote.

**Pre-flight grep** (RESEARCH Pitfall 6): `grep -rn "RAIN_STRATEGIES_COMMIT" src/` must return only `src/lib/services/orderDeployment.ts:55` before the swap.

**Source:** existing `src/lib/services/orderDeployment.ts:54-91` + RESEARCH §"REL-03".

---

#### `static/registry/` (NEW static asset directory)

**Analog:** existing `static/docs/`, `static/assets/`, `static/images/` — Vercel + SvelteKit serve `static/` files at `/` automatically (no SvelteKit route definition needed). Listed via `ls /Users/alastairong/st0x/st0x/static/`.

**Vendor procedure** (RESEARCH §"How to vendor" lines 564-581):
```bash
git clone https://github.com/rainlanguage/rain.strategies.git ../rain.strategies
cd ../rain.strategies && git checkout 9dd64902161158395d588335f0a02e3a6d52f772
cd ../st0x
rsync -av --delete ../rain.strategies/registry/ static/registry/
git add static/registry
git commit -m "chore: vendor rain.strategies registry @ 9dd64902"
```

**Refresh procedure** (documented in 03-RUNBOOK.md per CONTEXT discretion):
```bash
cd ../rain.strategies && git fetch && git checkout <new-commit-sha>
cd ../st0x
rsync -av --delete ../rain.strategies/registry/ static/registry/
git add static/registry
git commit -m "chore: bump rain.strategies registry to <new-sha>"
```

**Bundle impact:** zero — `static/` is served as static assets; not bundled. PERF-01 invariant preserved (RESEARCH lines 583-588).

**Source:** existing `static/` layout + RESEARCH §"Pattern 5: Vendored Static Registry".

---

### Test Files (NEW or extended — RESEARCH §"Wave 0 Gaps")

#### `src/lib/server/walletSession.test.ts` (NEW)

**Analog:** `src/lib/server/signatureChallenge.test.ts:1-90` — same `vi.hoisted` + `vi.mock('./kv')` pattern; tests createSession / readSession / maybeRefreshSession round-trip; tests dev fallback throws on missing KV.

**Pattern to copy** (`src/lib/server/signatureChallenge.test.ts:1-58`):
```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetKv } = vi.hoisted(() => ({ mockGetKv: vi.fn() }));
vi.mock('./kv', () => ({ getKv: mockGetKv }));

describe('walletSession', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.NODE_ENV = 'test';
        mockGetKv.mockResolvedValue(null);
    });
    afterAll(() => { process.env.NODE_ENV = originalNodeEnv; });

    it('creates a session, reads it back, and rotates lastSeenAt on refresh threshold', async () => {
        const setMock = vi.fn(); const getMock = vi.fn(); const delMock = vi.fn();
        mockGetKv.mockResolvedValue({ set: setMock, get: getMock, del: delMock });
        const { createSession, readSession } = await import('./walletSession');
        // ... test body ...
    });
});
```

**Source:** existing `src/lib/server/signatureChallenge.test.ts:1-58`.

---

#### `src/lib/server/auth.test.ts` (NEW) and `src/lib/server/csrf.test.ts` (NEW)

**Analog:** `src/lib/server/signatureChallenge.test.ts:11-34` — the `process.env.NODE_ENV = 'production'` swap pattern for module-load throw tests.

**Pattern** (`src/lib/server/signatureChallenge.test.ts:25-34`):
```typescript
it('fails closed in production when SESSION_SECRET is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    await expect(import('./auth')).rejects.toThrow(/SESSION_SECRET/);
});
```

**Source:** existing `src/lib/server/signatureChallenge.test.ts:25-34`.

---

#### `src/lib/server/referrals.test.ts` (NEW)

**Analog:** `src/lib/server/accessCodes.test.ts:1-58` — same `vi.mock('./kv')` + `vi.mock('viem')` shape. SEC-05 statistical test on 10000 samples.

**Source:** existing `src/lib/server/accessCodes.test.ts:1-58`.

---

#### `src/lib/server/snapshots/generator.test.ts` (NEW)

**Analog:** `src/lib/server/accessCodes.test.ts:1-58` (mocked viem) — adapted to mock `global.fetch` for RPC retry. The `withRetry` helper at `src/lib/utils/retry.ts:5-39` is the pattern under test.

**Source:** existing `src/lib/server/accessCodes.test.ts:1-58` + existing `src/lib/utils/retry.ts:5-39`.

---

## Shared Patterns

### Module-Load Fail-Closed (SEC-01, SEC-02)

**Source:** `src/routes/api/cron/snapshots/+server.ts:42-49` (`CRON_SECRET` precedent).

**Apply to:** `src/lib/server/auth.ts` (top-level), `src/lib/server/csrf.ts` (top-level), `src/lib/server/accessCodes.ts` (top-level for `BASE_RPC_URL`).

```typescript
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!dev && !env.X_REQUIRED_SECRET) {
    throw new Error('[module] X_REQUIRED_SECRET required in production');
}
const X_VALUE = env.X_REQUIRED_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');
```

**Why module-top:** RESEARCH Pitfall 2. Fires at lambda cold start; surfaces immediately in Vercel Logs.

---

### CSPRNG with Rejection Sampling (SEC-05)

**Source:** `src/lib/server/signatureChallenge.ts:58-60` (CSPRNG precedent) + RESEARCH Pitfall 9 (rejection sampling).

**Apply to:** `src/lib/server/accessCodes.ts:46-52`, `src/lib/server/referrals.ts:63-70`.

```typescript
import crypto from 'crypto';

function pickFromAlphabet(alphabet: string): string {
    const n = alphabet.length;
    const limit = Math.floor(256 / n) * n;  // 32-char: 256 (no rejections); 31-char: 248 (~3% rate)
    while (true) {
        const byte = crypto.randomBytes(1)[0];
        if (byte < limit) return alphabet[byte % n];
    }
}
```

---

### Constant-Time HMAC Compare (SEC-04, existing)

**Source:** `src/lib/server/auth.ts:24-30` + `src/lib/server/csrf.ts:60-68`.

**Apply to:** new SEC-04 `validateCsrfTokenForSession`:

```typescript
if (token.length !== expected.length) return false;
return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
```

---

### `applyTieredRateLimit` Wrap (SEC-06)

**Source:** `src/routes/api/access/check/+server.ts:25-36`.

**Apply to:** `src/routes/api/snapshots/preview/+server.ts`, `src/routes/api/snapshots/preview-stream/+server.ts`. Pass `'snapshotsPreview'` (NEW tier name; must be added to `src/lib/server/rateLimit.ts:311-322`).

---

### `requireAdmin` Guard (SEC-06)

**Source:** `src/routes/api/admin/snapshots/regenerate/+server.ts:13-15` (10+ identical usages under `src/routes/api/admin/`).

**Apply to:** `src/routes/api/snapshots/generate/+server.ts` POST handler. Pass `'snapshots-generate'` as the rate-limit prefix.

```typescript
export const POST: RequestHandler = async ({ request, cookies }) => {
    const guardResponse = await requireAdmin(request, cookies, 'snapshots-generate');
    if (guardResponse) return guardResponse;
    // ... handler body ...
};
```

---

### KV Record Lifecycle (SEC-03)

**Source:** `src/lib/server/signatureChallenge.ts:124-182` (`storeChallenge` / `consumeChallenge`).

**Apply to:** new `src/lib/server/walletSession.ts` (createSession / readSession / maybeRefreshSession / deleteSession).

The KV layer is `getKv()` from `src/lib/server/kv.ts:8-38` (lazy connect, dev no-op, RedisClientType). All Phase 3 KV access goes through this — RESEARCH §"Don't Hand-Roll" line 639.

---

### OBS-04 `recordRpcAttempt` + `reportChainExhausted` (REL-01, REL-02)

**Source:** `src/lib/server/rpcMetrics.ts:32-43` + existing usage at `src/lib/server/snapshots/generator.ts:43-89` and `src/lib/server/accessCodes.ts:91-114`.

**Apply to:** REL-01 retry attempts (per RPC URL inside the retry loop), REL-02 `verifyWalletSignature` (single per-call record with `rpc_url: 'fallback-chain-base'`).

**Carry-forward gate:** every retry attempt must record; chain exhaustion must fire `reportChainExhausted` so the existing `notifyChainExhausted` Telegram alert path (Plan 01-06 / D-17) continues to fire unchanged.

---

### Vitest Mock Boilerplate (test files)

**Source:** `src/lib/server/signatureChallenge.test.ts:1-58` and `src/lib/server/accessCodes.test.ts:1-58`.

**Apply to:** all NEW test files in Wave 0 list. Use `vi.hoisted` + `vi.mock('./kv')` shape; reset modules between tests; swap `process.env.NODE_ENV` for fail-closed tests.

---

## No Analog Found

None. Every Phase 3 surface has at least a role-match analog already in the codebase. The phase is plumbing — connecting existing pieces (KV + viem fallback + signatureChallenge + withRetry + applyTieredRateLimit + VERCEL_ENV) — not invention (RESEARCH §"Don't Hand-Roll" line 646).

## Metadata

**Analog search scope:** `src/lib/server/`, `src/routes/api/`, `src/lib/utils/`, `src/lib/services/`, `src/lib/clients/`, `src/lib/config/`, `src/hooks.server.ts`, `src/routes/+layout.svelte`, `static/`.

**Files scanned (Read):** `src/lib/server/auth.ts`, `csrf.ts`, `accessCodes.ts`, `referrals.ts`, `signatureChallenge.ts`, `kv.ts`, `rateLimit.ts`, `adminAuth.ts`, `rpcMetrics.ts`, `snapshots/generator.ts`, `accessCodes.test.ts`, `signatureChallenge.test.ts`; `src/lib/utils/retry.ts`; `src/lib/services/orderDeployment.ts`; `src/lib/clients/raindex.ts`; `src/lib/config/networks.ts`; `src/routes/api/access/check/+server.ts`, `register/+server.ts`, `challenge/+server.ts`; `src/routes/api/auth/csrf/+server.ts`; `src/routes/api/cron/snapshots/+server.ts`; `src/routes/api/snapshots/preview/+server.ts`, `preview-stream/+server.ts`, `generate/+server.ts`; `src/routes/api/admin/snapshots/regenerate/+server.ts`; `src/routes/+layout.svelte`; `src/hooks.server.ts` (line 240-279).

**Files grepped:** `applyTieredRateLimit` callers (1 hit — `access/check/+server.ts`), `requireAdmin` callers (10+ hits under `api/admin/`), `wallet-address` setter site (`+layout.svelte:63-80`), `RAIN_STRATEGIES_COMMIT` references (1 hit — `orderDeployment.ts:55`).

**Pattern extraction date:** 2026-04-30
