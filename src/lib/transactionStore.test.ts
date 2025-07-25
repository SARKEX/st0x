import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import transactionStore from './transactionStore';
import { sendTransaction } from '@wagmi/core';
import { getTransactionAddOrders } from '@rainlanguage/orderbook';
import { mockWagmiConfigStore } from '$lib/mocks/mockStores';
import { getNetworkById, STOXs, USDC_TOKENS } from './network';
import { rainlangConfirmationModal, currentNetwork } from './stores';
import {
	getMarketMakingDeploymentArgs,
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getFolioDeploymentArgs
} from './getDeploymentArgs';
import { mockCurrentNetwork } from './mocks/mockCurrentNetwork';

// Shared mock network object to avoid repetition
const mockNetwork = mockCurrentNetwork;

const USDC_TOKEN = USDC_TOKENS[mockNetwork.id];

vi.mock('./getDeploymentArgs', async (importOriginal) => {
	return {
		...((await importOriginal()) as object),
		getMarketMakingDeploymentArgs: vi.fn(),
		getDcaDeploymentArgs: vi.fn(),
		getLimitOrderDeploymentArgs: vi.fn(),
		getFolioDeploymentArgs: vi.fn()
	};
});

vi.mock('@rainlanguage/orderbook', () => ({
	getTransactionAddOrders: vi.fn()
}));

vi.mock('@wagmi/core', () => ({
	sendTransaction: vi.fn(),
	waitForTransactionReceipt: vi.fn()
}));

vi.mock('svelte/store', async () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const actual = (await vi.importActual('svelte/store')) as any;
	return {
		...actual,
		get: vi.fn().mockImplementation((store) => {
			if (store === transactionStore) return transactionStore;
			if (store === rainlangConfirmationModal) return actual.get(store);
			if (store === currentNetwork) {
				return {
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
					subgraph_url:
						'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.1/gn',
					metadata_subgraph_url:
						'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-arbitrum-one/2025-07-06-135f/gn',
					orderbook_subgraph_url:
						'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-arbitrum-one/2025-07-03-9be9/gn',
					usdcToken: {
						chainId: 42161,
						address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
						symbol: 'USDC',
						decimals: 6,
						name: 'USD Coin',
						logoUrl: '/images/USDC.png',
						priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
					}
				};
			}
			return mockWagmiConfigStore;
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

	beforeEach(() => {
		vi.clearAllMocks();
		transactionStore.reset();

		vi.mocked(getMarketMakingDeploymentArgs).mockResolvedValue(mockDeploymentArgsMarketMaking);
		vi.mocked(getDcaDeploymentArgs).mockResolvedValue(mockDeploymentArgsDca);
		vi.mocked(getLimitOrderDeploymentArgs).mockResolvedValue(mockDeploymentArgsLimitOrder);
		vi.mocked(getFolioDeploymentArgs).mockResolvedValue(mockDeploymentArgsFolio);
		vi.mocked(sendTransaction).mockResolvedValue('0xtxhash');
		vi.mocked(getTransactionAddOrders).mockResolvedValue({
			value: [
				{
					transaction: {
						id: '0xtxid',
						from: '0xfrom',
						blockNumber: '123456',
						timestamp: '1234567890'
					},
					order: {
						id: '0xorderid',
						orderBytes: '0xorderbytes',
						orderHash: '0xorderhash',
						owner: '0xowner',
						outputs: [],
						inputs: [],
						orderbook: { id: '0xorderbook' },
						active: true,
						timestampAdded: '1234567890',
						meta: undefined,
						addEvents: [],
						trades: [],
						removeEvents: []
					}
				}
			],
			error: undefined
		});

		// Mock setInterval and clearInterval
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should call handleDsfDeploy', async () => {
		const deployPromise = transactionStore.handleDsfDeploy({
			token1: USDC_TOKEN,
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
			token1: USDC_TOKEN,
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
			outputToken: USDC_TOKEN,
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
			outputToken: USDC_TOKEN,
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
			outputToken: USDC_TOKEN,
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
			outputToken: USDC_TOKEN,
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
			token1: USDC_TOKEN,
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

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await deployPromise;

		expect(sendTransaction).toHaveBeenCalledTimes(3);
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval0',
			to: '0xtoken0'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval1',
			to: '0xtoken1'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call sendTransaction for approval and deployment handleDcaDeploy', async () => {
		const deployPromise = transactionStore.handleDcaDeploy({
			outputToken: USDC_TOKEN,
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

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await deployPromise;

		expect(sendTransaction).toHaveBeenCalledTimes(2);
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call sendTransaction for approval and deployment handleLimitOrderDeploy', async () => {
		const deployPromise = transactionStore.handleLimitDeploy({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '0.1',
			depositAmount: 2000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await deployPromise;

		expect(sendTransaction).toHaveBeenCalledTimes(2);
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
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

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await deployPromise;

		expect(sendTransaction).toHaveBeenCalledTimes(8);
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken1'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken2'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken3'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken4'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken5'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xapproval',
			to: '0xtoken6'
		});
		expect(sendTransaction).toHaveBeenCalledWith(mockWagmiConfigStore, {
			data: '0xabcdef',
			to: '0x1234'
		});
	});

	it('should call transactionSuccess with the correct arguments handleDsfDeploy', async () => {
		const deployPromise = transactionStore.handleDsfDeploy({
			token1: USDC_TOKEN,
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

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await vi.advanceTimersByTimeAsync(2000);
		await deployPromise;

		expect(getTransactionAddOrders).toHaveBeenCalledWith(
			mockNetwork.orderbook_subgraph_url,
			'0xtxhash'
		);
	});

	it('should call transactionSuccess with the correct arguments handleDcaDeploy', async () => {
		const deployPromise = transactionStore.handleDcaDeploy({
			outputToken: USDC_TOKEN,
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

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await vi.advanceTimersByTimeAsync(2000);
		await deployPromise;

		expect(getTransactionAddOrders).toHaveBeenCalledWith(
			mockNetwork.orderbook_subgraph_url,
			'0xtxhash'
		);
	});

	it('should call transactionSuccess with the correct arguments handleLimitOrderDeploy', async () => {
		const deployPromise = transactionStore.handleLimitDeploy({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '1',
			depositAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await vi.advanceTimersByTimeAsync(2000);
		await deployPromise;

		expect(getTransactionAddOrders).toHaveBeenCalledWith(
			mockNetwork.orderbook_subgraph_url,
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

		await vi.runAllTimersAsync();

		// Simulate user clicking deploy button
		const modal = get(rainlangConfirmationModal);
		modal.onDeploy?.();

		await vi.runAllTimersAsync();
		await vi.advanceTimersByTimeAsync(2000);
		await deployPromise;

		expect(getTransactionAddOrders).toHaveBeenCalledWith(
			mockNetwork.orderbook_subgraph_url,
			'0xtxhash'
		);
	});
});
