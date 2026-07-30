import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiMarketPrice } from '$lib/api/st0xApi';
import { fetchMarketPrices, toWebsiteMarketPrices } from './marketPrices';

vi.mock('$env/dynamic/private', () => ({
	env: {
		ST0X_API_URL: 'https://api.example.test/',
		ST0X_API_KEY: 'test-key',
		ST0X_API_SECRET: 'test-secret'
	}
}));

const row: ApiMarketPrice = {
	chainId: 8453,
	assetAddress: '0xAbCd',
	symbol: 'wtTEST',
	quoteAddress: '0xQuote',
	bestBid: '99.25',
	bestAsk: '100.75',
	midpoint: '100',
	source: 'cached',
	observedAt: 1_784_800_000,
	change24hPercent: '1.42'
};

describe('toWebsiteMarketPrices', () => {
	it('normalizes canonical address casing and timestamp units', () => {
		expect(toWebsiteMarketPrices([row])).toEqual({
			'0xabcd': {
				price: 100,
				bid: 99.25,
				ask: 100.75,
				source: 'cached',
				asOf: 1_784_800_000_000,
				change24hPercent: 1.42
			}
		});
	});

	it('preserves unavailable prices as null', () => {
		expect(
			toWebsiteMarketPrices([
				{
					...row,
					bestBid: null,
					bestAsk: null,
					midpoint: null,
					source: 'unavailable',
					observedAt: null,
					change24hPercent: null
				}
			])['0xabcd']
		).toEqual({
			price: null,
			bid: null,
			ask: null,
			source: 'unavailable',
			asOf: null,
			change24hPercent: null
		});
	});
});

describe('fetchMarketPrices', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('retries transient upstream responses', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [row] }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		await expect(fetchMarketPrices(8453, { at: 1_784_800_000, maxAttempts: 2 })).resolves.toEqual([
			row
		]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://api.example.test/v1/prices?chainId=8453&at=1784800000'
		);
	});

	it('does not retry permanent 4xx responses', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(fetchMarketPrices(8453)).rejects.toThrow('Market prices fetch failed (400)');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('bounds a stalled request with the configured timeout', async () => {
		const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(fetchMarketPrices(8453, { timeoutMs: 1, maxAttempts: 1 })).rejects.toBeDefined();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
