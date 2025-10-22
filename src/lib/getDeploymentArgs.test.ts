import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getMarketMakingDeploymentArgs,
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getFolioDeploymentArgs
} from './getDeploymentArgs';
import { DotrainOrderGui } from '@rainlanguage/orderbook';
import { getPrice } from './getPrice';
import { formatUnits } from 'viem';
import { getAllTokensByNetwork, STOXs, USDC_TOKENS } from './network';
import { currentNetwork } from './stores';
import { get } from 'svelte/store';
import { mockCurrentNetwork } from './mocks/mockCurrentNetwork';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Shared mock network object to avoid repetition
const mockNetwork = mockCurrentNetwork;
const ALL_TOKENS = getAllTokensByNetwork(mockNetwork.id);
const USDC_TOKEN = USDC_TOKENS[mockNetwork.id];

// Mock the DotrainOrderGui
vi.mock('@rainlanguage/orderbook', () => ({
	DotrainOrderGui: {
		newWithDeployment: vi.fn()
	}
}));

// Mock the getPrice module
vi.mock('./getPrice', () => ({
	getPrice: vi.fn()
}));

// Mock the svelte-wagmi module
vi.mock('svelte-wagmi', () => ({
	signerAddress: {
		subscribe: vi.fn()
	},
	chainId: {
		subscribe: vi.fn()
	},
	connected: {
		subscribe: vi.fn()
	},
	wagmiConfig: {
		subscribe: vi.fn()
	}
}));

// Mock the svelte/store module
vi.mock('svelte/store', async () => {
	const actual = await vi.importActual('svelte/store');

	return {
		...actual,
		get: vi.fn().mockImplementation((store) => {
			if (store === currentNetwork) {
				return mockNetwork;
			}
			return '0x1234567890123456789012345678901234567890';
		})
	};
});

describe('getDeploymentArgs', () => {
	const mockGui = {
		saveSelectToken: vi.fn().mockResolvedValue(undefined),
		saveFieldValue: vi.fn().mockResolvedValue(undefined),
		saveDeposit: vi.fn().mockResolvedValue(undefined),
		setVaultId: vi.fn().mockResolvedValue(undefined),
		getDeploymentTransactionArgs: vi.fn().mockResolvedValue({
			value: {
				to: '0x1234567890123456789012345678901234567890',
				data: '0xabcdef',
				value: 0n
			},
			error: undefined
		}),
		getComposedRainlang: vi.fn().mockResolvedValue({
			value: '/* mock rainlang code */',
			error: undefined
		})
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockFetch.mockResolvedValue({
			text: vi.fn().mockResolvedValue('/* mock strategy */')
		});

		// Setup mocks
		vi.mocked(DotrainOrderGui.newWithDeployment).mockResolvedValue({
			value: mockGui as unknown as DotrainOrderGui,
			error: undefined
		});

		vi.mocked(getPrice).mockResolvedValue('1.5');

		// Reset the get mock to its default implementation
		vi.mocked(get).mockImplementation((store) => {
			if (store === currentNetwork) {
				return mockNetwork;
			}
			return '0x1234567890123456789012345678901234567890';
		});
	});

	it('should call DotrainOrderGui.newWithDeployment with the correct arguments', async () => {
		await getMarketMakingDeploymentArgs({
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

		expect(DotrainOrderGui.newWithDeployment).toHaveBeenCalledWith(
			expect.any(String),
			mockNetwork.raindexNetworkSlug
		);
	});

	it('should handle getMarketMakingDeploymentArgs strategy correctly', async () => {
		await getMarketMakingDeploymentArgs({
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

		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token1', USDC_TOKEN.address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token2', STOXs[0].address);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('amount-is-fast-exit', '1');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('not-amount-is-fast-exit', '0');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('initial-io', '0.1');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith(
			'max-amount',
			formatUnits(1000000000000000000n, USDC_TOKEN.decimals)
		);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith(
			'min-amount',
			formatUnits(1000000000000000000n, USDC_TOKEN.decimals)
		);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('next-trade-multiplier', '1.01');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('cost-basis-multiplier', '1');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('time-per-epoch', '3600');

		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token1',
			formatUnits(1000000000000000000n, USDC_TOKEN.decimals)
		);

		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token2',
			formatUnits(1000000000000000000n, STOXs[0].decimals)
		);
	});

	it('should handle getDcaDeploymentArgs strategy correctly', async () => {
		await getDcaDeploymentArgs({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Days',
			kickoff: '1.2',
			baseline: '0.9',
			minTradeAmount: 2000000000000000000n,
			maxTradeAmount: 3000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 4000000000000000000n
		});

		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('output', USDC_TOKEN.address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('input', STOXs[0].address);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('time-per-amount-epoch', '86400');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith(
			'amount-per-epoch',
			formatUnits(1000000000000000000n, USDC_TOKEN.decimals)
		);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith(
			'max-trade-amount',
			formatUnits(3000000000000000000n, USDC_TOKEN.decimals)
		);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith(
			'min-trade-amount',
			formatUnits(2000000000000000000n, USDC_TOKEN.decimals)
		);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('baseline', '0.9');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('initial-io', '1.2');

		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'output',
			formatUnits(4000000000000000000n, USDC_TOKEN.decimals)
		);
	});

	it('should apply vault IDs when provided in getDcaDeploymentArgs', async () => {
		const inputVaultId = '0x1234567890123456789012345678901234567895';
		const outputVaultId = '0x1234567890123456789012345678901234567896';

		await getDcaDeploymentArgs({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Days',
			kickoff: '1.2',
			baseline: '0.9',
			minTradeAmount: 2000000000000000000n,
			maxTradeAmount: 3000000000000000000n,
			inputVaultId,
			outputVaultId,
			depositAmount: 4000000000000000000n
		});

		expect(mockGui.setVaultId).toHaveBeenCalledWith(true, 0, inputVaultId);
		expect(mockGui.setVaultId).toHaveBeenCalledWith(false, 0, outputVaultId);
	});

	it('should handle getLimitOrderDeploymentArgs strategy correctly', async () => {
		await getLimitOrderDeploymentArgs({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '0.1',
			depositAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token1', STOXs[0].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token2', USDC_TOKEN.address);

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('fixed-io', '0.1');

		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token2',
			formatUnits(1000000000000000000n, USDC_TOKEN.decimals)
		);
	});

	it('should handle getFolioDeploymentArgs strategy correctly', async () => {
		await getFolioDeploymentArgs({
			selectedToken1: ALL_TOKENS[0],
			selectedToken2: ALL_TOKENS[1],
			selectedToken3: ALL_TOKENS[2],
			selectedToken4: ALL_TOKENS[3],
			selectedToken5: ALL_TOKENS[4],
			selectedToken6: ALL_TOKENS[5],
			selectedToken7: ALL_TOKENS[6],
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

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('threshold', '0.1');

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('fee', '0.1');

		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token1', ALL_TOKENS[0].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token2', ALL_TOKENS[1].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token3', ALL_TOKENS[2].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token4', ALL_TOKENS[3].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token5', ALL_TOKENS[4].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token6', ALL_TOKENS[5].address);
		expect(mockGui.saveSelectToken).toHaveBeenCalledWith('token7', ALL_TOKENS[6].address);

		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token1',
			formatUnits(1000000000000000000n, ALL_TOKENS[0].decimals)
		);
		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token2',
			formatUnits(2000000000000000000n, ALL_TOKENS[1].decimals)
		);
		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token3',
			formatUnits(3000000000000000000n, ALL_TOKENS[2].decimals)
		);
		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token4',
			formatUnits(4000000000000000000n, ALL_TOKENS[3].decimals)
		);
		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token5',
			formatUnits(5000000000000000000n, ALL_TOKENS[4].decimals)
		);
		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token6',
			formatUnits(6000000000000000000n, ALL_TOKENS[5].decimals)
		);
		expect(mockGui.saveDeposit).toHaveBeenCalledWith(
			'token7',
			formatUnits(7000000000000000000n, ALL_TOKENS[6].decimals)
		);
	});

	it('should return getMarketMakingDeploymentArgs deployment args', async () => {
		const result = await getMarketMakingDeploymentArgs({
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

		expect(result).toEqual({
			composedRainlang: '/* mock rainlang code */',
			deploymentArgs: {
				to: '0x1234567890123456789012345678901234567890',
				data: '0xabcdef',
				value: 0n
			}
		});
	});

	it('should return getDcaDeploymentArgs deployment args', async () => {
		const result = await getDcaDeploymentArgs({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Hours',
			kickoff: '1.2',
			baseline: '1',
			minTradeAmount: 2000000000000000000n,
			maxTradeAmount: 3000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 4000000000000000000n
		});

		expect(result).toEqual({
			composedRainlang: '/* mock rainlang code */',
			deploymentArgs: {
				to: '0x1234567890123456789012345678901234567890',
				data: '0xabcdef',
				value: 0n
			}
		});
	});

	it('should return getLimitOrderDeploymentArgs deployment args', async () => {
		const result = await getLimitOrderDeploymentArgs({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			ioRatio: '0.1',
			depositAmount: 1000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined
		});

		expect(result).toEqual({
			composedRainlang: '/* mock rainlang code */',
			deploymentArgs: {
				to: '0x1234567890123456789012345678901234567890',
				data: '0xabcdef',
				value: 0n
			}
		});
	});

	it('should return getFolioDeploymentArgs deployment args', async () => {
		const result = await getFolioDeploymentArgs({
			selectedToken1: ALL_TOKENS[0], // GOOGLs1
			selectedToken2: ALL_TOKENS[1], // METAs1
			selectedToken3: ALL_TOKENS[2], // MSFTs1
			selectedToken4: ALL_TOKENS[3], // TSLAs1
			selectedToken5: ALL_TOKENS[4], // NVDAs1
			selectedToken6: ALL_TOKENS[5], // AAPLs1
			selectedToken7: ALL_TOKENS[6], // AMZNs1
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

		expect(result).toEqual({
			composedRainlang: '/* mock rainlang code */',
			deploymentArgs: {
				to: '0x1234567890123456789012345678901234567890',
				data: '0xabcdef',
				value: 0n
			}
		});
	});

	it('should handle vault IDs correctly in getMarketMakingDeploymentArgs', async () => {
		const inputVaultIdToken1 = '0x1234567890123456789012345678901234567891';
		const inputVaultIdToken2 = '0x1234567890123456789012345678901234567892';
		const outputVaultIdToken1 = '0x1234567890123456789012345678901234567893';
		const outputVaultIdToken2 = '0x1234567890123456789012345678901234567894';

		await getMarketMakingDeploymentArgs({
			token1: USDC_TOKEN,
			token2: STOXs[0],
			amountIsFastExit: true,
			notAmountIsFastExit: false,
			initialIo: '0.1',
			maxAmount: 1000000000000000000n,
			minAmount: 1000000000000000000n,
			depositAmountToken1: 1000000000000000000n,
			depositAmountToken2: 1000000000000000000n,
			inputVaultIdToken1: inputVaultIdToken1,
			inputVaultIdToken2: inputVaultIdToken2,
			outputVaultIdToken1: outputVaultIdToken1,
			outputVaultIdToken2: outputVaultIdToken2
		});

		expect(mockGui.setVaultId).toHaveBeenCalledWith(true, 0, inputVaultIdToken1);
		expect(mockGui.setVaultId).toHaveBeenCalledWith(true, 1, inputVaultIdToken2);
		expect(mockGui.setVaultId).toHaveBeenCalledWith(false, 0, outputVaultIdToken1);
		expect(mockGui.setVaultId).toHaveBeenCalledWith(false, 1, outputVaultIdToken2);
	});

	it('should handle different period units in getDcaDeploymentArgs', async () => {
		await getDcaDeploymentArgs({
			outputToken: USDC_TOKEN,
			inputToken: STOXs[0],
			budgetAmount: 1000000000000000000n,
			selectedPeriod: '1',
			selectedPeriodUnit: 'Minutes',
			kickoff: '1.2',
			baseline: '0.9',
			minTradeAmount: 2000000000000000000n,
			maxTradeAmount: 3000000000000000000n,
			inputVaultId: undefined,
			outputVaultId: undefined,
			depositAmount: 4000000000000000000n
		});

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('time-per-amount-epoch', '60');
	});

	it('should handle missing signer address', async () => {
		// Mock get to return undefined for signerAddress but keep currentNetwork working
		vi.mocked(get).mockImplementation((store) => {
			if (store === currentNetwork) {
				return mockNetwork;
			}
			// Return undefined for signerAddress (which is what we want to test)
			return undefined;
		});

		await expect(
			getMarketMakingDeploymentArgs({
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
			})
		).rejects.toThrow('Signer address not found');
	});

	it('should handle optional parameters in getFolioDeploymentArgs', async () => {
		await getFolioDeploymentArgs({
			selectedToken1: ALL_TOKENS[0], // GOOGLs1
			selectedToken2: ALL_TOKENS[1], // METAs1
			selectedToken3: ALL_TOKENS[2], // MSFTs1
			selectedToken4: ALL_TOKENS[3], // TSLAs1
			selectedToken5: ALL_TOKENS[4], // NVDAs1
			selectedToken6: ALL_TOKENS[5], // AAPLs1
			selectedToken7: ALL_TOKENS[6], // AMZNs1
			overrideThreshold: undefined,
			overrideFee: undefined,
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

		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('threshold', '0.05');
		expect(mockGui.saveFieldValue).toHaveBeenCalledWith('fee', '0.003');
	});
});
