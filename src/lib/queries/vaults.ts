import { createQuery, type QueryClient } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getSfts, getSftById } from '$lib/api/subgraph';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';

export function createVaultsQuery(network: Network | null) {
	return createQuery<OffchainAssetReceiptVault[]>({
		queryKey: ['vaults', network?.id],
		enabled: Boolean(network?.subgraph_url),
		refetchInterval: 60_000,
		queryFn: () => getSfts(network as Network)
	});
}

/**
 * Query for a single token by ID.
 * Checks the global vaults cache first - if found, uses that data.
 * Falls back to fetching just the single token (much faster than fetching all).
 */
export function createSingleVaultQuery(
	tokenId: string | null,
	network: Network | null,
	queryClient?: QueryClient
) {
	// Try to get from global cache first
	const getCachedToken = (): OffchainAssetReceiptVault | undefined => {
		if (!queryClient || !tokenId || !network) return undefined;
		const allVaults = queryClient.getQueryData<OffchainAssetReceiptVault[]>(['vaults', network.id]);
		return allVaults?.find((v) => v.id.toLowerCase() === tokenId.toLowerCase());
	};

	const getCachedTimestamp = (): number | undefined => {
		if (!queryClient || !network) return undefined;
		return queryClient.getQueryState(['vaults', network.id])?.dataUpdatedAt;
	};

	return createQuery<OffchainAssetReceiptVault | null>({
		queryKey: ['vault', network?.id, tokenId],
		enabled: Boolean(network?.subgraph_url && tokenId),
		staleTime: 30_000,
		refetchInterval: 60_000,
		refetchOnWindowFocus: 'always',
		// Use cached data from global vaults query if available
		initialData: getCachedToken() ?? undefined,
		initialDataUpdatedAt: getCachedTimestamp(),
		queryFn: async () => {
			if (!network || !tokenId) return null;
			return getSftById(tokenId, network);
		}
	});
}
