# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

### Development
```bash
npm run dev        # Start Vite development server
npm run preview    # Preview production build locally
npm run build      # Build for production
```

### Code Quality
```bash
npm run check              # Run svelte-check with TypeScript validation
npm run lint               # Lint and auto-fix code with ESLint
npm run format             # Format code with Prettier
npm run lint-check         # Check linting without auto-fix
npm run format-check       # Check formatting without changes
npm run svelte-lint-format-check  # Run all checks (svelte-check, lint, format)
```

### Testing
```bash
npm run test       # Run tests with Vitest
```

### Code Generation
```bash
npm run codegen          # Generate Wagmi TypeScript definitions
npm run graphql-codegen  # Generate GraphQL types
```

## Architecture Overview

### Tech Stack
- **Framework**: SvelteKit with TypeScript
- **Styling**: Tailwind CSS with Flowbite components
- **Blockchain**: Wagmi/Viem for Web3 interactions
- **State Management**: Svelte stores
- **Testing**: Vitest with Testing Library
- **Charts**: Lightweight Charts for financial data visualization

### Project Structure

The application is a decentralized exchange (DEX) interface for tokenized real-world assets (RWAs), specifically stocks and ETFs on Arbitrum and Base networks.

### Key Architectural Components

1. **Multi-Network Support**: The app supports Arbitrum and Base networks with network-specific configurations in `src/lib/network.ts`. Each network has its own subgraph endpoints for querying blockchain data.

2. **Token System**: 
   - Tokenized stocks (ST0x tokens) representing shares of companies like Apple, Microsoft, etc.
   - Each token has an associated Pyth price feed ID for real-time price data
   - Tokens are categorized (ST0x, ETFs, CRYPTO) and filtered by network

3. **Vault System**: Uses OffchainAssetReceiptVaults for managing tokenized assets with deposits, withdrawals, and certification tracking.

4. **GraphQL Integration**: Three separate subgraphs per network:
   - Main subgraph for vault data
   - Metadata subgraph for additional information
   - Orderbook subgraph for trading data

5. **IPFS Integration**: Pinata is used for decentralized storage of metadata and documents, with server endpoints in `src/routes/pinata/`.

6. **Trading Features**:
   - Order types: Limit orders, DCA strategies, Portfolio strategies
   - Integration with Rain Protocol orderbook
   - Transaction management with custom store (`src/lib/transactionStore.ts`)

7. **State Management**: Global stores in `src/lib/stores.ts` manage:
   - Current network selection
   - Token metadata and prices
   - Trade history
   - UI state (modals, selections)

8. **Routing Structure**:
   - Main app routes under `src/routes/(main)/`
   - Documentation system with MDX support in `src/routes/docs/`
   - Server-side endpoints for Pinata operations

9. **Client-Side Only**: The app is configured with `ssr: false` and `prerender: true`, making it a fully client-side application deployed as static files.