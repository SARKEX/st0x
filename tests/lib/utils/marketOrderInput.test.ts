import { describe, expect, it } from 'vitest';
import { resolveMarketOrderAnchor } from '$lib/utils/marketOrderInput';

describe('resolveMarketOrderAnchor', () => {
	it.each([
		{
			name: 'buy payment input',
			orderSide: 'Buy' as const,
			editedField: 'top' as const,
			paymentAmount: '12.5',
			assetAmount: '999',
			expected: { amount: 12_500_000n, inputMode: 'spend' }
		},
		{
			name: 'buy asset input',
			orderSide: 'Buy' as const,
			editedField: 'bottom' as const,
			paymentAmount: '999',
			assetAmount: '0.25',
			expected: { amount: 250_000_000_000_000_000n, inputMode: 'amount' }
		},
		{
			name: 'sell asset input',
			orderSide: 'Sell' as const,
			editedField: 'bottom' as const,
			paymentAmount: '999',
			assetAmount: '0.25',
			expected: { amount: 250_000_000_000_000_000n, inputMode: 'amount' }
		},
		{
			name: 'sell payment output',
			orderSide: 'Sell' as const,
			editedField: 'top' as const,
			paymentAmount: '12.5',
			assetAmount: '999',
			expected: { amount: 12_500_000n, inputMode: 'receive' }
		}
	])('preserves the $name anchor without using the calculated field', (testCase) => {
		expect(
			resolveMarketOrderAnchor({
				...testCase,
				paymentDecimals: 6,
				assetDecimals: 18
			})
		).toEqual(testCase.expected);
	});

	it('rejects missing, non-positive, or over-precision input', () => {
		const base = {
			orderSide: 'Buy' as const,
			paymentAmount: '1.0000001',
			assetAmount: '1',
			paymentDecimals: 6,
			assetDecimals: 18
		};
		expect(resolveMarketOrderAnchor({ ...base, editedField: null })).toBeNull();
		expect(resolveMarketOrderAnchor({ ...base, editedField: 'top' })).toBeNull();
		expect(
			resolveMarketOrderAnchor({ ...base, editedField: 'bottom', assetAmount: '0' })
		).toBeNull();
	});

	it.each([
		['.5', 500_000n],
		['1.', 1_000_000n]
	])('accepts the decimal form %s used by the input control', (paymentAmount, amount) => {
		expect(
			resolveMarketOrderAnchor({
				orderSide: 'Buy',
				editedField: 'top',
				paymentAmount,
				assetAmount: '',
				paymentDecimals: 6,
				assetDecimals: 18
			})
		).toEqual({ amount, inputMode: 'spend' });
	});
});
