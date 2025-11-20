import { derived, writable, type Readable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import type { OracleQuote } from '$lib/queries/oracleQuotes';
import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
import { createVaultsQuery } from '$lib/queries/vaults';

function mapQueryData<T>(queryStore: Readable<{ data?: T }>, fallback: T) {
	return derived(
		queryStore,
		($query) => {
			return $query?.data ?? fallback;
		},
		fallback
	);
}

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const currentNetwork = writable<Network>(networks[0]); // Base is default
export const wrongNetwork = derived(
	[chainId, signerAddress, currentNetwork],
	([$chainId, $signerAddress, $currentNetwork]) => $signerAddress && $chainId !== $currentNetwork.id
);
export const vaultsQuery: Readable<{ data?: OffchainAssetReceiptVault[] }> = derived(
	currentNetwork,
	($network) => createVaultsQuery($network ?? null) as { data?: OffchainAssetReceiptVault[] }
);

export const oracleQuotesQuery: Readable<{ data?: Record<string, OracleQuote> }> = derived(
	currentNetwork,
	($network) => createOracleQuotesQuery($network) as { data?: Record<string, OracleQuote> }
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
