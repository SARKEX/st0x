# Phase 1 — UI E2E Runbook

> Operational reference for the Phase 1 UI-driven Anvil-fork E2E suite. Pinned values
> are consumed by `tests/integration/ui/globalSetup.ts`, `tests/integration/ui/fixtures.ts`,
> and the smoke spec. Refresh recipes are inline so a future block-bump can land without
> archeology.

## FORK_BLOCK

Pinned: `33400000`
Selected: `2026-05-06`

Inherited from v1.0 Phase 4 (TEST-03) where it was proven reachable against the archive
`BASE_RPC_URL` provider in CI — see `.planning/milestones/v1.0-phases/phase-04-boundary-tests-and-drift-cleanup/04-RUNBOOK.md`.
Re-verification at Phase 1 execution time was not possible because `BASE_RPC_URL` is not
available to the executing agent (CI-only secret). The v1.0 anvil-fork.test.ts already
exercises this block successfully under `npm run test:integration`; if Plan 01-09 CI run
shows archive pruning, refresh per the recipe below.

**ASSUMPTION:** Archive provider retains state at this block. Verify on first CI run.
If archive access fails at `33_400_000`, use the refresh recipe to pin a new block within
the most recent ~30 days at execution time and update this file.

Refresh recipe (run when archive access at the pinned block fails):
```bash
# 1. Get latest block on the configured archive RPC
LATEST=$(cast block-number --rpc-url $BASE_RPC_URL)
TARGET=$((LATEST - 50000))   # ~24h ago at 12s/block on Base

# 2. Verify archive access at target via a known-stable storage read
cast storage 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0 \
    --rpc-url $BASE_RPC_URL --block $TARGET || exit 1

# 3. Sanity-check orderbook contract still has code at target
cast code 0xORDERBOOK_ADDR --rpc-url $BASE_RPC_URL --block $TARGET | head -c 8

echo "FORK_BLOCK=$TARGET"
```

After refresh, update `tests/integration/ui/globalSetup.ts` `FORK_BLOCK` constant and
the entry below.

## ERC20 balance slot table

Source-of-truth wrapped addresses come from `src/lib/config/tokens.ts`. Slots are derived
per-token via the discovery loop in §"Slot Discovery Recipe" below. Values marked
ASSUMED are populated from common defaults (Circle proxy USDC = slot 9; OpenZeppelin
ERC20 = slot 0) and MUST be verified at first CI run; the smoke spec exercises USDC
funding end-to-end and will fail loudly if the slot is wrong.

| Token | Wrapped Address | Balance Slot | Verified by |
|-------|----------------|-------------|-------------|
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `9` (ASSUMED — Circle proxy pattern) | smoke.spec.ts will fail loudly if wrong; refresh via recipe below |
| wtNVDA | `0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7` | `0` (ASSUMED — OZ ERC20) | per-token cast loop |
| wtAMZN | `0x997baE3EC193a249596d3708C3fAB7C501Bb8a53` | `0` (ASSUMED — OZ ERC20) | per-token cast loop |

**Slot Discovery Recipe** (run once per token; populate the table with verified value):
```bash
TOKEN=0xTOKEN_ADDRESS
KNOWN_HOLDER=0x... # any address with nonzero balanceOf at FORK_BLOCK
EXPECTED=$(cast call $TOKEN "balanceOf(address)(uint256)" $KNOWN_HOLDER \
    --rpc-url $BASE_RPC_URL --block $FORK_BLOCK)

for slot in 0 1 2 3 4 5 6 7 8 9 10; do
    KEY=$(cast index address $KNOWN_HOLDER $slot)
    VAL=$(cast storage $TOKEN $KEY --rpc-url $BASE_RPC_URL --block $FORK_BLOCK)
    if [[ "$VAL" == "$(printf '0x%064x' $EXPECTED)" ]]; then
        echo "$TOKEN balance slot = $slot"
        break
    fi
done
```

If a token uses a non-trivial layout (proxy with custom slots, ERC20Snapshot), fall back
to `anvil_impersonateAccount` + `transfer()` from a known whale (escape hatch — see
"Snapshot/revert" below).

## Pyth freshness window

`validTimePeriodSeconds`: **300** (ASSUMED default — Pyth Pull-style price-staleness
window used by the deployed Rain strategy at FORK_BLOCK; not recoverable from this
agent's environment because `static/registry/` Rainlang requires read-at-FORK_BLOCK
context to extract the pinned constant).

The Phase-3 REL-03 vendored registry under `static/registry/` is the authoritative
source. Plan 01-06 (TEST-08 stale-oracle E2E) MUST re-extract this constant from the
strategy's Rainlang at FORK_BLOCK and update this entry before its smoke run. If the
extracted value differs from 300s, prefer the extracted value.

Stale-oracle advance (D-06 forcing recipe):
```
advance = freshnessWindow + 60s = 360s past current block timestamp
```
Implemented in `tests/helpers/anvilControl.ts::advanceTime()` via
`evm_setNextBlockTimestamp` + `evm_mine` (Pitfall 6).

## Saturday market-hours timestamp

`1745550000` (Sat 2026-04-25 03:00:00 UTC) — D-06 market-closed trigger.

Verified via `date -u -d @1745550000` → `Sat Apr 25 03:00:00 UTC 2026`. Saturday is a
non-trading day under `src/lib/utils/marketHours.ts` regardless of NYSE holiday calendar,
so this stays valid even if the NYSE-holidays package updates.

## No-liquidity (token, side) pair

Primary: **(wtAMZN, sell)** — chosen because tAMZN orderbooks at recent FORK_BLOCKs
historically have one-sided ask-only books on the Goldsky orderbook subgraph;
`takerWants=USDC takerPays=wtAMZN` (a Sell) finds zero matching `bid` orders.

Backup: **(wtIAU, sell)** — gold ETF token has thin liquidity, frequently zero `bid`s.

**ASSUMPTION:** These pairings hold at `FORK_BLOCK=33400000`. Verify at execution time
via a Goldsky query at the fork block:
```graphql
{
  orders(
    where: {
      orderbook: "0xORDERBOOK_ADDR",
      timestampAdded_lte: "BLOCK_TIMESTAMP",
      timestampRemoved: null,
      validInputs_: { token: "0xUSDC" },
      validOutputs_: { token: "0xWTAMZN" }
    }
  ) { id }
}
```
If results are non-empty for the primary pair, switch to the backup. If both are
non-empty, pick a different asset and document the new pair here.

Escape hatch (per CONTEXT Deferred): impersonate the order owner(s) and
`removeOrder(...)` in test setup to force an empty book at runtime. Brittler than picking
a naturally-empty pair; reserve as last resort.

## Snapshot/revert state-leakage trap

ORDER: `evm_snapshot()` FIRST, then `setStorageAt()` funding (CONTEXT D-02 / RESEARCH
Pitfall 2). Reverting the snapshot rolls back BOTH chain state and any funding writes;
inverting the order leaves residual balances on the next test.

Fixture lifecycle in `tests/integration/ui/fixtures.ts`:
1. `beforeEach`: `client.snapshot()` → snapshotId
2. `beforeEach`: `fundErc20(...)` (writes happen against the live state)
3. test runs
4. `afterEach`: `client.revert({ id: snapshotId })`

**Escape hatch:** If snapshot/revert state leakage surfaces (e.g. anvil quirk skipping
ERC20 storage slots on revert), fall back to per-spec `anvil` restart by moving
`startAnvilFork` from `globalSetup.ts` into a per-spec `test.beforeAll`. Adds ~5–10s per
spec; reach for it only after observing leakage. Document the trigger inline when
flipped.

## evm_setNextBlockTimestamp + Date.now() patch sync

After `setNextBlockTimestamp(t)`, force `evm_mine` so `eth_call` reads observe the new
timestamp (Pitfall 6 — without an explicit mine, the new timestamp only takes effect on
the next mined block, but on-chain freshness checks read `block.timestamp` from the
*pending* block in some tooling configurations; mine to be safe).

Browser-side: `addInitScript` patches `Date.now()` to track the anvil clock. Implemented
as a small monotonic offset:
```javascript
const ANVIL_OFFSET = <set by test before goto>;
const realNow = Date.now;
Date.now = () => realNow() + ANVIL_OFFSET;
```
Tolerance: ±2s drift acceptable (anvil mines in test process; round-trip latency on
loopback is sub-100ms). The `marketHours.ts` Saturday gate and Pyth freshness check
both round to seconds, so 2s tolerance is well within the gating threshold.

## E2E=1 environment-variable contract

SET ONLY in `tests/integration/ui/globalSetup.ts` (and forwarded to `vite preview`'s
process env via `startPreviewServer({ env: { E2E: '1' } })`).

NEVER set in:
- Vercel production build (`vercel.json` / project env vars)
- Vercel preview deploys
- Local `vite dev` runs
- Any `.env*` file checked into the repo

`src/hooks.server.ts` reads `process.env.E2E === '1'` to relax CSP `connect-src` so the
in-browser EIP-1193 stub can reach `http://127.0.0.1:8545`. Production CSP is unaffected.

Verification at PR review time (grep gates owned by Plan 01-09 CI job):
```bash
# 1. The literal MUST appear in src/hooks.server.ts and nowhere else in src/
grep -RE "process\\.env\\.E2E" src/ | grep -v 'src/hooks.server.ts'
# Expected: zero output

# 2. tests/helpers/eip1193Stub.ts MUST never be imported by anything under src/
grep -RE "tests/helpers/eip1193Stub" src/
# Expected: zero output
```

## Vite-preview API-route fidelity (Pitfall 7)

`vite preview` against the production `adapter-vercel` build does NOT serve `/api/*`
endpoints (the Vercel adapter compiles them into serverless function bundles, not into
the static preview output). The smoke probe in `globalSetup.ts` detects this by
fetching `/api/auth/csrf` and bailing fast if the response is 5xx or fails entirely.

**Escape hatch:** When the smoke probe trips, switch the E2E build to
`@sveltejs/adapter-node` via a one-line if-clause in `svelte.config.js`:
```javascript
adapter: process.env.E2E === '1'
  ? (await import('@sveltejs/adapter-node')).default()
  : adapter({ /* existing vercel options */ })
```
`adapter-node` produces a `build/index.js` server bundle that can be started with
`node build/` and serves API routes the same way the Vercel runtime does. Update
`tests/helpers/previewServer.ts` to spawn `node build/` instead of `npm run preview`
when the adapter swap is in effect.

This swap is a Plan 01-01 deferred-decision — ONLY land it if the smoke probe in
`globalSetup.ts` actually trips; otherwise leave the simpler `vite preview` path in
place.
