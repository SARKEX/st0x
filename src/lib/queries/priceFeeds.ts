import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { TOKENS, CRYPTO_TOKENS } from '$lib/config/network';
import { getPythQuotes } from '$lib/api/pyth';
import type { TradingViewQuote } from '$lib/api/tradingview';

function tokensWithPriceFeed(network: Network | null) {
	if (!network) return [];
	const all = [...TOKENS, ...CRYPTO_TOKENS];
	return all.filter((token) => token.chainId === network.chainId && token.priceFeedId);
}

export function createPriceFeedsQuery(network: Network | null) {
	return createQuery<TradingViewQuote[]>({
		queryKey: ['priceFeeds', network?.id],
		enabled: Boolean(network),
		refetchInterval: 300_000,
		queryFn: () => getPythQuotes(tokensWithPriceFeed(network), network as Network)
	});
}
