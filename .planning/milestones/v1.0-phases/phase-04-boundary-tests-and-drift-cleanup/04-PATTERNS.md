# Phase 4: Boundary Tests & Drift Cleanup — Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 30+ new/modified files across 6 waves
**Analogs found:** 26 / 30 (4 files are genuinely-new infrastructure with no in-repo analog)

## File Classification

### NEW files (test, fixture, script, helper, config)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `tests/hooks/_helpers.ts` | test-utility | request-response | `tests/lib/services/marketOrderExecution.test.ts` (vi.hoisted scaffolding) + `tests/utils/mockStores.ts` | role-match |
| `tests/hooks/cors.test.ts` | test (hooks) | request-response | `src/lib/server/walletSession.test.ts` (vi.mock + import-handler pattern) | role-match |
| `tests/hooks/csp.test.ts` | test (hooks) | request-response | `src/lib/server/walletSession.test.ts` | role-match |
| `tests/hooks/public-paths.test.ts` | test (hooks) | request-response | `src/lib/server/walletSession.test.ts` | role-match |
| `tests/hooks/admin-gate.test.ts` | test (hooks) | request-response | `src/lib/server/walletSession.test.ts` | role-match |
| `tests/hooks/wallet-session.test.ts` | test (hooks) | request-response | `src/lib/server/walletSession.test.ts` | exact (same SUT family, post-Phase-3) |
| `tests/hooks/bot-rejection.test.ts` | test (hooks) | request-response | `src/lib/server/walletSession.test.ts` | role-match |
| `tests/lib/admin/codes.audit.test.ts` (×8 endpoints total) | test (api handler) | request-response | `tests/lib/services/marketOrderExecution.test.ts` (vi.mock per-dependency pattern) | role-match |
| `tests/helpers/anvil.ts` | test-utility | event-driven (process spawn) | None in repo | NO ANALOG (new infra; mirrors RESEARCH §"Pattern 3") |
| `tests/helpers/loadTranscript.ts` | test-utility | file-I/O | None in repo (`readFileSync`+`resolve` snippet exists in `marketOrderExecution.test.ts:1-3`) | partial — borrow snippet only |
| `tests/integration/marketOrder/anvil-fork.test.ts` | test (integration) | request-response (RPC) | None in repo | NO ANALOG (new tier; depends on `tests/helpers/anvil.ts`) |
| `tests/integration/marketOrder/replay-*.test.ts` (×7 fixtures) | test (integration) | replay/transform | None in repo | NO ANALOG (depends on `tests/helpers/loadTranscript.ts` + `TakeOrderFailureTranscript` type) |
| `tests/fixtures/marketOrder/*.json` (×7) | fixture | data | None in repo | NO ANALOG (captured from prod OBS-03) |
| `tests/fixtures/eslint/token-lookup-violation.ts` | fixture (lint) | static | `tests/fixtures/io-perspective-violation.ts` | exact |
| `src/lib/server/snapshots/scraper.test.ts` | test (server module) | request-response (fetch) | `src/lib/server/snapshots/generator.test.ts` (`global.fetch = vi.fn()`); `blobIndex.test.ts` (paginated fixture) | exact |
| `scripts/codemods/migrate-token-find.ts` | codemod (build-time) | transform | `scripts/codemod-trade-01.ts` | exact |
| `vite.config.integration.js` (or `vitest.integration.config.ts`) | config | build | existing `vite.config.js` `test` block | role-match |
| `.github/workflows/ci.yml` (new `test-integration` job) | CI config | event-driven | `.github/workflows/test.yml` (existing `test` job) | role-match (mirror + add Foundry install) |

### MODIFIED files (codemod targets, drift-fixes, doc edits, audit-log emission ADDs)

| Modified File | Role | Data Flow | Change Source | Pattern To Apply |
|---------------|------|-----------|---------------|------------------|
| `eslint.config.js` | config | static | `eslint.config.js:46-65` (TRADE-01 block) | mirror block — add DRIFT-01 `no-restricted-syntax` |
| `package.json` (scripts) | config | build | RESEARCH §"Anvil-CI Resolution" | add `"test:integration"` script |
| `CLAUDE.md` | doc | static | CONTEXT D-05 surgical edit | strike 4 false claims; add Ground Truth header |
| `src/lib/queries/oracleQuotes.ts:61` | service (query) | request-response | codemod | `TOKENS.find` → `getTokenByAnyAddress` |
| `src/lib/queries/priceFeeds.ts:10` | service (query) | request-response | codemod | same |
| `src/lib/utils/tradeTransform.ts:138, 141` | utility | transform | codemod | same |
| `src/lib/api/subgraph.ts:18` | api | request-response | codemod | same |
| `src/routes/(main)/trade/[id]/+page.svelte:259` | component (route) | request-response | codemod (hand-edit per TRADE-01 precedent — `.svelte` skipped by codemod) | same |
| `src/lib/components/orders/DcaOrder.svelte:41` | component | request-response | hand-edit | `ALL_TOKENS.find` → `getTokenByAnyAddress` |
| `src/lib/components/orders/LimitOrder.svelte:81` | component | request-response | hand-edit | same |
| `src/routes/(main)/+page.svelte:424` | component (route) | request-response | hand-edit | same |
| `src/routes/(main)/dashboard/+page.svelte:1432, 1568` | component (route) | request-response | hand-edit | same |
| `src/routes/admin/+page.svelte` (8 USDC refs) | component (route) | request-response | DRIFT-02 | replace with `getPaymentTokensForNetwork` + `isPaymentToken` |
| `src/routes/api/admin/nansen/+server.ts` (5 USDC refs) | api handler | request-response | DRIFT-02 | same |
| `src/routes/api/admin/excluded-wallets/+server.ts` | api handler | CRUD | TEST-02 emission ADD | mirror `codes/+server.ts:36-78` audit-log pattern |
| `src/routes/api/admin/pool-wallets/+server.ts` | api handler | CRUD | TEST-02 emission ADD | same |
| `src/routes/api/admin/team-wallets/+server.ts` | api handler | CRUD | TEST-02 emission ADD | same |
| `src/routes/api/admin/snapshots/trigger/+server.ts` | api handler | event-driven | TEST-02 emission ADD | same |
| `src/routes/api/admin/snapshots/regenerate/+server.ts` | api handler | event-driven | TEST-02 emission ADD | same |

---

## Pattern Assignments

### `tests/hooks/{cors,csp,public-paths,admin-gate,wallet-session,bot-rejection}.test.ts` (test, request-response)

**Analog:** `src/lib/server/walletSession.test.ts` (lines 1–60)

**Imports + hoisted-mock pattern** (lines 1–17):
```typescript
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetKv } = vi.hoisted(() => ({
    mockGetKv: vi.fn()
}));

vi.mock('./kv', () => ({
    getKv: mockGetKv
}));
```

**Per-test KV/state setup pattern** (lines 31–53):
```typescript
const store = new Map<string, string>();
const kvSet = vi.fn(async (key: string, value: string, _opts?: { PX: number }) => {
    store.set(key, value);
});
const kvGet = vi.fn(async (key: string) => store.get(key) ?? null);
mockGetKv.mockResolvedValue({ set: kvSet, get: kvGet, del: vi.fn() });

const { createSession, readSession } = await import('./walletSession');
```

**`beforeEach` reset pattern** (lines 21–25):
```typescript
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
});
```

**SUT to drive (`src/hooks.server.ts`):** import `handle`; call with `createMockRequestEvent({...})`; assert `event.locals.walletAddress` mutation, response `headers`, cookie sets, and `next()` invocation. RESEARCH Pitfall 5: type the helper return as SvelteKit's `RequestEvent` (imported from `@sveltejs/kit`), no `as any`.

**CSP per-directive assertions:** `src/hooks.server.ts:176–197` (`CSP_DIRECTIVES`) — assertions test for explicit Sentry hosts (`https://*.ingest.sentry.io`, `https://*.ingest.us.sentry.io` at line 186), NO bare `*.sentry.io` wildcard, no `frame-src` Onramper entry (post-DEPR-03).

**Public-paths assertion source:** `src/hooks.server.ts:158-160` (`isPublicApiPath`) + `src/hooks.server.ts:217-218` (`PUBLIC_PATHS` set).

---

### `tests/hooks/_helpers.ts` (test-utility, request-response)

**Analog:** mixed — borrow `vi.hoisted` style from `marketOrderExecution.test.ts:11-20`; type from `@sveltejs/kit`.

**Pattern (per D-02a + RESEARCH Pitfall 5):**
```typescript
import type { RequestEvent } from '@sveltejs/kit';
import { vi } from 'vitest';

export function createMockRequestEvent(overrides: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
}): RequestEvent {
    // Build a typed RequestEvent — DO NOT use `as any`; let TS catch shape drift.
    // ...
}

export function createMockKv() { /* see walletSession.test.ts:32-37 */ }
export function createMockSession({ walletAddress }: { walletAddress: string }) { /* ... */ }
```

---

### `tests/lib/admin/<endpoint>.audit.test.ts` (test, request-response × 8 files)

**Analog:** `tests/lib/services/marketOrderExecution.test.ts` (lines 1–76 — vi.mock-per-dependency + handler import) + RESEARCH §"Audit-log per-endpoint test (TEST-02 pattern)".

**vi.mock pattern for `$lib/server/auditLog`** (RESEARCH lines 386–406):
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('$lib/server/auditLog', () => ({
    createAuditLogger: vi.fn(() => ({
        log: vi.fn(),
        logSuccess: vi.fn(),
        logFailure: vi.fn()
    }))
}));

import { POST } from '$routes/api/admin/snapshots/trigger/+server';
```

**Mock-shape MUST match real signature** (`src/lib/server/auditLog.ts:123-149`): `createAuditLogger(request)` returns `{ log, logSuccess, logFailure }` — all three exposed (the `codes/+server.ts` handler uses `logSuccess`, others may use `log`/`logFailure`).

**Mock-leakage avoidance (RESEARCH Pitfall 4):** one test file per endpoint; `vi.mock` at top-of-file scope (NOT `vi.doMock`); `beforeEach(() => vi.clearAllMocks())`.

**Success-path + failure-path test shape** (per D-03 + the `codes/+server.ts:37-78` reference):
```typescript
describe('admin/<endpoint> audit-log fan-out', () => {
    beforeEach(() => vi.clearAllMocks());

    it('logs success on happy-path POST', async () => {
        const event = createMockRequestEvent({ method: 'POST', url: '...' });
        await POST(event);
        const { createAuditLogger } = await import('$lib/server/auditLog');
        const logger = (createAuditLogger as Mock).mock.results[0].value;
        expect(logger.logSuccess).toHaveBeenCalledWith(
            expect.any(String), // event type
            expect.any(Object), // details
            expect.objectContaining({ adminUser: 'admin' })
        );
    });

    it('logs failure when handler throws / DB write fails', async () => {
        // setup failure (e.g., mock the underlying op to throw); invoke; assert logFailure
    });
});
```

---

### `src/routes/api/admin/{excluded-wallets,pool-wallets,team-wallets,snapshots/trigger,snapshots/regenerate}/+server.ts` (api handler, CRUD — emission ADD)

**Analog:** `src/routes/api/admin/codes/+server.ts` (lines 1–110)

**Imports pattern** (lines 1–13):
```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/adminAuth';
import { createAuditLogger } from '$lib/server/auditLog';
```

**Admin guard + audit-logger construction** (lines 37–41):
```typescript
export const POST: RequestHandler = async ({ request, cookies }) => {
    const guardResponse = await requireAdmin(request, cookies, 'admin-<endpoint>-<verb>');
    if (guardResponse) return guardResponse;

    const audit = createAuditLogger(request);
    try {
        // ... handler body ...
        await audit.logSuccess('<EVENT_TYPE>', { /* details */ }, { adminUser: 'admin' });
        return json({ success: true });
    } catch (err) {
        await audit.logFailure(
            '<EVENT_TYPE>',
            { /* details */ },
            err instanceof Error ? err.message : String(err),
            { adminUser: 'admin' }
        );
        return json({ error: '...' }, { status: 400 });
    }
};
```

**EVENT_TYPE additions:** new entries in `AuditEventType` union at `src/lib/server/auditLog.ts:10` per endpoint (e.g., `EXCLUDED_WALLET_ADDED`, `POOL_WALLET_ADDED`, `TEAM_WALLET_ADDED`, `SNAPSHOT_TRIGGERED`, `SNAPSHOT_REGENERATED`).

---

### `src/lib/server/snapshots/scraper.test.ts` (test, request-response — fetch-mocked)

**Analog (primary):** `src/lib/server/snapshots/generator.test.ts` (lines 18–80)
**Analog (secondary, paginated fixture):** `src/lib/server/snapshots/blobIndex.test.ts` (lines 17–60)

**Imports + global.fetch reset pattern** (`generator.test.ts:18, 75-80`):
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = vi.fn() as unknown as typeof global.fetch;
});
```

**`vi.hoisted` + dependency-stub pattern** (`generator.test.ts:20-65`):
```typescript
const { mockX } = vi.hoisted(() => ({ mockX: vi.fn() }));
vi.mock('$lib/config/networks', () => ({ networks: [...] }));
vi.mock('$lib/config/tokens', () => ({ TOKENS: [], getTokenByAnyAddress: vi.fn(() => undefined) }));
```

**`jsonResponse` fetch-stub helper** (`generator.test.ts:67-73`):
```typescript
function jsonResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => body } as unknown as Response;
}
```

**Paginated fixture pattern** (`blobIndex.test.ts:17-34`):
```typescript
mockList
    .mockResolvedValueOnce({ blobs: [...], cursor: 'c1', hasMore: true })
    .mockResolvedValueOnce({ blobs: [...], cursor: undefined, hasMore: false });
```

**Code-paths to test** (per RESEARCH §"TEST-04 Resolution", scraper.ts source-cited):
- **Pagination boundary** (`scraper.ts:240-241`) — `transfersHasMore = transfersBatch.length === BATCH_SIZE`. Mock fetch returns `BATCH_SIZE` then `BATCH_SIZE-1` (terminates); separately exercise exact-multiple-of-BATCH_SIZE (returns BATCH_SIZE then 0).
- **Legacy `wrappedTokenTransfers` fallback** (`scraper.ts:192-202`) — mock fetch returns GraphQL error matching `/Cannot query field "wrappedTokenTransfers"/`; assert `wrappedHasMore = false`, sharesTransfers loop continues, no throw.
- **Transient subgraph failure** (`scraper.ts:269-281`) — mock fetch rejects with 503; assert outer `catch` logs `console.warn` and returns `[]`; assert other subgraph results still merge.

---

### `scripts/codemods/migrate-token-find.ts` (codemod, transform)

**Analog:** `scripts/codemod-trade-01.ts` (entire file — exact precedent)

**Idiom blocks to copy:**

**Imports + Project init** (lines 21, 41):
```typescript
import { Project, SyntaxKind, type SourceFile } from 'ts-morph';
const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
```

**Allowlist pattern** (lines 32–39):
```typescript
const ALLOWLIST_PATH_FRAGMENTS = [
    'src/lib/config/tokens.ts',
    'token-lookup-violation.ts'
];
// inside loop:
if (ALLOWLIST_PATH_FRAGMENTS.some((p) => filePath.includes(p))) continue;
if (filePath.endsWith('.svelte')) continue; // hand-edit per RESEARCH/TRADE-01 precedent
```

**Reverse-iteration + wasForgotten guard** (lines 57–73):
```typescript
const callExpressions = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .reverse();
for (const node of callExpressions) {
    if (node.wasForgotten()) continue;
    // match: TOKENS.find(...) or ALL_TOKENS.find(...)
    // extract predicate, identify the address argument, replaceWithText:
    //   getTokenByAnyAddress(<addressExpr>)
}
```

**Differences from TRADE-01 codemod (selector + helper):** TRADE-01 matched `PropertyAccessExpression[name in {inputTokenAddress, ...}]`. DRIFT-01 matches `CallExpression[callee.object.name=/^(TOKENS|ALL_TOKENS)$/][callee.property.name='find']` (mirrors the ESLint selector). Helper is `getTokenByAnyAddress` (singular) replacing the find predicate.

**Import-add pattern** (lines 78–104) — same `existingImport` lookup + `addNamedImports` shape, but module specifier is `$lib/config/tokens` and named import is `getTokenByAnyAddress`.

---

### `eslint.config.js` (config, static — DRIFT-01 rule add)

**Analog:** `eslint.config.js:46-65` (TRADE-01 block) — add a parallel block per RESEARCH §"Pattern 1".

**Pattern to mirror:**
```js
{
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: [
        'src/lib/config/tokens.ts',                              // canonical module
        'tests/fixtures/eslint/token-lookup-violation.ts'        // lint fixture
    ],
    rules: {
        'no-restricted-syntax': [
            'error',
            {
                selector:
                    "CallExpression[callee.object.name=/^(TOKENS|ALL_TOKENS)$/][callee.property.name='find']",
                message:
                    'Direct TOKENS.find / ALL_TOKENS.find is banned (DRIFT-01). Use getTokenByAnyAddress(addr) from $lib/config/tokens.ts.'
            }
        ]
    }
}
```

**Coexistence note (RESEARCH §"Pattern 1"):** the new block is appended; ESLint flat config merges multiple `no-restricted-syntax` rule entries. TRADE-01 rule at lines 46–65 must remain unchanged. Phase-exit re-runs both.

---

### `tests/fixtures/eslint/token-lookup-violation.ts` (fixture, static)

**Analog:** `tests/fixtures/io-perspective-violation.ts` (entire file)

**Pattern to mirror:**
```typescript
/**
 * ESLint fixture for DRIFT-01 `no-restricted-syntax` rule.
 *
 * This file intentionally contains banned TOKENS.find / ALL_TOKENS.find calls.
 * The rule MUST fire on every CallExpression below. Verified by:
 *   npm run lint -- tests/fixtures/eslint/token-lookup-violation.ts
 *
 * DO NOT allowlist this file. It is *expected* to fail lint.
 */
import { TOKENS, ALL_TOKENS } from '$lib/config/tokens';

declare const addr: string;

const a = TOKENS.find((t) => t.address === addr);          // banned
const b = ALL_TOKENS.find((t) => t.address === addr);      // banned

export const violations = { a, b };
```

---

### `tests/helpers/anvil.ts` (test-utility, event-driven — NO ANALOG)

**Pattern source:** RESEARCH §"Pattern 3" (verbatim — copy from research, citing Foundry book).

```typescript
import { spawn, type ChildProcess } from 'node:child_process';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

let anvilProc: ChildProcess | null = null;

export async function startAnvilFork(forkBlock: number) {
    if (!process.env.BASE_RPC_URL) throw new Error('BASE_RPC_URL required');
    anvilProc = spawn('anvil', [
        '--fork-url', process.env.BASE_RPC_URL,
        '--fork-block-number', String(forkBlock),
        '--port', '8545',
        '--silent'
    ], { stdio: 'pipe' });
    await waitForRpc('http://127.0.0.1:8545');
    return createPublicClient({ chain: base, transport: http('http://127.0.0.1:8545') });
}

export async function stopAnvilFork() {
    anvilProc?.kill('SIGTERM');
    anvilProc = null;
}
```

**Pitfall to address (RESEARCH Pitfall 2):** ensure `BASE_RPC_URL` provider serves archive history at the pinned fork block; document in `04-RUNBOOK.md`.

---

### `tests/helpers/loadTranscript.ts` (test-utility, file-I/O)

**Snippet analog:** `tests/lib/services/marketOrderExecution.test.ts:1-3`:
```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
```

**Pattern (new):**
```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TakeOrderFailureTranscript } from '$lib/services/observability/captureTakeOrderFailure';

export function loadTranscript(scenario: string): TakeOrderFailureTranscript {
    const path = resolve('tests/fixtures/marketOrder', `${scenario}.json`);
    return JSON.parse(readFileSync(path, 'utf-8')) as TakeOrderFailureTranscript;
}
```

**Type source (D-01b):** in-source `TakeOrderFailureTranscript` (Plan 02-06 added the type at `src/lib/services/observability/captureTakeOrderFailure.ts`).

---

### `tests/integration/marketOrder/anvil-fork.test.ts` + `replay-*.test.ts` (test, integration — NO IN-REPO ANALOG)

**Analog (replay-side glue):** `tests/lib/services/marketOrderExecution.test.ts:11-76` (vi.mock pattern + `executeMarketOrder` import). RESEARCH §"Anvil-fork test (TEST-03 pattern)" supplies the per-suite shape.

**Pattern (anvil-fork side):**
```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { startAnvilFork, stopAnvilFork } from 'tests/helpers/anvil';
const FORK_BLOCK = 33_400_000;

describe('marketOrderExecution against forked Base mainnet', () => {
    let publicClient: Awaited<ReturnType<typeof startAnvilFork>>;
    beforeAll(async () => { publicClient = await startAnvilFork(FORK_BLOCK); });
    afterAll(stopAnvilFork);

    it('detects partial fill against actual on-chain vault state', async () => {
        // drive marketOrderExecution against real Orderbook contract at FORK_BLOCK
    });
});
```

**Pattern (replay side):** mirror `marketOrderExecution.test.ts:11-76` mock setup, then `loadTranscript('aggregated-quote-stale')` per scenario, drive `executeMarketOrder`, assert `mockCaptureTakeOrderFailure` (per `marketOrderExecution.test.ts:39-48`) was invoked with the transcript shape from the fixture.

---

### `tests/fixtures/marketOrder/*.json` (×7) (fixture, data — NO ANALOG)

**Generation procedure:** RESEARCH §"TEST-03 Resolution — fixture count + capture procedure" (verbatim — bash pipeline lines 463–486). Schema = in-source `TakeOrderFailureTranscript`.

**Naming (per RESEARCH table, lines 451–459):**
- `aggregated-quote-stale.json`
- `fallback-no-liquidity.json`
- `per-order-partial-fill.json`
- `hydration-failure.json`
- `stale-session-recovery.json`
- `slippage-cap-exceeded.json`
- `wrong-side-classification.json`

**Redaction invariant (RESEARCH Pitfall 6):** all wallet hex addresses → `0x...redacted`; canonical contract addresses (USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, etc.) preserved via allowlist sed step.

---

### `vite.config.integration.js` (or `vitest.integration.config.ts`) (config, build)

**Analog:** existing `vite.config.js` `test` block (Vitest 1.6.0 + jsdom + `deps.inline`).

**Pattern:** copy the existing `test` block structure; override `include` to `['tests/integration/**/*.test.ts']`; keep jsdom (replay tests are browser-tier); set higher `testTimeout` (anvil tests are seconds, not ms — RESEARCH Pitfall 3).

**`package.json` script add (RESEARCH §"Anvil-CI Resolution"):**
```jsonc
{
    "scripts": {
        "test:integration": "vitest --config vite.config.integration.js"
    }
}
```

---

### `.github/workflows/ci.yml` (or new job in `test.yml`) (CI config, event-driven)

**Analog:** `.github/workflows/test.yml` (entire file — existing `test` and `lint` job structure)

**Pattern (new `test-integration` job mirroring `test` job at lines 4–27):**
```yaml
test-integration:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v2
      with:
        submodules: recursive
        fetch-depth: 0
    - name: Install Nix
      uses: DeterminateSystems/nix-installer-action@main
      with:
        determinate: true
    - uses: DeterminateSystems/flakehub-cache-action@main
    - name: Cache Foundry
      uses: actions/cache@v4
      with:
        path: ~/.foundry
        key: foundry-${{ runner.os }}-v1
    - name: Install Foundry
      run: curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
    - run: nix develop -c npm i
    - run: nix develop -c npm run test:integration
      env:
        BASE_RPC_URL: ${{ secrets.BASE_RPC_URL }}
        # plus existing secrets from test.yml lines 22-26
```

**Cross-cut to `test.yml` lines 22–26:** reuse the same secrets passing pattern. Add `BASE_RPC_URL` (Phase 3 SEC-01 already provisioned this).

---

### `src/routes/admin/+page.svelte` + `src/routes/api/admin/nansen/+server.ts` (component + api — DRIFT-02)

**Analog:** none (call-site replacement); pattern source is RESEARCH §"USDC hardcoding migration".

**Pattern to apply (RESEARCH lines 367-376):**
```typescript
// BEFORE:
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
const inputIsUsdc = inputAddr === USDC_ADDRESS;

// AFTER (consume existing helpers — DO NOT author new ones):
import { isPaymentToken } from '$lib/utils/tokenMath';
import { getPaymentTokensForNetwork } from '$lib/config/tokens';
const paymentTokens = getPaymentTokensForNetwork(8453);
const inputIsUsdc = isPaymentToken({ address: inputAddr }, paymentTokens[0]);
```

**Helpers ALREADY EXIST** (RESEARCH critical finding):
- `getPaymentTokensForNetwork(chainId: number): PythToken[]` at `src/lib/config/tokens.ts:25`
- `isPaymentToken(token, networkPaymentToken?)` at `src/lib/utils/tokenMath.ts:213`

DO NOT author duplicates. RESEARCH §"Anti-Patterns to Avoid" calls this out explicitly.

---

### `CLAUDE.md` (doc — DRIFT-03)

**Analog:** none (surgical text edit). Pattern source is CONTEXT D-05 verbatim.

**Strikes (4 regions):**
1. Multi-Chain Support table — replace with single-chain Base 8453 statement + pointer to `.planning/codebase/CONCERNS.md` and PROJECT.md Out of Scope.
2. "Account Abstraction" section — replace with "No account abstraction" disclaimer.
3. Project Structure entry `account-abstraction/` line — delete.
4. Tech Stack "Rhinestone SDK (account abstraction)" — delete.

**Add (1 region):** Ground Truth header at top of file (CONTEXT D-05 supplies verbatim text).

**PRESERVE (RESEARCH Pitfall 7):** the `## Order Semantics — INPUT/OUTPUT Perspective (Critical)` section (it is the prose statement of TRADE-01 / `src/lib/types/orderPerspective.ts` and is accurate); Rainlang section; Dev Commands; Project Overview; Tech Stack (minus Rhinestone); Project Structure (minus account-abstraction/).

**No backfill from `.planning/codebase/`** (CONTEXT D-05a).

---

## Shared Patterns

### Pattern A: Vitest mock scaffolding (`vi.hoisted` + `vi.mock` + `beforeEach` reset)

**Source:** `tests/lib/services/marketOrderExecution.test.ts:11-74` AND `src/lib/server/snapshots/generator.test.ts:18-80`
**Apply to:** ALL new test files in TEST-01, TEST-02, TEST-04 (NOT TEST-03 anvil tests, which intentionally avoid mocking the on-chain side).

**Canonical excerpt:**
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockX } = vi.hoisted(() => ({ mockX: vi.fn() }));
vi.mock('$lib/some-module', () => ({ exportName: mockX }));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
});
```

### Pattern B: Admin handler — `requireAdmin` + `createAuditLogger` + try/logSuccess/logFailure

**Source:** `src/routes/api/admin/codes/+server.ts:37-78`
**Apply to:** all 5 admin handlers receiving TEST-02 emission ADDs (excluded-wallets, pool-wallets, team-wallets, snapshots/trigger, snapshots/regenerate).

Excerpt above in §"emission ADD" section.

### Pattern C: `no-restricted-syntax` ESLint rule + lint-fixture verification

**Source:** `eslint.config.js:46-65` (TRADE-01 rule) + `tests/fixtures/io-perspective-violation.ts` (lint fixture)
**Apply to:** DRIFT-01 (new rule block + new fixture file).

Excerpts above in §"DRIFT-01" section.

### Pattern D: ts-morph codemod with allowlist + reverse-iteration + import-injection

**Source:** `scripts/codemod-trade-01.ts` (entire file)
**Apply to:** `scripts/codemods/migrate-token-find.ts`.

Excerpts above in §"DRIFT-01 codemod" section.

### Pattern E: Phase-exit grep gates

**Source:** Plans 01-08 / 02-08 / 03-11 phase-exit plans (per CONTEXT §"Established Patterns")
**Apply to:** Wave 6 (`04-NN-PLAN.md` phase-exit plan)

Concrete grep recipes are in RESEARCH §"Phase-Exit Resolution" (lines 600–706) — copy verbatim into the phase-exit plan's verification section.

---

## No Analog Found

These files have no close in-repo match; planner uses RESEARCH excerpts as the primary source (cited inline above).

| File | Role | Data Flow | Reason / Source |
|------|------|-----------|-----------------|
| `tests/helpers/anvil.ts` | test-utility | event-driven (process spawn) | First anvil/Foundry integration in repo. RESEARCH §"Pattern 3" supplies the verbatim pattern; Foundry book is the secondary source. |
| `tests/integration/marketOrder/anvil-fork.test.ts` | test (integration) | RPC | First anvil-driven test in repo. RESEARCH §"Anvil-fork test (TEST-03 pattern)" + `marketOrderExecution.test.ts:11-76` (mock setup half) supply the composite pattern. |
| `tests/fixtures/marketOrder/*.json` | fixture (replay) | data | First production-transcript replay fixtures in repo. RESEARCH §"TEST-03 Resolution" capture pipeline is the only source; schema = in-source `TakeOrderFailureTranscript`. |
| `vite.config.integration.js` | config | build | First parallel Vitest config in repo. Existing `vite.config.js` `test` block is the partial template. |

---

## Metadata

**Analog search scope:** `tests/`, `src/lib/server/`, `src/lib/services/`, `src/routes/api/admin/`, `scripts/`, `eslint.config.js`, `.github/workflows/`, `src/hooks.server.ts`, `src/lib/server/snapshots/`
**Files scanned:** ~25 (existing tests + 8 admin endpoints + codemod + ESLint + CI workflow + hooks.server.ts + scraper.ts + auditLog.ts + walletSession + helpers)
**Pattern extraction date:** 2026-05-01
**Critical pre-existing-state findings carried from RESEARCH:**
- DRIFT-01 actual site count = 12 (7 `TOKENS.find` + 5 `ALL_TOKENS.find`), NOT 8 per REQ-ID
- DRIFT-02 helpers `getPaymentTokensForNetwork` + `isPaymentToken` already exist — consume, don't author
- TEST-02 audit-log emission missing in 5 of 8 endpoints — TEST-02 must ADD emission first, then test
- `rewards-pool` admin endpoint already deleted by Phase 1 DEPR-* — exclude from inventory
- TRADE-01 codemod source IS in tree at `scripts/codemod-trade-01.ts` (RESEARCH note about it being missing was stale; verified during this mapping pass)
