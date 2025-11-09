

import { Float } from '@rainlanguage/float';
import { describe, it, expect } from 'vitest';
import {
	normalizeAddress,
	addressesEqual,
	toBigInt,
	absBigInt,
	toDecimal,
	computePrice,
	classifyFlow,
	parseTradeAmounts,
	ratioToNumber,
	describeQuote,
	analyzeTrade,
	createTokenLookup,
	type PairDescriptor,
	type TokenDescriptor
} from './tokenMath';

function floatHex(value: string): string {
	const parsed = Float.parse(value);
	if (parsed.error || !parsed.value) {
		throw new Error(`Failed to prepare Float hex for ${value}`);
	}
	return parsed.value.asHex();
}

describe('tokenMath', () => {
	describe('normalizeAddress', () => {
		it.each([
			['0xABCDEF123456', '0xabcdef123456'],
			['0xABCD', '0xabcd'],
			['  0xABCDEF  ', '0xabcdef'],
			['\t0xABCDEF\n', '0xabcdef']
		])('should normalize %s to %s', (input, expected) => {
			expect(normalizeAddress(input)).toBe(expected);
		});

		it.each([
			['', null],
			['   ', null],
			['\t\n', null],
			[null, null],
			[undefined, null]
		])('should return null for invalid input: %s', (input, expected) => {
			expect(normalizeAddress(input)).toBe(expected);
		});
	});

	describe('addressesEqual', () => {
		it.each([
			['0xABCDEF', '0xabcdef', true],
			['  0xABCDEF  ', '0xabcdef', true],
			['0xAAAAA', '0xBBBBB', false]
		])('should compare %s and %s: %s', (addr1, addr2, expected) => {
			expect(addressesEqual(addr1, addr2)).toBe(expected);
		});

		it.each([
			['0xABCDEF', null],
			[null, '0xABCDEF'],
			[null, undefined]
		])('should return false for null/undefined: %s, %s', (addr1, addr2) => {
			expect(addressesEqual(addr1, addr2)).toBe(false);
		});
	});

	describe('toBigInt', () => {
		it.each([
			[123n, 123n],
			['123', 123n],
			['0', 0n],
			[123, 123n],
			[123.9, 123n],
			[0, 0n],
			['  123  ', 123n]
		])('should convert %s to %s', (input, expected) => {
			expect(toBigInt(input)).toBe(expected);
		});

		it.each([
			[null],
			[undefined],
			[''],
			['   '],
			['invalid'],
			[NaN],
			[Infinity]
		])('should return null for invalid input: %s', (input) => {
			expect(toBigInt(input)).toBeNull();
		});
	});

	describe('absBigInt', () => {
		it.each([
			[123n, 123n],
			[-123n, 123n],
			[0n, 0n]
		])('should return absolute value: abs(%s) = %s', (input, expected) => {
			expect(absBigInt(input)).toBe(expected);
		});
	});

	describe('toDecimal', () => {
		it.each([
			[1000000000000000000n, 18, 1],
			[5000000000000000000n, 18, 5],
			[1000000n, 6, 1]
		])('should convert %s with %s decimals to %s', (value, decimals, expected) => {
			expect(toDecimal(value, decimals)).toBe(expected);
		});

		it.each([
			[null, 18, null],
			[undefined, 18, null]
		])('should return null for invalid inputs: %s', (value, decimals, expected) => {
			expect(toDecimal(value, decimals)).toBe(expected);
		});

		it('should handle absolute option for negative numbers', () => {
			// Test that absolute: true converts negative values to positive
			const negativeResult = toDecimal(-1000000000000000000n, 18, { absolute: true });
			expect(negativeResult).toBe(1);
		});

		it.each([
			[null, 18, { fallback: 0 }, 0],
			['invalid', 18, { fallback: -1 }, -1]
		])('should use fallback value for invalid conversions', (value, decimals, options, expected) => {
			expect(toDecimal(value, decimals, options)).toBe(expected);
		});

		it.each([
			['100', 0, 100],
			['1.5', 0, 1.5]
		])('should handle decimal strings: %s', (value, decimals, expected) => {
			expect(toDecimal(value, decimals)).toBe(expected);
		});

		it.each([
			[-1],
			[31],
			[NaN]
		])('should validate decimals parameter: %s', (decimals) => {
			expect(toDecimal(1000000000000000000n, decimals)).toBeNull();
		});

		it('should return null for astronomically large values', () => {
			const maxWei = BigInt('1000000000000000000000000'); // 1e24
			expect(toDecimal(maxWei + 1n, 18)).toBeNull();
		});

		it('should decode Float hex values directly', () => {
			const floatResult = Float.parse('123.456');
			if (floatResult.error || !floatResult.value) {
				throw new Error('Failed to prepare Float test value');
			}
			const hexValue = floatResult.value.asHex();
			expect(toDecimal(hexValue, 18, { absolute: true })).toBeCloseTo(123.456, 6);
		});
	});

	describe('computePrice', () => {
		it.each([
			[100, 10, 10],
			[50, 5, 10],
			[1, 1, 1]
		])('should compute price: %s / %s = %s', (quote, tokens, expected) => {
			expect(computePrice(quote, tokens)).toBe(expected);
		});

		it.each([
			[null, 10],
			[100, null],
			[undefined, 10],
			[100, undefined],
			[NaN, 10],
			[100, Infinity],
			[Infinity, 10],
			[0, 10],
			[100, 0],
			[-10, 10],
			[10, -10]
		])('should return null for invalid inputs: computePrice(%s, %s)', (quote, tokens) => {
			expect(computePrice(quote, tokens)).toBeNull();
		});
	});

	describe('classifyFlow', () => {
		const pair: PairDescriptor = {
			asset: { address: '0xASSET', decimals: 18 },
			quote: { address: '0xQUOTE', decimals: 6 }
		};

		it.each([
			['0xQUOTE', '0xASSET', 'bid'],
			['0xquote', '0xasset', 'bid'], // case insensitive
			['0xASSET', '0xQUOTE', 'ask']
		])('should classify flow: %s -> %s = %s', (input, output, expected) => {
			expect(classifyFlow(input, output, pair)).toBe(expected);
		});

		it.each([
			['0xOTHER', '0xASSET'],
			['0xASSET', '0xOTHER'],
			[null, '0xASSET'],
			['0xQUOTE', null]
		])('should return null for invalid flows: %s -> %s', (input, output) => {
			expect(classifyFlow(input, output, pair)).toBeNull();
		});
	});

	describe('parseTradeAmounts', () => {
		const pair: PairDescriptor = {
			asset: { address: '0xASSET', decimals: 18 },
			quote: { address: '0xQUOTE', decimals: 6 }
		};

		it('should parse BID trade (buying asset with quote)', () => {
			const trade = {
				inputVaultBalanceChange: {
					amount: '1000000', // 1 USDC (6 decimals)
					vault: {
						token: { address: '0xQUOTE', decimals: 6 }
					}
				},
				outputVaultBalanceChange: {
					amount: '1000000000000000000', // 1 ASSET (18 decimals)
					vault: {
						token: { address: '0xASSET', decimals: 18 }
					}
				}
			};

			const result = parseTradeAmounts(trade, pair);
			expect(result).not.toBeNull();
			expect(result?.side).toBe('bid');
			expect(result?.quote).toBe(1);
			expect(result?.tokens).toBe(1);
			expect(result?.price).toBe(1);
		});

		it('should parse ASK trade (selling asset for quote)', () => {
			const trade = {
				inputVaultBalanceChange: {
					amount: '1000000000000000000', // 1 ASSET (18 decimals)
					vault: {
						token: { address: '0xASSET', decimals: 18 }
					}
				},
				outputVaultBalanceChange: {
					amount: '5000000', // 5 USDC (6 decimals)
					vault: {
						token: { address: '0xQUOTE', decimals: 6 }
					}
				}
			};

			const result = parseTradeAmounts(trade, pair);
			expect(result).not.toBeNull();
			expect(result?.side).toBe('ask');
			expect(result?.tokens).toBe(1);
			expect(result?.quote).toBe(5);
			expect(result?.price).toBe(5);
		});

		it.each([
			[null],
			[undefined]
		])('should return null for invalid trades: %s', (trade) => {
			expect(parseTradeAmounts(trade, pair)).toBeNull();
		});

		it('should return null if amounts cannot be parsed', () => {
			const trade = {
				inputVaultBalanceChange: {
					amount: null,
					vault: { token: { address: '0xQUOTE', decimals: 6 } }
				},
				outputVaultBalanceChange: {
					amount: '1000000000000000000',
					vault: { token: { address: '0xASSET', decimals: 18 } }
				}
			};

			expect(parseTradeAmounts(trade, pair)).toBeNull();
		});
	});

	describe('ratioToNumber', () => {
		it.each([
			['1', 1],
			['5', 5],
			['1.5', 1.5]
		])('should convert Float hex ratio %s to number', (value, expected) => {
			expect(ratioToNumber(floatHex(value))).toBeCloseTo(expected, 6);
		});

		it.each([
			[null],
			[undefined]
		])('should return null for %s', (value) => {
			expect(ratioToNumber(value)).toBeNull();
		});

		it('should return null for non-positive values', () => {
			const zeroHex = floatHex('0');
			expect(ratioToNumber(zeroHex)).toBeNull();
		});

		it('should return null for excessively large ratios', () => {
			const hugeHex = floatHex('1000000000000000'); // 1e15
			expect(ratioToNumber(hugeHex)).toBeNull();
		});
	});

	describe('describeQuote', () => {
		const quoteAddress = '0xUSDC';

		it('should describe ASK quote (USDC -> TOKEN)', () => {
			const quote = {
				inputTokenAddress: '0xUSDC',
				outputTokenAddress: '0xTOKEN',
				ratio: floatHex('2') // 2 USDC per TOKEN
			};

			const result = describeQuote(quote, quoteAddress);
			expect(result).not.toBeNull();
			expect(result?.side).toBe('ask');
			expect(result?.quotePerAsset).toBe(2);
			expect(result?.assetPerQuote).toBe(0.5);
		});

		it('should describe BID quote (TOKEN -> USDC)', () => {
			const quote = {
				inputTokenAddress: '0xTOKEN',
				outputTokenAddress: '0xUSDC',
				ratio: floatHex('0.5') // 0.5 USDC per TOKEN (inverted)
			};

			const result = describeQuote(quote, quoteAddress);
			expect(result).not.toBeNull();
			expect(result?.side).toBe('bid');
			expect(result?.quotePerAsset).toBe(2); // 1 / 0.5 = 2
		});

		it.each([
			[
				'both same token',
				{ inputTokenAddress: '0xUSDC', outputTokenAddress: '0xUSDC', ratio: floatHex('1') }
			],
			[
				'empty input address',
				{ inputTokenAddress: '', outputTokenAddress: '0xTOKEN', ratio: floatHex('1') }
			]
		])('should return null for invalid quotes: %s', (desc, quote) => {
			expect(describeQuote(quote, quoteAddress)).toBeNull();
		});
	});

	describe('createTokenLookup', () => {
		it('should create a lookup function that finds tokens by address', () => {
			const tokens: TokenDescriptor[] = [
				{ address: '0xABCD', decimals: 18, symbol: 'ABCD' },
				{ address: '0x1234', decimals: 6, symbol: 'USDC' }
			];

			const lookup = createTokenLookup(tokens);
			expect(lookup('0xABCD')).toEqual(tokens[0]);
			expect(lookup('0xabcd')).toEqual(tokens[0]); // case insensitive
			expect(lookup('0x1234')).toEqual(tokens[1]);
		});

		it.each([
			['0xUNKNOWN'],
			[null],
			[undefined]
		])('should return undefined for unknown addresses: %s', (address) => {
			const tokens: TokenDescriptor[] = [{ address: '0xABCD', decimals: 18 }];
			const lookup = createTokenLookup(tokens);
			expect(lookup(address)).toBeUndefined();
		});

		it('should handle empty token list', () => {
			const lookup = createTokenLookup([]);
			expect(lookup('0xABCD')).toBeUndefined();
		});
	});

	describe('analyzeTrade', () => {
		it('should analyze a complete trade', () => {
			const quoteToken: TokenDescriptor = { address: '0xUSDC', decimals: 6, symbol: 'USDC' };
			const assetToken: TokenDescriptor = { address: '0xASSET', decimals: 18, symbol: 'ASSET' };

			const trade = {
				inputVaultBalanceChange: {
					amount: '1000000', // 1 USDC
					vault: {
						token: { address: '0xUSDC', decimals: 6 }
					}
				},
				outputVaultBalanceChange: {
					amount: '1000000000000000000', // 1 ASSET
					vault: {
						token: { address: '0xASSET', decimals: 18 }
					}
				}
			};

			const lookup = createTokenLookup([assetToken]);
			const result = analyzeTrade(trade, quoteToken, lookup);

			expect(result).not.toBeNull();
			expect(result?.assetAddress).toBe('0xasset');
			expect(result?.assetSymbol).toBe('ASSET');
			expect(result?.side).toBe('bid');
			expect(result?.quote).toBe(1);
			expect(result?.tokens).toBe(1);
			expect(result?.price).toBe(1);
		});

		it.each([
			[null],
			[undefined]
		])('should return null for null/undefined trade: %s', (trade) => {
			const quoteToken: TokenDescriptor = { address: '0xUSDC', decimals: 6 };
			expect(analyzeTrade(trade, quoteToken)).toBeNull();
		});

		it('should return null if quote token is invalid', () => {
			const quoteToken: TokenDescriptor = { address: '', decimals: 6 };
			const trade = {
				inputVaultBalanceChange: {
					amount: '1000000',
					vault: { token: { address: '0xUSDC', decimals: 6 } }
				},
				outputVaultBalanceChange: {
					amount: '1000000000000000000',
					vault: { token: { address: '0xASSET', decimals: 18 } }
				}
			};

			expect(analyzeTrade(trade, quoteToken)).toBeNull();
		});
	});
});
