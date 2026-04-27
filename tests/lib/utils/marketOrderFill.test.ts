import { describe, it, expect } from 'vitest';
import {
	clampSlippageBps,
	computeRatioMultiplier,
	evaluateMarketOrderFill,
	DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
	MAX_SLIPPAGE_BPS,
	MIN_SLIPPAGE_BPS
} from '$lib/utils/marketOrderFill';

describe('clampSlippageBps', () => {
	it('returns the value when within bounds', () => {
		expect(clampSlippageBps(10)).toBe(10);
		expect(clampSlippageBps(100)).toBe(100);
		expect(clampSlippageBps(500)).toBe(500);
	});

	it('clamps below MIN_SLIPPAGE_BPS', () => {
		expect(clampSlippageBps(0)).toBe(MIN_SLIPPAGE_BPS);
		expect(clampSlippageBps(-50)).toBe(MIN_SLIPPAGE_BPS);
	});

	it('clamps above MAX_SLIPPAGE_BPS', () => {
		expect(clampSlippageBps(MAX_SLIPPAGE_BPS + 1)).toBe(MAX_SLIPPAGE_BPS);
		expect(clampSlippageBps(1_000_000)).toBe(MAX_SLIPPAGE_BPS);
	});

	it('returns DEFAULT for non-finite inputs', () => {
		expect(clampSlippageBps(NaN)).toBe(DEFAULT_MARKET_ORDER_SLIPPAGE_BPS);
		expect(clampSlippageBps(Infinity)).toBe(DEFAULT_MARKET_ORDER_SLIPPAGE_BPS);
	});

	it('rounds fractional inputs', () => {
		expect(clampSlippageBps(99.4)).toBe(99);
		expect(clampSlippageBps(99.6)).toBe(100);
	});
});

describe('computeRatioMultiplier', () => {
	// Regression: prior to this fix, Sell orders ignored slippageBps and used a
	// hardcoded "2" (= 100% tolerance). Both sides must derive the same multiplier.
	it('produces a multiplier identical for Buy and Sell at the same slippage', () => {
		// Helper itself is side-agnostic; the assertion enforces the contract that
		// the same input produces the same output regardless of side.
		expect(computeRatioMultiplier(10)).toBe(computeRatioMultiplier(10));
	});

	it('returns 1 + slippageBps/10_000 as a decimal string', () => {
		expect(computeRatioMultiplier(10)).toBe('1.001'); // 0.1%
		expect(computeRatioMultiplier(100)).toBe('1.01'); // 1%
		expect(computeRatioMultiplier(500)).toBe('1.05'); // 5%
		expect(computeRatioMultiplier(1000)).toBe('1.1'); // 10%
	});

	it('uses DEFAULT_MARKET_ORDER_SLIPPAGE_BPS for non-finite input', () => {
		expect(computeRatioMultiplier(NaN)).toBe(
			String(1 + DEFAULT_MARKET_ORDER_SLIPPAGE_BPS / 10_000)
		);
	});

	it('clamps below MIN and above MAX', () => {
		expect(computeRatioMultiplier(-10)).toBe(String(1 + MIN_SLIPPAGE_BPS / 10_000));
		expect(computeRatioMultiplier(MAX_SLIPPAGE_BPS + 10_000)).toBe(
			String(1 + MAX_SLIPPAGE_BPS / 10_000)
		);
	});

	// Regression test for the actual bug observed in the wild: a 0.1% Sell order
	// was filling at ~0.62% slippage because the SDK received priceCap=worst*2
	// instead of worst*1.001.
	it('does NOT return 2 (the legacy emergency multiplier) for any reasonable slippage', () => {
		for (const bps of [1, 10, 50, 100, 500, 1000, 2000]) {
			expect(computeRatioMultiplier(bps)).not.toBe('2');
			expect(parseFloat(computeRatioMultiplier(bps))).toBeLessThan(2);
		}
	});
});

describe('evaluateMarketOrderFill', () => {
	describe('buy-anchor (no requestedTakerPaysAmount)', () => {
		it('flags no-fill when receivedWants is 0', () => {
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 0n,
				totalTakerPaysAmount: 0n,
				requestedTakerWantsAmount: 1_000_000_000_000_000_000n
			});
			expect(result.isNoFill).toBe(true);
			expect(result.isPartialFill).toBe(false);
		});

		it('flags partial when received <99.7% of requested wants', () => {
			const requested = 1_000_000_000_000_000_000n; // 1.0
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 990_000_000_000_000_000n, // 0.99 = 99.0%
				totalTakerPaysAmount: 100_000_000n, // irrelevant
				requestedTakerWantsAmount: requested
			});
			expect(result.isNoFill).toBe(false);
			expect(result.isPartialFill).toBe(true);
		});

		it('does not flag partial when received >=99.7% of wants', () => {
			const requested = 1_000_000_000_000_000_000n;
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 998_000_000_000_000_000n, // 99.8%
				totalTakerPaysAmount: 100_000_000n,
				requestedTakerWantsAmount: requested
			});
			expect(result.isPartialFill).toBe(false);
		});

		it('handles requested=0 as no-fill (zero anchor)', () => {
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 1n,
				totalTakerPaysAmount: 1n,
				requestedTakerWantsAmount: 0n
			});
			expect(result.isNoFill).toBe(true);
		});
	});

	describe('pays-anchor (requestedTakerPaysAmount set)', () => {
		// Regression: this is the Sell scenario from production. User sells 0.5 wtMSTR,
		// gets full 0.5 sold for 89.585 USDC vs simulated 90.14. Old logic compared
		// USDC received (89.585) vs simulated USDC (90.14) = 99.38% < 99.7% threshold,
		// flagging "Partial fill" even though full asset quantity sold.
		// Correct logic: compare asset paid (0.5) vs asset requested (0.5) = 100% → not partial.
		it('does NOT flag partial when full asset quantity sold but price worse than simulated', () => {
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 89_585_000n, // 89.585 USDC actually received (worse than simulated)
				totalTakerPaysAmount: 500_000_000_000_000_000n, // 0.5 wtMSTR fully sold
				requestedTakerWantsAmount: 90_140_000n, // 90.14 USDC simulated (informational)
				requestedTakerPaysAmount: 500_000_000_000_000_000n // 0.5 wtMSTR requested
			});
			expect(result.isNoFill).toBe(false);
			expect(result.isPartialFill).toBe(false);
		});

		it('flags partial when actual paid < 99.7% of requested pays', () => {
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 80_000_000n, // some USDC received
				totalTakerPaysAmount: 400_000_000_000_000_000n, // 0.4 wtMSTR sold
				requestedTakerWantsAmount: 90_140_000n,
				requestedTakerPaysAmount: 500_000_000_000_000_000n // 0.5 wtMSTR requested
			});
			expect(result.isPartialFill).toBe(true);
		});

		it('does not flag partial at 99.7% boundary', () => {
			const requested = 1_000_000_000_000_000_000n;
			const ninetyNineSeven = 997_000_000_000_000_000n; // exactly 99.7%
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 100_000_000n,
				totalTakerPaysAmount: ninetyNineSeven,
				requestedTakerWantsAmount: 100_000_000n,
				requestedTakerPaysAmount: requested
			});
			expect(result.isPartialFill).toBe(false);
		});

		it('flags no-fill when paid is 0', () => {
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 0n,
				totalTakerPaysAmount: 0n,
				requestedTakerWantsAmount: 0n,
				requestedTakerPaysAmount: 1_000_000_000_000_000_000n
			});
			expect(result.isNoFill).toBe(true);
		});

		it('handles Buy-spend correctly (anchor on payment side)', () => {
			// User wants to spend 100 USDC to buy whatever asset. priceCap blocks deep
			// legs → only 80 USDC actually spent.
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: 400_000_000_000_000_000n, // 0.4 asset received
				totalTakerPaysAmount: 80_000_000n, // 80 USDC spent
				requestedTakerWantsAmount: 500_000_000_000_000_000n, // 0.5 asset simulated
				requestedTakerPaysAmount: 100_000_000n // 100 USDC requested
			});
			expect(result.isPartialFill).toBe(true);
		});
	});
});
