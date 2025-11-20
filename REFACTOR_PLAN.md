# ST0x Refactoring Plan

## Overview
This document outlines the step-by-step plan to simplify and modularize the ST0x codebase based on the comprehensive architecture review.

## Phase 1: Semantic Unification (HIGH PRIORITY)

### Goal
Eliminate confusion between Buy/Sell, Bid/Ask, and Input/Output by establishing clear, consistent terminology throughout the codebase.

### Steps

#### 1.1 Create Unified Type System
**File**: `src/lib/types/orders.ts` (NEW)

```typescript
// Unified order semantics
export type OrderSide = 'bid' | 'ask'  // Market perspective (internal)
export type UserAction = 'Buy' | 'Sell'  // UI perspective (boundary only)

export interface OrderTokens {
  assetToken: Token    // The non-settlement token being traded
  quoteToken: Token    // The settlement token (e.g., USDC)
}

export function userActionToOrderSide(action: UserAction): OrderSide {
  // Buy = user acquiring asset = need ask quotes (sellers)
  // Sell = user disposing asset = need bid quotes (buyers)
  return action === 'Buy' ? 'ask' : 'bid'
}

export function getTokenRoles(
  action: UserAction,
  tokens: OrderTokens
): { inputToken: Token; outputToken: Token } {
  if (action === 'Buy') {
    return {
      inputToken: tokens.assetToken,   // What user receives
      outputToken: tokens.quoteToken   // What user gives
    }
  } else {
    return {
      inputToken: tokens.quoteToken,   // What user receives
      outputToken: tokens.assetToken   // What user gives
    }
  }
}
```

#### 1.2 Fix `classifyFlow` in `tokenMath.ts`

**Current (INCORRECT)**:
```typescript
if (input === quote && output === asset) return 'bid'
if (input === asset && output === quote) return 'ask'
```

**Corrected**:
```typescript
export function classifyFlow(
  inputAddress: string,
  outputAddress: string,
  pair: { asset: string; quote: string }
): OrderSide | null {
  const inputNorm = normalizeAddress(inputAddress)
  const outputNorm = normalizeAddress(outputAddress)
  const assetNorm = normalizeAddress(pair.asset)
  const quoteNorm = normalizeAddress(pair.quote)

  if (!inputNorm || !outputNorm || !assetNorm || !quoteNorm) return null

  // BID: bidding for asset (input=asset, output=quote)
  if (inputNorm === assetNorm && outputNorm === quoteNorm) return 'bid'

  // ASK: asking for quote (input=quote, output=asset)
  if (inputNorm === quoteNorm && outputNorm === assetNorm) return 'ask'

  return null
}
```

**Tests to add**: `tests/lib/tokenMath.test.ts`
- Test BID classification (input=asset, output=quote)
- Test ASK classification (input=quote, output=asset)
- Test invalid pairs

#### 1.3 Rename Component Props

**Files to update**:
- `src/lib/components/orders/MarketOrder.svelte`
- `src/lib/components/orders/LimitOrder.svelte`

**Changes**:
```typescript
// Before:
export let passedOutputToken: CategorizedToken

// After:
export let assetToken: CategorizedToken
export let orderSide: UserAction  // 'Buy' | 'Sell'

// Internal conversion:
$: orderTokens = { assetToken, quoteToken: paymentToken }
$: { inputToken, outputToken } = getTokenRoles(orderSide, orderTokens)
```

#### 1.4 Update ProcessedQuote Type

**File**: `src/lib/types/index.ts`

```typescript
export interface ProcessedQuote {
  // ... existing fields

  // Make these REQUIRED (not optional):
  assetAddress: string
  side: OrderSide  // 'bid' | 'ask'
  quotePerAsset: number

  // Remove confusing optional fields or make them explicit
}
```

#### 1.5 Update Tests

**Files**:
- `tests/lib/tokenMath.test.ts` - Update all classifyFlow tests
- `tests/lib/getDeploymentArgs.test.ts` - Update parameter expectations
- `tests/lib/transactionStore.test.ts` - Update mock setups

---

## Phase 2: Decouple Transaction Logic (MEDIUM PRIORITY)

### Goal
Create explicit interfaces between UI components and transactionStore to reduce coupling.

### Steps

#### 2.1 Create Transaction Parameter Schemas

**File**: `src/lib/types/transactions.ts` (NEW)

```typescript
export interface TakeOrdersParams {
  // Order identification
  orderData: OrderV4
  ioIndexes: { input: number; output: number }

  // User request
  requestedQuantity: bigint
  requestedQuantityDecimals: number

  // Token metadata (for result display)
  inputToken: {
    address: string
    decimals: number
    symbol: string
  }
  outputToken: {
    address: string
    decimals: number
    symbol: string
  }

  // Optional: pre-calculated simulation
  simulation?: {
    inputAmountFilled: bigint
    outputAmountGiven: bigint
    ioRatio: number
    fills: QuoteFill[]
  }
}

export interface DeployOrderParams {
  orderType: 'dca' | 'limit' | 'dsf' | 'folio'
  composedRainlang: string
  deploymentArgs: unknown  // From Rain SDK
  tokens: {
    input: Token
    output: Token
  }
}
```

#### 2.2 Refactor transactionStore Methods

**File**: `src/lib/stores/transaction.ts`

```typescript
// Before (scattered params):
async function handleTakeOrders(
  args,
  raindexOrder,
  requiredApprovalAmount,
  options?: {
    ioIndexes?: ...
    walkResult?: ...
    inputToken?: ...
    // ... many optional fields
  }
)

// After (explicit schema):
async function handleTakeOrders(
  params: TakeOrdersParams,
  raindexOrder: RaindexOrder,
  requiredApprovalAmount: bigint
)
```

**Benefits**:
- Type-safe parameter passing
- Clear contract between component and store
- Easier to test
- Self-documenting

#### 2.3 Extract Service Functions

**File**: `src/lib/services/orderCompletion.ts` (NEW)

```typescript
/**
 * Waits for an order deployment to appear in the subgraph
 */
export async function waitForOrderDeployment(
  network: Network,
  orderbookAddress: Hex,
  txHash: Hex,
  maxWaitMs: number = 300_000
): Promise<{ orderHash: string; orderbookId: string } | null> {
  // Move polling logic from transactionStore here
}

/**
 * Waits for a trade to appear in pending trades
 */
export async function waitForTradeCompletion(
  network: Network,
  txHash: Hex,
  maxWaitMs: number = 300_000
): Promise<Trade | null> {
  // Move trade polling logic here
}
```

**File**: `src/lib/services/vaultWithdrawal.ts` (NEW)

```typescript
/**
 * Execute vault withdrawal
 */
export async function executeVaultWithdraw(
  vault: RaindexVault,
  config: Config
): Promise<{ hash: Hash; link: string }> {
  // Move from transactionStore
}
```

---

## Phase 3: Consolidate Data Transformation (MEDIUM PRIORITY)

### Goal
Create single source of truth for each data transformation to eliminate duplication.

### Steps

#### 3.1 Centralize Price Calculations

**File**: `src/lib/utils/pricing.ts` (NEW)

```typescript
/**
 * All price-related calculations in one place
 */

export interface PriceCalculationInput {
  inputAmount: bigint
  inputDecimals: number
  outputAmount: bigint
  outputDecimals: number
}

export function calculateIoRatio(input: PriceCalculationInput): number {
  const inputNormalized = parseFloat(formatUnits(input.inputAmount, input.inputDecimals))
  const outputNormalized = parseFloat(formatUnits(input.outputAmount, input.outputDecimals))
  return outputNormalized === 0 ? 0 : inputNormalized / outputNormalized
}

export function calculateQuotePerAsset(
  quoteAmount: bigint,
  quoteDecimals: number,
  assetAmount: bigint,
  assetDecimals: number
): number {
  // Single implementation used everywhere
}
```

**Replace uses in**:
- `orderbook.ts:walkOrderbook()`
- `transactionStore.ts:handleTakeOrders()`
- `tokenMath.ts:parseTradeAmounts()`

#### 3.2 Consolidate Quote Processing

**File**: `src/lib/services/quoteProcessing.ts` (NEW)

```typescript
/**
 * Single pipeline for quote normalization
 */

export function normalizeRaindexQuote(
  quote: RaindexQuote,
  paymentTokenAddress: string
): ProcessedQuote {
  // All quote processing logic here
  // Used by api/orders.ts only
}

export function enrichQuoteWithPrice(
  quote: ProcessedQuote
): ProcessedQuote & { quotePerAsset: number } {
  // Calculate price from ratio
  // Single implementation
}
```

#### 3.3 Reorganize Utils

**New structure**:
```
src/lib/utils/
├── orders/
│   ├── classification.ts   // classifyFlow, describeQuote
│   ├── execution.ts         // walkOrderbook
│   └── normalization.ts     // normalizeOrderData
├── pricing/
│   ├── calculations.ts      // calculateIoRatio, calculateQuotePerAsset
│   └── formatting.ts        // formatPrice, formatAmount
├── numbers/
│   ├── scaling.ts           // scaleAmount, normalizeDecimals
│   └── validation.ts        // validateAmount, checkDecimals
└── [keep existing]
    ├── format.ts
    ├── helpers.ts
    └── derivations.ts
```

---

## Phase 4: Improve Store Subscription Management (LOW-MEDIUM PRIORITY)

### Goal
Explicit data requirements per route, clearer ownership of "when to fetch".

### Steps

#### 4.1 Add Data Requirements to Route Loaders

**File**: `src/routes/(main)/trade/[id]/+page.ts`

```typescript
import { ensureResource } from '$lib/stores/cache'
import type { PageLoad } from './$types'

export const load: PageLoad = async ({ params, parent }) => {
  const { currentNetwork } = await parent()

  // Explicit data requirements for this page
  await Promise.all([
    ensureResource(currentNetwork.id, 'vaultSnapshot'),
    ensureResource(currentNetwork.id, 'orderbookQuotes'),
    ensureResource(currentNetwork.id, 'tradeActivity'),
    ensureResource(currentNetwork.id, 'oracleQuotes')
  ])

  return { tokenId: params.id }
}
```

**Benefits**:
- Single place to see page dependencies
- Easier to add loading states
- Components don't manually call ensureResource

#### 4.2 Remove Manual ensureResource from Components

**Files to update**:
- `MarketOrder.svelte`
- `DcaOrder.svelte`
- `LimitOrder.svelte`

**Change**:
```typescript
// Before:
onMount(async () => {
  await ensureResource(networkId, 'orderbookQuotes')
})

// After:
// (removed - handled by route loader)
```

---

## Phase 5: Simplify Test Mocks (LOW PRIORITY)

### Goal
Reduce test setup complexity by breaking circular dependencies.

### Steps

#### 5.1 Create Test Utilities

**File**: `tests/utils/mockStores.ts` (NEW)

```typescript
/**
 * Reusable store mocks
 */
export function createMockCurrentNetwork(overrides?) {
  return {
    subscribe: vi.fn((callback) => {
      callback(overrides || mockNetworks[0])
      return vi.fn()
    })
  }
}

export function createMockResource<T>(data: T) {
  return {
    subscribe: vi.fn((callback) => {
      callback({
        status: 'ready',
        data,
        updatedAt: Date.now(),
        error: null
      })
      return vi.fn()
    })
  }
}
```

#### 5.2 Simplify transactionStore Tests

**File**: `tests/lib/transactionStore.test.ts`

**Before**: 115 lines of mock setup

**After**: ~30 lines using utilities
```typescript
import { createMockCurrentNetwork, createMockResource } from '../utils/mockStores'

vi.mock('$lib/stores', () => ({
  currentNetwork: createMockCurrentNetwork(),
  orderbookQuotesResource: createMockResource({ quotes: [], summary: {} })
}))
```

---

## Implementation Order

1. **Week 1**: Phase 1 (Semantic Unification)
   - Days 1-2: Create type system, fix classifyFlow
   - Days 3-4: Rename component props, update tests
   - Day 5: Integration testing

2. **Week 2**: Phase 2 (Decouple Transaction Logic)
   - Days 1-2: Create schemas, extract services
   - Days 3-4: Refactor transactionStore
   - Day 5: Integration testing

3. **Week 3**: Phase 3 (Consolidate Transformations) + Phase 4 (Store Management)
   - Days 1-3: Centralize pricing, reorganize utils
   - Days 4-5: Add route loaders, remove manual calls

4. **Week 4**: Phase 5 (Test Simplification) + Documentation
   - Days 1-2: Create test utilities
   - Days 3-4: Update all tests
   - Day 5: Update documentation

---

## Testing Strategy

### Per Phase

**Phase 1**:
- Unit tests for classifyFlow with old AND new semantics
- Component tests for renamed props
- E2E test for market order flow

**Phase 2**:
- Unit tests for new service functions
- Integration tests for transactionStore with new schemas
- Mock tests for parameter validation

**Phase 3**:
- Unit tests for centralized pricing
- Regression tests to ensure calculations match old values

**Phase 4**:
- Integration tests for route loading
- Test that resources are fetched before component mount

**Phase 5**:
- Verify all existing tests still pass with new utilities
- Measure reduction in test setup lines

---

## Success Metrics

- **Reduced complexity**: Lines of code in transactionStore < 500 (from 650)
- **Improved testability**: Test setup lines < 50 (from 115+)
- **Type safety**: Zero `any` types in transaction parameters
- **Consistency**: Single implementation per calculation (ioRatio, quotePerAsset)
- **Clarity**: All developers can explain Buy/Sell vs Bid/Ask distinction

---

## Rollback Plan

Each phase is independent. If issues arise:
1. Revert the specific phase's commits
2. File issues for discovered edge cases
3. Continue with other phases

Use feature branches:
- `refactor/semantic-unification`
- `refactor/transaction-decoupling`
- `refactor/data-consolidation`
- `refactor/store-management`
- `refactor/test-simplification`

Merge to `main` only after full test suite passes.
