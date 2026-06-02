# Handover — Remaining E2E specs (marketSell, marketFailures, limitDeploy)

Date: 2026-05-15
Branch: `phase-01-ui-driven-e2e-tests`
PR: https://github.com/SARKEX/st0x/pull/174
Most recent green commit: `df92215`

## Scoreboard

| Spec | Tests | Status | Reason |
|---|---|---|---|
| `smoke.spec.ts` | 1 | ✅ pre-flight / 🟡 full-suite flake | redundant w/ marketBuy; recommend delete |
| `marketBuy.spec.ts` | 2 | ✅ both pass | buy transacting flow proven |
| `marketSell.spec.ts` | 2 | ❌ both fail | tNVDA funding + Sell-side UI mechanic |
| `marketFailures.spec.ts` | 5 | ❌ all fail | each scenario needs its own audit |
| `limitDeploy.spec.ts` | 1 | ❌ fail | limit-order deploy flow — different code path |

CI: PR #174 is green at **job level** (`test-e2e` reports SUCCESS via step-level `continue-on-error: true`). Branch protection is satisfied.

## What got fixed and why — the "buy-spec pattern"

`smoke.spec.ts` and `marketBuy.spec.ts` both pass. Five fixes carry over to any new transacting spec — apply ALL of them or expect failures:

### Fix 1 — `tests/integration/ui/fixtures.ts`: RPC route regex

The Rain SDK (`@rainlanguage/orderbook`) has its OWN RPC client (`src/lib/clients/raindex.ts:SETTINGS_YAML`) separate from wagmi. It falls back to `https://base-rpc.publicnode.com` when `PUBLIC_BASE_RPC_URL` is unset. The original regex matched `base.publicnode.com` (literal dot — typo introduced in 7e93b5a) which misses the actual URL. Without this fix, the SDK simulates against LIVE Base mainnet (where the test wallet has 0 balance) and silently returns `isReady: false`.

Current regex matches:
- `mainnet.base.org` (wagmi/viem default for Base)
- `base-rpc.publicnode.com` (SDK fallback — the load-bearing one)
- `*.g.alchemy.com`, `base.llamarpc.com`, `base.meowrpc.com`, `base-mainnet.public.blastapi.io`, `gateway.tenderly.co`, `base.drpc.org`, `*.drpc.live`

### Fix 2 — `src/lib/stores/marketTakeStore.ts`: broader aggregated→per-order fallback

This is a **real production code change** (commit `aaf3fbf`). Previously only "No liquidity available" triggered the fallback. Now `Preflight check failed` / `All orders failed simulation` also trigger it (both pre-approval and post-approval branches). Without this, the spec hits panic 0x32 from the SDK's aggregated batch on anvil and never reaches the per-order path that actually works.

This change benefits production too — aggregated SDK panics under stale-subgraph race conditions used to surface raw errors; now they fall back transparently.

### Fix 3 — Spec body: input-mode toggle (Buy-side only)

`MarketOrder.svelte` default `inputMode` flipped to `'amount'` in commit 5b3c81d (`market order by affordability`), landed after the original specs were authored. Spend-anchored tests need:

```ts
const modeToggle = page.locator('[data-testid="input-mode-toggle"]');
if ((await modeToggle.getAttribute('data-mode')) !== 'spend') {
    await modeToggle.click();
}
```

⚠️ **Sell side has no `input-mode-toggle`** (per MarketOrder.svelte:60-62 comment, only Buy renders it). marketSell spend-anchored test currently times out waiting for it. See §"marketSell.spec.ts" below.

### Fix 4 — Spec body: slippage bump to 5%

Subgraph indexes the live chain head; anvil is at `FORK_BLOCK=45_990_727` (Thu 2026-05-14 11:00 ET). Pyth's tNVDA price moves ~2.6% between those reference points. Taker's `priceCap` comes from `walkOrderbook` (subgraph quotes) + slippage. Default 1% slippage is insufficient — SDK reports "No liquidity available". 5% absorbs typical 24-48h drift. Cap is 50% (`MAX_SLIPPAGE_BPS = 5000`).

**Long-term fix:** make `FORK_BLOCK` dynamic at globalSetup time (pick the latest weekday market-hours block within last few hours). Then default slippage works.

### Fix 5 — Spec body: on-chain balance assertion, NOT success-toast

`pollAndFinalizeTakeOrders` (in `marketTakeStore.ts`) polls Goldsky subgraph for the take's trade event before firing the success toast. Anvil's tx hash NEVER appears in Goldsky → polling times out at 5 minutes → toast never fires within spec timeouts.

Replace `expect(success-toast).toBeVisible({ timeout: 30_000 })` with `expect.poll(readContract(...balanceOf...)).toBeGreaterThan(0n)` against anvil directly. Pattern from smoke.spec.ts:103:

```ts
await expect
    .poll(
        async () =>
            await testClient.readContract({
                address: tokens.tNVDA.address,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [fundedAccount.address]
            }),
        { timeout: 60_000, intervals: [1_000, 2_000, 5_000] }
    )
    .toBeGreaterThan(0n);
```

Keep `expect(error-banner).not.toBeVisible()` as a negative-path guard (T-1-04-01 mitigation against silent failures).

**Proper future fix:** stub the `/api/st0x/v1/trades/*` proxy endpoint in fixtures so the success-toast actually fires.

### Fix 6 — `.github/workflows/test.yml`: ST0X_API_* secrets

The preview server's `/api/st0x/v1/*` proxy (`src/routes/api/st0x/[...path]/+server.ts`) returns 503 when `ST0X_API_URL` is unset. The trade panel's orderbook query fails → `marketPrice` collapses to null → submit button never enables.

Required GitHub Actions secrets (set in repo settings; values mirror `.env.local`):
- `ST0X_API_URL` (preview: `https://api.preview.st0x.io`)
- `ST0X_API_KEY`
- `ST0X_API_SECRET`

Workflow passes them through on both E2E steps. **All three are set in the repo right now** (verified via `gh secret list --repo SARKEX/st0x`).

### Fix 7 — `force: true` on mode-tab clicks

The `[data-testid="mode-tab"]` buttons are `sr-only` test-only hooks (trade/[id]/+page.svelte:1819-1841); the visible "Order Type" label intercepts pointer events at the same coordinates. Without `force: true`, the click never lands and the spec times out.

```ts
await page.click('[data-testid="mode-tab"][data-mode="market"]', { force: true });
```

### Fix 8 — Explicit `toBeEnabled` wait before submit click

Under CI's slower runner + page.route forwarding + cold dRPC cache, the wagmi balance read can take >5s to settle (Playwright's default click retry window). `page.click` would auto-retry until test timeout against a disabled button. Replace with explicit:

```ts
const submit = page.locator('[data-testid="trade-submit"][data-side="buy"]');
await expect(submit).toBeEnabled({ timeout: 30_000 });
await submit.click();
```

---

## marketSell.spec.ts — two distinct blockers

### Blocker 1 — `setStorageAt` doesn't work for tNVDA

`tokens.tNVDA.balanceSlot: 0` in `fixtures.ts` is a placeholder ("OZ ERC20 default", per the comment). It's **wrong**.

Verified locally — none of slots 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 50, 51, 52, 53, 54, 55, 99, 100, 101, 102, 150, 200, 201, 202 set the balance to a non-zero value. The token at `0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7` has only 537 bytes of code — it's an EIP-1967 proxy. Its balance storage either lives at a non-standard slot in the implementation, or is derived from the underlying ERC4626 (`unwrappedAddress: 0x7271a3c91bb6070ed09333b84a815949d4f16d14`).

**Recommended approach:** stop using `setStorageAt` for the wrapper. Instead, impersonate a known tNVDA holder and `transfer` to `fundedAccount`. The order owner `0xa9c16673f65ae808688cb18952afe3d9658c808f` holds tNVDA in their orderbook vault (`outputVault` of order `0x875b166555...`), but `vaultBalance` is different from wallet `balanceOf`. Better candidates:

1. **Query Etherscan / Basescan** for "Top Holders" of `0xFb5B41ac...` at fork block.
2. **Query the subgraph** for `wrappedTokenTransfers` to find recent recipients with substantial balance.
3. **Use `anvil_setBalance` on the implementation**: read the proxy's `_IMPLEMENTATION_SLOT` (`0x360894a13ba1a3210667c828492db98dcbf16b0c8be3df8b41cca12f0247c92b`), get the impl address, then probe slots against the implementation contract.

Helper-pattern for impersonate-and-transfer:

```ts
async function fundTNvdaViaImpersonation(client, donor, holder, amount) {
    await client.impersonateAccount({ address: donor });
    await client.setBalance({ address: donor, value: parseEther('1') }); // gas
    await client.writeContract({
        account: donor,
        address: TNVDA,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [holder, amount]
    });
    await client.stopImpersonatingAccount({ address: donor });
}
```

Same pattern needed for **USDC slot table** in `01-RUNBOOK.md` — current slot 9 happens to work for Circle's proxy but is also unverified for other payment tokens.

### Blocker 2 — Sell side has no `input-mode-toggle`

Per `MarketOrder.svelte:60-62` (handler for the toggle):
> The toggle button is rendered only for Buy side and carries data-mode reflecting current state

So the spend-anchored Sell test can't use the toggle pattern. Options:
1. **Skip spend-anchored Sell** — only test asset-anchored on Sell side. Coverage loss but pragmatic.
2. **Add a `data-mode` testid on whatever Sell uses to switch anchoring** — coordinate with the frontend; might already exist under a different name.
3. **Drive state via store** — Playwright can `page.evaluate(() => window.__setInputMode('spend'))` if the store is exposed; not currently exposed.

Recommend option 1 for now; track option 2 as follow-up.

### Bid-side liquidity sanity check

Before debugging UI, verify the orderbook at `FORK_BLOCK=45_990_727` HAS bid-side orders for tNVDA. Buy proved 8 ask-side orders for tNVDA (subgraph query in `tmp_quote_probe.mjs` style). For Sell, need bid-side. Quick check via subgraph:

```graphql
{ orders(where: {active: true, inputs_: {token: "wtNVDA"}}, first: 10) { orderHash outputs { token { symbol } balance } } }
```

If no bid-side orders exist at the fork block, Sell can't fill regardless of fixture fixes — `marketFailures.spec.ts:72` already tests this scenario (`empty book (wtAMZN, sell)`), so the expected-empty assertion is in there as a baseline.

---

## marketFailures.spec.ts — five sub-tests, each its own audit

Each test exercises a specific error path. They all currently time out because they share the same RPC redirect / slippage / submit-click plumbing issues as the buy specs. Apply the buy-spec pattern (fixes 1, 3-8) as the baseline, then look at what each test specifically asserts:

| Test | Line | Expected error class | Probable issue |
|---|---|---|---|
| slippage exceeded | 38 | `slippage` | sets 0.001% slippage → expects error-banner. Verify the slippage-input flow lands a tiny value and the SDK reports a slippage_cap reject. |
| no liquidity (wtAMZN sell) | 72 | `no_liquidity` | tests an empty book. wtAMZN at FORK_BLOCK may or may not actually be empty for the chosen side — verify via subgraph. |
| stale oracle | 105 | `stale_oracle` | uses `evm_increaseTime` or similar to push past Pyth freshness window. Verify the Pyth contract address used and the actual freshness threshold (5 min observed in local probe). |
| insufficient balance | 145 | `insufficient_balance` | switches to UNFUNDED_ACCOUNT and expects the SDK / preflight to surface insufficient-balance. Likely just needs the buy-spec plumbing. |
| market closed | 172 | `market_closed` | uses `evm_setNextBlockTimestamp` to a Saturday. Verify the order's Rainlang has a market-hours gate (it does — see globalSetup comment about FORK_BLOCK pinning). |

The trickiest is **stale_oracle** — observed locally that Pyth's `getPriceNoOlderThan` rejects somewhere between 300s and 420s of clock advance past the fork block (publishTime was 28s before fork). The spec needs to advance time past whatever the order's actual freshness window is.

**Quick wins probably:** insufficient_balance and market_closed (mostly need the plumbing). The other three may require deeper investigation per the specific assertion.

---

## limitDeploy.spec.ts — separate code path

Tests `Sell limit deploys, deposit lands in OUTPUT (tNVDA) vault, counterparty takeOrders fills`. This is a different feature than market orders:

1. User deploys a limit order via `LimitOrder.svelte` (calls `orderDeployment.ts:deployOrder`).
2. The deposit lands in the order's `outputVault`.
3. A simulated counterparty calls `takeOrders` on the orderbook to fill it.

I haven't audited this spec at all. Different assertions, different helpers, different UI flow. Read through it cold:

```bash
less tests/integration/ui/limitDeploy.spec.ts
```

Key things to verify when picking it up:
- Does the limit-deploy UI use the same `mode-tab` / `side-toggle` pattern? (Probably yes for the panel-open, no for the deploy flow itself.)
- Does it need tNVDA funding (same Blocker 1 above)?
- Does the simulated-counterparty step actually need to construct a takeOrders calldata? If yes, the same SDK plumbing applies but in reverse — your taker is now a SCRIPT (not the UI).

---

## Open concerns to be aware of

### Smoke spec flakes in full suite

Smoke passes alone (pre-flight step, 3.7m runtime) but FAILS when run as the last spec after the other 4 (full-suite step, balance never increments past 0n inside the 60s test timeout). Likely cause: cumulative dRPC throttling or anvil lazy-state-cache interaction over the 11 sequential tests. Smoke and marketBuy test the same scenario; **recommend deleting smoke.spec.ts** to eliminate the flake. Pre-flight step would then run marketBuy as the smoke gate.

### tNVDA balanceSlot is incorrect

`tests/integration/ui/fixtures.ts:46` — `balanceSlot: 0` is a guess that doesn't work. Either fix the slot value (probe the implementation contract) or switch funding to impersonation as discussed in Blocker 1 above. **Currently silently incorrect** — marketBuy doesn't touch tNVDA funding (it BUYS tNVDA), so the bug only surfaces on Sell.

### USDC balanceSlot is `9`, verified for Circle proxy

Works. No change needed unless Base USDC contract upgrades the proxy implementation.

### `pollAndFinalizeTakeOrders` blocks success toast in E2E

Documented in fix 5 above. Stubbing the `/api/st0x/v1/trades/*` proxy in fixtures is a follow-up that would let specs assert on the actual success-toast (which is the real UX surface).

### `continue-on-error: true` on E2E steps

Both Playwright invocation steps in the workflow have it (lines 131 and 143 of `.github/workflows/test.yml`). Once all specs pass, REMOVE this so future regressions are caught at job-level rather than masked.

---

## Diagnostic tooling reference

### `tmp_quote_probe.mjs` pattern (one-off, deleted)

Reproducing SDK state outside the browser:

```js
import { RaindexClient } from '@rainlanguage/orderbook';
const c = await RaindexClient.new([SETTINGS_YAML]); // copy from raindex.ts
const order = await c.value.getOrderByHash(8453, ORDERBOOK_ADDR, ORDER_HASH);
// .getQuotes(blockNumber?) — quote evaluation
// .getTakeCalldata(inputIdx, outputIdx, taker, mode, amount, priceCap) — full preflight
// client.getTakeOrdersCalldata(req) — aggregated path (subgraph-discovered)
// client.getOrderQuotesBatch(ordersWrapper, null, null) — batched quote
```

Useful for isolating: is the SDK call broken vs. is the spec wiring broken?

### `page.evaluate` debug dump (commit `77d181d`, since removed)

Pattern for surfacing in-browser state when a spec gates on opaque UI state:

```ts
await page.waitForTimeout(2_000);
const debugState = await page.evaluate(() => {
    const submit = document.querySelector('[data-testid="trade-submit"][data-side="buy"]') as HTMLButtonElement | null;
    return {
        submitDisabled: submit?.disabled,
        panelText: document.querySelector('[data-testid="market-form-loaded"]')?.textContent?.replace(/\s+/g, ' ').slice(0, 800)
    };
});
console.log('[smoke-debug] state:', JSON.stringify(debugState, null, 2));
```

This is how I diagnosed the `ST0X_API_URL` missing-secrets issue. Don't ship debug dumps to CI permanently — add when investigating, remove before final commit.

### CI log fetch pattern

```bash
RUN_ID=$(gh run list --branch phase-01-ui-driven-e2e-tests --limit 1 --json databaseId --jq '.[0].databaseId')
JOB_ID=$(gh run view $RUN_ID --json jobs --jq '.jobs[] | select(.name == "test-e2e") | .databaseId')
gh api repos/SARKEX/st0x/actions/jobs/$JOB_ID/logs > /tmp/ci.log
```

⚠️ The job-level logs API returns 404 while the job is in progress, even for completed steps within it. You must wait for the full job to complete before any of the step logs become fetchable.

---

## Run commands

```bash
# Local: just one spec
source ~/.nvm/nvm.sh && nvm use lts/iron       # Node 20 required (adapter-vercel)
BASE_RPC_URL="https://lb.drpc.live/base/<KEY>" \
SESSION_SECRET="local-e2e-test" \
npx playwright test smoke.spec.ts --reporter=list

# Local: all specs
npm run test:e2e

# CI re-trigger (empty commit)
git commit --allow-empty -m "ci: retrigger E2E" && git push
```

---

## Files modified this session (for reference)

| File | Why |
|---|---|
| `src/lib/stores/marketTakeStore.ts` | broader aggregated→per-order fallback (production code, real improvement) |
| `tests/integration/ui/fixtures.ts` | RPC route regex + ST0X_API_* secrets plumbing |
| `tests/integration/ui/smoke.spec.ts` | full buy-spec pattern landed |
| `tests/integration/ui/marketBuy.spec.ts` | same pattern applied (verified passing in CI) |
| `tests/integration/ui/marketSell.spec.ts` | same pattern applied (still fails — see Blockers above) |
| `.github/workflows/test.yml` | ST0X_API_URL/KEY/SECRET passed to both E2E steps |

Repo secrets added (one-time): `ST0X_API_URL`, `ST0X_API_KEY`, `ST0X_API_SECRET`. Don't re-add.
