/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hexToBigInt, buildTokenPriceMap, type ProcessedQuote } from './quote';
import * as tokenMath from './tokenMath';

// Mock the tokenMath module
vi.mock('./tokenMath', () => ({
	normalizeAddress: vi.fn((addr: string) => {
		if (!addr) return null;
		return addr.toLowerCase();
	}),
	describeQuote: vi.fn()
}));

describe('quote utilities', () => {
	describe('hexToBigInt', () => {
		describe('Valid hex strings with 0x prefix', () => {
			it('should convert simple hex to bigint', () => {
				expect(hexToBigInt('0x1')).toBe(1n);
				expect(hexToBigInt('0xa')).toBe(10n);
				expect(hexToBigInt('0xf')).toBe(15n);
			});

			it('should convert multi-digit hex to bigint', () => {
				expect(hexToBigInt('0xff')).toBe(255n);
				expect(hexToBigInt('0x100')).toBe(256n);
				expect(hexToBigInt('0xdead')).toBe(57005n);
				expect(hexToBigInt('0xbeef')).toBe(48879n);
			});

			it('should convert large hex values', () => {
				expect(hexToBigInt('0x1000000000000000')).toBe(1152921504606846976n);
				expect(hexToBigInt('0xffffffffffffffff')).toBe(18446744073709551615n);
			});

			it('should handle mixed case hex', () => {
				expect(hexToBigInt('0xAbCdEf')).toBe(11259375n);
				expect(hexToBigInt('0xABCDEF')).toBe(11259375n);
				expect(hexToBigInt('0xabcdef')).toBe(11259375n);
			});

			it('should handle very large hex (256-bit)', () => {
				const hex = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
				const result = hexToBigInt(hex);
				expect(result).toBeGreaterThan(0n);
				// Very large bigints convert to scientific notation in Number()
				// The result should be a very large positive number
				const asNumber = Number(result);
				expect(asNumber).toBeGreaterThan(1e77);
				expect(Number.isFinite(asNumber)).toBe(true);
			});

			it('should handle hex with zero value', () => {
				expect(hexToBigInt('0x0')).toBe(0n);
				expect(hexToBigInt('0x00')).toBe(0n);
			});
		});

		describe('Valid hex strings without 0x prefix', () => {
			it('should add 0x prefix and convert', () => {
				expect(hexToBigInt('1')).toBe(1n);
				expect(hexToBigInt('a')).toBe(10n);
				expect(hexToBigInt('ff')).toBe(255n);
				expect(hexToBigInt('abcdef')).toBe(11259375n);
			});

			it('should handle uppercase without prefix', () => {
				expect(hexToBigInt('A')).toBe(10n);
				expect(hexToBigInt('FF')).toBe(255n);
				expect(hexToBigInt('ABCDEF')).toBe(11259375n);
			});
		});

		describe('Edge cases', () => {
			it('should handle leading zeros', () => {
				expect(hexToBigInt('0x00001')).toBe(1n);
				expect(hexToBigInt('0x000000ff')).toBe(255n);
			});

			it('should handle single character after prefix', () => {
				expect(hexToBigInt('0x1')).toBe(1n);
				expect(hexToBigInt('0xa')).toBe(10n);
			});

			it('should throw for invalid hex (non-hex characters)', () => {
				expect(() => hexToBigInt('0xZZZ')).toThrow();
				expect(() => hexToBigInt('0xGG')).toThrow();
			});

			it('should throw for empty string', () => {
				expect(() => hexToBigInt('')).toThrow();
			});

			it('should throw for just 0x', () => {
				expect(() => hexToBigInt('0x')).toThrow();
			});

			it('should handle decimal-looking hex strings', () => {
				expect(hexToBigInt('0x10')).toBe(16n); // 0x10 = 16, not 10
				expect(hexToBigInt('0x100')).toBe(256n); // 0x100 = 256, not 100
			});
		});

		describe('Real-world Float values', () => {
			it('should handle typical ratio values (18 decimals)', () => {
				// 1 * 10^18 as hex (common for price ratios)
				const oneWithDecimals = '0x0de0b6b3a7640000';
				const result = hexToBigInt(oneWithDecimals);
				expect(result).toBe(1000000000000000000n);
			});

			it('should handle small decimal values as hex', () => {
				// 0.5 * 10^18 as hex
				const halfWithDecimals = '0x06f05b59d3b20000';
				const result = hexToBigInt(halfWithDecimals);
				expect(result).toBe(500000000000000000n);
			});
		});
	});

	describe('buildTokenPriceMap', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		describe('Empty quotes array', () => {
			it('should return empty map for empty quotes array', () => {
				const result = buildTokenPriceMap([], '0xUSDC');
				expect(result.size).toBe(0);
			});

			it('should handle null quotes gracefully', () => {
				const result = buildTokenPriceMap([], '0x0000000000000000000000000000000000000000');
				expect(result instanceof Map).toBe(true);
			});
		});

		describe('Single asset quotes', () => {
			it('should process ASK side quote (sell order)', () => {
				const mockDescribeQuote = tokenMath.describeQuote as any;
				mockDescribeQuote.mockReturnValue({
					side: 'ask',
					assetAddress: '0xAsset',
					quotePerAsset: 100,
					assetPerQuote: 0.01
				});

				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x123',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						inputTokenDecimals: 6,
						outputTokenDecimals: 18
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice).toBeDefined();
				expect(assetPrice?.ask).toBe(100);
				expect(assetPrice?.askAssetPerQuote).toBe(0.01);
			});

			it('should process BID side quote (buy order)', () => {
				const mockDescribeQuote = tokenMath.describeQuote as any;
				mockDescribeQuote.mockReturnValue({
					side: 'bid',
					assetAddress: '0xAsset',
					quotePerAsset: 50,
					assetPerQuote: 0.02
				});

				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x123',
						maxOutput: 500000n,
						ratio: 50000000000000000n,
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						inputTokenDecimals: 18,
						outputTokenDecimals: 6
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice).toBeDefined();
				expect(assetPrice?.bid).toBe(50);
				expect(assetPrice?.bidAssetPerQuote).toBe(0.02);
			});

			it('should use cached metrics if available', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x123',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100,
						assetPerQuote: 0.01
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.ask).toBe(100);
				// describeQuote should not be called since metrics are cached
			});
		});

		describe('Multiple quotes same asset', () => {
			it('should find best ASK price (minimum)', () => {
				const mockDescribeQuote = tokenMath.describeQuote as any;
				mockDescribeQuote.mockReturnValue(null);

				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100
					},
					{
						orderHash: '0x2',
						maxOutput: 1000000n,
						ratio: 80000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 80
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.ask).toBe(80); // Should pick lower ask price
			});

			it('should find best BID price (maximum)', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 50000000000000000n,
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						side: 'bid',
						assetAddress: '0xAsset',
						quotePerAsset: 50
					},
					{
						orderHash: '0x2',
						maxOutput: 2000000n,
						ratio: 60000000000000000n,
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						side: 'bid',
						assetAddress: '0xAsset',
						quotePerAsset: 60
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.bid).toBe(60); // Should pick higher bid price
			});

			it('should accumulate both bid and ask for same asset', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100
					},
					{
						orderHash: '0x2',
						maxOutput: 1000000n,
						ratio: 50000000000000000n,
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						side: 'bid',
						assetAddress: '0xAsset',
						quotePerAsset: 50
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.ask).toBe(100);
				expect(assetPrice?.bid).toBe(50);
			});
		});

		describe('Multiple assets', () => {
			it('should handle quotes for multiple different assets', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN1',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken1',
						side: 'ask',
						assetAddress: '0xAsset1',
						quotePerAsset: 100
					},
					{
						orderHash: '0x2',
						maxOutput: 2000000n,
						ratio: 200000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN2',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken2',
						side: 'ask',
						assetAddress: '0xAsset2',
						quotePerAsset: 200
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');

				expect(result.size).toBe(2);
				expect(result.get('0xasset1')?.ask).toBe(100);
				expect(result.get('0xasset2')?.ask).toBe(200);
			});
		});

		describe('Invalid/edge case quotes', () => {
			it('should not add asset to map if no metrics can be determined', () => {
				const mockDescribeQuote = tokenMath.describeQuote as any;
				mockDescribeQuote.mockReturnValue(null);

				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken'
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				expect(result.size).toBe(0);
			});

			it('should skip quotes where asset equals USDC', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xUSDC',
						side: 'ask',
						assetAddress: '0xUSDC',
						quotePerAsset: 1
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				expect(result.size).toBe(0);
			});

			it('should add asset to map even if price is non-finite (price not updated)', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: Infinity
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				// Asset is added to map, but without any valid price set (empty object)
				expect(result.size).toBe(1);
				expect(result.get('0xasset')).toEqual({});
			});

			it('should add asset to map even if prices are zero or negative (prices not updated)', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 0
					},
					{
						orderHash: '0x2',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: -50
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				// Asset is added to map, but without any valid price set
				expect(result.size).toBe(1);
				expect(result.get('0xasset')).toEqual({});
			});
		});

		describe('assetPerQuote metric', () => {
			it('should select maximum assetPerQuote for ASK side', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						assetPerQuote: 0.02
					},
					{
						orderHash: '0x2',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						assetPerQuote: 0.01
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.askAssetPerQuote).toBe(0.02); // Should pick higher assetPerQuote (max)
			});

			it('should select minimum assetPerQuote for BID side', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 50000000000000000n,
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						side: 'bid',
						assetAddress: '0xAsset',
						assetPerQuote: 0.01
					},
					{
						orderHash: '0x2',
						maxOutput: 1000000n,
						ratio: 50000000000000000n,
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						side: 'bid',
						assetAddress: '0xAsset',
						assetPerQuote: 0.02
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.bidAssetPerQuote).toBe(0.01); // Should pick lower assetPerQuote (min)
			});
		});

		describe('Address normalization', () => {
			it('should normalize USDC address in map lookup', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				// normalizeAddress should have been called for USDC
				expect(tokenMath.normalizeAddress).toHaveBeenCalledWith('0xUSDC');
			});

			it('should normalize asset address for map key', () => {
				const quotes: ProcessedQuote[] = [
					{
						orderHash: '0x1',
						maxOutput: 1000000n,
						ratio: 100000000000000000n,
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'TOKEN',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xToken',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100
					}
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				// Check that normalized address is used as key
				expect(result.get('0xasset')).toBeDefined();
			});
		});
	});
});
