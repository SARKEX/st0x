import { derived, writable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import { type Chain } from '@wagmi/core/chains';
import { arbitrum } from '@wagmi/core/chains';
import type { OffchainAssetReceiptVault } from './types/OffchainAssetReceiptVault';
import type { SgTrade } from '@rainlanguage/orderbook/common';
import type { Token } from 'sushi/currency';

export const targetNetwork = writable<Chain>(arbitrum);
export const wrongNetwork = derived(
	[chainId, signerAddress, targetNetwork],
	([$chainId, $signerAddress, $targetNetwork]) => $signerAddress && $chainId !== $targetNetwork.id
);
export const sfts = writable<OffchainAssetReceiptVault[]>([]);
export const trades = writable<SgTrade[]>([]);
export const infoModalOpen = writable(false);

// Store for order token selection
export const orderTokenStore = writable<{
	inputToken?: Token;
	outputToken?: Token;
	orderType?: string;
}>({});
