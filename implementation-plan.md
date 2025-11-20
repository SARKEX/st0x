# Implementation Plan

This plan focuses on simplifying interdependencies and data/logic flows while keeping pricing sources separate.

## 1) Configuration & Data Models
- Split config into `src/lib/config/networks.ts` (chain metadata, RPCs, subgraph endpoints) and `src/lib/config/tokens.ts` (payment tokens, assets, pricing feed ids). Keep UI-only fields (logos, TradingView symbols) separate from protocol-critical fields (addresses, decimals).
- Add narrow selector helpers (e.g., `getNetwork(id)`, `getTokensForNetwork(id)`) so downstream modules do not import whole configs directly.
- Introduce types for token categories and feed metadata to reduce incidental coupling.

## 2) Data Access Layer
- Create `src/lib/clients/` with shared fetch utility (retry/backoff, error mapping) and dedicated clients:
  - `subgraphClient` using generated operations (GraphQL codegen) for SFTs, trades, metadata.
  - `raindexClient` wrapper around `RaindexClient.new` with caching of strategies YAML.
  - `pythClient` for Hermes calls and feed normalization.
  - `tradingViewClient` wrapping existing scan/quote helpers.
- Update call sites to use clients instead of ad-hoc fetches and string interpolation.

## 3) Domain Fetchers with Tanstack Query
- Replace custom polling controllers with Tanstack Query:
  - Define query keys per network/domain: `['vaults', networkId]`, `['orderbook', networkId]`, `['pyth', networkId]`, `['trades', window, networkId]`, etc.
  - Configure `refetchInterval` for polling; use `enabled` for browser-only constraints.
  - Expose derived Svelte stores from Query results if needed for component consumption.
- Remove `createPollingController`, `cache.ts`, and manual `ensureResource` flows once migrated.

## 4) Domain Normalization Layer
- Introduce service modules under `src/lib/services/`:
  - `vaultService`: normalize SFT snapshots, holders, supply metrics.
  - `orderbookService`: wrap `fetchAndQuotePaymentTokenOrders`, return normalized quotes and summaries by address.
  - `tradeService`: aggregate trades by window, dedupe across subgraph URLs, map to UI-friendly DTOs.
  - `oracleService`: normalize Pyth snapshots and expose feed lookups.
- Keep UI components consuming these normalized DTOs rather than raw API shapes.

## 5) View-Model Extraction for Pages
- Move trade page logic (depth building, trade bucketing, history ranges, asset/quote lookup) into pure helpers, e.g., `src/lib/services/tradeViewModel.ts`.
- Move asset list table shaping (mid-price calc, holders/supply formatting) into `src/lib/services/assetListView.ts`.
- Add unit tests around these view-model functions to lock behavior and simplify Svelte files.

## 6) Transaction & Deployment Decoupling
- Split `transactionStore` into:
  - `txStatusStore` (UI state only).
  - `approvalService` (balance/allowance checks).
  - `deploymentService` (strategy fetching/caching, calldata construction).
- Keep strategy file fetching cached and isolated; consider server-side proxy or pre-fetch cache keyed by commit to avoid repeated client fetches.
- Make order components depend on the smaller services, not the monolithic store.

## 7) Incremental Migration Strategy (current status)
- Progress: Config split done; client layer added (http/subgraph/raindex/pyth); orderbook + price feeds + trade activity + oracle quotes now on Tanstack Query. Vault snapshots now on Query as well; pending trades are polled directly inside transaction flow. Polling helper/domains removed.
- Next cleanup: validate subgraph polling resilience for pending trades or move that to Query if needed; apply tighter typing around Query-derived stores as time permits.
- After each domain migration, remove unused polling/controller code and update imports.
- Add vitest coverage for services and view-models as they are introduced to prevent regressions.
