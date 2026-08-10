import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getKvMock } = vi.hoisted(() => ({
	getKvMock: vi.fn()
}));

vi.mock('$lib/server/kv', () => ({
	getKv: getKvMock
}));

import {
	clearPublicPricesMemoryCache,
	getCachedPublicPrices,
	publicPricesCacheControl,
	type PublicPricesSnapshot
} from '$lib/server/publicPricesCache';
import { St0xMarketPricesRateLimitError } from '$lib/server/marketPrices';
import { networks, TOKENS } from '$lib/config/network';

function snapshot(price = 100): PublicPricesSnapshot {
	return {
		success: true,
		prices: Object.fromEntries(
			networks.map((network) => [
				String(network.id),
				Object.fromEntries(
					TOKENS.filter(
						(token) => token.chainId === network.chainId && token.category === 'ST0x'
					).map((token) => [
						token.address.toLowerCase(),
						{ price, bid: price - 1, ask: price + 1, source: 'live', asOf: 1 }
					])
				)
			])
		)
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

describe('public prices cache', () => {
	beforeEach(() => {
		clearPublicPricesMemoryCache();
		vi.useRealTimers();
		getKvMock.mockReset();
		getKvMock.mockResolvedValue(null);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('coalesces concurrent cold computations', async () => {
		let resolveCompute: ((value: PublicPricesSnapshot) => void) | undefined;
		const compute = vi.fn(
			() =>
				new Promise<PublicPricesSnapshot>((resolve) => {
					resolveCompute = resolve;
				})
		);
		const first = getCachedPublicPrices(compute);
		const second = getCachedPublicPrices(compute);

		await vi.waitFor(() => expect(compute).toHaveBeenCalledOnce());
		resolveCompute?.(snapshot());

		const results = await Promise.all([first, second]);
		expect(results.map((result) => result.value)).toEqual([snapshot(), snapshot()]);
	});

	it('does not repeat a fresh computation when Redis is unavailable', async () => {
		const compute = vi.fn(async () => snapshot());

		await getCachedPublicPrices(compute);
		await getCachedPublicPrices(compute);

		expect(compute).toHaveBeenCalledOnce();
	});

	it('stores separate fresh and retained Redis entries', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const set = vi.fn(async () => 'OK');
		getKvMock.mockResolvedValue({
			get: vi.fn(async () => null),
			set,
			del: vi.fn(),
			eval: vi.fn()
		});

		await getCachedPublicPrices(async () => snapshot());

		expect(set).toHaveBeenCalledWith('cache:public:prices:v2', expect.any(String), { EX: 90 });
		expect(set).toHaveBeenCalledWith('cache:public:prices:v2:stale', expect.any(String), {
			EX: 21_600
		});
	});

	it('does not cache an incomplete response', async () => {
		const set = vi.fn(async (..._args: unknown[]) => 'OK');
		getKvMock.mockResolvedValue({
			get: vi.fn(async () => null),
			set,
			del: vi.fn(),
			eval: vi.fn()
		});
		const incomplete = {
			success: true,
			prices: {}
		} as unknown as PublicPricesSnapshot;

		await expect(getCachedPublicPrices(async () => incomplete)).rejects.toThrow(
			'did not return a complete snapshot'
		);
		expect(set.mock.calls.some(([key]) => key === 'cache:public:prices:v2')).toBe(false);
	});

	it('deletes an invalid primary entry and recomputes it', async () => {
		const invalid = JSON.stringify({ value: { success: true, prices: {} }, cachedAt: Date.now() });
		const get = vi.fn(async (key: string) => (key.endsWith(':stale') ? null : invalid));
		const del = vi.fn();
		getKvMock.mockResolvedValue({
			get,
			set: vi.fn(async () => 'OK'),
			del,
			eval: vi.fn()
		});
		const compute = vi.fn(async () => snapshot());

		const result = await getCachedPublicPrices(compute);

		expect(result.value).toEqual(snapshot());
		expect(compute).toHaveBeenCalledOnce();
		expect(del).toHaveBeenCalledWith('cache:public:prices:v2');
	});

	it('repairs a structurally complete primary entry with an invalid midpoint', async () => {
		const invalidSnapshot = snapshot();
		const firstNetwork = networks[0];
		const firstToken = TOKENS.filter(
			(token) => token.chainId === firstNetwork.chainId && token.category === 'ST0x'
		)[0];
		if (!firstToken) throw new Error('Expected a configured ST0x token');
		invalidSnapshot.prices[String(firstNetwork.id)][firstToken.address.toLowerCase()] = {
			price: -1,
			bid: 99,
			ask: 101,
			source: 'live',
			asOf: null
		};
		const invalid = JSON.stringify({ value: invalidSnapshot, cachedAt: Date.now() });
		const get = vi.fn(async (key: string) => (key.endsWith(':stale') ? null : invalid));
		const del = vi.fn();
		getKvMock.mockResolvedValue({
			get,
			set: vi.fn(async () => 'OK'),
			del,
			eval: vi.fn()
		});
		const compute = vi.fn(async () => snapshot(102));

		const result = await getCachedPublicPrices(compute);

		expect(result.value).toEqual(snapshot(102));
		expect(compute).toHaveBeenCalledOnce();
		expect(del).toHaveBeenCalledWith('cache:public:prices:v2');
	});

	it('serves the last complete response when a refresh fails', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const complete = snapshot(101);
		await getCachedPublicPrices(async () => complete);
		vi.advanceTimersByTime(90_001);

		const result = await getCachedPublicPrices(async () => {
			throw new Error('upstream failed');
		});

		expect(result.value).toEqual(complete);
		expect(result.isStale).toBe(true);
	});

	it('honors Retry-After before attempting another refresh', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		await getCachedPublicPrices(async () => snapshot());
		vi.advanceTimersByTime(90_001);
		const failedRefresh = vi.fn(async (): Promise<PublicPricesSnapshot> => {
			throw new St0xMarketPricesRateLimitError(60_000);
		});

		const stale = await getCachedPublicPrices(failedRefresh);
		await getCachedPublicPrices(failedRefresh);

		expect(failedRefresh).toHaveBeenCalledOnce();
		expect(stale.revalidateAt).toBe(Date.now() + 60_000);
	});

	it('shares a cold Retry-After cooldown across website instances', async () => {
		const { values, client } = memoryRedis();
		getKvMock.mockResolvedValue(client);
		const error = new St0xMarketPricesRateLimitError(60_000);
		const compute = vi.fn(async () => {
			throw error;
		});

		await expect(getCachedPublicPrices(compute)).rejects.toBe(error);
		clearPublicPricesMemoryCache();
		await expect(getCachedPublicPrices(compute)).rejects.toMatchObject({
			name: 'St0xMarketPricesRateLimitError',
			retryAfterMs: expect.any(Number)
		});

		expect(compute).toHaveBeenCalledOnce();
		expect(values.has('cache:public:prices:v2:rate-limit')).toBe(true);
	});

	it('shares generic cold failures across website instances', async () => {
		const { values, client } = memoryRedis();
		getKvMock.mockResolvedValue(client);
		const compute = vi.fn(async () => {
			throw new Error('upstream failed');
		});

		await expect(getCachedPublicPrices(compute)).rejects.toThrow('upstream failed');
		clearPublicPricesMemoryCache();
		await expect(getCachedPublicPrices(compute)).rejects.toThrow(
			'cooling down after a failed attempt'
		);

		expect(compute).toHaveBeenCalledOnce();
		expect(values.has('cache:public:prices:v2:failure')).toBe(true);
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

		await expect(getCachedPublicPrices(compute)).rejects.toThrow('upstream failed');
		await expect(getCachedPublicPrices(compute)).rejects.toThrow('upstream failed');

		expect(compute).toHaveBeenCalledOnce();
	});

	it('serves retained Redis data during a shared cooldown', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
		const retained = { value: snapshot(99), cachedAt: Date.now() - 91_000 };
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

		const result = await getCachedPublicPrices(compute);
		expect(result.value).toEqual(retained.value);
		expect(result.isStale).toBe(true);
		expect(compute).not.toHaveBeenCalled();
	});

	it('loads a retained Redis snapshot after a cold refresh failure', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
		const retained = { value: snapshot(99), cachedAt: Date.now() - 91_000 };
		const get = vi.fn(async (key: string) =>
			key.endsWith(':stale') ? JSON.stringify(retained) : null
		);
		getKvMock.mockResolvedValue({
			get,
			set: vi.fn(async () => 'OK'),
			del: vi.fn(),
			eval: vi.fn()
		});

		const result = await getCachedPublicPrices(async () => {
			throw new Error('upstream failed');
		});

		expect(result.value).toEqual(retained.value);
		expect(result.isStale).toBe(true);
	});

	it('does not serve retained data beyond six hours', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		await getCachedPublicPrices(async () => snapshot());
		vi.advanceTimersByTime(6 * 60 * 60 * 1_000 + 1);

		await expect(
			getCachedPublicPrices(async () => {
				throw new Error('upstream failed');
			})
		).rejects.toThrow('upstream failed');
	});

	it('bounds HTTP caching by freshness, retry, and retained horizons', () => {
		const cachedAt = Date.parse('2026-01-01T00:00:00Z');

		expect(
			publicPricesCacheControl(
				{
					value: snapshot(),
					cachedAt,
					isStale: false,
					revalidateAt: cachedAt + 90_000
				},
				cachedAt
			)
		).toBe('public, s-maxage=90, stale-while-revalidate=270');

		expect(
			publicPricesCacheControl(
				{
					value: snapshot(),
					cachedAt,
					isStale: true,
					revalidateAt: cachedAt + 151_000
				},
				cachedAt + 91_000
			)
		).toBe('public, s-maxage=60, must-revalidate');

		expect(
			publicPricesCacheControl(
				{
					value: snapshot(),
					cachedAt,
					isStale: true,
					revalidateAt: cachedAt + 6 * 60 * 60 * 1_000 + 1_000
				},
				cachedAt + 6 * 60 * 60 * 1_000 + 1
			)
		).toBe('no-store');
	});
});
