/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect } from 'vitest';
import { truncateAddress, formatUsd, formatPoints, formatApy } from '$lib/utils/format';

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

		it.each([[null], [undefined]])(
			'should return empty string for falsy inputs: %s',
			(input) => {
				expect(truncateAddress(input as any)).toBe('');
			}
		);
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
			[999, '999'],
			[0, '0']
		])('should format %s as %s', (value, expected) => {
			expect(formatPoints(value)).toBe(expected);
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
