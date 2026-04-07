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
			console.log('[refreshTokenQuotes] Cache still fresh, skipping fetch');
			return cached;
		}
	}

	const token = getTokenByAnyAddress(tokenAddress);
	// Only fetch the primary (wrapped) address on regular polls
	const primaryAddress = token?.address ?? tokenAddress;
	const uniqueAddresses = [primaryAddress.toLowerCase()];

	console.log(
		'[refreshTokenQuotes] Fetching fresh quotes for token:',
		tokenAddress,
		uniqueAddresses
	);

	const quotes: ProcessedQuote[] = [];
	const seenOrderHash = new Set<string>();
	for (const addr of uniqueAddresses) {
		const batch = await fetchAndQuoteTokenOrders(networkId, addr);
		for (const q of batch) {
			if (q.orderHash && !seenOrderHash.has(q.orderHash)) {
				seenOrderHash.add(q.orderHash);
				quotes.push(q);
			} else if (!q.orderHash) {
				quotes.push(q);
			}
		}
	}
	const summary = buildSummaryFromQuotes(quotes, networkId);

	// Merge into global cache (if it exists, for QuickTrade backward compat)
	const globalCache = queryClient.getQueryData<OrderbookQuoteCache>(['orderbookQuotes', networkId]);
	const addressSet = getTokenAddressSet(tokenAddress);
	if (globalCache) {
		// Remove old quotes for this token (wrapped or legacy)
		const otherQuotes = globalCache.quotes.filter(
			(q) =>
				!addressSet.has(q.inputTokenAddress?.toLowerCase() ?? '') &&
				!addressSet.has(q.outputTokenAddress?.toLowerCase() ?? '')
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
	console.log('[refreshLegacyTokenQuotes] Fetching legacy quotes once:', legacyAddr);

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
		console.log('[refreshLegacyTokenQuotes] Merged legacy quotes into caches');
	}
}

/**
 * Invalidate order queries.
 * @param networkId - Network ID
 * @param tokenAddress - Optional token address. If provided, only refreshes that token's data.
 *                       If omitted, invalidates all order caches.
 */
export function invalidateOrderQueries(networkId?: number, tokenAddress?: string) {
	if (tokenAddress && networkId) {
		// Token-specific: refresh old pipeline for QuickTrade + invalidate API cache
		console.log('[OrderbookQueries] Refreshing token-specific orders:', tokenAddress);
		refreshTokenQuotes(networkId, tokenAddress).catch((err) =>
			console.error('[OrderbookQueries] Token refresh failed:', err)
		);
		queryClient.invalidateQueries({
			queryKey: ['tokenApiQuotes', networkId, tokenAddress.toLowerCase()]
		});
	} else {
		// Full invalidation: both old Raindex cache and new API cache
		console.log('[OrderbookQueries] Invalidating all order queries...');
		queryClient.invalidateQueries({ queryKey: ['orderbookQuotes'] });
		queryClient.invalidateQueries({ queryKey: ['tokenApiQuotes'] });
	}
	// Always invalidate closed orders query
	queryClient.invalidateQueries({ queryKey: ['closedOrders'] });
}

/**
 * Prefetch global orders cache in the background.
 * Call this after priority data loads to ensure global cache is populated.
 * Used by QuickTrade for market order execution.
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
