import { derived, writable, type Readable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import type { OracleQuote } from '$lib/queries/oracleQuotes';
import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
import { createVaultsQuery } from '$lib/queries/vaults';
import type { OffchainAssetReceiptVault as Vault } from '$lib/types/OffchainAssetReceiptVault';

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const currentNetwork = writable<Network>(networks[0]); // Base is default
export const wrongNetwork = derived(
	[chainId, signerAddress, currentNetwork],
	([$chainId, $signerAddress, $currentNetwork]) => $signerAddress && $chainId !== $currentNetwork.id
);
export const vaultsQuery = derived(currentNetwork, ($network) => createVaultsQuery($network ?? null));

export const oracleQuotesQuery = derived(currentNetwork, ($network) =>
	createOracleQuotesQuery($network)
);

export const sfts = derived(
	vaultsQuery,
	($query) => ($query as any)?.data ?? [],
	[] as OffchainAssetReceiptVault[]
);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const oracleQuotes = derived(
	oracleQuotesQuery,
	($query) => ($query as any)?.data ?? {},
	{} as Record<string, OracleQuote>
);

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
