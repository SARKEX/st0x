/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hexToBigInt } from '$lib/utils/orderbook';
import { buildTokenPriceMap, type ProcessedQuote } from '$lib/api/orders';
import * as tokenMath from '$lib/utils/tokenMath';

// Helper to convert bigint to hex-encoded Float string for tests
function bigintToHexFloat(value: bigint): string {
	// Pad the value to 64 hex chars (32 bytes)
	const hex = value.toString(16).padStart(64, '0');
	return '0x' + hex;
}

// Mock the tokenMath module
vi.mock('$lib/utils/tokenMath', () => ({
	normalizeAddress: vi.fn((addr: string) => {
		if (!addr) return null;
		return addr.toLowerCase();
	}),
	describeQuote: vi.fn()
}));

// Helper to build quote test data
function buildQuote(overrides: Partial<ProcessedQuote>): ProcessedQuote {
	return {
		orderHash: '0x123',
		maxOutput: bigintToHexFloat(1000000n),
		ratio: bigintToHexFloat(100000000000000000n),
		inputTokenSymbol: 'USDC',
		outputTokenSymbol: 'TOKEN',
		inputTokenAddress: '0xUSDC',
		outputTokenAddress: '0xToken',
		inputIOIndex: 0,
		outputIOIndex: 0,
		inputVaultId: '0x01',
		outputVaultId: '0x02',
		inputTokenDecimals: 6,
		outputTokenDecimals: 18,
		...overrides
	};
}

describe('quote utilities', () => {
	describe('hexToBigInt', () => {
		// Valid hex strings with 0x prefix
		it.each([
			['0x1', 1n],
			['0xa', 10n],
			['0xf', 15n],
			['0xff', 255n],
			['0x100', 256n],
			['0xdead', 57005n],
			['0xbeef', 48879n],
			['0x1000000000000000', 1152921504606846976n],
			['0xffffffffffffffff', 18446744073709551615n],
			// Mixed case
			['0xAbCdEf', 11259375n],
			['0xABCDEF', 11259375n],
			['0xabcdef', 11259375n],
			// Zero values
			['0x0', 0n],
			['0x00', 0n],
			// Leading zeros
			['0x00001', 1n],
			['0x000000ff', 255n],
			// Decimal-looking hex
			['0x10', 16n],
			['0x100', 256n],
			// Real-world Float values
			['0x0de0b6b3a7640000', 1000000000000000000n], // 1 * 10^18
			['0x06f05b59d3b20000', 500000000000000000n] // 0.5 * 10^18
		])('should convert valid hex %s to %s', (hex, expected) => {
			expect(hexToBigInt(hex)).toBe(expected);
		});

		// Valid hex strings without 0x prefix
		it.each([
			['1', 1n],
			['a', 10n],
			['A', 10n],
			['ff', 255n],
			['FF', 255n],
			['abcdef', 11259375n],
			['ABCDEF', 11259375n]
		])('should add 0x prefix and convert %s to %s', (hex, expected) => {
			expect(hexToBigInt(hex)).toBe(expected);
		});

		// Large hex values
		it('should handle very large hex (256-bit)', () => {
			const hex = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
			const result = hexToBigInt(hex);
			expect(result).toBeGreaterThan(0n);
			const asNumber = Number(result);
			expect(asNumber).toBeGreaterThan(1e77);
			expect(Number.isFinite(asNumber)).toBe(true);
		});

		// Invalid inputs should throw
		it.each([['0xZZZ'], ['0xGG']])('should throw for invalid hex: %s', (hex) => {
			expect(() => hexToBigInt(hex)).toThrow();
		});

		it.each([[''], ['0x']])('should throw for empty/invalid input: %s', (hex) => {
			expect(() => hexToBigInt(hex)).toThrow();
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
		});

		describe('Single asset quotes', () => {
			it.each([
				[
					'ASK side quote (sell order)',
					'ask',
					{ side: 'ask', assetAddress: '0xAsset', quotePerAsset: 100 },
					{ ask: 100 }
				],
				[
					'BID side quote (buy order)',
					'bid',
					{ side: 'bid', assetAddress: '0xAsset', quotePerAsset: 50 },
					{ bid: 50 }
				]
			])('should process %s', (desc, side, mockReturn, expected) => {
				const mockDescribeQuote = tokenMath.describeQuote as any;
				mockDescribeQuote.mockReturnValue(mockReturn);

				const quotes: ProcessedQuote[] = [
					buildQuote(
						side === 'ask'
							? {}
							: {
									inputTokenSymbol: 'TOKEN',
									outputTokenSymbol: 'USDC',
									inputTokenAddress: '0xToken',
									outputTokenAddress: '0xUSDC'
								}
					)
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice).toBeDefined();
				expect(assetPrice).toMatchObject(expected);
			});

			it('should use cached metrics if available', () => {
				const quotes: ProcessedQuote[] = [
					buildQuote({
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100,
					})
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				const assetPrice = result.get('0xasset');

				expect(assetPrice?.ask).toBe(100);
			});
		});

		describe('Multiple quotes same asset', () => {
			beforeEach(() => {
				const mockDescribeQuote = tokenMath.describeQuote as any;
				mockDescribeQuote.mockReturnValue(null);
			});

			it.each([
				[
					'should find best ASK price (minimum)',
					'ask',
					[
						{ orderHash: '0x1', side: 'ask', assetAddress: '0xAsset', quotePerAsset: 100 },
						{ orderHash: '0x2', side: 'ask', assetAddress: '0xAsset', quotePerAsset: 80 }
					],
					80
				],
				[
					'should find best BID price (maximum)',
					'bid',
					[
						{
							orderHash: '0x1',
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
							inputTokenSymbol: 'TOKEN',
							outputTokenSymbol: 'USDC',
							inputTokenAddress: '0xToken',
							outputTokenAddress: '0xUSDC',
							side: 'bid',
							assetAddress: '0xAsset',
							quotePerAsset: 60
						}
					],
					60
				]
			])('%s', (desc, side: string, quoteOverrides: any[], expectedPrice: number) => {
				const quotes: ProcessedQuote[] = quoteOverrides.map((overrides) => buildQuote(overrides));
				const result = buildTokenPriceMap(quotes, '0xUSDC');
				expect(result.get('0xasset')?.[side as 'ask' | 'bid']).toBe(expectedPrice);
			});

			it('should accumulate both bid and ask for same asset', () => {
				const quotes: ProcessedQuote[] = [
					buildQuote({
						orderHash: '0x1',
						side: 'ask',
						assetAddress: '0xAsset',
						quotePerAsset: 100
					}),
					buildQuote({
						orderHash: '0x2',
						inputTokenSymbol: 'TOKEN',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xToken',
						outputTokenAddress: '0xUSDC',
						side: 'bid',
						assetAddress: '0xAsset',
						quotePerAsset: 50
					})
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
					buildQuote({
						orderHash: '0x1',
						outputTokenSymbol: 'TOKEN1',
						outputTokenAddress: '0xToken1',
						side: 'ask',
						assetAddress: '0xAsset1',
						quotePerAsset: 100
					}),
					buildQuote({
						orderHash: '0x2',
						maxOutput: bigintToHexFloat(2000000n),
						ratio: bigintToHexFloat(200000000000000000n),
						outputTokenSymbol: 'TOKEN2',
						outputTokenAddress: '0xToken2',
						side: 'ask',
						assetAddress: '0xAsset2',
						quotePerAsset: 200
					})
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

				const quotes: ProcessedQuote[] = [buildQuote({})];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				expect(result.size).toBe(0);
			});

			it('should skip quotes where asset equals USDC', () => {
				const quotes: ProcessedQuote[] = [
					buildQuote({
						inputTokenSymbol: 'USDC',
						outputTokenSymbol: 'USDC',
						inputTokenAddress: '0xUSDC',
						outputTokenAddress: '0xUSDC',
						side: 'ask',
						assetAddress: '0xUSDC',
						quotePerAsset: 1
					})
				];

				const result = buildTokenPriceMap(quotes, '0xUSDC');
				expect(result.size).toBe(0);
			});
		});


		describe('Address normalization', () => {
			it.each([
				[
					'should normalize USDC address in map lookup',
					() => {
						const quotes: ProcessedQuote[] = [
							buildQuote({
								side: 'ask',
								assetAddress: '0xAsset',
								quotePerAsset: 100
							})
						];

						const result = buildTokenPriceMap(quotes, '0xUSDC');
						expect(tokenMath.normalizeAddress).toHaveBeenCalledWith('0xUSDC');
					}
				],
				[
					'should normalize asset address for map key',
					() => {
						const quotes: ProcessedQuote[] = [
							buildQuote({
								side: 'ask',
								assetAddress: '0xAsset',
								quotePerAsset: 100
							})
						];

						const result = buildTokenPriceMap(quotes, '0xUSDC');
						expect(result.get('0xasset')).toBeDefined();
					}
				]
			])('%s', (desc, testFn: () => void) => {
				testFn();
			});
		});
	});
});
