import { formatUnits } from 'viem';
import { parseFloatHex } from '$lib/utils/tokenMath';
import { TOKENS, getTokenByAnyAddress } from '$lib/config/tokens';
import type { SgTrade } from '@rainlanguage/raindex';
import type { DisplayOrder } from '$lib/types/orders';
import type { ApiTradeByAddress } from '$lib/api/st0xApi';

/**
 * Transform a trade into a DisplayOrder for the OrdersTable component.
 *
 * Buy/Sell semantics (from taker's perspective):
 * - Trade data is from the ORDER's perspective (the counterparty)
 * - Order's input (inputVaultBalanceChange) = what the taker GAVE
 * - Order's output (outputVaultBalanceChange) = what the taker RECEIVED
 * - Buy = taker received the asset = order's output is the asset
 * - Sell = taker gave the asset = order's input is the asset
 *
 * @param trade - The trade from the subgraph
 * @param options - Either provide targetTokenAddress (for trade page) or chainId (for dashboard)
 */
export function transformTradeToDisplayOrder(
	trade: SgTrade,
	options: { targetTokenAddress: string } | { chainId: number }
): DisplayOrder | null {
	const inputToken = trade.inputVaultBalanceChange?.vault?.token;
	const outputToken = trade.outputVaultBalanceChange?.vault?.token;

	if (!inputToken || !outputToken) return null;

	const inputAddr = inputToken.address?.toLowerCase() ?? '';
	const outputAddr = outputToken.address?.toLowerCase() ?? '';

	// Determine Buy/Sell from TAKER's perspective
	// Order's output = what taker received, Order's input = what taker gave
	let isBuy: boolean;
	let assetTokenSymbol: string;
	let assetTokenAddress: string;

	if ('targetTokenAddress' in options) {
		// Trade page: if taker received the target token (order's output), they bought it
		const targetAddr = options.targetTokenAddress.toLowerCase();
		isBuy = outputAddr === targetAddr;
		assetTokenSymbol = isBuy ? outputToken.symbol ?? 'UNKNOWN' : inputToken.symbol ?? 'UNKNOWN';
		assetTokenAddress = targetAddr;
	} else {
		// Dashboard: check if input/output is an asset token
		const chainId = options.chainId;
		const inputIsAsset = TOKENS.some(
			(t) => t.chainId === chainId && t.address.toLowerCase() === inputAddr
		);
		const outputIsAsset = TOKENS.some(
			(t) => t.chainId === chainId && t.address.toLowerCase() === outputAddr
		);
		// If taker received the asset (order's output is asset), they bought it
		isBuy = outputIsAsset;
		const assetToken = outputIsAsset ? outputToken : inputIsAsset ? inputToken : outputToken;
		assetTokenSymbol = assetToken.symbol ?? 'UNKNOWN';
		assetTokenAddress = outputIsAsset ? outputAddr : inputIsAsset ? inputAddr : outputAddr;
	}

	// Parse amounts
	const inputAmountHex = trade.inputVaultBalanceChange?.amount;
	const outputAmountHex = trade.outputVaultBalanceChange?.amount;
	const inputDecimals = Number(inputToken.decimals ?? 18);
	const outputDecimals = Number(outputToken.decimals ?? 18);

	const inputAmountBigInt = inputAmountHex
		? parseFloatHex(inputAmountHex, inputDecimals, true)
		: 0n;
	const outputAmountBigInt = outputAmountHex
		? parseFloatHex(outputAmountHex, outputDecimals, true)
		: 0n;

	// Calculate price (payment / asset) from taker's perspective
	// Order's input = what taker gave, Order's output = what taker received
	// Buy: taker gave payment (order's input), received asset (order's output) -> price = input/output
	// Sell: taker gave asset (order's input), received payment (order's output) -> price = output/input
	let price: number | undefined;
	if (inputAmountBigInt > 0n && outputAmountBigInt > 0n) {
		const inputValue = parseFloat(formatUnits(inputAmountBigInt, inputDecimals));
		const outputValue = parseFloat(formatUnits(outputAmountBigInt, outputDecimals));
		price = isBuy ? inputValue / outputValue : outputValue / inputValue;
	}

	return {
		type: 'market',
		orderHash: trade.order?.orderHash ?? trade.id,
		timestamp: Number(trade.timestamp),
		side: isBuy ? 'Buy' : 'Sell',
		trade,
		tokenSymbol: assetTokenSymbol,
		tokenAddress: assetTokenAddress,
		inputTokenSymbol: inputToken.symbol ?? 'UNKNOWN',
		outputTokenSymbol: outputToken.symbol ?? 'UNKNOWN',
		inputAmount: inputAmountBigInt > 0n ? formatUnits(inputAmountBigInt, inputDecimals) : undefined,
		outputAmount:
			outputAmountBigInt > 0n ? formatUnits(outputAmountBigInt, outputDecimals) : undefined,
		price
	};
}

/**
 * Transform REST API taker trades into DisplayOrder[] for the dashboard.
 *
 * Each ApiTradeByAddress is one order fill from the order's perspective.
 *
 * Buy/Sell from taker's perspective:
 * - inputToken = what the ORDER takes in (= what taker GIVES)
 * - outputToken = what the ORDER gives out (= what taker RECEIVES)
 * - If taker received an asset token, they bought it
 */
export function transformApiTakerTradesToDisplay(
	trades: ApiTradeByAddress[],
	chainId: number
): DisplayOrder[] {
	const displayOrders: DisplayOrder[] = [];

	for (const trade of trades) {
		const order = transformApiTradeEntry(trade, chainId);
		if (order) displayOrders.push(order);
	}

	return displayOrders;
}

function transformApiTradeEntry(trade: ApiTradeByAddress, chainId: number): DisplayOrder | null {
	const inputAddr = trade.inputToken.address.toLowerCase();
	const outputAddr = trade.outputToken.address.toLowerCase();

	// Look up token config for symbol and classification.
	// DRIFT-01: use getTokenByAnyAddress to match wrapped/unwrapped/legacy
	// address variants. Post-filter chainId to preserve the original guard.
	const inputMatch = getTokenByAnyAddress(inputAddr);
	const outputMatch = getTokenByAnyAddress(outputAddr);
	const inputConfig = inputMatch?.chainId === chainId ? inputMatch : undefined;
	const outputConfig = outputMatch?.chainId === chainId ? outputMatch : undefined;

	const inputSymbol = inputConfig?.symbol ?? trade.inputToken.symbol ?? 'UNKNOWN';
	const outputSymbol = outputConfig?.symbol ?? trade.outputToken.symbol ?? 'UNKNOWN';

	// Determine Buy/Sell from taker perspective
	// outputToken = what taker receives. If it's an asset token, taker bought it.
	const outputIsAsset = !!outputConfig;
	const inputIsAsset = !!inputConfig;
	const isBuy = outputIsAsset;

	const assetSymbol = isBuy ? outputSymbol : inputIsAsset ? inputSymbol : outputSymbol;
	const assetAddress = isBuy ? outputAddr : inputIsAsset ? inputAddr : outputAddr;

	// Amounts are decimal strings. Output amounts are commonly negative from the order perspective.
	const inputAmount = Math.abs(parseFloat(trade.inputAmount));
	const outputAmount = Math.abs(parseFloat(trade.outputAmount));

	let price: number | undefined;
	if (inputAmount > 0 && outputAmount > 0) {
		price = isBuy ? inputAmount / outputAmount : outputAmount / inputAmount;
	}

	// Market orders are always fully filled — filled = asset amount traded
	const filled = isBuy ? outputAmount : inputAmount;

	return {
		type: 'market',
		orderHash: trade.orderHash ?? trade.txHash,
		timestamp: trade.timestamp,
		side: isBuy ? 'Buy' : 'Sell',
		txHash: trade.txHash,
		tokenSymbol: assetSymbol,
		tokenAddress: assetAddress,
		inputTokenSymbol: inputSymbol,
		outputTokenSymbol: outputSymbol,
		inputAmount: inputAmount > 0 ? trade.inputAmount : undefined,
		outputAmount: outputAmount > 0 ? trade.outputAmount : undefined,
		price,
		filled: filled > 0 ? filled : undefined,
		filledSymbol: assetSymbol
	};
}
