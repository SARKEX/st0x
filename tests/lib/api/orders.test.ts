import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Float } from '@rainlanguage/float';
import { fetchAndQuotePaymentTokenOrders, fetchAndQuoteTokenOrders } from '$lib/api/orders';
import { HttpError } from '$lib/clients/http';
import { apiGetOrdersByToken, apiQueryOrders, type ApiOrderSummary } from '$lib/api/st0xApi';

vi.mock('$lib/api/st0xApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/st0xApi')>();
	return {
		...actual,
		apiGetOrdersByToken: vi.fn(),
		apiQueryOrders: vi.fn()
	};
});

const paymentToken = {
	address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
	symbol: 'USDC',
	name: 'USD Coin',
	decimals: 6,
	chainId: 8453,
	category: 'PAYMENT' as const,
	wrap: {
		denomination: 1,
		prefix: '',
		symbol: 'USDC',
		decimals: 6
	}
};

const stockToken = {
	address: '0x31c2c14134e6e3b7ef9478297f199331133fc2d8',
	symbol: 'wtSPYM',
	decimals: 18
};

function orderSummary(overrides: Partial<ApiOrderSummary> = {}): ApiOrderSummary {
	return {
		orderHash: '0x-order',
		owner: '0x-owner',
		chainId: 8453,
		orderBytes: '',
		inputToken: { address: paymentToken.address, symbol: paymentToken.symbol, decimals: 6 },
		outputToken: stockToken,
		outputVaultBalance: '100',
		maxOutput: '2.5',
		ioRatio: '1.2',
		orderType: 'limit',
		active: true,
		removedAt: null,
		createdAt: 1,
		orderbookId: '0x-orderbook',
		...overrides
	};
}

function mockOrders(orders: ApiOrderSummary[]) {
	vi.mocked(apiGetOrdersByToken).mockResolvedValueOnce({
		orders,
		pagination: {
			page: 1,
			pageSize: 50,
			totalOrders: orders.length,
			totalPages: 1,
			hasMore: false
		}
	});
}

beforeEach(() => {
	vi.mocked(apiGetOrdersByToken).mockReset();
	vi.mocked(apiQueryOrders).mockReset();
});

describe('fetchAndQuoteTokenOrders', () => {
	it('uses REST maxOutput rather than outputVaultBalance', async () => {
		mockOrders([orderSummary({ maxOutput: '2.5', outputVaultBalance: '100' })]);

		const quotes = await fetchAndQuoteTokenOrders(8453, stockToken.address, paymentToken);

		expect(quotes).toHaveLength(1);
		expect(quotes[0].maxOutput).toBe(Float.parse('2.5').value?.asHex());
	});

	it('uses the REST orderType classification', async () => {
		mockOrders([orderSummary({ orderType: 'dca' })]);

		const quotes = await fetchAndQuoteTokenOrders(8453, stockToken.address, paymentToken);

		expect(quotes).toHaveLength(1);
		expect(quotes[0].orderType).toBe('dca');
	});

	it('drops orders when REST maxOutput is missing', async () => {
		mockOrders([orderSummary({ maxOutput: null, outputVaultBalance: '100' })]);

		const quotes = await fetchAndQuoteTokenOrders(8453, stockToken.address, paymentToken);

		expect(quotes).toEqual([]);
	});

	it('propagates REST failures instead of presenting an empty orderbook', async () => {
		vi.mocked(apiGetOrdersByToken).mockRejectedValueOnce(new Error('REST unavailable'));

		await expect(fetchAndQuoteTokenOrders(8453, stockToken.address, paymentToken)).rejects.toThrow(
			'REST unavailable'
		);
	});

	it('returns earlier pages when a later page fails', async () => {
		vi.mocked(apiGetOrdersByToken)
			.mockResolvedValueOnce({
				orders: [orderSummary()],
				pagination: { page: 1, pageSize: 50, totalOrders: 2, totalPages: 2, hasMore: true }
			})
			.mockRejectedValueOnce(new Error('page 2 unavailable'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const quotes = await fetchAndQuoteTokenOrders(8453, stockToken.address, paymentToken);

		expect(quotes).toHaveLength(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('using partial orderbook'),
			expect.any(Error)
		);
		warn.mockRestore();
	});
});

describe('fetchAndQuotePaymentTokenOrders', () => {
	it('queries the normalized wrapped and legacy catalog in one batch request', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [orderSummary()],
			pagination: { page: 1, pageSize: 50, totalOrders: 1, totalPages: 1, hasMore: false }
		});

		const quotes = await fetchAndQuotePaymentTokenOrders(8453, paymentToken);

		expect(quotes).toHaveLength(1);
		expect(apiQueryOrders).toHaveBeenCalledOnce();
		const request = vi.mocked(apiQueryOrders).mock.calls[0][0];
		expect(request).toMatchObject({
			chainId: 8453,
			state: 'active',
			page: 1,
			pageSize: 50,
			denomination: 'wrapped'
		});
		expect(request.tokenAddresses).toContain(stockToken.address.toLowerCase());
		expect(request.tokenAddresses).toContain('0x2289249984f1fa2ce86c4e8867e7eb819ea7df95');
		expect(request.tokenAddresses).toEqual([...new Set(request.tokenAddresses)].sort());
	});

	it('deduplicates overlapping pages by normalized order hash and preserves page order', async () => {
		vi.mocked(apiQueryOrders)
			.mockResolvedValueOnce({
				orders: [
					orderSummary({ orderHash: '0x-order-a' }),
					orderSummary({ orderHash: '0x-order-b' })
				],
				pagination: { page: 1, pageSize: 2, totalOrders: 3, totalPages: 2, hasMore: true }
			})
			.mockResolvedValueOnce({
				orders: [orderSummary({ orderHash: '0X-ORDER-A' })],
				pagination: { page: 2, pageSize: 2, totalOrders: 3, totalPages: 2, hasMore: false }
			});

		const quotes = await fetchAndQuotePaymentTokenOrders(8453, paymentToken);

		expect(quotes.map((quote) => quote.orderHash)).toEqual(['0x-order-a', '0x-order-b']);
		expect(vi.mocked(apiQueryOrders).mock.calls.map(([request]) => request.page)).toEqual([1, 2]);
	});

	it('keeps identical hashes from different orderbooks and ignores only usable duplicates', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [
				orderSummary({
					orderHash: '0x-shared',
					orderbookId: '0x-orderbook-a',
					ioRatio: '-',
					maxOutput: null
				}),
				orderSummary({ orderHash: '0x-shared', orderbookId: '0x-orderbook-a' }),
				orderSummary({ orderHash: '0X-SHARED', orderbookId: '0x-orderbook-b' })
			],
			pagination: { page: 1, pageSize: 50, totalOrders: 3, totalPages: 1, hasMore: false }
		});

		const quotes = await fetchAndQuotePaymentTokenOrders(8453, paymentToken);

		expect(quotes.map((quote) => quote.orderbookId)).toEqual(['0x-orderbook-a', '0x-orderbook-b']);
	});

	it('returns an empty book without issuing token-specific requests', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [],
			pagination: { page: 1, pageSize: 50, totalOrders: 0, totalPages: 0, hasMore: false }
		});

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).resolves.toEqual([]);
		expect(apiGetOrdersByToken).not.toHaveBeenCalled();
	});

	it('keeps usable quotes when another batch order has no live quote', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [
				orderSummary({ orderHash: '0x-usable' }),
				orderSummary({ orderHash: '0x-unquoted', ioRatio: '-', maxOutput: null })
			],
			pagination: { page: 1, pageSize: 50, totalOrders: 2, totalPages: 1, hasMore: false }
		});

		const quotes = await fetchAndQuotePaymentTokenOrders(8453, paymentToken);

		expect(quotes.map((quote) => quote.orderHash)).toEqual(['0x-usable']);
	});

	it('propagates a first-page REST failure', async () => {
		vi.mocked(apiQueryOrders).mockRejectedValueOnce(new Error('REST unavailable'));

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'REST unavailable'
		);
	});

	it('propagates a 429 without issuing another request', async () => {
		const rateLimitError = new HttpError({
			status: 429,
			code: 'RATE_LIMITED',
			requestId: 'request-429',
			publicMessage: 'Too many requests',
			retryAfter: '5'
		});
		vi.mocked(apiQueryOrders).mockRejectedValueOnce(rateLimitError);

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toBe(rateLimitError);
		expect(apiQueryOrders).toHaveBeenCalledOnce();
	});

	it('rejects a later-page failure instead of replacing a complete cached book', async () => {
		vi.mocked(apiQueryOrders)
			.mockResolvedValueOnce({
				orders: [orderSummary()],
				pagination: { page: 1, pageSize: 1, totalOrders: 2, totalPages: 2, hasMore: true }
			})
			.mockRejectedValueOnce(new Error('page 2 unavailable'));

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'page 2 unavailable'
		);
	});

	it('rejects inconsistent batch pagination metadata', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [orderSummary()],
			pagination: { page: 1, pageSize: 50, totalOrders: 2, totalPages: 2, hasMore: false }
		});

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'Invalid or unstable batch pagination'
		);
	});

	it('rejects a batch response whose total pages do not match its total orders', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [orderSummary()],
			pagination: { page: 1, pageSize: 50, totalOrders: 100, totalPages: 1, hasMore: false }
		});

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'Invalid or unstable batch pagination'
		);
	});

	it('rejects a short non-final batch page', async () => {
		vi.mocked(apiQueryOrders).mockResolvedValueOnce({
			orders: [orderSummary()],
			pagination: { page: 1, pageSize: 2, totalOrders: 3, totalPages: 2, hasMore: true }
		});

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'Invalid or unstable batch pagination'
		);
	});

	it('rejects pagination totals that change between pages', async () => {
		vi.mocked(apiQueryOrders)
			.mockResolvedValueOnce({
				orders: [orderSummary()],
				pagination: { page: 1, pageSize: 1, totalOrders: 2, totalPages: 2, hasMore: true }
			})
			.mockResolvedValueOnce({
				orders: [orderSummary({ orderHash: '0x-second' })],
				pagination: { page: 2, pageSize: 1, totalOrders: 3, totalPages: 3, hasMore: true }
			});

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'Invalid or unstable batch pagination'
		);
	});

	it('rejects a batch response that exceeds the safety page cap', async () => {
		vi.mocked(apiQueryOrders).mockImplementation(async (request) => ({
			orders: [orderSummary({ orderHash: `0x-order-${request.page}` })],
			pagination: {
				page: request.page ?? 1,
				pageSize: 1,
				totalOrders: 101,
				totalPages: 101,
				hasMore: true
			}
		}));

		await expect(fetchAndQuotePaymentTokenOrders(8453, paymentToken)).rejects.toThrow(
			'Hit pagination cap'
		);
		expect(apiQueryOrders).toHaveBeenCalledTimes(100);
	});

	it('propagates cancellation instead of returning earlier pages as complete', async () => {
		const controller = new AbortController();
		const abortError = new DOMException('Aborted', 'AbortError');
		vi.mocked(apiQueryOrders)
			.mockResolvedValueOnce({
				orders: [orderSummary()],
				pagination: { page: 1, pageSize: 1, totalOrders: 2, totalPages: 2, hasMore: true }
			})
			.mockImplementationOnce(async () => {
				controller.abort();
				throw abortError;
			});

		await expect(
			fetchAndQuotePaymentTokenOrders(8453, paymentToken, controller.signal)
		).rejects.toBe(abortError);
		expect(vi.mocked(apiQueryOrders).mock.calls[1][1]).toBe(controller.signal);
	});
});
