import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getTrades, getTradesBySender } from '$lib/api/subgraph';
import type { SgTrade } from '@rainlanguage/orderbook';

export type TradeActivityPayload = {
	trades: SgTrade[];
	range: { from: number; to: number };
};

export type TradeMetricPayload = TradeActivityPayload;

const WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function createTradeActivityQuery(network: Network | null) {
	return createQuery<TradeActivityPayload>({
		queryKey: ['tradeActivity', network?.id],
		enabled: Boolean(network),
		refetchInterval: 300_000,
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const from = now - WINDOW_SECONDS;

			const trades = await getTrades(from, now, network as Network);

			return {
				trades,
				range: { from, to: now }
			};
		}
	});
}

/**
 * Query for user's market orders (trades where user is the taker/sender).
 * Optionally filtered by token address.
 */
export function createUserMarketOrdersQuery(
	network: Network | null,
	userAddress: string | null,
	tokenAddress: string | null
) {
	return createQuery<SgTrade[]>({
		queryKey: ['userMarketOrders', network?.id, userAddress, tokenAddress],
		enabled: Boolean(network && userAddress),
		staleTime: 30_000,
		refetchInterval: 60_000,
		queryFn: async () => {
			if (!network || !userAddress) {
				return [];
			}
			return getTradesBySender(userAddress, tokenAddress, network);
		}
	});
}
