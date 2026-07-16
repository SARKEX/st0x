import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import transactionStore from '$lib/stores/transaction';
import { readContract, sendTransaction, waitForTransactionReceipt, estimateGas } from '@wagmi/core';
import {
	TOKENS,
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork
} from '$lib/config/network';
import { rainlangConfirmationModal, currentNetwork, reviewStrategyOnDeploy } from '$lib/stores';

const STOXs = TOKENS;
import {
	getMarketMakingDeploymentArgs,
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getFolioDeploymentArgs
} from '$lib/services/orderDeployment';
import { mockCurrentNetwork } from '../mocks/mockCurrentNetwork';
import { createRaindexClient } from '$lib/clients/raindex';
import { decodeFunctionData } from 'viem';

// Shared mock network object to avoid repetition
const mockNetwork = mockCurrentNetwork;

const PAYMENT_TOKEN =
	DEFAULT_PAYMENT_TOKENS[mockNetwork.id] ?? getDefaultPaymentTokenForNetwork(mockNetwork.id);

if (!PAYMENT_TOKEN) {
	throw new Error('Missing default payment token for mock network');
}

vi.mock('$lib/services/orderDeployment', async (importOriginal) => {
	return {
		...((await importOriginal()) as object),
		getMarketMakingDeploymentArgs: vi.fn(),
		getDcaDeploymentArgs: vi.fn(),
		getLimitOrderDeploymentArgs: vi.fn(),
		getFolioDeploymentArgs: vi.fn()
	};
});

vi.mock('$lib/clients/raindex', () => ({
	createRaindexClient: vi.fn(),
	RAIN_STRATEGIES_COMMIT: 'mock-commit-hash'
}));

vi.mock('@wagmi/core', () => ({
	sendTransaction: vi.fn(),
	waitForTransactionReceipt: vi.fn(),
	readContract: vi.fn(),
	estimateGas: vi.fn()
}));

vi.mock('viem', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		decodeFunctionData: vi.fn()
	};
});

vi.mock('svelte-wagmi', async () => {
	// Import the mock stores INSIDE the factory (don't capture top-level vars)
	const {
		web3ModalStore,
		mockWagmiConfigStore,
		mockSignerAddressStore,
		mockChainIdStore,
		mockConnectedStore
	} = await import('../mocks/mockStores');

	return {
		web3Modal: web3ModalStore,
		wagmiConfig: mockWagmiConfigStore,
		signerAddress: mockSignerAddressStore,
		chainId: mockChainIdStore,
		connected: mockConnectedStore
	};
});

vi.mock('$lib/stores/authStore', async () => {
	const { mockWalletAddressStore, mockAuthMethodStore, mockWrongNetworkStore } = await import(
		'../mocks/mockStores'
	);
	return {
		walletAddress: mockWalletAddressStore,
		authMethod: mockAuthMethodStore,
		wrongNetwork: mockWrongNetworkStore
	};
});

vi.mock('svelte/store', async () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const actual = (await vi.importActual('svelte/store')) as any;
	// Import stores to check against them
	const {
		mockSignerAddressStore,
		mockWagmiConfigStore,
		mockChainIdStore,
		mockWalletAddressStore,
		mockAuthMethodStore
	} = await import('../mocks/mockStores');
	return {
		...actual,
		get: vi.fn().mockImplementation((store: unknown) => {
			if (store === transactionStore) return transactionStore;
			if (store === rainlangConfirmationModal) return actual.get(store);
			if (store === currentNetwork) {
				return mockCurrentNetwork;
			}
			if (store === reviewStrategyOnDeploy) {
				return true; // Enable modal flow for tests
			}
			// For writable stores from mockStores, manually get the value
			if (
				store === mockSignerAddressStore ||
				store === mockWagmiConfigStore ||
				store === mockChainIdStore ||
				store === mockWalletAddressStore ||
				store === mockAuthMethodStore
			) {
				let value: unknown;
				const unsubscribe = (
					store as { subscribe: (fn: (v: unknown) => void) => () => void }
				).subscribe((v: unknown) => {
					value = v;
				});
				unsubscribe();
				return value;
			}
			// For other stores with subscribe, use the actual get function
			if (
				store &&
				typeof store === 'object' &&
				'subscribe' in store &&
				typeof (store as { subscribe: unknown }).subscribe === 'function'
			) {
				return actual.get(store);
			}
			// Fallback
			return undefined;
		})
	};
});

// Helper to create mock deployment args with sensible defaults
function createMockDeploymentArgs(overrides = {}) {
	return {
		composedRainlang: 'mock rainlang code',
		deploymentArgs: {
			deploymentCalldata: '0xabcdef',
			raindexAddress: '0x1234',
			approvals: [
				{
					calldata: '0xapproval',
					token: '0xtoken',
					symbol: 'TEST'
				}
			],
			chainId: 8453,
			emitMetaCall: undefined,
			...overrides
		}
	};
}

describe('transactionStore tests', () => {
	// Factory for creating mock deployment args with type-specific overrides
	function createDeploymentArgsByType(type: 'DSF' | 'DCA' | 'LIMIT' | 'FOLIO') {
		const approvalCounts: Record<string, number> = { DSF: 2, DCA: 1, LIMIT: 1, FOLIO: 7 };
		const approvalCount = approvalCounts[type];

		const composedRainlangMap: Record<string, string> = {
			DSF: 'mock rainlang code for market making',
			DCA: 'mock rainlang code for dca',
			LIMIT: 'mock rainlang code for limit order',
			FOLIO: 'mock rainlang code for folio'
		};

		return createMockDeploymentArgs({
			composedRainlang: composedRainlangMap[type],
			...(approvalCount > 1 && {
				deploymentArgs: {
					deploymentCalldata: '0xabcdef',
					raindexAddress: '0x1234',
					approvals: Array.from({ length: approvalCount }, (_, i) => ({
						calldata: approvalCount === 2 ? `0xapproval${i}` : '0xapproval',
						token: approvalCount === 2 ? `0xtoken${i}` : `0xtoken${i}`,
						symbol: approvalCount === 2 ? `TEST${i}` : `TEST${i}`
					})),
					chainId: 8453,
					emitMetaCall: undefined
				}
			})
		});
	}

	const mockDeploymentArgsMarketMaking = createDeploymentArgsByType('DSF');
	const mockDeploymentArgsDca = createDeploymentArgsByType('DCA');
	const mockDeploymentArgsLimitOrder = createDeploymentArgsByType('LIMIT');
	const mockDeploymentArgsFolio = createDeploymentArgsByType('FOLIO');

	let mockGetAddOrdersForTransaction: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		transactionStore.reset();

		// Set up the mock stores with proper values
		const { mockSignerAddressStore, mockWagmiConfigStore, mockWalletAddressStore } = await import(
			'../mocks/mockStores'
		);
		const { mockWeb3Config } = await import('../mocks/mockWagmiConfig');
		mockSignerAddressStore.set('0x1234567890123456789012345678901234567890');
		mockWalletAddressStore.set('0x1234567890123456789012345678901234567890');
		mockWagmiConfigStore.set(mockWeb3Config);

		vi.mocked(getMarketMakingDeploymentArgs).mockResolvedValue(mockDeploymentArgsMarketMaking);
		vi.mocked(getDcaDeploymentArgs).mockResolvedValue(mockDeploymentArgsDca);
		vi.mocked(getLimitOrderDeploymentArgs).mockResolvedValue(mockDeploymentArgsLimitOrder);
		vi.mocked(getFolioDeploymentArgs).mockResolvedValue(mockDeploymentArgsFolio);
		vi.mocked(sendTransaction).mockResolvedValue('0xtxhash' as `0x${string}`);
		vi.mocked(waitForTransactionReceipt).mockResolvedValue({
			transactionHash: '0xtxhash',
			status: 'success'
		} as unknown as Awaited<ReturnType<typeof waitForTransactionReceipt>>);
		vi.mocked(readContract).mockResolvedValue(1000000000000000000n);
		vi.mocked(estimateGas).mockResolvedValue(100000n);
		vi.mocked(decodeFunctionData).mockReturnValue({
			functionName: 'approve',
			args: ['0x1234', '0xde0b6b3a7640000'] // 1000000000000000000n in hex
		} as unknown as ReturnType<typeof decodeFunctionData>);

		// Mock createRaindexClient
		mockGetAddOrdersForTransaction = vi.fn().mockResolvedValue({
			value: [
				{
					orderHash: '0xorderhash',
					orderbook: '0xorderbook'
				}
			],
			error: undefined
		});
		const mockClient = {
			getAddOrdersForTransaction: mockGetAddOrdersForTransaction
		};
		vi.mocked(createRaindexClient).mockResolvedValue(
			mockClient as unknown as Awaited<ReturnType<typeof createRaindexClient>>
		);

		// Mock setInterval and clearInterval
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// Parameterized tests for basic deploy handler calls
	const deploymentHandlers = [
		{
			name: 'DSF',
			handler: (store: typeof transactionStore) =>
				store.handleDsfDeploy({
					token1: PAYMENT_TOKEN,
					token2: STOXs[0],
					amountIsFastExit: true,
					notAmountIsFastExit: false,
					initialIo: '0.1',
					maxAmount: 1000000000000000000n,
					minAmount: 1000000000000000000n,
					depositAmountToken1: 1000000000000000000n,
					depositAmountToken2: 1000000000000000000n,
					inputVaultIdToken1: undefined,
					inputVaultIdToken2: undefined,
					outputVaultIdToken1: undefined,
					outputVaultIdToken2: undefined
				}),
			expectedFn: getMarketMakingDeploymentArgs
		},
		{
			name: 'DCA',
			handler: (store: typeof transactionStore) =>
				store.handleDcaDeploy(
					{
						outputToken: PAYMENT_TOKEN,
						inputToken: STOXs[0],
						budgetAmount: 1000000000000000000n,
						selectedPeriod: '1',
						selectedPeriodUnit: 'Days',
						kickoff: '0.1',
						baseline: '1',
						minTradeAmount: 1000000000000000000n,
						maxTradeAmount: 1000000000000000000n,
						depositAmount: 2000000000000000000n
					},
					{
						order_type: 'dca',
						order_side: 'buy',
						trade_id: 'test-dca-trade',
						asset_symbol: 'tNVDA',
						payment_symbol: 'USDC'
					}
				),
			expectedFn: getDcaDeploymentArgs
		},
		{
			name: 'Limit Order',
			handler: (store: typeof transactionStore) =>
				store.handleLimitDeploy(
					{
						outputToken: PAYMENT_TOKEN,
						inputToken: STOXs[0],
						ioRatio: '1',
						depositAmount: 1000000000000000000n
					},
					{
						order_type: 'limit',
						order_side: 'buy',
						trade_id: 'test-limit-trade',
						asset_symbol: 'tNVDA',
						payment_symbol: 'USDC'
					}
				),
			expectedFn: getLimitOrderDeploymentArgs
		},
		{
			name: 'Folio',
			handler: (store: typeof transactionStore) =>
				store.handleFolioDeploy({
					selectedToken1: STOXs[0],
					selectedToken2: STOXs[1],
					selectedToken3: STOXs[2],
					selectedToken4: STOXs[3],
					selectedToken5: STOXs[4],
					selectedToken6: STOXs[5],
					selectedToken7: STOXs[6],
					overrideThreshold: '0.1',
					overrideFee: '0.1',
					depositAmount1: 1000000000000000000n,
					depositAmount2: 2000000000000000000n,
					depositAmount3: 3000000000000000000n,
					depositAmount4: 4000000000000000000n,
					depositAmount5: 5000000000000000000n,
					depositAmount6: 6000000000000000000n,
					depositAmount7: 7000000000000000000n,
					inputVaultId1: undefined,
					inputVaultId2: undefined,
					inputVaultId3: undefined,
					inputVaultId4: undefined,
					inputVaultId5: undefined,
					inputVaultId6: undefined,
					inputVaultId7: undefined,
					outputVaultId1: undefined,
					outputVaultId2: undefined,
					outputVaultId3: undefined,
					outputVaultId4: undefined,
					outputVaultId5: undefined,
					outputVaultId6: undefined,
					outputVaultId7: undefined
				}),
			expectedFn: getFolioDeploymentArgs
		}
	];

	// Helper to wait for transactions to complete
	async function waitForTransactionCompletion(expectedCallCount: number) {
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < expectedCallCount && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
			attempts++;
		}
		// Give one more tick to ensure all async operations complete
		await Promise.resolve();
		await Promise.resolve();
	}

	// Unified parameterized tests for all deployment handlers
	deploymentHandlers.forEach(({ name, handler, expectedFn }) => {
		it(`should call handle${name}Deploy`, async () => {
			const deployPromise = handler(transactionStore);
			await vi.runAllTimersAsync();
			await deployPromise;
			expect(expectedFn).toHaveBeenCalled();
		});

		it(`should call sendTransaction for approval and deployment handle${name}Deploy`, async () => {
			const deployPromise = handler(transactionStore);
			await vi.runAllTimersAsync();
			await deployPromise;

			// Simulate user clicking deploy button
			const modal = get(rainlangConfirmationModal);
			expect(modal.onDeploy).toBeDefined();
			modal.onDeploy?.();

			// Flush initial async operations and wait for all promises
			await Promise.resolve();
			await Promise.resolve();
			await vi.runAllTimersAsync();
			await Promise.resolve();
			await Promise.resolve();

			// Determine expected call count based on deployment type
			const expectedCallCount = name === 'Folio' ? 8 : name === 'DSF' ? 3 : 2;
			await waitForTransactionCompletion(expectedCallCount);

			expect(sendTransaction).toHaveBeenCalled();
		});

		it(`should call transactionSuccess with the correct arguments handle${name}Deploy`, async () => {
			const deployPromise = handler(transactionStore);
			await vi.runAllTimersAsync();
			await deployPromise;

			// Simulate user clicking deploy button
			const modal = get(rainlangConfirmationModal);
			expect(modal.onDeploy).toBeDefined();
			modal.onDeploy?.();

			// Flush initial async operations and wait for all promises
			await Promise.resolve();
			await Promise.resolve();
			await vi.runAllTimersAsync();
			await Promise.resolve();
			await Promise.resolve();

			// Determine expected call count based on deployment type
			const expectedCallCount = name === 'Folio' ? 8 : name === 'DSF' ? 3 : 2;
			await waitForTransactionCompletion(expectedCallCount);

			// Advance timer to trigger the polling interval (immediate attempt happens first)
			await vi.advanceTimersByTimeAsync(2000);

			expect(createRaindexClient).toHaveBeenCalled();
			expect(mockGetAddOrdersForTransaction).toHaveBeenCalledWith(
				mockNetwork.id,
				'0x1234',
				'0xtxhash'
			);
		});
	});
});
