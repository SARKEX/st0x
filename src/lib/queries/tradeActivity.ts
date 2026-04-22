import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import {
	apiGetTradesByToken,
	apiGetTakerTrades,
	type ApiTradeByAddress,
	type ApiMarketOrder
} from '$lib/api/st0xApi';

export type TokenTradeActivityPayload = {
	trades: ApiTradeByAddress[];
	range: { from: number; to: number };
};

const WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function createTokenTradeActivityQuery(
	network: Network | null,
	tokenAddress: string | null,
	pollInterval: number = 300_000
) {
	return createQuery<TokenTradeActivityPayload>({
		queryKey: ['tokenTradeActivity', network?.id, tokenAddress],
		enabled: Boolean(network && tokenAddress),
		staleTime: 600_000,
		refetchInterval: pollInterval,
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const from = now - WINDOW_SECONDS;
			const PAGE_SIZE = 200;
			let allTrades: ApiTradeByAddress[] = [];
			let page = 1;

			while (page <= 50) {
				const response = await apiGetTradesByToken(
					tokenAddress!,
					page,
					PAGE_SIZE,
					from,
					now
				);
				allTrades = allTrades.concat(response.trades);
				if (!response.pagination.hasMore) break;
				page++;
			}

			return {
				trades: allTrades,
				range: { from, to: now }
			};
		}
	});
}

export type TakerTradesPayload = {
	marketOrders: ApiMarketOrder[];
};

export function createTakerTradesQuery(
	network: Network | null,
	walletAddress: string | null,
	pollInterval: number = 600_000
) {
	return createQuery<TakerTradesPayload>({
		queryKey: ['takerTrades', network?.id, walletAddress],
		enabled: Boolean(network && walletAddress),
		staleTime: 600_000,
		refetchInterval: pollInterval,
		queryFn: async () => {
			const PAGE_SIZE = 50;
			let allOrders: ApiMarketOrder[] = [];
			let page = 1;

			while (page <= 10) {
				const response = await apiGetTakerTrades(walletAddress!, { page, pageSize: PAGE_SIZE });
				allOrders = allOrders.concat(response.marketOrders);
				if (!response.pagination.hasMore) break;
				page++;
			}

			return { marketOrders: allOrders };
		}
	});
}
