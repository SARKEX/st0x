import { describe, it, expect } from 'vitest';

import { handleDecimalSeparator } from './handleDecimalSeparator';

describe('handleDecimalSeparator', () => {
	it('normalizes multiple comma and period separators to a single decimal point', () => {
		const input = { target: { value: '1,234,567.89' } };

		const result = handleDecimalSeparator(input);

		expect(result).toBe('1234567.89');
	});

	it('strips out non-numeric characters while preserving the last decimal point', () => {
		const input = { target: { value: 'abc12,34.56xyz' } };

		const result = handleDecimalSeparator(input);

		expect(result).toBe('1234.56');
	});
});
