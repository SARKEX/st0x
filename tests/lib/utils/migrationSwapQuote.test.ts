import { describe, expect, it } from 'vitest';
import { parseUnits } from 'viem';
import { migrationPayCapWei, migrationReceiveWei } from '$lib/utils/migrationSwapQuote';

describe('migrationSwapQuote', () => {
	it('converts pay→receive and receive→pay at 1:1', () => {
		const pay = parseUnits('10', 18);
		const receive = migrationReceiveWei(pay, '1');
		expect(receive).toBe(pay);
		expect(migrationPayCapWei(receive, '1')).toBe(pay);
	});

	it('derives a legacy pay cap from wrapped maxOutput at a non-1 ratio', () => {
		// 2 legacy per 1 wrapped → 5 wrapped inventory caps pay at 10 legacy
		const maxOutput = parseUnits('5', 18);
		const payCap = migrationPayCapWei(maxOutput, '2');
		expect(payCap).toBe(parseUnits('10', 18));
		expect(migrationReceiveWei(payCap, '2')).toBe(maxOutput);
	});

	it('floors receive so pay at the cap never exceeds maxOutput', () => {
		const maxOutput = parseUnits('1', 18);
		const payCap = migrationPayCapWei(maxOutput, '1.5');
		expect(migrationReceiveWei(payCap, '1.5')).toBeLessThanOrEqual(maxOutput);
	});

	it('returns 0 for invalid ratios or zero amounts', () => {
		expect(migrationReceiveWei(0n, '1')).toBe(0n);
		expect(migrationPayCapWei(0n, '1')).toBe(0n);
		expect(migrationReceiveWei(1n, '0')).toBe(0n);
		expect(migrationPayCapWei(1n, '0')).toBe(0n);
	});
});
