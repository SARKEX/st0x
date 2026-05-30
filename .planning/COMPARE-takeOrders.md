# COMPARE-takeOrders: st0x SvelteKit vs st0x.rest.api Rust

Reference: side-by-side analysis of the market-order takeOrders construction
in this repo (`src/lib/services/marketOrderExecution.ts` + friends) and the
parallel Rust implementation in `../st0x.rest.api/src/routes/swap/`. All
citations point at HEAD on both repos.

## 0. Executive summary

Both implementations target the same downstream primitive (Rain
`IOrderBookV6.takeOrders4`) and reuse most of the same `rain.orderbook`
Rust crate machinery underneath — but they meet that primitive from very
different sides.

The TypeScript path in `st0x/src/lib/services/marketOrderExecution.ts:159`
is a long, browser-side orchestrator: it filters and sorts subgraph quotes
locally (`marketOrderExecution.ts:686-740`), simulates the walk with its
own bigint algorithm in `src/lib/utils/orderbook.ts:266`, then asks the
SDK (`getTakeOrdersCalldata`) to produce aggregated calldata while running
its own preflight loop with `getOrderQuotesBatch`
(`marketOrderExecution.ts:383-475`) and a per-order oracle fallback
(`marketTakeStore.ts:626-948`).

The Rust REST API (`/v1/swap/quote` + `/v1/swap/calldata`,
`st0x.rest.api/src/routes/swap/{quote,calldata}.rs`) is a thin POST shim:
`quote` builds candidates and runs `simulate_buy_over_candidates` purely
in `Float` space for the response; `calldata` forwards a
`TakeOrdersRequest` straight to `RaindexClient::get_take_orders_calldata`
(`rain.orderbook/.../raindex_client/take_orders/mod.rs:73-177`), which
redoes its own per-orderbook candidate selection, simulation,
preflight-by-removal and approval check.

The two stacks therefore use *the same* Rust simulator on the calldata
side, but the Rust HTTP `quote` and the TS preflight live in parallel
universes from the SDK's internal selection. That is the main source of
behavioural divergence below.

## 1. Input parameters

**TS `MarketOrderInput`** (`src/lib/services/marketOrderExecution.ts:107-126`):
`orderSide: 'Buy' | 'Sell'`, `amount: bigint` (asset for Buy/Sell, or payment
in spend mode), `inputMode?: 'amount' | 'spend'`, `slippageBps?: number`,
`assetToken`, `paymentToken`, `quotes: ProcessedQuote[]`, `network`. The
user's wallet supplies `taker` via `getSignerAddress()`
(`marketOrderExecution.ts:212`). Quotes are pre-fetched and passed in.

**Rust `SwapQuoteRequest`** (`st0x.rest.api/src/types/swap.rs:8-15`):
`input_token`, `output_token`, `output_amount`. No `taker`, no slippage, no
side, no decimals — and the API uses `input_token` to mean "what the taker
sells / what the maker receives" (used as the **maker input** filter at
`swap/mod.rs:90-92` and as `sell_token` at `swap/calldata.rs:59`). That is
the opposite naming convention from the TS side, where `inputAmountFilled`
is what the user *receives* (`src/lib/utils/orderbook.ts:59`).

**Rust `SwapCalldataRequest`** (`src/types/swap.rs:36-47`): `taker`,
`input_token` (sold), `output_token` (bought), `output_amount`,
`maximum_io_ratio`. No `mode`, no slippage — the route hard-codes
`TakeOrdersMode::BuyUpTo` at `calldata.rs:61`.

**Diff:**

- TS supports all four modes (`buyUpTo` / `spendUpTo` for Buy-by-asset,
  Buy-by-spend, Sell-by-asset; see `marketOrderExecution.ts:513-524`).
  Rust `calldata` is `BuyUpTo`-only.
- TS derives `priceCap` from `slippageBps`
  (`marketOrderExecution.ts:283-300`). Rust requires the caller to
  pre-compute `maximum_io_ratio` and pass it in (`calldata.rs:63`). The
  `/quote` endpoint uses `Float::max_positive_value()` (`quote.rs:80-83`)
  so the quote itself has no slippage cap.
- The Rocket handlers are `#[post]` decorated (`quote.rs:28`,
  `calldata.rs:27`).

## 2. Order discovery / list source

**TS:** The caller (Svelte page) passes a `quotes` array sourced from the
REST API or an SDK call upstream. Inside `executeMarketOrder` no fresh
subgraph read happens before the walk; the only fresh on-chain read is the
**per-order hydration** of `OrderV4` / `RaindexOrder`
(`marketOrderExecution.ts:304-337`) via `client.getOrders([networkId],
{ orderHash, owners: [] }, 1)`, and the **preflight**
`client.getOrderQuotesBatch(ordersWrapper, null, null)`
(`marketOrderExecution.ts:402-411`).

**Rust:** `RaindexSwapDataSource::get_orders_for_pair`
(`swap/mod.rs:82-104`) calls `client.get_orders(None, Some(filters), None,
None)` with `active: Some(true)` and a `GetOrdersTokenFilter { inputs:
vec![input_token], outputs: vec![output_token] }`. Then
`build_candidates_for_pair` (`swap/mod.rs:106-118`) calls
`build_take_order_candidates_for_pair`, which fans out one
`get_order_quotes_batch(...)` per order at the latest block
(`rain.orderbook/.../take_orders/candidates.rs:70-85`). The SDK side
(`raindex_client/take_orders/mod.rs:83-98`) does the same again via
`self.fetch_orders_for_pair(chain_id, sell_token, buy_token)` (which
itself reads `LocalDbOrders` and/or `SubgraphOrders`, see
`orders.rs:1224-1267`) and then `selection::build_candidates_for_chain`
re-runs the batch quote at the block pinned at line 88-89.

**Diff:**

- TS reuses upstream-supplied quotes; Rust always re-pulls fresh orders +
  fresh per-order quotes from the subgraph + on-chain. The Rust calldata
  path re-does this **twice** in a single request: once in the route
  (when called via `/quote`, but only if `/quote` was hit — `/calldata`
  skips the route-level fetch and goes straight to SDK).
- Rust's `/calldata` route never calls `get_orders_for_pair` or
  `build_candidates_for_pair` — they exist on the trait but are unused by
  `process_swap_calldata` (`swap/calldata.rs:49-67`). All candidate
  discovery on the calldata path happens inside the SDK.

## 3. Filtering for the user's side

**TS `filterQuotesForSide`** (`marketOrderExecution.ts:686-722`): explicit
normalised-address matching of maker input/output to user-perspective
asset/payment, **plus** `quote.side === 'ask'` (Buy) or `'bid'` (Sell),
**plus** a finite-positive `quotePerAsset`. Then
`excludeTakerOwnedQuotes` (`marketOrderExecution.ts:145-154`) drops
self-orders by comparing `quote.orderData.owner` / `quote.sgOrder.owner`
to `takerAddress`. The walk is fed by
`sortQuotesByPrice(externalQuotes, orderSide)`
(`marketOrderExecution.ts:250`).

**Rust:**

- Subgraph filter: `inputs: Some(vec![input_token])`, `outputs:
  Some(vec![output_token])` (`swap/mod.rs:88-92`, also in SDK at
  `orders.rs:1230-1238`). Maps to the maker's perspective: maker input =
  user-sold token, maker output = user-bought token.
- Per-candidate filter: `matches_direction` (`candidates.rs:15-25`)
  re-checks the on-chain `OrderV4.validInputs[input_index].token ==
  input_token && validOutputs[output_index].token == output_token` for
  each IO pair returned by `get_order_quotes_batch`. `indices_in_bounds`
  (`candidates.rs:10-13`) guards index sanity. `has_capacity`
  (`candidates.rs:27-31`) drops zero/negative-`max_output` quotes.
  `try_build_candidate` (`candidates.rs:87-128`) also drops failed quotes
  (`quote.success == false`).

**Diff:**

- No self-trade exclusion on the Rust side — `taker` is only used for
  the approval/preflight check; nothing in `candidates.rs` or
  `selection.rs` filters out orders owned by the taker.
- TS dual-filters on both `inputAddr/outputAddr` AND `side` flag
  pre-computed upstream; Rust filters on `validInputs`/`validOutputs`
  directly from the on-chain order struct.
- Rust requires per-IO-pair indices (`input_io_index`, `output_io_index`)
  inside one order to match the requested direction. TS keeps one
  (input_index, output_index) pair per `ProcessedQuote` and trusts
  upstream to have picked the right pair (see
  `ProcessedQuote.inputIOIndex/outputIOIndex` at
  `src/lib/utils/orderbook.ts:82-83`).

## 4. Sorting / ranking

**TS `sortQuotesByPrice`** (`marketOrderExecution.ts:727-740`): sorts the
array of `ProcessedQuote` by `quotePerAsset` ascending for Buy (lowest ask
first), descending for Sell (highest bid first). Missing prices sort to
the end via `Infinity` / `0` fallback. The walk then iterates in this
fixed order. No secondary tie-break.

**Rust `sort_candidates_by_price`** (`take_orders/simulation.rs:23-41`):
always ascending by `Float ratio`, regardless of mode. The Rust definition
of `ratio` is **maker input / maker output** = "what the user sells per
unit user buys" (see how `ratio` is consumed in `take_leg_for_buy`: `input
= output * price`, `simulation.rs:43-68`). Lowest ratio = cheapest for the
taker in both directions. Tie-breaks: stable sort; ties propagate to a
separate orderbook-level tiebreak in `select_best_orderbook_simulation`
(`raindex_client/take_orders/selection.rs:80-102`) — equal totals fall
through to `worst_price` (lower is better) and then to the lower
orderbook address.

**Diff:**

- TS sorts asks ascending, bids descending — both in price-per-asset
  (human) space. Rust always sorts ratio ascending — but in **(maker
  input / maker output) ratio** space, which is symmetric across buy/sell
  because the simulator doesn't care about "which side" the taker is on.
- No tie-break in TS beyond the original array's stable order. Rust has
  explicit worst-price + lower-address tie-breakers across orderbooks
  (`selection.rs:88-96`).
- TS sorts the union of all orders (no orderbook grouping). Rust groups
  by `candidate.orderbook` (one `HashMap` entry per orderbook,
  `selection.rs:54-60`) and simulates each orderbook in isolation, then
  picks the **single best orderbook**. That is a load-bearing structural
  difference — see §10.

## 5. Walking algorithm

**TS `walkOrderbook`** (`src/lib/utils/orderbook.ts:266-411`): operates in
bigint with explicit decimal scaling. `targetMode` is `'asset'` when Sell
or when Buy+`mode==='receive'`; `'payment'` when Buy+`mode==='spend'`
(`orderbook.ts:308-309`). Loop body: read `computeAvailableQuantity` for
asset units the order can supply/absorb (Buy uses `maxOutput` directly;
Sell converts payment-denominated `maxOutput` to asset using `price`,
`orderbook.ts:230-251`). Then take `min(remainingAsset, availableAsset)`
or, in payment mode, compute the asset for the remaining payment budget.
Payment-mode last leg gets a recompute-to-exact-budget adjustment at lines
363-381. Returns `{ inputAmountFilled, outputAmountGiven, ioRatio, fills:
QuoteFill[] }`, plus per-fill `{ assetAmount, paymentAmount, price }`.

**Rust `simulate_buy_over_candidates` / `simulate_spend_over_candidates`**
(`take_orders/simulation.rs:164-230`): operate entirely in `Float` (Rain's
decimal Float type — no token-decimal scaling required). Buy walk anchors
on `remaining_output` (the buy target); for each leg: `output = min(max_output,
remaining_output)`, `input = output * price` (`simulation.rs:43-68`).
Spend walk anchors on `remaining_input`; for each leg:
`max_input_for_candidate = max_output * price`, `input = min(max_input_for_candidate,
remaining_input)`, `output = input / price` (`simulation.rs:70-108`).
Zero-price legs in spend mode return `(0, max_output)` — i.e. "take it
all for free" (`simulation.rs:78-87`). Returns `{ legs, total_input,
total_output }`.

**Diff:**

- TS works in bigint with one ad-hoc `PRICE_SCALE = 10n ** 18n`
  (`orderbook.ts:20`) and explicit `scaleAmount` calls. Rust avoids
  decimal scaling entirely by using `Float`.
- TS computes `inputAmountFilled` from the user perspective (received).
  Rust reports `total_input` from the **maker** perspective (= what the
  taker pays). This is the inverse mapping and trips up any direct
  comparison.
- TS has a payment-budget exactness fix-up in the last leg
  (`orderbook.ts:363-381`). Rust does not — it relies on `Float`
  precision and lets the last leg be a clean `input =
  min(max_input_for_candidate, remaining_input)` without rounding back.
- TS, when the quote's `price` is 0, **skips** the leg
  (`orderbook.ts:322-323`: `if (!price || price <= 0) continue;`). Rust
  *includes* zero-ratio legs in both buy and spend
  (`simulation.rs:78-87`; tests `test_simulate_buy_zero_price_candidate_included`,
  `simulation.rs:541-574`). Behavioural divergence: a maker offering
  tokens for free is walked in Rust, ignored in TS.

## 6. Slippage / ratio cap

**TS:** Derived from `slippageBps` (default 100 = 1%, max 5000,
`marketOrderFill.ts:8-10`). `computeRatioMultiplier` returns `String(1 +
bps/10_000)` (`marketOrderFill.ts:25-28`). Applied to the **worst-leg**
quote ratio via `computeEmergencyRatioHex`
(`marketOrderExecution.ts:91-105`) to produce `emergencyRatioHex`. For Buy
this maps to a human price-cap string `worstFillPrice * multiplier`
(`marketOrderExecution.ts:74-85`, `humanPriceCapStr`); for Sell it formats
the emergency Float directly (`marketOrderExecution.ts:297-299`). The cap
is **per-leg** (single `priceCap` field on `TakeOrdersRequest`) — it
lands in `TakeOrdersConfigV5.maximumIORatio` after the SDK regenerates
calldata.

**Rust:** The simulator filters candidates by `price_cap` *before* sorting
(`filter_candidates_by_price_cap`, `simulation.rs:142-162`) — any ratio
strictly greater than the cap is dropped. The cap then goes verbatim into
`BuiltTakeOrdersConfig.maximumIORatio` (`take_orders/config.rs:104-109`).
For `/quote`, the route passes `Float::max_positive_value()`
(`quote.rs:80-83`) — effectively no cap. For `/calldata`, the route
passes the request's `maximum_io_ratio` string verbatim
(`calldata.rs:63`).

**Diff:**

- TS applies the cap downstream as a single number that the SDK turns into
  `maximumIORatio`. Rust applies the cap *both* as a filter at simulation
  entry *and* as the `maximumIORatio` field — these are
  belt-and-suspenders against the same constraint.
- TS derives the cap from a user UX knob (bps); Rust requires the caller
  to know the absolute Float and pass it. The REST `/quote` endpoint
  deliberately doesn't constrain — meaning the displayed
  `estimated_io_ratio` reflects the *full available depth*, not what a
  subsequent `/calldata` call with a tight cap would produce.
- Slippage in TS is symmetric across Buy/Sell
  (`marketOrderExecution.ts:279-284`); Rust has no notion of side at this
  layer.

## 7. Liquidity bound

**TS:** No vault-balance read. The walk stops when `assetAccumulated >=
targetAmount` (`orderbook.ts:319`) or `paymentAccumulated >= targetAmount`
(`orderbook.ts:320`). Maker capacity is read from `quote.maxOutput`
(`orderbook.ts:215-217`, decoded via `parseFloatHex`). The Phase-2
preflight via `getOrderQuotesBatch` (`marketOrderExecution.ts:402-411`)
re-reads `formattedMaxOutput` on-chain and drops survivors with
`Number(maxOut) > 0` failing — this is the closest TS gets to a
vault-balance check, but it's expressed as "the order still has output
capacity at quote time".

**Rust:** Two layers. (1) `has_capacity` filters at candidate-build time
(`candidates.rs:27-31`). (2) For exact modes only,
`build_take_orders_config_from_simulation` raises `InsufficientLiquidity {
requested, available }` if `achieved < target`
(`take_orders/config.rs:73-85`). For *UpTo modes it silently returns
whatever was achievable. (3) The SDK's preflight loop runs
`simulate_take_orders` against the orderbook and, on revert, calls
`find_failing_order_index` to drop the failing leg one at a time
(`raindex_client/take_orders/mod.rs:126-172`). This is a one-by-one
removal up to `orders.len()` iterations — a different shape than TS's
"re-walk up to 2 levels with survivors" loop.

**Diff:**

- TS preflight uses fresh subgraph quotes (`getOrderQuotesBatch`) and
  re-filters by current `maxOutput`. Rust preflight uses on-chain
  `eth_call` simulation of the actual `takeOrders4Call` and removes
  whichever order made it revert. These are different signals: the TS
  check would not catch an order whose `maxOutput` is healthy but whose
  evaluable reverts at execution time; the Rust check would.
- Rust separates "exact" (must hit target or error) from "upTo"
  (best-effort) explicitly. TS uses `*UpTo` only
  (`marketOrderExecution.ts:512-524`).
- Neither side explicitly reads the taker's vault balance — both rely on
  the orderbook's own `maxOutput` quote machinery for maker-side capacity.
  Allowance/balance is checked taker-side in Rust via
  `check_taker_allowance` (`raindex_client/take_orders/approval.rs:21-44`);
  in TS the SDK handles allowance probing through
  `getTakeOrdersCalldata`'s `approvalInfo` path (`marketTakeStore.ts:530-549`).

## 8. Calldata output

**TS:** The walk yields ordered `fills` (`marketOrderExecution.ts:269`).
The first fill's `quote.orderData` and `quote.sgOrder` are pulled into
`aggregatedParams` (`marketOrderExecution.ts:575-588`). A
`TakeOrdersRequest` is built (`marketOrderExecution.ts:525-533`) and
handed to `handleAggregatedTakeOrdersCalldata` (`marketTakeStore.ts:493-611`),
which calls `client.getTakeOrdersCalldata(takeRequest)` and dispatches the
returned `takeOrdersInfo.calldata` to `takeOrdersInfo.orderbook` (line
581-583). If the aggregated path returns `false` (e.g. oracle orders need
signed context), the code falls back to a per-order loop
(`marketTakeStore.ts:626-948`) that calls
`RaindexOrder.getTakeCalldata(inputIndex, outputIndex, taker, mode,
amountStr, priceCapStr)` per fill, including individual approval handling
and leg-skip on reroutable errors (`marketTakeStore.ts:858-871`). Signed
context is populated inside `getTakeCalldata` by the oracle server.

**Rust:** `RaindexClient::get_take_orders_calldata`
(`raindex_client/take_orders/mod.rs:73-177`) always emits aggregated
calldata via `takeOrders4Call { config }.abi_encode()`
(`raindex_client/take_orders/result.rs:382-386`). The `TakeOrderConfigV4`
entries are built with empty `signedContext: vec![]`
(`take_orders/config.rs:92-98`). The HTTP layer (`swap/mod.rs:120-162`)
maps that to either `SwapCalldataResponse { to: orderbook, data:
calldata, value: 0, estimated_input, approvals: [] }` or, if approval is
needed, a response with empty `data` and a single `approvals` entry
(`mod.rs:130-144`).

**Diff:**

- Rust has no per-order/oracle fallback — `signedContext` is always
  empty. Any maker whose execution requires an oracle-signed context will
  revert at preflight on the Rust side (caught by
  `find_failing_order_index` and removed). The TS per-order path
  explicitly populates oracle context via the SDK.
- Rust returns the `data` bytes plus a separate `approvals` list to the
  HTTP client. TS dispatches the tx itself (browser wallet) and routes
  approvals through the in-page `walletService`.
- Rust's response includes `estimated_input` (= `expected_sell` =
  `sim.total_input`, see `mod.rs:146-149` and `result.rs:405`). TS
  surfaces the same number as `simulation.outputAmountGiven` /
  `walkResult.inputAmountFilled` on its `TakeOrdersParams`, but never as
  a top-level field of the dispatched tx.

## 9. Error / preflight handling

**TS:**

- `excludeTakerOwnedQuotes` + `filterQuotesForSide` → early
  `no_quotes_available` (`marketOrderExecution.ts:240-246`).
- `walkOrderbook` empty → `no_walk_fills` (line 260-266).
- Hydration failures: warn-only (line 333-336) but later checked and
  short-circuited (line 363-369).
- Preflight loop `PREFLIGHT_MAX_WALKS = 2` (line 63); on RPC error →
  `preflight_chain_unreachable`; on all-candidates-dropped →
  `preflight_order_vanished` or `auto_retry_exhausted`
  (`marketOrderExecution.ts:454-484`).
- SDK aggregated failure with a recoverable message routes to per-order
  fallback via `shouldFallbackFromAggregatedTake`
  (`marketTakeStore.ts:136-140` + `isSkippableMakerLegError` 102-129).
- Per-leg errors during the oracle loop: parse "but only X available" to
  shrink and retry (`marketTakeStore.ts:142-158`, used at 826-842);
  skip-and-reroute to next leg if `isSkippableMakerLegError` (line
  858-871, 917-930).

**Rust:**

- `parse_request` → `RaindexError::SameTokenPair / NonPositiveAmount /
  NegativePriceCap / FromHexError / Float` (`take_orders/request.rs:31-55`).
- `fetch_orders_for_pair` empty → `RaindexError::NoLiquidity`
  (`orders.rs:1262-1264`).
- `build_candidates_for_chain` empty → `RaindexError::NoLiquidity`
  (`selection.rs:27-29`).
- `select_best_orderbook_simulation` no non-empty sim →
  `RaindexError::NoLiquidity` (`selection.rs:109`).
- `build_take_orders_config_from_simulation` exact-mode underfill →
  `RaindexError::InsufficientLiquidity { requested, available }`
  (`config.rs:79-84`).
- Preflight loop in `get_take_orders_calldata`: simulate → if OK return;
  if revert, call `find_failing_order_index` (binary-style one-by-one
  drop, `preflight.rs:184-228`); if only one left and still failing →
  `PreflightError("All orders failed simulation")` (`mod.rs:155-159`); if
  can't identify culprit → `PreflightError("Simulation failed but could
  not identify failing order")` (line 164-168); if iteration cap (=
  original `orders.len()`) blown → `PreflightError("Exceeded maximum
  preflight iterations")` (line 174-176).
- `swap/mod.rs::map_raindex_error` collapses these to HTTP statuses:
  `NoLiquidity` / `InsufficientLiquidity` → 404; parse-class → 400;
  `PreflightError` → 400; else 500 (`swap/mod.rs:165-188`).

**Diff:**

- TS has a *richer* terminal classification (transcript reasons fed to
  `captureTakeOrderFailure`) and routes around oracle/per-order failures
  by changing dispatch path. Rust's only recovery move is "drop the
  failing order and re-simulate", which only works if the failure was
  localised to one leg.
- TS preflight uses fresh subgraph quotes; Rust preflight uses on-chain
  simulation. The Rust check is stricter — it actually verifies the
  trade succeeds against the live orderbook — but it does *not* validate
  that the maker has not been drained between this check and submission.

## 10. Where the "preferentially best-ratio" promise can break

1. **Single-orderbook constraint (Rust only):**
   `select_best_orderbook_simulation` groups candidates by
   `candidate.orderbook` and runs a per-orderbook simulation, then picks
   one (`selection.rs:49-110`). If the best-ratio liquidity is split
   across two orderbook contracts, Rust will choose whichever single
   orderbook delivers the highest total output for the target — *not*
   the union. TS does not group by orderbook at all; its walk consumes
   any order regardless of orderbook (`marketOrderExecution.ts:250-258`).
   A trader using `/v1/swap/calldata` may legitimately get a worse ratio
   than the same trader using the SvelteKit UI for the same instantaneous
   book state.

2. **Aggregated-only calldata + missing signed context (Rust only):**
   Rust emits one `takeOrders4` with `signedContext: []` for every leg
   (`take_orders/config.rs:96`). Any oracle-gated order will revert on
   `simulate_take_orders`, get dropped by `find_failing_order_index`, and
   the user receives calldata that skips it — silently downgrading to
   the next-best ratio without surfacing the reason. TS's per-order
   oracle path keeps that liquidity reachable.

3. **Stale subgraph between quote and calldata (both, asymmetric):** TS
   guards this with the `getOrderQuotesBatch` preflight + a max-2-level
   auto-walk (`marketOrderExecution.ts:383-484`). Rust's `/quote` and
   `/calldata` are independent HTTP calls — the Rust SDK re-fetches
   orders inside `get_take_orders_calldata`, so the calldata path *is*
   fresh, but the `/quote` response a client showed the user may have
   been computed against a different order set than the calldata. There
   is no shared idempotency token, no quote-id passed back to
   `/calldata`.

4. **Self-trade exclusion (TS only):** TS drops orders owned by the taker
   (`marketOrderExecution.ts:145-154`). Rust does not. A user calling
   `/v1/swap/calldata` on a pair where their own maker order is the
   best-ratio will receive calldata to self-trade.

5. **Zero-price quote handling (divergent):** TS skips legs with `price
   <= 0` (`orderbook.ts:322-323`); Rust walks them
   (`simulation.rs:78-87`, plus `test_simulate_buy_zero_price_candidate_included`).
   A "free liquidity" maker is included in Rust's `total_output` but
   never appears in TS's `walkResult.fills`. The two systems will publish
   different `estimated_io_ratio` for the same book.

6. **Slippage cap symmetry:** TS caps via the SDK's `priceCap` *only*
   (the user's slippage tolerance lives in the cap). Rust's simulator
   applies `price_cap` as a hard pre-filter that drops candidates before
   sorting (`simulation.rs:142-162`). If the REST caller passes a very
   tight `maximum_io_ratio` (close to the best ratio), the Rust
   simulator may produce zero legs and respond `NoLiquidity` even though
   the TS path would have *some* fills before slippage rejection. The
   HTTP user has no way to recover with a slightly looser cap without
   retrying.

7. **Partial fills:** TS detects partial fills post-trade via
   `detectPartialFill` (`partialFillDetection.ts:62-100`) comparing
   actual vs requested on the user-typed anchor
   (`marketOrderFill.ts:64-83`). Rust signals partial fill only via the
   `TakeOrderEstimate.is_partial` field exposed elsewhere
   (`raindex_client/take_orders/result.rs:308-355`) — but the HTTP
   `/quote` and `/calldata` responses don't include it
   (`SwapQuoteResponse` and `SwapCalldataResponse` carry no partial-fill
   bit; `types/swap.rs:17-61`). A REST client comparing `output_amount`
   to `estimated_output` is the only way to tell.

8. **No vault drain detection between quote and submit:** Both sides
   re-fetch quote data inside the calldata path (Rust via SDK, TS via the
   preflight loop). Neither passes a block-pin from `/quote` to
   `/calldata` — so a maker that drains in the interim quietly
   disappears from the calldata response (Rust) or gets dropped by the
   auto-walk and may produce `preflight_order_vanished` (TS).

9. **Naming inversion at the HTTP boundary:** `SwapQuoteRequest.input_token`
   is used as the *maker input* (= taker's sell side) at
   `swap/mod.rs:88-92`. But `orderbook.ts:59` defines `inputAmountFilled`
   as **user-received**. A developer porting logic between the two repos
   who reaches for "input" risks reversing the trade direction. Flagging
   because the field labelling crosses a process boundary without a
   clarifying rename.

10. **POST vs GET:** Both Rocket routes are `#[post]`
    (`quote.rs:28`, `calldata.rs:27`), not GET.

---

## Differences worth resolving (punch list)

- **Self-trade exclusion**: TS strips taker-owned quotes; Rust doesn't.
  The REST API needs the same `taker != maker.owner` filter or the API
  will quote and emit calldata for self-trades.
  (`marketOrderExecution.ts:145-154` vs absence in
  `selection.rs`/`candidates.rs`.)

- **Single-orderbook vs multi-orderbook walk**: TS treats the union; Rust
  picks one orderbook (`selection.rs:49-110`). For pairs that exist on
  multiple orderbook contracts the answers diverge. Pick one model and
  document it.

- **Zero-price legs**: TS skips, Rust walks. Decide whether a zero-ratio
  maker is a feature (Rust) or a malformed quote (TS) and harmonise
  (`orderbook.ts:322-323` vs `simulation.rs:78-87`).

- **Signed context for oracle orders**: Rust emits empty `signedContext`;
  TS has a dedicated oracle path (`marketTakeStore.ts:626-948`). The REST
  API silently drops oracle-gated liquidity in calldata. Either populate
  context server-side or document that REST `/calldata` excludes oracle
  makers.

- **Slippage representation**: TS computes the cap from `slippageBps`
  (`marketOrderFill.ts:25-28`); Rust requires absolute `maximum_io_ratio`
  upfront and uses no cap on `/quote`. A REST client cannot ask "give me
  a quote at 1% slippage" without two round-trips.

- **`/quote` does not pin a block / quote ID**: There's no idempotency
  token between `/quote` and `/calldata`. The TS UI mitigates this with
  its own pre-flight + auto-walk; REST clients have no equivalent.

- **Mode coverage on REST**: `/v1/swap/calldata` hard-codes `BuyUpTo`
  (`calldata.rs:61`). TS supports all four modes
  (`marketOrderExecution.ts:513-524`). A taker who wants to "sell up to
  X asset" or "spend exactly Y payment" has no HTTP path today.

- **Naming convention at the boundary**: `input_token` on the REST
  request means "taker sells / maker receives" (`swap/mod.rs:88-92`),
  while `inputAmountFilled` in TS means "user receives"
  (`orderbook.ts:59`). A rename to `sell_token` / `buy_token` on the
  REST DTO (the SDK already uses those names) would prevent a class of
  integration bugs.

- **Partial-fill signalling on REST**: Internal
  `TakeOrderEstimate.is_partial` exists (`result.rs:308-355`) but isn't
  surfaced in `SwapQuoteResponse` / `SwapCalldataResponse`. Add an
  explicit `is_partial` (or `expected_output_amount <
  requested_output_amount`) flag so REST clients don't have to infer.

- **Preflight semantics**: TS's `getOrderQuotesBatch` survivors-walk and
  Rust's `simulate_take_orders` + `find_failing_order_index` catch
  different failure classes. Decide whether the canonical check is "live
  quote depth" or "live execution simulation" and align (or run both).
