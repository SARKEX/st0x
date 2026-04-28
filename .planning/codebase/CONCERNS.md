# Codebase Concerns

**Analysis Date:** 2026-04-28

## Tech Debt

**Order INPUT/OUTPUT perspective semantics — known footgun:**
- Issue: The same words ("input", "output") mean opposite things at the maker layer (on-chain order perspective: output = what the order *gives*) vs the taker layer (user perspective: takerWants/takerPays). Any code that mixes these layers without going through the helpers will silently invert sides.
- Files: `src/lib/types/orderPerspective.ts` (single source of truth — `deriveMakerSide`, `getUserTakerInfo`, `makerToTakerTokens`, `takerToMakerTokens`); `src/lib/services/marketOrderExecution.ts:395-431` (`filterQuotesForSide` — taker-side filter that crosses against ask for Buy / bid for Sell); `src/lib/services/orderDeployment.ts:175,221` (`gui.setDeposit('output', ...)` — deposit goes into the order's *output* vault, i.e. the side that gives away); `src/lib/utils/tradeTransform.ts:40-83` (per-trade Buy/Sell derivation from raw subgraph data — duplicates this logic outside the helpers).
- Why: Two perspectives are unavoidable (chain ABI vs UI), but the naming collision is a permanent trap.
- Impact: Recent regression (commit `89571b3`) — Sell orders ignored user slippage entirely because of side-asymmetric handling in `executeMarketOrder`; emergency multiplier was hardcoded `'2'` for Sell while Buy used `computeRatioMultiplier(slippageBps)`. Same commit fixed a partial-fill detection bug that compared `totalInputAmount` vs `requestedTakerWantsAmount` for spend-anchored modes (Sell-by-asset, Buy-by-spend), conflating price slippage with quantity shortfall.
- Fix approach: Always go through `src/lib/types/orderPerspective.ts` helpers when crossing the maker/taker boundary. Treat any new code that touches `inputTokenAddress` / `outputTokenAddress` / `inputIOIndex` / `outputIOIndex` directly as risky and demand a unit test that pins the side. Tests in `tests/lib/types/orderPerspective.test.ts` and `tests/lib/utils/marketOrderFill.test.ts` should be the template. Consider banning the names "input"/"output" in product code outside this module — use "asset/payment" or "wants/pays" everywhere else.

**Admin page bloat (`src/routes/admin/+page.svelte`):**
- Issue: 2898 lines in a single Svelte file (1483 lines of `<script>` + 1415 lines of template), with 38 functions. Owns Chart.js (6 chart canvases), trade processing, TVL display, swap snapshots, leaderboards, period selector, CSV export, three-section navigation (`activity` / `tvl` / `swaps`).
- Files: `src/routes/admin/+page.svelte`. Sibling `src/routes/admin/rewards/+page.svelte` is even worse at **4933 lines** with 47 functions. Shared transaction store at `src/lib/stores/transaction.ts` is 2373 lines.
- Why: Internal admin tool grew organically without refactoring pressure (no end-user impact when it slows down).
- Impact: Slow HMR, hard to test, easy to introduce bugs in unrelated sections, Chart.js refs/destruction across 6 canvases is a teardown hazard. Map-construction patterns (`flatMap` building `Map<string, string>`) need explicit return-type annotations because Svelte 4 + TypeScript inference fails (see project memory). Single-file means one syntax error blocks the whole admin UI.
- Fix approach: Extract per-section components: `AdminActivity.svelte`, `AdminTvl.svelte`, `AdminSwaps.svelte`, plus `useTokenChart.ts`/`useTvlChart.ts` chart-helper modules. Move trade aggregation into `src/lib/server/admin-aggregations.ts` so the server can compute summaries instead of shipping raw transaction lists. Same treatment for `admin/rewards/+page.svelte`.

**Hardcoded Alchemy API key checked into source:**
- Issue: Alchemy v2 API key `y3BXawVv5uuP_g8BaDlKbKoTBGHo9zD9` is committed in plaintext.
- Files: `src/lib/clients/raindex.ts:26`, `src/lib/config/networks.ts:48,51`, `src/lib/server/accessCodes.ts:10`.
- Why: Convenience — the project ships the key with the bundle so the SDK and signature verification work without env wiring.
- Impact: Anyone with read access to the repo (or the production JS bundle) can drain the Alchemy quota. Rotating the key requires a coordinated deploy across all three call sites.
- Fix approach: Move to `env.PUBLIC_BASE_RPC_URL` (public for client) and `env.BASE_RPC_URL` (server). Rotate the existing key on next deploy. The `fallbackRpcUrls` list already has 5 public RPCs, so the bundle still works without an Alchemy key — only `raindex.ts` and `accessCodes.ts` need a real one because they do `eth_call` (multicall and EIP-1271 verification).

**CLAUDE.md / project-memory drift from actual code:**
- Issue: `CLAUDE.md` claims multi-chain support across Base/Arbitrum/Optimism/Ethereum (lines 90-95), Rhinestone SDK + EIP-7702 smart accounts (lines 105-110), and code in `src/lib/services/account-abstraction/`. None of these exist.
- Files: Only `src/lib/config/networks.ts` (single Base entry), only `src/lib/services/walletService.ts` (wagmi + Dynamic, no Rhinestone), no `account-abstraction/` directory, no `rhinestone` / `7702` references anywhere in `src/` or `package.json`.
- Why: Documentation written aspirationally or never updated after an architecture pivot.
- Impact: Anyone (human or LLM) following CLAUDE.md spends time looking for non-existent modules, plans for multi-chain edge cases that don't apply, or assumes account-abstraction footguns to avoid that aren't in scope.
- Fix approach: Trim CLAUDE.md to current reality: single chain (Base 8453), two auth paths (wagmi + Dynamic embedded), no AA. Add this file as a counterweight pointer.

**Token lookups bypassing `getTokenByAnyAddress` for asset/legacy detection:**
- Issue: `getTokenByAnyAddress()` is the canonical helper to handle the wrapped/unwrapped/legacy address triplet (per project memory), but several call sites use `TOKENS.find(...)` against the wrapped `address` only. These miss the unwrapped/legacy variants.
- Files: `src/lib/utils/tradeTransform.ts:48-52,138-142` (asset detection in trade transform — used by dashboard); `src/lib/api/orders.ts:73` (`estimateRatioFromFallback`); `src/lib/api/subgraph.ts:18-19,139` (REST API queries assume wrapped only); `src/lib/queries/oracleQuotes.ts:61` and `src/lib/queries/priceFeeds.ts:10` (SPYM-specific, narrower); `src/lib/components/QuickTrade.svelte:42-46`, `src/lib/components/orders/LimitOrder.svelte:81-82`, `src/lib/components/orders/DcaOrder.svelte:41-42` (use `ALL_TOKENS.find` against wrapped address only — fine for newly-deployed orders, breaks for any order routed via legacy/unwrapped addresses).
- Why: Most live tokens use the wrapped address, so the bug is invisible during normal flows.
- Impact: Trade history rows and price-fallback estimates for legacy/unwrapped tokens display as "UNKNOWN" or fall back to default. Less critical than balances (snapshot pipeline already uses the helper consistently), but still wrong on the dashboard.
- Fix approach: Replace direct `TOKENS.find` against `address` with `getTokenByAnyAddress(addr)` everywhere, except in places where you specifically need the wrapped address (e.g. for an outgoing API query that only knows wrapped). Add an ESLint custom rule or a comment marker (`// allow-direct-token-find`) to mark intentional bypasses.

**Hardcoded USDC address scattered across files:**
- Issue: `'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'` appears as a local `USDC_ADDRESS` constant in two unrelated files instead of resolving from `src/lib/config/tokens.ts` payment-token config.
- Files: `src/routes/admin/+page.svelte:901`, `src/routes/api/admin/nansen/+server.ts:14`. Used for owner-buying/selling classification.
- Why: Quick local constant during admin-page authoring.
- Impact: Adding a second payment token (USDT, WETH already exist in config) won't be reflected in admin classifications without editing these files.
- Fix approach: Replace with `isPaymentToken(addr, network)` from `src/lib/utils/tokenMath.ts` (already exists) or a new `getPaymentTokensForNetwork(network)` lookup.

**Default fallback secrets in auth and CSRF:**
- Issue: `auth.ts` and `csrf.ts` fall back to hardcoded strings if `SESSION_SECRET` env var is missing.
- Files: `src/lib/server/auth.ts:9` (`'st0x-session-secret-2024'`), `src/lib/server/csrf.ts:10` (`'default-csrf-secret-change-in-production'`).
- Why: Convenience for local dev so missing env doesn't crash.
- Impact: If a deployment ever ships without `SESSION_SECRET`, admin sessions and CSRF tokens become fully predictable. Defense-in-depth says fail closed.
- Fix approach: Throw at module load if `env.SESSION_SECRET` is missing in production (`!dev && !env.SESSION_SECRET`). Already done correctly for `CRON_SECRET` in `src/routes/api/cron/snapshots/+server.ts:45`.

## Known Bugs

**Slippage tolerance ignored on Sell + false partial-fill flag (FIXED 2026-04-27):**
- Symptoms: Sell orders filled at deep discounts regardless of user's slippage setting (e.g. 0.1% setting still filled 50% off). Then the post-fill check would falsely flag full-quantity Sells as "partial fill" because it compared the wrong side.
- Files: `src/lib/services/marketOrderExecution.ts` (priceCap derivation), `src/lib/stores/transaction.ts` (partial-fill check), `src/lib/utils/marketOrderFill.ts` (extracted helpers).
- Trigger: Any market Sell with non-default slippage; partial-fill check fired on any spend-anchored mode (Sell-by-asset, Buy-by-spend).
- Workaround: None — fix was deployed in commit `89571b3`. Tests added in `tests/lib/utils/marketOrderFill.test.ts` (19 cases).
- Root cause: (1) Hardcoded `EMERGENCY_RATIO_MULTIPLIER = '2'` (100% per-leg) for Sell. (2) Partial-fill check anchored on `requestedTakerWantsAmount` (simulated receive) instead of `requestedTakerPaysAmount` (typed pays) for spend-anchored modes. The taker-vs-maker INPUT/OUTPUT semantics inversion is the root cause class — see Tech Debt entry above.

**SPYM/fallback price went stale on order ioRatio estimation (FIXED 2026-04-?):**
- Symptoms: Strategy orders with no live quote (`ioRatio === '-'`) used a hardcoded fallback price from token config that drifted from real markets, distorting the depth chart.
- Files: `src/lib/api/orders.ts:53-86` (`estimateRatioFromFallback`).
- Workaround: None — fix was commit `6c1919f`. Now reads live oracle price from TanStack Query cache (`['oracleQuotes', networkId]`) and only falls back to `token.fallbackPrice` if the cache is empty.
- Root cause: Hardcoded constant in `src/lib/config/tokens.ts:162` (`fallbackPrice: 82.5` on SPYM).
- Note: Other places still use `fallbackPrice` directly (`src/lib/server/snapshots/pyth.ts:215`) but that path is gated by `LIQUIDITY_MONITOR_URL` upstream lookup. If the monitor goes down, snapshots use stale prices for SPYM — see Fragile Areas.

**`/api/snapshots/preview` runs full snapshot recalc with no rate limit:**
- Symptoms: Any registered wallet can hit `/api/snapshots/preview` or `/api/snapshots/preview-stream` and trigger `generateAllTokenSnapshots(blockNumber)` — full SFT subgraph scrape + Pyth fetch + vault holdings fetch + per-wallet points calculation. Single request takes 10-60s.
- Files: `src/routes/api/snapshots/preview/+server.ts:13-143`, `src/routes/api/snapshots/preview-stream/+server.ts:11-`, `src/routes/api/snapshots/generate/+server.ts:11-62` (`POST` even *writes* blob storage with no rate limit).
- Trigger: Send GET `/api/snapshots/preview?block=N` with a registered wallet cookie. Repeat to DoS the Pyth API quota.
- Workaround: None.
- Root cause: Endpoints listed in `requiresWalletRegistration` (hooks.server.ts:236) but no rate limiter applied at the handler level. Fail-open default.
- Fix: Wrap in `applyTieredRateLimit(request, 'snapshots-preview', ...)`. For `/api/snapshots/generate` POST that writes blob: gate behind `requireAdmin`.

**Math.random() used to mint access codes and referral codes:**
- Symptoms: Access codes (`ST0X-XXXX-XXXX`, format used in `accessCodes.ts:46-51`) and referral codes (`st0x-ref-xxxxxx`, `referrals.ts:63-70`) are generated with `Math.random()`.
- Files: `src/lib/server/accessCodes.ts:49`, `src/lib/server/referrals.ts:67`.
- Trigger: Predicting future codes given enough observed past codes from the same Node.js process (V8 PRNG state can be reconstructed from ~5 64-bit outputs).
- Workaround: None — codes are short (32 chars in entropy alphabet, 8 picks → ~40 bits) so brute-force is also possible if you can submit guesses fast enough; rate limit on `/api/access/check` mitigates this.
- Root cause: `Math.random()` is non-CSPRNG.
- Fix: `crypto.randomBytes()` rejection-sampled into the alphabet. The session token code in `src/lib/server/signatureChallenge.ts:58-60` already uses `crypto.randomBytes(16).toString('hex')` — apply the same pattern.

## Security Considerations

**`wallet-address` cookie is client-set and unverified:**
- Risk: The `wallet-address` cookie (used by `hooks.server.ts:251` and three downstream endpoints) is set client-side via `document.cookie` in `src/routes/+layout.svelte:75` with no signature, no HMAC, no HttpOnly. Any user can spoof any wallet address on the server side by sending an arbitrary value.
- Files: `src/routes/+layout.svelte:65-80` (sets cookie); `src/hooks.server.ts:248-258` (reads & validates only as `0x[40 hex]`); consumers: `src/routes/api/onramper/sign-url/+server.ts:69-83` (uses cookie as authenticated wallet for signing!), `src/routes/api/access/check/+server.ts:25`, `src/routes/api/rewards/global/+server.ts:164`, `src/routes/api/rewards/leaderboard/+server.ts:22`.
- Current mitigation: `requireAdmin`-gated endpoints don't trust the cookie. Wallet registration check (`isWalletRegistered`) at `hooks.server.ts:425` provides a sanity check that the spoofed address is at least registered. CSRF on `/api/onramper/sign-url` is enforced. The Onramper signing endpoint additionally requires the requested wallet to match the cookie, which prevents arbitrary signing — but the cookie itself is the auth.
- Recommendations:
  1. Issue a server-signed session cookie tied to a successfully verified signature (`signatureChallenge.ts` flow already exists for `access_register`). Bind a session-id cookie to a server-side KV record holding the verified wallet address.
  2. Mark cookie HttpOnly + Secure + SameSite=Strict.
  3. Until then, treat `wallet-address` cookie purely as a hint for rate-limiting/personalization — never as proof of wallet ownership.

**Stateless CSRF tokens issued by public unauthenticated endpoint:**
- Risk: `/api/auth/csrf` is in `isPublicPath()` (no auth). It returns a token signed only by `SESSION_SECRET` — no binding to a session, IP, or wallet. An attacker can fetch their own valid token and use it on any CSRF-protected endpoint.
- Files: `src/lib/server/csrf.ts:17-28` (token generation), `src/routes/api/auth/csrf/+server.ts:9-13` (public issuance), `src/hooks.server.ts:219` (public path).
- Current mitigation: CSRF check is paired with the `wallet-address` cookie and origin checks (CORS). It blocks browser-CSRF (third-party site forging requests) but not malicious client requests.
- Recommendations: Bind CSRF tokens to a `session-id` cookie (set HttpOnly on first visit); validate `tokenSession === requestSessionId`. Use the double-submit-cookie pattern.

**HCAPTCHA bypass in non-production environments:**
- Risk: `verifyCaptcha` returns `true` in non-production if `HCAPTCHA_SECRET` is missing (`accessCodes.ts:96-97`). If a preview/Vercel deploy ever forgets to set the env var, captcha is silently disabled.
- Files: `src/lib/server/accessCodes.ts:88-114`.
- Current mitigation: Production correctly fails closed (`accessCodes.ts:91-94`). The check is `process.env.NODE_ENV === 'production'`.
- Recommendations: Fail closed on Vercel preview deploys too — they sometimes share traffic with production via shared cookies.

**EIP-1271 / EIP-6492 signature verification on a single Alchemy RPC:**
- Risk: `verifyWalletSignature` in `accessCodes.ts:64-85` uses `viem`'s `publicClient.verifyMessage` which invokes `eth_call` for smart-contract wallets. The client is hardwired to a single Alchemy RPC (`accessCodes.ts:8-11`). If Alchemy throws transient errors, signature verification fails and the user can't register.
- Files: `src/lib/server/accessCodes.ts:8-11,64-85`.
- Current mitigation: None — single RPC, no retry.
- Recommendations: Use the `fallbackRpcUrls` chain like the snapshot generator does (`generator.ts:13-35`). Add a `withRetry` wrapper on transient `header not found` / `block not found` errors.

**Bot scanner pattern list is short and may swallow legitimate paths:**
- Risk: `BOT_PATH_PATTERNS` in `hooks.server.ts:321-327` 404s any path matching `\.php\d?$/`, `^/wp-`, etc. Reasonable, but `^/_next/` is matched — if anything ever links to `/_next/whatever` (e.g. an old Next.js shell), it returns 404 with no logs.
- Files: `src/hooks.server.ts:320-339`.
- Current mitigation: None.
- Recommendations: Log `BotOrMalformedPath` rejections at `info` level so we can see what's getting eaten.

## Performance Bottlenecks

**`generateAllTokenSnapshots` runs in O(tokens × addresses × subgraphs):**
- Problem: For each of the ~12 ST0x tokens, the generator hits the SFT subgraph (paginated 1000 at a time, until exhaustion), the legacy SFT subgraph, the wrapped-token subgraph, the metadata subgraph, then Pyth Hermes for each price feed, then RPC for vault holdings.
- Files: `src/lib/server/snapshots/generator.ts:142-172`, `src/lib/server/snapshots/scraper.ts:255-297` (paginated batch fetch).
- Measurement: From `[Preview]` console logs — full snapshot is 10-60s wall time depending on how many transfers exist. Step 2 (transfers, prices, vaults) dominates.
- Cause: Subgraph pagination is sequential per page (one fetch waits for the previous to finish). Pyth fetch is one round-trip per timestamp.
- Improvement path: Cache subgraph cursor pages keyed by `(blockNumber, tokenAddress)` — a snapshot for a frozen block never changes. Or pre-warm cache on cron tick. Pyth Hermes already retries with backoff (`pyth.ts:78-146`).

**`/api/public/wallet` recomputes all wallet rankings on every cache miss:**
- Problem: First request after cache expiry triggers `fetchRewardsData(currentMonth)` then `Object.entries(monthlyData.wallets)` filter+sort over potentially thousands of wallets.
- Files: `src/routes/api/public/wallet/+server.ts:36-98`.
- Measurement: Not instrumented. Cache TTL is `CACHE_TTL.LONG` (1 hour) so recomputation is at most once an hour.
- Cause: Sort over all wallets every refresh.
- Improvement path: Only sort top-N (heap-based), or compute ranks during snapshot ingestion in the cron job and store sorted in KV.

**Aggressive polling on TanStack queries:**
- Problem: Trade pages poll orderbook, oracle quotes, and price feeds every 15s (`refetchInterval: 15_000`); recently dropped from 60s in commit `e8f9805`.
- Files: `src/lib/queries/orderbook.ts:74,260`, `src/lib/queries/priceFeeds.ts:44`, `src/lib/queries/oracleQuotes.ts:39`, `src/lib/queries/tradeActivity.ts:35,74,99`.
- Measurement: 4 simultaneous polls every 15s per open trade tab.
- Cause: User-perceived freshness requirement.
- Improvement path: Server-Sent Events from `/api/st0x/[...path]/+server.ts` proxy for live order updates. Already partly mitigated via Vercel edge cache (`s-maxage=5, stale-while-revalidate=120` in `src/routes/api/st0x/[...path]/+server.ts:36-42`).

## Fragile Areas

**`src/lib/stores/transaction.ts` (2373 lines) — the deployment + market-take state machine:**
- Files: `src/lib/stores/transaction.ts`. Imports from 13+ modules; orchestrates wagmi, Dynamic, Float, Raindex SDK, orderbook ABI decoding.
- Why fragile: Owns aggregated-vs-fallback take-order paths, stale-session detection, balance/allowance reads with retry, post-confirmation polling, partial-fill detection, vault invalidation, analytics. Circular import with `marketOrderExecution.ts` was only resolved by extracting `src/lib/utils/marketOrderFill.ts` in commit `89571b3`.
- Common failures: Stale wallet session after Dynamic re-auth (handled via `isStaleWalletSessionError` + `handleStaleWalletSession`); precision rounding errors in Float arithmetic — `*UpTo` modes were chosen over `*Exact` specifically to tolerate `0.999...999` vs `1` (see comment `marketOrderExecution.ts:244-247`); aggregated SDK path falls back to per-order execution on subgraph staleness (`marketOrderExecution.ts:328-368`).
- Safe modification: Don't introduce new imports from `transaction.ts` back into helpers — circular import lurks. Always add a unit test for new fill-evaluation paths in `tests/lib/utils/marketOrderFill.test.ts`. Test stale-session paths with `tests/lib/stores/handleTakeOrders.test.ts`.
- Test coverage: Reasonable on helpers (marketOrderFill 19 tests, marketOrderExecution covered). The store itself has `tests/lib/transactionStore.test.ts` and `tests/lib/stores/handleTakeOrders.test.ts` but the file's size means many code paths are not exercised.

**RPC fallback chain in `generator.ts` — fail-silent on all RPCs failing:**
- Files: `src/lib/server/snapshots/generator.ts:19-35` (`callRpc`).
- Why fragile: Iterates `RPC_URLS = [networks[0].rpcUrl, ...networks[0].fallbackRpcUrls]` and returns `null` on total failure. Caller throws, but only for the *outer* call (`getBlockTimestamp` etc.). No retry per RPC — single attempt each. Recent commits `db2814b`, `da96e99`, `43e8f70` rotated RPCs, suggesting flakiness is real.
- Common failures: All 6 RPCs returning empty `result` field (some public RPCs strip fields under load), causing `getBlockNumberForTimestamp` to silently use `latestBlock` as the closest block (line 61 — `let closestBlock = latestBlock`), which means cron snapshots silently use the wrong block on bad days.
- Safe modification: Add per-RPC retry with backoff. Treat empty `result` as failure, not success-with-null.
- Test coverage: None for the fallback chain.

**SPYM / fallback-priced tokens depend on external `LIQUIDITY_MONITOR_URL`:**
- Files: `src/lib/server/snapshots/pyth.ts:195-226`.
- Why fragile: SPYM has no Pyth feed, so its snapshot price is whatever `LIQUIDITY_MONITOR_URL/api/prices/spym` returns, falling back to `token.fallbackPrice` (`82.5` hardcoded in `tokens.ts:162`). The monitor is the single point of failure for accurate SPYM TVL. There's a 5s timeout (`AbortSignal.timeout(5000)`) but no retry.
- Common failures: Monitor down → stale price (`82.5` from token config) used in snapshots, distorting TVL and leaderboards for whoever holds SPYM.
- Safe modification: Add caching of last-good price in KV; reject snapshot generation entirely if both monitor and fallback are unavailable for too long.
- Test coverage: None for this branch.

**Goldsky subgraph schema drift between current and legacy SFT versions:**
- Files: `src/lib/server/snapshots/scraper.ts:189-208` — explicitly catches `Cannot query field "wrappedTokenTransfers"` to handle legacy `1.0.5` schema that lacks the entity.
- Why fragile: Legacy subgraphs at `subgraph_urls_legacy` (currently one URL pinned at `1.0.5`) silently lack fields the scraper expects. The scraper's exception handling only catches that one field; if Goldsky changes any other schema, scrapes will fail mid-batch.
- Common failures: Subgraph URL deprecation, schema change in newer SFT subgraph (currently `1.0.10`).
- Safe modification: Always wrap subgraph fetches in defensive try/catch *per-field*. Never trust historical subgraphs to be available indefinitely.
- Test coverage: None for legacy-fallback paths.

**SFT subgraph mints/burns double-count trap (resolved, watch for regressions):**
- Files: `src/lib/server/snapshots/scraper.ts:165-248`.
- Why fragile: The SFT subgraph's `sharesTransfers` entity already includes both mints (from `0x0`) and burns (to `0x0`). A naive scraper that *also* fetches `depositWithReceipts` and `withdrawWithReceipts` would double-count every mint/burn (see project memory: "feedback_wrapped_address_api.md"). Comments in `scraper.ts:165-169` document this explicitly. Anyone adding new entity fetches must respect this invariant.
- Common failures: PR adds `depositWithReceipts` to "improve mint detection" → all TVL data is silently 2x.
- Safe modification: Keep `scraper.ts` as the single fetch surface. Treat any new subgraph entity addition as needing review against this invariant.
- Test coverage: Indirect — `tests/lib/server/snapshots/scraper.test.ts` (if present) should exercise this.

**Hooks.server.ts auth flow — multiple cookies / multiple paths:**
- Files: `src/hooks.server.ts:341-469`.
- Why fragile: Three independent auth paths interleave (admin session, wallet registration, public). Order matters — bot-rejection is first, OPTIONS preflight second, public path third, admin fourth, wallet registration fifth. CSP differs in dev (`upgrade-insecure-requests` skipped). Cookie list (`auth-session`, `auth-timestamp`, `wallet-address`) is parsed manually without zod schema. Admin session "bypass for API routes" at line 410 is a special case: any admin can call `/api/snapshots/*` even without wallet registration.
- Common failures: Adding a new public path forgets to update both `isPublicPath()` and the CSP `connect-src` list. Adding a new auth method needs to propagate to all three layers.
- Safe modification: Add a unit test in `tests/hooks.server.test.ts` (doesn't exist yet) covering each path classification before changing the order.
- Test coverage: None for the hook itself.

**Order deployment registry pinned to a git commit, fetched at runtime:**
- Files: `src/lib/services/orderDeployment.ts:54-91` — `RAIN_STRATEGIES_COMMIT = '9dd64902161158395d588335f0a02e3a6d52f772'`, `REGISTRY_URL = "https://raw.githubusercontent.com/rainlanguage/rain.strategies/.../registry"`.
- Why fragile: Order deployments depend on GitHub serving raw content from a specific commit. GitHub raw is rate-limited (60 req/hr unauthenticated for some IPs). One-shot cache (`registryPromise`) means first hit per cold-start fetches.
- Common failures: GitHub raw rate-limited → first deploy after a cold start fails. Commit hash deleted/force-pushed → all deploys break (mitigated by pinning to a hash, but the hash must remain reachable).
- Safe modification: Mirror `rain.strategies` registry as a static asset under `/static/` or vendor it into the bundle.
- Test coverage: None.

## Scaling Limits

**Vercel function timeout for cron snapshot job:**
- Current capacity: `maxDuration: 800` (13.3 minutes) configured in `src/routes/api/cron/snapshots/+server.ts:164-166`.
- Limit: Vercel Pro tier max function duration. Snapshot generation already pushes 10-60s per block × 2 blocks/day. Holdings + transfers grow linearly with users.
- Symptoms at limit: Cron 504s, daily snapshot missed, monthly points incomplete.
- Scaling path: Move generation to a background queue (Inngest, Trigger.dev, or a Fly machine like the existing `st0x-oracle-server`). Stream snapshots into blob storage incrementally instead of building the full result in memory.

**KV state size for snapshot blocks list:**
- Current capacity: `kv.set(KV_KEYS.snapshotBlocks(), allBlocks.slice(-730))` — keeps the last 730 records (1 year × 2/day) in a single KV value.
- File: `src/routes/api/cron/snapshots/+server.ts:130-137`.
- Limit: Vercel KV max value size is ~25MB; 730 small records is fine (~70KB) but unbounded growth from new fields would be a problem.
- Symptoms at limit: KV write fails silently, master list goes stale.
- Scaling path: Use a Redis sorted set keyed by date instead of one giant list.

**In-memory rate limit fallback:**
- Current capacity: `inMemoryRateLimits` Map in `src/lib/server/rateLimit.ts:24` — single Vercel instance, in-process.
- Limit: Per-instance state. Vercel scales by spawning new instances; each has its own counter. If a user hits 10 instances they get 10× the rate budget.
- Symptoms at limit: Rate limit appears effectively unlimited under high load.
- Scaling path: Always require Redis (`fail-closed`) for production. The current code logs `failedClosed` but the in-memory path is the actual fallback (`rateLimit.ts:26-67`).

## Dependencies at Risk

**`@rainlanguage/orderbook` (WASM-based SDK):**
- Risk: Active dependency, frequently updated upstream (see `RAIN_STRATEGIES_COMMIT` reference). WASM module loaded dynamically via `getDotrainRegistry()` (`orderDeployment.ts:23-36`). API surface changes between versions are common (see `raindex.ts:10-13` comment about upstream adding `local-db-sync` field).
- Files: `src/lib/services/orderDeployment.ts:24-36`, `src/lib/clients/raindex.ts`, `src/lib/api/orders.ts`, `src/lib/stores/transaction.ts`.
- Impact: Any version bump can break order deployment, market take, or settings YAML parsing.
- Migration plan: Pin tightly in `package.json`; test against a staging branch before bumping.

**`svelte-wagmi` shim layer:**
- Risk: Wraps wagmi for Svelte. Wagmi's API has churned across major versions; svelte-wagmi tends to lag.
- Files: imported in `src/routes/+layout.svelte`, `src/lib/services/walletService.ts:5`, `src/lib/stores/transaction.ts:11,61`.
- Impact: Wallet connection breaks if svelte-wagmi drifts from wagmi.
- Migration plan: Consider replacing with direct wagmi-core + custom Svelte stores; the surface area used (`wagmiConfig`, `signerAddress`) is small.

**Pinned `RAIN_STRATEGIES_COMMIT` (GitHub raw fetch):**
- Risk: External SaaS dependency on GitHub raw content. See "Order deployment registry pinned" under Fragile Areas.
- Impact: All order deployments fail if GitHub raw is unreachable or the commit is gone.
- Migration plan: Vendor the registry into `/static/registry/` and serve it from the same origin.

## Test Coverage Gaps

**Hooks server entrypoint:**
- What's not tested: `src/hooks.server.ts` (469 lines) — the entire auth/CORS/CSP layering.
- Risk: Path-classification regression silently exposes admin/protected endpoints, or breaks login/registration flow. Order of `isPublicPath` / `isAdminPath` / `requiresWalletRegistration` checks is load-bearing.
- Priority: High — production auth surface.
- Difficulty to test: Medium. Requires SvelteKit test harness (`@sveltejs/kit/test`) or a thin handle-wrapping integration test.

**Snapshot scraper edge cases:**
- What's not tested: `src/lib/server/snapshots/scraper.ts` — pagination boundary, legacy subgraph fallback (the `wrappedTokenTransfers` exception handler at line 188-206), empty-result path, transient subgraph failure.
- Risk: Silent under-counting of transfers → wrong TVL, missing rewards points for some wallets.
- Priority: High — feeds points/rewards which are real money.
- Difficulty to test: Medium. Mock fetch with fixture responses.

**`getTokenByAnyAddress` vs `TOKENS.find` consistency:**
- What's not tested: No regression test catches when a new code path uses `TOKENS.find((t) => t.address === addr)` instead of `getTokenByAnyAddress(addr)`.
- Risk: Low-grade silent breakage on legacy/unwrapped-routed flows.
- Priority: Medium.
- Difficulty to test: Hard at unit-test level. Best fix is an ESLint rule banning `TOKENS.find` outside `src/lib/config/tokens.ts` and `src/lib/server/snapshots/`.

**Onramper signature endpoint authorization:**
- What's not tested: `src/routes/api/onramper/sign-url/+server.ts` — does it actually reject mismatched wallet, missing CSRF, missing cookie?
- Risk: A regression in CSRF or cookie check would let attackers generate Onramper deposit links for arbitrary wallets, enabling fraud.
- Priority: High.
- Difficulty to test: Easy — RequestEvent mock + 4 test cases.

**Admin auth audit logging coverage:**
- What's not tested: 10 of 18 admin endpoints lack `createAuditLogger` calls (only `admin/codes`, `admin/referral-programme/*`, see grep). No alarm if an admin action goes unlogged.
- Risk: Compliance/forensics gap — admin actions on rewards-pool, snapshots, swap-snapshot, tvl, wallet-statement, wallets, team-wallets, excluded-wallets, pool-wallets, nansen don't appear in audit log.
- Priority: Medium-High depending on compliance posture.
- Difficulty to test: Easy.

**Multi-fill and partial-fill edge cases for market orders:**
- What's not tested: Existing tests in `tests/lib/utils/marketOrderFill.test.ts` cover the helper. Integration coverage for the full path through `marketOrderExecution.ts` + `transaction.ts` (aggregated → fallback → per-order, hydration failures, stale session) is partial.
- Risk: Real money — partial-fill misclassification = either falsely-failed orders or silent over-payment.
- Priority: High.
- Difficulty to test: High — needs SDK + chain mocks. `tests/lib/services/marketOrderExecution.test.ts` and `tests/lib/stores/handleTakeOrders.test.ts` are the entry points.

**Bot scanner regex correctness:**
- What's not tested: `BOT_PATH_PATTERNS` and `isBotOrMalformedPath` (`hooks.server.ts:321-339`).
- Risk: A future legitimate path (e.g. `/_next/data/...` if migrating) would silently 404.
- Priority: Low.
- Difficulty to test: Easy — pure function, just feed strings.

---

*Concerns audit: 2026-04-28*
