# st0x — CLAUDE.md

> **Planning context lives in `.planning/`** — start there for the active milestone.
> - `.planning/PROJECT.md` — current milestone (stabilization), core value, constraints, key decisions
> - `.planning/REQUIREMENTS.md` — v1 requirements with REQ-IDs, traceability to phases
> - `.planning/ROADMAP.md` — phase structure, success criteria, dependencies
> - `.planning/STATE.md` — current position in the roadmap, blockers
> - `.planning/codebase/` — brownfield codebase audit (architecture, stack, conventions, **CONCERNS.md** ← read this before non-trivial changes)
>
> **GSD workflow** is in use. Use `/gsd-progress` to see current status, `/gsd-plan-phase N` to plan a phase, `/gsd-execute-phase N` to execute. The sections below describe the codebase as it exists today; some claims (multi-chain, account abstraction) are aspirational drift and are tracked for cleanup as **DRIFT-03** in REQUIREMENTS.md.

## Ground Truth

This file is a high-level orientation. The authoritative codebase audit lives in
`.planning/codebase/` (ARCHITECTURE.md, STACK.md, CONVENTIONS.md, INTEGRATIONS.md,
STRUCTURE.md, TESTING.md) and the audit-of-record is `.planning/codebase/CONCERNS.md`.
When this file conflicts with `.planning/codebase/`, the latter is correct.

## Project Overview

st0x is a decentralized exchange for trading tokenized securities (stocks, ETFs, commodities). It supports limit orders, market orders, and DCA strategies across multiple EVM chains. Orders are programmed using Rainlang, a domain-specific language for the Rain orderbook protocol.

## Tech Stack

- **Framework:** Svelte 4 + SvelteKit 2 (TypeScript, strict mode)
- **Styling:** Tailwind CSS 3 with PostCSS
- **Build:** Vite 5, deployed to Vercel (`adapter-vercel`)
- **State:** Svelte stores + TanStack Svelte Query 5
- **Web3:** wagmi + viem (core), Dynamic Labs (embedded wallets)
- **Oracles:** Pyth Network price feeds
- **Orderbook:** Rain Protocol (`@rainlanguage/orderbook`, `@rainlanguage/float`)
- **Data:** Goldsky subgraphs (GraphQL), Raindex
- **Icons:** flowbite-svelte-icons
- **Charts:** lightweight-charts
- **Testing:** Vitest + @testing-library/svelte
- **Docs rendering:** mdsvex + remark-math + rehype-katex

## Dev Commands

```
npm run dev          # Dev server
npm run build        # Production build
npm run check        # svelte-check + tsc
npm test             # Vitest
npm run lint         # ESLint + Prettier
npm run codegen      # Wagmi contract codegen
npm run graphql-codegen  # GraphQL types
```

## Project Structure

```
src/
├── lib/
│   ├── api/            # API layer (orders, pyth, subgraph, tradingview)
│   ├── clients/        # HTTP/query clients (subgraph, pyth, raindex, queryClient)
│   ├── components/     # Svelte components (feature-grouped)
│   │   ├── charts/     # Trading charts
│   │   ├── icons/      # Icon components
│   │   ├── orders/     # Order forms (MarketOrder, QuickTrade, etc.)
│   │   ├── referrals/  # Referral program
│   │   ├── rewards/    # Rewards UI
│   │   └── ui/         # Generic reusable UI (tables, inputs, modals)
│   ├── config/         # Networks, tokens, constants
│   ├── queries/        # TanStack Query definitions
│   ├── server/         # Server-side logic (auth, snapshots, access codes)
│   ├── services/       # Business logic
│   │   ├── marketOrderExecution.ts
│   │   ├── orderDeployment.ts
│   │   └── walletService.ts
│   ├── stores/         # Svelte stores (auth, balance, transaction, etc.)
│   ├── types/          # TypeScript types
│   ├── utils/          # Utilities (validation, formatting, tokenMath)
│   └── dynamic/        # Dynamic embedded wallet integration
├── routes/
│   ├── (main)/         # Main UI routes (dashboard, trade, strategies)
│   ├── api/            # SvelteKit API endpoints (~60+)
│   ├── admin/          # Admin dashboard
│   ├── access/         # Access control
│   └── docs/           # Documentation pages
└── hooks.server.ts     # Server hooks (CORS, auth)
```

## Import Conventions

- `$lib/*` aliased to `src/lib/*`
- `$app/*` for SvelteKit runtime modules
- Barrel exports for related types/modules

## State Management

**Svelte stores** for client-side state (auth, balances, transactions, UI):
- `authStore.ts` — wallet address, auth method (`'wallet' | 'dynamic' | 'none'`), network validation
- `dynamicStore.ts` — Dynamic embedded wallet sessions
- `balanceStore.ts` — Token balances
- `transaction.ts` — Transaction tracking
- `aaPaymentStore.ts` — Account abstraction payment token

**TanStack Query** for server/async state with caching:
- Default `staleTime: Infinity` (manual invalidation)
- Key query files: `orderbook.ts`, `oracleQuotes.ts`, `priceFeeds.ts`, `balances.ts`, `vaults.ts`, `tradeActivity.ts`
- Network-dependent queries; polling for real-time data

**Data flow:** Component → Service/API → Wallet/Contract → Subgraph/RPC → Query Cache → Store → Component

## Wallet & Auth Architecture

Two auth paths unified through `walletService.ts`:
1. **Direct wallet** — MetaMask, WalletConnect, etc. via wagmi
2. **Dynamic embedded wallet** — Non-crypto-native users via Dynamic Labs SDK

Key auth store properties:
- `walletAddress` — unified across both auth methods
- `authMethod` — `'wallet' | 'dynamic' | 'none'`
- `isReady` — authenticated + correct network
- `wrongNetwork` — network mismatch flag

## Single Chain

Single chain: Base (8453). Multi-chain expansion (Arbitrum / Optimism / Ethereum) is deferred to a future milestone — see `.planning/codebase/CONCERNS.md` (Documentation Drift) and the Out of Scope section in `.planning/REQUIREMENTS.md`. Network configuration lives in `src/lib/config/networks.ts`.

## Account Abstraction

No account abstraction. The `account-abstraction/` directory and Rhinestone SDK integration referenced in earlier drafts of this file do not exist in code. Account abstraction is deferred to a future milestone — see `.planning/REQUIREMENTS.md` Out of Scope and `.planning/codebase/CONCERNS.md`.

## Tokens

- **Asset tokens:** Tokenized securities — tNVDA, tAMZN, tTSLA, tMSTR, tIAU, tCOIN, tSPLG, tSIVR, tCRCL, tBMNR, tPPLT
- **Payment tokens:** USDC, USDT, WETH (settlement currencies)
- Token config in `src/lib/config/tokens.ts` (addresses, decimals, Pyth feed IDs per network)

---

## Order Semantics — INPUT/OUTPUT Perspective (Critical)

This is the most common source of bugs. INPUT and OUTPUT mean different things depending on whether you are deploying an order (maker) or executing a market order (taker).

### Deployed/Limit Orders (Maker Perspective)

INPUT/OUTPUT is from the **order's own perspective** (on-chain):
- **Output** = what the order **gives away** (the deposit vault)
- **Input** = what the order **receives**

| Action | orderOutput (gives) | orderInput (receives) | Side |
|---|---|---|---|
| Buy asset | Payment (USDC) | Asset | `bid` |
| Sell asset | Asset | Payment (USDC) | `ask` |

If you deploy an order with `outputVault = USDC`, the order gives away USDC when someone takes it. In everyday language, you deployed a **buy** order.

Code reference — `deriveMakerSide()` in `src/lib/types/orderPerspective.ts`:
```typescript
// If payment token is OUTPUT → BID (buying asset, giving USDC)
// If payment token is INPUT → ASK (selling asset, getting USDC)
```

Order deployment deposits into the output token (`src/lib/services/orderDeployment.ts`):
```typescript
gui.setDeposit('output', formatUnits(args.depositAmount, args.outputToken.decimals));
```

### Market Orders (Taker Perspective)

INPUT/OUTPUT is from the **user's perspective**:
- **takerPays** = what the user gives away
- **takerWants** = what the user receives

| Action | takerPays (gives) | takerWants (receives) | Crosses |
|---|---|---|---|
| Buy | Payment (USDC) | Asset | `ask` orders (sellers) |
| Sell | Asset | Payment (USDC) | `bid` orders (buyers) |

Code reference — `getUserTakerInfo()` in `src/lib/types/orderPerspective.ts`:
```typescript
if (userAction === 'Buy') {
    return { takerWants: assetToken, takerPays: paymentToken, crossingSide: 'ask' };
} else {
    return { takerWants: paymentToken, takerPays: assetToken, crossingSide: 'bid' };
}
```

### How Maker and Taker Connect

A taker's buy matches a maker's ask (sell order). The matching logic in `filterQuotesForSide()` (`src/lib/services/marketOrderExecution.ts`):

| Taker Action | Counterparty Side | Counterparty orderInput | Counterparty orderOutput |
|---|---|---|---|
| Buy | `ask` | Payment (USDC) | Asset |
| Sell | `bid` | Asset | Payment (USDC) |

The taker gives what the counterparty order receives (input), and the taker receives what the counterparty order gives (output).

### Type Interfaces

```typescript
// Maker: on-chain order perspective
interface MakerOrderTokens {
    orderInputToken: MinimalToken;  // Order receives
    orderOutputToken: MinimalToken; // Order gives away
}

// Taker: user perspective
interface TakerOrderTokens {
    takerWants: MinimalToken; // User receives
    takerPays: MinimalToken;  // User gives away
}
```

---

## Rainlang

Orders are expressed in Rainlang, a DSL for the Rain orderbook protocol. Limit orders and DCA strategies are deployed as Rainlang expressions. Order deployment goes through `src/lib/services/orderDeployment.ts` which uses the Rain GUI SDK to configure tokens, deposits, and Rainlang source.

## Data Sources

- **Goldsky Subgraphs** — Orderbook events, SFT vaults, metadata (GraphQL, codegen'd types)
- **Pyth Network** — Real-time price feeds for asset pricing
- **Raindex** — Order data with RPC fallback system
- **Onramper** — Fiat on-ramp integration
- **Nansen API** — Whale wallet tracking

## API Routes (`src/routes/api/`)

SvelteKit server endpoints organized by domain:
- `/access/*` — Access code validation
- `/admin/*` — Admin operations
- `/auth/*` — Session management
- `/referrals/*` — Referral program
- `/rewards/*` — Rewards and leaderboard
- `/snapshots/*` — Data snapshots (tax, airdrops)
- `/public/*` — Public APIs (unauthenticated, rate-limited)
- `/cron/*` — Scheduled tasks

CORS configured in `hooks.server.ts` — production domains + Vercel previews; public endpoints allow any origin.

## Testing

- Vitest with jsdom environment
- `@testing-library/svelte` for component tests
- Tests in `/tests` directory mirroring `src/lib` structure
- Key test areas: quote processing, formatting, market price calculations, order perspective semantics, auth logic, deployment validation

## Key Conventions

- **Naming:** stores = camelCase, types = PascalCase, constants = SCREAMING_SNAKE_CASE
- **Components:** Feature-grouped under `src/lib/components/`, reusable UI in `components/ui/`
- **Error handling:** Custom error types in `src/lib/types/errors.ts`, RPC fallback with retry, gas estimation with 2x buffer
- **Market hours:** Trading restricted to NYSE hours for tokenized securities
- **Avoid over-engineering:** Don't add features or abstractions beyond what's requested
