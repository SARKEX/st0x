import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import {  web3ModalStore } from './src/lib/mocks/mockStores';

const { mockWagmiConfigStore, mockSignerAddressStore, mockChainIdStore, mockConnectedStore, mockWrongNetworkStore } =
	await vi.hoisted(() => import('./src/lib/mocks/mockStores'));

vi.mock('svelte-wagmi', async () => {
	return {
		web3Modal: web3ModalStore,
		wagmiConfig: mockWagmiConfigStore,
		signerAddress: mockSignerAddressStore,
		chainId: mockChainIdStore,
		connected: mockConnectedStore
	};
});

vi.mock('$lib/stores', async (importOriginal) => {
	const actual = await importOriginal() as object;
	return {
		...actual,
		wrongNetwork: mockWrongNetworkStore,
		currentNetwork: {
			subscribe: (fn: any) => {
				fn({
					id: 42161,
					chainId: 42161,
					name: 'arbitrum-one',
					raindexNetworkSlug: 'arbitrum2',
					displayName: 'Arbitrum One',
					currencySymbol: 'ETH',
					blockExplorer: 'https://arbiscan.io',
					sftExplorer: 'https://stox.h20.market',
					blockExplorerIcon: 'arbitrum',
					rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
					icon: 'arbitrum',
					subgraph_url: 'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.1/gn',
					metadata_subgraph_url: 'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-arbitrum-one/2025-07-06-135f/gn',
					orderbook_subgraph_url: 'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-arbitrum-one/2025-07-03-9be9/gn',
					usdcToken: {
						chainId: 42161,
						address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
						symbol: 'USDC',
						decimals: 6,
						name: 'USD Coin',
						logoUrl: '/images/USDC.png',
						priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
					}
				});
				return { unsubscribe: () => {} };
			}
		}
	};
});

vi.mock('$app/stores', async () => {
	const { readable, writable } = await import('svelte/store');
	/**
	 * @type {import('$app/stores').getStores}
	 */
	const getStores = () => ({
		navigating: readable(null),
		page: readable({
			url: new URL('http://localhost'),
			params: {}
		}),
		session: writable(null),
		updated: readable(false)
	});
	/** @type {typeof import('$app/stores').page} */
	const page = {
		subscribe(fn) {
			return getStores().page.subscribe(fn);
		}
	};
	/** @type {typeof import('$app/stores').navigating} */
	const navigating = {
		subscribe(fn) {
			return getStores().navigating.subscribe(fn);
		}
	};
	/** @type {typeof import('$app/stores').session} */
	const session = {
		subscribe(fn) {
			return getStores().session.subscribe(fn);
		}
	};
	/** @type {typeof import('$app/stores').updated} */
	const updated = {
		subscribe(fn) {
			return getStores().updated.subscribe(fn);
		}
	};
	return {
		getStores,
		navigating,
		page,
		session,
		updated
	};
});
