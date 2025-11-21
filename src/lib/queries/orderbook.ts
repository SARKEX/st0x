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
	console.log('🏗️ [createOrderbookQuotesQuery] Creating query for network:', network?.id, network?.name);
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['orderbookQuotes', network?.id],
		enabled: Boolean(network),
		refetchInterval: 15_000,
		queryFn: async () => {
			try {
				console.log('🚀 [orderbookQuotesQuery] Query function executing for network:', network?.id);
				if (!network) {
					console.log('⚠️  [orderbookQuotesQuery] No network, returning empty');
					return { summary: {}, quotes: [] };
				}
				console.log('📞 [orderbookQuotesQuery] Calling fetchAndQuotePaymentTokenOrders...');
				const quotes = await fetchAndQuotePaymentTokenOrders(network.id);
				console.log('✅ [orderbookQuotesQuery] Got quotes:', quotes.length);
				const paymentToken =
					getDefaultPaymentTokenForNetwork(network.id) ?? DEFAULT_PAYMENT_TOKENS[network.id];
				if (!paymentToken?.address) {
					console.log('⚠️  [orderbookQuotesQuery] No payment token, returning quotes without summary');
					return { summary: {}, quotes };
				}
				const map = buildTokenPriceMap(quotes, paymentToken.address);
				const summary: Record<string, TokenPriceSummary> = {};
				for (const [address, value] of map.entries()) {
					summary[address.toLowerCase()] = value;
				}
				console.log('📊 [orderbookQuotesQuery] Returning summary with', Object.keys(summary).length, 'tokens');
				return { summary, quotes };
			} catch (error) {
				console.error('💥 [orderbookQuotesQuery] ERROR:', error);
				console.error('   Error details:', error instanceof Error ? error.message : String(error));
				console.error('   Stack:', error instanceof Error ? error.stack : 'No stack trace');
				throw error;
			}
		}
	});
}
