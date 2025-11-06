import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import transactionStore from './transactionStore';
import { readContract, sendTransaction, waitForTransactionReceipt } from '@wagmi/core';
import {
	STOXs,
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork
} from './network';
import { rainlangConfirmationModal, currentNetwork } from './stores';
import {
	getMarketMakingDeploymentArgs,
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getFolioDeploymentArgs
} from './getDeploymentArgs';
import { mockCurrentNetwork } from './mocks/mockCurrentNetwork';
import { createRaindexClient } from './utils/raindexClient';
import { decodeFunctionData } from 'viem';

// Shared mock network object to avoid repetition
const mockNetwork = mockCurrentNetwork;

const PAYMENT_TOKEN =
	DEFAULT_PAYMENT_TOKENS[mockNetwork.id] ??
	getDefaultPaymentTokenForNetwork(mockNetwork.id);

if (!PAYMENT_TOKEN) {
	throw new Error('Missing default payment token for mock network');
}

vi.mock('./getDeploymentArgs', async (importOriginal) => {
	return {
		...((await importOriginal()) as object),
		getMarketMakingDeploymentArgs: vi.fn(),
		getDcaDeploymentArgs: vi.fn(),
		getLimitOrderDeploymentArgs: vi.fn(),
		getFolioDeploymentArgs: vi.fn()
	};
});

vi.mock('./utils/raindexClient', () => ({
	createRaindexClient: vi.fn()
}));

vi.mock('@wagmi/core', () => ({
	sendTransaction: vi.fn(),
	waitForTransactionReceipt: vi.fn(),
	readContract: vi.fn()
}));

vi.mock('viem', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		decodeFunctionData: vi.fn()
	};
});

vi.mock('svelte-wagmi', async () => {
	// Import the mock stores INSIDE the factory (don’t capture top-level vars)
	const {
		web3ModalStore,
		mockWagmiConfigStore,
		mockSignerAddressStore,
		mockChainIdStore,
		mockConnectedStore
	} = await import('$lib/mocks/mockStores');

	return {
		web3Modal: web3ModalStore,
		wagmiConfig: mockWagmiConfigStore,
		signerAddress: mockSignerAddressStore,
		chainId: mockChainIdStore,
		connected: mockConnectedStore
	};
});

vi.mock('svelte/store', async () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const actual = (await vi.importActual('svelte/store')) as any;
	// Import stores to check against them
	const { mockSignerAddressStore, mockWagmiConfigStore, mockChainIdStore } = await import(
		'$lib/mocks/mockStores'
	);
	return {
		...actual,
		get: vi.fn().mockImplementation((store: unknown) => {
			if (store === transactionStore) return transactionStore;
			if (store === rainlangConfirmationModal) return actual.get(store);
			if (store === currentNetwork) {
				return mockCurrentNetwork;
			}
			// For writable stores from mockStores, manually get the value
			if (
				store === mockSignerAddressStore ||
				store === mockWagmiConfigStore ||
				store === mockChainIdStore
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

describe('transactionStore tests', () => {
	const mockDeploymentArgsMarketMaking = {
		composedRainlang: 'mock rainlang code for market making',
		deploymentArgs: {
			deploymentCalldata: '0xabcdef',
			orderbookAddress: '0x1234',
			approvals: [
				{
					calldata: '0xapproval0',
					token: '0xtoken0',
					symbol: 'TEST0'
				},
				{
					calldata: '0xapproval1',
					token: '0xtoken1',
					symbol: 'TEST1'
				}
			],
			chainId: 8453
		}
	};
	const mockDeploymentArgsDca = {
		composedRainlang: 'mock rainlang code for dca',
		deploymentArgs: {
			deploymentCalldata: '0xabcdef',
			orderbookAddress: '0x1234',
			approvals: [
				{
					calldata: '0xapproval',
					token: '0xtoken',
					symbol: 'TEST'
				}
			],
			chainId: 8453
		}
	};
	const mockDeploymentArgsLimitOrder = {
		composedRainlang: 'mock rainlang code for limit order',
		deploymentArgs: {
			deploymentCalldata: '0xabcdef',
			orderbookAddress: '0x1234',
			approvals: [
				{
					calldata: '0xapproval',
					token: '0xtoken',
					symbol: 'TEST'
				}
			],
			chainId: 8453
		}
	};
	const mockDeploymentArgsFolio = {
		composedRainlang: 'mock rainlang code for folio',
		deploymentArgs: {
			deploymentCalldata: '0xabcdef',
			orderbookAddress: '0x1234',
			approvals: [
				{
					calldata: '0xapproval',
					token: '0xtoken',
					symbol: 'TEST'
				},
				{
					calldata: '0xapproval',
					token: '0xtoken1',
					symbol: 'TEST1'
				},
				{
					calldata: '0xapproval',
					token: '0xtoken2',
					symbol: 'TEST2'
				},
				{
					calldata: '0xapproval',
					token: '0xtoken3',
					symbol: 'TEST3'
				},
				{
					calldata: '0xapproval',
					token: '0xtoken4',
					symbol: 'TEST4'
				},
				{
					calldata: '0xapproval',
					token: '0xtoken5',
					symbol: 'TEST5'
				},
				{
					calldata: '0xapproval',
					token: '0xtoken6',
					symbol: 'TEST6'
				}
			],
			chainId: 8453
		}
	};

	let mockGetAddOrdersForTransaction: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		transactionStore.reset();

		// Set up the mock stores with proper values
		const { mockSignerAddressStore, mockWagmiConfigStore } = await import('$lib/mocks/mockStores');
		const { mockWeb3Config } = await import('$lib/mocks/mockWagmiConfig');
		mockSignerAddressStore.set('0x1234567890123456789012345678901234567890');
		mockWagmiConfigStore.set(mockWeb3Config);

		vi.mocked(getMarketMakingDeploymentArgs).mockResolvedValue(mockDeploymentArgsMarketMaking);
		vi.mocked(getDcaDeploymentArgs).mockResolvedValue(mockDeploymentArgsDca);
		vi.mocked(getLimitOrderDeploymentArgs).mockResolvedValue(mockDeploymentArgsLimitOrder);
		vi.mocked(getFolioDeploymentArgs).mockResolvedValue(mockDeploymentArgsFolio);
		vi.mocked(sendTransaction).mockResolvedValue('0xtxhash');
		vi.mocked(waitForTransactionReceipt).mockResolvedValue({
			transactionHash: '0xtxhash',
			status: 'success'
		} as unknown as Awaited<ReturnType<typeof waitForTransactionReceipt>>);
		vi.mocked(readContract).mockResolvedValue(1000000000000000000n);
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

	it('should call handleDsfDeploy', async () => {
		const deployPromise = transactionStore.handleDsfDeploy({
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
		});

		// Advance timers to allow async operations to complete
		await vi.runAllTimersAsync();
		await deployPromise;

		expect(getMarketMakingDeploymentArgs).toHaveBeenCalledWith({
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
		});
	});

	it('should call handleDcaDeploy', async () => {
		const deployPromise = transactionStore.handleDcaDeploy({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Days',
			kickoff: '0.1',
			baseline: '1',
			minTradeAmount: 1000000000000000000n,
			maxTradeAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 2000000000000000000n
		});

		// Advance timers to allow async operations to complete
		await vi.runAllTimersAsync();
		await deployPromise;

		expect(getDcaDeploymentArgs).toHaveBeenCalledWith({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Days',
			kickoff: '0.1',
			baseline: '1',
			minTradeAmount: 1000000000000000000n,
			maxTradeAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 2000000000000000000n
		});
	});

	it('should call handleLimitOrderDeploy', async () => {
		const deployPromise = transactionStore.handleLimitDeploy({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '0.1',
			depositAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		// Advance timers to allow async operations to complete
		await vi.runAllTimersAsync();
		await deployPromise;

		expect(getLimitOrderDeploymentArgs).toHaveBeenCalledWith({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '0.1',
			depositAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});
	});

	it('should call handleFolioDeploy', async () => {
		const deployPromise = transactionStore.handleFolioDeploy({
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
		});

		// Advance timers to allow async operations to complete
		await vi.runAllTimersAsync();
		await deployPromise;

		expect(getFolioDeploymentArgs).toHaveBeenCalledWith({
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
		});
	});

	it('should call sendTransaction for approval and deployment handleDsfDeploy', async () => {
		const deployPromise = transactionStore.handleDsfDeploy({
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
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for async operations to complete by polling
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 3 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		expect(sendTransaction).toHaveBeenCalledTimes(3);
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval0',
			to: '0xtoken0'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval1',
			to: '0xtoken1'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call sendTransaction for approval and deployment handleDcaDeploy', async () => {
		const deployPromise = transactionStore.handleDcaDeploy({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Days',
			kickoff: '0.1',
			baseline: '1',
			minTradeAmount: 1000000000000000000n,
			maxTradeAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 2000000000000000000n
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for async operations to complete by polling
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 2 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		expect(sendTransaction).toHaveBeenCalledTimes(2);
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call sendTransaction for approval and deployment handleLimitOrderDeploy', async () => {
		const deployPromise = transactionStore.handleLimitDeploy({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '0.1',
			depositAmount: 2000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for async operations to complete by polling
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 2 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		expect(sendTransaction).toHaveBeenCalledTimes(2);
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call sendTransaction for approval and deployment handleFolioDeploy', async () => {
		const deployPromise = transactionStore.handleFolioDeploy({
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
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for async operations to complete by polling
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 8 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		expect(sendTransaction).toHaveBeenCalledTimes(8);
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken1'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken2'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken3'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken4'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken5'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xapproval',
			to: '0xtoken6'
		});
		expect(sendTransaction).toHaveBeenCalledWith(expect.anything(), {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call transactionSuccess with the correct arguments handleDsfDeploy', async () => {
		const deployPromise = transactionStore.handleDsfDeploy({
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
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for all transactions to complete first
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 3 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		// Advance timer to trigger the polling interval
		await vi.advanceTimersByTimeAsync(2000);

		expect(createRaindexClient).toHaveBeenCalled();
		expect(mockGetAddOrdersForTransaction).toHaveBeenCalledWith(
			mockNetwork.id,
			'0x1234',
			'0xtxhash'
		);
	});

	it('should call transactionSuccess with the correct arguments handleDcaDeploy', async () => {
		const deployPromise = transactionStore.handleDcaDeploy({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Days',
			kickoff: '0.1',
			baseline: '1',
			minTradeAmount: 1000000000000000000n,
			maxTradeAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 1000000000000000000n
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for all transactions to complete first
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 2 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		// Advance timer to trigger the polling interval
		await vi.advanceTimersByTimeAsync(2000);

		expect(createRaindexClient).toHaveBeenCalled();
		expect(mockGetAddOrdersForTransaction).toHaveBeenCalledWith(
			mockNetwork.id,
			'0x1234',
			'0xtxhash'
		);
	});

	it('should call transactionSuccess with the correct arguments handleLimitOrderDeploy', async () => {
		const deployPromise = transactionStore.handleLimitDeploy({
			outputToken: PAYMENT_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '1',
			depositAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for all transactions to complete first
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 2 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		// Advance timer to trigger the polling interval
		await vi.advanceTimersByTimeAsync(2000);

		expect(createRaindexClient).toHaveBeenCalled();
		expect(mockGetAddOrdersForTransaction).toHaveBeenCalledWith(
			mockNetwork.id,
			'0x1234',
			'0xtxhash'
		);
	});

	it('should call transactionSuccess with the correct arguments handleFolioDeploy', async () => {
		const deployPromise = transactionStore.handleFolioDeploy({
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
		});

		await deployPromise;

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		// Flush initial async operations
		await Promise.resolve();
		await Promise.resolve();
		await vi.runAllTimersAsync();

		// Wait for all transactions to complete first
		const sendTransactionMock = vi.mocked(sendTransaction);
		let attempts = 0;
		while (sendTransactionMock.mock.calls.length < 8 && attempts < 100) {
			await vi.runAllTimersAsync();
			await Promise.resolve(); // Allow pending promises to resolve
			await Promise.resolve(); // Double flush to ensure all microtasks complete
			attempts++;
		}

		// Advance timer to trigger the polling interval
		await vi.advanceTimersByTimeAsync(2000);

		expect(createRaindexClient).toHaveBeenCalled();
		expect(mockGetAddOrdersForTransaction).toHaveBeenCalledWith(
			mockNetwork.id,
			'0x1234',
			'0xtxhash'
		);
	});
});
