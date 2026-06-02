# Handover — Path B final items (ioRatio, spec rewrite, limitDeploy)

Date: 2026-05-19
Branch: `phase-01-ui-driven-e2e-tests`
Supersedes the "What's NOT done yet" section of HANDOVER-2026-05-19.md.

## What landed this iteration

```
tests/helpers/makerOrders.ts                  ioRatio + outputVaultBalance + maxOutput populated
tests/integration/ui/syntheticOrdersStub.ts   API summary uses real decimal-string values
tests/integration/ui/fixtures.ts              seed st0x_hide_vault_tutorial in localStorage
tests/integration/ui/marketBuy.spec.ts        +path-B test: maker ASK @ $300, 1 wtCOIN depth
tests/integration/ui/marketSell.spec.ts       +path-B test: maker BID @ $300, $300 USDC depth
tests/integration/ui/limitDeploy.spec.ts      un-skipped (vault-tutorial root cause fixed)
```

`npx tsc --noEmit` is clean (only the two pre-existing route-binding errors,
unchanged by this work).

## 1. ioRatio extraction — DONE (option b: derive from price)

Chose option (b) from HANDOVER-2026-05-19. For a `fixed-limit` order the
on-chain ratio is *exactly* the value passed to
`gui.setFieldValue('fixed-io', sdkRatio)` — the interpreter bytecode embeds
the literal. So:

- `ioRatio` (decimal string, input-per-output) = the same `sdkRatio` we set:
  - ask (sell): `pricePaymentPerAsset`
  - bid (buy):  `1 / pricePaymentPerAsset`
- `maxOutput` (decimal string) = `formatUnits(depositAmount, outputDecimals)`
- `outputVaultBalance` (decimal string) = same as `maxOutput`

This matters because `convertApiOrderToProcessedQuote` (src/lib/api/orders.ts:61)
drops the order outright if `parseFloat(outputVaultBalance) <= 0` — previously
we sent `'0x0'` and the maker order was silently filtered out. Now it survives.

Trade-off vs option (a) (eth_call to anvil quote()): we don't catch a bug
where the Rainlang bytecode disagrees with the price we asked for. That's OK
here because the SDK's own preflight at submit-time runs against anvil and
*will* notice any disagreement (it'll abort the take). Net effect: still an
end-to-end check, just front-loaded vs back-loaded.

Caveat: only valid for fixed-limit. For DCA / dynamic-spread you'd need
option (a) or to compute the ratio with strategy-specific logic.

## 2. marketBuy / marketSell — Path-B tests added

Pattern (mirrors HANDOVER-2026-05-19's sketch):

```ts
// Fund maker → deploy maker limit on anvil → registerMakerOrders →
// fund taker → goto trade page → drive UI as taker → assert on-chain.
```

The existing Path-A tests (LIVE order list, re-quoted against fork) are kept
verbatim as baseline. Path-A and Path-B coexist; the Goldsky+REST stubs in
fixtures.ts switch on whether maker orders are registered:

- 0 maker orders registered → Path A (existing 4 passing tests use this)
- ≥1 maker orders registered → Path B (only the new tests use this)

**Why 1% slippage in Path B vs 5% in Path A:** Path A absorbs ~minutes of
LIVE-vs-fork ratio drift; Path B is a closed loop (the maker we deployed IS
the only counterparty, with a known fixed-limit price). 1% is plenty for
decimal rounding inside the SDK.

**Expected on-chain math (for sanity-check during a real run):**
- marketBuy Path B: $50 / $300 ≈ 0.16666 wtCOIN; assertion floor 0.165
- marketSell Path B: 0.05 wtCOIN × $300 = $15; USDC floor $14.85

## 3. limitDeploy — root cause found, fixed, un-skipped

The 180s `limit-form-loaded` timeout was NOT a chunk-loading or
registry-fetch problem. Trace inspection:
`test-results/limitDeploy-…/error-context.md` shows the trade panel STILL
in Market mode at the time of the timeout, even after the test clicked
`mode-tab[data-mode="limit"]` with `force: true`. The combobox (e332) reads
"Market Order" [selected].

What actually happens:
1. Test opens trade panel → `panelStrategy = 'market'` (default).
2. Test clicks `mode-tab[data-mode="limit"]` → `panelStrategy = 'limit'`.
3. Reactive block at `src/routes/(main)/trade/[id]/+page.svelte:336-348`
   fires: `if (panelStrategy === 'limit' && !vaultTutorialTriggered && !isVaultTutorialHidden())`
   → closes the trade panel (`showTradePanel = false`) and starts the
   vault tutorial.
4. With the panel closed, `LimitOrder.svelte`'s lazy chunk never mounts
   and `data-testid="limit-form-loaded"` never appears.

Fix: seed `localStorage['st0x_hide_vault_tutorial'] = 'true'` in the
fixtures' `addInitScript`, same pattern as the existing
`st0x_token_swap_announcement_seen` seed. The vault-tutorial trigger
short-circuits at the `isVaultTutorialHidden()` check.

Also seeded `st0x_hide_tutorial=true` for symmetry (the general onboarding
tutorial — not currently blocking the suite, but cheap insurance).

The previous marketBuy / marketSell tests passed because they click
`mode-tab[data-mode="market"]` which is a no-op (default is already market),
so they never trigger the tutorial. Path-B versions of those tests still
don't hit limit/dca either, so the seeding doesn't change their behavior.

## What's NOT done

### 4. End-to-end suite run — NOT EXECUTED THIS SESSION

This session does NOT have `BASE_RPC_URL` (no archive Base RPC available),
so the full suite was not run. All changes here pass `npx tsc --noEmit`
and follow the patterns established by the prior iterations, but the
on-chain assertions have not been validated.

**Required next step:** with `BASE_RPC_URL` + `FORK_BLOCK` set, run:

```bash
nvm use 20
BASE_RPC_URL='https://lb.drpc.live/base/...' FORK_BLOCK=46042954 \
  npx playwright test
```

Expectations:
- Pre-existing Path-A tests: 4 pass / 0 fail (no regression — the additive
  changes to fixtures.ts only matter when maker orders are registered,
  which Path A tests don't do)
- New Path-B `marketBuy` test: PASS (taker buys at maker's $300 ASK)
- New Path-B `marketSell` test: PASS (taker sells into maker's $300 BID)
- `limitDeploy`: PASS (the tutorial no longer closes the panel)
- 3 skipped marketFailures tests: still skipped (unchanged from prior iteration)

**Final expected scoreboard:** 7 pass / 3 skip (was 4 pass / 4 skip).

## Likely failure modes for the test run (and fixes)

1. **Path-B drops the maker order at the API stage.** Symptom: submit
   button stays disabled at 90s. Cause: `outputVaultBalance` is a decimal
   string of the *full deposit*, but `convertApiOrderToProcessedQuote`
   reads it via `parseFloat`. If the SDK's downstream walk needs the
   *post-fill* balance (it shouldn't for a fresh order, but worth
   checking), the rounded decimal might be off. **Fix:** verify via the
   browser console log `[orders-synth] orders=N`; if `orders=0`, the
   filter dropped us — most likely because the page is loading a quote
   token that doesn't match the maker's input/output addresses.

2. **Goldsky `MetasBySubject` blows up.** The synth returns `metaV1S: []`.
   If the SDK strictly requires meta presence, this'd surface as an SDK
   `readableMsg` error. **Fix:** capture the message via the
   `[take-order failed]` console log path (already wired) and either
   forge a meta or fall through to the cached LIVE response.

3. **Self-take revert.** anvil[2] (MAKER) and anvil[0] (FUNDED) are
   different — the orderbook should accept the take. But if the SDK's
   preflight wraps the multicall such that BOTH parties resolve to the
   same `tx.origin`, we'd see a revert. **Fix:** check the take-order
   reason field; if it mentions "self-take" or similar, the maker key
   needs to NOT be impersonated through testClient (which we already
   avoid — wallet.sendTransaction is bound to the maker key directly).

4. **`limit-form-loaded` STILL doesn't appear.** If the fix above is
   wrong and there's some OTHER reactive trigger closing the panel,
   look for the `closeTradePanel()` call site that fires. Add
   `console.log('panelStrategy=', panelStrategy, 'showTradePanel=', showTradePanel)`
   inside the `$:` reactive block on line 336-348 and watch the
   `[browser log]` output during the test.

## Files changed

```
tests/helpers/makerOrders.ts                 +25 -7   (ioRatio, maxOutput, outputVaultBalance)
tests/integration/ui/syntheticOrdersStub.ts  +6 -6    (use real values in API summary)
tests/integration/ui/fixtures.ts             +10 -0   (vault tutorial localStorage seed)
tests/integration/ui/limitDeploy.spec.ts     +6 -9    (un-skip, update comment)
tests/integration/ui/marketBuy.spec.ts       +90 -1   (+ path-B test)
tests/integration/ui/marketSell.spec.ts      +84 -1   (+ path-B test)
```

## Don't (still applies from prior handover)

- Don't delete `forkOrdersStub.ts` — it's the fallback for the 4 baseline tests.
- Don't change the orderbook address — Path A depends on it.
- Don't try to extract `ioRatio` by parsing Rainlang bytecode — for
  fixed-limit, use the price we set; for other strategies, fall back to
  an anvil `quote()` eth_call.
