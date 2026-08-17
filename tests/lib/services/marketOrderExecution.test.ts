import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, erc20Abi } from 'viem';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
	apiGetSwapCalldataV2: vi.fn(),
	apiGetTradesByTx: vi.fn(),
	getSignerAddress: vi.fn(),
	sendTransaction: vi.fn(),
	waitForTransaction: vi.fn(),
	checkingWalletAllowance: vi.fn(),
	awaitWalletConfirmation: vi.fn(),
	awaitApprovalTx: vi.fn(),
	transactionSuccess: vi.fn(),
	update: vi.fn(),
	invalidateDashboardBalances: vi.fn(),
	invalidateCostBasis: vi.fn(),
	trackTradeEvent: vi.fn(),
	captureTradeFlowError: vi.fn()
}));

vi.mock('$lib/api/st0xApi', () => ({
	apiGetSwapCalldataV2: mocks.apiGetSwapCalldataV2,
	apiGetTradesByTx: mocks.apiGetTradesByTx
}));
vi.mock('$lib/services/walletService', () => ({
	APPROVAL_TX_CONFIRMATIONS: 2,
	getSignerAddress: mocks.getSignerAddress,
	sendTransaction: mocks.sendTransaction,
	waitForTransaction: mocks.waitForTransaction
}));
vi.mock('$lib/queries/balances', () => ({
	invalidateDashboardBalances: mocks.invalidateDashboardBalances,
	invalidateCostBasis: mocks.invalidateCostBasis
}));
vi.mock('$lib/stores/transactionShared', async (importOriginal) => {
	const actual = (await importOriginal()) as object;
	return {
		...actual,
		transactionStoreInternal: {
			checkingWalletAllowance: mocks.checkingWalletAllowance,
			awaitWalletConfirmation: mocks.awaitWalletConfirmation,
			awaitApprovalTx: mocks.awaitApprovalTx,
			transactionSuccess: mocks.transactionSuccess,
			update: mocks.update
		}
	};
});
vi.mock('$lib/services/observability/tradeEvents', () => ({
	trackTradeEvent: mocks.trackTradeEvent
}));
vi.mock('$lib/services/observability/tradeFlow', () => ({
	addTradeFlowBreadcrumb: vi.fn(),
	captureTradeFlowError: mocks.captureTradeFlowError
}));
vi.mock('$lib/services/observability/tradeId', () => ({
	getCurrentTradeId: vi.fn(() => 'trade-1')
}));

import {
	buildMarketSwapQuoteRequest,
	executeMarketOrder,
	toReferenceIoRatio
} from '$lib/services/marketOrderExecution';
import { HttpError } from '$lib/clients/http';
import { TAKE_ORDERS_4_ABI } from '$lib/services/takeOrders4Abi';
import type { ApiSwapCalldataV2Request } from '$lib/api/st0xApi';

const TAKER = '0xb000000000000000000000000000000000000000';
const ASSET = '0x2222222222222222222222222222222222222222';
const PAYMENT = '0x1111111111111111111111111111111111111111';
const ORDERBOOK = '0x3333333333333333333333333333333333333333';
const APPROVAL_HASH = `0x${'a'.repeat(64)}` as const;
const TRADE_HASH = `0x${'b'.repeat(64)}` as const;
const network = {
	id: 8453,
	trustedOrderbooks: [ORDERBOOK]
} as unknown as Parameters<typeof executeMarketOrder>[0]['network'];
const tokens = {
	assetToken: { address: ASSET, decimals: 18, symbol: 'ASSET' },
	paymentToken: { address: PAYMENT, decimals: 6, symbol: 'USDC' }
};

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

function takeOrdersData(
	request: ApiSwapCalldataV2Request,
	options: { nonce?: `0x${string}` } = {}
) {
	return encodeFunctionData({
		abi: TAKE_ORDERS_4_ABI,
		functionName: 'takeOrders4',
		args: [
			{
				minimumIO: ZERO_BYTES32,
				maximumIO: ZERO_BYTES32,
				maximumIORatio: ZERO_BYTES32,
				IOIsInput: request.mode === 'buyUpTo',
				orders: [
					{
						order: {
							owner: TAKER,
							evaluable: { interpreter: TAKER, store: TAKER, bytecode: '0x' },
							validInputs: [{ token: request.inputToken, vaultId: ZERO_BYTES32 }],
							validOutputs: [{ token: request.outputToken, vaultId: ZERO_BYTES32 }],
							nonce: options.nonce ?? ZERO_BYTES32
						},
						inputIOIndex: 0n,
						outputIOIndex: 0n,
						signedContext: []
					}
				],
				data: '0x'
			}
		]
	});
}

function readyResponse(
	request: ApiSwapCalldataV2Request = {
		taker: TAKER,
		inputToken: PAYMENT,
		outputToken: ASSET,
		mode: 'buyUpTo',
		amount: '1',
		priceCap: '2',
		denomination: 'wrapped'
	}
) {
	return {
		to: ORDERBOOK,
		data: takeOrdersData(request),
		value: '0x0',
		estimatedInput: '100',
		denomination: 'wrapped',
		resolvedPriceCap: '2.02',
		approvals: []
	};
}

function indexedTradeResponse(request: ApiSwapCalldataV2Request) {
	const inputIsPayment = request.inputToken === PAYMENT;
	const totalInputAmount =
		request.mode === 'spendUpTo' ? request.amount : inputIsPayment ? '100' : '1';
	const totalOutputAmount =
		request.mode === 'buyUpTo' ? request.amount : inputIsPayment ? '1' : '100';
	return {
		txHash: TRADE_HASH,
		blockNumber: 123,
		timestamp: 1_700_000_000,
		sender: TAKER,
		trades: [
			{
				orderHash: ZERO_BYTES32,
				orderOwner: TAKER,
				request: {
					inputToken: request.inputToken,
					outputToken: request.outputToken,
					maximumInput: totalInputAmount,
					maximumIoRatio: '100'
				},
				result: {
					inputAmount: totalInputAmount,
					outputAmount: `-${totalOutputAmount}`,
					actualIoRatio: '100'
				}
			}
		],
		totals: {
			totalInputAmount,
			totalOutputAmount,
			averageIoRatio: '100'
		}
	};
}

describe('executeMarketOrder REST calldata execution', () => {
	it('maps reference prices into input-per-output ratios for both sides', () => {
		expect(toReferenceIoRatio('Buy', 2500)).toBe('2500');
		expect(toReferenceIoRatio('Sell', 2500)).toBe('0.0004');
		expect(toReferenceIoRatio('Buy', 0)).toBeUndefined();
	});

	it.each([
		{
			name: 'buy by asset amount',
			orderSide: 'Buy' as const,
			inputMode: 'amount' as const,
			amount: 2_000_000_000_000_000_000n,
			expected: {
				inputToken: PAYMENT,
				outputToken: ASSET,
				mode: 'buyUpTo',
				amount: '2'
			}
		},
		{
			name: 'buy by payment spend',
			orderSide: 'Buy' as const,
			inputMode: 'spend' as const,
			amount: 25_000_000n,
			expected: {
				inputToken: PAYMENT,
				outputToken: ASSET,
				mode: 'spendUpTo',
				amount: '25'
			}
		},
		{
			name: 'sell by asset spend',
			orderSide: 'Sell' as const,
			inputMode: 'amount' as const,
			amount: 3_000_000_000_000_000_000n,
			expected: {
				inputToken: ASSET,
				outputToken: PAYMENT,
				mode: 'spendUpTo',
				amount: '3'
			}
		},
		{
			name: 'sell by payment receive',
			orderSide: 'Sell' as const,
			inputMode: 'receive' as const,
			amount: 40_000_000n,
			expected: {
				inputToken: ASSET,
				outputToken: PAYMENT,
				mode: 'buyUpTo',
				amount: '40'
			}
		}
	])(
		'maps $name to the REST quote/calldata contract',
		({ orderSide, inputMode, amount, expected }) => {
			expect(
				buildMarketSwapQuoteRequest({
					orderSide,
					inputMode,
					amount,
					slippageBps: 75,
					referenceIoRatio: '2.5',
					...tokens,
					network
				})
			).toEqual({
				...expected,
				slippageBps: 75,
				referenceIoRatio: '2.5',
				denomination: 'wrapped'
			});
		}
	);

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.apiGetSwapCalldataV2.mockReset();
		mocks.sendTransaction.mockReset();
		mocks.waitForTransaction.mockReset();
		mocks.apiGetTradesByTx.mockReset();
		mocks.getSignerAddress.mockReturnValue(TAKER);
		mocks.apiGetSwapCalldataV2.mockImplementation(async (request) => readyResponse(request));
		mocks.apiGetTradesByTx.mockImplementation(async () => {
			const request = mocks.apiGetSwapCalldataV2.mock.calls.at(-1)?.[0];
			if (!request) throw new Error('missing calldata request');
			return indexedTradeResponse(request);
		});
		mocks.sendTransaction.mockResolvedValue(TRADE_HASH);
		mocks.waitForTransaction.mockResolvedValue(undefined);
		mocks.update.mockImplementation((updater) => updater({}));
	});

	it('maps buy-by-amount to buyUpTo without walking browser quotes', async () => {
		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 2_000_000_000_000_000_000n,
			inputMode: 'amount',
			slippageBps: 50,
			referenceIoRatio: '2500',
			...tokens,
			network
		});

		expect(result).toEqual({ success: true });
		expect(mocks.apiGetSwapCalldataV2).toHaveBeenCalledWith({
			taker: TAKER,
			inputToken: PAYMENT,
			outputToken: ASSET,
			mode: 'buyUpTo',
			amount: '2',
			slippageBps: 50,
			referenceIoRatio: '2500',
			denomination: 'wrapped'
		});
		expect(mocks.sendTransaction).toHaveBeenCalledWith({
			to: ORDERBOOK,
			data: expect.stringMatching(/^0x69c72856/),
			value: 0n
		});
		expect(mocks.apiGetTradesByTx).toHaveBeenCalledWith(TRADE_HASH);
		expect(mocks.invalidateCostBasis).toHaveBeenCalledOnce();
		expect(mocks.transactionSuccess).toHaveBeenCalledWith(TRADE_HASH, 'Market order confirmed', {
			marketOrderSummary: expect.objectContaining({
				inputAmount: 2_000_000_000_000_000_000n,
				outputAmount: 100_000_000n,
				isPartialFill: false,
				isNoFill: false
			})
		});
	});

	it('reports a spend-anchored partial fill from indexed REST trade totals', async () => {
		mocks.apiGetTradesByTx.mockResolvedValue({
			...indexedTradeResponse({
				taker: TAKER,
				inputToken: ASSET,
				outputToken: PAYMENT,
				mode: 'spendUpTo',
				amount: '3',
				slippageBps: 100,
				denomination: 'wrapped'
			}),
			totals: {
				totalInputAmount: '1',
				totalOutputAmount: '100',
				averageIoRatio: '0.01'
			}
		});

		const result = await executeMarketOrder({
			orderSide: 'Sell',
			inputMode: 'amount',
			amount: 3_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result).toEqual({ success: true });
		expect(mocks.transactionSuccess).toHaveBeenCalledWith(TRADE_HASH, 'Market order confirmed', {
			marketOrderSummary: expect.objectContaining({
				inputAmount: 100_000_000n,
				outputAmount: 1_000_000_000_000_000_000n,
				requestedInputAmount: 3_000_000_000_000_000_000n,
				isPartialFill: true,
				isNoFill: false
			})
		});
		expect(mocks.invalidateDashboardBalances.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.transactionSuccess.mock.invocationCallOrder[0]
		);
	});

	it('keeps a confirmed transaction successful when indexed summary data is malformed', async () => {
		mocks.apiGetTradesByTx.mockResolvedValue({
			...indexedTradeResponse({
				taker: TAKER,
				inputToken: PAYMENT,
				outputToken: ASSET,
				mode: 'buyUpTo',
				amount: '1',
				slippageBps: 100,
				denomination: 'wrapped'
			}),
			txHash: APPROVAL_HASH
		});

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result).toEqual({ success: true });
		expect(mocks.transactionSuccess).toHaveBeenCalledWith(
			TRADE_HASH,
			'Market order confirmed',
			undefined
		);
		expect(mocks.captureTradeFlowError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Trade API returned an unexpected transaction hash'
			}),
			expect.objectContaining({
				stage: 'confirmation',
				operation: 'build_market_order_summary'
			})
		);
	});

	it('does not import browser-side SDK calldata or order-walking code', () => {
		const source = readFileSync(
			resolve(process.cwd(), 'src/lib/services/marketOrderExecution.ts'),
			'utf8'
		);

		expect(source).not.toContain('@rainlanguage/raindex');
		expect(source).not.toContain('$lib/clients/raindex');
		expect(source).not.toContain('$lib/stores/marketTakeStore');
		expect(source).not.toMatch(/\bwalkOrderbook\b/);
		expect(source).not.toMatch(/\bgetTake(?:Orders)?Calldata\b/);
	});

	it.each([
		{
			name: 'buy-by-spend',
			orderSide: 'Buy' as const,
			inputMode: 'spend' as const,
			amount: 12_500_000n,
			inputToken: PAYMENT,
			outputToken: ASSET,
			formattedAmount: '12.5'
		},
		{
			name: 'sell',
			orderSide: 'Sell' as const,
			inputMode: 'amount' as const,
			amount: 3_000_000_000_000_000_000n,
			inputToken: ASSET,
			outputToken: PAYMENT,
			formattedAmount: '3'
		}
	])('maps $name to spendUpTo', async (testCase) => {
		await executeMarketOrder({
			orderSide: testCase.orderSide,
			inputMode: testCase.inputMode,
			amount: testCase.amount,
			...tokens,
			network
		});

		expect(mocks.apiGetSwapCalldataV2).toHaveBeenCalledWith(
			expect.objectContaining({
				inputToken: testCase.inputToken,
				outputToken: testCase.outputToken,
				mode: 'spendUpTo',
				amount: testCase.formattedAmount
			})
		);
	});

	it('maps a sell receive anchor to buyUpTo in payment-token decimals', async () => {
		await executeMarketOrder({
			orderSide: 'Sell',
			inputMode: 'receive',
			amount: 12_500_000n,
			...tokens,
			network
		});

		expect(mocks.apiGetSwapCalldataV2).toHaveBeenCalledWith(
			expect.objectContaining({
				inputToken: ASSET,
				outputToken: PAYMENT,
				mode: 'buyUpTo',
				amount: '12.5'
			})
		);
	});

	it('refreshes ready calldata immediately before wallet broadcast', async () => {
		const initialRequest = {
			taker: TAKER,
			inputToken: PAYMENT,
			outputToken: ASSET,
			mode: 'buyUpTo' as const,
			amount: '1',
			slippageBps: 100,
			denomination: 'wrapped' as const
		};
		const refreshRequest = {
			taker: TAKER,
			inputToken: PAYMENT,
			outputToken: ASSET,
			mode: 'buyUpTo' as const,
			amount: '1',
			priceCap: '2.02',
			denomination: 'wrapped' as const
		};
		const staleData = takeOrdersData(initialRequest, { nonce: `0x${'1'.repeat(64)}` });
		const freshData = takeOrdersData(refreshRequest, { nonce: `0x${'2'.repeat(64)}` });
		mocks.apiGetSwapCalldataV2
			.mockResolvedValueOnce({
				...readyResponse(initialRequest),
				data: staleData,
				resolvedPriceCap: '2.02'
			})
			.mockResolvedValueOnce({
				...readyResponse(refreshRequest),
				data: freshData,
				resolvedPriceCap: '2.02'
			});

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			slippageBps: 100,
			...tokens,
			network
		});

		expect(result.success).toBe(true);
		expect(mocks.apiGetSwapCalldataV2).toHaveBeenCalledTimes(2);
		expect(mocks.apiGetSwapCalldataV2).toHaveBeenNthCalledWith(2, refreshRequest);
		expect(mocks.sendTransaction).toHaveBeenCalledWith({
			to: ORDERBOOK,
			data: freshData,
			value: 0n
		});
		expect(mocks.sendTransaction).not.toHaveBeenCalledWith(
			expect.objectContaining({ data: staleData })
		);
	});

	it('submits API approvals then retries and refreshes with the fixed resolved price cap', async () => {
		const approvalData = encodeFunctionData({
			abi: erc20Abi,
			functionName: 'approve',
			args: [ORDERBOOK, 100_000_000n]
		});
		const retryRequest = {
			taker: TAKER,
			inputToken: PAYMENT,
			outputToken: ASSET,
			mode: 'buyUpTo' as const,
			amount: '1',
			priceCap: '2.02',
			denomination: 'wrapped' as const
		};
		mocks.apiGetSwapCalldataV2
			.mockResolvedValueOnce({
				...readyResponse(),
				data: '0x',
				resolvedPriceCap: '2.02',
				approvals: [
					{
						token: PAYMENT,
						spender: ORDERBOOK,
						amount: '100',
						symbol: 'USDC',
						approvalData
					}
				]
			})
			.mockResolvedValueOnce(readyResponse(retryRequest));
		mocks.sendTransaction.mockResolvedValueOnce(APPROVAL_HASH).mockResolvedValueOnce(TRADE_HASH);

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			slippageBps: 100,
			...tokens,
			network
		});

		expect(result.success).toBe(true);
		expect(mocks.sendTransaction).toHaveBeenNthCalledWith(1, {
			to: PAYMENT,
			data: approvalData
		});
		expect(mocks.waitForTransaction).toHaveBeenNthCalledWith(1, APPROVAL_HASH, {
			confirmations: 2
		});
		expect(mocks.apiGetSwapCalldataV2).toHaveBeenNthCalledWith(2, {
			...retryRequest
		});
		expect(mocks.apiGetSwapCalldataV2).toHaveBeenCalledTimes(2);
	});

	it('retries calldata after approve when the next responses still list approvals (ST0-27)', async () => {
		const approvalData = encodeFunctionData({
			abi: erc20Abi,
			functionName: 'approve',
			args: [ORDERBOOK, 100_000_000n]
		});
		const retryRequest = {
			taker: TAKER,
			inputToken: PAYMENT,
			outputToken: ASSET,
			mode: 'buyUpTo' as const,
			amount: '1',
			priceCap: '2.02',
			denomination: 'wrapped' as const
		};
		const pending = {
			...readyResponse(),
			data: '0x',
			resolvedPriceCap: '2.02',
			approvals: [
				{
					token: PAYMENT,
					spender: ORDERBOOK,
					amount: '100',
					symbol: 'USDC',
					approvalData
				}
			]
		};
		const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
			if (typeof cb === 'function') cb();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});
		try {
			mocks.apiGetSwapCalldataV2
				.mockResolvedValueOnce(pending)
				.mockResolvedValueOnce(pending)
				.mockResolvedValueOnce(pending)
				.mockResolvedValueOnce(readyResponse(retryRequest));
			mocks.sendTransaction.mockResolvedValueOnce(APPROVAL_HASH).mockResolvedValueOnce(TRADE_HASH);

			const result = await executeMarketOrder({
				orderSide: 'Buy',
				amount: 1_000_000_000_000_000_000n,
				slippageBps: 100,
				...tokens,
				network
			});

			expect(result.success).toBe(true);
			expect(mocks.sendTransaction).toHaveBeenNthCalledWith(1, {
				to: PAYMENT,
				data: approvalData
			});
			expect(mocks.apiGetSwapCalldataV2.mock.calls.length).toBeGreaterThanOrEqual(4);
		} finally {
			timeoutSpy.mockRestore();
		}
	});

	it('surfaces a settling error after approve if calldata keeps requiring approval (ST0-27)', async () => {
		const approvalData = encodeFunctionData({
			abi: erc20Abi,
			functionName: 'approve',
			args: [ORDERBOOK, 100_000_000n]
		});
		const pending = {
			...readyResponse(),
			data: '0x',
			resolvedPriceCap: '2.02',
			approvals: [
				{
					token: PAYMENT,
					spender: ORDERBOOK,
					amount: '100',
					symbol: 'USDC',
					approvalData
				}
			]
		};
		const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
			if (typeof cb === 'function') cb();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});
		try {
			mocks.apiGetSwapCalldataV2.mockResolvedValue(pending);
			mocks.sendTransaction.mockResolvedValueOnce(APPROVAL_HASH);

			const result = await executeMarketOrder({
				orderSide: 'Buy',
				amount: 1_000_000_000_000_000_000n,
				slippageBps: 100,
				...tokens,
				network
			});

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/still settling/i);
			expect(result.tradeError).toMatchObject({
				code: 'TRADE_APPROVAL_SETTLING',
				stage: 'approval'
			});
			expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
		} finally {
			timeoutSpy.mockRestore();
		}
	});

	it.each([
		{
			name: 'a non-takeOrders4 selector',
			override: {
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'approve',
					args: [ORDERBOOK, 1n]
				})
			},
			error: 'malformed takeOrders4 calldata'
		},
		{
			name: 'nonzero native value',
			override: { value: '1' },
			error: 'unexpected native token value'
		},
		{
			name: 'a mismatched denomination',
			override: { denomination: 'unwrapped' },
			error: 'unexpected denomination'
		}
	])('rejects $name from the calldata API', async ({ override, error }) => {
		mocks.apiGetSwapCalldataV2.mockResolvedValue({ ...readyResponse(), ...override });

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain(error);
		expect(mocks.sendTransaction).not.toHaveBeenCalled();
		expect(mocks.captureTradeFlowError).toHaveBeenCalled();
	});

	it('rejects approval calldata for a token other than the requested input', async () => {
		const unexpectedToken = '0x4444444444444444444444444444444444444444';
		mocks.apiGetSwapCalldataV2.mockResolvedValue({
			...readyResponse(),
			data: '0x',
			approvals: [
				{
					token: unexpectedToken,
					spender: ORDERBOOK,
					amount: '1',
					symbol: 'BAD',
					approvalData: encodeFunctionData({
						abi: erc20Abi,
						functionName: 'approve',
						args: [ORDERBOOK, 1n]
					})
				}
			]
		});

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('unexpected token');
		expect(mocks.sendTransaction).not.toHaveBeenCalled();
		expect(mocks.captureTradeFlowError).toHaveBeenCalled();
	});

	it('preserves structured API error metadata for the support UI', async () => {
		mocks.apiGetSwapCalldataV2.mockRejectedValue(
			new HttpError({
				status: 503,
				code: 'UPSTREAM_UNAVAILABLE',
				requestId: 'request-42',
				publicMessage: 'Trading service unavailable',
				retryAfter: null
			})
		);

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result.tradeError).toMatchObject({
			code: 'UPSTREAM_UNAVAILABLE',
			requestId: 'request-42',
			stage: 'calldata'
		});
	});

	it('surfaces oracle-unavailable calldata failures as temporary price-data errors', async () => {
		mocks.apiGetSwapCalldataV2.mockRejectedValue(
			new HttpError({
				status: 503,
				code: 'SWAP_ORACLE_UNAVAILABLE',
				requestId: 'request-oracle',
				publicMessage: 'Required swap oracle unavailable',
				retryAfter: null
			})
		);

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result).toMatchObject({
			success: false,
			errorClass: 'stale_oracle',
			tradeError: {
				code: 'SWAP_ORACLE_UNAVAILABLE',
				requestId: 'request-oracle',
				stage: 'calldata',
				action: 'try_later'
			}
		});
	});

	it('maps wallet rejection to the signing support code', async () => {
		mocks.sendTransaction.mockRejectedValue(new Error('User rejected request'));

		const result = await executeMarketOrder({
			orderSide: 'Buy',
			amount: 1_000_000_000_000_000_000n,
			...tokens,
			network
		});

		expect(result).toMatchObject({
			success: false,
			errorClass: 'user_rejected',
			tradeError: {
				code: 'TRADE_WALLET_ACTION_REJECTED',
				stage: 'signing'
			}
		});
	});
});
