import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getTokenByAnyAddress } from '$lib/config/network';
import {
	apiGetTradesByToken,
	apiGetTakerTrades,
	apiGetTradesBatch,
	type ApiTradeByAddress
} from '$lib/api/st0xApi';
import { bucketTimestamp, TRADE_WINDOW_BUCKET_SECONDS } from '$lib/utils/timeWindow';

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
			// Bucket the window edge so consecutive polls produce identical
			// startTime/endTime params — letting the upstream REST API serve them
			// from one cache key instead of a fresh fan-out every second.
			const now = bucketTimestamp(Math.floor(Date.now() / 1000), TRADE_WINDOW_BUCKET_SECONDS);
			const from = now - WINDOW_SECONDS;
			const PAGE_SIZE = 200;
			let allTrades: ApiTradeByAddress[] = [];
			let page = 1;

			while (page <= 50) {
				const response = await apiGetTradesByToken(primaryAddress!, page, PAGE_SIZE, from, now);
				// `?? []` because the upstream REST API occasionally omits `trades`
				// on a paginated response; `[].concat(undefined)` returns
				// `[undefined]`, which then poisons every downstream consumer.
				allTrades = allTrades.concat(response.trades ?? []);
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

	return createQuery<Map<string, ApiTradeByAddress[]>>({
		queryKey: ['batchTrades', network?.id, sortedKey],
		enabled: Boolean(network && orderHashes.length > 0),
		staleTime: 600_000,
		refetchInterval: pollInterval,
		queryFn: async () => {
			const response = await apiGetTradesBatch(orderHashes);
			const map = new Map<string, ApiTradeByAddress[]>();
			for (const entry of response.tradesByOrderHash) {
				map.set(entry.orderHash.toLowerCase(), entry.trades);
			}
			return map;
		}
	});
}

export type TakerTradesPayload = {
	trades: ApiTradeByAddress[];
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
		retry: 2,
		queryFn: async () => {
			const PAGE_SIZE = 50;
			let allTrades: ApiTradeByAddress[] = [];
			let page = 1;

			while (page <= 10) {
				const response = await apiGetTakerTrades(walletAddress!, { page, pageSize: PAGE_SIZE });
				allTrades = allTrades.concat(response.trades ?? []);
				if (!response.pagination.hasMore) break;
				page++;
			}

			return { trades: allTrades };
		}
	});
}
