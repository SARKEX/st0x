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
	price: number; // Human-readable price (quote token per asset token)
	quantityFilled: bigint; // Amount of asset filled (in asset decimals)
	cost: bigint; // Quote token cost (in payment decimals)
}

export interface WalkQuotesOptions {
	quotes: ProcessedQuote[];
	orderSide: MarketOrderSide;
	selectedAmount: bigint;
	assetDecimals: number;
	paymentDecimals: number; // Required for proper ratio calculation
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
}

export type TokenPriceSummary = {
	bid?: number;
	ask?: number;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
	const { quotes, orderSide, selectedAmount, assetDecimals, paymentDecimals } = options;

	// Determine which decimals apply to input/output based on order side
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

	// Work in asset decimals (no normalization to 18)
	const targetAmount = selectedAmount; // Already in asset decimals
	let quantityFilled = 0n; // Asset quantity in asset decimals
	let totalCost = 0n; // Payment cost in payment decimals
	const fills: QuoteFill[] = [];

	for (const quote of quotes) {
		if (quantityFilled >= targetAmount) break;

		const price = getQuotePrice(quote);
		if (!price || price <= 0) continue;

		const availableQuantity = computeAvailableQuantity(quote, orderSide, price, assetDecimals);
		if (availableQuantity <= 0n) continue;

		const remaining = targetAmount - quantityFilled;
		const quantityFromQuote = remaining < availableQuantity ? remaining : availableQuantity;
		if (quantityFromQuote <= 0n) continue;

		// Calculate cost in payment decimals: cost = quantity * price
		// quantityFromQuote is in asset decimals, price is human-readable (payment per asset)
		// Result should be in payment decimals
		const priceScaled = BigInt(Math.round(price * PRICE_SCALE_NUMBER));
		const costInAssetScale = (quantityFromQuote * priceScaled) / PRICE_SCALE;
		// Convert from asset scale to payment scale
		const costBigInt = scaleAmount(costInAssetScale, assetDecimals, paymentDecimals);
		if (costBigInt <= 0n) continue;

		quantityFilled += quantityFromQuote;
		totalCost += costBigInt;
		fills.push({ quote, price, quantityFilled: quantityFromQuote, cost: costBigInt });
	}

	// Determine input/output based on order side
	// For BUY: input = asset (received), output = payment (given)
	// For SELL: input = payment (received), output = asset (given)
	const inputAmountFilled = orderSide === 'Buy' ? quantityFilled : totalCost;
	const outputAmountGiven = orderSide === 'Buy' ? totalCost : quantityFilled;

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
