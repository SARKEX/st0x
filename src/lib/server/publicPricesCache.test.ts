import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/kv', () => ({
	getKv: vi.fn(async () => null)
}));

import { clearPublicPricesMemoryCache, getCachedPublicPrices } from '$lib/server/publicPricesCache';
import {
	PUBLIC_PRICES_CACHE_CONTROL,
	PUBLIC_PRICES_REFRESH_INTERVAL_MS,
	PUBLIC_PRICES_TTL_SECONDS
} from '$lib/config/publicPrices';

describe('public prices cache', () => {
	beforeEach(() => {
		clearPublicPricesMemoryCache();
		vi.useRealTimers();
	});

	it('uses a five-minute shared and browser refresh window', () => {
		expect(PUBLIC_PRICES_TTL_SECONDS).toBe(300);
		expect(PUBLIC_PRICES_REFRESH_INTERVAL_MS).toBe(300_000);
		expect(PUBLIC_PRICES_CACHE_CONTROL).toBe('public, s-maxage=300, stale-while-revalidate=900');
	});

	it('does not repeat the expensive computation when Redis is unavailable', async () => {
		const compute = vi.fn(async () => ({ success: true, prices: {} }));

		const first = await getCachedPublicPrices(compute, (result) => result.success);
		const second = await getCachedPublicPrices(compute, (result) => result.success);

		expect(first).toEqual(second);
		expect(compute).toHaveBeenCalledOnce();
	});

	it('does not retain an unsuccessful result in memory', async () => {
		const compute = vi
			.fn<[], Promise<{ success: boolean }>>()
			.mockResolvedValueOnce({ success: false })
			.mockResolvedValueOnce({ success: true });

		await getCachedPublicPrices(compute, (result) => result.success);
		await getCachedPublicPrices(compute, (result) => result.success);

		expect(compute).toHaveBeenCalledTimes(2);
	});
});
