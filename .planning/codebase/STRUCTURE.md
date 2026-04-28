# Codebase Structure

**Analysis Date:** 2026-04-28

## Directory Layout

```
st0x/
├── src/
│   ├── app.html               # SvelteKit HTML shell
│   ├── app.css                # Tailwind base + global styles
│   ├── app.d.ts               # Ambient app types
│   ├── hooks.server.ts        # CORS, CSP, auth, wallet registration guard
│   ├── docs/                  # mdsvex documentation source
│   │   └── 10-introduction/
│   ├── lib/
│   │   ├── api/               # Domain-typed wrappers over external APIs
│   │   ├── clients/           # HTTP / GraphQL / Raindex / Pyth / QueryClient
│   │   ├── components/        # Svelte UI (feature-grouped)
│   │   │   ├── charts/        # Trading & market charts
│   │   │   ├── icons/         # Icon components
│   │   │   ├── orders/        # Order forms (Market, Limit, DCA, Folio, …)
│   │   │   ├── referrals/     # Referral program UI
│   │   │   ├── rewards/       # Rewards UI
│   │   │   └── ui/            # Generic primitives (Button, Card, Modal, …)
│   │   │       └── table/
│   │   ├── config/            # Networks, tokens, constants, migration tables
│   │   ├── docs/              # mdsvex source + processing helpers
│   │   ├── dynamic/           # React-island shim for Dynamic Labs SDK
│   │   ├── queries/           # TanStack Query factories
│   │   ├── server/            # SERVER-ONLY modules (auth, KV, snapshots…)
│   │   │   ├── rewards/
│   │   │   └── snapshots/
│   │   ├── services/          # Business logic (orchestration)
│   │   ├── stores/            # Svelte writable / derived stores
│   │   ├── styles/            # Shared CSS partials
│   │   ├── types/             # Shared TypeScript types
│   │   └── utils/             # Pure helpers
│   └── routes/
│       ├── +layout.svelte     # Root layout: wallet bootstrap, modals
│       ├── +layout.ts         # SSR + prerender flags
│       ├── (main)/            # Default UI group (sidebar + header)
│       │   ├── +layout.svelte
│       │   ├── +page.svelte   # Landing page
│       │   ├── dashboard/
│       │   ├── faqs/
│       │   ├── platform-metrics/
│       │   ├── strategies/
│       │   ├── trade/[id]/
│       │   │   └── proofs/
│       │   ├── privacy-policy/
│       │   └── terms/
│       ├── access/            # Access-code registration page
│       ├── admin/             # Gated admin dashboard
│       │   ├── codes/  login/  logout/  referrals/  rewards/
│       │   ├── +layout.server.ts
│       │   ├── +layout.svelte
│       │   └── +page.svelte
│       ├── api/               # SvelteKit server endpoints (50 +server.ts)
│       │   ├── access/  admin/  auth/  cron/  nansen/  newsletter/
│       │   ├── onramper/  prices/  public/  referrals/  rewards/
│       │   ├── snapshots/  st0x/[...path]/
│       ├── api-docs/          # Scalar API reference page
│       └── docs/              # Public docs (mdsvex via [slug])
├── tests/                     # Vitest suites mirroring src/lib
│   ├── lib/
│   │   ├── components/orders/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   ├── mocks/
│   └── utils/
├── static/                    # Static assets served as-is
├── scripts/                   # One-off scripts (untracked)
├── .planning/                 # GSD planning docs (this directory)
│   └── codebase/
├── .svelte-kit/               # SvelteKit generated (git-ignored)
├── .vercel/                   # Vercel build artifacts (git-ignored)
├── package.json
├── svelte.config.js           # adapter-vercel + mdsvex preprocess
├── vite.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── eslint.config.js / .eslintrc.cjs
├── .prettierrc
├── wagmi.config.ts            # Contract codegen config
├── vercel.json                # Cron + deployment config
├── vitest-setup.ts
├── flake.nix / flake.lock     # Nix dev shell
└── CLAUDE.md                  # Project guide
```

## Directory Purposes

**`src/lib/api/`:**
- Purpose: Domain-typed wrappers around external HTTP/GraphQL endpoints; returns app-shaped data (e.g. `ProcessedQuote[]`).
- Contains: `orders.ts`, `pyth.ts`, `subgraph.ts`, `tradingview.ts`, `st0xApi.ts`
- Key files: `src/lib/api/orders.ts` (orderbook quote pipeline), `src/lib/api/st0xApi.ts` (typed REST client), `src/lib/api/pyth.ts` (Hermes price feed parser).

**`src/lib/clients/`:**
- Purpose: Low-level transport / SDK setup. No business logic.
- Contains: `http.ts`, `subgraph.ts`, `raindex.ts`, `pyth.ts`, `queryClient.ts`
- Key files: `src/lib/clients/raindex.ts` (two-client load-balanced pool with hand-maintained YAML), `src/lib/clients/queryClient.ts` (single TanStack `QueryClient`, `staleTime: Infinity`), `src/lib/clients/http.ts` (`fetchJson` retry/timeout helper).

**`src/lib/components/`:**
- Purpose: Svelte 4 components. Top-level files are page-level / cross-cutting (modals, banners, sidebar, header). Subdirectories are feature-grouped.
- Contains: ~60 `.svelte` files
- Key files: `AuthModal.svelte`, `Header.svelte`, `Sidebar.svelte`, `TransactionModal.svelte`, `RainlangConfirmationModal.svelte`, `WrapUnwrapModal.svelte`, `TickerTape.svelte`, `WalletConnect.svelte`.
- Subdirectories:
  - `orders/` — `MarketOrder.svelte`, `LimitOrder.svelte`, `DcaOrder.svelte`, `FolioStrategy.svelte`, `OrdersTable.svelte`, `ActiveLiquidity.svelte`.
  - `charts/` — TradingView embeds + `lightweight-charts` integration.
  - `referrals/` — Referral join, dashboard, leaderboard modals.
  - `rewards/` — Rewards display, leaderboard, token-swap announcement.
  - `icons/` — Custom icon components (most icons use `flowbite-svelte-icons`).
  - `ui/` — Generic primitives: `Button.svelte`, `Card.svelte`, `Input.svelte`, `Modal.svelte`, `Select.svelte`, `Section.svelte`, `MetricCard.svelte`, `TabNav.svelte`, `TokenDisplay.svelte`, `TxLink.svelte`, `WalletConnectionPrompt.svelte`, `table/Table.svelte`, …

**`src/lib/config/`:**
- Purpose: Static, hand-maintained chain/token data.
- Contains: `networks.ts`, `tokens.ts`, `network.ts` (barrel), `constants.ts`, `tokenMigration.ts`, `tokenWrapping.ts`, `snapshots.ts`
- Key files: `src/lib/config/networks.ts` (per-chain RPC + subgraph + payment tokens + trusted orderbooks), `src/lib/config/tokens.ts` (`CategorizedToken` with wrapped/unwrapped/legacy address variants and Pyth feed IDs), `src/lib/config/network.ts` (barrel that re-exports both).

**`src/lib/dynamic/`:**
- Purpose: React-island shim for Dynamic Labs SDK (which is React-only) inside Svelte. Provides `dynamicWalletProvider` to `walletService.ts` via `setDynamicWalletProvider`.
- Contains: `DynamicReactProvider.tsx`, `DynamicSvelteWrapper.svelte` (mounted invisibly in root layout)

**`src/lib/queries/`:**
- Purpose: TanStack Query factories parameterised by `Network`. Single source of truth for cached server state.
- Contains: `orderbook.ts`, `oracleQuotes.ts`, `priceFeeds.ts`, `balances.ts`, `vaults.ts`, `tradeActivity.ts`, `costBasis.ts`
- Key files: `src/lib/queries/orderbook.ts` (the global orderbook quote cache; `getTokenAddressSet` covers wrapped/legacy variants).

**`src/lib/server/`:**
- Purpose: Server-only modules. **Never** imported from `.svelte` or browser-only TS.
- Contains: `auth.ts`, `accessCodes.ts`, `adminAuth.ts`, `adminWalletList.ts`, `auditLog.ts`, `cache.ts`, `csrf.ts`, `kv.ts`, `nansenTiers.ts`, `pinata.ts`, `rateLimit.ts`, `referrals.ts`, `signatureChallenge.ts`, plus `rewards/` and `snapshots/` subdirectories.
- Subdirectories:
  - `snapshots/` — `scraper.ts`, `pyth.ts`, `processor.ts`, `generator.ts`, `blobIndex.ts`, `marketHours.ts`, `points.ts`, `vaults.ts`, `types.ts`, `index.ts`.
  - `rewards/` — `rewardsCommon.ts`.
- Key files: `src/lib/server/auth.ts` (HMAC session token, 24h expiry), `src/lib/server/snapshots/scraper.ts` (Goldsky SFT subgraph reader), `src/lib/server/kv.ts` (Vercel KV wrapper), `src/lib/server/rateLimit.ts` (tiered KV rate limiting).

**`src/lib/services/`:**
- Purpose: Business logic orchestrating wallet, contracts, queries, stores.
- Contains: `analytics.ts`, `marketOrderExecution.ts`, `orderDeployment.ts`, `walletService.ts`, `wrapService.ts`
- Key files: `src/lib/services/walletService.ts` (unifies wagmi + Dynamic), `src/lib/services/marketOrderExecution.ts` (orderbook walk + take-orders), `src/lib/services/orderDeployment.ts` (Dotrain GUI → deploy args).

**`src/lib/stores/`:**
- Purpose: Svelte writable/derived stores for client state.
- Contains: `accessStore.ts`, `authStore.ts`, `dynamicStore.ts`, `index.ts`, `manualCostBasis.ts`, `referralStore.ts`, `rewardsStore.ts`, `transaction.ts`, `tutorialStore.ts`, `vaultTutorialStore.ts`
- Key files: `src/lib/stores/authStore.ts` (unified auth), `src/lib/stores/transaction.ts` (global tx state machine), `src/lib/stores/index.ts` (cross-store wiring: `currentNetwork`, `vaultsQuery`, `oracleQuotesQuery`, derived data stores, `rainlangConfirmationModal`, `tradePanelOpen`).

**`src/lib/types/`:**
- Purpose: Shared TypeScript types.
- Contains: `index.ts` (Token / PythToken / FetchStatus barrel), `orderPerspective.ts`, `orders.ts`, `transactions.ts`, `errors.ts`, `OffchainAssetReceiptVault.ts`, `SchemaQueryResponse.ts`
- Key files: `src/lib/types/orderPerspective.ts` (the Maker/Taker split — single source of truth for INPUT/OUTPUT semantics), `src/lib/types/errors.ts` (`TransactionErrorMessage` enum).

**`src/lib/utils/`:**
- Purpose: Pure helpers. No side effects, no I/O, no Svelte stores (where possible).
- Contains: 27 modules — see naming below.
- Key files: `format.ts`, `tokenMath.ts`, `validation.ts`, `retry.ts` (`withRetry`), `marketHours.ts` (NYSE hours), `marketOrderFill.ts` (slippage math), `orderbook.ts` (`walkOrderbook`, `ProcessedQuote`), `tradeTransform.ts`, `monitoring.ts` (`logQueryFailure`, `errorMessage`), `helpers.ts`, `derivations.ts`.

**`src/lib/docs/` and `src/docs/`:**
- Purpose: Documentation rendered through mdsvex with `remark-math` + `rehype-katex`.
- Contains: `.svx` files numbered for ordering (`10-introduction.svx` … `90-st0x-interface.svx`), plus `metadata.json`, `processDocs.ts`, `slugFromPath.ts`, `table.ts`.

**`src/routes/(main)/`:**
- Purpose: User-facing pages with sidebar/header. The `(main)` group provides the default chrome via `src/routes/(main)/+layout.svelte`.
- Subdirectories: `dashboard/`, `faqs/`, `platform-metrics/`, `strategies/`, `trade/[id]/proofs/`, `privacy-policy/`, `terms/`. Landing page is `(main)/+page.svelte`.

**`src/routes/admin/`:**
- Purpose: Gated admin dashboard. `+layout.server.ts` redirects to `/admin/login` when the `auth-session` cookie is missing or expired.
- Subdirectories: `login/`, `logout/`, `codes/`, `referrals/`, `rewards/`. Plus `+page.svelte` (the very large 2400+ line dashboard).

**`src/routes/api/`:**
- Purpose: SvelteKit server endpoints (50 `+server.ts` files). See API Routes table below.

**`src/routes/docs/` and `src/routes/api-docs/`:**
- Purpose: Public documentation pages. `docs/[slug]/` resolves mdsvex content; `api-docs/` is a Scalar API reference UI.

## API Routes (`src/routes/api/`)

| Domain | Path | Purpose |
|--------|------|---------|
| Access | `/api/access/challenge` | Issue signature challenge for new wallet |
| Access | `/api/access/check` | Check access-code validity |
| Access | `/api/access/register` | Register wallet against access code |
| Access | `/api/access/validate` | Validate signed challenge + register |
| Admin | `/api/admin/codes` | CRUD for access codes |
| Admin | `/api/admin/excluded-wallets` | Manage exclusion list |
| Admin | `/api/admin/nansen` | Nansen API admin utilities |
| Admin | `/api/admin/pool-wallets` | Pool wallet config |
| Admin | `/api/admin/team-wallets` | Team wallet config |
| Admin | `/api/admin/wallets` | Admin wallet listing |
| Admin | `/api/admin/wallet/statement` | Per-wallet statement (admin view) |
| Admin | `/api/admin/referrals` | Referral admin |
| Admin | `/api/admin/referrals/statement` | Per-wallet referral statement |
| Admin | `/api/admin/referral-programme/leaderboard` | Programme leaderboard |
| Admin | `/api/admin/referral-programme/migrate` | Migration utility |
| Admin | `/api/admin/referral-programme/refresh` | Refresh programme data |
| Admin | `/api/admin/rewards-pool` | Rewards pool config |
| Admin | `/api/admin/snapshots/recalculate` | Recompute a snapshot |
| Admin | `/api/admin/snapshots/regenerate` | Regenerate full snapshot |
| Admin | `/api/admin/snapshots/trigger` | Trigger snapshot run |
| Admin | `/api/admin/swap-snapshot` | Manage token-swap snapshot |
| Admin | `/api/admin/tvl` | Admin TVL view |
| Auth | `/api/auth/csrf` | CSRF token issuance |
| Cron | `/api/cron/snapshots` | Vercel cron — scheduled snapshot run |
| Public (anonymous, rate-limited, open CORS) | `/api/public/rewards-apy` | Pool APY |
| Public | `/api/public/rocketboost` | RocketBoost progress |
| Public | `/api/public/trade-activity` | Recent trades |
| Public | `/api/public/tvl` | Public TVL |
| Public | `/api/public/wallet` | Public wallet stats |
| Newsletter | `/api/newsletter` | Newsletter signup (MailerLite) |
| Onramper | `/api/onramper/sign-url` | Sign Onramper widget URL |
| Prices | `/api/prices/spym` | Special-case price endpoint |
| Nansen | `/api/nansen/tiers` | Whale-tier metadata (public) |
| Referrals | `/api/referrals/challenge` | Sign-in challenge for referral actions |
| Referrals | `/api/referrals/join` | Join a referral code |
| Referrals | `/api/referrals/leaderboard` | Public-ish leaderboard |
| Referrals | `/api/referrals/profile` | Get profile |
| Referrals | `/api/referrals/profile/update` | Update profile |
| Rewards | `/api/rewards/global` | Public global rewards info |
| Rewards | `/api/rewards/leaderboard` | Rewards leaderboard |
| Rewards | `/api/rewards/pool-apy` | APY for pool |
| Rewards | `/api/rewards/user` | Per-user rewards |
| Snapshots | `/api/snapshots/blocks` | Block-range list |
| Snapshots | `/api/snapshots/generate` | Generate new snapshot |
| Snapshots | `/api/snapshots/get` | Fetch existing snapshot |
| Snapshots | `/api/snapshots/list` | List snapshots |
| Snapshots | `/api/snapshots/points` | Per-wallet points |
| Snapshots | `/api/snapshots/preview` | Preview snapshot |
| Snapshots | `/api/snapshots/preview-stream` | Streaming preview |
| ST0x proxy | `/api/st0x/[...path]` | Authenticated proxy to st0x REST API |

CORS is configured in `src/hooks.server.ts`: production origins (`st0x.io`, `www.st0x.io`) + Vercel preview URLs + localhost in dev for internal routes; `/api/public/*` allows any origin (`*`) without credentials.

## Key File Locations

**Entry Points:**
- `src/routes/+layout.svelte` — Browser entry; mounts wagmi, Dynamic, modals, QueryClient.
- `src/routes/+layout.ts` — `prerender = false`, `ssr = true`.
- `src/hooks.server.ts` — Server entry: CORS, CSP, auth gates.
- `src/app.html` — HTML shell (SvelteKit boilerplate).

**Configuration:**
- `svelte.config.js` — `adapter-vercel`, mdsvex preprocess (`.svx` extension), `$lib` alias (default).
- `vite.config.js` — Vite plugins.
- `tailwind.config.ts` — Tailwind theme + `prettier-plugin-tailwindcss`.
- `tsconfig.json` — Strict TS; extends SvelteKit-generated config.
- `wagmi.config.ts` — Contract codegen target.
- `vercel.json` — Cron schedule + deployment.
- `eslint.config.js` (flat config) + `.eslintrc.cjs` (legacy fallback).
- `vitest-setup.ts` — Vitest globals.
- `flake.nix` / `flake.lock` — Nix dev shell.
- `.env.example` — Required env vars (template).

**Core Logic:**
- `src/lib/services/walletService.ts` — Unified wallet send/sign across wagmi + Dynamic.
- `src/lib/services/marketOrderExecution.ts` — Market order execution path.
- `src/lib/services/orderDeployment.ts` — Strategy/limit/DCA deployment via Rain Dotrain GUI.
- `src/lib/types/orderPerspective.ts` — Maker/Taker order semantics (the most-bug-prone area, encoded as types).
- `src/lib/utils/orderbook.ts` — Orderbook walk, `ProcessedQuote`.
- `src/lib/utils/marketOrderFill.ts` — Slippage / ratio multiplier math.
- `src/lib/stores/transaction.ts` — Global transaction state machine.
- `src/lib/stores/authStore.ts` — Unified `walletAddress` / `authMethod` / `isReady`.
- `src/lib/clients/raindex.ts` — RaindexClient pool with hand-maintained YAML.
- `src/lib/clients/queryClient.ts` — Singleton TanStack `QueryClient`.

**Testing:**
- `tests/lib/types/orderPerspective.test.ts` — Order-perspective unit tests.
- `tests/lib/services/marketOrderExecution.test.ts` — Market order execution tests.
- `tests/lib/components/orders/` — Order form component tests.
- `tests/lib/utils/`, `tests/lib/stores/` — Utilities + stores tests.
- `tests/mocks/` — Shared mocks.
- `tests/utils/` — Test helpers.
- `vitest-setup.ts` — Global setup (jsdom, jest-dom).

## Naming Conventions

**Files:**
- Pure TS modules: camelCase, e.g. `walletService.ts`, `marketOrderExecution.ts`, `tokenMath.ts`.
- Type modules whose primary export is a class/large interface: PascalCase, e.g. `OffchainAssetReceiptVault.ts`, `SchemaQueryResponse.ts`.
- Svelte components: PascalCase, e.g. `MarketOrder.svelte`, `AuthModal.svelte`, `WrapUnwrapModal.svelte`.
- Tests: mirror source name with `.test.ts` suffix.
- SvelteKit special files: `+page.svelte`, `+layout.svelte`, `+server.ts`, `+page.server.ts`, `+layout.server.ts`, `+page.ts`, `+layout.ts`.
- mdsvex docs: ordering-prefix kebab names, e.g. `10-introduction.svx`, `40-architecture.svx`.

**Directories:**
- `src/lib/<feature>/` — feature-grouped under components, plus role-grouped folders (`api`, `clients`, `services`, etc.).
- SvelteKit route groups in parens: `(main)/`.
- Dynamic params in brackets: `trade/[id]/`, `docs/[slug]/`, `st0x/[...path]/`.
- All-lowercase route folders.

**Identifiers:**
- Functions / variables: `camelCase` (`getTokenByAnyAddress`, `walletAddress`).
- Types / interfaces / Svelte components: `PascalCase` (`Network`, `MakerOrderTokens`, `MarketOrder`).
- Constants: `SCREAMING_SNAKE_CASE` (`DEFAULT_MARKET_ORDER_SLIPPAGE_BPS`, `RAIN_STRATEGIES_COMMIT`, `MAX_ORDER_PAGES`).
- Enums: `PascalCase` member with `SCREAMING_SNAKE_CASE` keys (`TransactionErrorMessage.USER_REJECTED_APPROVAL`).
- TanStack query factories: `createXxxQuery` (`createOracleQuotesQuery`, `createSftsQuery`).
- Stores: `camelCase` ending in `Store` for top-level store modules; the exported store names are `camelCase` nouns (`authStore.ts` exports `walletAddress`, `authMethod`).

**Imports:**
- `$lib/*` — aliased to `src/lib/*`.
- `$app/*` — SvelteKit runtime modules (`$app/environment`, `$app/stores`).
- `$env/dynamic/private`, `$env/dynamic/public` — env access.
- Path-only imports for types are not enforced; `import type` is preferred but mixed in practice.
- Barrel exports in:
  - `src/lib/types/index.ts` — re-exports `Token`, `PythToken`, `Sft`, `FetchStatus`, `FetchFileResponse`.
  - `src/lib/config/network.ts` — `export * from '$lib/config/networks'; export * from '$lib/config/tokens';` (so most code imports networks/tokens via `$lib/config/network`).
  - `src/lib/stores/index.ts` — exports cross-store wiring + re-exports `wrongNetwork` from `authStore` for back-compat.
  - `src/lib/server/snapshots/index.ts` — snapshot pipeline barrel.

## Where to Add New Code

**New page (user-facing):**
- Primary code: `src/routes/(main)/<slug>/+page.svelte` (and optional `+page.ts` / `+page.server.ts`).
- If gated server-side, add the path to `requiresWalletRegistration()` in `src/hooks.server.ts:232-244`.

**New admin page:**
- Primary code: `src/routes/admin/<slug>/+page.svelte`.
- The whole `/admin/*` tree is auto-gated by `src/routes/admin/+layout.server.ts` and `isAdminPath()` in `src/hooks.server.ts:261-263`.

**New API endpoint:**
- Primary code: `src/routes/api/<domain>/<resource>/+server.ts` (export `GET`, `POST`, etc.).
- Public/unauthenticated: place under `src/routes/api/public/`. CORS opens automatically (`isPublicApiPath` in `src/hooks.server.ts:134-136`).
- Admin-protected: place under `src/routes/api/admin/`. `+layout.server.ts` chains and `hooks.server.ts` admin session bypass for API.
- Wallet-gated: protect via `requiresWalletRegistration()` in `src/hooks.server.ts:232-244`, plus per-route signature challenge using `src/lib/server/signatureChallenge.ts`.
- Rate limiting: call `rateLimit.ts` from `src/lib/server/rateLimit.ts` near the start of the handler.
- Cron: under `src/routes/api/cron/<job>/+server.ts` and register schedule in `vercel.json`.

**New component:**
- Generic / reusable: `src/lib/components/ui/<Name>.svelte`.
- Feature-specific: `src/lib/components/<feature>/<Name>.svelte` (`orders/`, `charts/`, `referrals/`, `rewards/`).
- One-off page-level modal: `src/lib/components/<Name>.svelte` (top-level, in keeping with `AuthModal.svelte`, `DepositModal.svelte`, `WrapUnwrapModal.svelte`).
- Tests: `tests/lib/components/<feature>/<Name>.test.ts`.

**New service / business-logic module:**
- Primary code: `src/lib/services/<name>.ts`.
- Tests: `tests/lib/services/<name>.test.ts`.
- If it touches transactions, route signing/sending through `src/lib/services/walletService.ts` — never import wagmi `sendTransaction` directly.

**New TanStack Query factory:**
- Primary code: `src/lib/queries/<name>.ts` exporting `createXxxQuery(network: Network | null)`.
- Wire into `src/lib/stores/index.ts` as a derived store if the rest of the app needs read-only access (`createNetworkQueryStore`).

**New external API integration:**
- Low-level transport: `src/lib/clients/<name>.ts`.
- Domain wrapper: `src/lib/api/<name>.ts` (typed return shapes).
- Server-side proxy if creds required: `src/routes/api/<name>/+server.ts` and reference env vars only from `src/lib/server/`.

**New chain / network:**
- Add a `Network` entry in `src/lib/config/networks.ts` (RPC + fallbacks, subgraph URLs, payment tokens, trusted orderbook addresses).
- Mirror the entry inside `SETTINGS_YAML` in `src/lib/clients/raindex.ts` (networks/subgraphs/metaboards/orderbooks/rainlangs). Use multicall-capable RPCs (avoid llamarpc/meowrpc/blastapi/tenderly for that file).
- Add token addresses + Pyth feed IDs in `src/lib/config/tokens.ts` (`PAYMENT_TOKENS_BY_NETWORK`, `TOKENS`).

**New token:**
- Add an entry to `TOKENS` in `src/lib/config/tokens.ts` with `address` (wrapped), `unwrappedAddress` (ERC4626 asset), optional `legacyAddress`, `priceFeedId`, `tradingViewSymbol`, `tradingViewMarket`.
- All address lookups should use `getTokenByAnyAddress()` so wrapped/unwrapped/legacy variants resolve uniformly.

**New utility:**
- Pure helpers: `src/lib/utils/<name>.ts`. Avoid Svelte stores or I/O here.
- Tests: `tests/lib/utils/<name>.test.ts`.

**New shared type:**
- `src/lib/types/<name>.ts`. Cross-cutting primitives go in `src/lib/types/index.ts` (the barrel).
- For order-semantic types, extend `src/lib/types/orderPerspective.ts` rather than inventing parallel `inputToken`/`outputToken` names.

**New server-only logic:**
- `src/lib/server/<name>.ts`. Anything reading env secrets or KV/blob lives here. Never import these modules from `.svelte` or browser-only `.ts`.

**New documentation page:**
- mdsvex source: `src/docs/<NN>-<slug>.svx` (numeric prefix for ordering).
- Renders through `src/routes/docs/[slug]/+page.svelte` and `src/lib/docs/processDocs.ts`.

## Special Directories

**`src/lib/server/`:**
- Purpose: Server-only modules (KV, auth, snapshots, blob, rate-limiting).
- Generated: No.
- Committed: Yes.
- Constraint: `import` from these only inside `+server.ts`, `+page.server.ts`, `+layout.server.ts`, `src/hooks.server.ts`, or other `src/lib/server/*` files. SvelteKit will fail the build otherwise.

**`src/lib/dynamic/`:**
- Purpose: React island for the Dynamic Labs SDK. The only `.tsx` allowed in the project.
- Generated: No.
- Committed: Yes.
- Constraint: Mounted invisibly by the root layout. New code shouldn't reach into `.tsx`; instead, communicate through the `setDynamicWalletProvider` hook in `src/lib/services/walletService.ts`.

**`.svelte-kit/`:**
- Purpose: SvelteKit generated types and build cache.
- Generated: Yes (`svelte-kit sync`).
- Committed: No.

**`.vercel/`:**
- Purpose: Vercel build artifacts.
- Generated: Yes.
- Committed: No.

**`static/`:**
- Purpose: Static assets served at root (`/images/...`, `/favicon.ico`, manifests).
- Generated: No.
- Committed: Yes.

**`scripts/`:**
- Purpose: One-off operational scripts.
- Generated: No.
- Committed: Currently untracked (in `git status`).

**`.planning/codebase/`:**
- Purpose: GSD codebase mapping output (this directory).
- Generated: By `/gsd-map-codebase`.
- Committed: Yes (consumed by other GSD commands).

---

*Structure analysis: 2026-04-28*
