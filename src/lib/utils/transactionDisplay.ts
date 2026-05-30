/**
 * Transaction Display Utilities
 *
 * Translates store-level input/output/ioRatio data into user-friendly
 * Buy/Sell/price terminology for UI display.
 */

import type { MarketOrderSummary } from '$lib/stores/transaction';
import { formatUnits } from 'viem';
import { isPaymentToken, computePrice } from '$lib/utils/tokenMath';
import { getMakerInputTokenAddress, getMakerOutputTokenAddress } from '$lib/types/orderPerspective';

export interface MarketOrderDisplay {
	direction: 'Buy' | 'Sell';
	assetAmount: bigint;
	assetSymbol: string;
	assetDecimals: number;
	assetAddress: string;
	paymentAmount: bigint;
	paymentSymbol: string;
	paymentDecimals: number;
	price: number; // Payment token per asset token
	requestedAmount: bigint;
	isPartialFill: boolean;
	isNoFill: boolean;
}

/**
 * Translates input/output/ioRatio data from MarketOrderSummary
 * into user-friendly Buy/Sell/price display format.
 *
 * Logic:
 * - If inputToken is payment token → SELL (user received payment, gave asset)
 * - If outputToken is payment token → BUY (user gave payment, received asset)
 * - Price = payment amount / asset amount
 */
export function translateMarketOrderForDisplay(summary: MarketOrderSummary): MarketOrderDisplay {
	// Use consolidated utility from tokenMath.ts
	const inputIsPayment = isPaymentToken(summary.inputTokenSymbol);

	// Determine direction
	// If user received payment token as input → they SOLD the asset
	// If user gave payment token as output → they BOUGHT the asset
	const direction: 'Buy' | 'Sell' = inputIsPayment ? 'Sell' : 'Buy';

	// Determine asset and payment amounts
	const assetAmount = direction === 'Buy' ? summary.inputAmount : summary.outputAmount;
	const assetSymbol = direction === 'Buy' ? summary.inputTokenSymbol : summary.outputTokenSymbol;
	const assetDecimals =
		direction === 'Buy' ? summary.inputTokenDecimals : summary.outputTokenDecimals;
	const assetAddress =
		direction === 'Buy' ? getMakerInputTokenAddress(summary) : getMakerOutputTokenAddress(summary);

	const paymentAmount = direction === 'Buy' ? summary.outputAmount : summary.inputAmount;
	const paymentSymbol = direction === 'Buy' ? summary.outputTokenSymbol : summary.inputTokenSymbol;
	const paymentDecimals =
		direction === 'Buy' ? summary.outputTokenDecimals : summary.inputTokenDecimals;

	// Calculate price using consolidated utility
	const assetDecimal = parseFloat(formatUnits(assetAmount, assetDecimals));
	const paymentDecimal = parseFloat(formatUnits(paymentAmount, paymentDecimals));
	const price = computePrice(paymentDecimal, assetDecimal) ?? 0;

	// For Buy orders, requestedAmount is the asset amount
	// For Sell orders, requestedAmount is also tracked as the asset amount the user wanted to sell
	const requestedAmount =
		direction === 'Buy' ? summary.requestedInputAmount : summary.requestedInputAmount;

	return {
		direction,
		assetAmount,
		assetSymbol,
		assetDecimals,
		assetAddress,
		paymentAmount,
		paymentSymbol,
		paymentDecimals,
		price,
		requestedAmount,
		isPartialFill: summary.isPartialFill,
		isNoFill: summary.isNoFill ?? false
	};
}
