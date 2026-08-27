import { describe, expect, it } from 'vitest';
import { Float } from '@rainlanguage/float';
import { scaleAmount, walkOrderbook, type ProcessedQuote } from '$lib/utils/orderbook';

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
		// Test that respects individual quote liquidity limits when filling orders
		const quotes: ProcessedQuote[] = [
			{
				orderHash: '0x1',
				maxOutput: fixedToFloatHex(ONE), // Can provide 1 quote token (1 asset worth at price 1)
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'ASSET',
				outputTokenSymbol: 'QUOTE',
				inputTokenAddress: '0xasset',
				outputTokenAddress: '0xquote',
				inputIOIndex: 0,
				outputIOIndex: 0,
				inputTokenDecimals: 18,
				outputTokenDecimals: 18,
				quotePerAsset: 1 // Price: 1 QUOTE per asset
			},
			{
				orderHash: '0x2',
				maxOutput: fixedToFloatHex(2n * ONE), // Can provide 2 quote tokens (1 asset worth at price 2)
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'ASSET',
				outputTokenSymbol: 'QUOTE',
				inputTokenAddress: '0xasset',
				outputTokenAddress: '0xquote',
				inputIOIndex: 0,
				outputIOIndex: 0,
				inputTokenDecimals: 18,
				outputTokenDecimals: 18,
				quotePerAsset: 2 // Price: 2 QUOTE per asset
			}
		];

		const selectedAmount = 2n * ONE; // Want to sell 2 assets
		const result = walkOrderbook({
			quotes,
			orderSide: 'Sell',
			selectedAmount,
			assetDecimals: 18,
			paymentDecimals: 18
		});

		// Need both quotes to fill the order
		expect(result.fills.length).toBe(2);
		expect(result.fills[0].quote.orderHash).toBe('0x1');
		expect(result.fills[1].quote.orderHash).toBe('0x2');
		expect(result.fills[0].assetAmount).toBe(ONE);
		expect(result.fills[1].assetAmount).toBe(ONE);
		// Total quantity should be 2 assets
		expect(result.outputAmountGiven).toBe(2n * ONE);
		// Average of 1 asset at price 1 and 1 asset at price 2 = (1 + 2) / 2 = 1.5
		expect(result.ioRatio).toBeCloseTo(1.5, 6);
	});

	it('keeps sell-side availability scaled to 1e18 even when quote decimals differ', () => {
		const quotes: ProcessedQuote[] = [
			{
				orderHash: '0xdecimals',
				maxOutput: fixedToFloatHex(26n * 10n ** 6n, 6), // 26 quote tokens with 6 decimals
				ratio: ONE_FLOAT_HEX,
				inputTokenSymbol: 'ASSET',
				outputTokenSymbol: 'QUOTE6',
				inputTokenAddress: '0xasset',
				outputTokenAddress: '0xquote6',
				inputIOIndex: 0,
				outputIOIndex: 0,
				inputTokenDecimals: 18,
				outputTokenDecimals: 6,
				quotePerAsset: 2
			}
		];

		const selectedAmount = ONE; // Want to sell 1 asset
		const result = walkOrderbook({
			quotes,
			orderSide: 'Sell',
			selectedAmount,
			assetDecimals: 18,
			paymentDecimals: 6
		});

		expect(result.fills).toHaveLength(1);
		expect(result.fills[0].assetAmount).toBe(ONE);
		expect(result.outputAmountGiven).toBe(ONE);
		expect(result.ioRatio).toBeCloseTo(2, 6);
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
				inputIOIndex: 0,
				outputIOIndex: 0,
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
				inputIOIndex: 0,
				outputIOIndex: 0,
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
			assetDecimals: 18,
			paymentDecimals: 18
		});

		// Quote 1 can provide 1 asset, Quote 2 can provide 1.5, together they fill 2.5
		expect(result.fills.length).toBe(2);
		expect(result.inputAmountFilled).toBe((5n * ONE) / 2n); // 2.5 * ONE
		expect(result.fills[0].assetAmount).toBe(ONE); // 1 token from quote 1
		expect(result.fills[1].assetAmount).toBe(ONE + half); // 1.5 tokens from quote 2
		// Buying 1 at 1.5 QUOTE = 1.5, buying 1.5 at 2 QUOTE = 3, total 4.5 QUOTE for 2.5 assets = 1.8 price; ioRatio = 2.5/4.5 = 0.556
		expect(result.ioRatio).toBeCloseTo(0.5555555555555556, 6);
	});
});
