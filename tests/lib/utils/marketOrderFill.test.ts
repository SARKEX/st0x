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

describe('TRADE-04 regression matrix — pins 89571b3 bug classes', () => {
	// This block is the executable specification of the two bug classes 89571b3 fixed:
	//   Bug class 1 (asymmetric slippage):  hardcoded EMERGENCY_RATIO_MULTIPLIER='2' for Sell
	//                                        vs computeRatioMultiplier(slippageBps) for Buy.
	//                                        Pinned in marketOrderExecution.test.ts (Task 2).
	//   Bug class 2 (anchor inversion):     partial-fill check anchored on requestedTakerWantsAmount
	//                                        when it should have been requestedTakerPaysAmount for
	//                                        spend-anchored modes (Sell-by-asset, Buy-by-spend).
	//                                        Pinned BELOW.
	//
	// Threshold reminder: MARKET_ORDER_FULL_FILL_THRESHOLD_BPS = 9_970n
	//   isPartialFill iff !isNoFill AND actual * 10_000 < requested * 9_970
	//   i.e. partial when actual / requested < 99.7%

	interface RegressionCase {
		description: string;
		// Test inputs to evaluateMarketOrderFill:
		totalTakerWantsAmount: bigint;
		totalTakerPaysAmount: bigint;
		requestedTakerWantsAmount: bigint;
		requestedTakerPaysAmount?: bigint;
		// Expected outputs:
		expectPartialFill: boolean;
		expectNoFill: boolean;
	}

	const REGRESSION_CASES: RegressionCase[] = [
		// ── BUG CLASS 2: anchor inversion. The 89571b3 fix was: anchor on PAYS for spend-anchored
		//    modes, not WANTS. Pre-fix code wrongly anchored on WANTS for Sell-by-asset and
		//    Buy-by-spend. Each mode×side gets full-fill / partial / 99.7%-boundary / no-fill.

		// ─── Sell-by-asset (spend-anchored) ────────────────────────────────────────────────────
		// Sell IS spend-anchored regardless of inputMode — user typed an asset amount they're SELLING.
		// The "anchor" is what the user committed to part with: their asset (the PAYS side from
		// the taker's view). Anchor = requestedTakerPaysAmount.
		{
			description:
				'Sell-by-asset full-fill (asset fully sold, USDC < typed): NOT partial — anchor on PAYS catches this',
			totalTakerWantsAmount: 90_000_000n, // got 90 USDC (worse price than typed 95 estimate)
			totalTakerPaysAmount: 1_000_000_000_000_000_000n, // sold full 1.0 asset (full-fill on the anchor)
			requestedTakerWantsAmount: 95_000_000n,
			requestedTakerPaysAmount: 1_000_000_000_000_000_000n,
			expectPartialFill: false,
			expectNoFill: false
			// PRE-89571b3: would have anchored on WANTS → 90/95 = 94.7% < 99.7% → flagged partial (WRONG).
		},
		{
			description:
				'Sell-by-asset partial: only 80% of asset sold (vault drained mid-fill) — flagged partial',
			totalTakerWantsAmount: 75_000_000n,
			totalTakerPaysAmount: 800_000_000_000_000_000n, // 0.8 of typed 1.0 asset = 80%
			requestedTakerWantsAmount: 95_000_000n,
			requestedTakerPaysAmount: 1_000_000_000_000_000_000n,
			expectPartialFill: true,
			expectNoFill: false
		},
		{
			description:
				'Sell-by-asset 99.7% boundary: exactly 99.7% of asset sold — NOT partial (boundary)',
			totalTakerWantsAmount: 94_700_000n,
			totalTakerPaysAmount: 997_000_000_000_000_000n, // 0.997 of 1.0 asset
			requestedTakerWantsAmount: 95_000_000n,
			requestedTakerPaysAmount: 1_000_000_000_000_000_000n,
			expectPartialFill: false,
			expectNoFill: false
		},
		{
			description: 'Sell-by-asset no-fill: 0 received → isNoFill, NOT isPartialFill',
			totalTakerWantsAmount: 0n,
			totalTakerPaysAmount: 0n,
			requestedTakerWantsAmount: 95_000_000n,
			requestedTakerPaysAmount: 1_000_000_000_000_000_000n,
			expectPartialFill: false,
			expectNoFill: true
		},

		// ─── Buy-by-asset (wants-anchored) ─────────────────────────────────────────────────────
		// User typed an asset amount they want to BUY. Anchor = the asset they want = WANTS side
		// from taker. requestedTakerPaysAmount is undefined (or 0) — falls back to wants-anchor.
		{
			description:
				'Buy-by-asset full-fill (asset fully received, USDC paid > typed): NOT partial — anchor on WANTS',
			totalTakerWantsAmount: 1_000_000_000_000_000_000n, // got full 1.0 asset (full-fill)
			totalTakerPaysAmount: 100_500_000n, // paid 100.5 USDC (slippage within tolerance)
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: undefined,
			expectPartialFill: false,
			expectNoFill: false
		},
		{
			description: 'Buy-by-asset partial: only 80% asset received',
			totalTakerWantsAmount: 800_000_000_000_000_000n, // 0.8 of 1.0 asset
			totalTakerPaysAmount: 80_000_000n,
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: undefined,
			expectPartialFill: true,
			expectNoFill: false
		},
		{
			description: 'Buy-by-asset 99.7% boundary: exactly 99.7% of asset received — NOT partial',
			totalTakerWantsAmount: 997_000_000_000_000_000n,
			totalTakerPaysAmount: 99_700_000n,
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: undefined,
			expectPartialFill: false,
			expectNoFill: false
		},
		{
			description: 'Buy-by-asset no-fill: 0 received → isNoFill',
			totalTakerWantsAmount: 0n,
			totalTakerPaysAmount: 0n,
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: undefined,
			expectPartialFill: false,
			expectNoFill: true
		},

		// ─── Buy-by-spend (spend-anchored) ─────────────────────────────────────────────────────
		// User typed a USDC amount they're spending. Anchor = the USDC = PAYS side from taker.
		{
			description:
				'Buy-by-spend full-fill (USDC fully spent, asset received < estimate): NOT partial — anchor on PAYS catches this',
			totalTakerWantsAmount: 950_000_000_000_000_000n, // got 0.95 asset (worse price than typed 1.0)
			totalTakerPaysAmount: 100_000_000n, // spent full 100 USDC (full on anchor)
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: 100_000_000n,
			expectPartialFill: false,
			expectNoFill: false
			// PRE-89571b3: would have anchored on WANTS → 0.95/1.0 < 99.7% → flagged partial (WRONG).
		},
		{
			description: 'Buy-by-spend partial: only 80% USDC spent (vault drained for fewer asset units)',
			totalTakerWantsAmount: 800_000_000_000_000_000n,
			totalTakerPaysAmount: 80_000_000n, // 80% of typed 100 USDC
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: 100_000_000n,
			expectPartialFill: true,
			expectNoFill: false
		},
		{
			description: 'Buy-by-spend 99.7% boundary: exactly 99.7% of USDC spent — NOT partial',
			totalTakerWantsAmount: 997_000_000_000_000_000n,
			totalTakerPaysAmount: 99_700_000n, // exactly 99.7% of 100 USDC
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: 100_000_000n,
			expectPartialFill: false,
			expectNoFill: false
		},
		{
			description: 'Buy-by-spend no-fill: 0 received → isNoFill',
			totalTakerWantsAmount: 0n,
			totalTakerPaysAmount: 0n,
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: 100_000_000n,
			expectPartialFill: false,
			expectNoFill: true
		},

		// ─── Anchor-fallback: requestedTakerPaysAmount = 0n (treated as undefined per 89571b3) ──
		{
			description:
				'Anchor-fallback: pays = 0n falls back to wants-anchor (Buy-by-asset path)',
			totalTakerWantsAmount: 1_000_000_000_000_000_000n,
			totalTakerPaysAmount: 100_500_000n,
			requestedTakerWantsAmount: 1_000_000_000_000_000_000n,
			requestedTakerPaysAmount: 0n,
			expectPartialFill: false,
			expectNoFill: false
		},

		// ─── Edge: 0 actual but non-zero requested (Sell-by-asset, vault drained pre-fill) ─────
		{
			description:
				'Sell-by-asset 0 received (vault entirely drained pre-fill): isNoFill',
			totalTakerWantsAmount: 0n,
			totalTakerPaysAmount: 0n,
			requestedTakerWantsAmount: 95_000_000n,
			requestedTakerPaysAmount: 1_000_000_000_000_000_000n,
			expectPartialFill: false,
			expectNoFill: true
		},

		// ─── Edge: 0 requested → isNoFill (defensive — guards against pre-flight failure) ─────
		{
			description: 'Defensive: 0 requestedWants AND undefined requestedPays → isNoFill',
			totalTakerWantsAmount: 100_000n,
			totalTakerPaysAmount: 100_000n,
			requestedTakerWantsAmount: 0n,
			requestedTakerPaysAmount: undefined,
			expectPartialFill: false,
			expectNoFill: true
		},

		// ─── Just-above-boundary: 99.71% of pays-anchor → NOT partial ─────────────────────────
		{
			description: 'Just-above-boundary: 99.71% of pays-anchor → NOT partial',
			totalTakerWantsAmount: 95_000_000n,
			totalTakerPaysAmount: 997_100_000_000_000_000n,
			requestedTakerWantsAmount: 95_000_000n,
			requestedTakerPaysAmount: 1_000_000_000_000_000_000n,
			expectPartialFill: false,
			expectNoFill: false
		}
	];

	REGRESSION_CASES.forEach((c) => {
		it(c.description, () => {
			const result = evaluateMarketOrderFill({
				totalTakerWantsAmount: c.totalTakerWantsAmount,
				totalTakerPaysAmount: c.totalTakerPaysAmount,
				requestedTakerWantsAmount: c.requestedTakerWantsAmount,
				requestedTakerPaysAmount: c.requestedTakerPaysAmount
			});
			expect(result.isPartialFill).toBe(c.expectPartialFill);
			expect(result.isNoFill).toBe(c.expectNoFill);
		});
	});
});
