import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { TOKENS, CRYPTO_TOKENS } from '$lib/config/network';
import { getPythQuotes } from '$lib/api/pyth';
import type { TradingViewQuote } from '$lib/api/tradingview';
import type { OracleQuote } from '$lib/queries/oracleQuotes';
import { queryClient } from '$lib/clients/queryClient';

function tokensWithPriceFeed(network: Network | null) {
	if (!network) return [];
	const all = [...TOKENS, ...CRYPTO_TOKENS];
	return all.filter((token) => token.chainId === network.chainId && token.priceFeedId);
}

/**
 * Derives TradingViewQuote[] from the oracleQuotes cache when available,
 * falling back to a direct Pyth fetch on cache miss (first load).
 * This eliminates a duplicate HTTP request to Pyth Hermes.
 */
export function createPriceFeedsQuery(network: Network | null) {
	return createQuery<TradingViewQuote[]>({
		queryKey: ['priceFeeds', network?.id],
		enabled: Boolean(network),
		refetchInterval: 20_000,
		queryFn: async () => {
			const tokens = tokensWithPriceFeed(network);
			if (!tokens.length || !network) return [];

			// Try to read from the oracleQuotes cache (populated by the 15s poll)
			const cached = queryClient.getQueryData<Record<string, OracleQuote>>([
				'oracleQuotes',
				network.id
			]);

			if (cached && Object.keys(cached).length > 0) {
				return tokens.map((token) => {
					const entry = cached[token.address.toLowerCase()];
					return {
						symbol: token.tradingViewSymbol ?? token.symbol ?? null,
						close: entry?.price ?? null,
						open: null,
						high: null,
						low: null,
						volume: null,
						change: null,
						changeAbs: null,
						changePercent: null,
						week52High: null,
						week52Low: null,
						marketCap: null,
						prevClose: null
					};
				});
			}

			// Cache not ready yet — fall back to direct fetch (only happens on first load)
			return getPythQuotes(tokens, network);
		}
	});
}
