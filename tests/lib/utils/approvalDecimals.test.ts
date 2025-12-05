import { describe, it, expect } from 'vitest';

/**
 * Test the approval amount calculation for market orders.
 *
 * BUY orders: 0.05% buffer on outputAmountGiven (calculated from walkOrderbook, has rounding)
 * SELL orders: No buffer on selectedAmount (exact user input, no calculation)
 */

describe('Market order approval calculation', () => {
	// Simulate the approval calculation logic
	function calculateApprovalAmount(
		orderSide: 'Buy' | 'Sell',
		outputAmountGiven: bigint, // For BUY: payment amount from walkOrderbook
		selectedAmount: bigint // For SELL: exact user input
	): bigint {
		if (orderSide === 'Buy') {
			// BUY: add 0.05% buffer for rounding errors
			const roundingBuffer = outputAmountGiven / 2000n;
			return outputAmountGiven + (roundingBuffer > 0n ? roundingBuffer : 1n);
		} else {
			// SELL: no buffer - exact amount
			return selectedAmount;
		}
	}

	describe('BUY order (approving payment token - needs buffer)', () => {
		it('should add 0.05% buffer for $100 trade', () => {
			const outputAmountGiven = 100_000_000n; // $100 in USDC (6 decimals)
			const result = calculateApprovalAmount('Buy', outputAmountGiven, 0n);

			// Buffer = 100_000_000 / 2000 = 50_000 ($0.05)
			expect(result).toBe(100_050_000n);
			expect(result - outputAmountGiven).toBe(50_000n); // $0.05 buffer
		});

		it('should add 0.05% buffer for $10,000 trade', () => {
			const outputAmountGiven = 10_000_000_000n; // $10,000 in USDC
			const result = calculateApprovalAmount('Buy', outputAmountGiven, 0n);

			expect(result).toBe(10_005_000_000n);
		});

		it('should use 1 wei minimum buffer for tiny amounts', () => {
			const outputAmountGiven = 500n; // $0.0005
			const result = calculateApprovalAmount('Buy', outputAmountGiven, 0n);

			// Buffer = 500 / 2000 = 0, fallback to 1
			expect(result).toBe(501n);
		});
	});

	describe('SELL order (approving asset token - no buffer)', () => {
		it('should approve exact amount for 10 token trade', () => {
			const selectedAmount = 10n * 10n ** 18n; // 10 tSTOX
			const result = calculateApprovalAmount('Sell', 0n, selectedAmount);

			// No buffer - exact amount
			expect(result).toBe(selectedAmount);
		});

		it('should approve exact amount for fractional token trade', () => {
			const selectedAmount = 5n * 10n ** 17n; // 0.5 tSTOX
			const result = calculateApprovalAmount('Sell', 0n, selectedAmount);

			// No buffer - exact amount
			expect(result).toBe(selectedAmount);
		});

		it('should approve exact amount for tiny amounts', () => {
			const selectedAmount = 1n; // 1 wei
			const result = calculateApprovalAmount('Sell', 0n, selectedAmount);

			// No buffer - exact amount (not even +1 wei)
			expect(result).toBe(1n);
		});
	});

	describe('Buffer rationale', () => {
		it('BUY needs buffer because outputAmountGiven has rounding from walkOrderbook', () => {
			// walkOrderbook calculates cost with:
			// 1. Price scaling: BigInt(Math.round(price * 1e9))
			// 2. Division: (quantity * priceScaled) / PRICE_SCALE - rounds down
			// 3. Decimal scaling: scaleAmount() - rounds down
			// Result can be slightly less than actual cost needed

			const calculatedCost = 99_999_999n; // Slightly under $100 due to rounding
			const withBuffer = calculateApprovalAmount('Buy', calculatedCost, 0n);

			// Buffer ensures we approve enough
			expect(withBuffer).toBeGreaterThan(calculatedCost);
		});

		it('SELL needs no buffer because selectedAmount is exact user input', () => {
			// User enters "10" tokens -> selectedAmount = 10e18
			// No calculations, no rounding - it's exactly what they want to sell
			// The contract will transfer exactly this amount

			const userInput = 10n * 10n ** 18n;
			const approved = calculateApprovalAmount('Sell', 0n, userInput);

			// Approved amount matches user input exactly
			expect(approved).toBe(userInput);
		});
	});
});
