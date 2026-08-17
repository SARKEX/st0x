import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTradeByAddress } from '$lib/api/st0xApi';

const apiMocks = vi.hoisted(() => ({
	apiGetTradesByAddress: vi.fn(),
	apiGetTakerTrades: vi.fn(),
	apiGetTradesByToken: vi.fn(),
	apiGetTradesBatch: vi.fn()
}));

vi.mock('$lib/api/st0xApi', () => apiMocks);

import { fetchAllUserTrades } from '$lib/queries/costBasis';
import { fetchRecentTakerTrades } from '$lib/queries/tradeActivity';

function trade(id: string): ApiTradeByAddress {
	return {
		txHash: `0x${id}`,
		orderHash: `0xorder${id}`,
		timestamp: 1_700_000_000,
		inputAmount: '1',
		outputAmount: '2',
		inputToken: { address: '0xinput' },
		outputToken: { address: '0xoutput' }
	} as ApiTradeByAddress;
}

function page(trades: ApiTradeByAddress[], hasMore: boolean) {
	return {
		trades,
		pagination: { page: 1, pageSize: 500, totalTrades: trades.length, totalPages: 1, hasMore }
	};
}

describe('trade history request amplification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('loads cost-basis history in 500-trade pages and exposes fetched taker trades', async () => {
		const makerOne = trade('maker-1');
		const makerTwo = trade('maker-2');
		const taker = trade('taker-1');
		apiMocks.apiGetTradesByAddress
			.mockResolvedValueOnce(page([makerOne], true))
			.mockResolvedValueOnce(page([makerTwo], false));
		apiMocks.apiGetTakerTrades.mockResolvedValueOnce(page([taker], false));

		const result = await fetchAllUserTrades('0xuser');

		expect(apiMocks.apiGetTradesByAddress).toHaveBeenNthCalledWith(1, '0xuser', {
			page: 1,
			pageSize: 500
		});
		expect(apiMocks.apiGetTradesByAddress).toHaveBeenNthCalledWith(2, '0xuser', {
			page: 2,
			pageSize: 500
		});
		expect(apiMocks.apiGetTakerTrades).toHaveBeenCalledOnce();
		expect(apiMocks.apiGetTakerTrades).toHaveBeenCalledWith('0xuser', {
			page: 1,
			pageSize: 500
		});
		expect(result.costBasisTrades).toHaveLength(3);
		expect(result.takerTrades).toEqual([taker]);
	});

	it('loads the 500 most recent display trades in one request', async () => {
		const trades = [trade('taker-1'), trade('taker-2')];
		apiMocks.apiGetTakerTrades.mockResolvedValueOnce(page(trades, true));

		await expect(fetchRecentTakerTrades('0xuser')).resolves.toEqual({ trades });
		expect(apiMocks.apiGetTakerTrades).toHaveBeenCalledOnce();
		expect(apiMocks.apiGetTakerTrades).toHaveBeenCalledWith('0xuser', {
			page: 1,
			pageSize: 500
		});
	});
});
