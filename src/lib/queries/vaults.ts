import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { getSfts } from '$lib/api/subgraph';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';

export function createVaultsQuery(network: Network | null) {
	return createQuery<OffchainAssetReceiptVault[]>({
		queryKey: ['vaults', network?.id],
		enabled: Boolean(network?.subgraph_url),
		refetchInterval: 60_000,
		queryFn: () => getSfts(network as Network)
	});
}
