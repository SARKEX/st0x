# External Integrations

**Analysis Date:** 2026-04-28

## APIs & External Services

**Price Oracles:**
- Pyth Network Hermes — Real-time and historical price feeds for tokenized stocks/ETFs and payment tokens
  - Base URL: `https://hermes.pyth.network/v2/updates/price` (`src/lib/config/constants.ts` — `HERMES_BASE_URL`)
  - Client (latest prices): `src/lib/clients/pyth.ts` (`fetchLatestPrices`)
  - Client (browser snapshots): `src/lib/api/pyth.ts` (`getOracleSnapshots`, `getPythQuotes`)
  - Server (historical, snapshots): `src/lib/server/snapshots/pyth.ts`
  - Auth: None (public REST)
  - Per-token feed IDs hardcoded in `src/lib/config/tokens.ts` (`priceFeedId` field)

**SPYM Liquidity Monitor (external service):**
- Service: `liquidity-monitor` proxy used as fallback price oracle for `wtSPYM` (no Pyth feed)
- Base URL: env var `LIQUIDITY_MONITOR_URL`
- Server proxy: `src/routes/api/prices/spym/+server.ts` (5s timeout, edge cache `s-maxage=30`)
- Server consumer: `src/lib/server/snapshots/pyth.ts` (`monitorUrl`)
- Client consumers: `src/lib/queries/oracleQuotes.ts`, `src/lib/queries/priceFeeds.ts`
- CSP allows: `st0x-oracle-server.fly.dev`, `st0x-oracle.com`, `rain-oracle-server.fly.dev` (`src/hooks.server.ts` line 162)

**Orderbook (Rain Protocol):**
- SDK: `@rainlanguage/orderbook` (`RaindexClient`) — `src/lib/clients/raindex.ts`
- Round-robin pool of 2 clients per network (`getLoadBalancedClient`)
- Hardcoded settings YAML inside `raindex.ts` (RPCs, subgraph, metaboard, orderbook contract address, deployment block)
- Trusted orderbook contract on Base: `0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D` (`src/lib/config/networks.ts` `trustedOrderbooks`)
- Rainlang deployer on Base: `0x22508460712C350e914b49155982d3A92D923b10` (`src/lib/clients/raindex.ts`)

**st0x Backend REST API:**
- Upstream API consumed via Server proxy: `src/routes/api/st0x/[...path]/+server.ts`
- Base URL: env `ST0X_API_URL`
- Auth: HTTP Basic via `ST0X_API_KEY` + `ST0X_API_SECRET` (`btoa('key:secret')`, server-only)
- Allowlist of proxied routes (with per-route Vercel edge cache):
  - `GET v1/orders/token/:address` — `private, no-store` (no Vercel edge cache; upstream ~15s)
  - `GET v1/trades/token/:address` — `private, no-store`
  - `GET v1/orders/owner/:address`, `GET v1/trades/:address`, `GET v1/trades/taker/:address` — no shared cache
  - `POST v1/trades/batch` — no cache
  - `GET health`
- Client wrapper: `src/lib/api/st0xApi.ts` (typed `apiGet*` functions; all gated to browser context)

**Nansen API (whale wallet tiers):**
- Base URL: `https://app.nansen.ai/api/points-leaderboard`
- Server fetcher: `src/lib/server/nansenTiers.ts` (parallel fetch per tier `green/ice/north/star`)
- Public endpoint: `src/routes/api/nansen/tiers/+server.ts` (1-hour cache via `withCache`/`CACHE_KEYS.nansenTiers`)
- Auth: None (public Nansen leaderboard JSON)

**Onramper (fiat on-ramp):**
- Widget host: `https://buy.onramper.com` (prod) or `https://buy.onramper.dev` (sandbox), selected via `PUBLIC_ONRAMPER_ENV`
- Frontend modal: `src/lib/components/OnramperModal.svelte`
- Server URL signer: `src/routes/api/onramper/sign-url/+server.ts` — HMAC-SHA256 over `networkWallets` only, sorted alphabetically; auth requires `wallet-address` cookie + CSRF token
- Public key: `PUBLIC_ONRAMPER_API_KEY`
- Server secret: `ONRAMPER_SECRET_KEY`
- Default supported cryptos: `usdc_base,eth_base`
- Rate limit tier: `onramper` in `src/lib/server/rateLimit.ts`

**Dynamic Labs (embedded wallets):**
- SDKs: `@dynamic-labs/sdk-react-core` 4.52.2, `@dynamic-labs/ethereum` 4.52.2
- Bridge component (React): `src/lib/dynamic/DynamicReactProvider.tsx`
- Svelte wrapper: `src/lib/dynamic/DynamicSvelteWrapper.svelte`
- Environment ID: `PUBLIC_DYNAMIC_ENVIRONMENT_ID`
- Hosts (in CSP): `api.dynamic.xyz`, `*.dynamic.xyz`, `app.dynamicauth.com`, `*.dynamicauth.com`, `dynamic-static-assets.com`
- Auth token refresh interval: 50 minutes (token expiry buffer)
- Provides EIP-1193 wrapper consumed by `src/lib/services/walletService.ts` for `eth_sendTransaction`, `personal_sign`, etc.

**WalletConnect (direct wallets):**
- `@wagmi/connectors` 5.11.2 — `injected()` and `walletConnect({ projectId })` configured in `src/routes/+layout.svelte`
- Project ID env: `PUBLIC_WALLETCONNECT_ID`
- Hosts in CSP: `*.walletconnect.com`, `*.walletconnect.org`, `api.web3modal.org`, `*.web3modal.org`

**TradingView (charts & widgets):**
- Embed scripts loaded from `https://s3.tradingview.com/external-embedding/...`
- Components: `src/lib/components/charts/TradingViewWidget.svelte`, `…/TradingViewChart.svelte`, `…/TradingViewEmbed.svelte`, `src/lib/components/TickerTape.svelte`, `src/lib/utils/tradingview.ts`
- Per-token symbol/market in `src/lib/config/tokens.ts` (`tradingViewSymbol`, `tradingViewMarket`)
- Public TradingView API endpoints (no auth) under `src/routes/api/tradingview/` (allowed publicly via `hooks.server.ts` line 222)

**hCaptcha (access registration anti-abuse):**
- Verify URL: `https://hcaptcha.com/siteverify` (`src/lib/server/accessCodes.ts` line 101)
- Secret: `HCAPTCHA_SECRET` (server)
- CSP frame-src allows `newassets.hcaptcha.com`

**MailerLite (newsletter):**
- Endpoint: `https://assets.mailerlite.com/jsonp/1830582/forms/167181006278755829/subscribe` (`src/lib/config/constants.ts` `MAILERLITE_SUBSCRIBE_ENDPOINT`)
- Server proxy: `src/routes/api/newsletter/+server.ts`
- Auth: None (form-encoded; reCAPTCHA token forwarded as `g-recaptcha-response`)

**Rain Strategies Registry (GitHub):**
- URL: `https://raw.githubusercontent.com/rainlanguage/rain.strategies/${RAIN_STRATEGIES_COMMIT}/registry`
- Consumer: `src/lib/services/orderDeployment.ts` (loads strategy YAML)

**OpenChain (signature/error decoding):**
- Host allowed in CSP: `https://api.openchain.xyz` (used by Rain SDK / debugging)

## Data Storage

**On-chain (primary state):**
- Rain Orderbook v4 contract on Base — `0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D`
- Asset tokens (wrapped + unwrapped ERC4626 + legacy) on Base — addresses listed in `src/lib/config/tokens.ts`:
  - wtNVDA, wtAMZN, wtTSLA, wtMSTR, wtIAU, wtCOIN, wtSPYM (legacy SPLG), wtSIVR, wtCRCL, wtBMNR, wtPPLT
  - Each token has 3 address variants (wrapped, unwrapped, legacy) with helpers `getTokenByAnyAddress()`, `getTokenAddressVariants()`
- Payment tokens on Base: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Crypto reference tokens (CRYPTO_TOKENS) on Arbitrum + Base: WBTC, WETH, ARB, USDC

**Subgraphs (Goldsky):**
- SFT subgraph (Base): `https://api.goldsky.com/api/public/project_cmjr2df7svg6t01tl2ic706ao/subgraphs/sft-base/1.0.10/gn`
- Metadata subgraph (Base): `https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn`
- Orderbook v4 subgraph (Base, active): `https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn`
- Orderbook v4 subgraph (Base, inactive/historical): `…/ob4-base/2025-10-11-a62b/gn`
- Legacy SFT subgraph (Base): `…/sft-offchainassetvaulttest-base/1.0.5/gn`
- LP attribution subgraph (Goldsky): default `https://api.goldsky.com/api/public/project_cmjr2df7svg6t01tl2ic706ao/subgraphs/st0x-rewards-base/1.0.23/gn` via env `LP_SUBGRAPH_URL`
- All wired in `src/lib/config/networks.ts` (`subgraph_url`, `metadata_subgraph_url`, `orderbook_subgraph_url`, `orderbook_subgraph_urls_inactive`, `subgraph_urls_legacy`)
- GraphQL clients: `src/lib/clients/subgraph.ts` (typed) and inline `fetch` in `src/lib/api/subgraph.ts` (with retry + pagination)

**KV / Redis (server cache + access registry):**
- Implementation: `src/lib/server/kv.ts` — uses `redis` client when `REDIS_URL` is set, otherwise dev mock
- Key namespaces (`KV_KEYS`): `access_codes:*`, `wallets:*`, `code_wallets:*`, `snapshots:*`, monthly points
- Used by: access codes, snapshot pipeline, rate limiter, Nansen tiers cache, rewards
- Vercel KV CSP entry: `https://*.vercel-kv.com`

**Blob Storage (Vercel Blob):**
- SDK: `@vercel/blob` (`put`, `list`)
- Token: `BLOB_READ_WRITE_TOKEN`
- Snapshot writes: `src/routes/api/cron/snapshots/+server.ts` — `snapshots/{tokenSymbol}/{blockNumber}.json` (public access, JSON content-type)
- Snapshot reads/listing: `src/routes/api/snapshots/list/+server.ts`, `src/routes/api/snapshots/get/+server.ts`, `src/routes/api/admin/snapshots/regenerate/+server.ts`, `src/routes/api/admin/snapshots/recalculate/+server.ts`
- Index builder: `src/lib/server/snapshots/blobIndex.ts`

**IPFS (Pinata):**
- SDK: `pinata-web3` 0.4.1
- Wrapper: `src/lib/server/pinata.ts`
- Auth: `PRIVATE_PINATA_JWT`, `PRIVATE_PINATA_GATEWAY_KEY`
- Public gateway URL: `PUBLIC_PINATA_GATEWAY_URL`

**Local file storage:**
- Static assets in `static/` (token logos, `openapi.json`, `scalar.html`, favicons)

## Authentication & Identity

**Two-path wallet auth:**
1. Direct wallet via wagmi (`@wagmi/connectors`: `injected`, `walletConnect`) — initialized in `src/routes/+layout.svelte`
2. Dynamic Labs embedded wallet — `src/lib/dynamic/DynamicReactProvider.tsx`
- Unified through `src/lib/services/walletService.ts` (`sendTransaction`, `signMessage`, `waitForTransactionReceipt` switch by `authMethod`)
- Auth state in `src/lib/stores/authStore.ts` (`walletAddress`, `authMethod: 'wallet' | 'dynamic' | 'none'`)
- Dynamic session details in `src/lib/stores/dynamicStore.ts`

**Server-side wallet identity:**
- Cookie `wallet-address` (lowercased, set client-side in `src/routes/+layout.svelte` `setWalletCookie`) — used by `hooks.server.ts` for path protection and by `src/routes/api/onramper/sign-url/+server.ts`
- Signature verification via `viem.publicClient.verifyMessage` supporting ECDSA, EIP-1271 (smart contract wallets), EIP-6492 (counterfactual) — `src/lib/server/accessCodes.ts` (`verifyWalletSignature`)
- Signature challenge service: `src/lib/server/signatureChallenge.ts`
- CSRF: `src/lib/server/csrf.ts` — required on Onramper sign-url, etc.

**Admin Basic Auth (separate from wallet auth):**
- Username/password from `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`
- Session token = SHA-256 over `"${timestamp}-${user}:${pass}-${SESSION_SECRET}"` (`src/lib/server/auth.ts`); 24-hour `auth-session` + `auth-timestamp` cookies; verified via `crypto.timingSafeEqual`
- Admin paths protected in `src/hooks.server.ts` (`isAdminPath`)

**Access codes (waitlist gate):**
- Format `ST0X-XXXX-XXXX` (`src/lib/server/accessCodes.ts` `generateAccessCode`)
- KV-backed registry; hCaptcha required for registration; signature-bound to wallet
- Routes: `src/routes/api/access/{challenge,validate,register,check}/+server.ts`

**Account abstraction:**
- CLAUDE.md mentions Rhinestone SDK and EIP-7702 smart EOAs, however no code under `src/` currently imports a Rhinestone package, and there is no `src/lib/services/account-abstraction/` directory or `aa/` components subfolder. Only references are in `.claude/settings.local.json` (allow-listed doc domain). Treat AA integration as not currently shipped.

## Monitoring & Observability

**Product analytics:**
- PostHog (EU) — `src/lib/services/analytics.ts`
  - `api_host: 'https://eu.i.posthog.com'`
  - `defaults: '2025-11-30'`, manual `capture_pageview`, autocapture off
  - Session recording with `maskAllInputs: true`
  - Wallet-driven `identify`/`reset` based on `walletAddress` store
  - Public key: `PUBLIC_POSTHOG_KEY`
- `@vercel/analytics/sveltekit` — `injectAnalytics()` after consent
- `@vercel/speed-insights/sveltekit` — `injectSpeedInsights()` after consent
- Cookie consent via `vanilla-cookieconsent` (`src/lib/components/CookieConsent.svelte`)

**Error tracking:**
- No external error tracking SDK (no Sentry/Rollbar). Errors logged via `console.error` and routed through `src/lib/utils/monitoring.ts` (`logQueryFailure`, `errorMessage`).

**Audit log:**
- `src/lib/server/auditLog.ts`

**Logs:**
- `console.log`/`console.warn`/`console.error` server-side; gated debug via `DEBUG_LOGIN=true` in `hooks.server.ts`

## CI/CD & Deployment

**Hosting:**
- Vercel (`@sveltejs/adapter-vercel`)
- Domains: `https://www.st0x.io`, `https://st0x.io` (`src/hooks.server.ts` `PRODUCTION_ORIGINS`)
- Vercel preview origins detected dynamically via `env.VERCEL_URL`

**CI Pipeline:**
- Not detected in repo (no `.github/workflows/`, no `.gitlab-ci.yml`)

**Cron:**
- Vercel cron — `vercel.json` schedules `/api/cron/snapshots` at `1 0 * * *` UTC
- Authenticated via `Authorization: Bearer ${CRON_SECRET}` (`src/routes/api/cron/snapshots/+server.ts`)
- `maxDuration: 800` seconds

## RPC Endpoints

**Base (chainId 8453):**
- Primary: `https://base-mainnet.g.alchemy.com/v2/...` (Alchemy — key embedded in `src/lib/config/networks.ts`, `src/lib/clients/raindex.ts`, `src/lib/server/accessCodes.ts`, `src/lib/server/referrals.ts`)
- Fallbacks (`networks.ts` `fallbackRpcUrls`):
  - `https://base-rpc.publicnode.com`
  - `https://base.llamarpc.com`
  - `https://base.meowrpc.com`
  - `https://base-mainnet.public.blastapi.io`
  - `https://gateway.tenderly.co/public/base`
- CSP-allowed extras: `rpc.ankr.com`, `base.drpc.org`
- Note (`raindex.ts`): Raindex SDK uses multicall `eth_call`; only Alchemy RPC is configured for it (others omitted because they break multicall)

## Multi-Chain Configuration

| Chain | Chain ID | Status in repo |
|---|---|---|
| Base | 8453 | Active — full networks entry, primary trading network |
| Arbitrum | 42161 | Reference-only — appears in `CRYPTO_TOKENS` (WBTC, WETH, ARB, USDC) but no `Network` entry in `networks.ts` |
| Optimism | 10 | Mentioned in CLAUDE.md but no networks entry or token entries in source |
| Ethereum | 1 | Mentioned in CLAUDE.md but no networks entry or token entries in source |

The `networks` array in `src/lib/config/networks.ts` currently contains only Base. Multi-chain support beyond Base is described as planned in `CLAUDE.md` but not configured in code.

## Environment Configuration

**Required env vars (server, production):**
- `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`, `SESSION_SECRET`
- `HCAPTCHA_SECRET`
- `CRON_SECRET`
- `BLOB_READ_WRITE_TOKEN`
- `REDIS_URL` (KV)
- `ST0X_API_URL`, `ST0X_API_KEY`, `ST0X_API_SECRET`
- `ONRAMPER_SECRET_KEY`
- `LP_SUBGRAPH_URL`
- `LIQUIDITY_MONITOR_URL`
- `PRIVATE_PINATA_JWT`, `PRIVATE_PINATA_GATEWAY_KEY`

**Required env vars (public, browser):**
- `PUBLIC_WALLETCONNECT_ID`
- `PUBLIC_DYNAMIC_ENVIRONMENT_ID`
- `PUBLIC_POSTHOG_KEY`
- `PUBLIC_PINATA_GATEWAY_URL`
- `PUBLIC_ONRAMPER_API_KEY`, `PUBLIC_ONRAMPER_ENV`

**Optional:**
- `DEBUG_LOGIN`, `CUSTOM_LOGIN_ENABLED`
- `PRIVY_APP_SECRET`, `PUBLIC_PRIVY_APP_ID` (declared in `.env.example` but not referenced by current source)

**Secrets location:**
- Vercel project environment variables (per-environment)
- `.env.example` and `.env.local` exist locally; `.env.local` not read by this analysis

## Webhooks & Callbacks

**Incoming:**
- `GET /api/cron/snapshots` — Vercel cron (Bearer-token authenticated)

**Outgoing:**
- None detected (no Stripe, Twilio, Discord, Slack, etc. webhook senders)

## Security & Networking

**CSP allow-list (`src/hooks.server.ts` lines 152–173):**
- Comprehensive `connect-src`, `frame-src`, `script-src`, `style-src`, `font-src` allowing exactly the integrations above
- Bot/scanner paths rejected silently (`isBotOrMalformedPath`)
- HSTS in production only; CSP `upgrade-insecure-requests` only outside dev
- `frame-ancestors 'none'`, `X-Frame-Options: DENY`

**Rate limiting:**
- `src/lib/server/rateLimit.ts` — tier-based limits for `onramper`, `newsletter`, public API, etc.
- Rate-limit headers exposed via CORS: `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-RateLimit-Tier`, `Retry-After`

**CORS:**
- Internal API: production domains + `VERCEL_URL` + dev localhost (5173–5180, 3000–3005)
- Public API (`/api/public/*`): `Access-Control-Allow-Origin: *`, no credentials

---

*Integration audit: 2026-04-28*
