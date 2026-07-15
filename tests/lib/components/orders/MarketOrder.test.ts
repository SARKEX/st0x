import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Test the price calculation logic for market orders
 * Formula: requiredInput = (encodedPrice * selectedAmount) / 1e18
 * Where: encodedPrice = bestPrice * 10^(inputDecimals - outputDecimals)
 */

describe('MarketOrder price calculations', () => {
	const PRECISION = BigInt(1e18);

	// Helper function that mirrors the actual calculation
	function calculateRequiredInput(
		selectedAmount: bigint,
		bestPrice: bigint,
		inputDecimals: number,
		outputDecimals: number
	): bigint {
		const decimalScaling = BigInt(10 ** (inputDecimals - outputDecimals));
		const encodedPrice = bestPrice * decimalScaling;
		return (encodedPrice * selectedAmount) / PRECISION;
	}

	describe('SELL scenario: USDC (6 decimals) → Token (18 decimals)', () => {
		const inputDecimals = 18; // Token
		const outputDecimals = 6; // USDC
		const bestPrice = BigInt(2e18); // Price of 2

		it.each([
			{
				desc: '100 USDC → 200 tokens at price 2',
				selectedAmount: BigInt(100e6),
				expected: BigInt(200e18)
			},
			{
				desc: '0.5 USDC → 1 token at price 2',
				selectedAmount: BigInt(0.5e6),
				expected: BigInt(1e18)
			},
			{
				desc: '1000 USDC → 2000 tokens at price 2',
				selectedAmount: BigInt(1000e6),
				expected: BigInt(2000e18)
			}
		])('should calculate $desc', ({ selectedAmount, expected }) => {
			const requiredInput = calculateRequiredInput(
				selectedAmount,
				bestPrice,
				inputDecimals,
				outputDecimals
			);
			expect(requiredInput).toBe(expected);
		});

		it.each([
			{
				desc: 'price 0.5',
				price: BigInt(0.5e18),
				amount: BigInt(100e6),
				expected: BigInt(50e18)
			},
			{
				desc: 'price 1000',
				price: BigInt(1000e18),
				amount: BigInt(100e6),
				expected: BigInt('100000000000000000000000')
			}
		])('should calculate with $desc', ({ price, amount, expected }) => {
			const requiredInput = calculateRequiredInput(amount, price, inputDecimals, outputDecimals);
			expect(requiredInput).toBe(expected);
		});
	});

	describe('BUY scenario: USDC (6 decimals) ← Token (18 decimals)', () => {
		it.each([
			{
				desc: 'buying 100 tokens costs 200 USDC when price is inverted to 2e18',
				selectedAmount: BigInt(200e6),
				bestPrice: BigInt(1e18),
				expected: BigInt(200e18)
			},
			{
				desc: '100 USDC gets 100 tokens at price 1',
				selectedAmount: BigInt(100e6),
				bestPrice: BigInt(1e18),
				expected: BigInt(100e18)
			}
		])('should calculate $desc', ({ selectedAmount, bestPrice, expected }) => {
			const requiredInput = calculateRequiredInput(selectedAmount, bestPrice, 18, 6);
			expect(requiredInput).toBe(expected);
		});
	});

	describe('Same decimals scenario: Token A (18) → Token B (18)', () => {
		const inputDecimals = 18;
		const outputDecimals = 18;

		it.each([
			{
				desc: '100 Token A → 200 Token B at price 2',
				selectedAmount: BigInt(100e18),
				price: BigInt(2e18),
				expected: BigInt(200e18)
			},
			{
				desc: '1 Token A → 2 Token B at price 2',
				selectedAmount: BigInt(1e18),
				price: BigInt(2e18),
				expected: BigInt(2e18)
			},
			{
				desc: 'with price 1',
				selectedAmount: BigInt(100e18),
				price: BigInt(1e18),
				expected: BigInt(100e18)
			},
			{
				desc: 'with fractional price 0.1',
				selectedAmount: BigInt(100e18),
				price: BigInt(0.1e18),
				expected: BigInt(10e18)
			}
		])('should calculate $desc', ({ selectedAmount, price, expected }) => {
			const requiredInput = calculateRequiredInput(
				selectedAmount,
				price,
				inputDecimals,
				outputDecimals
			);
			expect(requiredInput).toBe(expected);
		});
	});

	describe('Edge cases', () => {
		it.each([
			{
				desc: 'zero selectedAmount',
				selectedAmount: BigInt(0),
				bestPrice: BigInt(2e18),
				inputDec: 18,
				outputDec: 6,
				expected: BigInt(0)
			},
			{
				desc: 'very small amounts (1 wei)',
				selectedAmount: BigInt(1),
				bestPrice: BigInt(2e18),
				inputDec: 18,
				outputDec: 6,
				expected: BigInt(2e12)
			},
			{
				desc: 'very large amounts (1M USDC at price 100)',
				selectedAmount: BigInt(1000000e6),
				bestPrice: BigInt(100e18),
				inputDec: 18,
				outputDec: 6,
				expected: BigInt('100000000000000000000000000')
			},
			{
				desc: '8-decimal token (100 @ price 2)',
				selectedAmount: BigInt(100e8),
				bestPrice: BigInt(2e18),
				inputDec: 18,
				outputDec: 8,
				expected: BigInt(200e18)
			}
		])('should handle $desc', ({ selectedAmount, bestPrice, inputDec, outputDec, expected }) => {
			const result = calculateRequiredInput(selectedAmount, bestPrice, inputDec, outputDec);
			expect(result).toBe(expected);
		});
	});
});

/** RAI-333: every market failure funnels through one structured support panel. */
describe('MarketOrder structured support error surface (RAI-333)', () => {
	const componentPath = resolve(process.cwd(), 'src/lib/components/orders/MarketOrder.svelte');
	const componentSource = readFileSync(componentPath, 'utf-8');

	it('renders failures through the shared support panel', () => {
		expect(componentSource).toMatch(/import TradeErrorPanel/);
		expect(componentSource).toMatch(/\{#if visibleTradeError\}/);
		expect(componentSource).toMatch(/<TradeErrorPanel error=\{visibleTradeError\}/);
	});

	it('prioritizes a current downstream API failure over stale execution and local failures', () => {
		expect(componentSource).toMatch(
			/selectVisibleTradeError\(\s*marketQuoteTradeError,\s*orderPreparationTradeError,\s*quoteCalculationTradeError/
		);
	});

	it('clears execution failure state when amount, side, token, or network changes', () => {
		expect(componentSource).toMatch(
			/selectedAmount\s*\|\|[\s\S]*orderSide\s*\|\|[\s\S]*assetToken\?\.address\s*\|\|[\s\S]*paymentToken\?\.address\s*\|\|[\s\S]*\$currentNetwork\?\.id/
		);
		expect(componentSource).toMatch(/serviceErrorClass\s*=\s*null/);
	});

	it('does not duplicate the terminal no-liquidity copy in MarketOrder', () => {
		expect(componentSource).not.toContain('No liquidity available right now for this size');
		expect(componentSource).not.toMatch(/\{#if noLiquidityError\}/);
	});
});
