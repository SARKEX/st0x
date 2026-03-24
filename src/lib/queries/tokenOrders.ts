/**
 * Query for token orders from the st0x orders API (via proxy).
 * Used on the trade page to populate the Orders tab without subgraph/RPC for the list.
 */

import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import {
	fetchTokenOrdersForDisplay,
	fetchOwnerOrdersForDisplay,
	fetchTokenProcessedQuotes,
	type ApiOrderbookCache
} from '$lib/api/st0xOrders';
import type { DisplayOrder } from '$lib/types/orders';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Creates a query that fetches orders for a specific owner from the st0x API,
 * filtered to the relevant token addresses. Used for "My Orders" on the trade page.
 */
export function createOwnerOrdersQuery(
	network: Network | null,
	ownerAddress: string | null,
	tokenAddresses: Set<string> | null,
	options?: { page?: number; pageSize?: number }
) {
	const page = options?.page ?? 1;
	const pageSize = options?.pageSize ?? 50;
	const tokenKey = tokenAddresses ? [...tokenAddresses].sort().join(',') : null;

	return createQuery<DisplayOrder[]>({
		queryKey: ['ownerOrders', network?.id, ownerAddress?.toLowerCase(), tokenKey, page, pageSize],
		enabled: Boolean(network && ownerAddress),
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: async () => {
			if (!ownerAddress) return [];
			return fetchOwnerOrdersForDisplay(ownerAddress, tokenAddresses ?? undefined, page, pageSize);
		}
	});
}

/**
 * Creates a query that fetches orders for a token from the st0x API (both input and output side).
 * Reduces subgraph/RPC usage for the orders list.
 */
export function createTokenOrdersQuery(
	network: Network | null,
	tokenAddress: string | null,
	options?: { page?: number; pageSize?: number }
) {
	const page = options?.page ?? 1;
	const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

	return createQuery<DisplayOrder[]>({
		queryKey: ['tokenOrders', network?.id, tokenAddress?.toLowerCase(), page, pageSize],
		enabled: Boolean(network && tokenAddress),
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: async () => {
			if (!tokenAddress) return [];
			return fetchTokenOrdersForDisplay(tokenAddress, page, pageSize);
		}
	});
}

/**
 * Creates a query that fetches ProcessedQuote[] for a token from the st0x API.
 * Replaces createTokenOrderbookQuotesQuery (which hit SG + RPC) for the trade page.
 * Returns the same OrderbookQuoteCache shape so MarketOrder.svelte requires no prop changes.
 */
export function createTokenApiQuotesQuery(
	network: Network | null,
	tokenAddress: string | null,
	options?: { page?: number; pageSize?: number }
) {
	const page = options?.page ?? 1;
	const pageSize = options?.pageSize ?? 50;

	return createQuery<ApiOrderbookCache>({
		queryKey: ['tokenApiQuotes', network?.id, tokenAddress?.toLowerCase(), page, pageSize],
		enabled: Boolean(network && tokenAddress),
		staleTime: 60_000,
		refetchInterval: 60_000,
		queryFn: async () => {
			if (!tokenAddress) return { quotes: [], summary: {} };
			return fetchTokenProcessedQuotes(tokenAddress, page, pageSize);
		}
	});
}
