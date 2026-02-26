/**
 * Market Order Execution Service
 *
 * Shared logic for executing market orders, used by both MarketOrder.svelte and QuickTrade.svelte.
 * Uses the st0x swap calldata API: first call returns approvals, second call (after approval) returns swap calldata.
 */

import { type ProcessedQuote, walkOrderbook } from '$lib/api/orders';
import type { Network } from '$lib/config/network';
import type { TokenInfo } from '$lib/types/transactions';
import transactionStore from '$lib/stores/transaction';
import { getSignerAddress } from '$lib/services/walletService';
import { formatUnits } from 'viem';

export interface MarketOrderInput {
	// Order parameters
	orderSide: 'Buy' | 'Sell';
	/** For Buy: amount of asset tokens to receive. For Sell: amount of asset tokens to sell */
	amount: bigint;
	/** 'amount' = specify asset quantity, 'spend' = specify payment amount (Buy only) */
	inputMode?: 'amount' | 'spend';

	// Tokens
	assetToken: TokenInfo;
	paymentToken: TokenInfo;

	// Quotes
	quotes: ProcessedQuote[];

	// Network
	network: Network;

	// Optional: callback to refresh quotes (for recalculation after approval)
	refreshQuotes?: () => Promise<ProcessedQuote[]>;
}

export interface MarketOrderResult {
	success: boolean;
	error?: string;
}

/**
 * Execute a market order via the st0x swap calldata API.
 * Walk orderbook to get amounts and ratio, then call API (approvals → second call → swap calldata).
 */
export async function executeMarketOrder(input: MarketOrderInput): Promise<MarketOrderResult> {
	const {
		orderSide,
		amount,
		inputMode = 'amount',
		assetToken,
		paymentToken,
		quotes,
		network
	} = input;

	try {
		const taker = getSignerAddress();
		if (!taker) {
			return { success: false, error: 'Wallet not connected' };
		}

		// 1. Walk the orderbook to get fills and amounts
		const walkResult = walkOrderbook({
			quotes,
			orderSide,
			selectedAmount: amount,
			assetDecimals: assetToken.decimals,
			paymentDecimals: paymentToken.decimals,
			mode: inputMode === 'spend' ? 'spend' : 'receive'
		});

		if (!walkResult || walkResult.fills.length === 0) {
			return { success: false, error: 'No orders available to fill' };
		}

		const isBuy = orderSide === 'Buy';
		const {
			inputAmountFilled,
			outputAmountGiven,
			inputDecimals,
			outputDecimals
		} = walkResult;

		// User convention: input = token you put in, output = token you take out
		// inputAmountFilled = what user receives, outputAmountGiven = what user gives
		const inputToken = isBuy ? paymentToken.address : assetToken.address; // token user puts in
		const outputToken = isBuy ? assetToken.address : paymentToken.address; // token user takes out

		// Output amount = amount of output token (what user wants to receive) in human-readable form e.g. "1.501223"
		const outputAmountHuman = formatUnits(inputAmountFilled, inputDecimals);

		// Maximum IO ratio = input/output (max amount willing to put in per unit received), as decimal string
		const inputDecimal = Number(formatUnits(outputAmountGiven, outputDecimals));
		const outputDecimal = Number(formatUnits(inputAmountFilled, inputDecimals));
		const maximumIoRatio = outputDecimal > 0 ? String(inputDecimal / outputDecimal) : '0';

		// Amount user puts in (for summary)
		const requestedInputAmount = outputAmountGiven;

		const params = {
			inputToken,
			outputToken,
			outputAmount: outputAmountHuman,
			maximumIoRatio,
			taker,
			inputTokenDecimals: outputDecimals,
			inputTokenSymbol: (isBuy ? paymentToken : assetToken).symbol,
			inputTokenAddress: inputToken,
			outputTokenDecimals: inputDecimals,
			outputTokenSymbol: (isBuy ? assetToken : paymentToken).symbol,
			outputTokenAddress: outputToken,
			requestedInputAmount
		};

		await transactionStore.handleSwapCalldataApi(params);
		return { success: true };
	} catch (error) {
		console.error('Market order execution error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		};
	}
}

/**
 * Helper to filter quotes for a specific order side
 */
export function filterQuotesForSide(
	quotes: ProcessedQuote[],
	orderSide: 'Buy' | 'Sell',
	assetAddress: string,
	paymentAddress: string
): ProcessedQuote[] {
	const normalizedAsset = assetAddress.toLowerCase();
	const normalizedPayment = paymentAddress.toLowerCase();

	return quotes.filter((quote) => {
		const inputAddr = quote.inputTokenAddress?.toLowerCase();
		const outputAddr = quote.outputTokenAddress?.toLowerCase();
		const price = quote.quotePerAsset;

		if (orderSide === 'Buy') {
			// For Buy: we need ASK orders (seller offering asset for payment)
			return (
				inputAddr === normalizedPayment &&
				outputAddr === normalizedAsset &&
				quote.side === 'ask' &&
				price !== undefined &&
				Number.isFinite(price) &&
				price > 0
			);
		} else {
			// For Sell: we need BID orders (buyer offering payment for asset)
			return (
				inputAddr === normalizedAsset &&
				outputAddr === normalizedPayment &&
				quote.side === 'bid' &&
				price !== undefined &&
				Number.isFinite(price) &&
				price > 0
			);
		}
	});
}

/**
 * Sort quotes by price (best first)
 */
export function sortQuotesByPrice(
	quotes: ProcessedQuote[],
	orderSide: 'Buy' | 'Sell'
): ProcessedQuote[] {
	return [...quotes].sort((a, b) => {
		if (orderSide === 'Buy') {
			// For Buy: lowest price first (best ask)
			return (a.quotePerAsset ?? Infinity) - (b.quotePerAsset ?? Infinity);
		} else {
			// For Sell: highest price first (best bid)
			return (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0);
		}
	});
}
