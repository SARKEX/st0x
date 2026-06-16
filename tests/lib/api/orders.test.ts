import { describe, expect, it, vi } from 'vitest';
import { Float } from '@rainlanguage/float';
import { fetchAndQuoteTokenOrders } from '$lib/api/orders';
import { apiGetOrdersByToken, type ApiOrderSummary } from '$lib/api/st0xApi';

vi.mock('$lib/api/st0xApi', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/api/st0xApi')>();
	return {
		...actual,
		apiGetOrdersByToken: vi.fn()
	};
});

const paymentToken = {
	address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
	symbol: 'USDC',
	name: 'USD Coin',
	decimals: 6,
	priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
	chainId: 8453,
	category: 'PAYMENT' as const,
	pythFeed: '',
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
});
