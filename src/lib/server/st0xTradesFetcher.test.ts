import { describe, expect, it, vi } from 'vitest';
import {
	createServerTradesQueryFetcher,
	St0xTradesRateLimitError
} from '$lib/server/st0xTradesFetcher';

describe('createServerTradesQueryFetcher', () => {
	it('posts an authenticated token-set query', async () => {
		const responseBody = {
			trades: [],
			pagination: {
				page: 1,
				pageSize: 50,
				totalTrades: 0,
				totalPages: 0,
				hasMore: false
			}
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const fetchTrades = createServerTradesQueryFetcher({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic credentials',
			fetchFn: fetchMock as unknown as typeof fetch
		});
		const request = {
			chainId: 8453,
			tokenAddresses: ['0xabc'],
			startTime: 1_000,
			endTime: 2_000,
			page: 1,
			pageSize: 50
		};

		await expect(fetchTrades(request)).resolves.toEqual(responseBody);
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/trades/query',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Authorization: 'Basic credentials',
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(request),
				signal: expect.any(AbortSignal)
			})
		);
	});

	it('rejects an unsuccessful page instead of returning partial data', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('failed', { status: 502 }));
		const fetchTrades = createServerTradesQueryFetcher({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic credentials',
			fetchFn: fetchMock as unknown as typeof fetch
		});

		await expect(
			fetchTrades({
				chainId: 8453,
				tokenAddresses: ['0xabc'],
				startTime: 1_000,
				endTime: 2_000
			})
		).rejects.toThrow('Batch trades fetch failed (502)');
	});

	it('preserves Retry-After and suppresses later requests after a 429', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
		const fetchTrades = createServerTradesQueryFetcher({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic credentials',
			fetchFn: fetchMock as unknown as typeof fetch
		});
		const request = {
			chainId: 8453,
			tokenAddresses: ['0xabc'],
			startTime: 1_000,
			endTime: 2_000
		};

		await expect(fetchTrades(request)).rejects.toMatchObject({
			name: 'St0xTradesRateLimitError',
			retryAfterMs: 60_000
		} satisfies Partial<St0xTradesRateLimitError>);
		await expect(fetchTrades(request)).rejects.toBeInstanceOf(St0xTradesRateLimitError);
		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
