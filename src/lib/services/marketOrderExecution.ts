/**
 * Market order execution through REST API-built calldata.
 *
 * The browser deliberately does not walk orders, hydrate SDK objects, simulate
 * candidates, derive price caps, or build takeOrders calldata. Those decisions
 * live in the REST API and the Raindex SDK it calls. This module only validates
 * the returned transactions, handles approvals, and submits them to the wallet.
 */

import {
	apiGetSwapCalldataV2,
	type ApiApproval,
	type ApiSwapCalldataV2Request,
	type ApiSwapCalldataV2Response
} from '$lib/api/st0xApi';
import type { Network } from '$lib/config/network';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import {
	APPROVAL_TX_CONFIRMATIONS,
	getSignerAddress,
	sendTransaction,
	waitForTransaction
} from '$lib/services/walletService';
import { classifyError } from '$lib/services/observability/classifyError';
import {
	addTradeFlowBreadcrumb,
	captureTradeFlowError
} from '$lib/services/observability/tradeFlow';
import { getCurrentTradeId } from '$lib/services/observability/tradeId';
import { trackTradeEvent, type ErrorClass } from '$lib/services/observability/tradeEvents';
import { TAKE_ORDERS_4_ABI } from '$lib/services/takeOrders4Abi';
import {
	TransactionStatus,
	transactionStoreInternal,
	validateOrderbookAddress
} from '$lib/stores/transactionShared';
import type { TokenInfo } from '$lib/types/transactions';
import {
	clampSlippageBps,
	DEFAULT_MARKET_ORDER_SLIPPAGE_BPS as DEFAULT_BPS,
	MAX_SLIPPAGE_BPS as MAX_BPS
} from '$lib/utils/marketOrderFill';
import {
	decodeFunctionData,
	erc20Abi,
	formatUnits,
	isAddress,
	isHex,
	parseUnits,
	type Hex
} from 'viem';

export const DEFAULT_MARKET_ORDER_SLIPPAGE_BPS = DEFAULT_BPS;
export const MAX_SLIPPAGE_BPS = MAX_BPS;

export interface MarketOrderInput {
	orderSide: 'Buy' | 'Sell';
	/** For Buy: asset received. For Sell: asset spent. */
	amount: bigint;
	/** Anchor chosen by the UI: asset amount, input spend, or output receive. */
	inputMode?: 'amount' | 'spend' | 'receive';
	slippageBps?: number;
	assetToken: TokenInfo;
	paymentToken: TokenInfo;
	network: Network;
}

export interface MarketOrderResult {
	success: boolean;
	error?: string;
	errorClass?: ErrorClass;
}

function buildCalldataRequest(input: MarketOrderInput, taker: string): ApiSwapCalldataV2Request {
	const { orderSide, inputMode = 'amount', amount, assetToken, paymentToken } = input;
	const isBuy = orderSide === 'Buy';
	const inputToken = isBuy ? paymentToken : assetToken;
	const outputToken = isBuy ? assetToken : paymentToken;
	const isOutputAnchored = (isBuy && inputMode === 'amount') || (!isBuy && inputMode === 'receive');
	const amountToken = isOutputAnchored ? outputToken : inputToken;

	return {
		taker,
		inputToken: inputToken.address,
		outputToken: outputToken.address,
		mode: isOutputAnchored ? 'buyUpTo' : 'spendUpTo',
		amount: formatUnits(amount, amountToken.decimals),
		slippageBps: clampSlippageBps(input.slippageBps ?? DEFAULT_MARKET_ORDER_SLIPPAGE_BPS),
		denomination: 'wrapped'
	};
}

function buildApprovalRetryRequest(
	request: ApiSwapCalldataV2Request,
	resolvedPriceCap: string
): ApiSwapCalldataV2Request {
	if (!resolvedPriceCap) {
		throw new Error('Calldata API returned an empty resolved price cap');
	}
	return {
		taker: request.taker,
		inputToken: request.inputToken,
		outputToken: request.outputToken,
		mode: request.mode,
		amount: request.amount,
		priceCap: resolvedPriceCap,
		denomination: request.denomination
	};
}

function validateApproval(
	approval: ApiApproval,
	request: ApiSwapCalldataV2Request,
	network: Network,
	inputTokenDecimals: number
): { token: `0x${string}`; data: Hex } {
	if (
		!isAddress(approval.token) ||
		approval.token.toLowerCase() !== request.inputToken.toLowerCase()
	) {
		throw new Error('Calldata API returned an approval for an unexpected token');
	}
	if (!isAddress(approval.spender)) {
		throw new Error('Calldata API returned an invalid approval spender');
	}
	validateOrderbookAddress(approval.spender, network);
	if (!isHex(approval.approvalData)) {
		throw new Error('Calldata API returned invalid approval calldata');
	}

	let decoded: ReturnType<typeof decodeFunctionData>;
	try {
		decoded = decodeFunctionData({ abi: erc20Abi, data: approval.approvalData });
	} catch {
		throw new Error('Calldata API returned undecodable approval calldata');
	}
	if (decoded.functionName !== 'approve') {
		throw new Error('Calldata API returned non-approval calldata');
	}
	const [calldataSpender, calldataAmount] = decoded.args;
	let expectedAmount: bigint;
	try {
		expectedAmount = parseUnits(approval.amount, inputTokenDecimals);
	} catch {
		throw new Error('Calldata API returned an invalid approval amount');
	}
	if (
		typeof calldataSpender !== 'string' ||
		typeof calldataAmount !== 'bigint' ||
		calldataSpender.toLowerCase() !== approval.spender.toLowerCase() ||
		calldataAmount <= 0n ||
		calldataAmount !== expectedAmount
	) {
		throw new Error('Calldata API approval details do not match its transaction');
	}

	return { token: approval.token, data: approval.approvalData };
}

async function submitApprovals(
	approvals: ApiApproval[],
	request: ApiSwapCalldataV2Request,
	network: Network,
	inputTokenDecimals: number
): Promise<void> {
	for (const approval of approvals) {
		const transaction = validateApproval(approval, request, network, inputTokenDecimals);
		trackTradeEvent('sign_approval', { order_type: 'market' });
		transactionStoreInternal.awaitWalletConfirmation(
			`Awaiting wallet confirmation to approve ${approval.symbol || 'token'}...`
		);
		const hash = await sendTransaction({ to: transaction.token, data: transaction.data });
		transactionStoreInternal.awaitApprovalTx(hash);
		await waitForTransaction(hash, { confirmations: APPROVAL_TX_CONFIRMATIONS });
	}
}

function validateReadyCalldata(
	response: ApiSwapCalldataV2Response,
	request: ApiSwapCalldataV2Request,
	network: Network
): { to: `0x${string}`; data: Hex; value: bigint } {
	if (response.approvals.length > 0) {
		throw new Error('Calldata API still requires approval after approval confirmation');
	}
	if (!isAddress(response.to)) {
		throw new Error('Calldata API returned an invalid transaction target');
	}
	validateOrderbookAddress(response.to, network);
	if (!isHex(response.data) || response.data === '0x') {
		throw new Error('Calldata API returned empty transaction calldata');
	}
	if (response.denomination !== request.denomination) {
		throw new Error('Calldata API returned an unexpected denomination');
	}

	let value: bigint;
	try {
		value = BigInt(response.value);
	} catch {
		throw new Error('Calldata API returned an invalid transaction value');
	}
	if (value !== 0n) {
		throw new Error('Calldata API returned an unexpected native token value');
	}

	type DecodedTakeOrder = {
		inputIOIndex: bigint;
		outputIOIndex: bigint;
		order: {
			validInputs: readonly { token: string }[];
			validOutputs: readonly { token: string }[];
		};
	};
	type DecodedTakeOrdersConfig = {
		IOIsInput: boolean;
		orders: readonly DecodedTakeOrder[];
	};
	let config: DecodedTakeOrdersConfig;
	try {
		const decoded = decodeFunctionData({ abi: TAKE_ORDERS_4_ABI, data: response.data });
		if (decoded.functionName !== 'takeOrders4') {
			throw new Error('unexpected selector');
		}
		[config] = decoded.args as unknown as readonly [DecodedTakeOrdersConfig];
	} catch {
		throw new Error('Calldata API returned malformed takeOrders4 calldata');
	}
	if (config.orders.length === 0) {
		throw new Error('Calldata API returned takeOrders4 calldata without orders');
	}
	const expectedIOIsInput = request.mode === 'buyUpTo';
	if (config.IOIsInput !== expectedIOIsInput) {
		throw new Error('Calldata API returned calldata for an unexpected swap mode');
	}
	for (const orderConfig of config.orders) {
		// eslint-disable-next-line no-restricted-syntax -- decoding canonical REST takeOrders4 calldata requires validating its raw IO indexes before submission
		const inputIndex = Number(orderConfig.inputIOIndex);
		// eslint-disable-next-line no-restricted-syntax -- decoding canonical REST takeOrders4 calldata requires validating its raw IO indexes before submission
		const outputIndex = Number(orderConfig.outputIOIndex);
		const input = orderConfig.order.validInputs[inputIndex];
		const output = orderConfig.order.validOutputs[outputIndex];
		if (
			!input ||
			!output ||
			input.token.toLowerCase() !== request.inputToken.toLowerCase() ||
			output.token.toLowerCase() !== request.outputToken.toLowerCase()
		) {
			throw new Error('Calldata API returned calldata for an unexpected token pair');
		}
	}
	return { to: response.to, data: response.data, value };
}

/** Execute a market order using calldata built entirely by the REST API. */
export async function executeMarketOrder(input: MarketOrderInput): Promise<MarketOrderResult> {
	const { orderSide, assetToken, paymentToken, network } = input;
	const flowContext = (stage: 'quote' | 'calldata' | 'submission', operation: string) => ({
		stage,
		operation,
		orderType: 'market' as const,
		orderSide: orderSide.toLowerCase() as 'buy' | 'sell',
		tradeId: getCurrentTradeId(),
		chainId: network.id,
		assetSymbol: assetToken.symbol,
		paymentSymbol: paymentToken.symbol
	});
	let activeStage: 'quote' | 'calldata' | 'submission' = 'calldata';

	const failWith = (error: unknown): MarketOrderResult => {
		const message = error instanceof Error ? error.message : 'Unknown error occurred';
		transactionStoreInternal.update((state) => ({
			...state,
			status: TransactionStatus.ERROR,
			error: message
		}));
		return { success: false, error: message, errorClass: classifyError(error, 'market') };
	};

	try {
		const taker = getSignerAddress();
		if (!taker) {
			return { success: false, error: 'Wallet not connected. Please reconnect and try again.' };
		}

		const request = buildCalldataRequest(input, taker);
		transactionStoreInternal.checkingWalletAllowance('Preparing market order...');
		addTradeFlowBreadcrumb(flowContext('calldata', 'request_api_calldata'), 'started');
		let response = await apiGetSwapCalldataV2(request);
		addTradeFlowBreadcrumb(flowContext('calldata', 'request_api_calldata'), 'completed');
		trackTradeEvent('quote_received', {
			order_type: 'market',
			order_side: orderSide.toLowerCase() as 'buy' | 'sell',
			mode: request.mode === 'buyUpTo' ? 'buyUpTo' : 'spendUpTo',
			asset_symbol: assetToken.symbol,
			payment_symbol: paymentToken.symbol,
			amount: request.amount,
			slippage_bps: 'slippageBps' in request ? request.slippageBps : undefined
		});

		if (response.approvals.length > 0) {
			const inputTokenDecimals = orderSide === 'Buy' ? paymentToken.decimals : assetToken.decimals;
			await submitApprovals(response.approvals, request, network, inputTokenDecimals);
			response = await apiGetSwapCalldataV2(
				buildApprovalRetryRequest(request, response.resolvedPriceCap)
			);
		}

		const transaction = validateReadyCalldata(response, request, network);
		activeStage = 'submission';
		addTradeFlowBreadcrumb(flowContext('submission', 'take_market_order'), 'started');
		trackTradeEvent('sign_trade', {
			order_type: 'market',
			order_side: orderSide.toLowerCase() as 'buy' | 'sell'
		});
		transactionStoreInternal.awaitWalletConfirmation('Awaiting wallet confirmation...');
		const hash = await sendTransaction(transaction);
		trackTradeEvent('broadcast', {
			order_type: 'market',
			order_side: orderSide.toLowerCase() as 'buy' | 'sell',
			asset_symbol: assetToken.symbol,
			payment_symbol: paymentToken.symbol
		});
		await waitForTransaction(hash);
		trackTradeEvent('confirmed', {
			order_type: 'market',
			order_side: orderSide.toLowerCase() as 'buy' | 'sell',
			asset_symbol: assetToken.symbol,
			payment_symbol: paymentToken.symbol
		});
		addTradeFlowBreadcrumb(flowContext('submission', 'take_market_order'), 'completed');
		invalidateDashboardBalances();
		transactionStoreInternal.transactionSuccess(hash, 'Market order confirmed');
		return { success: true };
	} catch (error) {
		console.error(`[executeMarketOrder] ${activeStage} failed:`, error);
		captureTradeFlowError(error, flowContext(activeStage, 'execute_market_order'));
		return failWith(error);
	}
}
