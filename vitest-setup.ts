import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { web3ModalStore } from './tests/mocks/mockStores';
import { mockCurrentNetwork } from './tests/mocks/mockCurrentNetwork';
import { TEST_CRYPTO_TOKENS, TEST_ST0X_TOKENS } from './tests/fixtures/st0xTokenCatalog';
import { replaceTokenCatalog } from './src/lib/config/tokens';
import { replaceNetworkCatalog, type Network } from './src/lib/config/networks';

const {
	mockWagmiConfigStore,
	mockSignerAddressStore,
	mockChainIdStore,
	mockConnectedStore,
	mockWrongNetworkStore
} = await vi.hoisted(() => import('./tests/mocks/mockStores'));

// SvelteKit's vitest resolver produces a virtual module for `$env/dynamic/public`
// whose `env` is undefined in the test environment. Provide a default empty `env`;
// test files that need specific values can re-mock per-test.
vi.mock('$env/dynamic/public', () => ({ env: {} }));

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
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		wrongNetwork: mockWrongNetworkStore,
		currentNetwork: {
			subscribe: (fn: any) => {
				fn(mockCurrentNetwork);
				return { unsubscribe: () => {} };
			}
		}
	};
});

// Plan 01-07 (OBS-03) added a transitive `@sentry/sveltekit` import via
// `src/lib/services/observability/captureTakeOrderFailure.ts` → `marketOrderExecution.ts`.
// The browser entry of @sentry/sveltekit imports `$app/stores` from inside node_modules,
// which Vite's resolver cannot reach (only the SvelteKit Vite plugin produces those
// virtual modules, and it doesn't process node_modules). Mock the SDK to no-op stubs
// so test files that transitively load it don't crash. Production behaviour is
// unaffected — Sentry init is gated on !dev && DSN in hooks.{client,server}.ts.
vi.mock('@sentry/sveltekit', async () => {
	const noop = () => {};
	const noopHandler =
		() =>
		async ({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) =>
			resolve(event);
	return {
		init: noop,
		captureException: noop,
		captureMessage: noop,
		addBreadcrumb: noop,
		setUser: noop,
		setTag: noop,
		setContext: noop,
		setExtra: noop,
		withScope: (fn: (scope: unknown) => void) =>
			fn({ setTag: noop, setContext: noop, setExtra: noop }),
		sentryHandle: noopHandler,
		handleErrorWithSentry: () => () => undefined,
		// Vite plugin export is referenced by vite.config.js but tests don't run Vite plugins.
		sentrySvelteKit: () => ({ name: 'sentry-sveltekit-mock' })
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

// Runtime catalogs are intentionally empty until the application hydrates them.
// Unit tests use an explicit registry/API fixture so they exercise the same dynamic path.
replaceTokenCatalog([...TEST_ST0X_TOKENS, ...TEST_CRYPTO_TOKENS]);
replaceNetworkCatalog([mockCurrentNetwork as Network]);
