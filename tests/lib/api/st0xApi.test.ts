import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGetTradesBatch, apiQueryOrders, apiQueryTrades } from '$lib/api/st0xApi';

describe('st0x API client', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('posts the API-owned batch request to the proxy', async () => {
		const response = {
			orders: [],
			pagination: {
				page: 1,
				pageSize: 50,
				totalOrders: 0,
				totalPages: 0,
				hasMore: false
			}
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(response), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const request = {
			chainId: 8453,
			tokenAddresses: ['0xabc'],
			state: 'active' as const,
			page: 1,
			pageSize: 50,
			denomination: 'wrapped' as const
		};
		const signal = new AbortController().signal;

		await expect(apiQueryOrders(request, signal)).resolves.toEqual(response);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v1/orders/query',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(request),
				signal
			})
		);
	});

	it('posts token-set trade queries and returns the paginated response', async () => {
		const response = {
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
			new Response(JSON.stringify(response), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const request = {
			chainId: 8453,
			tokenAddresses: ['0xabc'],
			startTime: 1_000,
			endTime: 2_000,
			page: 1,
			pageSize: 50,
			denomination: 'wrapped' as const
		};
		const signal = new AbortController().signal;

		await expect(apiQueryTrades(request, signal)).resolves.toEqual(response);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v1/trades/query',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(request),
				signal
			})
		);
	});

	it('preserves the existing grouped order-hash batch contract', async () => {
		const response = {
			tradesByOrderHash: [{ orderHash: '0xhash', trades: [] }],
			totalCount: 0
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(response), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiGetTradesBatch(['0xhash'])).resolves.toEqual(response);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v1/trades/query',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ orderHashes: ['0xhash'] })
			})
		);
	});
});
