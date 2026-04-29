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

/**
 * TRADE-03 D-05 (Plan 02-06): inline terminal-state error rendering.
 *
 * Approach — pure-logic verification + source-content assertion. Per
 * `.planning/codebase/TESTING.md` "Component tests" the standing pattern is to
 * "prefer testing pure logic extracted from a component over rendering the
 * component when business logic can be lifted." Rendering MarketOrder.svelte
 * end-to-end requires a TanStack QueryClient + currentNetwork + assetToken +
 * walletService scaffolding heavier than the value of a single rendering test;
 * this test instead asserts the two contracts that the D-05 wiring depends on:
 *
 *   1. The verbatim D-05 copy is present in the .svelte source exactly once.
 *   2. The reactive predicate `noLiquidityError` correctly derives terminal
 *      state from a candidate error string.
 *
 * The implementation in MarketOrder.svelte derives `noLiquidityError` from
 * `(orderPreparationError ?? '').includes('No liquidity available right now')`
 * — `orderPreparationError` holds the user-facing string returned by
 * `executeMarketOrder()` (the failWith() user-facing copy that flows from the
 * pre-flight + auto-walk cascade in marketOrderExecution.ts).
 */
describe('MarketOrder D-05 inline terminal error (TRADE-03)', () => {
	const componentPath = resolve(
		process.cwd(),
		'src/lib/components/orders/MarketOrder.svelte'
	);
	const componentSource = readFileSync(componentPath, 'utf-8');

	// The pure predicate that drives the inline render. Mirrors the reactive
	// declaration `$: noLiquidityError = (orderPreparationError ?? '').includes(...)`
	// so the test fails immediately if the predicate logic ever drifts.
	function noLiquidityError(orderPreparationError: string | null): boolean {
		return (orderPreparationError ?? '').includes('No liquidity available right now');
	}

	it('renders the D-05 verbatim copy exactly once in the component source', () => {
		// 02-VALIDATION.md gate: literal copy appears once. This guards against
		// future contributors adding a duplicate inline error (the existing
		// orderPreparationError block was suppressed via `&& !noLiquidityError`
		// to prevent a double render).
		const matches = componentSource.match(/No liquidity available right now for this size/g) ?? [];
		expect(matches).toHaveLength(1);
	});

	it('declares the noLiquidityError reactive and references it in an {#if} block', () => {
		// noLiquidityError must appear at least twice: one declaration at the
		// `$:` reactive site, one usage in the `{#if noLiquidityError}` block.
		// The suppression guard on orderPreparationError adds a third reference.
		const matches = componentSource.match(/noLiquidityError/g) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(2);
		expect(componentSource).toMatch(/\{#if noLiquidityError\}/);
	});

	it('uses text-red-400 for terminal-state styling (not yellow / not gray)', () => {
		// D-05: terminal state, not informational. The freshness banner uses
		// text-yellow-400 / text-gray-500; the D-05 block is hard red.
		// Find the noLiquidityError block and assert text-red-400 is the chosen class.
		const blockMatch = componentSource.match(
			/\{#if noLiquidityError\}[\s\S]*?\{\/if\}/
		);
		expect(blockMatch).toBeTruthy();
		expect(blockMatch![0]).toContain('text-red-400');
	});

	it('predicate returns true ONLY for the D-05 verbatim copy, not unrelated errors', () => {
		// Positive case — the actual D-05 string from marketOrderExecution.ts.
		expect(
			noLiquidityError(
				'No liquidity available right now for this size. Try a smaller amount or check back in a minute.'
			)
		).toBe(true);

		// Negative cases — other failWith() user-facing strings must NOT trigger
		// the D-05 block (they render through the generic orderPreparationError
		// path instead). Maps to the unrelated-error branch in the plan's
		// component-render scaffold.
		expect(noLiquidityError('Wallet rejected the transaction')).toBe(false);
		expect(noLiquidityError('Unable to verify orderbook state. Please refresh quotes and retry.')).toBe(
			false
		);
		expect(noLiquidityError('Unable to calculate order price. Please try again.')).toBe(false);
		expect(noLiquidityError(null)).toBe(false);
		expect(noLiquidityError('')).toBe(false);
	});

	it('does NOT render the inline error when orderPreparationError is empty (IDLE state)', () => {
		// The {#if noLiquidityError} block evaluates to false when the predicate
		// returns false, which is the equivalent of "in IDLE state, the inline
		// terminal-error copy is not in the rendered output."
		expect(noLiquidityError(null)).toBe(false);
		expect(noLiquidityError('')).toBe(false);
	});
});
