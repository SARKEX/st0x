import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getTradesByUserAllTime } from '$lib/api/subgraph';
import { calculateAllCostBases, type CostBasisData } from '$lib/utils/costBasis';
import { PAYMENT_TOKENS_BY_NETWORK } from '$lib/config/tokens';

/**
 * Query for calculating cost basis from all-time trade history.
 * Includes both market orders (where user is taker) and limit order fills (where user is maker).
 * One-shot query: fetches once on mount, refreshes on window focus only.
 * This is the most expensive query (all-time paginated), so we avoid polling.
 */
export function createCostBasisQuery(
	network: Network | null,
	userAddress: string | null
) {
	return createQuery<Map<string, CostBasisData>>({
		queryKey: ['costBasis', network?.id, userAddress],
		enabled: Boolean(network && userAddress),
		staleTime: 300_000, // 5 minutes - trade history doesn't change often
		refetchInterval: false, // No polling - fetch once on mount
		refetchOnWindowFocus: true, // Refresh when user returns to tab
		queryFn: async () => {
			if (!network || !userAddress) {
				return new Map();
			}

			// Fetch all trades for the user - both as taker (market orders) and maker (limit order fills)
			const trades = await getTradesByUserAllTime(userAddress, null, network);

			// Get payment token addresses for this network
			const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[network.chainId] ?? [];
			const paymentTokenAddresses = new Set(paymentTokens.map((t) => t.address.toLowerCase()));

			// Calculate cost basis for all traded tokens
			return calculateAllCostBases(trades, paymentTokenAddresses, userAddress);
		}
	});
}
