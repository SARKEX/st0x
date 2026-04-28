# Testing Patterns

**Analysis Date:** 2026-04-28

## Test Framework

**Runner:**
- Vitest 1.6.0
- Config: `vite.config.js` (`test` block)
- Setup file: `vitest-setup.ts` (project root)

**Component testing:**
- `@testing-library/svelte` 5.1.0 (via `@testing-library/svelte/vite` plugin enabling browser-condition resolution in test mode).
- `@testing-library/jest-dom` 6.4.5 — DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) wired up in `vitest-setup.ts` via `import '@testing-library/jest-dom/vitest';`.
- `@testing-library/user-event` 14.5.2 — preferred over raw event dispatch.

**Environment:**
- `jsdom` (set in `vite.config.js` `test.environment`).
- jsdom 24.1.0.

**Mocking helpers:**
- `vitest-mock-extended` 1.3.1 for typed deep mocks.

**Assertion library:**
- Built-in Vitest `expect` (Jest-compatible API) plus jest-dom extensions.

**Run commands** (from `package.json`):
```bash
npm test                                # vitest (default = watch in TTY, run in CI)
npx vitest run                           # one-shot
npx vitest run path/to/file.test.ts      # single file
npx vitest --watch                       # explicit watch
```
There is no dedicated `test:coverage` script — invoke `npx vitest --coverage` ad-hoc.

## Vitest Configuration

`vite.config.js` `test` block (current state):
```javascript
test: {
    server: { deps: { inline: ['svelte-wagmi', 'viem', 'ethers'] } },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    includeSource: ['src/**/*.{js,ts}', 'tests/**/*.{js,ts}'],
    setupFiles: ['./vitest-setup.ts']
}
```
- `deps.inline` is required so ESM-only chain libraries are transformed for the test bundle.
- `includeSource` enables Vitest in-source testing (`if (import.meta.vitest) { ... }`) although no module currently uses it.
- `resolve.conditions: ['browser']` is applied only in test mode to make svelte-wagmi/viem use their browser entry points.

`vitest-setup.ts` does the global mocking once for every test:
- Mocks `svelte-wagmi` (replaces `web3Modal`, `wagmiConfig`, `signerAddress`, `chainId`, `connected`).
- Mocks `$lib/stores` to override `wrongNetwork` and `currentNetwork` while preserving the rest via `importOriginal()`.
- Mocks `$app/stores` to provide `page`, `navigating`, `session`, `updated` readables/writables (required because SvelteKit modules can't run in jsdom).
- Uses `await vi.hoisted(() => import('./tests/mocks/mockStores'))` so the mock factories can reference top-level mock stores safely.

`tsconfig.json` lists `"vitest/globals"` in `compilerOptions.types`, so `describe/it/expect/vi` are resolved without explicit imports — but production tests still import them explicitly for clarity.

## Test File Organisation

**Two locations** (both globbed by Vitest):

1. `tests/` — top-level directory mirroring `src/lib/`:
```
tests/
├── lib/
│   ├── components/orders/MarketOrder.test.ts
│   ├── services/marketOrderExecution.test.ts
│   ├── stores/authStore.test.ts
│   ├── stores/handleTakeOrders.test.ts
│   ├── types/orderPerspective.test.ts
│   ├── utils/quote.test.ts
│   ├── utils/format.test.ts
│   ├── utils/costBasis.test.ts
│   ├── utils/approvalDecimals.test.ts
│   ├── utils/marketPrice.test.ts
│   ├── utils/tokenMath.test.ts
│   ├── utils/marketOrderFill.test.ts
│   ├── derivations.test.ts
│   ├── handleDecimalSeparator.test.ts
│   ├── helpers.test.ts
│   ├── network.test.ts
│   ├── transactionStore.test.ts
│   └── validateDeploymentArgs.test.ts
├── mocks/                              # shared mocks for cross-cutting modules
│   ├── mockStores.ts                    # writable mock stores for svelte-wagmi
│   ├── mockCurrentNetwork.ts            # deterministic Network shape
│   └── mockWagmiConfig.ts               # wagmi createConfig with mock connector
└── utils/
    └── mockStores.ts                    # factories: createMockNetwork, createMockTokenInfo, createMockTakeOrdersParams, createMockResource
```

2. **Co-located** `*.test.ts` next to the implementation file — used for server/internal modules:
```
src/lib/server/rateLimit.test.ts
src/lib/server/accessCodes.test.ts
src/lib/server/signatureChallenge.test.ts
src/lib/server/snapshots/blobIndex.test.ts
src/lib/utils/fetchJson.test.ts
```

**Convention:** when adding a new test, mirror the source path under `tests/lib/...` for client-facing units (utils, services, stores, components, types). Co-locate when the module is server-only or part of a tightly-scoped package boundary (e.g. snapshots pipeline).

**Naming:**
- File: `<sourceName>.test.ts` (mirrors source basename).
- Top-level `describe` block: matches the module name (`describe('format utilities', ...)`, `describe('orderPerspective', ...)`).
- Nested `describe` per exported function (`describe('truncateAddress', ...)`).

## Test Structure

**Standard skeleton** (from `tests/lib/utils/format.test.ts`):
```typescript
import { describe, it, expect } from 'vitest';
import { truncateAddress, formatUsd, formatPoints, formatApy } from '$lib/utils/format';

describe('format utilities', () => {
    describe('truncateAddress', () => {
        it.each([
            ['0x0000000000000000000000000000000000000000', '0x0000...0000'],
            ['0x1234567890abcdef1234567890abcdef12345678', '0x1234...5678']
        ])('should truncate valid address %s to %s', (address, expected) => {
            expect(truncateAddress(address)).toBe(expected);
        });
    });
});
```

**Setup/teardown:**
```typescript
beforeEach(() => {
    vi.resetModules();        // mandatory for tests that rely on import-time side effects
    vi.clearAllMocks();
    // reset writable mock stores
    mockSignerAddress.set(null);
    mockConnected.set(false);
});

afterEach(() => {
    vi.unstubAllGlobals();    // when using vi.stubGlobal('fetch', ...)
    vi.restoreAllMocks();
});
```

**Patterns:**
- `it.each([[input, expected], ...])('should ... %s', (input, expected) => { ... })` is the dominant style for table-driven tests (see `format.test.ts`, `network.test.ts`, `tokenMath.test.ts`, `marketPrice.test.ts`, `derivations.test.ts`).
- Object-style each-rows when there are >2 fields: `it.each([{ desc, selectedAmount, expected }])('should calculate $desc', ({ ... }) => { ... })` (see `tests/lib/utils/marketPrice.test.ts`).
- One assertion concept per `it`. Multi-property assertions use `expect(result).toEqual({ ... })` or `expect(result).toMatchObject(...)`.
- Top-level constants (`USDC`, `ASSET`, `ONE`, `ONE_FLOAT_HEX`) are declared at module scope when reused across many tests (`tests/lib/types/orderPerspective.test.ts`, `tests/lib/utils/marketPrice.test.ts`).

## Mocking

**Three patterns in active use:**

### 1. Top-level `vi.mock()` with `vi.hoisted()`

Use when the mock state must be writable from inside `beforeEach` and the mocked module is imported at file top:

```typescript
const { mockSignerAddress, mockConnected, mockChainId } = await vi.hoisted(async () => {
    const { writable } = await import('svelte/store');
    return {
        mockSignerAddress: writable<string | null>(null),
        mockConnected: writable<boolean>(false),
        mockChainId: writable<number>(8453)
    };
});

vi.mock('svelte-wagmi', () => ({
    signerAddress: mockSignerAddress,
    connected: mockConnected,
    chainId: mockChainId
}));

// Real imports after the mocks
import { authMethod, walletAddress } from '$lib/stores/authStore';
```
Reference: `tests/lib/stores/authStore.test.ts`, `src/lib/server/rateLimit.test.ts`, `src/lib/server/accessCodes.test.ts`, `src/lib/server/snapshots/blobIndex.test.ts`. The hoisted block runs before any module-graph evaluation, so the mocks are wired by the time the source-under-test imports its dependencies.

### 2. `vi.mock(..., async (importOriginal) => ...)` for partial mocks

Preserve the real module while patching specific exports:
```typescript
vi.mock('viem', async (importOriginal) => {
    const actual = (await importOriginal()) as object;
    return {
        ...actual,
        decodeFunctionData: vi.fn()
    };
});
```
Reference: `tests/lib/transactionStore.test.ts`, `vitest-setup.ts` (`$lib/stores`).

### 3. `vi.stubGlobal('fetch', ...)` for HTTP-only tests

Use for utilities that rely on `fetch`:
```typescript
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    })
));
// ... test ...
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
```
Reference: `src/lib/utils/fetchJson.test.ts`.

### Shared mocks live in `tests/mocks/` and `tests/utils/`

- `tests/mocks/mockStores.ts` — writable mock stores for the global wagmi/auth surface (`mockWagmiConfigStore`, `mockSignerAddressStore`, `mockChainIdStore`, `mockConnectedStore`, `mockWrongNetworkStore`, `mockWalletAddressStore`, `mockAuthMethodStore`, `web3ModalStore`).
- `tests/mocks/mockCurrentNetwork.ts` — deterministic Base mainnet `Network` object (id 8453) reused across deployment + transaction store tests.
- `tests/mocks/mockWagmiConfig.ts` — wagmi `createConfig` with the `mock` connector + `polygonAmoy` chain + `fallback([http(), http('https://rpc-amoy.polygon.technology')])` transport.
- `tests/utils/mockStores.ts` — factories (NOT stores): `createMockNetwork`, `createMockToken`, `createMockTokenInfo`, `createMockTakeOrdersParams`, `createMockResource`. Use these to build fixtures inside `it` blocks.

**Always reset mock store values in `beforeEach`:**
```typescript
beforeEach(() => {
    mockSignerAddress.set(null);
    mockConnected.set(false);
    mockChainId.set(8453);
    // ...
});
```

### What to mock

- External RPC clients (`@wagmi/core` — `sendTransaction`, `waitForTransactionReceipt`, `readContract`, `estimateGas`).
- viem helpers that decode/sign (`decodeFunctionData`, `createPublicClient`).
- `@vercel/blob`, `@vercel/kv`, Redis (`./kv` module).
- `$app/environment`, `$app/stores` (always mocked globally in `vitest-setup.ts`).
- `$lib/services/orderDeployment` builder functions when testing `transactionStore` so unit tests don't pull in the WASM Rain registry.

### What NOT to mock

- Pure utilities under test (`format`, `tokenMath`, `validation`, `derivations`, `marketHours`, `costBasis`, `marketOrderFill`, `orderPerspective`) — test them with real inputs.
- The `Float` class from `@rainlanguage/float` — use real `Float.parse(...)` / `Float.fromHex(...)` for fidelity (see `tests/lib/derivations.test.ts`, `tests/lib/utils/tokenMath.test.ts`).
- Svelte's own `writable`/`derived` — use the real store machinery (sometimes via `vi.hoisted` to inject pre-made stores, but never re-implement subscribe semantics).

## Fixtures and Factories

**Helpers in `tests/utils/mockStores.ts`:**

```typescript
export function createMockNetwork(overrides?: Partial<Network>): Network { ... }
export function createMockToken(overrides?: Partial<CategorizedToken>): CategorizedToken { ... }
export function createMockTokenInfo(overrides?: Partial<TokenInfo>): TokenInfo { ... }
export function createMockTakeOrdersParams(overrides?: Partial<TakeOrdersParams>): TakeOrdersParams { ... }
export function createMockResource<T>(data: T) { ... }
```
Pattern: every factory takes `Partial<T>` overrides so callers spell out only the fields that matter to the assertion.

**Inline builders for domain types** (preferred when the shape is module-specific):
```typescript
function quoteWithOwner(orderHash: string, owner?: string): ProcessedQuote { ... }   // marketOrderExecution.test.ts
function buildQuote(overrides: Partial<ProcessedQuote>): ProcessedQuote { ... }      // quote.test.ts
function makeTrade({ timestamp, isBuy, ... }): CostBasisTrade { ... }                // costBasis.test.ts
function bigintToHexFloat(value: bigint): string { ... }                              // quote.test.ts
function fixedToFloatHex(value: bigint, decimals = 18): string { ... }               // derivations.test.ts
```

## Coverage

**Requirements:** None enforced. There is no Vitest `coverage.thresholds` block, no CI gate on coverage, no coverage script.

**View coverage on demand:**
```bash
npx vitest run --coverage
```
(Default Vitest reports use `v8` provider; install `@vitest/coverage-v8` if not already present.)

## Test Types

**Unit tests (dominant):**
- Pure utilities: `format`, `tokenMath`, `marketHours`, `marketOrderFill`, `derivations`, `validation`, `helpers`, `costBasis`, `network`, `orderbook` (`tests/lib/utils/*.test.ts`, `tests/lib/derivations.test.ts`, `tests/lib/network.test.ts`, etc.).
- Type/perspective semantics: `tests/lib/types/orderPerspective.test.ts` exhaustively covers Buy/Sell/Bid/Ask round-trip conversions plus integration flows.
- Server modules: rate limiting, access codes, signature challenge, snapshot blob index (`src/lib/server/*.test.ts`).

**Store / service tests with full mocked dependency graph:**
- `tests/lib/stores/authStore.test.ts` — derived stores under multi-source auth conditions.
- `tests/lib/transactionStore.test.ts` — biggest test file; mocks `@wagmi/core`, viem, svelte-wagmi, `$lib/stores/authStore`, `$lib/services/orderDeployment`, `$lib/clients/raindex`, even `svelte/store` (selectively, using `vi.importActual`) to drive the deployment lifecycle.
- `tests/lib/stores/handleTakeOrders.test.ts` — exercises the `TakeOrdersParams` interface through `createMockTakeOrdersParams`.

**Component tests:**
- `tests/lib/components/orders/MarketOrder.test.ts` — currently tests the **price calculation function** in isolation (the `calculateRequiredInput` helper that mirrors the component's logic) rather than rendering the component. This is the standing pattern: prefer testing pure logic extracted from a component over rendering the component when business logic can be lifted.

**Integration / E2E:**
- No Playwright, Cypress, or Vitest browser-mode E2E suite is wired into the npm scripts.
- `.playwright-mcp/` exists but contains MCP page snapshots, not a test runner.

## Key Test Areas (current coverage)

| Area | Files |
|------|-------|
| Quote processing & orderbook walk | `tests/lib/utils/quote.test.ts`, `tests/lib/derivations.test.ts` (covers `walkOrderbook`, `scaleAmount`) |
| Formatting | `tests/lib/utils/format.test.ts`, `tests/lib/utils/tokenMath.test.ts`, `tests/lib/utils/approvalDecimals.test.ts` |
| Market price calculations | `tests/lib/utils/marketPrice.test.ts`, `tests/lib/utils/marketOrderFill.test.ts` (slippage, ratio multipliers) |
| Order perspective semantics (INPUT/OUTPUT, maker/taker) | `tests/lib/types/orderPerspective.test.ts`, `tests/lib/services/marketOrderExecution.test.ts` (excluding taker-owned quotes) |
| Auth logic | `tests/lib/stores/authStore.test.ts` |
| Deployment validation | `tests/lib/validateDeploymentArgs.test.ts`, `tests/lib/transactionStore.test.ts` |
| Token math + decimals | `tests/lib/utils/tokenMath.test.ts`, `tests/lib/utils/costBasis.test.ts` |
| Network config | `tests/lib/network.test.ts` |
| Input handling | `tests/lib/handleDecimalSeparator.test.ts`, `tests/lib/helpers.test.ts` |
| Take order parameter shape | `tests/lib/stores/handleTakeOrders.test.ts` |
| Server: rate limiting + access codes + signature challenge | `src/lib/server/rateLimit.test.ts`, `src/lib/server/accessCodes.test.ts`, `src/lib/server/signatureChallenge.test.ts` |
| Server: snapshot blob index | `src/lib/server/snapshots/blobIndex.test.ts` |
| Fetch wrapper | `src/lib/utils/fetchJson.test.ts` |

## Common Patterns

**Async testing:**
```typescript
it('returns parsed payload for successful JSON responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(...)));
    const result = await fetchJson<{ ok: boolean; value: number }>('/api/test');
    expect(result.ok).toBe(true);
});
```

**Error/timeout testing:**
```typescript
it('returns timeout error when request aborts', async () => {
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
        });
    })));
    const result = await fetchJson('/api/slow', undefined, 5);
    expect(result.error).toBe('Request timed out');
});
```

**Dynamic import after module reset:**
```typescript
beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetKv.mockResolvedValue(null);
});

it('uses strict fail-closed in-memory fallback when Redis is unavailable', async () => {
    const { rateLimiters } = await import('./rateLimit');   // re-import after resetModules
    const result = await rateLimiters.admin('id');
    expect(result.failedClosed).toBe(true);
});
```
This pattern is mandatory whenever the code under test caches state at module scope (singletons, in-memory rate limiter buckets) — `vi.resetModules()` forces a fresh module instance per test.

**Store testing via `get`:**
```typescript
import { get } from 'svelte/store';
import { authMethod } from '$lib/stores/authStore';

it('should return "wallet" when wallet is connected', () => {
    mockConnected.set(true);
    mockSignerAddress.set('0x1234567890abcdef1234567890abcdef12345678');
    expect(get(authMethod)).toBe('wallet');
});
```

**Float / on-chain value testing:**
```typescript
import { Float } from '@rainlanguage/float';
const ONE_FLOAT_HEX = Float.parse('1').value!.asHex();
function fixedToFloatHex(value: bigint, decimals = 18): string {
    return Float.fromFixedDecimalLossy(value, decimals).float.asHex();
}
```
Use real `Float` math for fidelity; the package is small and synchronous.

**Non-null assertion on factories that return `Result<T>`:**
- `Float.parse('1').value!.asHex()` is the standard idiom in tests when the input is known-good. Avoid this in production code; use the `result.error` check instead.

**ESLint disables:**
- Tests freely opt out of `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` per file:
  ```typescript
  /* eslint-disable @typescript-eslint/no-explicit-any */
  ```
  Do this only when the alternative is significantly noisier; production code does not use these escape hatches.

## Adding a New Test

1. Decide location:
   - Client lib (utils/services/stores/types/components) → `tests/lib/<mirror-of-src-path>/<name>.test.ts`.
   - Server-only or tightly scoped package → co-locate `<name>.test.ts` next to source.
2. Top of file:
   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   ```
3. If the source under test imports `svelte-wagmi`, `$lib/stores`, `$app/stores`, `$lib/stores/authStore`, or `$lib/stores/dynamicStore` — `vitest-setup.ts` already mocks the first three globally. For per-test overrides of auth, follow the `vi.hoisted` pattern in `tests/lib/stores/authStore.test.ts`.
4. Prefer `it.each([...])` for tabular cases; full `it` blocks for behavioural assertions.
5. Use factories from `tests/utils/mockStores.ts` for `Network` / `Token` / `TakeOrdersParams` shapes; build inline helpers for module-specific types (`buildQuote`, `quoteWithOwner`).
6. If the module caches state at import time, add `vi.resetModules()` + dynamic `await import('./mod')` per test.
7. Reset every writable mock store in `beforeEach`.
8. Run `npx vitest run path/to/file.test.ts` before submitting.

---

*Testing analysis: 2026-04-28*
