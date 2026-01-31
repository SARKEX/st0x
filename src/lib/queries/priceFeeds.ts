import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getPythQuotes } from '$lib/api/pyth';
import type { TradingViewQuote } from '$lib/api/tradingview';
import { tokensWithPriceFeed } from './shared';

export function createPriceFeedsQuery(network: Network | null) {
	return createQuery<TradingViewQuote[]>({
		queryKey: ['priceFeeds', network?.id],
		enabled: Boolean(network),
		refetchInterval: 300_000,
		queryFn: () => getPythQuotes(tokensWithPriceFeed(network), network as Network)
	});
}
