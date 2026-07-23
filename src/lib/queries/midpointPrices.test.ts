import { describe, expect, it, vi } from 'vitest';
import { fetchMidpointPrices } from '$lib/queries/midpointPrices';
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
			async () => new Response(null, { status: 429 })
		) as unknown as typeof fetch;

		await expect(fetchMidpointPrices(8453, fetchFn)).rejects.toThrow(
			'Public prices request failed (429)'
		);
	});
});
