import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import {
	fetchAndQuotePaymentTokenOrders,
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
			const quotes = await fetchAndQuotePaymentTokenOrders(network?.id);
			const paymentToken =
				(network && getDefaultPaymentTokenForNetwork(network.id)) ||
				(network && DEFAULT_PAYMENT_TOKENS[network.id]);
			if (!paymentToken?.address) {
				return { summary: {}, quotes };
			}
			const map = buildTokenPriceMap(quotes, paymentToken.address);
			const summary: Record<string, TokenPriceSummary> = {};
			for (const [address, value] of map.entries()) {
				summary[address.toLowerCase()] = value;
			}
			return { summary, quotes };
		}
	});
}
