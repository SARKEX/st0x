<!-- refreshed: 2026-04-28 -->
# Architecture

**Analysis Date:** 2026-04-28

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         Routes / Pages (SSR)                         │
│   `src/routes/(main)/`  `src/routes/admin/`  `src/routes/docs/`      │
│   `src/routes/access/`  `src/routes/+layout.svelte`                  │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Components (Svelte 4)                           │
│   `src/lib/components/{orders,charts,referrals,rewards,ui}/`         │
│   Modals: AuthModal, DepositModal, TransactionModal, …               │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ subscribes / dispatches
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│   Stores (writable / derived)        TanStack Query (cached server   │
│   `src/lib/stores/`                   state)  `src/lib/queries/`     │
│   - authStore   - dynamicStore        - orderbook  - oracleQuotes    │
│   - transaction - rewardsStore        - balances   - vaults          │
│   - accessStore - referralStore       - priceFeeds - tradeActivity   │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Services (business logic)                      │
│   `src/lib/services/`                                                │
│   - walletService.ts        (unified Dynamic/wagmi tx + signing)     │
│   - marketOrderExecution.ts (orderbook walk, take-orders calldata)   │
│   - orderDeployment.ts      (Rain DotrainGui → deploy args)          │
│   - wrapService.ts, analytics.ts                                     │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│   API layer (`src/lib/api/`)        Clients (`src/lib/clients/`)     │
│   - orders.ts (st0x REST)           - http.ts (fetchJson + retry)    │
│   - st0xApi.ts                       - subgraph.ts (GraphQL)          │
│   - subgraph.ts (SFT GraphQL)        - raindex.ts (RaindexClient pool)│
│   - pyth.ts (Hermes)                 - pyth.ts                        │
│   - tradingview.ts                   - queryClient.ts (TanStack)      │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SvelteKit server endpoints                        │
│   `src/routes/api/**/+server.ts`  +  `src/hooks.server.ts` (CORS,    │
│   CSP, session auth, wallet-registration guard)                       │
│   Server libs: `src/lib/server/` (auth, snapshots, rewards, kv,      │
│                                   accessCodes, signatureChallenge)   │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Off-chain                            On-chain                       │
│  - Goldsky subgraphs (orderbook       - Rain Orderbook v4 contract   │
│    + SFT + metadata)                    `0xe522cB…7C9D` (Base 8453)  │
│  - Pyth Hermes (real-time prices)     - ERC4626 SFT vaults           │
│  - Vercel Blob / KV (snapshots)       - Pyth oracle contract         │
│  - Onramper, Nansen, PostHog                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root layout | Wallet bootstrap (svelte-wagmi), Dynamic wrapper, QueryClientProvider, global modals, wallet-cookie sync | `src/routes/+layout.svelte` |
| Server hooks | CORS, CSP/security headers, admin session auth, wallet-registration guard, bot rejection | `src/hooks.server.ts` |
| Auth store | Unifies wallet vs. Dynamic into `walletAddress` / `authMethod` / `isReady` | `src/lib/stores/authStore.ts` |
| Wallet service | Routes `sendTransaction` / `signMessage` to wagmi or Dynamic provider | `src/lib/services/walletService.ts` |
| Market order exec | Orderbook walk, slippage cap, hydrate `OrderV4` bytes, dispatch take-order | `src/lib/services/marketOrderExecution.ts` |
| Order deployment | Loads Dotrain GUI from rain.strategies registry, configures deposit + vault, returns deploy args | `src/lib/services/orderDeployment.ts` |
| Order perspective types | Single source of truth for INPUT/OUTPUT semantics (maker vs. taker) | `src/lib/types/orderPerspective.ts` |
| Networks config | Per-chain RPCs (with fallbacks), subgraph URLs, payment tokens, trusted orderbooks | `src/lib/config/networks.ts` |
| Tokens config | Wrapped/unwrapped/legacy address variants, Pyth feed IDs, TradingView symbols | `src/lib/config/tokens.ts` |
| Raindex client pool | Two-client load-balanced `RaindexClient` per network with hand-maintained YAML | `src/lib/clients/raindex.ts` |
| Subgraph client | GraphQL POST + paginated fetch helper | `src/lib/clients/subgraph.ts` |
| Query client | Single shared `QueryClient` (`staleTime: Infinity`) | `src/lib/clients/queryClient.ts` |
| Snapshot pipeline | scraper → pyth → processor → generator → blob storage | `src/lib/server/snapshots/` |

## Pattern Overview

**Overall:** SvelteKit feature-grouped layered app — UI components → stores/queries → services → API/clients → SvelteKit server routes / external networks.

**Key Characteristics:**
- **Two-track state**: Svelte stores for client-only state (auth, modals, transaction status); TanStack Query for cached server/RPC state (orders, oracle quotes, vaults).
- **Dual auth model**: External wallet (wagmi + WalletConnect/injected) and Dynamic embedded wallet are unified by `authStore` derived stores; signing/sending is routed by `walletService`.
- **Server-side trust boundary**: `hooks.server.ts` enforces CORS, CSP, admin sessions, and wallet-registration; protected `/api/*` routes return 401 / redirect to `/access` when unmet.
- **Rain orderbook native**: All trading flows speak `RaindexClient` + `@rainlanguage/orderbook` types and use Rainlang for deployed strategies; market orders go through a manual orderbook walk in service code rather than an aggregator.
- **Maker vs. taker token perspective**: explicit, typed split between `MakerOrderTokens` (on-chain INPUT/OUTPUT) and `TakerOrderTokens` (user-facing `takerWants`/`takerPays`) — this is the most common bug surface and is encoded as types, not conventions.

## Layers

**Routes / Pages (`src/routes/`):**
- Purpose: SvelteKit entry points, SSR + client hydration. Layout groups: `(main)` (default UI), `admin` (gated), `access` (registration), `docs` (mdsvex), `api` (server endpoints).
- Location: `src/routes/`
- Contains: `+page.svelte`, `+layout.svelte`, `+page.server.ts`, `+server.ts`
- Depends on: `$lib/components`, `$lib/stores`, `$lib/queries`, `$lib/services`
- Used by: end users (browser) and external callers (API)

**Components (`src/lib/components/`):**
- Purpose: Presentational + container Svelte 4 components, feature-grouped.
- Location: `src/lib/components/`
- Contains: ~60 `.svelte` files split into `orders/`, `charts/`, `referrals/`, `rewards/`, `icons/`, `ui/` (generic) and ~40 top-level modal/page components
- Depends on: stores, queries, services
- Used by: routes

**Stores (`src/lib/stores/`):**
- Purpose: Client-side state (auth, modal visibility, transaction lifecycle, tutorials, referrals, rewards).
- Location: `src/lib/stores/`
- Contains: writable/derived stores; `authStore.ts` is the unification layer; `transaction.ts` owns the global tx state machine.
- Depends on: `svelte-wagmi`, `dynamicStore`, `$lib/queries`
- Used by: components and services

**Queries (`src/lib/queries/`):**
- Purpose: TanStack Query factory functions parameterised by `Network`. Single source of truth for cached server state.
- Location: `src/lib/queries/`
- Contains: `orderbook.ts`, `oracleQuotes.ts`, `priceFeeds.ts`, `balances.ts`, `vaults.ts`, `tradeActivity.ts`, `costBasis.ts`
- Depends on: `$lib/api`, `$lib/clients`, `queryClient`
- Used by: components, `stores/index.ts` (which wires queries into derived stores)

**Services (`src/lib/services/`):**
- Purpose: Business logic that orchestrates wallet, contracts, queries, and stores.
- Location: `src/lib/services/`
- Contains: `walletService.ts`, `marketOrderExecution.ts`, `orderDeployment.ts`, `wrapService.ts`, `analytics.ts`
- Depends on: `$lib/api`, `$lib/clients`, `$lib/stores`, `@rainlanguage/orderbook`, `viem`
- Used by: components

**API (`src/lib/api/`):**
- Purpose: Domain-typed wrappers over external HTTP/GraphQL endpoints. Returns app-shaped data, not raw responses.
- Location: `src/lib/api/`
- Contains: `orders.ts` (st0x REST → ProcessedQuotes), `st0xApi.ts`, `subgraph.ts` (SFT GraphQL), `pyth.ts`, `tradingview.ts`
- Depends on: `$lib/clients/http`, `$lib/clients/subgraph`
- Used by: queries, services

**Clients (`src/lib/clients/`):**
- Purpose: Low-level transport — HTTP, GraphQL, RaindexClient pool, Pyth, shared QueryClient.
- Location: `src/lib/clients/`
- Contains: `http.ts` (fetchJson + retry), `subgraph.ts`, `raindex.ts` (two-client pool with hand-maintained YAML), `pyth.ts`, `queryClient.ts`
- Depends on: `viem`, `@rainlanguage/orderbook`, `@tanstack/svelte-query`
- Used by: api, services, queries

**Server libs (`src/lib/server/`):**
- Purpose: Server-only modules (never imported by browser code). Auth, KV, blob, rate-limiting, snapshots, access codes, audit log.
- Location: `src/lib/server/`
- Contains: `auth.ts`, `accessCodes.ts`, `adminAuth.ts`, `csrf.ts`, `kv.ts`, `pinata.ts`, `rateLimit.ts`, `signatureChallenge.ts`, `snapshots/`, `rewards/`, `nansenTiers.ts`, `auditLog.ts`
- Depends on: `@vercel/kv`, `@vercel/blob`, `crypto`
- Used by: `src/routes/api/**/+server.ts`, `src/hooks.server.ts`

**Config (`src/lib/config/`):**
- Purpose: Static, hand-maintained chain/token data. `network.ts` is a barrel that re-exports `networks.ts` + `tokens.ts`.
- Location: `src/lib/config/`
- Contains: `networks.ts`, `tokens.ts`, `network.ts` (barrel), `constants.ts`, `tokenMigration.ts`, `tokenWrapping.ts`, `snapshots.ts`
- Used by: virtually everything

**Types (`src/lib/types/`):**
- Purpose: Shared TypeScript types and the order-perspective domain model.
- Location: `src/lib/types/`
- Contains: `index.ts` (Token, PythToken, FetchStatus), `orderPerspective.ts` (Maker/Taker split), `orders.ts`, `transactions.ts`, `errors.ts`, `OffchainAssetReceiptVault.ts`, `SchemaQueryResponse.ts`
- Used by: every layer

**Utils (`src/lib/utils/`):**
- Purpose: Pure helpers — formatting, validation, token math, retry, market hours, schemas, transaction display.
- Location: `src/lib/utils/`
- Contains: 27 utility modules including `format.ts`, `tokenMath.ts`, `validation.ts`, `retry.ts`, `marketHours.ts`, `marketOrderFill.ts`, `orderbook.ts`, `tradeTransform.ts`, `monitoring.ts`
- Used by: every layer

**Dynamic (`src/lib/dynamic/`):**
- Purpose: React-island shim for the Dynamic Labs SDK (which is React-only) inside Svelte.
- Location: `src/lib/dynamic/`
- Contains: `DynamicReactProvider.tsx`, `DynamicSvelteWrapper.svelte` (mounted invisibly in root layout)
- Depends on: `@dynamic-labs/sdk-react-core`, `svelte-preprocess-react`
- Used by: `src/routes/+layout.svelte`

## Data Flow

### Primary Request Path — Market Buy/Sell

1. User opens trade page (`src/routes/(main)/trade/[id]/+page.svelte`) → renders `MarketOrder.svelte` (`src/lib/components/orders/MarketOrder.svelte`).
2. Orderbook quotes are pulled from TanStack Query (`createOrderbookQuotesQuery` in `src/lib/queries/orderbook.ts`) which calls `fetchAndQuoteTokenOrders` in `src/lib/api/orders.ts`. The `/api/st0x/[...path]/+server.ts` proxy forwards to the st0x REST API; quotes are normalised to `ProcessedQuote`.
3. User submits → `executeMarketOrder()` (`src/lib/services/marketOrderExecution.ts`):
   a. `excludeTakerOwnedQuotes` + `sortQuotesByPrice` + `walkOrderbook` produce fills.
   b. Computes `priceCap` / emergency ratio with user-configurable slippage (`computeRatioMultiplier` in `src/lib/utils/marketOrderFill.ts`).
   c. Hydrates `OrderV4` bytes via the load-balanced `RaindexClient` (`src/lib/clients/raindex.ts`).
   d. Calls `transactionStore.handleOracleOrders(...)` → `walletService.sendTransaction` (`src/lib/services/walletService.ts`) which dispatches via wagmi or Dynamic provider depending on `authMethod`.
4. Response receipt is awaited; `transactionStore` (`src/lib/stores/transaction.ts`) transitions through `TransactionStatus` (PENDING → SUCCESS/ERROR). Modal subscribes.
5. On success, query keys for orderbook / balances are invalidated (manual invalidation — `staleTime: Infinity`).

### Limit-Order / DCA Deployment Path

1. `LimitOrder.svelte` / `DcaOrder.svelte` collects user inputs (asset, payment, amount, period, etc.).
2. `orderDeployment.ts` loads a Dotrain GUI from the pinned `rain.strategies` registry (`RAIN_STRATEGIES_COMMIT` constant) using `DotrainRegistry.new(REGISTRY_URL)`.
3. `gui.setSelectToken` / `setFieldValue` / `setDeposit('output', …)` configure the order — note the deposit always goes into the **output** vault (the order gives away its output).
4. `getDeploymentTransactionArgs(owner)` returns calldata; review is shown via `RainlangConfirmationModal` if `reviewStrategyOnDeploy` is set.
5. `walletService` sends the deployment tx; success invalidates orderbook query.

### Auth / Login Path

1. User clicks Connect → `promptAuth()` opens `AuthModal.svelte`.
2. External-wallet path: `svelte-wagmi` `defaultConfig` (initialised in `src/routes/+layout.svelte`) connects → `signerAddress` populates → `authMethod = 'wallet'`.
3. Dynamic path: `DynamicSvelteWrapper.svelte` mounts the React provider; on auth, `dynamicSession` / `dynamicWalletAddress` populate → `authMethod = 'dynamic'`.
4. Either way, `walletAddress` derived store updates → root layout writes a `wallet-address` cookie (`SameSite=Strict`).
5. Server hooks (`src/hooks.server.ts`) read the cookie on the next request and call `isWalletRegistered()` (`src/lib/server/accessCodes.ts`); unregistered wallets get redirected to `/access` (page) or 401 (API).
6. For protected actions, `signatureChallenge.ts` issues a challenge that the wallet signs; the server verifies before sensitive ops (referrals, rewards, snapshots).

### Snapshot Pipeline (Server-only)

1. `src/routes/api/cron/snapshots/+server.ts` (Vercel cron) or admin trigger calls `src/routes/api/admin/snapshots/trigger/+server.ts`.
2. `src/lib/server/snapshots/scraper.ts` fetches `sharesTransfers` (unwrapped) + `wrappedTokenTransfers` (wrapped ERC20) from Goldsky SFT subgraph.
3. `src/lib/server/snapshots/pyth.ts` fans Pyth prices out across wrapped/unwrapped/legacy address variants sharing a feed.
4. `processor.ts` aggregates, `generator.ts` produces JSON snapshot, blob index in `blobIndex.ts`.
5. Output is written to `@vercel/blob`; the `/api/public/tvl/+server.ts` and `/api/snapshots/get/+server.ts` endpoints serve it.

**State Management:**
- Client: Svelte writable/derived stores. Cross-store wiring is in `src/lib/stores/index.ts` (e.g. `vaultsQuery`, `oracleQuotesQuery`, `currentNetwork`, `currentToken`).
- Server cache: TanStack Query (`queryClient` singleton in `src/lib/clients/queryClient.ts`); default `staleTime: Infinity`, manual invalidation after writes.
- Server-side: KV (`@vercel/kv` via `src/lib/server/kv.ts`) for sessions, rate limits, access codes; Vercel Blob for snapshots; Pinata for IPFS metadata.

## Key Abstractions

**Maker vs. Taker order tokens:**
- Purpose: Distinguish "what an on-chain order receives/gives" (maker) from "what the user pays/receives" (taker). The most-bug-prone area in the codebase has been promoted to types.
- Examples: `src/lib/types/orderPerspective.ts`, used in `src/lib/services/marketOrderExecution.ts` (`filterQuotesForSide`) and `src/lib/services/orderDeployment.ts`.
- Pattern: `MakerOrderTokens { orderInputToken, orderOutputToken }` vs. `TakerOrderTokens { takerWants, takerPays }`. Helpers `deriveMakerSide`, `getUserTakerInfo`, `makerToTakerTokens`, `takerToMakerTokens` convert between them.

**Network:**
- Purpose: Per-chain config — RPC + fallbacks, subgraph URLs (orderbook, metadata, SFT, legacy), payment tokens, trusted orderbook addresses.
- Examples: `src/lib/config/networks.ts`. Currently only Base (8453) is wired; secondary chains in CLAUDE.md are aspirational.
- Pattern: `Network` interface + a top-level `networks: Network[]` array. Helpers: `getNetworkById`, `currentNetwork` writable store.

**Token (with address variants):**
- Purpose: Each ST0x token has wrapped (primary), unwrapped (ERC4626 asset), and optionally legacy (pre-migration) addresses; `getTokenByAnyAddress()` resolves any.
- Examples: `src/lib/config/tokens.ts`, `src/lib/queries/orderbook.ts` (`getTokenAddressSet`).
- Pattern: `CategorizedToken extends PythToken` with `unwrappedAddress?`, `legacyAddress?`, `previousSymbols?`.

**ProcessedQuote:**
- Purpose: Internal quote shape produced by the orderbook walk. Carries enough on-chain context to build take-order calldata.
- Examples: `src/lib/utils/orderbook.ts`, `src/lib/api/orders.ts`, `src/lib/services/marketOrderExecution.ts`.
- Pattern: `{ orderHash, side: 'bid'|'ask', inputTokenAddress, outputTokenAddress, ratio, quotePerAsset, sgOrder?, orderData?, raindexOrder? }`.

**TransactionStore state machine:**
- Purpose: Single global tx lifecycle — pending → confirming → success/error — surfaced by `TransactionModal.svelte`.
- Examples: `src/lib/stores/transaction.ts`, consumed by `services/marketOrderExecution.ts`, `services/orderDeployment.ts`.
- Pattern: writable status + helper methods (`handleOracleOrders`, generic `handleTransaction`).

## Entry Points

**Browser entry:**
- Location: `src/routes/+layout.svelte`
- Triggers: All routes (root layout). Imports `app.css`, mounts `QueryClientProvider`, `DynamicSvelteWrapper`, global modals; calls `defaultConfig` / `init` for `svelte-wagmi`; subscribes to `walletAddress` and writes `wallet-address` cookie.
- Responsibilities: Wallet bootstrap, analytics injection, cookie sync, global modal mounting.

**Server entry:**
- Location: `src/hooks.server.ts`
- Triggers: Every HTTP request to the SvelteKit app.
- Responsibilities: Reject bot/malformed paths, OPTIONS preflight, admin session check, wallet-registration enforcement, attach CSP / HSTS / X-Frame-Options / CORS headers.

**SvelteKit page/load entries:**
- Location: `src/routes/+layout.ts` (`prerender = false`, `ssr = true`), `src/routes/(main)/+layout.svelte` (sidebar/header chrome), `src/routes/admin/+layout.server.ts` (session redirect), `src/routes/docs/+layout.svelte` (mdsvex docs).

**API entry:**
- Location: `src/routes/api/**/+server.ts` (50 `+server.ts` files).
- Triggers: REST calls from the SPA (and external callers for `/api/public/*`).
- Responsibilities: Domain-specific server logic — see API Routes table in STRUCTURE.md.

## Architectural Constraints

- **Threading:** Single-threaded JS event loop. All wallet/contract calls are async; no worker threads.
- **Global state:** Module-level singletons live in `src/lib/clients/queryClient.ts` (the QueryClient), `src/lib/clients/raindex.ts` (the per-network `clientPools` Map + `poolInitPromise` Map), and `src/lib/services/walletService.ts` (the `dynamicWalletProvider` set from React).
- **Circular imports:** `authStore` ↔ `stores/index` is broken with a lazy dynamic `import('./index')` inside the `wrongNetwork` derived store (`src/lib/stores/authStore.ts:88-114`). Do not change this to a static import.
- **SSR boundary:** Anything under `src/lib/server/` is server-only and must not be imported from `.svelte` or browser-only files. SvelteKit will throw at build if you cross.
- **`.tsx` files:** Only allowed in `src/lib/dynamic/` for the React Dynamic Labs island. Everywhere else is `.ts` / `.svelte`.
- **WASM dependency:** `@rainlanguage/orderbook` and `@rainlanguage/float` are WASM packages and are loaded via dynamic `import()` inside services (e.g. `getDotrainRegistry()` in `orderDeployment.ts`) to keep them out of the SSR bundle.
- **Trusted orderbooks:** `Network.trustedOrderbooks` whitelists the contract addresses the app will sign transactions to (`src/lib/config/networks.ts:73-75`). Adding a new orderbook requires updating this list.
- **Single-chain reality vs. multi-chain plan:** Although `Network` and store wiring assume `networks: Network[]`, only Base (8453) is currently wired in `src/lib/config/networks.ts`. Code branching by network ID still must handle this gracefully.
- **`staleTime: Infinity`:** All TanStack Query data is treated as never-stale; writes must explicitly call `queryClient.invalidateQueries(...)`. Forgetting this is a common bug.

## Anti-Patterns

### Conflating maker INPUT/OUTPUT with taker takerPays/takerWants

**What happens:** Code references `inputToken` / `outputToken` ambiguously when crossing layers — e.g. a UI passes a `takerPays` value into a function expecting `orderOutputToken`.
**Why it's wrong:** Maker INPUT/OUTPUT is the on-chain order's perspective (output = what the order gives away). Taker takerPays/takerWants is the user's perspective. They are inverses on opposite sides of the trade. Confusing them produces orders that buy when they should sell or set wrong vault deposits.
**Do this instead:** Use the typed interfaces in `src/lib/types/orderPerspective.ts` (`MakerOrderTokens`, `TakerOrderTokens`, `TakerOrderInfo`) and the conversion helpers `deriveMakerSide`, `getUserTakerInfo`, `makerToTakerTokens`, `takerToMakerTokens`. Never name a variable just `inputToken` — use `orderInputToken` or `takerPays`.

### Hand-rolling fetches against subgraphs / Pyth / RPCs

**What happens:** A new feature reaches for `fetch(...)` directly inside a component or service.
**Why it's wrong:** Bypasses retry, error handling, GraphQL error parsing, RPC fallback, and caching. Subgraphs are flaky; the codebase already has `withRetry`, `fetchJson`, `executeGraphql`, and a load-balanced Raindex pool.
**Do this instead:** Go through `$lib/clients/http.ts` (`fetchJson`), `$lib/clients/subgraph.ts` (`executeGraphql`, `fetchAllPaginated`), `$lib/clients/raindex.ts` (`getLoadBalancedClient`), `$lib/clients/pyth.ts`. Wrap calls in `withRetry` from `src/lib/utils/retry.ts` for write paths.

### Calling wagmi `sendTransaction` directly when Dynamic users exist

**What happens:** A new feature imports `sendTransaction` from `@wagmi/core` and calls it.
**Why it's wrong:** Dynamic embedded-wallet users have no wagmi connector — the call silently fails for half the user base.
**Do this instead:** Use `sendTransaction` / `signMessage` / `waitForTransactionReceipt` from `src/lib/services/walletService.ts`, which routes by `authMethod`. The `dynamicWalletProvider` is set into the service from the React island.

### Fetching `sharesTransfers` AND `depositWithReceipts` / `withdrawWithReceipts`

**What happens:** Snapshot scraper code adds an extra subgraph query for deposits/withdrawals to "be thorough."
**Why it's wrong:** `sharesTransfers` already includes mints (from `0x0`) and burns (to `0x0`); the other queries return the same events and cause double counting.
**Do this instead:** Only fetch `sharesTransfers` (unwrapped) + `wrappedTokenTransfers` (wrapped ERC20) in `src/lib/server/snapshots/scraper.ts`.

### Looking up tokens by a single address

**What happens:** `TOKENS.find(t => t.address === addr)` to resolve a token.
**Why it's wrong:** Each ST0x token has wrapped, unwrapped (ERC4626 asset), and legacy variants. Subgraph data and on-chain events use different variants in different places.
**Do this instead:** Use `getTokenByAnyAddress(addr)` from `src/lib/config/tokens.ts` (re-exported via `$lib/config/network`).

### Adding a network without updating the Raindex YAML

**What happens:** New chain added to `networks.ts` only.
**Why it's wrong:** `src/lib/clients/raindex.ts` keeps a hand-maintained `SETTINGS_YAML` because the upstream rain.strategies YAML pulls in fields the SDK refuses to start without. The new network is silently absent from quote/order operations.
**Do this instead:** Mirror the entry in `SETTINGS_YAML` (networks, subgraphs, metaboards, orderbooks, rainlangs) and pick RPCs that support multicall `eth_call` (avoid llamarpc/meowrpc/blastapi/tenderly for that file).

## Error Handling

**Strategy:** Per-layer custom error messages with a small enum for transaction UI. RPC fallback + retry is centralised; gas estimation is delegated to wallets with a 2x buffer where set.

**Patterns:**
- `TransactionErrorMessage` enum (`src/lib/types/errors.ts`) is the canonical user-facing copy for tx flows (rejected approval, timeout, etc.).
- `withRetry` (`src/lib/utils/retry.ts`) wraps RPC and HTTP calls in `walletService.ts` and other services.
- `fetchJson` (`src/lib/clients/http.ts`) is the single HTTP retry/timeout entry point.
- Subgraph errors are aggregated in `executeGraphql` (`src/lib/clients/subgraph.ts`) and rethrown as `Error` with joined messages.
- `monitoring.ts` (`logQueryFailure`, `errorMessage`) provides structured error logging used by API/queries.
- Service entry points (`executeMarketOrder`) return discriminated `{ success, error }` results rather than throwing across the UI boundary.

## Cross-Cutting Concerns

**Logging:** `console.warn`/`console.error` for client; `monitoring.ts` for structured server logs; PostHog (`src/lib/services/analytics.ts`) for product analytics; Vercel Analytics + Speed Insights injected in root layout.

**Validation:** `src/lib/utils/validation.ts`, `schemas.ts`, `input.ts` cover input validation. Server-side, `src/lib/server/csrf.ts` + `signatureChallenge.ts` validate authenticated mutations.

**Authentication:**
- Browser: `authStore` derived from `svelte-wagmi` + `dynamicStore`.
- Cookie sync: root layout writes `wallet-address` cookie (`SameSite=Strict`).
- Server: `hooks.server.ts` enforces wallet registration and admin session; per-route `+server.ts` handlers re-verify with `signatureChallenge.verifyAndConsume()` before sensitive mutations.
- Admin: HMAC-style session token (`createSessionToken` / `verifySessionToken` in `src/lib/server/auth.ts`) backed by env-vars; 24-hour expiry; constant-time compare.

**Rate limiting:** `src/lib/server/rateLimit.ts` (KV-backed) is invoked from API routes; tier headers exposed via CORS (`X-RateLimit-*`).

**Security headers:** Strict CSP with explicit allowlist for TradingView, Dynamic, Pyth, Goldsky, WalletConnect, etc.; HSTS in production; `X-Frame-Options: DENY`; CSP `frame-ancestors 'none'` (see `src/hooks.server.ts:152-191`).

**Note on Account Abstraction:** `CLAUDE.md` documents Rhinestone SDK / EIP-7702 / `aaPaymentStore` / `services/account-abstraction/`, but no such code is present in the current source tree (verified — `src/lib/services/` contains only `analytics.ts`, `marketOrderExecution.ts`, `orderDeployment.ts`, `walletService.ts`, `wrapService.ts`). Treat the AA description in `CLAUDE.md` as planned/aspirational, not implemented.

---

*Architecture analysis: 2026-04-28*
