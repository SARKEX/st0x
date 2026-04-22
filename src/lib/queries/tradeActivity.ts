import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getTrades } from '$lib/api/subgraph';
import type { SgTrade } from '@rainlanguage/orderbook';
import { apiGetTradesByToken, type ApiTradeByAddress } from '$lib/api/st0xApi';

export type TradeActivityPayload = {
	trades: SgTrade[];
	range: { from: number; to: number };
};

export type TradeMetricPayload = TradeActivityPayload;

export type TokenTradeActivityPayload = {
	trades: ApiTradeByAddress[];
	range: { from: number; to: number };
};

const WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function createTradeActivityQuery(network: Network | null, pollInterval: number = 300_000) {
	return createQuery<TradeActivityPayload>({
		queryKey: ['tradeActivity', network?.id],
		enabled: Boolean(network),
		staleTime: 600_000,
		refetchInterval: pollInterval,
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const from = now - WINDOW_SECONDS;

			const trades = await getTrades(from, now, network as Network, true);

			return {
				trades,
				range: { from, to: now }
			};
		}
	});
}

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
