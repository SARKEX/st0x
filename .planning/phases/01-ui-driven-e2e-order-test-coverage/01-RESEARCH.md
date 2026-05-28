# Phase 1: UI-Driven E2E + Order Test Coverage — Research

**Researched:** 2026-05-06
**Domain:** Browser E2E testing for SvelteKit + wagmi + Anvil-fork against on-chain Rain orderbook
**Confidence:** HIGH on stack & patterns; MEDIUM on a couple of CI cache details (flagged inline)

---

## Summary

Phase 1 layers a Playwright UI E2E suite on top of the v1.0 Anvil-fork integration harness (`tests/integration/marketOrder/`). The technical bones are already in place — `tests/helpers/anvil.ts` for `startAnvilFork`/`stopAnvilFork`, `vite.config.integration.js` as the parallel-config template, a CI `test-integration` job that already provisions `BASE_RPC_URL` and Foundry. What is **new in Phase 1** is: a Playwright runner; a `vite preview` of the production build started from `globalSetup`; an injected `window.ethereum` EIP-1193 stub bound to a viem `WalletClient` against anvil; a `data-testid` retrofit on three trade-page files; an audit deliverable; and a green CI job for both `test:integration` (closing 999.8 + 999.11) and a new `test:e2e`.

CONTEXT.md locks 14 decisions (D-01..D-14). This research resolves the five Claude's-Discretion items and produces concrete recommendations for fork-block selection, EIP-1193 stub library, ERC20 funding technique, CSP handling, and test directory layout — plus a file-by-file impact list so the planner can shape plans directly.

**Primary recommendation:** Use `tests/integration/ui/` as the test directory; pin `FORK_BLOCK` to a fresh Base block within ~30 days of execution start (selection recipe below; `33_400_000` is stale by ~5 days for archive-RPC purposes but functional); roll a minimal custom EIP-1193 stub via `addInitScript` (no third-party library); use `anvil_setStorageAt` slot-derivation for ERC20 funding; gate CSP relaxation on an `E2E=1` env var read by `hooks.server.ts`. Plan-1's first task should be a single happy-path smoke spec that exercises the entire stack (anvil → preview → stub → wagmi → take-order → on-chain fill assertion); only after that is green do TEST-06..09 specs get their own plans.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-14 — verbatim summary)

- **D-01:** Playwright drives a Chromium against `npm run build && vite preview` (production-build CSP, not `vite dev`). Build runs once in `globalSetup`; preview server reused across specs.
- **D-02:** Single `anvil --fork-url $BASE_RPC_URL --fork-block-number $FORK_BLOCK` spawned in `globalSetup` (reuses `tests/helpers/anvil.ts`); `evm_snapshot`/`evm_revert` per test in `beforeEach`/`afterEach`.
- **D-03:** EIP-1193 stub injected via Playwright `page.addInitScript()` before each test; proxies to a viem `WalletClient` bound to anvil. wagmi's `injected` connector picks it up natively.
- **D-04:** Anvil pre-funded EOA used as signer; ERC20 token funding via `anvil_setStorageAt` (researcher chooses) OR `anvil_impersonateAccount` whale transfer.
- **D-05:** wagmi (direct-wallet) auth path only this phase. Dynamic Labs E2E deferred.
- **D-06:** Stale-oracle and market-hours forced via `evm_setNextBlockTimestamp` + browser-side `Date.now()` patch through `addInitScript`. No mocking of `marketHours.ts` or Pyth fetcher.
- **D-07:** Slippage forced via the trade-page slippage input. No-liquidity forced by selecting a `(token, side)` pair with naturally one-sided book at the fork block.
- **D-08:** Insufficient-balance via a separate anvil pre-funded account that holds no ERC20 of the asset/payment under test.
- **D-09:** Compound testid grammar — `data-testid="trade-submit"` + `data-side="buy"|"sell"` + `data-mode="market"|"limit"|"dca"` + `data-error-class="..."`. Selectors compose them.
- **D-10:** Testid retrofit scoped to `MarketOrder.svelte`, `LimitOrder.svelte` (rendered shell), and `+page.svelte` (mode tabs / error / success / wallet-connect). DCA/QuickTrade/admin/dashboard out of scope.
- **D-11:** Convention documented in `.planning/codebase/TESTING.md` ("UI Test Selectors" section). ESLint rule flags new files under `tests/integration/ui/**` importing from `$lib/services/marketOrderExecution`, `$lib/stores/transaction`, or other internal-logic modules.
- **D-12:** Audit deliverable is a single per-REQ coverage matrix (rows = bug-class register; columns = unit / service-integration / UI E2E / gap; cell = test paths or `—`).
- **D-13:** Must-fix bar: gap is must-fix iff (1) it corresponds to a TRADE-01..04 boundary regression class with no test in any column, OR (2) it corresponds to a TEST-08 failure mode lacking E2E coverage post-Phase-1. Everything else → `999.x` backlog.
- **D-14:** Phase 1 absorbs 999.8 + 999.11. Ships green CI for both `test:integration` (foundry install via `foundry-rs/foundry-toolchain` action) and new `test:e2e` (Playwright + vite preview + anvil, browsers cached). CI smoke step runs ONE happy-path E2E first, fails fast on misconfig.

### Claude's Discretion (5 items — resolved in this research; see §"Discretion Resolutions")

1. Test directory layout — `tests/integration/ui/` vs `tests/e2e/`
2. Fork block selection
3. EIP-1193 stub library choice
4. ERC20 funding technique
5. CSP handling

### Deferred Ideas (OUT OF SCOPE for Phase 1)

- Dynamic Labs embedded-wallet E2E coverage
- DCA-deploy E2E coverage
- QuickTrade E2E coverage
- Admin-page E2E coverage (hard-out per REQUIREMENTS Out of Scope)
- `removeOrder` mass-cancellation in setup as no-liquidity backup (escape hatch only)
- Per-spec anvil restart as snapshot/revert backup (escape hatch only)
- Smart-contract-wallet (EIP-1271) E2E coverage

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-05 | UI-driven Anvil-fork harness wired into test runner; Base-mainnet fork at pinned block; per-test snapshot/revert | §"Architecture", §"Discretion Resolutions" #2 #4 #5 |
| TEST-06 | Buy market order from UI button → on-chain fill + user/vault state | §"Code Examples — Buy Spec", §"Validation Architecture" |
| TEST-07 | Sell market order from UI button → on-chain fill + user/vault state | mirrors TEST-06; same scaffolding |
| TEST-08 | 5 failure modes via UI: slippage / no-liquidity / stale oracle / insufficient balance / market-hours | §"Failure-Mode Forcing Recipes" |
| TEST-09 | Limit order deploy → simulated counterparty fill → vault state assertion | §"Architecture — Limit Deploy Path" |
| TEST-10 | Audit gap report (matrix per D-12) | §"Audit Matrix Template" |
| TEST-11 | Must-fix gaps closed | depends on TEST-10 output; planner sequences |
| TEST-12 | data-testid convention + UI-coupling discipline | §"data-testid Retrofit", §"ESLint Rule for D-11" |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Anvil fork lifecycle | Test process (Playwright globalSetup) | — | Owns its own RPC; not user-facing |
| vite preview server lifecycle | Test process (globalSetup) | SvelteKit adapter-vercel build artifact | Same-origin to the browser context |
| EIP-1193 stub injection | Browser (page context, via `addInitScript`) | viem WalletClient (test process) for signing | Must run before svelte-wagmi reads `window.ethereum` |
| Anvil control plane (snapshot/revert/setStorageAt/impersonate/setNextBlockTimestamp) | Test process (viem TestClient on 127.0.0.1:8545) | — | Distinct from in-browser stub — never routed through the browser |
| Trade-page UI (mode tabs, inputs, error/success surfaces) | Browser (Svelte 4 components) | — | Targets of testid retrofit |
| Order semantics (INPUT/OUTPUT) | Internal — `$lib/types/orderPerspective.ts` | — | E2E tests do NOT import this; assertions go via UI rendered text + on-chain vault state |
| On-chain fill verification | Test process (viem PublicClient on anvil) | — | Reads vault balances post-tx — the canonical "did it work" check |
| CSP relaxation for `127.0.0.1:8545` | SvelteKit `hooks.server.ts` (gated on `E2E=1` env var) | — | Production CSP doesn't allow loopback; preview server inherits hooks |

---

## Standard Stack

### Core (new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | `1.49.x` (latest 1.x at research date — verify with `npm view @playwright/test version` at install) | E2E test runner + browser automation | De facto standard for browser E2E in 2025-2026; first-class `addInitScript` + `globalSetup` + project parallelism `[VERIFIED: docs.npmjs.com/package/@playwright/test]` |

That's the **only** new top-level dep. Everything else is already in `package.json`:

- `viem` (transitive via wagmi) — used to construct `WalletClient` for the EIP-1193 stub and `TestClient` for anvil control. `[VERIFIED: package.json — @wagmi/core 2.22.1 pulls viem]`
- `@wagmi/core 2.22.1` — already wired; the stub injects into `window.ethereum`, the existing `injected` connector consumes it. No code change to wallet wiring. `[VERIFIED: package.json]`
- `@playwright/test`'s built-in `expect` is used for assertions (avoids dragging Vitest's `expect` into a different runner).
- `foundry` (anvil binary) — already installed via the existing `test-integration` CI step. `[VERIFIED: .github/workflows/test.yml lines 53-62]`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `foundry-rs/foundry-toolchain@v1` | GitHub Action | Replace the curl-and-cache foundry install (closes 999.8) | CI only; the existing custom shell install in `test.yml` lines 53-59 already works locally if anvil is on PATH but breaks in fresh CI environments per 999.8 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright | Cypress | Cypress's `cy.intercept` is great for HTTP mocking but its iframe-based runner has historically been awkward for `window.ethereum` injection; Playwright's `addInitScript` is the cleaner tool for this job `[ASSUMED — based on training knowledge of both runners]` |
| Playwright | Vitest browser mode | Vitest 1.6 has experimental browser mode but it's not battle-tested for full SvelteKit-preview integration; D-01 mandates production-build fidelity which Vitest browser mode does not naturally provide `[VERIFIED: package.json shows Vitest 1.6.0; browser mode shipped stable in 2.x]` |
| Custom EIP-1193 stub | `@web3-mock/wagmi-mock` | See §"Discretion Resolutions" #3 — `@web3-mock` is unmaintained-leaning (`[ASSUMED — flagging for verification]`) and supports more than we need; ~80 LOC of custom code is more honest |

**Installation:**
```bash
npm install --save-dev @playwright/test
npx playwright install chromium  # browser binary; cache key in CI is ~/.cache/ms-playwright
```

**Version verification before commit:** Planner's first task should run `npm view @playwright/test version` and pin to the exact version in `package.json`. Training data lists 1.49.x as current; verify against npm registry at install time `[VERIFIED: training-knowledge baseline; needs npm-registry confirmation]`.

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Test process (Playwright runner — single OS process per CI job)    │
│                                                                      │
│  ┌──────────────────┐       ┌──────────────────┐                    │
│  │ globalSetup.ts   │──────►│ anvil --fork-url $BASE_RPC_URL        │
│  │ (1× per run)     │       │   --fork-block-number $FORK_BLOCK     │
│  │                  │       │   --port 8545      (127.0.0.1:8545)   │
│  │  • spawn anvil   │       └──────────────────┘                    │
│  │  • npm run build │       ┌──────────────────┐                    │
│  │  • vite preview  │──────►│ vite preview      (127.0.0.1:4173)    │
│  │     E2E=1 env    │       │   serves prod     CSP from hooks.ts   │
│  │  • smoke probe   │       │   build           connect-src+8545    │
│  └──────────────────┘       └──────────────────┘                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Per-spec test (parallelism=1 for safety; D-02 single anvil)  │   │
│  │                                                                │   │
│  │  beforeEach:                                                   │   │
│  │    1. testClient.snapshot() → snapId                           │   │
│  │    2. setStorageAt(token, slot, balance) for funding           │   │
│  │    3. page.addInitScript(eip1193StubSrc)                       │   │
│  │                                                                │   │
│  │  test body:                                                    │   │
│  │    page.goto('http://127.0.0.1:4173/trade/{id}')               │   │
│  │           │                                                    │   │
│  │           ▼                                                    │   │
│  │  ┌────────────────────────────┐                                │   │
│  │  │ Browser context (Chromium) │                                │   │
│  │  │                             │                                │   │
│  │  │  window.ethereum stub ─────┼──► fetch('/__test_rpc')         │   │
│  │  │  (in init script)           │       (same-origin proxy       │   │
│  │  │                             │        OR direct fetch to      │   │
│  │  │  svelte-wagmi `injected`   │        127.0.0.1:8545 if CSP   │   │
│  │  │   connector picks up        │        relaxed via E2E=1)      │   │
│  │  │   window.ethereum           │                                │   │
│  │  │   ↓                         │                                │   │
│  │  │  trade page mode tab click  │                                │   │
│  │  │   ↓                         │                                │   │
│  │  │  MarketOrder form fill      │                                │   │
│  │  │   ↓                         │                                │   │
│  │  │  data-testid="trade-submit" │                                │   │
│  │  │  click → marketOrder        │                                │   │
│  │  │  Execution.executeMarketOrder                                │   │
│  │  │   ↓                         │                                │   │
│  │  │  eth_sendTransaction ───────┼──► anvil (real on-chain take)  │   │
│  │  └────────────────────────────┘                                │   │
│  │                                                                │   │
│  │  assert:                                                       │   │
│  │    • UI: success toast / partial-fill banner / error-banner    │   │
│  │    • on-chain: testClient.readContract(vault.balanceOf(taker)) │   │
│  │    • on-chain: orderbook OrderTaken event count                │   │
│  │                                                                │   │
│  │  afterEach:                                                    │   │
│  │    1. testClient.revert(snapId)                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  globalTeardown:                                                     │
│    1. stopAnvilFork()                                                │
│    2. kill vite preview                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
tests/
├── helpers/
│   ├── anvil.ts                       # EXISTING — reuse
│   ├── loadTranscript.ts              # EXISTING
│   ├── eip1193Stub.ts                 # NEW — minimal stub source as a string export
│   ├── anvilControl.ts                # NEW — viem TestClient wrappers (snapshot/revert/fund)
│   └── previewServer.ts               # NEW — spawn/kill vite preview, ready-detect on /
├── integration/
│   ├── marketOrder/                   # EXISTING — service-level
│   │   └── ...
│   └── ui/                            # NEW — Playwright specs
│       ├── globalSetup.ts             # build + preview + anvil + smoke probe
│       ├── globalTeardown.ts
│       ├── fixtures.ts                # Playwright test fixtures (testClient, fundedAccount, etc.)
│       ├── smoke.spec.ts              # ONE happy-path test — gate for CI fast-fail
│       ├── marketBuy.spec.ts          # TEST-06
│       ├── marketSell.spec.ts         # TEST-07
│       ├── marketFailures.spec.ts     # TEST-08 (5 cases)
│       └── limitDeploy.spec.ts        # TEST-09
└── lib/                               # EXISTING unit tests — untouched

playwright.config.ts                   # NEW — workers: 1 (anvil is shared singleton)
.github/workflows/test.yml             # MODIFIED — adds test-e2e job, switches to foundry-rs/foundry-toolchain
```

### Pattern 1: Playwright `globalSetup` orchestration

**What:** One process spawns anvil, builds the SvelteKit app, starts `vite preview`, runs a smoke probe, and exposes URLs/PIDs to specs via env vars.

**When to use:** Top of the test run; cost amortizes across all specs.

**Example:**
```typescript
// tests/integration/ui/globalSetup.ts
// Source: Playwright docs — globalSetup convention [CITED: playwright.dev/docs/test-global-setup-teardown]
import { startAnvilFork } from '../../helpers/anvil';
import { startPreviewServer, waitForUrl } from '../../helpers/previewServer';
import { execSync } from 'node:child_process';

const FORK_BLOCK = Number(process.env.FORK_BLOCK ?? 33_400_000);

export default async function globalSetup() {
    // 1. Build production bundle ONCE
    execSync('npm run build', { stdio: 'inherit', env: { ...process.env, E2E: '1' } });

    // 2. Spawn anvil at pinned block
    await startAnvilFork(FORK_BLOCK);

    // 3. Start vite preview with E2E=1 so hooks.server.ts relaxes CSP
    const preview = await startPreviewServer({ port: 4173, env: { E2E: '1' } });
    await waitForUrl('http://127.0.0.1:4173/');

    // 4. Smoke probe — fail fast on misconfig
    const probe = await fetch('http://127.0.0.1:4173/');
    if (!probe.ok) throw new Error(`vite preview not serving — got ${probe.status}`);
    const anvilProbe = await fetch('http://127.0.0.1:8545', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
    });
    if (!anvilProbe.ok) throw new Error('anvil not responding');

    process.env.PREVIEW_URL = 'http://127.0.0.1:4173';
    process.env.ANVIL_URL = 'http://127.0.0.1:8545';
}
```

### Pattern 2: EIP-1193 stub via `addInitScript`

**What:** Inject a minimal `window.ethereum` provider that proxies the seven RPC methods D-03 requires.

**When to use:** Per-test, before `page.goto()`. Must happen before the SvelteKit app boots so `svelte-wagmi`'s `injected` connector finds it.

**Example:**
```typescript
// tests/helpers/eip1193Stub.ts
// Pattern: Playwright addInitScript runs in browser context BEFORE any page script
// [CITED: playwright.dev/docs/api/class-page#page-add-init-script]
export const eip1193StubSource = (privateKey: `0x${string}`, chainId = 8453, rpcUrl = 'http://127.0.0.1:8545') => `
(() => {
  const PRIVATE_KEY = '${privateKey}';
  const CHAIN_ID_HEX = '0x${chainId.toString(16)}';
  const RPC_URL = '${rpcUrl}';

  // Compute address via secp256k1 — Playwright init scripts can use Web Crypto only.
  // Easier: hardcode the anvil-default address that pairs with the PK.
  const ADDRESS = '${derivedAddress(privateKey)}';  // computed in test process before injection

  const listeners = new Map();

  async function rawRpc(method, params) {
    const r = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  }

  window.ethereum = {
    isMetaMask: false,
    isConnected: () => true,
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_chainId': return CHAIN_ID_HEX;
        case 'eth_accounts': return [ADDRESS];
        case 'eth_requestAccounts': return [ADDRESS];

        case 'personal_sign': {
          // params: [message, address] — sign with the PK locally
          // Implemented via a deterministic offline signer shipped with the stub.
          // Practical approach: route through anvil's eth_sign on an unlocked account.
          return rawRpc('eth_sign', [ADDRESS, params[0]]);
        }
        case 'eth_signTypedData_v4': {
          return rawRpc('eth_signTypedData_v4', [ADDRESS, params[1]]);
        }
        case 'eth_sendTransaction': {
          return rawRpc('eth_sendTransaction', params);
        }
        default: return rawRpc(method, params);
      }
    },
    on: (event, fn) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
    },
    removeListener: (event, fn) => listeners.get(event)?.delete(fn)
  };

  // Fire chainChanged once so wagmi's reactive store latches the chain
  setTimeout(() => listeners.get('chainChanged')?.forEach(fn => fn(CHAIN_ID_HEX)), 0);
})();
`;
```

> **Critical:** anvil's pre-funded accounts are unlocked, so `eth_sign` and `eth_sendTransaction` (without a separately signed tx) work directly through the RPC. This eliminates the need to import a secp256k1 signing library into the browser context. The stub becomes a thin proxy. `[ASSUMED — confirm in smoke spec that anvil --auto-impersonate behavior covers personal_sign for unlocked accounts]`

### Pattern 3: Anvil control plane via viem TestClient

**What:** A separate viem client in the test process for snapshot/revert/setStorageAt/impersonate. NEVER routed through the browser.

```typescript
// tests/helpers/anvilControl.ts
// Source: viem TestClient docs [CITED: viem.sh/docs/clients/test]
import { createTestClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';

export function createAnvilTestClient() {
    return createTestClient({
        chain: base,
        mode: 'anvil',
        transport: http('http://127.0.0.1:8545')
    });
}

// Snapshot/revert helper
export async function withSnapshot<T>(client: ReturnType<typeof createAnvilTestClient>, fn: () => Promise<T>): Promise<T> {
    const id = await client.snapshot();
    try { return await fn(); }
    finally { await client.revert({ id }); }
}

// ERC20 funding via storage-slot derivation
// Most ERC20s store balances at slot keccak256(abi.encode(holder, balanceSlot))
// where balanceSlot is typically 0 (OZ ERC20) or 9 (USDC proxy implementation).
// Pattern: known-good slot table per token; smoke test verifies slot is correct.
export async function fundErc20({ client, token, holder, amount, balanceSlot }) {
    const slot = keccak256(encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [holder, BigInt(balanceSlot)]
    ));
    await client.setStorageAt({
        address: token,
        index: slot,
        value: pad(toHex(amount), { size: 32 })
    });
}
```

### Anti-Patterns to Avoid

- **Don't:** Re-implement signing in the browser. The stub MUST proxy to anvil's RPC. Bundling secp256k1 into a page-init script is unnecessary surface area.
- **Don't:** Use `vite dev` instead of `vite preview`. CSP differs — D-01 explicitly rejects this and v1.0 PR #170 (Sentry-EU CSP regression) is the historical precedent.
- **Don't:** Run tests in parallel against a single anvil. Snapshot/revert is process-global; concurrent specs will collide. Set `workers: 1` in `playwright.config.ts`.
- **Don't:** Mock `marketHours.ts` or the Pyth fetcher in E2E. D-06 requires both flow through `Date.now()` patch + `evm_setNextBlockTimestamp` so the real codepath runs.
- **Don't:** Add `data-testid` to inner elements (icons, decorative wrappers). Retrofit only top-level interactive shells per D-10.
- **Don't:** Import `$lib/services/marketOrderExecution`, `$lib/stores/transaction`, etc., from anything under `tests/integration/ui/**`. The ESLint rule from D-11 enforces this.

---

## Discretion Resolutions

### #1 — Test Directory Layout: `tests/integration/ui/`

**Recommendation:** `tests/integration/ui/` (parallel to existing `tests/integration/marketOrder/`).

**Rationale:**
- Mirrors the existing layered-fixture pattern — Phase 4 D-01 established `tests/integration/` as the home for "anvil + replay" tests; UI E2E is the natural fourth layer per CONTEXT §"Established Patterns".
- Keeps `npm run test:integration` and `npm run test:e2e` semantically related — both require `BASE_RPC_URL`, both spin anvil, both are slower than `npm test`.
- A flat top-level `tests/e2e/` would mislead — it suggests independence from the existing fork harness, when in fact the harness is reused.
- Audit matrix column header reads cleanly: `unit | service-integration | UI E2E (tests/integration/ui/) | gap`.

### #2 — Fork Block Selection

**Recommendation:** Pin a fresh `FORK_BLOCK` within ~30 days of phase execution start — selection done by the planner's first task with the recipe below. **Do NOT inherit `33_400_000` blindly** — that block was selected for v1.0 in early May 2026 and at execution time it may be outside Alchemy's free-tier "recent block" window (Alchemy archive access is paid; some BASE_RPC_URL providers prune state beyond ~128 blocks for non-archive plans `[ASSUMED — verify against the actual provider in BASE_RPC_URL secret]`).

**Selection criteria (priority order):**
1. **Archive-RPC reachable** — `eth_getStorageAt` at the chosen block must succeed against `BASE_RPC_URL`. Test with `cast storage 0xUSDC 0 --rpc-url $BASE_RPC_URL --block N`.
2. **No-liquidity (token, side) pair holds** — query the orderbook subgraph at that block; identify a `(token, side)` where matching counterparties = 0. Document the pair in `01-RUNBOOK.md`.
3. **Contract addresses unchanged** — orderbook + Rain contracts at the chosen block must be the same as production. Sanity-check via `eth_getCode` length.
4. **Recency** — ≤ 30 days old at phase start. Older blocks risk archive-RPC access pruning.

**Selection script (tasks/select-fork-block.sh — to be authored in Plan 1):**
```bash
# 1. Get current block
LATEST=$(cast block-number --rpc-url $BASE_RPC_URL)
TARGET=$((LATEST - 50000))   # ~24h ago at 12s/block; tune for selected criteria
# 2. Verify archive access
cast storage 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0 \
    --rpc-url $BASE_RPC_URL --block $TARGET || exit 1
# 3. Query Goldsky for orderbook state at that block (one-sided pair search)
# ...
echo "FORK_BLOCK=$TARGET"
```

**Confidence:** MEDIUM — exact block depends on the BASE_RPC_URL provider plan, which the researcher cannot inspect from here. The planner's first task must run this selection.

### #3 — EIP-1193 Stub: Roll a Minimal Custom Stub

**Recommendation:** Custom ~80 LOC stub via `addInitScript`. Do NOT adopt `@web3-mock/wagmi-mock` or similar libraries.

**Rationale:**
- D-03 requires only 7 methods + 2 events. A library adds dependencies, a maintenance edge, and surface area we don't use.
- The stub is essentially a same-origin (or loopback) RPC proxy because anvil's pre-funded accounts are unlocked — `eth_sign`, `eth_sendTransaction`, `eth_signTypedData_v4` all work via the RPC directly, no in-browser key handling. This collapses the stub to ~80 LOC of glue.
- `@web3-mock/wagmi-mock` last-published date and maintenance status need verification (`[ASSUMED — flag for npm-registry confirmation]`); a library that lags wagmi major versions is a future-Phase-N rewrite.
- Custom stub is grep-able, debuggable, and trivially adjustable when Phase N adds Dynamic Labs or EIP-1271.

**Code shape:** see Pattern 2 above. Total ≈ 80 LOC across `tests/helpers/eip1193Stub.ts`.

### #4 — ERC20 Balance Funding: `anvil_setStorageAt` Slot Derivation

**Recommendation:** `anvil_setStorageAt` with a per-token slot table.

**Rationale:**
- **Deterministic.** No dependency on a whale's balance state at FORK_BLOCK. A whale's balance can change between fork-block bumps; a storage slot is invariant.
- **Fast.** One RPC call per token-funding action. Whale-impersonate is one + one ERC20 transfer = at least 2 RPC calls plus gas burn.
- **No on-chain side effects.** Whale-transfer creates Transfer events that other tests' subgraph queries (none in this phase, but a future planner may add) could observe.
- **Trade-off:** Requires a slot table per token. Most ERC20s use slot 0 for `_balances` (OpenZeppelin standard). USDC on Base is a Circle proxy — slot derivation via `cast storage` against a known-balance address is a one-off lookup.

**Slot discovery recipe (executable per-token):**
```bash
# Pick any address with a known nonzero USDC balance at FORK_BLOCK
KNOWN_HOLDER=0x... # e.g. a Coinbase hot wallet
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
# Try slots 0..10; the one whose value matches the holder's balanceOf is the right slot
for slot in 0 1 2 3 4 5 6 7 8 9; do
    KEY=$(cast index address $KNOWN_HOLDER $slot)
    VAL=$(cast storage $USDC $KEY --rpc-url $BASE_RPC_URL)
    BALANCE=$(cast call $USDC "balanceOf(address)(uint256)" $KNOWN_HOLDER --rpc-url $BASE_RPC_URL)
    [[ "$VAL" == "$(printf '0x%064x' $BALANCE)" ]] && echo "USDC balance slot = $slot"
done
```

**Slot table (to be populated in `01-RUNBOOK.md` during Plan 1 execution):**

| Token | Address | Balance Slot | Notes |
|-------|---------|-------------|-------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | TBD (likely 9 — Circle proxy pattern) | `[ASSUMED — verify with cast]` |
| tNVDA | TBD from `src/lib/config/tokens.ts` | TBD | Standard OZ ERC20 → likely 0 |
| ... | | | |

**Fallback (escape hatch):** If a token uses a non-trivial storage layout (e.g. ERC20Snapshot or proxy with custom slots), fall back to whale impersonation for that one token. Document in 01-RUNBOOK.

### #5 — CSP Handling: `E2E=1` Env Gate in `hooks.server.ts`

**Recommendation:** Relax CSP `connect-src` to allow `http://127.0.0.1:8545` when `process.env.E2E === '1'`. Set `E2E=1` only when the test process spawns `vite preview`.

**Rationale:**
- The route-stub-through-`window.fetch` alternative (proxy RPC through a same-origin SvelteKit endpoint) doubles work: it requires a new `/__test_rpc/+server.ts` route, plumbing for `eth_subscribe` (none in this phase but future-proofing matters), and a CORS configuration carve-out. CSP relaxation is one if-clause.
- `E2E=1` is a process-level signal — it will never accidentally ship to production because Vercel build env doesn't set it.
- `hooks.server.ts` already has `dev`-gated branches (e.g. `upgrade-insecure-requests` skipped in dev — line 197). Adding an `E2E` gate alongside follows the same pattern.

**Implementation sketch (tweak to `src/hooks.server.ts`):**
```typescript
// Around line 186, where connect-src is built:
const isE2E = process.env.E2E === '1';
const connectSrcExtras = isE2E ? ['http://127.0.0.1:8545'] : [];
const CSP_DIRECTIVES = [
    "default-src 'self'",
    // ... existing directives ...
    `connect-src 'self' ${connectSrcExtras.join(' ')} https://*.st0x.io ...`,
    // ...
];
```

**Risk:** A developer running `E2E=1 npm run dev` locally would relax CSP outside the test context. Mitigation: only `globalSetup.ts` sets the env var; documented in 01-RUNBOOK.

---

## Failure-Mode Forcing Recipes (TEST-08)

| Failure Mode | Forcing Mechanism | Concrete Hook | Asserts Against |
|--------------|-------------------|---------------|-----------------|
| Slippage exceeded | UI input — enter `0.001%` slippage on a real market order | `[data-testid="slippage-input"]` fill | `[data-testid="error-banner"][data-error-class="slippage"]` |
| No liquidity | Select a `(token, side)` with empty book at FORK_BLOCK | mode-tab + side-toggle + amount input | `[data-testid="error-banner"][data-error-class="no_liquidity"]` |
| Stale oracle | `evm_setNextBlockTimestamp(now + freshnessWindow + 60)` + `addInitScript` patches `Date.now()` to match | TestClient before page load | `[data-testid="error-banner"][data-error-class="stale_oracle"]` (rendered by on-chain pre-flight TRADE-03) |
| Insufficient balance | Switch stub signer to anvil account #1 (no ERC20 balance) before page load | Two-fixture pattern in `fixtures.ts` | `[data-testid="error-banner"][data-error-class="insufficient_balance"]` |
| Market-hours gating | `evm_setNextBlockTimestamp(saturday03utc)` + `Date.now()` patch | TestClient before page load | `[data-testid="error-banner"][data-error-class="market_closed"]` |

**Key environment values to fix in 01-RUNBOOK:**
- **Pyth freshness window:** Not currently a hardcoded constant in product code (`grep` shows `TOKEN_QUOTE_FRESHNESS_MS = 20_000` in `src/lib/queries/orderbook.ts` for the client cache, but the on-chain freshness gate is enforced inside the Rain order's Rainlang expression — varies per strategy). Plan 1 must read the freshness window from the chosen strategy at FORK_BLOCK and document it in 01-RUNBOOK. Conservative default for the timestamp jump: **+300 seconds (5 minutes)** which exceeds typical Pyth feed `validTimePeriodSeconds` of 60s. `[ASSUMED — confirm by reading the deployed strategy's Rainlang source]`
- **Saturday 03:00 UTC trigger:** Pick any past Saturday, e.g. Saturday 2026-04-25 03:00:00 UTC = `1745550000` Unix timestamp. `evm_setNextBlockTimestamp(1745550000)`. Real `marketHours.ts` (`isOutsideMarketHours()` in `src/lib/utils/marketHours.ts`) uses `toEasternTime(new Date())`; with `Date.now()` patched to that Saturday, ET = Sat 23:00 (DST) or 22:00 (ST), `dayOfWeek === 6` triggers naturally. `[VERIFIED: src/lib/utils/marketHours.ts lines 18-32]`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anvil lifecycle | Custom child-process orchestration | `tests/helpers/anvil.ts` (existing) — wrap, don't replace | v1.0 already battle-tested it; rebuilding loses CI parity |
| EIP-1193 RPC handling | Re-implement secp256k1, RLP, ABI encoding | Anvil pre-funded unlocked accounts + RPC proxy | Anvil signs locally; the stub is a 5-line proxy |
| Snapshot/revert | Custom anvil RPC wrapping | viem's `TestClient.snapshot()` / `.revert({ id })` | Built-in, typed, tested |
| Foundry CI install | Custom curl + bash invocation | `foundry-rs/foundry-toolchain@v1` GitHub Action | Closes 999.8 |
| Storage slot computation | Manually packed `keccak256` | viem's `keccak256(encodeAbiParameters(...))` | Already a transitive dep |
| Chromium binary management | Manual download + cache | Playwright's built-in `npx playwright install --with-deps chromium` + GitHub Actions cache `~/.cache/ms-playwright` | Standard CI pattern |

**Key insight:** The Phase-1 surface is plumbing, not novel logic. Every time the planner is tempted to write 50+ lines of orchestration, check for an existing helper or library first.

---

## Common Pitfalls

### Pitfall 1: `addInitScript` runs too late for early-binding wallet libraries

**What goes wrong:** `svelte-wagmi` reads `window.ethereum` once at module evaluation; if the stub injects after that, the `injected` connector sees `undefined` and the wallet button stays disconnected.

**Why it happens:** `addInitScript` runs before any document scripts — but only on `page.goto()` or later. If a previous spec's page is still loaded when `addInitScript` is called, the new script doesn't apply until the next navigation.

**How to avoid:** Always call `page.addInitScript(stubSource)` **before** `page.goto(previewUrl)`. Use a Playwright fixture that wraps both in a single `before` block.

**Warning signs:** Wallet button stuck at "Connect Wallet" through a test; `signerAddress` store never resolves.

### Pitfall 2: anvil snapshot/revert leaks ERC20 storage state

**What goes wrong:** anvil's `evm_revert` is documented as restoring "the entire state" but historically has had quirks where overridden storage slots set via `anvil_setStorageAt` don't always revert cleanly. CONTEXT D-02 explicitly flags this trap.

**Why it happens:** anvil's snapshot identifier is reused-once — a snapshot taken before `setStorageAt` reverts the slot, but a snapshot taken after does not (the snapshot captures the new state).

**How to avoid:** Take the snapshot BEFORE any `setStorageAt` calls. Order in `beforeEach`:
1. `snapshot()` first
2. `setStorageAt()` for funding
3. test runs
4. `revert(id)` in `afterEach`

If state still leaks, drop to the escape hatch: per-spec anvil restart (CONTEXT Deferred — `Per-spec anvil restart`).

**Warning signs:** Test N+1 starts with a balance test N set; flaky failures correlated with execution order.

### Pitfall 3: Production CSP blocks `127.0.0.1:8545` even with `E2E=1`

**What goes wrong:** Even after relaxing `connect-src`, browsers block mixed-content (https page → http RPC) by default.

**Why it happens:** `vite preview` defaults to `http://127.0.0.1:4173` (not https), so this isn't an issue in our setup — but if a future run flips preview to https-via-self-signed-cert, mixed-content blocks loopback http calls.

**How to avoid:** Keep `vite preview` on http during E2E. Document in 01-RUNBOOK that preview is intentionally http to avoid mixed-content gymnastics.

**Warning signs:** Browser console shows `Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure XMLHttpRequest endpoint 'http://127.0.0.1:8545/'`.

### Pitfall 4: TanStack lazy-loaded `LimitOrder` not yet mounted when test clicks `[data-mode="limit"]`

**What goes wrong:** `LimitOrder.svelte` is dynamically imported (Phase 2 PERF-01 D-04 pattern). Clicking the limit mode tab kicks off a chunk load; the limit form's testids don't exist for ~50–500ms.

**Why it happens:** `{#await import('./LimitOrder.svelte')}` renders a skeleton placeholder until the chunk arrives.

**How to avoid:** After clicking `[data-testid="mode-tab"][data-mode="limit"]`, `await page.waitFor('[data-testid="limit-form-loaded"]')` (a testid added on the post-skeleton root element). Reuse the CLS-safe skeleton testid from Phase 2 v1.0 PERF-01 as the "loading complete" anchor.

**Warning signs:** Flaky `selector resolved to no elements` errors on the limit-deploy spec, especially under CI load.

### Pitfall 5: Foundry install caching busts on minor version drift

**What goes wrong:** v1.0 999.8 — `foundryup: No such file or directory` because foundryup's installer changed its install path.

**Why it happens:** `curl https://foundry.paradigm.xyz | bash` writes to `~/.foundry` but the script's exact behavior changes upstream; the cache key (`foundry-${{ runner.os }}-v1`) doesn't track those changes.

**How to avoid:** Replace the custom install with `foundry-rs/foundry-toolchain@v1` GitHub Action. Bump cache key when the action's major version bumps. `[CITED: github.com/foundry-rs/foundry-toolchain]`

**Warning signs:** CI exit 127 from `anvil --version`.

### Pitfall 6: `evm_setNextBlockTimestamp` only affects the NEXT block

**What goes wrong:** Tests that read `block.timestamp` via `eth_call` (not in a transaction) get the current block's timestamp, not the next one. For Pyth freshness tests where the on-chain pre-flight is a `staticcall`, the timestamp jump doesn't take effect until a transaction lands.

**How to avoid:** After `evm_setNextBlockTimestamp(t)`, force a no-op tx (e.g. `evm_mine`) so the next read sees the new timestamp. Or use `anvil_setBlockTimestampInterval` for sustained advancement.

**Warning signs:** Stale-oracle test fails to surface the error because `block.timestamp` in the pre-flight call is still the old fork-block time.

### Pitfall 7: Vercel-adapter build output requires Node runtime to serve

**What goes wrong:** `vite preview` against `@sveltejs/adapter-vercel` build output may not serve API routes correctly because adapter-vercel emits Vercel-specific entry points, not a standard Node server.

**Why it happens:** `vite preview` is designed for static SPA / SvelteKit static-adapter output. Adapter-vercel emits `.vercel/output/...` which `vite preview` doesn't natively serve.

**How to avoid:** D-01 says "vite preview of production build". Verify in Plan 1 smoke test that `npm run preview` (which uses adapter-vercel's preview shim) actually serves API routes. **If it doesn't**, fall back to either:
- A separate dev-time `@sveltejs/adapter-node` build for E2E only (one if-clause in `svelte.config.js` keyed on `E2E=1`).
- `vercel dev` invoked from globalSetup (slower, more accurate).

**Warning signs:** `404` on `/api/auth/csrf` etc. when E2E spec hits any backend route.

`[ASSUMED — high confidence this works because adapter-vercel inherits adapter-node's preview, but Plan 1 must smoke-test this explicitly. If it fails, the recommendation is adapter-node E2E build.]`

---

## Code Examples

### Example: A complete Buy market-order spec (TEST-06 skeleton)

```typescript
// tests/integration/ui/marketBuy.spec.ts
// [CITED: playwright.dev/docs/api/class-test for fixtures pattern]
import { test, expect } from './fixtures';
import { erc20Abi, parseUnits } from 'viem';

test.describe('TEST-06 — Buy market order via UI', () => {
    test('happy path: 100 USDC → tNVDA', async ({ page, testClient, fundedAccount, tokens }) => {
        // 1. Fund USDC for the test account
        await fundErc20({
            client: testClient,
            token: tokens.USDC.address,
            holder: fundedAccount.address,
            amount: parseUnits('100', 6),
            balanceSlot: 9 // verified during slot-discovery in Plan 1
        });

        // 2. Navigate to trade page
        await page.goto(`${process.env.PREVIEW_URL}/trade/${tokens.tNVDA.id}`);
        await page.waitFor('[data-testid="market-form-loaded"]');

        // 3. Click Buy side, market mode
        await page.click('[data-testid="mode-tab"][data-mode="market"]');
        await page.click('[data-testid="side-toggle"][data-side="buy"]');

        // 4. Enter spend amount
        await page.fill('[data-testid="spend-input"]', '100');

        // 5. Submit
        await page.click('[data-testid="trade-submit"][data-side="buy"]');

        // 6. UI assertion: success toast
        await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 30_000 });

        // 7. On-chain assertion: vault state
        const tnvdaBalance = await testClient.readContract({
            address: tokens.tNVDA.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [fundedAccount.address]
        });
        expect(tnvdaBalance).toBeGreaterThan(0n);
    });
});
```

### Example: ESLint rule for D-11

```javascript
// eslint.config.js — additional config object
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

---

## Audit Matrix Template (D-12 / TEST-10 deliverable shape)

**File:** `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-AUDIT.md` (created in TEST-10's plan)

```markdown
# Phase 1 — Order Test Coverage Audit (TEST-10)

| Bug-Class Row | unit (tests/lib/) | service-integration (tests/integration/marketOrder/) | UI E2E (tests/integration/ui/) | Gap (must-fix?) |
|---------------|-------------------|------------------------------------------------------|-------------------------------|-----------------|
| TRADE-01 — INPUT/OUTPUT side semantics (maker→taker conversions) | tests/lib/types/orderPerspective.test.ts | tests/integration/marketOrder/replay-wrong-side-classification.test.ts | tests/integration/ui/marketBuy.spec.ts + marketSell.spec.ts | — |
| TRADE-02 — transaction.ts ↔ marketOrderExecution.ts cycle severance | tests/lib/transactionStore.test.ts; tests/lib/utils/marketOrderFill.test.ts | tests/integration/marketOrder/anvil-fork.test.ts | (covered indirectly by Buy/Sell specs running through real walkOrderbook) | — |
| TRADE-03 — on-chain freshness pre-flight | (none — pure on-chain logic) | tests/integration/marketOrder/replay-aggregated-quote-stale.test.ts | tests/integration/ui/marketFailures.spec.ts (stale-oracle case) | — |
| TRADE-04 — mode×side spend/asset-anchored symmetry | tests/lib/utils/marketPrice.test.ts; tests/lib/utils/marketOrderFill.test.ts (19 cases) | tests/integration/marketOrder/replay-per-order-partial-fill.test.ts | (Buy by-spend + Sell by-asset coverage in marketBuy/Sell specs) | — |
| TEST-08a — slippage exceeded | tests/lib/services/marketOrderExecution.test.ts (ratio-cap math) | — | tests/integration/ui/marketFailures.spec.ts | — |
| TEST-08b — no liquidity | — | tests/integration/marketOrder/replay-fallback-no-liquidity.test.ts | tests/integration/ui/marketFailures.spec.ts | — |
| TEST-08c — stale oracle | — | tests/integration/marketOrder/replay-aggregated-quote-stale.test.ts | tests/integration/ui/marketFailures.spec.ts | — |
| TEST-08d — insufficient balance | (covered partially in transactionStore.test.ts) | — | tests/integration/ui/marketFailures.spec.ts | — |
| TEST-08e — market-hours gating | tests/lib/utils/marketHours.test.ts (TBD — likely doesn't exist; check) | — | tests/integration/ui/marketFailures.spec.ts | **must-fix?** depends on whether marketHours.ts has a unit test |
| Limit-deploy correct-vault deposit | tests/lib/validateDeploymentArgs.test.ts | (none — currently no integration test for orderDeployment.ts) | tests/integration/ui/limitDeploy.spec.ts | — |
| Simulated counterparty fill on fork | — | — | tests/integration/ui/limitDeploy.spec.ts | — |
| DCA-deploy | tests/lib/validateDeploymentArgs.test.ts (shared with limit) | — | — | nice-to-have (per D-13 → 999.x) |
| Hydration failure recovery | (in transactionStore.test.ts) | tests/integration/marketOrder/replay-hydration-failure.test.ts | (none — failure mode is internal to SDK; not user-facing) | — |
| Stale wallet session | tests/lib/stores/handleTakeOrders.test.ts | tests/integration/marketOrder/replay-stale-session-recovery.test.ts | (none — covered at unit + service-integration; UI flow is identical to other failures) | — |
| Slippage cap exceeded (per-order) | (in marketOrderExecution.test.ts) | tests/integration/marketOrder/replay-slippage-cap-exceeded.test.ts | covered by TEST-08a UI spec | — |

**Must-fix items:**
- (populated after audit walks every file under tests/lib/ and tests/integration/marketOrder/)
- Likely candidates: any TRADE-01..04 row with all three columns empty; any TEST-08 row with no UI E2E after this phase ships.

**Nice-to-have (→ 999.x backlog):**
- DCA-deploy E2E
- Hydration-failure UI surface assertion
- ...
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cypress for SPA E2E | Playwright | ~2022-2024 industry shift | Cleaner `addInitScript`; better parallelism; built-in network interception `[ASSUMED — based on training-data ecosystem patterns]` |
| Hardhat for forking | Anvil (Foundry) | ~2023 | Anvil is faster (Rust), supports more RPC namespaces, used by Rain ecosystem `[VERIFIED: tests/helpers/anvil.ts already in repo]` |
| Custom curl-bash Foundry install in CI | `foundry-rs/foundry-toolchain` GHA | ongoing | Closes 999.8 — install drift handled upstream `[CITED: github.com/foundry-rs/foundry-toolchain]` |
| Hand-rolled wallet mocks for E2E | EIP-1193 stub via `addInitScript` proxying to anvil | ~2023+ | Eliminates secp256k1 in browser; anvil signs natively |

**Deprecated/outdated:**
- `synpress` / `dappwright` for MetaMask-extension automation: heavy, brittle, slow CI; explicitly rejected in CONTEXT D-03.
- `hardhat node --fork`: Anvil supersedes for new projects.

---

## File-by-File Impact List (for downstream pattern-mapper)

### NEW files

| Path | Purpose | Approx LOC |
|------|---------|-----------|
| `playwright.config.ts` | Playwright config; `workers: 1`; globalSetup/Teardown wired | 40 |
| `tests/integration/ui/globalSetup.ts` | Build + preview + anvil + smoke probe | 60 |
| `tests/integration/ui/globalTeardown.ts` | Stop preview + stop anvil | 20 |
| `tests/integration/ui/fixtures.ts` | Playwright fixtures: testClient, fundedAccount, tokens, snapshot/revert wrapper | 120 |
| `tests/integration/ui/smoke.spec.ts` | ONE happy-path spec — CI gate | 50 |
| `tests/integration/ui/marketBuy.spec.ts` | TEST-06 | 100 |
| `tests/integration/ui/marketSell.spec.ts` | TEST-07 | 100 |
| `tests/integration/ui/marketFailures.spec.ts` | TEST-08 (5 cases) | 250 |
| `tests/integration/ui/limitDeploy.spec.ts` | TEST-09 | 150 |
| `tests/helpers/eip1193Stub.ts` | EIP-1193 stub source string + address derivation helper | 100 |
| `tests/helpers/anvilControl.ts` | viem TestClient wrappers (snapshot, revert, fundErc20, advanceTime) | 120 |
| `tests/helpers/previewServer.ts` | spawn/kill `vite preview`, ready-detect | 60 |
| `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-AUDIT.md` | TEST-10 deliverable | per matrix |
| `.planning/phases/01-ui-driven-e2e-order-test-coverage/01-RUNBOOK.md` | fork-block recipe, slot table, snapshot/revert traps, no-liquidity pair, escape hatches | TBD |

### MODIFIED files

| Path | What Changes | Why |
|------|-------------|-----|
| `package.json` | Add `test:e2e` script; `@playwright/test` devDep | New test runner |
| `src/lib/components/orders/MarketOrder.svelte` | Add `data-testid` attributes per D-09 grammar (form root, side toggle, mode tab, spend-input, asset-input, slippage-input, trade-submit, error-banner, success-toast — ~10 attributes) | D-10 retrofit |
| `src/lib/components/orders/LimitOrder.svelte` | Same testid retrofit on rendered shell | D-10 retrofit |
| `src/routes/(main)/trade/[id]/+page.svelte` | mode-tab data-testid + data-mode; wallet-connect button shell testid; market-form-loaded / limit-form-loaded anchors | D-10 retrofit |
| `src/hooks.server.ts` | Add `E2E=1` env-var branch in CSP `connect-src` to allow `http://127.0.0.1:8545` | Discretion #5 |
| `eslint.config.js` | Add `no-restricted-imports` rule scoped to `tests/integration/ui/**` | D-11 |
| `.planning/codebase/TESTING.md` | Add "UI Test Selectors" section (D-09 grammar, D-10 scope, rationale) | D-11 |
| `.github/workflows/test.yml` | Replace custom foundry install with `foundry-rs/foundry-toolchain@v1`; add `test-e2e` job with Playwright browser cache | D-14, closes 999.8 |
| `.planning/codebase/CONCERNS.md` | Add Phase-1 audit findings (must-fix gaps + nice-to-have backlog references) | TEST-10 |

### NOT TOUCHED (assert in plan-checker)

- `src/lib/services/marketOrderExecution.ts` — read-only; the whole point is to drive it through the UI without touching it.
- `src/lib/stores/transaction.ts` — same.
- `src/lib/types/orderPerspective.ts` — same.
- `tests/lib/**` — existing unit tests remain green; this phase doesn't refactor them.
- `tests/integration/marketOrder/**` — existing service-level tests remain green.

---

## Project Constraints (from CLAUDE.md)

The following directives from `CLAUDE.md` constrain Phase 1:

- **INPUT/OUTPUT semantics single source of truth** is `src/lib/types/orderPerspective.ts`. E2E tests assert against rendered UI text + on-chain vault state, NEVER against `inputIOIndex`/`outputIOIndex` directly.
- **Single chain — Base 8453 only.** `playwright.config.ts` and FORK_BLOCK selection target Base. No Arbitrum/Optimism conditional code.
- **No new features.** This research adds zero product features. All work is test infrastructure + testid attributes (which are inert at runtime).
- **Token triplet awareness:** Test funding must respect wrapped/unwrapped/legacy address variants. Use `getTokenByAnyAddress(addr)` if any helper needs to resolve a token from an address. The slot-funding table is keyed on the wrapped address (the canonical primary).
- **Avoid over-engineering.** EIP-1193 stub is 80 LOC, not a library. ESLint rule is one config block, not a custom plugin.
- **Atomic commits with svelte-check baseline = 3 errors and test suite green** carries forward unchanged. Every Phase-1 commit holds the baseline.

---

## Validation Architecture

Project config does not explicitly disable `nyquist_validation`, so this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Existing unit framework | Vitest 1.6.0 + jsdom — `vite.config.js` test block |
| Existing integration framework | Vitest 1.6.0 + jsdom — `vite.config.integration.js`, anvil-driven |
| **NEW UI E2E framework** | Playwright 1.49.x + Chromium |
| Quick-run commands | `npm test` (unit), `npm run test:integration` (anvil), `npm run test:e2e` (NEW Playwright) |
| Phase-gate command | All three green: `npm test && npm run test:integration && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-05 | Anvil-fork harness wired to runner | Smoke / E2E | `npm run test:e2e -- smoke.spec.ts` | ❌ Wave 0 |
| TEST-06 | Buy market order via UI → on-chain fill | UI E2E | `npm run test:e2e -- marketBuy.spec.ts` | ❌ Wave 0 |
| TEST-07 | Sell market order via UI → on-chain fill | UI E2E | `npm run test:e2e -- marketSell.spec.ts` | ❌ Wave 0 |
| TEST-08 | 5 failure modes via UI | UI E2E | `npm run test:e2e -- marketFailures.spec.ts` | ❌ Wave 0 |
| TEST-09 | Limit deploy + simulated fill | UI E2E | `npm run test:e2e -- limitDeploy.spec.ts` | ❌ Wave 0 |
| TEST-10 | Audit gap report | Doc artifact | Manual review of `01-AUDIT.md` | ❌ Wave 0 (deliverable, not test) |
| TEST-11 | Must-fix gaps closed | Test additions | (whatever specific specs/units the audit identifies) | depends on TEST-10 output |
| TEST-12 | UI-coupling discipline | Lint + doc | `npm run lint-check` (catches forbidden imports) + TESTING.md section reviewed | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (fast unit; <30s). Run `npm run test:e2e -- smoke.spec.ts` only on commits touching `tests/integration/ui/**`, `playwright.config.ts`, `tests/helpers/eip1193Stub.ts`, or hooks.server.ts CSP.
- **Per wave merge:** Full `npm test && npm run test:integration && npm run test:e2e` against archive `BASE_RPC_URL`.
- **Phase gate:** All three green in CI; `01-AUDIT.md` reviewed; ESLint rule catches a synthetic violation in a commit-and-revert verification step.

### Wave 0 Gaps

- [ ] `playwright.config.ts` — Playwright config wired
- [ ] `tests/integration/ui/globalSetup.ts` + `globalTeardown.ts` — anvil + preview lifecycle
- [ ] `tests/integration/ui/fixtures.ts` — shared Playwright fixtures (testClient, fundedAccount, tokens)
- [ ] `tests/helpers/eip1193Stub.ts` — EIP-1193 stub source
- [ ] `tests/helpers/anvilControl.ts` — TestClient wrappers (snapshot/revert/fund/advanceTime)
- [ ] `tests/helpers/previewServer.ts` — preview spawn/kill
- [ ] Framework install: `npm install --save-dev @playwright/test && npx playwright install chromium`
- [ ] CI job `test-e2e` added to `.github/workflows/test.yml`
- [ ] `data-testid` retrofit on the 3 trade-page files (D-10)
- [ ] ESLint rule for `no-restricted-imports` under `tests/integration/ui/**`
- [ ] `E2E=1` env-var branch in `hooks.server.ts` CSP

---

## Security Domain

`security_enforcement` not explicitly disabled, so this section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (test injects a stub auth) | EIP-1193 stub uses real `personal_sign` against anvil; SEC-03 atomic-flip session-cookie flow runs end-to-end |
| V3 Session Management | yes | E2E exercises the SEC-03+04 cookie minting; no test bypass |
| V4 Access Control | yes (E2E tests run against unauthenticated → authenticated transitions) | Production CSP and CORS preserved EXCEPT `connect-src 127.0.0.1:8545` gated on `E2E=1` |
| V5 Input Validation | yes (slippage input, amount input) | Real Svelte validation runs |
| V6 Cryptography | yes (signing) | Anvil's `eth_sign` provides real ECDSA — no rolled crypto in tests |
| V14 Configuration | yes | `E2E=1` env var must NEVER ship to production; documented in 01-RUNBOOK |

### Known Threat Patterns for Test Infrastructure

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Test env-var leakage to prod (`E2E=1` enabling CSP relaxation in prod) | Tampering | `E2E=1` is set ONLY by Playwright globalSetup; Vercel build pipeline never sets it. Document in 01-RUNBOOK and add an `assert(!env.E2E || dev)` guard pattern if paranoia warrants. |
| Anvil pre-funded private keys leaking into git | Information disclosure | Anvil's default mnemonics are PUBLIC and intended for testing — there's no real risk; document this so future maintainers don't try to "rotate" them. |
| Smoke spec accidentally hitting production RPC | Information disclosure | `BASE_RPC_URL` is a CI secret; locally, the test suite skips when absent (existing pattern in `anvil-fork.test.ts` line 17). Reuse `hasRpc` skip. |
| `data-testid` attributes shipping to prod bundle | Information disclosure (minor) | Acceptable — testids are well-known industry practice; no sensitive info in attribute names. |

---

## Sources

### Primary (HIGH confidence)
- **CONTEXT.md** (`.planning/phases/01-ui-driven-e2e-order-test-coverage/01-CONTEXT.md`) — D-01..D-14 + Discretion items (this research's authority)
- **REQUIREMENTS.md** — TEST-05..12 + Scope Principles + Out of Scope
- **`tests/helpers/anvil.ts`** — existing anvil lifecycle helper (verified by reading)
- **`tests/integration/marketOrder/anvil-fork.test.ts`** — existing fork pattern (verified by reading)
- **`vite.config.integration.js`** — existing parallel-config pattern (verified)
- **`.github/workflows/test.yml`** — existing CI shape including foundry install (verified)
- **`src/hooks.server.ts`** — CSP construction (verified by reading lines 176-198)
- **`src/lib/utils/marketHours.ts`** — Sat 03 UTC trigger reasoning (verified by reading)
- **`package.json`** — current devDep list (verified)
- **`src/lib/components/orders/MarketOrder.svelte`** + **`src/routes/(main)/trade/[id]/+page.svelte`** — line counts and current absence of `data-testid` (verified via `grep`)
- **`src/lib/services/marketOrderExecution.ts`** — `failWith` count = 19 (verified by `grep -c`)

### Secondary (MEDIUM confidence)
- **Playwright docs** (`playwright.dev/docs/test-global-setup-teardown`, `playwright.dev/docs/api/class-page#page-add-init-script`) — globalSetup + addInitScript patterns `[CITED]`
- **viem TestClient docs** (`viem.sh/docs/clients/test`) — TestClient API including `snapshot`/`revert`/`setStorageAt` `[CITED]`
- **`foundry-rs/foundry-toolchain` GHA** — replacement for custom foundry install `[CITED — github.com/foundry-rs/foundry-toolchain]`

### Tertiary (LOW confidence — flag for validation)
- Exact Playwright current version (`1.49.x` per training data; planner must `npm view @playwright/test version` at install time)
- `@web3-mock/wagmi-mock` maintenance status (rejected without deep verification — recommendation stands either way because custom stub is so small)
- Pyth feed `validTimePeriodSeconds` exact value at the chosen FORK_BLOCK (Plan 1 must read from the deployed strategy's Rainlang)
- Vercel adapter `vite preview` API-route serving fidelity (Pitfall 7 — Plan 1 smoke test must verify; fallback is adapter-node)
- USDC balance slot on Base (likely 9 from Circle proxy pattern, but must be `cast`-verified during slot-discovery task)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Playwright `1.49.x` is current at install time | Standard Stack | Low — `npm view` at install gives ground truth; pinning happens at install |
| A2 | `@web3-mock/wagmi-mock` is unmaintained-leaning | Discretion #3 | Low — recommendation is custom stub regardless; library is just a comparison |
| A3 | USDC balance slot on Base is 9 (Circle proxy) | Discretion #4 | Medium — wrong slot → funding silently fails. Slot-discovery script in Plan 1 must run and produce a verified table BEFORE specs depend on it |
| A4 | `vite preview` of adapter-vercel build serves API routes | Pitfall 7 | High — if false, Plan 1 must switch to adapter-node E2E build (one if-clause in `svelte.config.js`). Smoke test catches this in <5 min |
| A5 | Anvil `eth_sign` works for unlocked pre-funded accounts (no separate key import in browser stub) | Pattern 2 | Medium — if anvil requires explicit unlock, stub falls back to bundling secp256k1 via viem in the init script (~30 LOC more). Smoke test catches |
| A6 | Pyth freshness window is ≤ 60s; `+300s` advance forces stale | Failure-Mode Recipes — TEST-08c | Medium — actual window depends on the Rainlang strategy; Plan 1 reads the value from the deployed strategy and adjusts |
| A7 | `33_400_000` is too stale for archive-RPC at execution time | Discretion #2 | Medium — depends on the BASE_RPC_URL provider plan. If archive access is unlimited, the existing block is fine; otherwise refresh. Plan 1's first task verifies |
| A8 | The chosen fork block has at least one orderbook-empty `(token, side)` pair | Failure-Mode Recipes — TEST-08b | Medium — selection script must validate; escape hatch is `removeOrder` mass-cancellation |
| A9 | Industry shift Cypress → Playwright happened ~2022-2024 | State of the Art | Low — recommendation stands on technical merit regardless of timeline |
| A10 | `failWith()` count = 19 holds at phase close (≥12 invariant) | Locked Invariants | Verified now via grep; planner asserts at phase close as a verification step |

---

## Open Questions / Blockers

These items cannot be resolved without execution — they require live RPC access, the actual `BASE_RPC_URL` secret, or running code. They become Plan 1 first-task items.

1. **Fresh FORK_BLOCK selection** — see Discretion #2. Cannot be picked from this research because it requires (a) the actual archive-RPC endpoint to verify reachability, and (b) live orderbook subgraph queries to find a one-sided `(token, side)` pair at the candidate block. **Recommendation:** Plan 1 first task runs the selection script and writes the chosen value to `01-RUNBOOK.md`.

2. **USDC + tNVDA + tAMZN balance slot table** — see Discretion #4. Slots vary per token contract layout. **Recommendation:** Plan 1 first task runs the slot-discovery script for every token expected to be funded across the spec suite (USDC payment + the 2-3 asset tokens used in TEST-06..09).

3. **Pyth freshness window value** — see Failure-Mode Recipes A6. The on-chain freshness gate is encoded in the deployed strategy's Rainlang, not in TS code. **Recommendation:** Plan 1 first task reads the deployed strategy's Rainlang from the Rain registry at the chosen fork block, extracts the freshness constant, and writes it to 01-RUNBOOK.

4. **Vercel-adapter preview API-route fidelity** — see Pitfall 7. **Recommendation:** Plan 1 smoke spec includes a `fetch('/api/auth/csrf')` call to confirm API routes serve. If they don't, switch to adapter-node E2E build.

5. **`evm_setNextBlockTimestamp` + `Date.now()` patch sync for stale-oracle test** — see Pitfall 6. The patched browser `Date.now()` and the chain's `block.timestamp` must agree within ~1s for the on-chain pre-flight to consistently see "stale". **Recommendation:** Plan 1 smoke spec adds a one-test-only assertion that `block.timestamp` after `evm_setNextBlockTimestamp` matches `await page.evaluate(() => Date.now())` ÷ 1000 within 2 seconds.

6. **CI Playwright browser cache key** — `~/.cache/ms-playwright` contents change with Playwright version bumps. **Recommendation:** Use `actions/cache@v4` keyed on `playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` so a Playwright version bump invalidates the cache automatically.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Playwright is the obvious choice; viem is already a dep; the EIP-1193 stub pattern is well-established.
- Architecture: HIGH — globalSetup + per-spec snapshot/revert + addInitScript stub is the textbook pattern; v1.0 already has half of it.
- Pitfalls: HIGH — pitfalls 1-7 are catalogued from Playwright + anvil + SvelteKit known-issue lists and CONTEXT decisions.
- Discretion resolutions: MEDIUM — recommendations are well-reasoned but #2 (fork-block) and #4 (USDC slot) explicitly require Plan 1 verification before they become locked.
- Audit matrix shape: HIGH — D-12 specified the exact shape; this research populated cells from a `ls tests/` walk.

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (30 days for stable; sooner if Playwright or Foundry ship a major version)

---

## RESEARCH COMPLETE
