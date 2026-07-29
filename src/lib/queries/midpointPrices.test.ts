import { describe, expect, it, vi } from 'vitest';
import { fetchMidpointPrices, shouldRetryMidpointPrices } from '$lib/queries/midpointPrices';
import { HttpError } from '$lib/clients/http';
import type { MidpointPrice } from '$lib/utils/midpointPrice';

describe('fetchMidpointPrices', () => {
	it('returns prices for the requested network', async () => {
		const price: MidpointPrice = {
			price: 123.45,
			bid: 123,
			ask: 123.9,
			source: 'live',
			asOf: 1
		};
		const fetchFn = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						success: true,
						prices: { '8453': { '0xtoken': price } }
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		) as unknown as typeof fetch;

		await expect(fetchMidpointPrices(8453, fetchFn)).resolves.toEqual({ '0xtoken': price });
	});

	it('rejects a rate-limited refresh instead of replacing cached prices with an empty map', async () => {
		const fetchFn = vi.fn(
			async () => new Response(null, { status: 429, headers: { 'Retry-After': '60' } })
		) as unknown as typeof fetch;

		const error = await fetchMidpointPrices(8453, fetchFn).catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(HttpError);
		expect((error as HttpError).status).toBe(429);
		expect((error as HttpError).retryAfter).toBe('60');
		expect(fetchFn).toHaveBeenCalledOnce();
	});
});

describe('shouldRetryMidpointPrices', () => {
	it('defers 429s to the scheduled refresh and bounds other retries', () => {
		const rateLimited = new HttpError({
			status: 429,
			code: 'RATE_LIMITED',
			requestId: null,
			publicMessage: 'Too many requests',
			retryAfter: '60'
		});
		const unavailable = new HttpError({
			status: 503,
			code: 'UPSTREAM_UNAVAILABLE',
			requestId: null,
			publicMessage: 'Unavailable',
			retryAfter: null
		});

		expect(shouldRetryMidpointPrices(0, rateLimited)).toBe(false);
		expect(shouldRetryMidpointPrices(0, unavailable)).toBe(true);
		expect(shouldRetryMidpointPrices(2, unavailable)).toBe(false);
	});
});
