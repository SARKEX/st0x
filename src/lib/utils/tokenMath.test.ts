/* eslint-disable @typescript-eslint/no-unused-vars */

import { describe, it, expect, vi } from 'vitest';
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
	RATIO_SCALE,
	type TokenDescriptor
} from './tokenMath';

describe('tokenMath', () => {
	describe('normalizeAddress', () => {
		it('should normalize valid addresses to lowercase', () => {
			expect(normalizeAddress('0xABCDEF123456')).toBe('0xabcdef123456');
			expect(normalizeAddress('0xABCD')).toBe('0xabcd');
		});

		it('should trim whitespace', () => {
			expect(normalizeAddress('  0xABCDEF  ')).toBe('0xabcdef');
			expect(normalizeAddress('\t0xABCDEF\n')).toBe('0xabcdef');
		});

		it('should return null for empty or whitespace-only strings', () => {
			expect(normalizeAddress('')).toBeNull();
			expect(normalizeAddress('   ')).toBeNull();
			expect(normalizeAddress('\t\n')).toBeNull();
		});

		it('should return null for null and undefined', () => {
			expect(normalizeAddress(null)).toBeNull();
			expect(normalizeAddress(undefined)).toBeNull();
		});
	});

	describe('addressesEqual', () => {
		it('should return true for same addresses with different casing', () => {
			expect(addressesEqual('0xABCDEF', '0xabcdef')).toBe(true);
		});

		it('should return true for same addresses with whitespace', () => {
			expect(addressesEqual('  0xABCDEF  ', '0xabcdef')).toBe(true);
		});

		it('should return false for different addresses', () => {
			expect(addressesEqual('0xAAAAA', '0xBBBBB')).toBe(false);
		});

		it('should return false if either address is null/undefined', () => {
			expect(addressesEqual('0xABCDEF', null)).toBe(false);
			expect(addressesEqual(null, '0xABCDEF')).toBe(false);
			expect(addressesEqual(null, undefined)).toBe(false);
		});
	});

	describe('toBigInt', () => {
		it('should convert bigint to bigint', () => {
			expect(toBigInt(123n)).toBe(123n);
		});

		it('should convert string to bigint', () => {
			expect(toBigInt('123')).toBe(123n);
			expect(toBigInt('0')).toBe(0n);
		});

		it('should convert number to bigint (truncating decimals)', () => {
			expect(toBigInt(123)).toBe(123n);
			expect(toBigInt(123.9)).toBe(123n);
			expect(toBigInt(0)).toBe(0n);
		});

		it('should trim whitespace from strings', () => {
			expect(toBigInt('  123  ')).toBe(123n);
		});

		it('should return null for invalid inputs', () => {
			expect(toBigInt(null)).toBeNull();
			expect(toBigInt(undefined)).toBeNull();
			expect(toBigInt('')).toBeNull();
			expect(toBigInt('   ')).toBeNull();
			expect(toBigInt('invalid')).toBeNull();
			expect(toBigInt(NaN)).toBeNull();
			expect(toBigInt(Infinity)).toBeNull();
		});
	});

	describe('absBigInt', () => {
		it('should return positive value for positive input', () => {
			expect(absBigInt(123n)).toBe(123n);
		});

		it('should return positive value for negative input', () => {
			expect(absBigInt(-123n)).toBe(123n);
		});

		it('should return zero for zero', () => {
			expect(absBigInt(0n)).toBe(0n);
		});
	});

	describe('toDecimal', () => {
		it('should convert bigint to decimal with correct decimals', () => {
			expect(toDecimal(1000000000000000000n, 18)).toBe(1);
			expect(toDecimal(5000000000000000000n, 18)).toBe(5);
			expect(toDecimal(1000000n, 6)).toBe(1);
		});

		it('should return null for invalid inputs', () => {
			expect(toDecimal(null, 18)).toBeNull();
			expect(toDecimal(undefined, 18)).toBeNull();
		});

		it('should handle absolute option', () => {
			// Note: viem's formatUnits may not support negative bigints directly
			// but the function logic should handle the absolute flag
			expect(toDecimal(1000000000000000000n, 18, { absolute: true })).toBe(1);
		});

		it('should use fallback value for invalid conversions', () => {
			expect(toDecimal(null, 18, { fallback: 0 })).toBe(0);
			expect(toDecimal('invalid', 18, { fallback: -1 })).toBe(-1);
		});

		it('should handle decimal strings directly', () => {
			expect(toDecimal('100', 0)).toBe(100);
			expect(toDecimal('1.5', 0)).toBe(1.5);
		});

		it('should validate decimals parameter', () => {
			expect(toDecimal(1000000000000000000n, -1)).toBeNull();
			expect(toDecimal(1000000000000000000n, 31)).toBeNull(); // > 30 is invalid
			expect(toDecimal(1000000000000000000n, NaN)).toBeNull();
		});

		it('should return null for astronomically large values', () => {
			const maxWei = BigInt('1000000000000000000000000'); // 1e24
			expect(toDecimal(maxWei + 1n, 18)).toBeNull();
		});
	});

	describe('computePrice', () => {
		it('should compute price correctly', () => {
			expect(computePrice(100, 10)).toBe(10);
			expect(computePrice(50, 5)).toBe(10);
			expect(computePrice(1, 1)).toBe(1);
		});

		it('should return null for invalid inputs', () => {
			expect(computePrice(null, 10)).toBeNull();
			expect(computePrice(100, null)).toBeNull();
			expect(computePrice(undefined, 10)).toBeNull();
			expect(computePrice(100, undefined)).toBeNull();
		});

		it('should return null for non-finite values', () => {
			expect(computePrice(NaN, 10)).toBeNull();
			expect(computePrice(100, Infinity)).toBeNull();
			expect(computePrice(Infinity, 10)).toBeNull();
		});

		it('should return null for non-positive values', () => {
			expect(computePrice(0, 10)).toBeNull();
			expect(computePrice(100, 0)).toBeNull();
			expect(computePrice(-10, 10)).toBeNull();
			expect(computePrice(10, -10)).toBeNull();
		});
	});

	describe('classifyFlow', () => {
		const pair: PairDescriptor = {
			asset: { address: '0xASSET', decimals: 18 },
			quote: { address: '0xQUOTE', decimals: 6 }
		};

		it('should classify BID flow (QUOTE -> ASSET)', () => {
			expect(classifyFlow('0xQUOTE', '0xASSET', pair)).toBe('bid');
			expect(classifyFlow('0xquote', '0xasset', pair)).toBe('bid'); // case insensitive
		});

		it('should classify ASK flow (ASSET -> QUOTE)', () => {
			expect(classifyFlow('0xASSET', '0xQUOTE', pair)).toBe('ask');
		});

		it('should return null for invalid flows', () => {
			expect(classifyFlow('0xOTHER', '0xASSET', pair)).toBeNull();
			expect(classifyFlow('0xASSET', '0xOTHER', pair)).toBeNull();
		});

		it('should return null for null/undefined inputs', () => {
			expect(classifyFlow(null, '0xASSET', pair)).toBeNull();
			expect(classifyFlow('0xQUOTE', null, pair)).toBeNull();
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

		it('should return null for invalid trades', () => {
			expect(parseTradeAmounts(null, pair)).toBeNull();
			expect(parseTradeAmounts(undefined, pair)).toBeNull();
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
		it('should convert ratio bigint to number', () => {
			expect(ratioToNumber(BigInt(1e18))).toBe(1);
			expect(ratioToNumber(BigInt(5e18))).toBe(5);
			expect(ratioToNumber(BigInt(1.5e18))).toBe(1.5);
		});

		it('should return null for null/undefined', () => {
			expect(ratioToNumber(null)).toBeNull();
			expect(ratioToNumber(undefined)).toBeNull();
		});

		it('should return null for non-positive values', () => {
			expect(ratioToNumber(0n)).toBeNull();
			expect(ratioToNumber(-1n)).toBeNull();
		});

		it('should return null for values that result in non-finite numbers', () => {
			expect(ratioToNumber(BigInt('99999999999999999999999999999999'))).toBeNull();
		});
	});

	describe('describeQuote', () => {
		const quoteAddress = '0xUSDC';

		it('should describe ASK quote (USDC -> TOKEN)', () => {
			const quote = {
				inputTokenAddress: '0xUSDC',
				outputTokenAddress: '0xTOKEN',
				ratio: BigInt(2e18) // 2 USDC per TOKEN
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
				ratio: BigInt(0.5e18) // 0.5 USDC per TOKEN (inverted)
			};

			const result = describeQuote(quote, quoteAddress);
			expect(result).not.toBeNull();
			expect(result?.side).toBe('bid');
			expect(result?.quotePerAsset).toBe(2); // 1 / 0.5 = 2
		});

		it('should return null for invalid quotes', () => {
			expect(
				describeQuote(
					{ inputTokenAddress: '0xUSDC', outputTokenAddress: '0xUSDC', ratio: BigInt(1e18) },
					quoteAddress
				)
			).toBeNull(); // both USDC
			expect(
				describeQuote(
					{ inputTokenAddress: '', outputTokenAddress: '0xTOKEN', ratio: BigInt(1e18) },
					quoteAddress
				)
			).toBeNull();
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

		it('should return undefined for unknown addresses', () => {
			const tokens: TokenDescriptor[] = [{ address: '0xABCD', decimals: 18 }];
			const lookup = createTokenLookup(tokens);

			expect(lookup('0xUNKNOWN')).toBeUndefined();
			expect(lookup(null)).toBeUndefined();
			expect(lookup(undefined)).toBeUndefined();
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

		it('should return null for null/undefined trade', () => {
			const quoteToken: TokenDescriptor = { address: '0xUSDC', decimals: 6 };
			expect(analyzeTrade(null, quoteToken)).toBeNull();
			expect(analyzeTrade(undefined, quoteToken)).toBeNull();
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

	describe('RATIO_SCALE constant', () => {
		it('should be 1e18', () => {
			expect(RATIO_SCALE).toBe(1e18);
		});
	});
});
