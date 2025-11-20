import { derived, writable, type Readable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import { getResourceStore, type TimedResource } from '$lib/stores/cache';
import type { OracleQuote } from '$lib/queries/oracleQuotes';
import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
import type { CreateQueryResult } from '@tanstack/svelte-query';

type DomainKey =
	| 'vaultSnapshot'
	| 'oracleQuotes';

function createNetworkResourceStore<T>(domain: DomainKey) {
	return derived(
		currentNetwork,
		($network, set) => {
			set(null);
			if (!$network) {
				return () => {};
			}
			const resourceStore = getResourceStore($network.id, domain) as unknown as Readable<
				TimedResource<T>
			>;
			const unsubscribe = resourceStore.subscribe(set);
			return () => {
				unsubscribe();
			};
		},
		null as TimedResource<T> | null
	);
}

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const currentNetwork = writable<Network>(networks[0]); // Base is default
export const wrongNetwork = derived(
	[chainId, signerAddress, currentNetwork],
	([$chainId, $signerAddress, $currentNetwork]) => $signerAddress && $chainId !== $currentNetwork.id
);
export const vaultSnapshotResource =
	createNetworkResourceStore<OffchainAssetReceiptVault[]>('vaultSnapshot');
export const oracleQuotesQuery = derived(currentNetwork, ($network) =>
	createOracleQuotesQuery($network)
);

export const sfts = derived(
	vaultSnapshotResource,
	($resource) => $resource?.data ?? [],
	[] as OffchainAssetReceiptVault[]
);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const oracleQuotes = derived(oracleQuotesQuery as any, ($query: any) => $query?.data ?? {});

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
