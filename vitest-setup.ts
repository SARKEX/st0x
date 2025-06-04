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

	return {
		...await importOriginal() as object,
		wrongNetwork: mockWrongNetworkStore
	}}
)

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
