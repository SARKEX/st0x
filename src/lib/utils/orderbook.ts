/**
 * Orderbook Operations & Price Calculations
 *
 * Pure algorithms for:
 * - Market order execution simulation (walking the orderbook)
 * - Price calculation and token pair analysis
 * - Quote processing and data normalization
 */

import type { OrderV4, SgOrder } from '@rainlanguage/orderbook';
import { normalizeAddress, type MarketSide, parseFloatHex } from '$lib/utils/tokenMath';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export type MarketOrderSide = 'Buy' | 'Sell';

const PRICE_SCALE = 10n ** 9n; // preserves 9 decimal places for prices
const PRICE_SCALE_NUMBER = Number(PRICE_SCALE);

export interface QuoteFill {
	quote: ProcessedQuote;
	price: number; // Human-readable price (payment per asset)
	assetAmount: bigint; // Asset tokens traded in this fill (in asset decimals)
	paymentAmount: bigint; // Payment tokens traded in this fill (in payment decimals)
}

export interface WalkQuotesOptions {
	quotes: ProcessedQuote[];
	orderSide: MarketOrderSide;
	selectedAmount: bigint;
	assetDecimals: number;
	paymentDecimals: number;
	/**
	 * Target mode - what does selectedAmount represent?
	 *
	 * 'receive' (default): selectedAmount is what you want to RECEIVE
	 *   - BUY + receive: "I want to receive 20 tSTOX" → walk until 20 asset received
	 *
	 * 'spend': selectedAmount is what you want to SPEND (give away)
	 *   - SELL + spend: "I want to sell 100 tSTOX" → walk until 100 asset given
	 *   - BUY + spend: "I want to spend $500 USDC" → walk until $500 payment given
	 *
	 * Note: SELL is inherently a "spend" operation (you give away asset).
	 * The 'receive' mode only makes sense for BUY orders.
	 */
	mode?: 'receive' | 'spend';
}

/**
 * Result from walking the orderbook.
 *
 * Amounts are returned in native token decimals. Use the provided decimal info
 * to interpret the amounts correctly.
 */
export interface WalkQuotesResult {
	inputAmountFilled: bigint; // What the user RECEIVES (in native decimals)
	outputAmountGiven: bigint; // What the user GIVES AWAY (in native decimals)
	inputDecimals: number; // Decimal scale of inputAmountFilled
	outputDecimals: number; // Decimal scale of outputAmountGiven
	ioRatio: number; // input per output (normalized to token scale: (input/10^inputDecimals) / (output/10^outputDecimals))
	fills: QuoteFill[];
}

// ABI types for decoding order bytes
const IOV2 = '(address token, bytes32 vaultId)';
const EvaluableV4 = '(address interpreter, address store, bytes bytecode)';
export const OrderV4_ABI = `(address owner, ${EvaluableV4} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;

// Types for processed quotes
export interface ProcessedQuote {
	orderHash: string;
	maxOutput: string; // Hex-encoded Float (64 hex chars + 0x prefix)
	ratio: string; // Hex-encoded Float (64 hex chars + 0x prefix)
	inputTokenSymbol: string;
	outputTokenSymbol: string;
	inputTokenAddress: string;
	outputTokenAddress: string;
	inputIOIndex: number;
	outputIOIndex: number;
	inputVaultId?: string;
	outputVaultId?: string;
	orderData?: OrderV4;
	sgOrder?: SgOrder;
	orderbookId?: string;
	inputTokenDecimals?: number;
	outputTokenDecimals?: number;
	assetAddress?: string;
	side?: MarketSide;
	quotePerAsset?: number;
	rainlang?: string; // Decoded Rainlang source for the order
	orderType?: OrderType; // Classified order type based on rainlang
}

export type OrderType = 'limit' | 'dca' | 'dynamic-spread' | 'custom';

export type TokenPriceSummary = {
	bid?: number;
	ask?: number;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Classify an order type based on its rainlang source.
 * Returns null for orders that should be hidden (e.g., dynamic spread).
 */
export function classifyOrderType(rainlang: string | undefined): OrderType | null {
	if (!rainlang) {
		return 'custom';
	}

	// Dynamic Spread - contains "other-vwaio" - should be hidden from order tab
	if (rainlang.includes('other-vwaio')) {
		return null; // Return null to indicate this should be filtered out
	}

	// Extract the handle-io section content
	const handleIoMatch = rainlang.match(
		/\/\*\s*1\.\s*handle-io\s*\*\/\s*([\s\S]*?)(?:\/\*\s*2\.|$)/
	);
	const handleIoContent = handleIoMatch?.[1]?.trim() ?? '';

	// DCA detection - multiple patterns
	// 1. handle-io section contains "min-amount:" (common DCA pattern)
	// 2. Contains DCA-specific functions like linear-growth, halflife, amount-epochs
	const isDca =
		handleIoContent.includes('min-amount:') ||
		rainlang.includes('linear-growth') ||
		rainlang.includes('amount-epochs') ||
		rainlang.includes('halflife');

	if (isDca) {
		return 'dca';
	}

	// Limit Order - handle-io section is empty (just ":;" or similar)
	if (handleIoContent === ':;' || handleIoContent === ':') {
		return 'limit';
	}

	// Everything else is custom
	return 'custom';
}

export function scaleAmount(
	amount: bigint,
	fromDecimals?: number,
	toDecimals: number = 18
): bigint {
	if (!amount) return 0n;
	const from = BigInt(fromDecimals ?? toDecimals);
	const to = BigInt(toDecimals);
	if (from === to) return amount;
	if (from < to) {
		const factor = 10n ** (to - from);
		return amount * factor;
	}
	const divisor = 10n ** (from - to);
	if (divisor === 0n) return amount;
	return amount / divisor;
}

export function hexToBigInt(hex: string): bigint {
	if (hex.startsWith('0x')) {
		return BigInt(hex);
	}
	return BigInt(`0x${hex}`);
}

export const normalizeOrderData = (orderData: OrderV4): OrderV4 => ({
	owner: orderData.owner,
	evaluable: {
		interpreter: orderData.evaluable.interpreter,
		store: orderData.evaluable.store,
		bytecode: orderData.evaluable.bytecode
	},
	validInputs: orderData.validInputs.map((input) => ({
		token: input.token,
		vaultId: input.vaultId?.toString?.() ?? input.vaultId
	})),
	validOutputs: orderData.validOutputs.map((output) => ({
		token: output.token,
		vaultId: output.vaultId?.toString?.() ?? output.vaultId
	})),
	nonce: orderData.nonce
});

// ============================================================================
// ORDERBOOK WALKING ALGORITHM
// ============================================================================

function getQuotePrice(quote: ProcessedQuote): number | null {
	if (!Number.isFinite(quote.quotePerAsset) || (quote.quotePerAsset ?? 0) <= 0) {
		return null;
	}
	return quote.quotePerAsset as number;
}

function computeAvailableQuantity(
	quote: ProcessedQuote,
	orderSide: MarketOrderSide,
	price: number,
	assetDecimals: number
): bigint {
	// Convert hex-encoded Float to bigint scaled amount
	let maxOutputBigInt: bigint;
	if (typeof quote.maxOutput === 'string' && quote.maxOutput.startsWith('0x')) {
		const outputDecimals = quote.outputTokenDecimals ?? 18;
		maxOutputBigInt = parseFloatHex(quote.maxOutput, outputDecimals);
	} else if (typeof quote.maxOutput === 'bigint') {
		maxOutputBigInt = quote.maxOutput;
	} else {
		return 0n;
	}

	if (maxOutputBigInt === 0n) return 0n;

	// Fallback to 18 decimals if not provided (common for ERC20 tokens)
	// TODO: Consider skipping quotes without decimals or fetching from token contract
	const outputDecimals = quote.outputTokenDecimals ?? 18;
	if (maxOutputBigInt <= 0n) return 0n;

	if (orderSide === 'Buy') {
		// Buy: Order outputs the asset directly
		// maxOutputBigInt is in output decimals (asset decimals for Buy)
		// Scale from output decimals to asset decimals (should be same for Buy, but ensure consistency)
		return scaleAmount(maxOutputBigInt, outputDecimals, assetDecimals);
	}

	// Sell: Order outputs payment token. Convert payment token availability into asset availability
	// using price (payment per asset)
	if (price <= 0) return 0n;

	// Calculate: assetAvailable = paymentAvailable / price
	// Use PRICE_SCALE for precision in the division
	const priceScaled = BigInt(Math.round(price * PRICE_SCALE_NUMBER));
	if (priceScaled <= 0n) return 0n;

	// (maxOutput in payment decimals * PRICE_SCALE) / priceScaled gives us amount in payment decimals
	// Then convert from payment decimals to asset decimals
	const assetAmountInPaymentScale = (maxOutputBigInt * PRICE_SCALE) / priceScaled;
	return scaleAmount(assetAmountInPaymentScale, outputDecimals, assetDecimals);
}

/**
 * Walks the orderbook to simulate market order execution.
 *
 * Iterates through quotes in price order, filling the requested amount across multiple orders.
 * Works in native token decimals - no arbitrary normalization.
 *
 * @param options - Configuration including quotes, order side, amount, and decimals
 * @returns Result with fill details in native token decimals, plus decimal info and normalized ioRatio
 *
 * @remarks
 * **Token Scale Normalization**: ioRatio is calculated as (input/10^inputDecimals) / (output/10^outputDecimals)
 * to provide a meaningful ratio despite different decimal scales.
 */
export function walkOrderbook(options: WalkQuotesOptions): WalkQuotesResult {
	const { quotes, orderSide, selectedAmount, assetDecimals, paymentDecimals, mode = 'receive' } = options;

	// Determine which decimals apply to input/output based on order side
	// BUY: input (receive) = asset, output (give) = payment
	// SELL: input (receive) = payment, output (give) = asset
	const inputDecimals = orderSide === 'Buy' ? assetDecimals : paymentDecimals;
	const outputDecimals = orderSide === 'Buy' ? paymentDecimals : assetDecimals;

	if (selectedAmount <= 0n || !quotes.length) {
		return {
			inputAmountFilled: 0n,
			outputAmountGiven: 0n,
			inputDecimals,
			outputDecimals,
			ioRatio: 0,
			fills: []
		};
	}

	// Determine what we're targeting based on mode and order side
	//
	// 'receive' mode: selectedAmount is what you want to RECEIVE
	//   - BUY: receive asset → target asset input
	//
	// 'spend' mode: selectedAmount is what you want to SPEND (give away)
	//   - SELL: spend asset → target asset output
	//   - BUY: spend payment → target payment output
	//
	// Note: SELL is inherently spending asset, so SELL always targets asset.
	// The mode distinction only matters for BUY (receive asset vs spend payment).

	// Determine target mode and amount
	// 'asset' mode: targeting asset amount (BUY receive or SELL spend)
	// 'payment' mode: targeting payment amount (BUY spend)
	const targetMode: 'asset' | 'payment' =
		orderSide === 'Sell' || mode !== 'spend' ? 'asset' : 'payment';
	const targetAmount = selectedAmount;

	// Accumulators - always track asset and payment traded
	let assetAccumulated = 0n; // Total asset tokens traded (in asset decimals)
	let paymentAccumulated = 0n; // Total payment tokens traded (in payment decimals)
	const fills: QuoteFill[] = [];

	for (const quote of quotes) {
		// Check if we've reached our target
		if (targetMode === 'asset' && assetAccumulated >= targetAmount) break;
		if (targetMode === 'payment' && paymentAccumulated >= targetAmount) break;

		const price = getQuotePrice(quote);
		if (!price || price <= 0) continue;

		// How much asset this quote can provide (BUY) or absorb (SELL)
		const availableAsset = computeAvailableQuantity(quote, orderSide, price, assetDecimals);
		if (availableAsset <= 0n) continue;

		let assetFromQuote: bigint;

		if (targetMode === 'asset') {
			// Targeting asset (receive for BUY, spend for SELL): limit by remaining asset needed
			const remainingAsset = targetAmount - assetAccumulated;
			assetFromQuote = remainingAsset < availableAsset ? remainingAsset : availableAsset;
		} else {
			// Targeting payment to spend (BUY + spend mode): calculate asset for remaining budget
			const remainingPaymentBudget = targetAmount - paymentAccumulated;
			if (remainingPaymentBudget <= 0n) break;

			// Calculate max asset for remaining budget: asset = budget / price
			const priceScaled = BigInt(Math.round(price * PRICE_SCALE_NUMBER));
			if (priceScaled <= 0n) continue;

			const budgetInAssetScale = scaleAmount(remainingPaymentBudget, paymentDecimals, assetDecimals);
			const maxAssetForBudget = (budgetInAssetScale * PRICE_SCALE) / priceScaled;

			assetFromQuote = maxAssetForBudget < availableAsset ? maxAssetForBudget : availableAsset;
		}

		if (assetFromQuote <= 0n) continue;

		// Calculate payment for this asset amount: payment = asset × price
		const priceScaled = BigInt(Math.round(price * PRICE_SCALE_NUMBER));
		const paymentInAssetScale = (assetFromQuote * priceScaled) / PRICE_SCALE;
		const paymentFromQuote = scaleAmount(paymentInAssetScale, assetDecimals, paymentDecimals);
		if (paymentFromQuote <= 0n) continue;

		// In payment-spend mode, ensure we don't exceed the payment budget
		if (targetMode === 'payment') {
			const newPaymentTotal = paymentAccumulated + paymentFromQuote;
			if (newPaymentTotal > targetAmount) {
				// Adjust to exactly hit the budget
				const adjustedPayment = targetAmount - paymentAccumulated;
				// Recalculate asset for adjusted payment
				const adjustedPaymentInAssetScale = scaleAmount(adjustedPayment, paymentDecimals, assetDecimals);
				const adjustedAsset = (adjustedPaymentInAssetScale * PRICE_SCALE) / priceScaled;
				if (adjustedAsset > 0n) {
					assetAccumulated += adjustedAsset;
					paymentAccumulated = targetAmount;
					fills.push({ quote, price, assetAmount: adjustedAsset, paymentAmount: adjustedPayment });
				}
				break;
			}
		}

		assetAccumulated += assetFromQuote;
		paymentAccumulated += paymentFromQuote;
		fills.push({ quote, price, assetAmount: assetFromQuote, paymentAmount: paymentFromQuote });
	}

	// Map to user perspective (input = received, output = given away)
	// BUY: user receives asset, gives payment
	// SELL: user receives payment, gives asset
	const inputAmountFilled = orderSide === 'Buy' ? assetAccumulated : paymentAccumulated;
	const outputAmountGiven = orderSide === 'Buy' ? paymentAccumulated : assetAccumulated;

	// Normalize to token scale: (input/10^inputDecimals) / (output/10^outputDecimals)
	const ioRatio =
		outputAmountGiven > 0n
			? Number(inputAmountFilled) /
				10 ** inputDecimals /
				(Number(outputAmountGiven) / 10 ** outputDecimals)
			: 0;

	return {
		inputAmountFilled,
		outputAmountGiven,
		inputDecimals,
		outputDecimals,
		ioRatio,
		fills
	};
}

// ============================================================================
// PRICE AGGREGATION
// ============================================================================

const chooseBestPrice = (
	current: number | undefined,
	candidate: number,
	comparator: 'min' | 'max'
) => {
	if (!Number.isFinite(candidate) || candidate <= 0) {
		return current;
	}
	if (current === undefined) {
		return candidate;
	}
	return comparator === 'min' ? Math.min(current, candidate) : Math.max(current, candidate);
};

export const buildTokenPriceMap = (
	quotes: ProcessedQuote[],
	quoteAddressRaw: string,
	describeQuoteFn: (
		quote: ProcessedQuote,
		quoteAddress: string
	) => {
		assetAddress: string;
		side: MarketSide;
		quotePerAsset: number | null;
	} | null
): Map<string, TokenPriceSummary> => {
	const priceMap = new Map<string, TokenPriceSummary>();
	const quoteAddress = normalizeAddress(quoteAddressRaw);

	quotes.forEach((quote) => {
		const metrics =
			quote.side && quote.assetAddress
				? {
						assetAddress: quote.assetAddress,
						side: quote.side,
						quotePerAsset: quote.quotePerAsset
					}
				: describeQuoteFn(quote, quoteAddressRaw);
		if (!metrics) return;

		const assetAddress = normalizeAddress(metrics.assetAddress);
		if (!assetAddress || assetAddress === quoteAddress) return;

		const existing = priceMap.get(assetAddress) ?? {};

		if (metrics.side === 'ask') {
			// Ask side = asks (what sellers are offering)
			if (
				Number.isFinite(metrics.quotePerAsset) &&
				metrics.quotePerAsset &&
				metrics.quotePerAsset > 0
			) {
				existing.ask = chooseBestPrice(existing.ask, metrics.quotePerAsset, 'min');
			}
		} else {
			// Bid side = bids (what buyers are offering)
			if (
				Number.isFinite(metrics.quotePerAsset) &&
				metrics.quotePerAsset &&
				metrics.quotePerAsset > 0
			) {
				existing.bid = chooseBestPrice(existing.bid, metrics.quotePerAsset, 'max');
			}
		}

		priceMap.set(assetAddress, existing);
	});

	return priceMap;
};
