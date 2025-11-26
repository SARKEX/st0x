import { formatUnits } from 'viem';
import { parseFloatHex } from '$lib/utils/tokenMath';
import { TOKENS } from '$lib/config/tokens';
import type { SgTrade } from '@rainlanguage/orderbook';
import type { DisplayOrder } from '$lib/types/orders';

/**
 * Transform a trade into a DisplayOrder for the OrdersTable component.
 *
 * Buy/Sell semantics (from user's perspective):
 * - Your output (what you give) = outputToken (goes into order's output vault)
 * - Your input (what you receive) = inputToken (comes from order's input vault)
 * - Sell = giving away the asset, so asset is your output (outputToken)
 * - Buy = receiving the asset, so asset is your input (inputToken)
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

	// Determine Buy/Sell
	let isBuy: boolean;
	let assetTokenSymbol: string;
	let assetTokenAddress: string;

	if ('targetTokenAddress' in options) {
		// Trade page: check if target matches input (Buy) or output (Sell)
		const targetAddr = options.targetTokenAddress.toLowerCase();
		isBuy = inputAddr === targetAddr;
		assetTokenSymbol = isBuy ? inputToken.symbol ?? 'UNKNOWN' : outputToken.symbol ?? 'UNKNOWN';
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
		isBuy = inputIsAsset;
		const assetToken = inputIsAsset ? inputToken : outputIsAsset ? outputToken : inputToken;
		assetTokenSymbol = assetToken.symbol ?? 'UNKNOWN';
		assetTokenAddress = inputIsAsset ? inputAddr : outputIsAsset ? outputAddr : inputAddr;
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

	// Calculate price (payment / asset)
	// Buy: gave payment (output), received asset (input) -> price = output/input
	// Sell: gave asset (output), received payment (input) -> price = input/output
	let price: number | undefined;
	if (inputAmountBigInt > 0n && outputAmountBigInt > 0n) {
		const inputValue = parseFloat(formatUnits(inputAmountBigInt, inputDecimals));
		const outputValue = parseFloat(formatUnits(outputAmountBigInt, outputDecimals));
		price = isBuy ? outputValue / inputValue : inputValue / outputValue;
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
