import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import {
	fetchAndQuotePaymentTokenOrders,
	fetchAndQuoteTokenOrders,
	buildTokenPriceMap,
	type TokenPriceSummary,
	type ProcessedQuote
} from '$lib/api/orders';
import { getDefaultPaymentTokenForNetwork, DEFAULT_PAYMENT_TOKENS } from '$lib/config/network';

export type OrderbookQuoteCache = {
	summary: Record<string, TokenPriceSummary>;
	quotes: ProcessedQuote[];
};

export type OrderbookQuoteState = OrderbookQuoteCache & { updatedAt?: number };

export function createOrderbookQuotesQuery(network: Network | null) {
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['orderbookQuotes', network?.id],
		enabled: Boolean(network),
		refetchInterval: 15_000,
		queryFn: async () => {
			try {
				if (!network) {
					return { summary: {}, quotes: [] };
				}
				const quotes = await fetchAndQuotePaymentTokenOrders(network.id);
				const paymentToken =
					getDefaultPaymentTokenForNetwork(network.id) ?? DEFAULT_PAYMENT_TOKENS[network.id];
				if (!paymentToken?.address) {
					return { summary: {}, quotes };
				}
				const map = buildTokenPriceMap(quotes, paymentToken.address);
				const summary: Record<string, TokenPriceSummary> = {};
				for (const [address, value] of map.entries()) {
					summary[address.toLowerCase()] = value;
				}
				return { summary, quotes };
			} catch (error) {
				console.error('[orderbookQuotesQuery] Failed:', error);
				throw error;
			}
		}
	});
}

/**
 * Creates a token-specific orderbook quotes query.
 * Only fetches orders for a specific token - much more efficient.
 */
export function createTokenOrderbookQuotesQuery(
	network: Network | null,
	tokenAddress: string | null
) {
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['tokenOrderbookQuotes', network?.id, tokenAddress],
		enabled: Boolean(network && tokenAddress),
		staleTime: 30_000, // Consider data fresh for 30 seconds
		refetchInterval: 60_000, // Refetch every 60 seconds (reduced from 15s)
		refetchOnWindowFocus: 'always', // Refresh when user returns to tab
		refetchIntervalInBackground: false, // Don't poll when tab is hidden
		queryFn: async () => {
			try {
				if (!network || !tokenAddress) {
					return { summary: {}, quotes: [] };
				}
				const quotes = await fetchAndQuoteTokenOrders(network.id, tokenAddress);
				const paymentToken =
					getDefaultPaymentTokenForNetwork(network.id) ?? DEFAULT_PAYMENT_TOKENS[network.id];
				if (!paymentToken?.address) {
					return { summary: {}, quotes };
				}
				const map = buildTokenPriceMap(quotes, paymentToken.address);
				const summary: Record<string, TokenPriceSummary> = {};
				for (const [address, value] of map.entries()) {
					summary[address.toLowerCase()] = value;
				}
				return { summary, quotes };
			} catch (error) {
				console.error('[tokenOrderbookQuotesQuery] Failed:', error);
				throw error;
			}
		}
	});
}
