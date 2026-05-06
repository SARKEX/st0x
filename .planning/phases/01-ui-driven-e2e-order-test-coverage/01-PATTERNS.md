# Phase 1: UI-Driven E2E + Order Test Coverage — Pattern Map

**Mapped:** 2026-05-06
**Files analyzed:** 21 (14 NEW + 7 MODIFIED + ESLint/CI/docs)
**Analogs found:** 18 / 21 (3 greenfield — `eip1193Stub.ts`, `previewServer.ts`, `playwright.config.ts` Playwright project block)

**Note:** No `01-CONTEXT.md` exists in the phase directory; decisions D-01..D-14 were extracted from RESEARCH.md "User Constraints (from CONTEXT.md)" §.

---

## File Classification

### NEW files

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `playwright.config.ts` | config | request-response (test runner config) | `vite.config.integration.js` | role-match (different runner — analog gives shape, not API) |
| `tests/integration/ui/globalSetup.ts` | test (lifecycle hook) | event-driven (one-shot setup) | `tests/helpers/anvil.ts` `startAnvilFork` | role-match (orchestration; no Playwright analog in repo) |
| `tests/integration/ui/globalTeardown.ts` | test (lifecycle hook) | event-driven | `tests/helpers/anvil.ts` `stopAnvilFork` | role-match |
| `tests/integration/ui/fixtures.ts` | test utility | request-response | `tests/integration/marketOrder/_replay-helpers.ts` | role-match (Vitest test data builders → Playwright fixtures) |
| `tests/integration/ui/smoke.spec.ts` | test | request-response (UI → RPC) | `tests/integration/marketOrder/anvil-fork.test.ts` | role-match (Vitest → Playwright; same anvil-skip pattern) |
| `tests/integration/ui/marketBuy.spec.ts` | test | request-response | `tests/integration/marketOrder/anvil-fork.test.ts` | role-match |
| `tests/integration/ui/marketSell.spec.ts` | test | request-response | `tests/integration/marketOrder/anvil-fork.test.ts` | role-match |
| `tests/integration/ui/marketFailures.spec.ts` | test | request-response (5 failure modes) | `tests/integration/marketOrder/replay-fallback-no-liquidity.test.ts` | role-match (failure-mode classification) |
| `tests/integration/ui/limitDeploy.spec.ts` | test | request-response (deploy + simulated counterparty) | `tests/integration/marketOrder/anvil-fork.test.ts` | role-match |
| `tests/helpers/eip1193Stub.ts` | utility (browser-injected) | request-response (RPC proxy) | (none — closest is `tests/helpers/anvil.ts` `waitForRpc` showing direct fetch JSON-RPC POST) | partial |
| `tests/helpers/anvilControl.ts` | utility | request-response (TestClient wrappers) | `tests/helpers/anvil.ts` | role-match |
| `tests/helpers/previewServer.ts` | utility (process lifecycle) | event-driven | `tests/helpers/anvil.ts` (spawn + waitForRpc pattern) | role-match (spawn child process + ready-detect) |
| `.planning/phases/.../01-AUDIT.md` | doc | n/a | template embedded in RESEARCH.md §"Audit Matrix Template" | exact (template provided) |
| `.planning/phases/.../01-RUNBOOK.md` | doc | n/a | (no analog in repo; standard runbook shape) | n/a |

### MODIFIED files

| File | Role | Modification | Closest Analog (for the modification) |
|------|------|--------------|--------------------------------------|
| `package.json` | config | add `test:e2e` script + `@playwright/test` devDep | `package.json` line 15 (`test:integration`) |
| `src/lib/components/orders/MarketOrder.svelte` | component (Svelte) | retrofit `data-testid` attributes (D-09 grammar) | `src/lib/components/TransactionModal.svelte` |
| `src/lib/components/orders/LimitOrder.svelte` | component (Svelte) | same retrofit | `src/lib/components/TransactionModal.svelte` |
| `src/routes/(main)/trade/[id]/+page.svelte` | route component | mode-tab + form-loaded testids | `src/lib/components/WalletConnect.svelte` (state-machine testids) |
| `src/hooks.server.ts` | server hook | add `E2E=1` env-gated `connect-src` extras | `src/hooks.server.ts` line 196 (`dev`-gated `upgrade-insecure-requests`) |
| `eslint.config.js` | config | add `no-restricted-imports` block scoped to `tests/integration/ui/**` | `eslint.config.js` lines 68-95 (existing `no-restricted-syntax` scoped block) |
| `.github/workflows/test.yml` | CI workflow | add `test-e2e` job; switch foundry install to `foundry-rs/foundry-toolchain@v1` | `.github/workflows/test.yml` `test-integration` job (lines 29-74) |
| `.planning/codebase/TESTING.md` | doc | add "UI Test Selectors" section | n/a |

---

## Pattern Assignments

### `playwright.config.ts` (config)

**Analog:** `vite.config.integration.js`

**Pattern to copy — config file shape and module-pattern** (entire 39 lines):
The analog is a single `defineConfig({...})` default export with a `test` block setting `include`, raised timeouts, and a leading comment explaining its parallel-config purpose. New `playwright.config.ts` mirrors this shape with Playwright's `defineConfig` and one `projects` array.

**Concrete excerpt** (`vite.config.integration.js` lines 6-12):
```javascript
// Integration-only Vitest config. Runs anvil-driven tests under
// tests/integration/ — gated behind `npm run test:integration` so the
// default `npm test` feedback loop stays fast (per RESEARCH §"Anvil-CI
// Resolution"). Mirrors the test block from vite.config.js but:
//   - include scoped to tests/integration/**/*.test.ts
//   - testTimeout / hookTimeout raised to 60s for anvil spin-up
```
**Apply to playwright.config.ts:** lead with an equivalent comment block explaining E2E-only scope, why `workers: 1` (single shared anvil), why `testDir: 'tests/integration/ui'`, and why timeouts are raised (preview boot + chain calls).

**Test-include pattern** (`vite.config.integration.js` lines 35-39):
```javascript
include: ['tests/integration/**/*.test.ts'],
testTimeout: 60_000,
hookTimeout: 60_000
```
**Apply to playwright.config.ts:** `testDir: 'tests/integration/ui'`, `timeout: 60_000`, `expect: { timeout: 30_000 }`, `globalSetup`/`globalTeardown` paths.

---

### `tests/integration/ui/globalSetup.ts` (test lifecycle)

**Analog:** `tests/helpers/anvil.ts` (anvil spawn + RPC ready-probe pattern)

**Pattern: spawn child process + wait-for-ready** (`tests/helpers/anvil.ts` lines 7-30):
```typescript
async function waitForRpc(url: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_blockNumber',
                    params: []
                })
            });
            if (res.ok) {
                const json = (await res.json()) as { result?: string };
                if (json.result) return;
            }
        } catch {
            // anvil not ready yet
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`anvil RPC at ${url} did not become ready within ${timeoutMs}ms`);
}
```
**Apply to globalSetup.ts:** Use this exact polling pattern for the vite-preview ready-probe (HTTP GET on `/`). Reuse `startAnvilFork()` directly for anvil — do NOT re-implement.

**Pattern: BASE_RPC_URL guard** (`tests/helpers/anvil.ts` lines 40-42):
```typescript
if (!process.env.BASE_RPC_URL) {
    throw new Error('BASE_RPC_URL required for anvil fork — set in CI secrets / .env');
}
```
**Apply:** First line of `globalSetup` should also assert `BASE_RPC_URL` and bail with the same error grammar.

**Pattern: spawn-with-pipe + exit handler** (`tests/helpers/anvil.ts` lines 46-64):
```typescript
anvilProc = spawn(
    'anvil',
    [/* args */],
    { stdio: 'pipe' }
);
anvilProc.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
        console.error(`anvil exited unexpectedly: code=${code} signal=${signal}`);
    }
});
```
**Apply to `previewServer.ts`:** Identical spawn + exit-handler pattern for `vite preview`. Use `stdio: 'pipe'` so output doesn't pollute Playwright reporter.

---

### `tests/integration/ui/globalTeardown.ts` (test lifecycle)

**Analog:** `tests/helpers/anvil.ts` `stopAnvilFork`

**Pattern: SIGTERM + grace delay + null-out** (lines 74-80):
```typescript
export async function stopAnvilFork(): Promise<void> {
    if (!anvilProc) return;
    anvilProc.kill('SIGTERM');
    // give it a moment to clean up
    await new Promise((r) => setTimeout(r, 200));
    anvilProc = null;
}
```
**Apply:** Same shape for `stopPreviewServer()` in `previewServer.ts`. globalTeardown calls both.

---

### `tests/integration/ui/fixtures.ts` (Playwright fixtures)

**Analog:** `tests/integration/marketOrder/_replay-helpers.ts`

**Pattern: shared test-data exports + builder functions** (`_replay-helpers.ts` lines 11-13, 78-87):
```typescript
export const ASSET_ADDR = '0x2222222222222222222222222222222222222222';
export const PAYMENT_ADDR = '0x1111111111111111111111111111111111111111';

export const STD_NETWORK = {
    id: 8453,
    name: 'base',
    rpcUrls: { default: { http: ['https://example.com'] } }
};

export const STD_TOKENS = {
    assetToken: { address: ASSET_ADDR, decimals: 18, symbol: 'tNVDA' },
    paymentToken: { address: PAYMENT_ADDR, decimals: 6, symbol: 'USDC' }
};
```
**Apply to fixtures.ts:** Same export pattern for `tokens` (real Base addresses sourced from `src/lib/config/tokens.ts`), `fundedAccount` (anvil default account #0 address+key), `unfundedAccount` (account #1 — D-08 insufficient-balance fixture). Use Playwright `test.extend({...})` to wire these as fixtures with per-test `testClient` (snapshot/revert lifecycle).

**Note on snapshot/revert ordering** (per RESEARCH Pitfall 2): fixture's `beforeEach` MUST take snapshot BEFORE any `setStorageAt` funding.

---

### `tests/integration/ui/smoke.spec.ts` + `marketBuy.spec.ts` + `marketSell.spec.ts` + `limitDeploy.spec.ts` (test specs)

**Analog:** `tests/integration/marketOrder/anvil-fork.test.ts`

**Pattern: BASE_RPC_URL skip-gate** (`anvil-fork.test.ts` lines 17-18):
```typescript
// Skip the whole suite when BASE_RPC_URL is absent (local dev without the
// secret) — the helper would throw immediately and the suite would fail.
// CI provisions BASE_RPC_URL via the test-integration job (Plan 04-07).
const hasRpc = Boolean(process.env.BASE_RPC_URL);
const describeAnvil = hasRpc ? describe : describe.skip;
```
**Apply to all UI specs:** Use Playwright equivalent — `test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required')` at top of each spec file (or hoist into `fixtures.ts` `beforeAll`). Same skip-grammar so local dev without the secret doesn't fail.

**Pattern: smoke-floor + skipped-deeper TODOs** (`anvil-fork.test.ts` lines 31-67):
```typescript
it('reads orderbook state at the forked block (smoke)', async () => {
    const blockNumber = await publicClient.getBlockNumber();
    expect(blockNumber).toBeGreaterThanOrEqual(BigInt(FORK_BLOCK));
});

it.skip('executes aggregated path against on-chain orderbook (TODO)', async () => {
    // ...documented TODO...
    expect(true).toBe(true);
});
```
**Apply to smoke.spec.ts:** Single happy-path test that exercises full stack (anvil up → preview up → stub injected → wallet connects → testid clicks → on-chain receipt). Use `test.fixme()` or `test.skip()` for TODO branches with the same inline-comment-explains-why grammar.

**Pattern: per-suite `beforeAll` startup with timeout extension** (`anvil-fork.test.ts` lines 23-29):
```typescript
beforeAll(async () => {
    publicClient = await startAnvilFork(FORK_BLOCK);
}, 60_000);

afterAll(async () => {
    await stopAnvilFork();
});
```
**Note:** In Playwright, `globalSetup` replaces this — but per-spec `test.beforeEach` MUST take a fresh snapshot (D-02 snapshot-per-test). See fixtures.ts pattern.

---

### `tests/integration/ui/marketFailures.spec.ts` (test — 5 failure modes)

**Analog:** `tests/integration/marketOrder/replay-fallback-no-liquidity.test.ts`

**Pattern: failure-mode classification assertion** (lines 50-68):
```typescript
it('classifies empty quote payload as no_quotes_available', async () => {
    const transcript = loadTranscript('fallback-no-liquidity');
    expect(transcript.fullQuotePayload).toEqual([]);

    const result = await executeMarketOrder({ /* args */ });

    expect(result.success).toBe(false);
    const reasons = mockCaptureTakeOrderFailure.mock.calls.map((c) => c[2]);
    expect(reasons).toContain('no_quotes_available');
});
```
**Apply to marketFailures.spec.ts:** SAME assertion grammar but UI-driven — instead of inspecting `mockCaptureTakeOrderFailure` calls, assert `[data-testid="error-banner"][data-error-class="<class>"]` is visible. The 5 cases mirror the 5 failure-mode rows in RESEARCH §"Failure-Mode Forcing Recipes". Each `test()` block: setup forcing-mechanism → click submit → assert error-banner with right `data-error-class`.

**Critical:** D-11 forbids importing `executeMarketOrder` / `marketOrderExecution`. UI specs must NOT replicate the analog's `vi.mock(...)` block — drive everything through rendered UI.

---

### `tests/helpers/eip1193Stub.ts` (browser-injected utility)

**Analog:** None direct. Closest is `tests/helpers/anvil.ts` `waitForRpc` — a JSON-RPC POST template.

**Pattern: JSON-RPC fetch shape** (lines 11-19, reusable as the stub's `rawRpc` body):
```typescript
const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: []
    })
});
```
**Apply:** Stub's in-browser `rawRpc(method, params)` uses the identical fetch shape. Whole stub source is exported as a `string` (template literal) per Pattern 2 in RESEARCH lines 270-332 — not as importable TypeScript, because `addInitScript` evaluates the source in browser context.

**Critical**: stub MUST proxy `eth_sign` / `eth_sendTransaction` / `eth_signTypedData_v4` directly to anvil — anvil's pre-funded accounts are unlocked. Do NOT bundle secp256k1 in the browser.

---

### `tests/helpers/anvilControl.ts` (test utility)

**Analog:** `tests/helpers/anvil.ts`

**Pattern: viem client factory** (lines 67-71):
```typescript
return createPublicClient({
    chain: base,
    transport: http('http://127.0.0.1:8545')
});
```
**Apply:** Same factory shape but `createTestClient({ chain: base, mode: 'anvil', transport: http('http://127.0.0.1:8545') })`. Export wrapper helpers `withSnapshot`, `fundErc20`, `advanceTime` per RESEARCH Pattern 3.

---

### `tests/helpers/previewServer.ts` (process utility)

**Analog:** `tests/helpers/anvil.ts` (entire spawn-and-ready-probe pattern)

**Pattern to copy:** Same module-level singleton handle (`let previewProc: ChildProcess | null = null;`), same `spawn(...args, { stdio: 'pipe' })` + `.on('exit', ...)` + `await waitForUrl(...)` + `stop` with SIGTERM + 200ms grace.

**Reuse:** Move `waitForRpc` to a generic `waitForHttp(url, predicate, timeoutMs)` shared by both — OR duplicate the loop with a different predicate (preview returns 200 on `/`). RESEARCH §"Recommended Project Structure" lists `previewServer.ts` separately from `anvilControl.ts` — keep them separate; the coupling is light.

---

### `src/lib/components/orders/MarketOrder.svelte` (modification — testid retrofit)

**Analog:** `src/lib/components/TransactionModal.svelte`

**Pattern: data-testid attribute placement** (excerpts):
```svelte
data-testid="error-icon"
data-testid="error-status"
data-testid="error-message"
data-testid="success-icon"
data-testid="success-status"
data-testid="success-message"
data-testid="raindex-link"
data-testid="multi-tx-icon"
data-testid="multi-tx-title"
data-testid="multi-tx-message"
data-testid="spinner"
data-testid="pending-message"
data-testid="multi-tx-progress"
```
(`TransactionModal.svelte` lines 75, 123, 132, 162, 179, 183, 193, 332, 348, 351, 364, 368, 372)

**Pattern: state-machine testids on shells** (`WalletConnect.svelte` lines 25, 30):
```svelte
<div class="flex items-center gap-1.5" data-testid="not-connected">
<div class="flex items-center gap-1.5" data-testid="connected">
```

**Pattern: forwarded testid on reusable UI** (`Button.svelte` line 29, `Input.svelte` lines 67, 71, `Select.svelte` line 19, `TxLink.svelte` line 31):
```svelte
data-testid={dataTestId}
```
Reusable components forward a `dataTestId` prop. Per D-10, retrofit only top-level interactive shells in MarketOrder/LimitOrder; if existing `<Button>` / `<Input>` instances need testids, pass via the `dataTestId` prop (already wired).

**Apply to MarketOrder.svelte (D-09 compound grammar):**
```svelte
<form data-testid="market-form" data-mode="market" data-side={side}>
  <button data-testid="side-toggle" data-side="buy">Buy</button>
  <button data-testid="side-toggle" data-side="sell">Sell</button>
  <Input dataTestId="spend-input" ... />
  <Input dataTestId="asset-input" ... />
  <Input dataTestId="slippage-input" ... />
  <Button dataTestId="trade-submit" data-side={side} data-mode="market">Submit</Button>
  {#if errorClass}
    <div data-testid="error-banner" data-error-class={errorClass}>...</div>
  {/if}
  {#if successState}
    <div data-testid="success-toast">...</div>
  {/if}
</form>
```
Note: `Button.svelte` line 29 only forwards `data-testid` — D-09 requires also `data-side` and `data-mode` on the submit button. Either extend Button to forward arbitrary `data-*` (svelte `$$restProps`) or wrap the Button in a `<div data-side data-mode>` shell.

---

### `src/lib/components/orders/LimitOrder.svelte` (modification)

**Analog:** Same as MarketOrder — `TransactionModal.svelte` for shell testids. Identical D-09 grammar with `data-mode="limit"`.

**Critical (per RESEARCH Pitfall 4):** LimitOrder is dynamically imported. Add `data-testid="limit-form-loaded"` on the post-skeleton root element so Playwright can `waitFor` past the chunk-load.

---

### `src/routes/(main)/trade/[id]/+page.svelte` (modification)

**Analog:** `src/lib/components/WalletConnect.svelte` (state-machine testids)

**Pattern:** Mode tabs become:
```svelte
<button data-testid="mode-tab" data-mode="market" class:active={mode==='market'}>Market</button>
<button data-testid="mode-tab" data-mode="limit"  class:active={mode==='limit'}>Limit</button>
<button data-testid="mode-tab" data-mode="dca"    class:active={mode==='dca'}>DCA</button>
```
Plus `data-testid="market-form-loaded"` / `limit-form-loaded` anchors on the rendered shells (Pitfall 4). Wallet-connect shell already has testids in `WalletConnect.svelte` — do not duplicate.

---

### `src/hooks.server.ts` (modification — E2E CSP gate)

**Analog (within same file):** `src/hooks.server.ts` line 196 — the existing `dev`-gated CSP branch.

**Pattern: env-gated directive append** (line 196):
```typescript
// Only upgrade insecure requests in production (breaks localhost dev)
...(dev ? [] : ['upgrade-insecure-requests'])
```
**Apply to E2E gate (around line 186, where connect-src is built):**
```typescript
const isE2E = process.env.E2E === '1';
const connectSrcExtras = isE2E ? ' http://127.0.0.1:8545' : '';
// then append connectSrcExtras to the connect-src string at line 186
```
Use the same comment-explains-why grammar as line 195. Add an inline comment citing `01-RUNBOOK.md` and warning that `E2E=1` must NEVER ship to production.

---

### `eslint.config.js` (modification — D-11 import ban)

**Analog:** `eslint.config.js` lines 68-95 (existing scoped block with `files`, `ignores`, `rules`)

**Pattern: scoped block with files glob + rule** (lines 68-95):
```javascript
{
    files: ['src/**/*.ts', 'src/**/*.svelte', 'tests/**/*.ts'],
    ignores: [
        'src/lib/types/orderPerspective.ts',
        // ...
    ],
    rules: {
        'no-restricted-syntax': [
            'error',
            {
                selector: "MemberExpression[property.name=/.../]",
                message: '...DRIFT-01... Per-callsite escape: // eslint-disable-next-line no-restricted-syntax -- justification: ...'
            }
        ]
    }
}
```
**Apply:** Append a NEW scoped block (do NOT merge into the existing one — note the comment lines 36-44 explicitly warns "ESLint flat config does NOT merge same-named rule entries across blocks"). Use `no-restricted-imports` (different rule name; safe to coexist):
```javascript
{
    files: ['tests/integration/ui/**/*.{ts,js}'],
    rules: {
        'no-restricted-imports': ['error', {
            patterns: [{
                group: [
                    '$lib/services/marketOrderExecution',
                    '$lib/stores/transaction',
                    '$lib/services/orderDeployment',
                    '$lib/services/walletService',
                    '$lib/types/orderPerspective'
                ],
                message: 'UI E2E tests must NOT import internal-logic modules. Drive through the rendered UI (data-testid selectors). See .planning/codebase/TESTING.md §"UI Test Selectors".'
            }]
        }]
    }
}
```
Match the analog's verbose-message style (rationale + escape hatch reference).

---

### `.github/workflows/test.yml` (modification — add test-e2e job + foundry action)

**Analog:** `.github/workflows/test.yml` `test-integration` job (lines 29-74)

**Pattern: integration-job shape** (lines 29-74):
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
      - name: Cache Foundry installation
        uses: actions/cache@v4
        with:
          path: ~/.foundry
          key: foundry-${{ runner.os }}-v1
          restore-keys: |
            foundry-${{ runner.os }}-
      - name: Install Foundry (anvil)
        run: |
          if [ ! -x "$HOME/.foundry/bin/anvil" ]; then
            curl -L https://foundry.paradigm.xyz | bash
            "$HOME/.foundry/bin/foundryup"
          fi
          echo "$HOME/.foundry/bin" >> $GITHUB_PATH
      - name: Verify anvil
        run: anvil --version
      - run: nix develop -c npm i
      - name: Run integration tests
        run: nix develop -c npm run test:integration
        env:
          BASE_RPC_URL: ${{ secrets.BASE_RPC_URL }}
          # ...
```

**Apply (two changes — D-14 + 999.8):**

1. **Replace the cache + custom-install steps** (lines 43-62) with `foundry-rs/foundry-toolchain@v1` in BOTH `test-integration` (existing) and the new `test-e2e` job:
```yaml
- uses: foundry-rs/foundry-toolchain@v1
  with:
    version: stable
```

2. **Add `test-e2e` job** as a near-clone of `test-integration` with these deltas:
   - Additional cache step for Playwright browsers: `actions/cache@v4` with `path: ~/.cache/ms-playwright`, `key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}`
   - `npx playwright install --with-deps chromium` after `npm i`
   - `run: nix develop -c npm run test:e2e` instead of `test:integration`
   - Same `env:` block (BASE_RPC_URL + secrets)

**Smoke-fast-fail (per D-14):** First Playwright invocation runs ONLY `smoke.spec.ts`, then a second runs the full suite. Two-step CI surfaces misconfig in <2 min.

---

### `package.json` (modification — script + devDep)

**Analog:** Existing `test:integration` script (line 15):
```json
"test:integration": "vitest --config vite.config.integration.js --passWithNoTests run",
```
**Apply:** Add adjacent line:
```json
"test:e2e": "playwright test"
```
And `@playwright/test` in `devDependencies` (pinned to the version returned by `npm view @playwright/test version` at install time).

---

## Shared Patterns

### Pattern: BASE_RPC_URL guard
**Source:** `tests/helpers/anvil.ts` lines 40-42 + `tests/integration/marketOrder/anvil-fork.test.ts` lines 17-18
**Apply to:** all `tests/integration/ui/*.spec.ts`, `globalSetup.ts`
**Excerpt:**
```typescript
const hasRpc = Boolean(process.env.BASE_RPC_URL);
const describeAnvil = hasRpc ? describe : describe.skip;
```
Playwright equivalent: `test.skip(!process.env.BASE_RPC_URL, 'BASE_RPC_URL required')`.

### Pattern: spawn child + ready-probe + SIGTERM teardown
**Source:** `tests/helpers/anvil.ts` lines 7-80 (entire file)
**Apply to:** `previewServer.ts`, `globalSetup.ts`, `globalTeardown.ts`
**Why:** Already battle-tested for one process; identical shape for the second (vite preview).

### Pattern: viem client factory pointed at 127.0.0.1:8545
**Source:** `tests/helpers/anvil.ts` lines 68-71
**Apply to:** `anvilControl.ts` (`createTestClient`), inside spec files (`createPublicClient` for on-chain assertions)
**Excerpt:**
```typescript
return createPublicClient({
    chain: base,
    transport: http('http://127.0.0.1:8545')
});
```

### Pattern: env-gated CSP/security directive append
**Source:** `src/hooks.server.ts` line 196 (`dev`-gated `upgrade-insecure-requests`)
**Apply to:** the new `E2E=1`-gated `connect-src` extension (Discretion #5)

### Pattern: scoped ESLint config block with verbose violation message
**Source:** `eslint.config.js` lines 68-95 (TRADE-01 + DRIFT-01 block, especially the multi-line message string)
**Apply to:** new `no-restricted-imports` block for D-11

### Pattern: data-testid attribute on interactive shells (NOT inner decorations)
**Source:** `src/lib/components/TransactionModal.svelte` (13 testids on outcome states, NOT on icon SVGs except where the icon IS the interactive surface)
**Apply to:** MarketOrder, LimitOrder, +page.svelte retrofit (D-10 scope)

### Pattern: forwarded `dataTestId` prop on reusable UI primitives
**Source:** `src/lib/components/ui/Button.svelte` line 29, `Input.svelte` lines 67, 71, `Select.svelte` line 19, `TxLink.svelte` line 31
**Apply:** When a testid is needed on a reusable-UI instance inside MarketOrder/LimitOrder, pass via existing prop — don't add raw HTML attributes.

### Pattern: CI job preamble (checkout + Nix + flakehub-cache + npm i)
**Source:** `.github/workflows/test.yml` lines 30-41 (and lines 7-19 for the unit-test job)
**Apply:** new `test-e2e` job uses identical preamble.

### Pattern: vi-hoisted mocks for executeMarketOrder + ProcessedQuote builders
**Source:** `tests/integration/marketOrder/_replay-helpers.ts` + `replay-fallback-no-liquidity.test.ts` lines 5-31
**DO NOT APPLY to UI specs** — D-11 explicitly forbids importing `executeMarketOrder`. This pattern stays in service-integration tests; UI specs use Playwright fixtures instead. Listed here as a deliberate non-application so the planner doesn't accidentally copy it.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| `tests/helpers/eip1193Stub.ts` | utility (browser-injected) | RPC proxy | No prior browser-injection / EIP-1193 stub work in repo. Closest is the JSON-RPC fetch shape from `anvil.ts`. | RESEARCH §"Pattern 2" lines 270-332 (full stub source template) |
| `playwright.config.ts` (Playwright-specific API surface) | config | n/a | Repo has no prior Playwright config. `vite.config.integration.js` gives shape but not API. | RESEARCH §"Recommended Project Structure" line 218 + Playwright docs (cited) |
| `tests/integration/ui/fixtures.ts` (Playwright `test.extend` API) | test utility | n/a | Repo uses Vitest exclusively; no `test.extend` precedent. | RESEARCH §"Architecture Patterns" diagram + Playwright docs |
| `.planning/phases/.../01-RUNBOOK.md` | doc | n/a | No prior runbook in repo. | RESEARCH §"Discretion #2 / #4" + §"Open Questions" (Plan 1 first-task items become runbook seed) |

---

## Metadata

**Analog search scope:**
- `tests/helpers/`, `tests/integration/`, `tests/lib/` (test patterns)
- `src/lib/components/`, `src/lib/components/ui/`, `src/lib/components/orders/`, `src/routes/(main)/trade/` (data-testid usage)
- `src/hooks.server.ts` (CSP construction + env-gated branches)
- `eslint.config.js`, `.eslintrc.cjs` (custom rule patterns)
- `.github/workflows/test.yml` (CI shape)
- `vite.config.js`, `vite.config.integration.js` (config-file shape)
- `package.json` (script grammar)

**Files scanned (analogs read in full or in focused excerpts):** 11
- `tests/helpers/anvil.ts` (full)
- `tests/integration/marketOrder/anvil-fork.test.ts` (full)
- `tests/integration/marketOrder/replay-fallback-no-liquidity.test.ts` (full)
- `tests/integration/marketOrder/_replay-helpers.ts` (full)
- `vite.config.integration.js` (full)
- `eslint.config.js` (full)
- `.github/workflows/test.yml` (full)
- `src/hooks.server.ts` (lines 170-205 — CSP block)
- `src/lib/components/TransactionModal.svelte` (testid grep)
- `src/lib/components/WalletConnect.svelte` (testid grep)
- `src/lib/components/ui/{Button,Input,Select,TxLink}.svelte` (testid grep)

**Pattern extraction date:** 2026-05-06
