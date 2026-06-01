import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '$lib/utils/mapWithConcurrency';

describe('mapWithConcurrency', () => {
	it('runs all items and preserves order', async () => {
		const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
		expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
			2, 4, 6, 8, 10
		]);
	});

	it('records rejections without stopping other tasks', async () => {
		const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
			if (n === 2) throw new Error('fail');
			return n;
		});
		expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
		expect(results[1].status).toBe('rejected');
		expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
	});
});
