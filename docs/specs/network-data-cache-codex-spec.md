# Network Data Cache Store — Codex Specification

## 1. Problem statement
- The `(main)` layout issues independent TanStack Query calls on every route change to hydrate `sfts` and price feeds, immediately refetching the same heavy `getSfts` payload for the active network.【F:src/routes/(main)/+layout.svelte†L70-L110】
- The home page triggers an additional query that paginates the entire on-chain order book to derive buy/sell quotes for every SFT on the network, recalculating the same values whenever the page remounts.【F:src/routes/(main)/+page.svelte†L113-L198】
- Other routes (dashboard, trade detail, platform metrics) re-run their own subgraph and blockchain calls when navigated to because nothing shares cached payloads across views.
- Result: redundant traffic to the subgraph and order-book service, inconsistent cache lifetimes, and no central place to coordinate refresh intervals or monitor fetch health.

## 2. Goals
1. Introduce a single cache store that centralises all network-scoped data (subgraph snapshots, on-chain quotes, oracle prices, trade metrics) with per-domain freshness metadata.
2. Ensure navigating between routes reuses cached payloads instead of triggering immediate refetches; background refreshes should happen on deterministic timers per domain.
3. Allow views to subscribe to fine-grained slices (e.g., order-book quotes vs. vault snapshot) without worrying about fetch orchestration.
4. Provide instrumentation (status, lastUpdated, error) so the UI can surface stale data warnings or loading indicators precisely.

## 3. Non-goals
- Building new UI components for analytics; existing pages will adapt to the new store but not gain new features in this iteration.
- Persisting data across full reloads (no localStorage/IndexedDB persistence planned).
- Replacing existing TanStack Query usage for wallet-scoped data such as user orders; this effort targets shared network-wide datasets only.

## 4. Data taxonomy proposal
Each network cache entry groups data into four domains. The names and payload shapes are intentionally explicit so we can add domain-specific helpers later. Please review the taxonomy before we implement it.

| Domain key | Description | Source | Refresh interval (default) | Payload shape |
|------------|-------------|--------|----------------------------|---------------|
| `vaultSnapshot` | Latest off-chain asset receipt vault state, including deposits/withdrawals, holders, and certifications for every ST0x vault on the network. | Subgraph (`getSfts` rewritten to accept an explicit `Network`). | 2 minutes (customisable) | `OffchainAssetReceiptVault[]` (existing type) plus computed summary fields if needed. |
| `orderbookQuotes` | Current on-chain buy/sell quotes for ST0x tokens quoted against USDC, derived from the order-book service. | `fetchAndQuoteUSDCOrders` + `buildTokenPriceMap`. | 15 seconds | `{ [vaultAddress: string]: TokenPriceSummary }` where summary exposes `buy`, `sell`, `mid`, `liquiditySource`. |
| `priceFeeds` | Oracle prices from Pyth/TradingView for tokens that have price feed IDs. | `getPythQuotes` (and existing TradingView fallback). | 5 minutes | `TradingViewQuote[]` as today. |
| `tradeActivity` | Aggregated trade metrics (counts, volume buckets, optional timeseries) used by platform metrics/analytics. | `getTrades` wrapper per network (and optional cross-network aggregator). | On-demand, default 10 minutes when page subscribes. |

Open questions for review:
- Do we need to split `tradeActivity` into summaries vs. raw trades, or is one payload sufficient?
- Should any additional datasets (e.g., metadata subgraph, compliance flags) join this cache now?

## 5. Store architecture
### 5.1 Types
```ts
interface TimedResource<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T | null;
  updatedAt: number | null; // epoch ms of the last successful refresh
  error: unknown | null;
  refreshInterval: number; // ms, configurable per resource
  timerId: number | null; // browser interval handle
}

type NetworkResourceMap = {
  vaultSnapshot: TimedResource<OffchainAssetReceiptVault[]>;
  orderbookQuotes: TimedResource<Record<string, TokenPriceSummary>>;
  priceFeeds: TimedResource<TradingViewQuote[]>;
  tradeActivity: TimedResource<TradeMetricPayload>;
};

export type NetworkDataCache = Record<Network['id'], NetworkResourceMap>;
```

`TradeMetricPayload` will be defined during implementation (likely the shape already used by platform metrics).

### 5.2 Store implementation
- Create a dedicated module, e.g. `src/lib/stores/networkDataCache.ts`, exporting:
  - `networkDataCache` — a Svelte writable store holding the `NetworkDataCache`.
  - `getResource(networkId, domain)` helper returning a derived store for consumers.
  - `ensureResource(network, domain)` orchestrator that kicks off an immediate fetch if the resource is `idle` or `stale`, and schedules background refreshes respecting `refreshInterval`.
  - `stopResourceTimer(networkId, domain)` to allow routes to pause expensive refreshes when no subscribers remain (used for `tradeActivity`).
- Initialise each resource lazily: create entries the first time a network is requested rather than populating all networks up front.
- Store-level actions will manage the lifecycle of `setInterval` handles so timers survive route navigation but clean up on network change or manual stop.

### 5.3 Fetch orchestration
- Each domain defines its own `async fetchX(network: Network): Promise<...>` function colocated with the store module. They wrap the existing helpers and normalise errors.
- `ensureResource` workflow:
  1. If `status` is `loading`, bail to prevent duplicate in-flight requests.
  2. Set status to `loading`, clear previous error.
  3. Await domain fetcher; on success update `data`, `updatedAt`, set status `ready`; on failure set `error`, keep previous data, mark status `error`.
  4. Start/reschedule a timer that calls `refreshResource(networkId, domain)` after `refreshInterval`.
- Provide an optional `force` flag to bypass the `loading` guard when the user explicitly requests a refresh.
- When `currentNetwork` changes, the store should lazily hydrate the new network’s resources as consumers subscribe rather than prefetching everything.

## 6. Integration plan
### 6.1 Modify data fetchers
- `getSfts`: accept `(network: Network)` parameter instead of reading `currentNetwork` internally; slim payload if needed during implementation.【F:src/lib/query.ts†L1-L120】
- `fetchAndQuoteUSDCOrders`: ensure it works with explicit `networkId` and returns raw quotes; keep pagination logic but expose the `TokenPriceSummary` map.
- `getPythQuotes`: already takes tokens; update call sites to pass the network-specific list from the cache orchestrator.
- `getTrades`: wrap existing helper so it can be triggered by the store without mutating global network state.

### 6.2 Update routes to consume the cache
1. `(main)/+layout.svelte`
   - Replace TanStack Queries with subscriptions to `getResource($currentNetwork.id, 'vaultSnapshot')` and `getResource($currentNetwork.id, 'priceFeeds')` derived stores.
   - Remove manual `sfts.set` and `tokenGlobalQuote.set` writes; those stores can either be deprecated or become derived read-through stores pointing at the cache.【F:src/routes/(main)/+layout.svelte†L70-L124】
2. `(main)/+page.svelte`
   - Replace local query for quotes with a subscription to the `orderbookQuotes` resource.
   - Use the cache-provided `priceFeeds` instead of the layout’s store. The computed `TokenPriceSummary` map should be reused here and on trade detail pages.【F:src/routes/(main)/+page.svelte†L161-L228】
3. Platform metrics / analytics routes
   - Subscribe to `tradeActivity`; on mount call `ensureResource(networkId, 'tradeActivity', { force: true })` to trigger initial load and register a refresh timer. When the route unmounts, call `stopResourceTimer` to pause polling if no other listeners remain.
4. Any other components needing vault data or quotes should use derived selectors rather than launching independent queries.

### 6.3 Transition plan
- During implementation we can keep the existing `sfts` and `tokenGlobalQuote` stores but rewire them as derived stores that read from the cache to avoid a disruptive refactor.
- Once all pages migrate, delete redundant queries and ensure the old stores are removed or aliased.

## 7. Refresh strategy
| Domain | Default interval | Trigger behaviour |
|--------|------------------|-------------------|
| `orderbookQuotes` | 15 s | Always-on timer while at least one subscriber is active. Consider exponential backoff (up to 2 min) after consecutive failures. |
| `vaultSnapshot` | 120 s | Always-on timer per network once initial load succeeds. Immediate refresh when the user switches networks. |
| `priceFeeds` | 300 s | Always-on timer; allow manual `force` refresh when a component requires up-to-the-minute data. |
| `tradeActivity` | 600 s | Timer only runs when analytics routes mount. Allow manual refresh controls on those pages. |

Timers should run even if the originating component unmounts, provided other subscribers remain. Implement a simple reference count per resource to decide when to pause timers.

## 8. Error handling & diagnostics
- Expose `status` and `error` so UI can display stale data banners or retry buttons.
- Attach console warnings when a resource fails consecutively more than N times (configurable, default 3) to aid debugging.
- Emit custom events or provide a `subscribeToDiagnostics` hook if deeper observability is desired (optional stretch goal).

## 9. Testing considerations
- Unit tests for the store module should mock fetchers to validate status transitions, timer scheduling, and error persistence.
- Integration smoke tests for key routes should confirm navigation reuses cached data (e.g., by spying on fetchers and ensuring they are not re-invoked within the cache window).
- Consider adding a storybook or devtool panel later to visualize cache state (not part of this immediate implementation).

## 10. Open items for review
- Confirm taxonomy domains and refresh intervals meet product expectations.
- Decide whether additional datasets (metadata subgraph, compliance status) belong in this cache in v1.
- Validate that the 15-second quote refresh is acceptable for both home and trade pages; adjust if we need per-page overrides.
- Determine if cross-network prefetching is desired for analytics dashboards, or if they should continue to load on demand.

Once the taxonomy and refresh cadence are approved, the next step will be to implement `networkDataCache` and progressively migrate routes to consume it.
