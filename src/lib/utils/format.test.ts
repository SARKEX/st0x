import { describe, it, expect } from 'vitest';
import { truncateAddress, formatCompact } from './format';

describe('format utilities', () => {
	describe('truncateAddress', () => {
		it('should truncate addresses to 6 first and 4 last characters', () => {
			expect(truncateAddress('0x1234567890abcdef')).toBe('0x1234...cdef');
			expect(truncateAddress('0xAbCdEfGhIjKlMnOpQrStUvWxYz')).toBe('0xAbCdE...WxYz');
		});

		it('should handle exact length addresses', () => {
			expect(truncateAddress('0x123456789abc')).toBe('0x1234...89abc');
		});

		it('should handle short addresses', () => {
			// When address is shorter than 10 chars, slice behavior means overlap
			expect(truncateAddress('0x1234')).toBe('0x12......1234');
			expect(truncateAddress('0x')).toBe('0x......');
		});

		it('should return empty string for falsy inputs', () => {
			expect(truncateAddress('')).toBe('');
			expect(truncateAddress(null as any)).toBe('');
			expect(truncateAddress(undefined as any)).toBe('');
		});

		it('should work with common Ethereum addresses', () => {
			const address = '0x0000000000000000000000000000000000000000';
			expect(truncateAddress(address)).toBe('0x0000...0000');
		});
	});

	describe('formatCompact', () => {
		it('should format billions with B suffix', () => {
			expect(formatCompact(1_000_000_000)).toBe('1.00B');
			expect(formatCompact(1_500_000_000)).toBe('1.50B');
			expect(formatCompact(999_999_999_999)).toBe('1000.00B');
		});

		it('should format millions with M suffix', () => {
			expect(formatCompact(1_000_000)).toBe('1.00M');
			expect(formatCompact(5_500_000)).toBe('5.50M');
			expect(formatCompact(999_999_999)).toBe('1000.00M');
		});

		it('should format thousands with K suffix', () => {
			expect(formatCompact(1_000)).toBe('1.0K');
			expect(formatCompact(5_500)).toBe('5.5K');
			expect(formatCompact(999_999)).toBe('1000.0K');
		});

		it('should format numbers less than 1000 as plain decimals', () => {
			expect(formatCompact(0)).toBe('0.00');
			expect(formatCompact(1)).toBe('1.00');
			expect(formatCompact(123.456)).toBe('123.46');
			expect(formatCompact(999)).toBe('999.00');
		});

		it('should handle edge cases at boundaries', () => {
			expect(formatCompact(999.99)).toBe('999.99');
			expect(formatCompact(1000)).toBe('1.0K');
			expect(formatCompact(999_999)).toBe('1000.0K');
			expect(formatCompact(1_000_000)).toBe('1.00M');
		});

		it('should handle very large numbers', () => {
			expect(formatCompact(999_000_000_000)).toBe('999.00B');
			expect(formatCompact(1_234_567_890_123)).toBe('1234567.89B');
		});

		it('should handle very small numbers', () => {
			expect(formatCompact(0.01)).toBe('0.01');
			expect(formatCompact(0.001)).toBe('0.00');
			expect(formatCompact(0.5)).toBe('0.50');
		});

		it('should handle negative numbers', () => {
			expect(formatCompact(-1_000)).toBe('-1.0K');
			expect(formatCompact(-1_000_000)).toBe('-1.00M');
			expect(formatCompact(-999)).toBe('-999.00');
		});

		it('should handle special number values', () => {
			expect(formatCompact(Infinity)).toMatch(/Infinity|inf/i);
			expect(formatCompact(NaN)).toMatch(/NaN|nan/i);
		});
	});

	describe('formatCompact precision', () => {
		it('should use 2 decimal places for B and M', () => {
			expect(formatCompact(1_234_567_890)).toBe('1.23B');
			expect(formatCompact(1_234_567)).toBe('1.23M');
		});

		it('should use 1 decimal place for K', () => {
			expect(formatCompact(1_234)).toBe('1.2K');
		});

		it('should use 2 decimal places for numbers < 1000', () => {
			expect(formatCompact(123.456789)).toBe('123.46');
		});
	});
});
