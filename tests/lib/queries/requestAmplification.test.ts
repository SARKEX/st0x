import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ApiTradeByAddress } from '$lib/api/st0xApi';
import type { Network } from '$lib/config/network';

const apiMocks = vi.hoisted(() => ({
	apiGetTradesByAddress: vi.fn(),
	apiGetTakerTrades: vi.fn(),
	apiGetTradesByToken: vi.fn(),
	apiGetTradesBatch: vi.fn()
}));
const queryMocks = vi.hoisted(() => ({
	createQuery: vi.fn((options: unknown) => options)
}));

vi.mock('$lib/api/st0xApi', () => apiMocks);
vi.mock('@tanstack/svelte-query', () => queryMocks);

import { createCostBasisQuery, fetchAllUserTrades } from '$lib/queries/costBasis';
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
		const takerOne = trade('taker-1');
		const takerTwo = trade('taker-2');
		apiMocks.apiGetTradesByAddress
			.mockResolvedValueOnce(page([makerOne], true))
			.mockResolvedValueOnce(page([makerTwo], false));
		apiMocks.apiGetTakerTrades
			.mockResolvedValueOnce(page([takerOne], true))
			.mockResolvedValueOnce(page([takerTwo], false));

		const result = await fetchAllUserTrades('0xuser');

		expect(apiMocks.apiGetTradesByAddress).toHaveBeenNthCalledWith(1, '0xuser', {
			page: 1,
			pageSize: 500
		});
		expect(apiMocks.apiGetTradesByAddress).toHaveBeenNthCalledWith(2, '0xuser', {
			page: 2,
			pageSize: 500
		});
		expect(apiMocks.apiGetTakerTrades).toHaveBeenCalledTimes(2);
		expect(apiMocks.apiGetTakerTrades).toHaveBeenNthCalledWith(1, '0xuser', {
			page: 1,
			pageSize: 500
		});
		expect(apiMocks.apiGetTakerTrades).toHaveBeenNthCalledWith(2, '0xuser', {
			page: 2,
			pageSize: 500
		});
		expect(result.costBasisTrades).toHaveLength(4);
		expect(result.takerTrades).toEqual([takerOne]);
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

	it('retries a failed cost-basis walk on focus without refetching successful data', () => {
		const options = createCostBasisQuery(
			{ id: 8453, chainId: 8453 } as Network,
			'0xuser'
		) as unknown as {
			staleTime: number;
			retry: boolean;
			refetchOnWindowFocus: (query: { state: { status: string } }) => boolean;
		};

		expect(options.staleTime).toBe(Infinity);
		expect(options.retry).toBe(false);
		expect(options.refetchOnWindowFocus({ state: { status: 'error' } })).toBe(true);
		expect(options.refetchOnWindowFocus({ state: { status: 'success' } })).toBe(false);
	});

	it('keeps recent market orders independent from the all-history cost-basis walk', () => {
		const source = readFileSync(
			resolve(process.cwd(), 'src/routes/(main)/dashboard/+page.svelte'),
			'utf8'
		);
		const marketOrdersTransform = source.slice(
			source.indexOf('// Transform taker trades into display orders'),
			source.indexOf('// Extract user\'s order hashes')
		);

		expect(source).toContain('createTakerTradesQuery($currentNetwork, $walletAddress, 600_000)');
		expect(marketOrdersTransform).toContain('$takerTradesQuery?.data?.trades');
		expect(marketOrdersTransform).not.toContain('$costBasisQuery');
	});
});
