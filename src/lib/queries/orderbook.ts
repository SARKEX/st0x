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
	console.log(
		'🏗️ [createOrderbookQuotesQuery] Creating query for network:',
		network?.id,
		network?.name
	);
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
					console.log(
						'⚠️  [orderbookQuotesQuery] No payment token, returning quotes without summary'
					);
					return { summary: {}, quotes };
				}
				const map = buildTokenPriceMap(quotes, paymentToken.address);
				const summary: Record<string, TokenPriceSummary> = {};
				for (const [address, value] of map.entries()) {
					summary[address.toLowerCase()] = value;
				}
				console.log(
					'📊 [orderbookQuotesQuery] Returning summary with',
					Object.keys(summary).length,
					'tokens'
				);
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

/**
 * Creates a token-specific orderbook quotes query.
 * Only fetches orders for a specific token - much more efficient.
 */
export function createTokenOrderbookQuotesQuery(
	network: Network | null,
	tokenAddress: string | null
) {
	console.log(
		'🏗️ [createTokenOrderbookQuotesQuery] Creating query for token:',
		tokenAddress,
		'on network:',
		network?.id
	);
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['tokenOrderbookQuotes', network?.id, tokenAddress],
		enabled: Boolean(network && tokenAddress),
		staleTime: 30_000, // Consider data fresh for 30 seconds
		refetchInterval: 60_000, // Refetch every 60 seconds (reduced from 15s)
		refetchOnWindowFocus: 'always', // Refresh when user returns to tab
		refetchIntervalInBackground: false, // Don't poll when tab is hidden
		queryFn: async () => {
			try {
				console.log(
					'🚀 [tokenOrderbookQuotesQuery] Query function executing for token:',
					tokenAddress
				);
				if (!network || !tokenAddress) {
					console.log('⚠️  [tokenOrderbookQuotesQuery] No network or token, returning empty');
					return { summary: {}, quotes: [] };
				}
				console.log('📞 [tokenOrderbookQuotesQuery] Calling fetchAndQuoteTokenOrders...');
				const quotes = await fetchAndQuoteTokenOrders(network.id, tokenAddress);
				console.log('✅ [tokenOrderbookQuotesQuery] Got quotes:', quotes.length);
				const paymentToken =
					getDefaultPaymentTokenForNetwork(network.id) ?? DEFAULT_PAYMENT_TOKENS[network.id];
				if (!paymentToken?.address) {
					console.log(
						'⚠️  [tokenOrderbookQuotesQuery] No payment token, returning quotes without summary'
					);
					return { summary: {}, quotes };
				}
				const map = buildTokenPriceMap(quotes, paymentToken.address);
				const summary: Record<string, TokenPriceSummary> = {};
				for (const [address, value] of map.entries()) {
					summary[address.toLowerCase()] = value;
				}
				console.log(
					'📊 [tokenOrderbookQuotesQuery] Returning summary with',
					Object.keys(summary).length,
					'tokens'
				);
				return { summary, quotes };
			} catch (error) {
				console.error('💥 [tokenOrderbookQuotesQuery] ERROR:', error);
				console.error('   Error details:', error instanceof Error ? error.message : String(error));
				console.error('   Stack:', error instanceof Error ? error.stack : 'No stack trace');
				throw error;
			}
		}
	});
}
