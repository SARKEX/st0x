import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { queryClient } from '$lib/clients/queryClient';
import { invalidateCostBasis } from '$lib/queries/balances';

describe('balance query invalidation', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('invalidates all cost-basis query variants', () => {
		const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

		invalidateCostBasis();

		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['costBasis'] });
	});

	it('invalidates cost basis in the legacy market-order success finalizer', () => {
		const source = readFileSync(
			resolve(process.cwd(), 'src/lib/stores/marketTakeStore.ts'),
			'utf8'
		);
		const finalizer = source.slice(
			source.indexOf('export const pollAndFinalizeTakeOrders'),
			source.indexOf('export const preloadAggregatedTakeOrdersCalldata')
		);

		expect(finalizer.indexOf('invalidateCostBasis()')).toBeGreaterThan(-1);
		expect(finalizer.indexOf('invalidateCostBasis()')).toBeLessThan(
			finalizer.indexOf('transactionSuccess(')
		);
	});
});
