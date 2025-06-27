import { derived, writable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import { type Chain } from '@wagmi/core/chains';
import { arbitrum } from '@wagmi/core/chains';
import type { OffchainAssetReceiptVault } from './types/OffchainAssetReceiptVault';
import type { SgTrade } from '@rainlanguage/orderbook/common';
import type { Token } from 'sushi/currency';
import type { ApiStockQuote } from './types';

export const targetNetwork = writable<Chain>(arbitrum);
export const wrongNetwork = derived(
	[chainId, signerAddress, targetNetwork],
	([$chainId, $signerAddress, $targetNetwork]) => $signerAddress && $chainId !== $targetNetwork.id
);
export const sfts = writable<OffchainAssetReceiptVault[]>([]);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const currentTokenPrice = writable<{
	price: number;
	change: number;
	changePercent: number;
} | null>(null);
export const trades = writable<SgTrade[]>([]);
export const infoModalOpen = writable(false);
export const tokenGlobalQuote = writable<ApiStockQuote[]>([]);

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

// Store for order token selection
export const orderTokenStore = writable<{
	inputToken?: Token;
	outputToken?: Token;
	orderType?: 'Buy' | 'Sell';
}>({});
