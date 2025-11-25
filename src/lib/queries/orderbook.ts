import { createQuery, type CreateQueryResult } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import {
	fetchAndQuotePaymentTokenOrders,
	fetchAndQuoteTokenOrders,
	buildTokenPriceMap,
	type TokenPriceSummary,
	type ProcessedQuote
} from '$lib/api/orders';
import { getDefaultPaymentTokenForNetwork, DEFAULT_PAYMENT_TOKENS } from '$lib/config/network';
import { queryClient } from '$lib/clients/queryClient';

export type OrderbookQuoteCache = {
	summary: Record<string, TokenPriceSummary>;
	quotes: ProcessedQuote[];
};

export type OrderbookQuoteState = OrderbookQuoteCache & { updatedAt?: number };

/**
 * Build summary map from quotes array.
 * Shared helper to avoid duplication.
 */
function buildSummaryFromQuotes(
	quotes: ProcessedQuote[],
	networkId: number
): Record<string, TokenPriceSummary> {
	const paymentToken =
		getDefaultPaymentTokenForNetwork(networkId) ?? DEFAULT_PAYMENT_TOKENS[networkId];
	if (!paymentToken?.address) {
		return {};
	}
	const map = buildTokenPriceMap(quotes, paymentToken.address);
	const summary: Record<string, TokenPriceSummary> = {};
	for (const [address, value] of map.entries()) {
		summary[address.toLowerCase()] = value;
	}
	return summary;
}

/**
 * Creates the global orderbook quotes query.
 * This is the single source of truth for all orders.
 *
 * @param network - Current network
 * @param poll - Whether to poll for updates (true on dashboard, false on trade pages)
 */
export function createOrderbookQuotesQuery(network: Network | null, poll: boolean = false) {
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['orderbookQuotes', network?.id],
		enabled: Boolean(network),
		staleTime: Infinity, // Data is always considered fresh until manually invalidated
		refetchInterval: poll ? 60_000 : false, // Poll every 60s only when requested
		refetchOnWindowFocus: poll ? 'always' : false,
		refetchIntervalInBackground: false,
		queryFn: async () => {
			try {
				if (!network) {
					return { summary: {}, quotes: [] };
				}
				console.log('[orderbookQuotesQuery] Fetching all orders...');
				const quotes = await fetchAndQuotePaymentTokenOrders(network.id);
				const summary = buildSummaryFromQuotes(quotes, network.id);
				return { summary, quotes };
			} catch (error) {
				console.error('[orderbookQuotesQuery] Failed:', error);
				throw error;
			}
		}
	});
}

/**
 * Get quotes for a specific token from the global cache.
 * Returns undefined if cache is empty.
 */
export function getQuotesForToken(
	networkId: number,
	tokenAddress: string
): OrderbookQuoteCache | undefined {
	const globalCache = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);
	if (!globalCache?.quotes?.length) return undefined;

	const normalizedToken = tokenAddress.toLowerCase();
	const filteredQuotes = globalCache.quotes.filter(
		(q) =>
			q.inputTokenAddress?.toLowerCase() === normalizedToken ||
			q.outputTokenAddress?.toLowerCase() === normalizedToken
	);

	if (filteredQuotes.length === 0) return undefined;

	const summary = buildSummaryFromQuotes(filteredQuotes, networkId);
	return { summary, quotes: filteredQuotes };
}

/**
 * Fetch fresh quotes for a specific token and merge into global cache.
 * Use this on trade/:id pages to get fresh data for the current token.
 */
export async function refreshTokenQuotes(
	networkId: number,
	tokenAddress: string
): Promise<OrderbookQuoteCache> {
	console.log('[refreshTokenQuotes] Fetching fresh quotes for token:', tokenAddress);

	const quotes = await fetchAndQuoteTokenOrders(networkId, tokenAddress);
	const summary = buildSummaryFromQuotes(quotes, networkId);

	// Merge into global cache
	const globalCache = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);
	if (globalCache) {
		const normalizedToken = tokenAddress.toLowerCase();

		// Remove old quotes for this token
		const otherQuotes = globalCache.quotes.filter(
			(q) =>
				q.inputTokenAddress?.toLowerCase() !== normalizedToken &&
				q.outputTokenAddress?.toLowerCase() !== normalizedToken
		);

		// Merge new quotes
		const mergedQuotes = [...otherQuotes, ...quotes];
		const mergedSummary = buildSummaryFromQuotes(mergedQuotes, networkId);

		// Update global cache
		queryClient.setQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId], {
			summary: mergedSummary,
			quotes: mergedQuotes
		});

		console.log('[refreshTokenQuotes] Merged into global cache');
	}

	return { summary, quotes };
}

/**
 * Creates a query that reads from global cache and triggers background refresh for a token.
 * Shows stale data immediately while fetching fresh data.
 *
 * @param network - Current network
 * @param tokenAddress - Token address to fetch quotes for
 * @param pollInterval - Polling interval in ms (default: 15000 for trade pages)
 */
export function createTokenOrderbookQuotesQuery(
	network: Network | null,
	tokenAddress: string | null,
	pollInterval: number | false = 15_000
) {
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['tokenOrderbookQuotes', network?.id, tokenAddress],
		enabled: Boolean(network && tokenAddress),
		staleTime: 10_000, // Consider stale after 10s to allow refetch
		refetchOnMount: 'always', // Always refresh when component mounts
		refetchInterval: pollInterval, // Poll every 15s by default on trade pages
		refetchOnWindowFocus: 'always',
		refetchIntervalInBackground: false,
		// Use global cache as initial data for instant display
		initialData: () => {
			if (!network || !tokenAddress) return undefined;
			return getQuotesForToken(network.id, tokenAddress);
		},
		initialDataUpdatedAt: () => {
			if (!network) return undefined;
			return queryClient.getQueryState(['orderbookQuotes', network.id])?.dataUpdatedAt;
		},
		queryFn: async () => {
			if (!network || !tokenAddress) {
				return { summary: {}, quotes: [] };
			}
			// Fetch fresh and merge into global cache
			return refreshTokenQuotes(network.id, tokenAddress);
		}
	});
}

/**
 * Invalidate order queries.
 * @param networkId - Network ID
 * @param tokenAddress - Optional token address. If provided, only refreshes that token's data.
 *                       If omitted, invalidates the entire global cache.
 */
export function invalidateOrderQueries(networkId?: number, tokenAddress?: string) {
	if (tokenAddress && networkId) {
		// Token-specific: fetch fresh data for this token and merge
		console.log('[OrderbookQueries] Refreshing token-specific orders:', tokenAddress);
		refreshTokenQuotes(networkId, tokenAddress).catch((err) =>
			console.error('[OrderbookQueries] Token refresh failed:', err)
		);
	} else {
		// Full invalidation: refetch entire global cache
		console.log('[OrderbookQueries] Invalidating all order queries...');
		queryClient.invalidateQueries({ queryKey: ['orderbookQuotes'] });
	}
	// Always invalidate closed orders query
	queryClient.invalidateQueries({ queryKey: ['closedOrders'] });
}

/**
 * Prefetch global orders cache in the background.
 * Call this after priority data loads to ensure global cache is populated.
 */
export async function prefetchGlobalOrders(networkId: number) {
	const existing = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);
	if (existing?.quotes?.length) {
		console.log('[prefetchGlobalOrders] Global cache already populated, skipping');
		return;
	}

	console.log('[prefetchGlobalOrders] Prefetching global orders cache...');
	await queryClient.prefetchQuery({
		queryKey: ['orderbookQuotes', networkId],
		queryFn: async () => {
			const quotes = await fetchAndQuotePaymentTokenOrders(networkId);
			const summary = buildSummaryFromQuotes(quotes, networkId);
			return { summary, quotes };
		},
		staleTime: Infinity
	});
}
