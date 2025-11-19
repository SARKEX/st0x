# IO Terminology & Flow Recommendations

1. **Fix `classifyFlow` semantics** — `src/lib/utils/tokenMath.ts` currently returns `'bid'` when `input === quote`. Invert the conditions so bids are detected only when the **output** address equals the quote token. Update the downstream branch in `parseTradeAmounts` to continue pairing quote/asset amounts with the corrected side. Adjust `tokenMath.test.ts` accordingly so the tests lock in the invariant “bid ⇒ quote is the output token”.

2. **Audit every consumer of `analyzeTrade` output** — After the fix above, review `tradeToPoint` (`src/routes/(main)/trade/[id]/+page.svelte`), mid-price calculations, depth charts, and `platform-metrics/+page.svelte`. Rename local variables to `bestBid` / `bestAsk`, and ensure UI labels (e.g., “Buy price”) merely translate bid/ask into verbs while keeping storage and calculations in bid/ask terms.

3. **Normalize enums and types to Bid/Ask outside the UI** — Replace `'Buy' | 'Sell'` unions in shared types (`MarketOrderSide` in `src/lib/utils/marketPrice.ts`, `MarketOrderSummary.orderSide`, `transactionStore.handleTakeOrders` options, `LimitOrder.type` in `src/lib/network.ts`, etc.) with `'Bid' | 'Ask'`. Keep the Buy/Sell vocabulary exclusively in form props and convert to bid/ask the moment user intent enters the data layer.

4. **Rename `passedOutputToken` props in order components** — In `src/lib/components/orders/MarketOrder.svelte` and `LimitOrder.svelte` the `passedOutputToken` prop actually carries the asset token (the order input when bidding). Rename it (e.g., `assetToken`) and propagate the change through every computed variable and child component to eliminate misleading “output token” terminology in JSX/Svelte markup and TypeScript types.

5. **Carry bid/ask labels into `transactionStore` metadata** — After the enum cleanup, ensure `transactionStore.handleTakeOrders` receives and stores the bid/ask value. `TransactionModal` should format that enum for display (mapping Bid→Buy, Ask→Sell). This guarantees we never persist `'Buy'` or `'Sell'` alongside quantities or decimals, aligning with the repo rule.

6. **Re-test order ingestion paths** — Once the above changes land, rerun the existing suites for `tokenMath`, `marketPrice`, `quote`, and `getDeploymentArgs`. Add regression tests that encode a known bid and ask order, ensuring parsing preserves the correct input/output pairing and never matches an “input” address to an “output decimals” field.

