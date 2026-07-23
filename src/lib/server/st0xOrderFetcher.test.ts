import { describe, expect, it, vi } from 'vitest';
import { createServerOrderFetcher, St0xOrdersRateLimitError } from '$lib/server/st0xOrderFetcher';

describe('createServerOrderFetcher', () => {
	it('builds an authenticated paginated orders request', async () => {
		const fetchMock = vi
			.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>()
			.mockResolvedValue(
				new Response(
					JSON.stringify({
						orders: [],
						pagination: {
							page: 1,
							pageSize: 50,
							totalOrders: 0,
							totalPages: 0,
							hasMore: false
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
			);
		const fetchFn = fetchMock as unknown as typeof fetch;
		const fetchOrders = createServerOrderFetcher({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic credentials',
			fetchFn
		});

		await fetchOrders('0xToken', { page: 1, pageSize: 50 });

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.example.test/v1/orders/token/0xToken?page=1&pageSize=50',
			expect.objectContaining({
				headers: {
					Authorization: 'Basic credentials',
					Accept: 'application/json'
				},
				signal: expect.any(AbortSignal)
			})
		);
	});

	it('stops the remaining fanout after the first 429', async () => {
		const fetchMock = vi
			.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: 'rate limited' }), {
					status: 429,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		const fetchFn = fetchMock as unknown as typeof fetch;
		const fetchOrders = createServerOrderFetcher({
			apiBase: 'https://api.example.test',
			authHeader: 'Basic credentials',
			fetchFn
		});

		await expect(fetchOrders('0xFirst', { page: 1, pageSize: 50 })).rejects.toBeInstanceOf(
			St0xOrdersRateLimitError
		);
		await expect(fetchOrders('0xSecond', { page: 1, pageSize: 50 })).rejects.toBeInstanceOf(
			St0xOrdersRateLimitError
		);

		expect(fetchMock).toHaveBeenCalledOnce();
	});
});
