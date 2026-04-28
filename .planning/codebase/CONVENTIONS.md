# Coding Conventions

**Analysis Date:** 2026-04-28

## TypeScript Configuration

- **Strict mode:** Enabled (`tsconfig.json` `"strict": true`).
- **Allow JS + check JS:** Both `allowJs` and `checkJs` are on — JS files are type-checked too.
- **Module resolution:** Inherited from `.svelte-kit/tsconfig.json` (SvelteKit-managed).
- **Test types globally available:** `vitest/globals`, `@testing-library/jest-dom`, `vitest/importMeta` are in `compilerOptions.types`, so `describe`/`it`/`expect`/`vi` resolve without per-file imports (though source files still import them explicitly for clarity).
- **JSX:** `react-jsx` (used for the Dynamic Labs React bridge in `src/lib/dynamic/`).
- **Source maps:** Enabled.
- **Casing:** `forceConsistentCasingInFileNames: true`.

Reference: `tsconfig.json`.

## Path Aliases

- `$lib/*` → `src/lib/*` (SvelteKit-managed).
- `$app/*` → SvelteKit runtime modules (`$app/stores`, `$app/environment`, etc.).
- `$env/dynamic/private` and `$env/static/*` for env vars.
- Relative imports (`./`, `../`) only used inside `tests/` and within tightly coupled modules; production code under `src/lib/` should always use `$lib/...`.

## Naming Patterns

**Files:**
- Stores: camelCase + `Store` suffix → `authStore.ts`, `dynamicStore.ts`, `transaction.ts`, `accessStore.ts`.
- Services: camelCase, often with descriptive verb-noun → `walletService.ts`, `marketOrderExecution.ts`, `orderDeployment.ts`.
- Utils: camelCase, single concept per file → `format.ts`, `tokenMath.ts`, `retry.ts`, `marketHours.ts`, `validation.ts`.
- Types: camelCase singular → `errors.ts`, `transactions.ts`, `orderPerspective.ts`. Capitalised filenames are reserved for re-exported third-party types or class-style modules (`OffchainAssetReceiptVault.ts`, `SchemaQueryResponse.ts`).
- Components: PascalCase `.svelte` → `MarketOrder.svelte`, `Header.svelte`, `Button.svelte`, `TransactionModal.svelte`.
- Tests: mirror source file with `.test.ts` suffix → `format.test.ts`, `marketOrderExecution.test.ts`.

**Identifiers:**
- Functions/variables: camelCase (`validateSelectedAmount`, `truncateAddress`, `selectedAmount`).
- Types/interfaces/enums: PascalCase (`MakerOrderTokens`, `TransactionErrorMessage`, `AuthMethod`, `WalkQuotesOptions`).
- Constants: SCREAMING_SNAKE_CASE for true constants and tunable thresholds (`PRICE_SCALE`, `RAIN_STRATEGIES_COMMIT`, `DEFAULT_MARKET_ORDER_SLIPPAGE_BPS`, `MAX_SLIPPAGE_BPS`, `APPROVAL_TX_CONFIRMATIONS`, `TAKE_TX_CONFIRMATIONS`, `AGGREGATED_TAKE_CACHE_TTL_MS`).
- Boolean stores/flags: `is*` / `has*` / `should*` (`isAuthenticated`, `isReady`, `wrongNetwork`, `walletRegistered`).
- Svelte stores prefer descriptive nouns matching the store name (`authMethod`, `walletAddress`, `currentNetwork`, `sftMetadata`).

**Numeric literals:**
- Underscore separators for readable magnitudes: `1_000_000`, `15_000`, `10_000`, `20_000`, `1_000_000_000_000_000_000n`.
- BigInt suffix `n` is required for chain-domain math (`2n * ONE`, `100_000_000_000_000_000n`).

## Code Style

**Formatter:** Prettier 3.1.1 — config in `.prettierrc`:
```json
{
  "useTabs": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"]
}
```
- Tabs (not spaces) for indentation.
- Single quotes for JS/TS strings.
- No trailing commas.
- 100-char line limit.
- `prettier-plugin-tailwindcss` auto-sorts Tailwind class lists.
- Svelte files use the `svelte` parser override.
- Ignore list: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `src/generated-graphql.ts` (`.prettierignore`).

**Linter:** ESLint 9 flat config — `eslint.config.js`:
- `js.configs.recommended` + `typescript-eslint` recommended + `eslint-plugin-svelte` flat/recommended + `eslint-config-prettier` (disables stylistic rules that fight Prettier) + `svelte/flat/prettier`.
- Browser + Node globals.
- Svelte files use `typescript-eslint` parser via `parserOptions.parser`.
- Ignored: `build/`, `.svelte-kit/`, `dist/`, `src/generated-graphql.ts`.
- Legacy `.eslintrc.cjs` still present and adds `no-trailing-spaces` and a CI-only `no-console: error` rule (the flat config supersedes it for `npm run lint`).

**Lint commands** (`package.json`):
- `npm run check` — `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json` (full type-check).
- `npm run check:watch` — same in watch mode.
- `npm run lint` — `eslint --fix src` (auto-fix on).
- `npm run lint-check` — `eslint src` (no fix; CI-friendly).
- `npm run format` — `prettier --write src`.
- `npm run format-check` — `prettier --list-different src`.
- `npm run svelte-lint-format-check` — composite gate (`check` + `lint-check` + `format-check`).

**Pre-commit hooks:** None. There is no `.husky/`, no `lint-staged` config, and no `prepare` script in `package.json`. Quality is enforced via the manual scripts above and (presumably) CI.

## Import Organisation

Conventional order observed across `src/lib/services/walletService.ts`, `src/lib/stores/transaction.ts`, `src/lib/components/orders/MarketOrder.svelte`:

1. Svelte / SvelteKit runtime (`svelte`, `svelte/store`, `$app/environment`, `$app/stores`).
2. Third-party packages (`@wagmi/core`, `viem`, `@rainlanguage/orderbook`, `@rainlanguage/float`, `@tanstack/svelte-query`, `ethers`, `svelte-wagmi`, `@dynamic-labs/*`).
3. `$lib/types/...` (interfaces, enums).
4. `$lib/config/...` (networks, tokens, constants).
5. `$lib/clients/...` and `$lib/api/...`.
6. `$lib/services/...`.
7. `$lib/stores/...`.
8. `$lib/utils/...`.
9. Local relative imports (`./`, `../`).

**Rules in practice:**
- `import type { ... }` is used to keep type-only imports out of the runtime bundle (e.g. `import type { Hash, Hex } from 'viem'`, `import type { Network } from '$lib/config/network'`).
- Side-effect imports kept at top (e.g. `import '@testing-library/jest-dom/vitest';` in `vitest-setup.ts`).
- Wagmi/viem are commonly aliased on import to make wrapped versions clearer: `readContract as wagmiReadContract`, `sendTransaction as wagmiSendTransaction` in `src/lib/services/walletService.ts` and `src/lib/stores/transaction.ts`.
- Inside Svelte components, runtime imports go in `<script lang="ts">`; component-specific style imports last.

## Svelte Conventions (Svelte 4)

- All components use `<script lang="ts">`.
- Props declared with `export let` (`MarketOrder.svelte`: `export let orderSide: 'Buy' | 'Sell' = 'Buy'`, `export let assetToken: CategorizedToken | undefined`).
- Reactive statements (`$:`) used for derived UI state and side-effecting integrations (e.g. tracking-state updates in `MarketOrder.svelte`).
- Store subscriptions use the `$store` prefix (`$currentNetwork`, `$orderbookQuotesQuery`, `$authMethod`).
- Lifecycle: `onMount` / `onDestroy` from `svelte` for setup and cleanup of intervals/listeners.
- Event dispatch: `createEventDispatcher<{ click: MouseEvent }>()` with strongly-typed event maps (see `src/lib/components/ui/Button.svelte`).
- Styling is Tailwind-only — no `<style>` blocks in feature components. Reusable class collections live in `src/lib/styles/utils.ts` (e.g. `containerStyles`).
- **JSDoc inside `<script lang="ts">` does not work** — use typed constants or `as` casts (per project memory).

## Tailwind & PostCSS

- `tailwind.config.ts` — content scans `./src/**/*.{html,js,svelte,ts}`; theme extends with `primary: '#4c77ba'` and aliases `gray` to Tailwind's `neutral` palette; `@tailwindcss/typography` plugin enabled.
- `postcss.config.js` — Tailwind + Autoprefixer.
- `prettier-plugin-tailwindcss` keeps class order canonical; do not hand-sort classes.

## State Management

**Two layers:**
- **Svelte stores** — client-only, synchronous state (auth, transaction lifecycle, UI modals). Use `writable`, `derived`, `readable` from `svelte/store`. Define stores at module scope; expose `get()` calls only inside services, not components.
- **TanStack Svelte Query** — async/server state with cache. Use `createQuery` factories that take `(network: Network | null)` and key on `['domain', network?.id, ...filters]`.

**Defaults** (`src/lib/clients/queryClient.ts`):
```typescript
defaultOptions: { queries: { staleTime: Infinity } }
```
- Cache lives forever until explicitly invalidated; per-query `refetchInterval` enables polling (e.g. `oracleQuotes` polls every 15 s).
- Invalidation lives next to the queries: `invalidateOrderQueries`, `invalidateUserVaultQueries`, `invalidateDashboardBalances` (`src/lib/queries/*.ts`).
- Query keys are arrays starting with the resource name then network ID then any filters: `['orderbookQuotes', network?.id]`, `['oracleQuotes', network?.id]`, `['costBasis', network?.id, userAddress]`.

**Splitting rule:** if it can be derived from a fetch + can be invalidated → TanStack Query. If it's session/UI/local-derived → Svelte store. Authentication is a Svelte store because both wallet + Dynamic stream into it (`$lib/stores/authStore.ts`).

## Module Design

- One concept per file; barrel `index.ts` only at directory boundaries (`src/lib/stores/index.ts`, `src/lib/types/index.ts`).
- Re-exports for backward compat are commented (`src/lib/stores/index.ts`: `export { wrongNetwork } from './authStore';` with a "to maintain backward compatibility" note).
- Heavy/WASM modules are loaded lazily with `await import(...)` (see `getDotrainRegistry()` in `src/lib/services/orderDeployment.ts`).
- Service modules export pure functions and small helpers; they read from stores via `get()` rather than taking dozens of arguments (see `walletService.ts`, `orderDeployment.ts`).

## Function Design

- Prefer small named helpers over nested closures (`humanPriceCapStr`, `computeEmergencyRatioHex`, `classifyError` in `src/lib/services/marketOrderExecution.ts` and `src/lib/stores/transaction.ts`).
- Validators return `string | undefined` — `undefined` means valid, string is the user-facing error message. See the factory pattern in `src/lib/utils/validation.ts`:
```typescript
const createValidator = (fieldName: string, mustBePositive = false): ValidateFunction => { ... };
export const validateSelectedAmount = createValidator('Amount', true);
```
- Async functions wrapping wagmi/viem calls are wrapped with `withRetry(...)` (see RPC Fallback below).
- Boolean-returning utilities use predicate names: `isOutsideMarketHours`, `isPaymentToken`, `isStaleWalletSessionError`, `addressesEqual`.

## Error Handling

**Custom error type:** `src/lib/types/errors.ts` defines `TransactionErrorMessage` enum:
```typescript
export enum TransactionErrorMessage {
    USER_REJECTED_APPROVAL = 'The approval transaction was rejected by the user.',
    APPROVAL_FAILED = '...',
    TIMEOUT = '...',
    BALANCE_REFRESH_FAILED = '...',
    GENERIC = 'Something went wrong. See the telegram group for support.'
}
```
Always cast user-facing errors to `TransactionErrorMessage` so the modal/UI surfaces a clean string (`src/lib/stores/transaction.ts:135-138`):
```typescript
function extractTransactionError(
    err: { cause?: { details?: string }; message?: string },
    fallback: TransactionErrorMessage = TransactionErrorMessage.GENERIC
): TransactionErrorMessage {
    return (err?.cause?.details || err?.message || fallback) as TransactionErrorMessage;
}
```

**Analytics-safe classification** (`src/lib/stores/transaction.ts:87-101`):
- `classifyError(error)` maps raw messages to safe categories (`user_rejected`, `insufficient_funds`, `insufficient_allowance`, `nonce_error`, `timeout`, `network_error`, `rpc_error`, `gas_error`, `transaction_reverted`, `unknown`) so PostHog never receives addresses or keys.
- Always classify before logging to analytics; never send raw `error.message` to telemetry.

**Try/catch usage:**
- Wrap external SDK / RPC calls; rethrow with normalized message:
```typescript
try { /* ... */ } catch (error) {
    console.error('[walletService] Dynamic transaction error:', error);
    const errorMessage = (error as Error)?.message || 'Transaction failed';
    throw new Error(errorMessage);
}
```
- Surface "stale wallet session" errors via `isStaleWalletSessionError` / `handleStaleWalletSession` (`$lib/utils/walletUtils`) before the generic path.

**Console policy:**
- `console.log`/`console.warn`/`console.error` are allowed during development; the legacy `.eslintrc.cjs` flips `no-console` to `error` when `NODE_ENV=production` or `CI=true`. Treat any production console call as a lint failure.
- Prefix logs with the module tag in brackets: `console.error('[walletService] ...')`, `console.log('[dynamic] Sending transaction to:', ...)`.

## RPC Fallback & Retry

`src/lib/utils/retry.ts` defines `withRetry<T>(fn, maxRetries = 3, delayMs = 1000)`:
- Retries on `'header not found'`, `'block not found'`, or RPC error code `-32000`.
- Exponential backoff: `delayMs * 2^attempt`.
- Used to wrap wagmi `readContract`, `sendTransaction`, `waitForTransactionReceipt` and direct Dynamic provider `eth_sendTransaction` requests (`src/lib/services/walletService.ts`, `src/lib/stores/transaction.ts:33-34`).
- Multi-RPC fallback is configured at the wagmi `transport` level using `fallback([http(...), http(...)])` (see `tests/mocks/mockWagmiConfig.ts`); each network in `src/lib/config/networks.ts` has primary + fallback RPC URLs.

**Rule:** any new wagmi/viem call that hits a load-balanced RPC should be wrapped with `withRetry`.

## Confirmations & Transaction Hygiene

- After ERC20 approvals, wait `APPROVAL_TX_CONFIRMATIONS = 2` blocks before the next call so all RPCs see the updated allowance (`src/lib/services/walletService.ts:122`).
- Default take-leg confirmations: `TAKE_TX_CONFIRMATIONS = 1` (`src/lib/stores/transaction.ts:24`).
- Aggregated calldata is cached for `AGGREGATED_TAKE_CACHE_TTL_MS = 10_000` ms.

## Gas Estimation

The codebase **delegates gas estimation to the wallet** — there is no global "2x buffer" applied in app code. Specifics:
- `walletService.sendTransaction(...)` builds the param object without a `gas` field and lets wagmi or the Dynamic embedded provider estimate (`src/lib/services/walletService.ts:38-119`, comment: *"Gas estimation is delegated to the wallet itself."*).
- The Dynamic React bridge passes through `tx.gas` only if the upstream caller already provided it (`src/lib/dynamic/DynamicReactProvider.tsx:243-258`).
- `eth_estimateGas` is included in the read-method passthrough list so the provider answers it, but the app does not multiply or buffer the result.

If a future feature needs explicit gas overrides, add the buffer logic in `walletService.sendTransaction` so both auth paths benefit.

## Market Hours Restriction

Tokenised securities can only trade during NYSE hours.
- Client-side: `isOutsideMarketHours()` in `src/lib/utils/marketHours.ts` — checks 9:30–16:00 ET, Mon–Fri (no holidays).
- Server-side: `src/routes/api/.../marketHours` (and `nyse-holidays` package, see `package.json`) for holiday-aware checks.
- UI must call the client-side helper to disable order forms when markets are closed (`MarketOrder.svelte` imports `isOutsideMarketHours`).
- New trading paths involving stocks/ETFs must respect market hours; crypto-only flows are exempt.

## Wallet Auth Pattern

Two parallel auth methods unified by `walletService.ts` and `authStore.ts`:
- `authMethod` derived store returns `'wallet' | 'dynamic' | 'none'`.
- `walletAddress` is the unified string regardless of provider.
- Always go through `walletService.{sendTransaction,waitForTransaction,signMessage,getSignerAddress}` instead of calling wagmi or Dynamic directly. This keeps Dynamic embedded users working.
- Dynamic auth takes precedence when both are connected (`authStore.authMethod`).

## Multi-Chain

- Networks defined in `src/lib/config/networks.ts` with primary + fallback RPC URLs, subgraph endpoints, supported tokens.
- Lookup helpers: `getNetworkById`, `getNetworkByChainId`, `getNetworkByName`, `getDefaultPaymentTokenForNetwork`, `getTokensByNetwork` (`src/lib/config/network.ts`).
- Tokens have multiple address variants (wrapped / unwrapped / legacy) — always use `getTokenByAnyAddress()` for lookups (per project memory).

## Comments

- File-top JSDoc block describing the module's purpose: see `src/lib/services/marketOrderExecution.ts`, `src/lib/services/orderDeployment.ts`, `src/lib/utils/format.ts`.
- Function-level JSDoc when behaviour or parameter semantics are non-obvious (`computeRatioMultiplier`, `withRetry`, `humanPriceCapStr`).
- Inline comments for tricky on-chain semantics, especially around order INPUT/OUTPUT perspective:
```typescript
// BID order: orderInput=asset, orderOutput=USDC
// ASK order: orderInput=USDC, orderOutput=asset
```
- "Why" beats "what" — see the multi-line comment block in `marketOrderExecution.ts:300-308` explaining anchoring choices for partial-fill detection.

## Codegen Workflow

- **`npm run codegen`** — `wagmi generate` using `wagmi.config.ts`. Currently emits `src/generated.ts` containing only the `erc20` ABI bound to wagmi `actions`. Re-run when the ABI list in `wagmi.config.ts` changes.
- **`npm run graphql-codegen`** — runs `graphql-codegen` (CLI from `@graphql-codegen/cli`). The repo references `src/generated-graphql.ts` as a generated artifact (eslint + prettier ignore lists), but no `codegen.yml`/`codegen.ts` exists at the repo root and `src/generated-graphql.ts` is not currently checked in. Treat the GraphQL pipeline as **not active in source** — landing it requires adding a codegen config alongside the script; until then the GraphQL types under `src/lib/api/subgraph.ts` are hand-maintained.
- **No husky / lint-staged** — codegen and lint must be invoked manually or in CI.

## Server-Side Conventions

- `src/lib/server/` is server-only: KV/Redis access (`kv.ts`), rate limiting (`rateLimit.ts`), CSRF (`csrf.ts`), admin auth (`adminAuth.ts`), access codes (`accessCodes.ts`).
- Rate limiters fail **closed** when Redis is unavailable in production (see `accessCodes.test.ts` and `rateLimit.test.ts`).
- Env vars accessed via `$env/dynamic/private` (e.g. `HCAPTCHA_SECRET`, `REDIS_URL`).
- Server tests live alongside the server module (`*.test.ts` next to `*.ts` in `src/lib/server/`), unlike client tests which mirror under `tests/`.

---

*Convention analysis: 2026-04-28*
