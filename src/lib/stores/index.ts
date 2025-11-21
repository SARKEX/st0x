import { derived, writable, type Readable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import type { OracleQuote } from '$lib/queries/oracleQuotes';
import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
import { createVaultsQuery } from '$lib/queries/vaults';
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
export const currentNetwork = writable<Network>(networks[0]); // Base is default
export const wrongNetwork = derived(
	[chainId, signerAddress, currentNetwork],
	([$chainId, $signerAddress, $currentNetwork]) => $signerAddress && $chainId !== $currentNetwork.id
);

export const vaultsQuery = createNetworkQueryStore(currentNetwork, (network) =>
	createVaultsQuery(network ?? null)
);

export const oracleQuotesQuery = createNetworkQueryStore(currentNetwork, (network) =>
	createOracleQuotesQuery(network)
);

export const sfts = mapQueryData(vaultsQuery, [] as OffchainAssetReceiptVault[]);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const oracleQuotes = mapQueryData(oracleQuotesQuery, {} as Record<string, OracleQuote>);

// Store for Rainlang confirmation modal
export const rainlangConfirmationModal = writable<{
	show: boolean;
	rainlangCode: string;
	onDeploy: (() => void) | null;
	onCancel: (() => void) | null;
}>({
	show: false,
	rainlangCode: '',
	onDeploy: null,
	onCancel: null
});
