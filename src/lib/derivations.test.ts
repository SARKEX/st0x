/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { getBaseline, getPeriodInSeconds, hasValidPriceFeedId } from './derivations';

describe('derivations', () => {
	describe('getBaseline', () => {
		describe('Bid orders (user buying)', () => {
			it('should invert the ratio for Bid orders', () => {
				// User says "buy at price 2" → ratio must be inverted to 0.5
				expect(getBaseline('Bid', '2')).toBe('0.5');
				expect(getBaseline('Bid', '4')).toBe('0.25');
				expect(getBaseline('Bid', '0.5')).toBe('2');
			});

			it('should handle Bid with decimal values', () => {
				expect(getBaseline('Bid', '1.5')).toBe(String(1 / 1.5));
				expect(getBaseline('Bid', '2.5')).toBe(String(1 / 2.5));
			});

			it('should trim whitespace for Bid', () => {
				expect(getBaseline('Bid', '  2  ')).toBe('0.5');
				expect(getBaseline('Bid', '\t4\n')).toBe('0.25');
			});

			it('should return the input unchanged if ratio is zero', () => {
				expect(getBaseline('Bid', '0')).toBe('0');
			});

			it('should return the input unchanged if ratio is not a finite number', () => {
				expect(getBaseline('Bid', 'invalid')).toBe('invalid');
				expect(getBaseline('Bid', 'NaN')).toBe('NaN');
			});
		});

		describe('Ask orders (user selling)', () => {
			it('should return the ratio unchanged for Ask orders', () => {
				// User says "sell at price 1.5" → ratio remains 1.5
				expect(getBaseline('Ask', '1.5')).toBe('1.5');
				expect(getBaseline('Ask', '100')).toBe('100');
				expect(getBaseline('Ask', '0.001')).toBe('0.001');
			});

			it('should handle Ask with decimal values', () => {
				expect(getBaseline('Ask', '2.5')).toBe('2.5');
				expect(getBaseline('Ask', '0.25')).toBe('0.25');
			});

			it('should trim whitespace for Ask', () => {
				expect(getBaseline('Ask', '  1.5  ')).toBe('1.5');
				expect(getBaseline('Ask', '\t100\n')).toBe('100');
			});
		});

		describe('Edge cases', () => {
			it('should handle empty string', () => {
				expect(getBaseline('Bid', '')).toBe('');
				expect(getBaseline('Ask', '')).toBe('');
			});

			it('should handle undefined/null as empty string', () => {
				expect(getBaseline('Bid', undefined as any)).toBe('');
				expect(getBaseline('Ask', null as any)).toBe('');
			});

			it('should handle very small numbers', () => {
				const smallNum = '0.0001';
				const result = getBaseline('Bid', smallNum);
				expect(Number(result)).toBe(1 / 0.0001);
			});

			it('should handle very large numbers', () => {
				const largeNum = '1000000';
				const result = getBaseline('Bid', largeNum);
				expect(Number(result)).toBe(1 / 1000000);
			});

			it('should handle scientific notation', () => {
				const scientific = '1e3'; // 1000
				const result = getBaseline('Bid', scientific);
				expect(Number(result)).toBe(1 / 1000);
			});

			it('should handle negative numbers', () => {
				const negative = '-2';
				const result = getBaseline('Bid', negative);
				expect(Number(result)).toBe(-0.5);
			});

			it('should handle ratio of 1', () => {
				expect(getBaseline('Bid', '1')).toBe('1');
				expect(getBaseline('Ask', '1')).toBe('1');
			});

			it('should handle ratio strings with leading zeros', () => {
				expect(getBaseline('Bid', '00100')).toBe('0.01');
			});
		});

		describe('Precision', () => {
			it('should maintain precision for Ask orders (no inversion)', () => {
				const precision = '123.456789';
				expect(getBaseline('Ask', precision)).toBe(precision);
			});

			it('should have acceptable precision loss for Bid orders (after inversion)', () => {
				const result = getBaseline('Bid', '3');
				const parsed = Number(result);
				expect(parsed).toBeCloseTo(0.3333333, 6);
			});
		});
	});

	describe('getPeriodInSeconds', () => {
		describe('Days conversion', () => {
			it('should convert 1 day to seconds', () => {
				expect(getPeriodInSeconds('1', 'Days')).toBe(86400);
			});

			it('should convert 7 days to seconds', () => {
				expect(getPeriodInSeconds('7', 'Days')).toBe(604800);
			});

			it('should convert 365 days to seconds', () => {
				expect(getPeriodInSeconds('365', 'Days')).toBe(31536000);
			});

			it('should handle large day values', () => {
				expect(getPeriodInSeconds('1000', 'Days')).toBe(86400000);
			});
		});

		describe('Hours conversion', () => {
			it('should convert 1 hour to seconds', () => {
				expect(getPeriodInSeconds('1', 'Hours')).toBe(3600);
			});

			it('should convert 24 hours to seconds', () => {
				expect(getPeriodInSeconds('24', 'Hours')).toBe(86400);
			});

			it('should convert 168 hours (1 week) to seconds', () => {
				expect(getPeriodInSeconds('168', 'Hours')).toBe(604800);
			});
		});

		describe('Minutes conversion', () => {
			it('should convert 1 minute to seconds', () => {
				expect(getPeriodInSeconds('1', 'Minutes')).toBe(60);
			});

			it('should convert 60 minutes to seconds', () => {
				expect(getPeriodInSeconds('60', 'Minutes')).toBe(3600);
			});

			it('should convert 1440 minutes (1 day) to seconds', () => {
				expect(getPeriodInSeconds('1440', 'Minutes')).toBe(86400);
			});
		});

		describe('Edge cases', () => {
			it('should handle zero period', () => {
				expect(getPeriodInSeconds('0', 'Days')).toBe(0);
				expect(getPeriodInSeconds('0', 'Hours')).toBe(0);
				expect(getPeriodInSeconds('0', 'Minutes')).toBe(0);
			});

			it('should handle invalid period string (non-numeric)', () => {
				expect(getPeriodInSeconds('invalid', 'Days')).toBe(0);
				expect(getPeriodInSeconds('abc', 'Hours')).toBe(0);
				expect(getPeriodInSeconds('', 'Minutes')).toBe(0);
			});

			it('should handle null/undefined period', () => {
				expect(getPeriodInSeconds(null as any, 'Days')).toBe(0);
				expect(getPeriodInSeconds(undefined as any, 'Hours')).toBe(0);
			});

			it('should handle negative period', () => {
				expect(getPeriodInSeconds('-1', 'Days')).toBe(-86400);
				expect(getPeriodInSeconds('-24', 'Hours')).toBe(-86400);
			});

			it('should handle decimal period (parsed as integer)', () => {
				expect(getPeriodInSeconds('1.5', 'Days')).toBe(86400); // parseInt('1.5') = 1
				expect(getPeriodInSeconds('2.9', 'Hours')).toBe(7200); // parseInt('2.9') = 2
			});

			it('should handle whitespace in period', () => {
				expect(getPeriodInSeconds('  5  ', 'Days')).toBe(432000);
				expect(getPeriodInSeconds('\t10\n', 'Hours')).toBe(36000);
			});

			it('should return 0 for unknown unit', () => {
				expect(getPeriodInSeconds('1', 'Unknown' as any)).toBe(0);
				expect(getPeriodInSeconds('10', 'Seconds' as any)).toBe(0);
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

			it('should maintain equivalence: 60 minutes = 1 hour', () => {
				const oneHour = getPeriodInSeconds('1', 'Hours');
				const sixtyMinutes = getPeriodInSeconds('60', 'Minutes');
				expect(oneHour).toBe(sixtyMinutes);
			});

			it('should maintain equivalence: 1440 minutes = 1 day', () => {
				const oneDay = getPeriodInSeconds('1', 'Days');
				const minInDay = getPeriodInSeconds('1440', 'Minutes');
				expect(oneDay).toBe(minInDay);
			});
		});
	});

	describe('hasValidPriceFeedId', () => {
		describe('Valid price feed IDs', () => {
			it('should return true for valid price feed ID', () => {
				const token = {
					priceFeedId: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
				};
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});

			it('should return true for 64-character hex price feed ID', () => {
				const token = {
					priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'
				};
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});

			it('should return true for uppercase price feed ID', () => {
				const token = {
					priceFeedId: '0xABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF'
				};
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});
		});

		describe('Invalid price feed IDs', () => {
			it('should return false for undefined price feed ID', () => {
				const token = {};
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});

			it('should return false for null price feed ID', () => {
				const token = { priceFeedId: null };
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});

			it('should return false for empty string price feed ID', () => {
				const token = { priceFeedId: '' };
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});

			it('should return false for 0x price feed ID', () => {
				const token = { priceFeedId: '0x' };
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});

			it('should return true for whitespace price feed ID (truthy string check)', () => {
				const token = { priceFeedId: '   ' };
				// Function only checks truthiness and !== '', so whitespace passes
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});

			it('should return true for short hex price feed ID (no format validation)', () => {
				const token = { priceFeedId: '0x123456' };
				// Function does not validate hex format, only checks truthiness
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});

			it('should return true for invalid hex format (no format validation)', () => {
				const token = { priceFeedId: '0xGGGGGGGG' };
				// Function does not validate hex format, only checks truthiness
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});
		});

		describe('Token parameter validation', () => {
			it('should return false for undefined token', () => {
				expect(hasValidPriceFeedId(undefined)).toBe(false);
			});

			it('should return false for null token', () => {
				expect(hasValidPriceFeedId(null as any)).toBe(false);
			});

			it('should return false for empty object', () => {
				expect(hasValidPriceFeedId({} as any)).toBe(false);
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

			it('should ignore other properties and check only priceFeedId', () => {
				const token = {
					address: '0x123',
					symbol: 'TEST',
					decimals: 18
				};
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});
		});

		describe('Edge cases', () => {
			it('should return false for false priceFeedId', () => {
				const token = { priceFeedId: false };
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});

			it('should return false for zero priceFeedId', () => {
				const token = { priceFeedId: 0 };
				expect(hasValidPriceFeedId(token as any)).toBe(false);
			});

			it('should return true for boolean true priceFeedId (truthy check)', () => {
				const token = { priceFeedId: true };
				// Function just checks truthiness, so true is truthy
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});

			it('should return true for positive number priceFeedId (truthy check)', () => {
				const token = { priceFeedId: 12345 };
				// Function just checks truthiness, so positive numbers are truthy
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});

			it('should handle case sensitivity correctly', () => {
				const token = {
					priceFeedId: '0xaAbBcCdDeEfF00112233445566778899aAbBcCdDeEfF00112233445566778899'
				};
				expect(hasValidPriceFeedId(token as any)).toBe(true);
			});
		});

		describe('Truthy/Falsy checks', () => {
			it('should use !! operator behavior correctly', () => {
				const validToken = {
					priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'
				};
				expect(hasValidPriceFeedId(validToken as any)).toBe(true);

				const invalidToken = { priceFeedId: '0x' };
				expect(hasValidPriceFeedId(invalidToken as any)).toBe(false);
			});
		});
	});
});
