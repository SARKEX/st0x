import { derived, writable, type Readable } from 'svelte/store';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { ApiTokenProofsResponse } from '$lib/api/st0xApi';
import type { Network } from '$lib/config/network';
import { replaceNetworkCatalog } from '$lib/config/network';
import type { MidpointPrice } from '$lib/queries/midpointPrices';
import { createMidpointPricesQuery } from '$lib/queries/midpointPrices';
import { createSftsQuery } from '$lib/queries/vaults';
import type { CreateQueryResult } from '@tanstack/svelte-query';
import { browser } from '$app/environment';

type QueryResultStore<T> = CreateQueryResult<T, Error>;

function mapQueryData<T>(queryStore: QueryResultStore<T>, fallback: T) {
	return derived(queryStore, ($query) => $query?.data ?? fallback, fallback);
}

function createNetworkQueryStore<T>(
	networkStore: Readable<Network | null>,
	factory: (network: Network | null) => QueryResultStore<T>
): QueryResultStore<T> {
	return derived(networkStore, ($network, set) => {
		const queryStore = factory($network);
		const unsubscribe = queryStore.subscribe(set);
		return () => unsubscribe();
	});
}

export const sftMetadata = writable<MetaV1S[] | null>(null);
export const tokenProofs = writable<ApiTokenProofsResponse | null>(null);
export const availableNetworks = writable<Network[]>([]);
export const currentNetwork = writable<Network | null>(null);

export function hydrateNetworkCatalog(catalog: readonly Network[]): void {
	const next = [...catalog];
	replaceNetworkCatalog(next);
	availableNetworks.set(next);
	currentNetwork.update((selected) => {
		if (selected) {
			const refreshed = next.find((network) => network.chainId === selected.chainId);
			if (refreshed) return refreshed;
		}
		return next[0] ?? null;
	});
}

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

// Store for Rainlang confirmation modal
export const rainlangConfirmationModal = writable<{
	show: boolean;
	rainlangCode: string;
	onDeploy: (() => void | Promise<void>) | null;
	onCancel: (() => void) | null;
}>({
	show: false,
	rainlangCode: '',
	onDeploy: null,
	onCancel: null
});

// Store for review strategy source code preference (persisted to localStorage)
const REVIEW_STRATEGY_KEY = 'st0x_review_strategy_on_deploy';

function createReviewStrategyStore() {
	// Initialize from localStorage if available, default to false
	const hasStorage = browser && typeof localStorage !== 'undefined';
	const initialValue = hasStorage ? localStorage.getItem(REVIEW_STRATEGY_KEY) === 'true' : false;
	const { subscribe, set } = writable<boolean>(initialValue);

	return {
		subscribe,
		set: (value: boolean) => {
			if (hasStorage) {
				localStorage.setItem(REVIEW_STRATEGY_KEY, String(value));
			}
			set(value);
		},
		toggle: () => {
			const newValue = hasStorage ? localStorage.getItem(REVIEW_STRATEGY_KEY) !== 'true' : false;
			if (hasStorage) {
				localStorage.setItem(REVIEW_STRATEGY_KEY, String(newValue));
			}
			set(newValue);
		}
	};
}

export const reviewStrategyOnDeploy = createReviewStrategyStore();

// Store for trade panel visibility (used to squish layout on large screens)
export const tradePanelOpen = writable<boolean>(false);
