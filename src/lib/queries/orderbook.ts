import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { Network } from '$lib/config/network';
import {
	fetchAndQuotePaymentTokenOrders,
	fetchAndQuoteTokenOrders,
	buildTokenPriceMap,
	type TokenPriceSummary,
	type ProcessedQuote
} from '$lib/api/orders';
import {
	getDefaultPaymentTokenForNetwork,
	DEFAULT_PAYMENT_TOKENS,
	getTokenByAnyAddress
} from '$lib/config/network';
import { queryClient } from '$lib/clients/queryClient';

/**
 * Get the set of addresses that represent a token (wrapped + legacy) for matching quotes.
 */
function getTokenAddressSet(tokenAddress: string): Set<string> {
	const normalized = tokenAddress.toLowerCase();
	const token = getTokenByAnyAddress(tokenAddress);
	const addresses = [normalized];
	if (token?.address) addresses.push(token.address.toLowerCase());
	if (token?.legacyAddress) addresses.push(token.legacyAddress.toLowerCase());
	return new Set(addresses);
}

export type OrderbookQuoteCache = {
	summary: Record<string, TokenPriceSummary>;
	quotes: ProcessedQuote[];
};

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
 * @param pollInterval - Polling interval in ms, or false to disable (default: false).
 *                       Dashboard: 60_000 (60s). Trade pages: false (uses token-specific query).
 */
export function createOrderbookQuotesQuery(
	network: Network | null,
	pollInterval: number | false = false
) {
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['orderbookQuotes', network?.id],
		enabled: Boolean(browser && network),
		staleTime: 30_000, // Stale after 30s (server caches at 15s)
		retry: 2,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
		refetchInterval: pollInterval,
		refetchOnWindowFocus: Boolean(pollInterval), // Only refetch on focus if stale
		refetchIntervalInBackground: false,
		queryFn: async () => {
			if (!network) {
				return { summary: {}, quotes: [] };
			}
			const quotes = await fetchAndQuotePaymentTokenOrders(network.id);
			const summary = buildSummaryFromQuotes(quotes, network.id);
			return { summary, quotes };
		}
	});
}

/**
 * Get quotes for a specific token from the global cache.
 * Matches both wrapped and legacy addresses so tokens like tSTOX/wtSTOX show bid/ask.
 * Returns undefined if cache is empty.
 */
export function getQuotesForToken(
	networkId: number,
	tokenAddress: string
): OrderbookQuoteCache | undefined {
	const globalCache = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);
	if (!globalCache?.quotes?.length) return undefined;

	const addressSet = getTokenAddressSet(tokenAddress);
	const filteredQuotes = globalCache.quotes.filter(
		(q) =>
			addressSet.has(q.inputTokenAddress?.toLowerCase() ?? '') ||
			addressSet.has(q.outputTokenAddress?.toLowerCase() ?? '')
	);

	if (filteredQuotes.length === 0) return undefined;

	const summary = buildSummaryFromQuotes(filteredQuotes, networkId);
	return { summary, quotes: filteredQuotes };
}

/** Minimum age (ms) of cached data before we re-fetch. Prevents redundant fetches. */
const TOKEN_QUOTE_FRESHNESS_MS = 20_000;

/**
 * Fetch fresh quotes for a specific token and merge into global cache.
 * Only fetches the wrapped (primary) address on regular polls to reduce load.
 * Legacy address quotes should be fetched once via refreshLegacyTokenQuotes().
 *
 * If the token-specific cache is younger than TOKEN_QUOTE_FRESHNESS_MS, returns
 * the existing data without making any network requests.
 */
export async function refreshTokenQuotes(
	networkId: number,
	tokenAddress: string
): Promise<OrderbookQuoteCache> {
	// Skip re-fetch if cached data is still fresh
	const cacheState = queryClient.getQueryState(['tokenOrderbookQuotes', networkId, tokenAddress]);
	if (
		cacheState?.dataUpdatedAt &&
		Date.now() - cacheState.dataUpdatedAt < TOKEN_QUOTE_FRESHNESS_MS
	) {
		const cached = queryClient.getQueryData<OrderbookQuoteCache>([
			'tokenOrderbookQuotes',
			networkId,
			tokenAddress
		]);
		if (cached) {
			return cached;
		}
	}

	const token = getTokenByAnyAddress(tokenAddress);
	// Only fetch the primary (wrapped) address on regular polls
	const primaryAddress = (token?.address ?? tokenAddress).toLowerCase();

	const quotes = await fetchAndQuoteTokenOrders(networkId, primaryAddress);
	const summary = buildSummaryFromQuotes(quotes, networkId);

	const result = { summary, quotes };

	// Write to token-specific cache so freshness checks work on next call
	queryClient.setQueryData<OrderbookQuoteCache>(
		['tokenOrderbookQuotes', networkId, tokenAddress],
		result
	);

	// Merge into global cache
	const globalCache = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);
	// Only evict quotes for the primary address we just re-fetched, preserving legacy quotes
	const primaryAddressSet = new Set([primaryAddress]);
	if (globalCache) {
		// Remove old quotes only for the primary address (not legacy addresses)
		const otherQuotes = globalCache.quotes.filter(
			(q) =>
				!primaryAddressSet.has(q.inputTokenAddress?.toLowerCase() ?? '') &&
				!primaryAddressSet.has(q.outputTokenAddress?.toLowerCase() ?? '')
		);

		// Merge new quotes
		const mergedQuotes = [...otherQuotes, ...quotes];
		const mergedSummary = buildSummaryFromQuotes(mergedQuotes, networkId);

		// Update global cache
		queryClient.setQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId], {
			summary: mergedSummary,
			quotes: mergedQuotes
		});
	}

	return result;
}

/**
 * Fetch legacy address quotes once and merge into global cache.
 * Call this once on mount for tokens with a legacyAddress (e.g. tSTOX/wtSTOX).
 */
export async function refreshLegacyTokenQuotes(
	networkId: number,
	tokenAddress: string
): Promise<void> {
	const token = getTokenByAnyAddress(tokenAddress);
	if (!token?.legacyAddress) return;

	const legacyAddr = token.legacyAddress.toLowerCase();

	const batch = await fetchAndQuoteTokenOrders(networkId, legacyAddr);
	if (batch.length === 0) return;

	// Merge into global cache
	const globalCache = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);

	// Deduplicate against existing quotes
	const existingHashes = new Set<string>();
	if (globalCache) {
		for (const q of globalCache.quotes) {
			if (q.orderHash) existingHashes.add(q.orderHash);
		}
	}

	const newQuotes = batch.filter((q) => !q.orderHash || !existingHashes.has(q.orderHash));
	if (newQuotes.length === 0) return;

	// Also merge into the token-specific cache
	const tokenCache = queryClient.getQueryData<OrderbookQuoteCache>([
		'tokenOrderbookQuotes',
		networkId,
		tokenAddress
	]);
	if (tokenCache) {
		const mergedQuotes = [...tokenCache.quotes, ...newQuotes];
		const mergedSummary = buildSummaryFromQuotes(mergedQuotes, networkId);
		queryClient.setQueryData<OrderbookQuoteCache>(
			['tokenOrderbookQuotes', networkId, tokenAddress],
			{ summary: mergedSummary, quotes: mergedQuotes }
		);
	}

	if (globalCache) {
		const mergedQuotes = [...globalCache.quotes, ...newQuotes];
		const mergedSummary = buildSummaryFromQuotes(mergedQuotes, networkId);
		queryClient.setQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId], {
			summary: mergedSummary,
			quotes: mergedQuotes
		});
	}
}

/**
 * Creates a query that reads from global cache and triggers background refresh for a token.
 * Shows stale data immediately while fetching fresh data.
 *
 * @param network - Current network
 * @param tokenAddress - Token address to fetch quotes for
 * @param pollInterval - Polling interval in ms (default: 60000 for trade pages)
 */
export function createTokenOrderbookQuotesQuery(
	network: Network | null,
	tokenAddress: string | null,
	pollInterval: number | false = 60_000
) {
	return createQuery<OrderbookQuoteCache>({
		queryKey: ['tokenOrderbookQuotes', network?.id, tokenAddress],
		enabled: Boolean(browser && network && tokenAddress),
		staleTime: 30_000, // Stale after 30s (server caches at 15s)
		retry: 2,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
		refetchOnMount: 'always', // Always refresh when component mounts
		refetchInterval: pollInterval, // Poll every 60s by default on trade pages
		refetchOnWindowFocus: true, // Only refetch on focus if stale
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
		refreshTokenQuotes(networkId, tokenAddress).catch((err) =>
			console.error('[OrderbookQueries] Token refresh failed:', err)
		);
	} else {
		// Full invalidation: refetch entire global cache
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
		return;
	}

	await queryClient.prefetchQuery({
		queryKey: ['orderbookQuotes', networkId],
		queryFn: async () => {
			const quotes = await fetchAndQuotePaymentTokenOrders(networkId);
			const summary = buildSummaryFromQuotes(quotes, networkId);
			return { summary, quotes };
		},
		staleTime: 30_000
	});
}
