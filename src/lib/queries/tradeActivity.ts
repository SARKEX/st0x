import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getTokenByAnyAddress } from '$lib/config/network';
import {
	apiGetTradesByToken,
	apiGetTakerTrades,
	apiGetTradesBatch,
	type ApiTradeByAddress,
	type ApiMarketOrder,
	type ApiOrderTradeEntry
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
	// Resolve to wrapped (primary) address — the SFT subgraph returns the unwrapped
	// vault address, but trades are indexed by the wrapped ERC20 token address.
	const primaryAddress = tokenAddress
		? (getTokenByAnyAddress(tokenAddress)?.address ?? tokenAddress).toLowerCase()
		: null;

	return createQuery<TokenTradeActivityPayload>({
		queryKey: ['tokenTradeActivity', network?.id, tokenAddress],
		enabled: Boolean(network && primaryAddress),
		staleTime: 600_000,
		refetchInterval: pollInterval,
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const from = now - WINDOW_SECONDS;
			const PAGE_SIZE = 200;
			let allTrades: ApiTradeByAddress[] = [];
			let page = 1;

			while (page <= 50) {
				const response = await apiGetTradesByToken(primaryAddress!, page, PAGE_SIZE, from, now);
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

/**
 * Fetch trades for a batch of order hashes.
 * Returns a map of orderHash → trade entries for computing filled amounts.
 */
export function createBatchTradesQuery(
	network: Network | null,
	orderHashes: string[],
	pollInterval: number = 600_000
) {
	// Stable query key: sort hashes so order doesn't matter
	const sortedKey = orderHashes.slice().sort().join(',');

	return createQuery<Map<string, ApiOrderTradeEntry[]>>({
		queryKey: ['batchTrades', network?.id, sortedKey],
		enabled: Boolean(network && orderHashes.length > 0),
		staleTime: 600_000,
		refetchInterval: pollInterval,
		queryFn: async () => {
			const response = await apiGetTradesBatch(orderHashes);
			const map = new Map<string, ApiOrderTradeEntry[]>();
			for (const entry of response.orders) {
				map.set(entry.orderHash.toLowerCase(), entry.trades);
			}
			return map;
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
