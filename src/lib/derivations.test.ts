/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { getBaseline, getPeriodInSeconds, hasValidPriceFeedId } from './derivations';

describe('derivations', () => {
	describe('getBaseline', () => {
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
				expect(getBaseline('Bid', input)).toBe(expected);
			});

			it('should handle small numbers correctly', () => {
				const smallNum = '0.0001';
				const result = getBaseline('Bid', smallNum);
				expect(Number(result)).toBe(1 / 0.0001);
			});

			it('should handle large numbers correctly', () => {
				const largeNum = '1000000';
				const result = getBaseline('Bid', largeNum);
				expect(Number(result)).toBe(1 / 1000000);
			});

			it('should handle scientific notation', () => {
				const result = getBaseline('Bid', '1e3');
				expect(Number(result)).toBe(1 / 1000);
			});

			it('should handle negative numbers', () => {
				const result = getBaseline('Bid', '-2');
				expect(Number(result)).toBe(-0.5);
			});

			it('should handle leading zeros', () => {
				expect(getBaseline('Bid', '00100')).toBe('0.01');
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
				expect(getBaseline('Ask', input)).toBe(expected);
			});

			it('should maintain precision for Ask orders', () => {
				const precision = '123.456789';
				expect(getBaseline('Ask', precision)).toBe(precision);
			});
		});

		describe('Edge cases', () => {
			it.each([
				{ input: '', side: 'Bid' as const, expected: '' },
				{ input: '', side: 'Ask' as const, expected: '' }
			])('should handle empty string for $side', ({ input, side, expected }) => {
				expect(getBaseline(side, input)).toBe(expected);
			});

			it('should handle undefined/null as empty string', () => {
				expect(getBaseline('Bid', undefined as any)).toBe('');
				expect(getBaseline('Ask', null as any)).toBe('');
			});
		});

		describe('Precision', () => {
			it('should have acceptable precision loss for Bid orders (after inversion)', () => {
				const result = getBaseline('Bid', '3');
				const parsed = Number(result);
				expect(parsed).toBeCloseTo(0.3333333, 6);
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

		describe('Consistency checks', () => {
			it('should maintain equivalence: 24 hours = 1 day', () => {
				const oneDay = getPeriodInSeconds('1', 'Days');
				const twentyFourHours = getPeriodInSeconds('24', 'Hours');
				expect(oneDay).toBe(twentyFourHours);
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
