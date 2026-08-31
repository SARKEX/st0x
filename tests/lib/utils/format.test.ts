/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { formatUnits } from 'viem';
import {
	truncateAddress,
	formatUsd,
	formatPoints,
	formatApy,
	formatUnitsSafe
} from '$lib/utils/format';

describe('format utilities', () => {
	describe('truncateAddress', () => {
		it.each([
			['0x0000000000000000000000000000000000000000', '0x0000...0000'],
			['0x1234567890abcdef1234567890abcdef12345678', '0x1234...5678'],
			['0xAbCdEfGhIjKlMnOpQrStUvWxYz123456789012', '0xAbCdE...9012']
		])('should truncate valid address %s to %s', (address, expected) => {
			expect(truncateAddress(address)).toBe(expected);
		});

		it.each([
			['0x1234567890abcdef', ''],
			['0xAbCdEfGhIjKlMnOpQrStUvWxYz', ''],
			['0x123456789abc', ''],
			['0x1234', ''],
			['0x', ''],
			['', '']
		])('should return empty string for invalid/short addresses: %s', (address, expected) => {
			expect(truncateAddress(address)).toBe(expected);
		});

		it.each([[null], [undefined]])('should return empty string for falsy inputs: %s', (input) => {
			expect(truncateAddress(input as any)).toBe('');
		});
	});

	describe('formatUsd', () => {
		it.each([
			[1000, '$1.0K'],
			[1500, '$1.5K'],
			[999, '$999.00'],
			[0, '$0.00'],
			[123.456, '$123.46']
		])('should format %s as %s', (value, expected) => {
			expect(formatUsd(value)).toBe(expected);
		});
	});

	describe('formatPoints', () => {
		it.each([
			[1_000_000, '1.0M'],
			[5_500_000, '5.5M'],
			[1_000, '1.0K'],
			[5_500, '5.5K'],
			[999, Math.round(999).toLocaleString('en-US')],
			[0, Math.round(0).toLocaleString('en-US')]
		])('should format %s as %s', (value, expected) => {
			expect(formatPoints(value)).toBe(expected);
		});
	});

	describe('formatUnitsSafe', () => {
		it('does not throw when amount is undefined (ST0-28 / ST0X-DEX-UI-2B)', () => {
			expect(() => formatUnits(undefined as unknown as bigint, 18)).toThrow(
				/Cannot read properties of undefined/
			);
			expect(() => formatUnitsSafe(undefined, 18)).not.toThrow();
			expect(formatUnitsSafe(undefined, 18)).toBe('0');
		});

		it('does not throw when amount is null or decimals are missing', () => {
			expect(formatUnitsSafe(null, 6)).toBe('0');
			expect(formatUnitsSafe(1_000_000n, undefined)).toBe('0');
			expect(formatUnitsSafe(1_000_000n, null)).toBe('0');
		});

		it('formats a valid amount the same as viem formatUnits', () => {
			expect(formatUnitsSafe(1_000_000n, 6)).toBe(formatUnits(1_000_000n, 6));
			expect(formatUnitsSafe(0n, 18)).toBe('0');
		});
	});

	describe('formatApy', () => {
		it.each([
			[null, '-'],
			[0, '-'],
			[1000, '1.0K%'],
			[2500, '2.5K%'],
			[100, '100%'],
			[500, '500%'],
			[50.5, '50.5%'],
			[1.2, '1.2%']
		])('should format %s as %s', (value, expected) => {
			expect(formatApy(value)).toBe(expected);
		});
	});
});
