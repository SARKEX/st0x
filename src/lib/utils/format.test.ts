/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { truncateAddress, formatCompact } from './format';

describe('format utilities', () => {
	describe('truncateAddress', () => {
		it.each([
			['0x1234567890abcdef', '0x1234...cdef'],
			['0xAbCdEfGhIjKlMnOpQrStUvWxYz', '0xAbCdE...WxYz'],
			['0x123456789abc', '0x1234...89abc'],
			['0x0000000000000000000000000000000000000000', '0x0000...0000']
		])('should truncate address %s to %s', (address, expected) => {
			expect(truncateAddress(address)).toBe(expected);
		});

		it.each([
			['0x1234', '0x12......1234'],
			['0x', '0x......']
		])('should handle short addresses: %s', (address, expected) => {
			expect(truncateAddress(address)).toBe(expected);
		});

		it.each([
			[''],
			[null],
			[undefined]
		])('should return empty string for falsy inputs: %s', (input) => {
			expect(truncateAddress(input as any)).toBe('');
		});
	});

	describe('formatCompact', () => {
		it.each([
			[1_000_000_000, '1.00B'],
			[1_500_000_000, '1.50B'],
			[999_999_999_999, '1000.00B'],
			[999_000_000_000, '999.00B'],
			[1_234_567_890, '1.23B']
		])('should format billions: %s -> %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[1_000_000, '1.00M'],
			[5_500_000, '5.50M'],
			[999_999_999, '1000.00M'],
			[1_234_567, '1.23M']
		])('should format millions: %s -> %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[1_000, '1.0K'],
			[5_500, '5.5K'],
			[999_999, '1000.0K'],
			[1_234, '1.2K']
		])('should format thousands: %s -> %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[0, '0.00'],
			[1, '1.00'],
			[123.456, '123.46'],
			[999, '999.00'],
			[123.456789, '123.46']
		])('should format numbers < 1000: %s -> %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[999.99, '999.99'],
			[1000, '1.0K'],
			[999_999, '1000.0K'],
			[1_000_000, '1.00M']
		])('should handle edge cases at boundaries: %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[0.01, '0.01'],
			[0.001, '0.00'],
			[0.5, '0.50']
		])('should handle very small numbers: %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[-1_000, '-1.0K'],
			[-1_000_000, '-1.00M'],
			[-999, '-999.00']
		])('should handle negative numbers: %s', (value, expected) => {
			expect(formatCompact(value)).toBe(expected);
		});

		it.each([
			[Infinity, 'Infinity'],
			[NaN, 'NaN']
		])('should handle special number values: %s -> %s', (value, expected) => {
			const result = formatCompact(value);
			expect(result.toLowerCase()).toBe(expected.toLowerCase());
		});
	});
});
