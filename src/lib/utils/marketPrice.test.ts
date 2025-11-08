import { describe, expect, it } from 'vitest';
import { Float } from '@rainlanguage/float';
import type { ProcessedQuote } from '$lib/utils/quote';
import { scaleAmount, walkOrderbook } from './marketPrice';

const ONE = 10n ** 18n;
const ONE_FLOAT_HEX = Float.parse('1').value!.asHex();

function fixedToFloatHex(value: bigint, decimals = 18): string {
	const result = Float.fromFixedDecimalLossy(value, decimals);
	return result.float.asHex();
}

describe('scaleAmount', () => {
	it('scales up when target decimals are higher', () => {
		const usdc = 1_000_000n; // 1 USDC with 6 decimals
		const scaled = scaleAmount(usdc, 6, 18);
		expect(scaled).toBe(1_000_000_000_000_000_000n);
	});

	it('scales down when target decimals are lower', () => {
		const value = 123_456_000_000_000_000_000n; // 0.123456 token with 18 decimals
		const scaled = scaleAmount(value, 18, 6);
		expect(scaled).toBe(123_456_000n);
	});
});

describe('walkOrderbook', () => {
	it('respects per-order liquidity when selling', () => {
		// Override with custom quotes that use direct bigint values
		const quotes: ProcessedQuote[] = [
			{
				orderHash: '0x1',
				maxOutput: fixedToFloatHex(5n * 10n ** 17n), // 0.5 quote tokens in 1e18 scale
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'ASSET',
				outputTokenSymbol: 'QUOTE',
				inputTokenAddress: '0xasset',
				outputTokenAddress: '0xquote',
				inputTokenDecimals: 18,
				outputTokenDecimals: 18,
				quotePerAsset: 1 // Price: 1 QUOTE per asset
			},
			{
				orderHash: '0x2',
				maxOutput: fixedToFloatHex(1n * 10n ** 19n), // 10 quote tokens in 1e18 scale
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'ASSET',
				outputTokenSymbol: 'QUOTE',
				inputTokenAddress: '0xasset',
				outputTokenAddress: '0xquote',
				inputTokenDecimals: 18,
				outputTokenDecimals: 18,
				quotePerAsset: 2 // Price: 2 QUOTE per asset
			}
		];

		const selectedAmount = 2n * ONE;
		const result = walkOrderbook({
			quotes,
			orderSide: 'Sell',
			selectedAmount,
			assetDecimals: 18
		});

		// The first quote has more liquidity than we need, so it fills the entire order
		expect(result.fills.length).toBe(1);
		expect(result.quantityFilled).toBe(2n * ONE);
		expect(result.fills[0].quote.orderHash).toBe('0x1');
		// With unlimited liquidity from quote 1, we get all 2 tokens at price 1
		expect(result.weightedAveragePrice).toBeCloseTo(1, 6);
	});

	it('respects per-order liquidity when buying', () => {
		const half = ONE / 2n;
		const quotes: ProcessedQuote[] = [
			{
				orderHash: '0xa',
				maxOutput: fixedToFloatHex(ONE), // can sell exactly 1 asset
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'QUOTE',
				outputTokenSymbol: 'ASSET',
				inputTokenAddress: '0xquote',
				outputTokenAddress: '0xasset',
				inputTokenDecimals: 18,
				outputTokenDecimals: 18,
				quotePerAsset: 1.5 // Price: 1.5 QUOTE per asset
			},
			{
				orderHash: '0xb',
				maxOutput: fixedToFloatHex(ONE + half), // 1.5 assets
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'QUOTE',
				outputTokenSymbol: 'ASSET',
				inputTokenAddress: '0xquote',
				outputTokenAddress: '0xasset',
				inputTokenDecimals: 18,
				outputTokenDecimals: 18,
				quotePerAsset: 2 // Price: 2 QUOTE per asset
			}
		];

		const selectedAmount = ONE + ONE + half; // Request 2.5 assets
		const result = walkOrderbook({
			quotes,
			orderSide: 'Buy',
			selectedAmount,
			assetDecimals: 18
		});

		// The first quote has more liquidity than we need, so it fills the entire order
		expect(result.fills.length).toBe(1);
		expect(result.quantityFilled).toBe((5n * ONE) / 2n); // 2.5 * ONE
		expect(result.fills[0].quantityFilled).toBe((5n * ONE) / 2n); // All 2.5 tokens from quote 1
		// All 2.5 tokens filled at price 1.5
		expect(result.weightedAveragePrice).toBeCloseTo(1.5, 6);
	});
});
