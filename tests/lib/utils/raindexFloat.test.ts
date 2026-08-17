import { describe, expect, it } from 'vitest';
import { Float as PackageFloat } from '@rainlanguage/float';
import { Float as RaindexFloat } from '@rainlanguage/raindex';

describe('Raindex vs package Float', () => {
	it('package Float is not a raindex _Float', () => {
		const pkg = PackageFloat.parse('0.9191').value;
		if (!pkg) throw new Error('Failed to parse package Float');
		expect(pkg instanceof RaindexFloat).toBe(false);
	});

	it('rebuilds a repeating amount as a raindex Float that encodes exactly', () => {
		const one = RaindexFloat.parse('1').value;
		const three = RaindexFloat.parse('3').value;
		if (!one || !three) throw new Error('Failed to parse raindex Floats');
		const third = one.div(three).value;
		if (!third) throw new Error('Failed to divide raindex Floats');

		expect(third.toFixedDecimal(6).error).toBeTruthy();

		const decimals = 6;
		const fixed = third.toFixedDecimalLossy(decimals);
		if (fixed.error || !fixed.value) {
			throw new Error(fixed.error?.readableMsg ?? 'Failed to convert vault balance');
		}
		const rebuilt = RaindexFloat.fromFixedDecimalLossy(BigInt(fixed.value.value), decimals).float;
		if (!rebuilt) throw new Error('Failed to encode vault balance');

		expect(rebuilt instanceof RaindexFloat).toBe(true);
		expect(rebuilt.toFixedDecimal(6).error).toBeUndefined();
		expect(rebuilt.toFixedDecimal(6).value).toBe(333333n);
	});
});
