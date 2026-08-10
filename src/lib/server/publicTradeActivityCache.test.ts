import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getKvMock } = vi.hoisted(() => ({
	getKvMock: vi.fn()
}));

vi.mock('$lib/server/kv', () => ({
	getKv: getKvMock
}));

import {
	clearPublicTradeActivityMemoryCache,
	getCachedPublicTradeActivity,
	publicTradeActivityCacheControl
} from '$lib/server/publicTradeActivityCache';
import type { PublicTradeActivitySnapshot } from '$lib/server/publicTradeActivity';

function snapshot(
	totalTrades = 0,
	to = Math.floor(Date.now() / 1_000)
): PublicTradeActivitySnapshot {
	return {
		success: true,
		range: { from: to - 30 * 24 * 60 * 60, to },
		totals: { tradingVolume: 0, totalTrades },
		networks: []
	};
}

describe('public trade activity cache', () => {
	beforeEach(() => {
		clearPublicTradeActivityMemoryCache();
		vi.useRealTimers();
		getKvMock.mockReset();
		getKvMock.mockResolvedValue(null);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('coalesces concurrent cold computations', async () => {
		let resolveCompute: ((value: PublicTradeActivitySnapshot) => void) | undefined;
		const compute = vi.fn(
			() =>
				new Promise<PublicTradeActivitySnapshot>((resolve) => {
					resolveCompute = resolve;
				})
		);
		const first = getCachedPublicTradeActivity(compute);
		const second = getCachedPublicTradeActivity(compute);

		await vi.waitFor(() => expect(compute).toHaveBeenCalledOnce());
		const complete = snapshot();
		resolveCompute?.(complete);
		await expect(Promise.all([first, second])).resolves.toEqual([complete, complete]);
	});

	it('reuses a complete response during the fresh window without Redis', async () => {
		const compute = vi.fn(async () => snapshot());

		await getCachedPublicTradeActivity(compute);
		await getCachedPublicTradeActivity(compute);

		expect(compute).toHaveBeenCalledOnce();
	});

	it('anchors the primary Redis TTL to the snapshot window', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
		const set = vi.fn();
		getKvMock.mockResolvedValue({ get: vi.fn(async () => null), set, del: vi.fn() });
		const complete = snapshot(2, Math.floor(Date.now() / 1_000) - 120);

		await getCachedPublicTradeActivity(async () => complete);

		expect(set).toHaveBeenCalledWith('cache:public:trade-activity', JSON.stringify(complete), {
			EX: 3_480
		});
	});

	it('serves the last complete response when a refresh fails', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const complete = snapshot(2);
		await getCachedPublicTradeActivity(async () => complete);
		vi.advanceTimersByTime(60 * 60 * 1_000 + 1);

		await expect(
			getCachedPublicTradeActivity(async () => {
				throw new Error('upstream failed');
			})
		).resolves.toEqual(complete);
	});

	it('memoizes a cold Redis stale hit for a bounded retry window', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
		const retained = snapshot(2, Math.floor(Date.now() / 1_000) - 60 * 60 - 1);
		const get = vi.fn(async (key: string) =>
			key.endsWith(':stale') ? JSON.stringify(retained) : null
		);
		getKvMock.mockResolvedValue({ get, set: vi.fn(), del: vi.fn() });
		const compute = vi.fn(async () => {
			throw new Error('upstream failed');
		});

		await expect(getCachedPublicTradeActivity(compute)).resolves.toEqual(retained);
		await expect(getCachedPublicTradeActivity(compute)).resolves.toEqual(retained);

		expect(compute).toHaveBeenCalledOnce();
	});

	it('does not serve in-memory stale data beyond its retained TTL', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		await getCachedPublicTradeActivity(async () => snapshot());
		vi.advanceTimersByTime(6 * 60 * 60 * 1_000 + 1);

		await expect(
			getCachedPublicTradeActivity(async () => {
				throw new Error('upstream failed');
			})
		).rejects.toThrow('upstream failed');
	});

	it('bounds shared HTTP caching by the snapshot stale horizon', () => {
		const to = 10_000;

		expect(publicTradeActivityCacheControl(snapshot(0, to), to)).toBe(
			'public, s-maxage=3600, stale-while-revalidate=18000'
		);
		expect(publicTradeActivityCacheControl(snapshot(0, to), to + 3_601)).toBe(
			'public, s-maxage=60, must-revalidate'
		);
		expect(publicTradeActivityCacheControl(snapshot(0, to), to + 21_601)).toBe('no-store');
	});
});
