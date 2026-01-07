import { derived, writable, type Readable } from 'svelte/store';
import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import type { Network } from '$lib/config/network';
import { networks } from '$lib/config/network';
import type { OracleQuote } from '$lib/queries/oracleQuotes';
import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
import { createVaultsQuery } from '$lib/queries/vaults';
import type { CreateQueryResult } from '@tanstack/svelte-query';
import { browser } from '$app/environment';

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

// Re-export wrongNetwork from authStore to maintain backward compatibility
export { wrongNetwork } from './authStore';

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

// Store for review strategy source code preference (persisted to localStorage)
const REVIEW_STRATEGY_KEY = 'st0x_review_strategy_on_deploy';

function createReviewStrategyStore() {
	// Initialize from localStorage if available, default to false
	const initialValue = browser ? localStorage.getItem(REVIEW_STRATEGY_KEY) === 'true' : false;
	const { subscribe, set } = writable<boolean>(initialValue);

	return {
		subscribe,
		set: (value: boolean) => {
			if (browser) {
				localStorage.setItem(REVIEW_STRATEGY_KEY, String(value));
			}
			set(value);
		},
		toggle: () => {
			const newValue = browser ? localStorage.getItem(REVIEW_STRATEGY_KEY) !== 'true' : false;
			if (browser) {
				localStorage.setItem(REVIEW_STRATEGY_KEY, String(newValue));
			}
			set(newValue);
		}
	};
}

export const reviewStrategyOnDeploy = createReviewStrategyStore();

// Store for pay fees in stablecoin preference (persisted to localStorage)
const PAY_FEES_STABLECOIN_KEY = 'st0x_pay_fees_in_stablecoin';

function createPayFeesInStablecoinStore() {
	// Initialize from localStorage if available, default to true (pay with USDC)
	// This provides a better UX since users don't need to hold ETH on Base to trade
	const storedValue = browser ? localStorage.getItem(PAY_FEES_STABLECOIN_KEY) : null;
	const initialValue = storedValue !== null ? storedValue === 'true' : true;
	const { subscribe, set } = writable<boolean>(initialValue);

	return {
		subscribe,
		set: (value: boolean) => {
			if (browser) {
				localStorage.setItem(PAY_FEES_STABLECOIN_KEY, String(value));
			}
			set(value);
		},
		toggle: () => {
			const newValue = browser ? localStorage.getItem(PAY_FEES_STABLECOIN_KEY) !== 'true' : false;
			if (browser) {
				localStorage.setItem(PAY_FEES_STABLECOIN_KEY, String(newValue));
			}
			set(newValue);
		}
	};
}

export const payFeesInStablecoin = createPayFeesInStablecoinStore();

// Store for trade panel visibility (used to squish layout on large screens)
export const tradePanelOpen = writable<boolean>(false);
