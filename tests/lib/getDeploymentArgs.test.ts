import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	getMarketMakingDeploymentArgs,
	getDcaDeploymentArgs,
	getLimitOrderDeploymentArgs,
	getFolioDeploymentArgs
} from '$lib/getDeploymentArgs';
import { DotrainOrderGui } from '@rainlanguage/orderbook';
import {
	getAllTokensByNetwork,
	getTokensByCategory,
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork
} from '$lib/network';

const STOXs = getTokensByCategory('ST0x');
import { currentNetwork } from '$lib/stores';
import { get } from 'svelte/store';
import { mockCurrentNetwork } from '../mocks/mockCurrentNetwork';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockNetwork = mockCurrentNetwork;
const ALL_TOKENS = getAllTokensByNetwork(mockNetwork.id);
const PAYMENT_TOKEN =
	DEFAULT_PAYMENT_TOKENS[mockNetwork.id] ?? getDefaultPaymentTokenForNetwork(mockNetwork.id);

if (!PAYMENT_TOKEN) {
	throw new Error('Missing default payment token for mock network');
}

vi.mock('@rainlanguage/orderbook', () => ({
	DotrainOrderGui: {
		newWithDeployment: vi.fn()
	}
}));


vi.mock('svelte-wagmi', () => ({
	signerAddress: {
		subscribe: vi.fn((callback) => {
			callback('0x1234567890123456789012345678901234567890');
			return () => {};
		})
	},
	chainId: { subscribe: vi.fn() },
	connected: { subscribe: vi.fn() },
	wagmiConfig: { subscribe: vi.fn() }
}));

vi.mock('svelte/store', async () => {
	const actual = await vi.importActual('svelte/store');
	return {
		...actual,
		get: vi.fn().mockImplementation((store) => {
			if (store === currentNetwork) return mockNetwork;
			return '0x1234567890123456789012345678901234567890';
		})
	};
});

// Builder functions to reduce argument repetition
const buildMarketMakingArgs = (overrides = {}) => ({
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
	outputVaultIdToken2: undefined,
	...overrides
});

const buildDcaArgs = (overrides = {}) => ({
	outputToken: PAYMENT_TOKEN,
	inputToken: STOXs[0],
	budgetAmount: 1000000000000000000n,
	selectedPeriod: '1',
	selectedPeriodUnit: 'Days' as const,
	kickoff: '1.2',
	baseline: '0.9',
	minTradeAmount: 2000000000000000000n,
	maxTradeAmount: 3000000000000000000n,
	inputVaultId: undefined,
	outputVaultId: undefined,
	depositAmount: 4000000000000000000n,
	...overrides
});

const buildLimitOrderArgs = (overrides = {}) => ({
	outputToken: PAYMENT_TOKEN,
	inputToken: STOXs[0],
	ioRatio: '0.1',
	depositAmount: 1000000000000000000n,
	inputVaultId: undefined,
	outputVaultId: undefined,
	...overrides
});

const buildFolioArgs = (overrides = {}) => ({
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
	outputVaultId7: undefined,
	...overrides
});

describe('getDeploymentArgs', () => {
	const mockGui = {
		setSelectToken: vi.fn().mockResolvedValue(undefined),
		setFieldValue: vi.fn(),
		setDeposit: vi.fn(),
		setVaultId: vi.fn(),
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

		vi.mocked(DotrainOrderGui.newWithDeployment).mockResolvedValue({
			value: mockGui as unknown as DotrainOrderGui,
			error: undefined
		});

		vi.mocked(get).mockImplementation((store) => {
			if (store === currentNetwork) return mockNetwork;
			return '0x1234567890123456789012345678901234567890';
		});
	});

	describe('DotrainOrderGui initialization', () => {
		it('should call DotrainOrderGui.newWithDeployment with correct arguments', async () => {
			await getMarketMakingDeploymentArgs(buildMarketMakingArgs());
			expect(DotrainOrderGui.newWithDeployment).toHaveBeenCalledWith(
				expect.any(String),
				mockNetwork.raindexNetworkSlug
			);
		});
	});

	describe('getMarketMakingDeploymentArgs', () => {
		it('should handle strategy correctly', async () => {
			await getMarketMakingDeploymentArgs(buildMarketMakingArgs());
			expect(mockGui.setSelectToken).toHaveBeenCalledWith('token1', PAYMENT_TOKEN.address);
			expect(mockGui.setSelectToken).toHaveBeenCalledWith('token2', STOXs[0].address);
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('amount-is-fast-exit', '1');
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('not-amount-is-fast-exit', '0');
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('initial-io', '0.1');
		});

		it('should apply vault IDs when provided', async () => {
			const inputVaultIdToken1 = '0x1234567890123456789012345678901234567891';
			const inputVaultIdToken2 = '0x1234567890123456789012345678901234567892';
			const outputVaultIdToken1 = '0x1234567890123456789012345678901234567893';
			const outputVaultIdToken2 = '0x1234567890123456789012345678901234567894';

			await getMarketMakingDeploymentArgs(
				buildMarketMakingArgs({
					inputVaultIdToken1,
					inputVaultIdToken2,
					outputVaultIdToken1,
					outputVaultIdToken2
				})
			);

			expect(mockGui.setVaultId).toHaveBeenCalledWith('input', 'token1', inputVaultIdToken1);
			expect(mockGui.setVaultId).toHaveBeenCalledWith('input', 'token2', inputVaultIdToken2);
			expect(mockGui.setVaultId).toHaveBeenCalledWith('output', 'token1', outputVaultIdToken1);
			expect(mockGui.setVaultId).toHaveBeenCalledWith('output', 'token2', outputVaultIdToken2);
		});

		it('should return deployment args', async () => {
			const result = await getMarketMakingDeploymentArgs(buildMarketMakingArgs());
			expect(result).toEqual({
				composedRainlang: '/* mock rainlang code */',
				deploymentArgs: {
					to: '0x1234567890123456789012345678901234567890',
					data: '0xabcdef',
					value: 0n
				}
			});
		});
	});

	describe('getDcaDeploymentArgs', () => {
		it('should handle strategy correctly', async () => {
			await getDcaDeploymentArgs(buildDcaArgs());
			expect(mockGui.setSelectToken).toHaveBeenCalledWith('output', PAYMENT_TOKEN.address);
			expect(mockGui.setSelectToken).toHaveBeenCalledWith('input', STOXs[0].address);
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('time-per-amount-epoch', '86400');
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('baseline', '0.9');
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('initial-io', '1.2');
		});

		it('should apply vault IDs when provided', async () => {
			const inputVaultId = '0x1234567890123456789012345678901234567895';
			const outputVaultId = '0x1234567890123456789012345678901234567896';

			await getDcaDeploymentArgs(buildDcaArgs({ inputVaultId, outputVaultId }));

			expect(mockGui.setVaultId).toHaveBeenCalledWith('input', 'input', inputVaultId);
			expect(mockGui.setVaultId).toHaveBeenCalledWith('output', 'output', outputVaultId);
		});

		it('should handle different period units', async () => {
			await getDcaDeploymentArgs(buildDcaArgs({ selectedPeriodUnit: 'Minutes' }));
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('time-per-amount-epoch', '60');
		});

		it('should return deployment args', async () => {
			const result = await getDcaDeploymentArgs(buildDcaArgs({ selectedPeriodUnit: 'Hours' }));
			expect(result).toEqual({
				composedRainlang: '/* mock rainlang code */',
				deploymentArgs: {
					to: '0x1234567890123456789012345678901234567890',
					data: '0xabcdef',
					value: 0n
				}
			});
		});
	});

	describe('getLimitOrderDeploymentArgs', () => {
		it('should handle strategy correctly', async () => {
			await getLimitOrderDeploymentArgs(buildLimitOrderArgs());
			expect(mockGui.setSelectToken).toHaveBeenCalledWith('token1', STOXs[0].address);
			expect(mockGui.setSelectToken).toHaveBeenCalledWith('token2', PAYMENT_TOKEN.address);
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('fixed-io', '0.1');
		});

		it('should return deployment args', async () => {
			const result = await getLimitOrderDeploymentArgs(buildLimitOrderArgs());
			expect(result).toEqual({
				composedRainlang: '/* mock rainlang code */',
				deploymentArgs: {
					to: '0x1234567890123456789012345678901234567890',
					data: '0xabcdef',
					value: 0n
				}
			});
		});
	});

	describe('getFolioDeploymentArgs', () => {
		it('should handle strategy correctly', async () => {
			await getFolioDeploymentArgs(buildFolioArgs());
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('threshold', '0.1');
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('fee', '0.1');
			for (let i = 0; i < 7; i++) {
				expect(mockGui.setSelectToken).toHaveBeenCalledWith(`token${i + 1}`, ALL_TOKENS[i].address);
			}
		});

		it('should handle optional parameters', async () => {
			await getFolioDeploymentArgs(
				buildFolioArgs({ overrideThreshold: undefined, overrideFee: undefined })
			);
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('threshold', '0.05');
			expect(mockGui.setFieldValue).toHaveBeenCalledWith('fee', '0.003');
		});

		it('should return deployment args', async () => {
			const result = await getFolioDeploymentArgs(buildFolioArgs());
			expect(result).toEqual({
				composedRainlang: '/* mock rainlang code */',
				deploymentArgs: {
					to: '0x1234567890123456789012345678901234567890',
					data: '0xabcdef',
					value: 0n
				}
			});
		});
	});

	describe('Error handling', () => {
		it('should handle missing signer address', async () => {
			vi.mocked(get).mockImplementation((store) => {
				if (store === currentNetwork) return mockNetwork;
				return undefined;
			});

			await expect(getMarketMakingDeploymentArgs(buildMarketMakingArgs())).rejects.toThrow(
				'Signer address not found'
			);
		});
	});
});
