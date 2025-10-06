import { derived, writable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import type { OffchainAssetReceiptVault } from './types/OffchainAssetReceiptVault';
import type { SgTrade } from '@rainlanguage/orderbook';
import type { Token } from 'sushi';
import type { TradingViewQuote } from './services/tradingview';
import type { MetaV1S } from './types/OffchainAssetReceiptVault';
import type { Network } from './network';
import { networks } from './network';

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const currentNetwork = writable<Network>(networks[1]); // Base is default
export const wrongNetwork = derived(
	[chainId, signerAddress, currentNetwork],
	([$chainId, $signerAddress, $currentNetwork]) => $signerAddress && $chainId !== $currentNetwork.id
);
export const sfts = writable<OffchainAssetReceiptVault[]>([]);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const currentTokenPrice = writable<{
	price: number;
	change: number;
	changePercent: number;
} | null>(null);
export const trades = writable<SgTrade[]>([]);
export const tokenGlobalQuote = writable<TradingViewQuote[]>([]);

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
