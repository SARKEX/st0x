/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { priceToIoratioString, getPeriodInSeconds, hasValidPriceFeedId } from '$lib/utils/derivations';

describe('derivations', () => {
	describe('priceToIoratioString', () => {
		describe('Bid orders (user buying)', () => {
			it.each([
				{ input: '2', expected: '0.5' },
				{ input: '4', expected: '0.25' },
				{ input: '0.5', expected: '2' },
				{ input: '1.5', expected: String(1 / 1.5) },
				{ input: '2.5', expected: String(1 / 2.5) },
				{ input: '  2  ', expected: '0.5' },
				{ input: '\t4\n', expected: '0.25' },
				{ input: '0', expected: '0' },
				{ input: 'invalid', expected: 'invalid' },
				{ input: 'NaN', expected: 'NaN' }
			])('should process Bid order with input "$input"', ({ input, expected }) => {
				expect(priceToIoratioString('Bid', input)).toBe(expected);
			});

			it('should handle small numbers correctly', () => {
				const smallNum = '0.0001';
				const result = priceToIoratioString('Bid', smallNum);
				expect(Number(result)).toBe(1 / 0.0001);
			});

			it('should handle large numbers correctly', () => {
				const largeNum = '1000000';
				const result = priceToIoratioString('Bid', largeNum);
				expect(Number(result)).toBe(1 / 1000000);
			});

			it('should handle scientific notation', () => {
				const result = priceToIoratioString('Bid', '1e3');
				expect(Number(result)).toBe(1 / 1000);
			});

			it('should handle negative numbers', () => {
				const result = priceToIoratioString('Bid', '-2');
				expect(Number(result)).toBe(-0.5);
			});

			it('should handle leading zeros', () => {
				expect(priceToIoratioString('Bid', '00100')).toBe('0.01');
			});
		});

		describe('Ask orders (user selling)', () => {
			it.each([
				{ input: '1.5', expected: '1.5' },
				{ input: '100', expected: '100' },
				{ input: '0.001', expected: '0.001' },
				{ input: '2.5', expected: '2.5' },
				{ input: '0.25', expected: '0.25' },
				{ input: '  1.5  ', expected: '1.5' },
				{ input: '\t100\n', expected: '100' }
			])('should return Ask order unchanged for input "$input"', ({ input, expected }) => {
				expect(priceToIoratioString('Ask', input)).toBe(expected);
			});

			it('should maintain precision for Ask orders', () => {
				const precision = '123.456789';
				expect(priceToIoratioString('Ask', precision)).toBe(precision);
			});
		});

		describe('Edge cases', () => {
			it.each([
				{ input: '', side: 'Bid' as const, expected: '' },
				{ input: '', side: 'Ask' as const, expected: '' }
			])('should handle empty string for $side', ({ input, side, expected }) => {
				expect(priceToIoratioString(side, input)).toBe(expected);
			});

			it('should handle undefined/null as empty string', () => {
				expect(priceToIoratioString('Bid', undefined as any)).toBe('');
				expect(priceToIoratioString('Ask', null as any)).toBe('');
			});
		});

		describe('Precision', () => {
			it('should have acceptable precision loss for Bid orders (after inversion)', () => {
				const result = priceToIoratioString('Bid', '3');
				const parsed = Number(result);
				expect(parsed).toBeCloseTo(0.3333333, 6);
			});
		});

		describe('18-decimal formatting', () => {
			it('should format Bid result to 18 decimals with trailing zeros removed', () => {
				const result = priceToIoratioString('Bid', '2', true);
				expect(result).toBe('0.5');
			});

			it('should format Ask result to 18 decimals with trailing zeros removed', () => {
				const result = priceToIoratioString('Ask', '2', true);
				expect(result).toBe('2');
			});

			it('should handle complex decimal values with formatting', () => {
				const result = priceToIoratioString('Bid', '3', true);
				// 1/3 = 0.333333... formatted to 18 decimals then trimmed
				// JavaScript precision limits mean we check the prefix
				expect(result).toMatch(/^0\.33333333333333/);
				expect(result.split('.')[1].length).toBeGreaterThanOrEqual(15);
			});

			it('should preserve precision up to 18 decimals', () => {
				const result = priceToIoratioString('Ask', '1.123456789012345678', true);
				// JavaScript precision limits mean we check the prefix
				expect(result).toMatch(/^1\.12345678901234/);
				expect(Number(result)).toBeCloseTo(1.123456789012345678, 14);
			});

			it('should trim trailing zeros when formatting', () => {
				const result = priceToIoratioString('Bid', '4', true);
				expect(result).toBe('0.25'); // Not '0.250000000000000000'
			});

			it('should handle zero correctly with formatting', () => {
				const result = priceToIoratioString('Ask', '0', true);
				expect(result).toBe('0');
			});

			it('should format large numbers correctly', () => {
				const result = priceToIoratioString('Ask', '1000000', true);
				expect(result).toBe('1000000');
			});

			it('should format small numbers correctly', () => {
				const result = priceToIoratioString('Bid', '0.0001', true);
				expect(result).toBe('10000');
			});

			it('should maintain backward compatibility when formatTo18Decimals is false', () => {
				const result1 = priceToIoratioString('Bid', '2', false);
				const result2 = priceToIoratioString('Bid', '2');
				expect(result1).toBe(result2);
				expect(result1).toBe('0.5');
			});

			it('should handle invalid input the same way with formatting', () => {
				const result = priceToIoratioString('Bid', 'invalid', true);
				expect(result).toBe('invalid');
			});
		});
	});

	describe('getPeriodInSeconds', () => {
		it.each([
			// Days
			{ period: '1', unit: 'Days' as const, expected: 86400 },
			{ period: '365', unit: 'Days' as const, expected: 31536000 },
			{ period: '1000', unit: 'Days' as const, expected: 86400000 },
			// Hours
			{ period: '1', unit: 'Hours' as const, expected: 3600 },
			{ period: '24', unit: 'Hours' as const, expected: 86400 },
			{ period: '168', unit: 'Hours' as const, expected: 604800 },
			// Minutes
			{ period: '1', unit: 'Minutes' as const, expected: 60 },
			{ period: '60', unit: 'Minutes' as const, expected: 3600 },
			{ period: '1440', unit: 'Minutes' as const, expected: 86400 }
		])('should convert $period $unit to seconds', ({ period, unit, expected }) => {
			expect(getPeriodInSeconds(period, unit)).toBe(expected);
		});

		describe('Edge cases', () => {
			it.each([
				{ period: '0', unit: 'Days' as const, expected: 0 },
				{ period: '0', unit: 'Hours' as const, expected: 0 },
				{ period: '0', unit: 'Minutes' as const, expected: 0 }
			])('should handle zero period for $unit', ({ period, unit, expected }) => {
				expect(getPeriodInSeconds(period, unit)).toBe(expected);
			});

			it.each([
				{ period: 'invalid', unit: 'Days' as const },
				{ period: 'abc', unit: 'Hours' as const },
				{ period: '', unit: 'Minutes' as const }
			])('should return 0 for invalid period "$period"', ({ period, unit }) => {
				expect(getPeriodInSeconds(period, unit)).toBe(0);
			});

			it('should handle null/undefined period', () => {
				expect(getPeriodInSeconds(null as any, 'Days')).toBe(0);
				expect(getPeriodInSeconds(undefined as any, 'Hours')).toBe(0);
			});

			it.each([
				{ period: '-1', unit: 'Days' as const, expected: -86400 },
				{ period: '-24', unit: 'Hours' as const, expected: -86400 }
			])('should handle negative period', ({ period, unit, expected }) => {
				expect(getPeriodInSeconds(period, unit)).toBe(expected);
			});

			it.each([
				{ period: '1.5', unit: 'Days' as const, expected: 86400 },
				{ period: '2.9', unit: 'Hours' as const, expected: 7200 }
			])('should truncate decimal period $period $unit', ({ period, unit, expected }) => {
				expect(getPeriodInSeconds(period, unit)).toBe(expected);
			});

			it.each([
				{ period: '  5  ', unit: 'Days' as const, expected: 432000 },
				{ period: '\t10\n', unit: 'Hours' as const, expected: 36000 }
			])('should handle whitespace in period', ({ period, unit, expected }) => {
				expect(getPeriodInSeconds(period, unit)).toBe(expected);
			});

			it('should handle very large periods', () => {
				expect(getPeriodInSeconds('999999', 'Days')).toBe(86399913600);
			});
		});
	});

	describe('hasValidPriceFeedId', () => {
		it('should return true for valid price feed ID', () => {
			const token = {
				priceFeedId: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
			};
			expect(hasValidPriceFeedId(token as any)).toBe(true);
		});

		it.each([
			{ desc: 'undefined', token: {} },
			{ desc: 'null', token: { priceFeedId: null } },
			{ desc: 'empty string', token: { priceFeedId: '' } },
			{ desc: '0x only', token: { priceFeedId: '0x' } }
		])('should return false for $desc price feed ID', ({ token }) => {
			expect(hasValidPriceFeedId(token as any)).toBe(false);
		});

		it.each([
			{ desc: 'undefined token', token: undefined },
			{ desc: 'null token', token: null },
			{ desc: 'empty object', token: {} }
		])('should return false for $desc', ({ token }) => {
			expect(hasValidPriceFeedId(token as any)).toBe(false);
		});

		it('should work with token containing other properties', () => {
			const token = {
				address: '0x123',
				symbol: 'TEST',
				decimals: 18,
				priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'
			};
			expect(hasValidPriceFeedId(token as any)).toBe(true);
		});

		it('should handle case sensitivity correctly', () => {
			const token = {
				priceFeedId: '0xaAbBcCdDeEfF00112233445566778899aAbBcCdDeEfF00112233445566778899'
			};
			expect(hasValidPriceFeedId(token as any)).toBe(true);
		});
	});
});
