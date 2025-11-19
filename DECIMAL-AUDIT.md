# Decimal Consistency Audit

## Executive Summary

This audit identifies issues with hardcoded 18-decimal assumptions and token/decimal pairing mismatches in the codebase.

### Key Findings:
1. **Hardcoded 18-decimal internal scaling** - walkOrderbook uses 18-decimal scaling for all internal calculations
2. **Token/decimal pairing errors** - Several instances where wrong decimal values are used for token scaling
3. **Unnecessary 18-decimal normalization** - Internal calculations use 18 decimals when tokens have variable decimals

---

## Precision Requirements

**CRITICAL**: All token amount calculations MUST use BigInt arithmetic to maintain precision.

### Why Not Use JavaScript Floats?

JavaScript numbers are 64-bit IEEE 754 floating-point values with ~15-17 digits of precision. Token amounts in wei can be much larger (e.g., 1e18 for 1 token with 18 decimals), causing precision loss when converting BigInt → Number.

### Correct Pattern for Price Calculations:

```typescript
// ❌ BAD: Converting large BigInt to float loses precision
const selectedAmount = 1_500_000_000_000_000_000n; // 1.5 tokens (18 decimals)
const price = 1.2; // USDC per token
const resultFloat = Number(selectedAmount) * price; // PRECISION LOSS!
const result = BigInt(resultFloat); // Incorrect value

// ✅ GOOD: Scale price to integer, keep large values as BigInt
const priceScaled = BigInt(Math.round(price * (10 ** paymentTokenDecimals)));
const result = (selectedAmount * priceScaled) / (10n ** BigInt(assetTokenDecimals));
// All arithmetic on large values stays in precise BigInt
```

### Key Principles:
1. **Never convert large token amounts (BigInt) to Number** - Precision loss is unacceptable
2. **Scale small values (like price) to integers** - Safe because they're small enough
3. **All arithmetic on large values must use BigInt** - JavaScript's only arbitrary-precision type
4. **Rounding must happen at the end** - Not during intermediate calculations

### Why This Matters:
- A user buying 1000 tokens at 1.2 USDC each = 1200 USDC
- With precision loss: might approve 1199.99999 or 1200.00001 USDC
- This can cause transaction failures or overapproval vulnerabilities

**Design Decision**: Prioritize precision over code simplicity. Use scaled BigInt arithmetic even when float-based approaches would be shorter.

---

## Issue 1: Hardcoded 18-Decimal Scaling in walkOrderbook

**Location**: `/Users/alastairong/st0x/st0x/src/lib/utils/orderbook.ts`

### Problems:

#### Line 20: FIXED_POINT_SCALE constant
```typescript
export const FIXED_POINT_SCALE = 10n ** 18n;
```
**Issue**: Hardcoded 18-decimal constant used throughout calculations.

#### Line 163: Scaling maxOutput to 18 decimals
```typescript
const maxOutputScaled = scaleAmount(maxOutputBigInt, outputDecimals, 18);
```
**Issue**: Hardcoded target of 18 decimals. Why normalize to 18 when tokens have variable decimals?

#### Line 175: Price scaling to 18 decimals
```typescript
const scaledPrice = BigInt(Math.round(price * 1e18));
```
**Issue**: Hardcoded 1e18 multiplier for price scaling.

#### Line 178: Using FIXED_POINT_SCALE
```typescript
return (maxOutputScaled * FIXED_POINT_SCALE) / scaledPrice;
```
**Issue**: Assumes 18-decimal math.

#### Line 193: Scaling selectedAmount to 18 decimals
```typescript
const targetAmount = scaleAmount(selectedAmount, assetDecimals, 18);
```
**Issue**: Hardcoded target of 18 decimals.

#### Lines 26-28: QuoteFill interface comments
```typescript
quantityFilled: bigint; // Amount of asset filled (scaled to 1e18)
cost: bigint; // Quote token cost scaled to 1e18
```
**Issue**: Comments indicate hardcoded 18-decimal assumption.

#### Line 195: Comment assumes 18 decimals
```typescript
let totalCostScaled = 0n; // Quote tokens scaled to 1e18
```
**Issue**: Hardcoded 18-decimal assumption for quote tokens.

### Root Cause:
The walkOrderbook function normalizes ALL amounts to 18 decimals internally, regardless of actual token decimals. This is unnecessary and confusing because:
1. Token decimals are variable (USDC=6, most tokens=18)
2. The Float library handles ratios without needing fixed decimals
3. Consumers must know about this internal 18-decimal representation to convert back

### Recommendation:
Either:
- **Option A**: Keep amounts in their native token decimals throughout
- **Option B**: Document clearly that walkOrderbook returns 18-decimal scaled values and ensure ALL consumers handle conversion correctly

---

## Issue 2: Token/Decimal Pairing Error in MarketOrder.svelte

**Location**: `/Users/alastairong/st0x/st0x/src/lib/components/orders/MarketOrder.svelte:434-438`

### Problem:

```typescript
const expectedCost18Dec = (selectedAmountScaled * avgPriceBigInt) / FIXED_POINT_SCALE;

requiredApprovalBigInt = scaleAmount(
    expectedCost18Dec,
    assetTokenDecimals,  // ❌ WRONG - value is in 18 decimals, not asset decimals
    paymentTokenDecimals
);
```

**Issue**: `expectedCost18Dec` is in 18 decimals (as the name indicates), but the scaleAmount call uses `assetTokenDecimals` as the FROM parameter. This is incorrect.

**However, the REAL issue is that this entire block is unnecessarily complex.** The conversion to/from 18 decimals should be eliminated entirely.

**Current approach (lines 426-438) - UNNECESSARY COMPLEXITY**:
```typescript
// Step 1: Convert to 18 decimals
const selectedAmountScaled = scaleAmount(selectedAmount, assetTokenDecimals, 18);

// Step 2: Scale price to 18 decimals
const avgPriceBigInt = BigInt(Math.round(price * 1e18));

// Step 3: Multiply and divide
const expectedCost18Dec = (selectedAmountScaled * avgPriceBigInt) / FIXED_POINT_SCALE;

// Step 4: Convert from 18 decimals to payment decimals (BUGGY LINE)
requiredApprovalBigInt = scaleAmount(expectedCost18Dec, assetTokenDecimals, paymentTokenDecimals);
```

**Recommended approach - DIRECT CALCULATION WITH PRECISION**:
```typescript
// Direct calculation: convert from asset decimals to payment decimals in one step
const priceScaled = BigInt(Math.round(price * (10 ** paymentTokenDecimals)));
requiredApprovalBigInt = (selectedAmount * priceScaled) / (10n ** BigInt(assetTokenDecimals));
```

This eliminates:
- The 18-decimal intermediary representation
- The unnecessary scaleAmount calls
- The FIXED_POINT_SCALE constant usage
- The potential for decimal pairing bugs

See **Precision Requirements** section above for why this pattern is correct.

---

## Issue 3: Hardcoded 18-Decimal Math in MarketOrder.svelte

**NOTE**: This issue is completely resolved by fixing Issue 2 above. Documenting for reference.

**Location**: `/Users/alastairong/st0x/st0x/src/lib/components/orders/MarketOrder.svelte`

### Lines 427, 431, 432: Unnecessary 18-decimal intermediary

These lines (part of the same block as Issue 2) all use hardcoded 18-decimal assumptions:

```typescript
// Line 427: Hardcoded target of 18 decimals
const selectedAmountScaled = scaleAmount(selectedAmount, assetTokenDecimals, 18);

// Line 431: Hardcoded 1e18 multiplier for price
const avgPriceBigInt = BigInt(Math.round(price * 1e18));

// Line 432: Division by FIXED_POINT_SCALE (10n ** 18n)
const expectedCost18Dec = (selectedAmountScaled * avgPriceBigInt) / FIXED_POINT_SCALE;
```

**Resolution**: Replace this entire block with the direct calculation from Issue 2:
```typescript
const priceScaled = BigInt(Math.round(price * (10 ** paymentTokenDecimals)));
requiredApprovalBigInt = (selectedAmount * priceScaled) / (10n ** BigInt(assetTokenDecimals));
```

This eliminates all three lines and removes all 18-decimal hardcoding from this calculation.

---

## Issue 4: Hardcoded Decimal Fallbacks

**Location**: Multiple locations in `MarketOrder.svelte`

### Lines with hardcoded fallbacks:
- Line 423: `paymentToken?.decimals ?? 6` - Assumes USDC (6 decimals)
- Line 424: `passedOutputToken?.decimals ?? 18` - Assumes 18 decimals
- Line 442: `passedOutputToken?.decimals ?? 18` - Assumes 18 decimals
- Line 453: `passedOutputToken?.decimals ?? 18` - Assumes 18 decimals
- Line 460: `paymentToken?.decimals ?? 6` - Assumes USDC (6 decimals)
- Line 463: `paymentToken?.decimals ?? 6` and `passedOutputToken?.decimals ?? 18`

### In LimitOrder.svelte:
- Line 118: `assetToken?.decimals || 18` - Assumes 18 decimals

**Issue**: Hardcoded fallback values. If these tokens don't have decimals set, it's a critical error, not something that should fall back to hardcoded defaults.

**Recommendation**: Either:
- Remove fallbacks and require decimals to be set
- Add validation that throws an error if decimals are missing
- Use a centralized token registry with validated decimal values

---

## Issue 5: walkOrderbook assetDecimals Default

**Location**: `/Users/alastairong/st0x/st0x/src/lib/utils/orderbook.ts:183`

```typescript
const assetDecimals = options.assetDecimals ?? 18;
```

**Issue**: Defaults to 18 decimals if not provided. This is dangerous - if the caller forgets to pass assetDecimals, it will silently assume 18 and produce incorrect results for tokens like USDC (6 decimals).

**Recommendation**: Make assetDecimals required, or throw an error if not provided.

---

## Issue 6: Correct Usage (for reference)

**Location**: `/Users/alastairong/st0x/st0x/src/lib/components/orders/MarketOrder.svelte:460`

```typescript
? scaleAmount(inputAmountFilled, 18, paymentToken?.decimals ?? 6)
```

**Status**: ✅ CORRECT - This correctly recognizes that `inputAmountFilled` from walkOrderbook is in 18 decimals and scales it to payment token decimals.

---

## Architecture Review: Why 18 Decimals?

### Current Architecture:
1. **Rain Float library**: Handles ratios as hex-encoded Float values (no fixed decimals)
2. **ratioToNumber()**: Converts Float to human-readable number (no fixed decimals)
3. **quotePerAsset**: Human-readable price ratio (no fixed decimals)
4. **walkOrderbook**: Internally normalizes everything to 18 decimals ❌
5. **ioRatio**: Calculated from 18-decimal values, returned as number

### The Problem:
Since Rain's Float library already handles precision without fixed decimals, and since tokens have variable decimals, there's no technical reason to normalize to 18 decimals internally.

### Historical Context (from user):
> "In a past version we had to use 18 point fixed decimals for ioratios but in the new version of rain ioratios are always floats to be processed by rain's float library."

This suggests the 18-decimal normalization is **legacy code** that should be removed.

---

## Recommendations

### High Priority:
1. **Fix MarketOrder.svelte line 436** - Use 18 instead of assetTokenDecimals
2. **Document walkOrderbook return values** - Clearly state all return values are scaled to 18 decimals
3. **Remove hardcoded decimal fallbacks** - Make decimals required or validate they exist

### Medium Priority:
4. **Refactor walkOrderbook** - Remove 18-decimal normalization and work in native token decimals
5. **Remove FIXED_POINT_SCALE** - Eliminate hardcoded 18-decimal constant
6. **Simplify MarketOrder approval calculation** - Remove unnecessary 18-decimal conversions

### Low Priority:
7. **Add decimal validation** - Ensure token decimals are always set before calculations
8. **Add tests for multi-decimal scenarios** - Test with 6-decimal and 18-decimal tokens together

---

## Summary Table

| Location | Issue | Severity | Fix Difficulty |
|----------|-------|----------|----------------|
| orderbook.ts:20 | FIXED_POINT_SCALE constant | High | Medium |
| orderbook.ts:163 | Hardcoded 18-decimal target | High | Medium |
| orderbook.ts:175 | price * 1e18 | High | Medium |
| orderbook.ts:193 | Hardcoded 18-decimal target | High | Medium |
| MarketOrder.svelte:436 | Wrong decimal parameter | **Critical** | Easy |
| MarketOrder.svelte:427 | Hardcoded 18-decimal target | High | Medium |
| MarketOrder.svelte:431 | price * 1e18 | High | Medium |
| MarketOrder.svelte:423,424,442,453,460,463 | Hardcoded fallbacks | Medium | Easy |
| orderbook.ts:183 | assetDecimals ?? 18 | Medium | Easy |
| LimitOrder.svelte:118 | Hardcoded fallback | Medium | Easy |
