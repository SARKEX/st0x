import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	apiGetSwapCalldataV2,
	apiGetSwapQuoteV2,
	apiGetTradesByToken,
	apiGetTradesBatch,
	apiQueryOrders,
	apiQueryTrades
} from '$lib/api/st0xApi';

describe('st0x API client', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('forwards cancellation to token trade requests', async () => {
		const responseBody = {
			trades: [],
			pagination: { page: 1, pageSize: 200, totalTrades: 0, totalPages: 0, hasMore: false }
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const signal = new AbortController().signal;

		await expect(apiGetTradesByToken('0xToken', 1, 200, 1_000, 2_000, signal)).resolves.toEqual(
			responseBody
		);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v1/trades/token/0xToken?page=1&pageSize=200&startTime=1000&endTime=2000',
			expect.objectContaining({ signal })
		);
	});

	it('posts v2 swap calldata requests through the authenticated proxy', async () => {
		const responseBody = {
			to: '0x0000000000000000000000000000000000000001',
			data: '0x1234',
			value: '0x0',
			estimatedInput: '100',
			denomination: 'wrapped' as const,
			resolvedPriceCap: '2.02',
			approvals: []
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiGetSwapCalldataV2({
			taker: '0x0000000000000000000000000000000000000002',
			inputToken: '0x0000000000000000000000000000000000000003',
			outputToken: '0x0000000000000000000000000000000000000004',
			mode: 'spendUpTo',
			amount: '100',
			slippageBps: 100
		});

		expect(result).toEqual(responseBody);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v2/swap/calldata',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					taker: '0x0000000000000000000000000000000000000002',
					inputToken: '0x0000000000000000000000000000000000000003',
					outputToken: '0x0000000000000000000000000000000000000004',
					mode: 'spendUpTo',
					amount: '100',
					slippageBps: 100
				})
			})
		);
	});

	it('posts mode-based quotes through the authenticated proxy', async () => {
		const responseBody = {
			inputToken: '0x0000000000000000000000000000000000000003',
			outputToken: '0x0000000000000000000000000000000000000004',
			mode: 'buyUpTo' as const,
			amount: '2',
			denomination: 'wrapped' as const,
			estimatedInput: '5',
			estimatedOutput: '2',
			estimatedIoRatio: '2.5',
			fullyFilled: true,
			resolvedPriceCap: '2.525'
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const request = {
			taker: '0x0000000000000000000000000000000000000002',
			inputToken: responseBody.inputToken,
			outputToken: responseBody.outputToken,
			mode: 'buyUpTo' as const,
			amount: '2',
			slippageBps: 100,
			referenceIoRatio: '2.5'
		};
		const signal = new AbortController().signal;
		const result = await apiGetSwapQuoteV2(request, signal);

		expect(result).toEqual(responseBody);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v2/swap/quote',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(request),
				signal
			})
		);
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
