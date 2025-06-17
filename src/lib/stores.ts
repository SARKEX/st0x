import { derived, writable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import { type Chain } from '@wagmi/core/chains';
import { arbitrum } from '@wagmi/core/chains';
import type { OffchainAssetReceiptVault } from './types/OffchainAssetReceiptVault';

export const targetNetwork = writable<Chain>(arbitrum);
export const wrongNetwork = derived(
	[chainId, signerAddress, targetNetwork],
	([$chainId, $signerAddress, $targetNetwork]) => $signerAddress && $chainId !== $targetNetwork.id
);
export const sfts = writable<OffchainAssetReceiptVault[]>([]);
export const infoModalOpen = writable(false);
