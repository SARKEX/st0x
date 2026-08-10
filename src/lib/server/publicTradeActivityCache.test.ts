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
import { aggregateNetwork } from '$lib/server/publicTradeActivity';
import { St0xTradesRateLimitError } from '$lib/server/st0xTradesFetcher';
import { networks } from '$lib/config/network';

function snapshot(
	totalTrades = 0,
	to = Math.floor(Date.now() / 1_000)
): PublicTradeActivitySnapshot {
	return {
		success: true,
		range: { from: to - 30 * 24 * 60 * 60, to },
		totals: { tradingVolume: 0, totalTrades },
		networks: networks.map((network, index) => ({
			...aggregateNetwork(network, []),
			totalTrades: index === 0 ? totalTrades : 0
		}))
	};
}

function memoryRedis() {
	const values = new Map<string, string>();
	return {
		values,
		client: {
			get: vi.fn(async (key: string) => values.get(key) ?? null),
			set: vi.fn(async (key: string, value: string, options: { NX?: boolean }) => {
				if (options.NX && values.has(key)) return null;
				values.set(key, value);
				return 'OK';
			}),
			del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
			eval: vi.fn(async (_script: string, options: { keys: string[] }) => {
				const key = options.keys[0];
				if (key) values.delete(key);
				return 1;
			})
		}
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
		const set = vi.fn(async () => 'OK');
		getKvMock.mockResolvedValue({
			get: vi.fn(async () => null),
			set,
			del: vi.fn(),
			eval: vi.fn()
		});
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
		getKvMock.mockResolvedValue({
			get,
			set: vi.fn(async () => 'OK'),
			del: vi.fn(),
			eval: vi.fn()
		});
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

	it('suppresses repeated cold refreshes until the upstream Retry-After', async () => {
		const error = new St0xTradesRateLimitError(120_000);
		const compute = vi.fn(async () => {
			throw error;
		});

		await expect(getCachedPublicTradeActivity(compute)).rejects.toBe(error);
		await expect(getCachedPublicTradeActivity(compute)).rejects.toBe(error);

		expect(compute).toHaveBeenCalledOnce();
	});

	it('shares a cold Retry-After cooldown across website instances', async () => {
		const { values, client } = memoryRedis();
		getKvMock.mockResolvedValue(client);
		const error = new St0xTradesRateLimitError(120_000);
		const compute = vi.fn(async () => {
			throw error;
		});

		await expect(getCachedPublicTradeActivity(compute)).rejects.toBe(error);
		clearPublicTradeActivityMemoryCache();
		await expect(getCachedPublicTradeActivity(compute)).rejects.toMatchObject({
			name: 'St0xTradesRateLimitError',
			retryAfterMs: expect.any(Number)
		});

		expect(compute).toHaveBeenCalledOnce();
		expect(values.has('cache:public:trade-activity:rate-limit')).toBe(true);
	});

	it('shares generic cold failures across website instances', async () => {
		const { values, client } = memoryRedis();
		getKvMock.mockResolvedValue(client);
		const compute = vi.fn(async () => {
			throw new Error('upstream failed');
		});

		await expect(getCachedPublicTradeActivity(compute)).rejects.toThrow('upstream failed');
		clearPublicTradeActivityMemoryCache();
		await expect(getCachedPublicTradeActivity(compute)).rejects.toThrow(
			'cooling down after a failed attempt'
		);

		expect(compute).toHaveBeenCalledOnce();
		expect(values.has('cache:public:trade-activity:failure')).toBe(true);
	});

	it('suppresses repeated generic failures locally when Redis writes fail', async () => {
		getKvMock.mockResolvedValue({
			get: vi.fn(async () => null),
			set: vi.fn(async (_key: string, _value: string, options: { NX?: boolean } | undefined) => {
				if (options?.NX) return 'OK';
				throw new Error('Redis write failed');
			}),
			del: vi.fn(),
			eval: vi.fn(async () => 1)
		});
		const compute = vi.fn(async () => {
			throw new Error('upstream failed');
		});

		await expect(getCachedPublicTradeActivity(compute)).rejects.toThrow('upstream failed');
		await expect(getCachedPublicTradeActivity(compute)).rejects.toThrow('upstream failed');

		expect(compute).toHaveBeenCalledOnce();
	});

	it('serves retained Redis data during a shared cooldown', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
		const retained = snapshot(2, Math.floor(Date.now() / 1_000) - 60 * 60 - 1);
		const retryUntil = Date.now() + 60_000;
		getKvMock.mockResolvedValue({
			get: vi.fn(async (key: string) => {
				if (key.endsWith(':rate-limit')) return JSON.stringify({ retryUntil });
				if (key.endsWith(':stale')) return JSON.stringify(retained);
				return null;
			}),
			set: vi.fn(),
			del: vi.fn(),
			eval: vi.fn()
		});
		const compute = vi.fn(async () => snapshot());

		await expect(getCachedPublicTradeActivity(compute)).resolves.toEqual(retained);
		expect(compute).not.toHaveBeenCalled();
	});

	it('rejects a partial retained snapshot', async () => {
		const partial = { ...snapshot(), networks: [] };
		getKvMock.mockResolvedValue({
			get: vi.fn(async (key: string) => (key.endsWith(':stale') ? JSON.stringify(partial) : null)),
			set: vi.fn(async () => 'OK'),
			del: vi.fn(),
			eval: vi.fn()
		});

		await expect(
			getCachedPublicTradeActivity(async () => {
				throw new Error('upstream failed');
			})
		).rejects.toThrow('upstream failed');
	});

	it('rejects retained snapshots with missing token rows or inconsistent totals', async () => {
		const missingToken = snapshot();
		const firstNetwork = missingToken.networks[0];
		if (!firstNetwork) throw new Error('Expected a configured network');
		firstNetwork.tokens = firstNetwork.tokens.slice(1);
		const inconsistent = snapshot();
		inconsistent.totals.totalTrades = 1;

		for (const partial of [missingToken, inconsistent]) {
			clearPublicTradeActivityMemoryCache();
			getKvMock.mockResolvedValue({
				get: vi.fn(async (key: string) =>
					key.endsWith(':stale') ? JSON.stringify(partial) : null
				),
				set: vi.fn(async () => 'OK'),
				del: vi.fn(),
				eval: vi.fn()
			});

			await expect(
				getCachedPublicTradeActivity(async () => {
					throw new Error('upstream failed');
				})
			).rejects.toThrow('upstream failed');
		}
	});

	it('retains stale data for the complete upstream Retry-After window', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const complete = snapshot(2);
		await getCachedPublicTradeActivity(async () => complete);
		vi.advanceTimersByTime(60 * 60 * 1_000 + 1);
		const compute = vi.fn(async () => {
			throw new St0xTradesRateLimitError(120_000);
		});

		await expect(getCachedPublicTradeActivity(compute)).resolves.toEqual(complete);
		vi.advanceTimersByTime(60_000);
		await expect(getCachedPublicTradeActivity(compute)).resolves.toEqual(complete);

		expect(compute).toHaveBeenCalledOnce();
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
