import { derived, writable, type Readable } from 'svelte/store';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { ApiTokenProofsResponse } from '$lib/api/st0xApi';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import type { MidpointPrice } from '$lib/queries/midpointPrices';
import { createMidpointPricesQuery } from '$lib/queries/midpointPrices';
import { createSftsQuery } from '$lib/queries/vaults';
import type { CreateQueryResult } from '@tanstack/svelte-query';

type QueryResultStore<T> = CreateQueryResult<T, Error>;

function mapQueryData<T>(queryStore: QueryResultStore<T>, fallback: T) {
	return derived(queryStore, ($query) => $query?.data ?? fallback, fallback);
}

function createNetworkQueryStore<T>(
	networkStore: Readable<Network>,
	factory: (network: Network | null) => QueryResultStore<T>
): QueryResultStore<T> {
	return derived(networkStore, ($network, set) => {
		const queryStore = factory($network ?? null);
		const unsubscribe = queryStore.subscribe(set);
		return () => unsubscribe();
	});
}

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const tokenProofs = writable<ApiTokenProofsResponse | null>(null);
export const currentNetwork = writable<Network>(networks[0]); // Base is default

// Re-export wrongNetwork from authStore to maintain backward compatibility
export { wrongNetwork } from './authStore';

export const vaultsQuery = createNetworkQueryStore(currentNetwork, (network) =>
	createSftsQuery(network ?? null)
);

export const midpointPricesQuery = createNetworkQueryStore(currentNetwork, (network) =>
	createMidpointPricesQuery(network)
);

export const sfts = mapQueryData(vaultsQuery, [] as OffchainAssetReceiptVault[]);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const midpointPrices = mapQueryData(
	midpointPricesQuery,
	{} as Record<string, MidpointPrice>
);
