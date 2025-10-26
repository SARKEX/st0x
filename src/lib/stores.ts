import { derived, writable, type Readable } from 'svelte/store';
import { chainId, signerAddress } from 'svelte-wagmi';
import type { OffchainAssetReceiptVault } from './types/OffchainAssetReceiptVault';
import type { TradingViewQuote } from './services/tradingview';
import type { MetaV1S } from './types/OffchainAssetReceiptVault';
import type { Network } from './network';
import { networks } from './network';
import {
        getResourceStore,
        type TimedResource,
        type OrderbookQuoteCache,
        type TradeMetricPayload,
        type OracleQuote
} from '$lib/stores/network-data-cache';
import type { TokenPriceSummary } from '$lib/utils/quote';

type DomainKey =
	| 'vaultSnapshot'
	| 'orderbookQuotes'
	| 'priceFeeds'
	| 'tradeActivity'
	| 'oracleQuotes';

function createNetworkResourceStore<T>(domain: DomainKey) {
        return derived(currentNetwork, ($network, set) => {
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
        }, null as TimedResource<T> | null);
}

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const currentNetwork = writable<Network>(networks[0]); // Base is default
export const wrongNetwork = derived(
	[chainId, signerAddress, currentNetwork],
	([$chainId, $signerAddress, $currentNetwork]) => $signerAddress && $chainId !== $currentNetwork.id
);
export const vaultSnapshotResource = createNetworkResourceStore<OffchainAssetReceiptVault[]>('vaultSnapshot');
export const orderbookQuotesResource = createNetworkResourceStore<OrderbookQuoteCache>('orderbookQuotes');
export const priceFeedsResource = createNetworkResourceStore<TradingViewQuote[]>('priceFeeds');
export const tradeActivityResource = createNetworkResourceStore<TradeMetricPayload>('tradeActivity');
export const oracleQuotesResource = createNetworkResourceStore<Record<string, OracleQuote>>('oracleQuotes');

export const sfts = derived(
        vaultSnapshotResource,
        ($resource) => $resource?.data ?? [],
        [] as OffchainAssetReceiptVault[]
);
export const currentToken = writable<OffchainAssetReceiptVault | null>(null);
export const tokenGlobalQuote = derived(
        priceFeedsResource,
        ($resource) => $resource?.data ?? [],
        [] as TradingViewQuote[]
);
export const orderbookQuotes = derived(
        orderbookQuotesResource,
        ($resource) => $resource?.data?.summary ?? {},
        {} as Record<string, TokenPriceSummary>
);
export const oracleQuotes = derived(
        oracleQuotesResource,
        ($resource) => $resource?.data ?? {},
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
