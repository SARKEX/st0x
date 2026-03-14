import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getTrades } from '$lib/api/subgraph';
import type { SgTrade } from '@rainlanguage/orderbook';

export type TradeActivityPayload = {
	trades: SgTrade[];
	range: { from: number; to: number };
};

export type TradeMetricPayload = TradeActivityPayload;

const WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function createTradeActivityQuery(network: Network | null, pollInterval: number = 300_000) {
	return createQuery<TradeActivityPayload>({
		queryKey: ['tradeActivity', network?.id],
		enabled: Boolean(network),
		staleTime: 120_000,
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
