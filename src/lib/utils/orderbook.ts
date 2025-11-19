/**
 * Orderbook Operations & Price Calculations
 *
 * Pure algorithms for:
 * - Market order execution simulation (walking the orderbook)
 * - Price calculation and token pair analysis
 * - Quote processing and data normalization
 */

import type { OrderV4, SgOrder } from '@rainlanguage/orderbook';
import { normalizeAddress, type MarketSide } from '$lib/utils/tokenMath';
import { Float } from '@rainlanguage/float';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

export type MarketOrderSide = 'Buy' | 'Sell';

export const FIXED_POINT_SCALE = 10n ** 18n;
const PRICE_SCALE = 10n ** 9n; // preserves 9 decimal places for prices
const PRICE_SCALE_NUMBER = Number(PRICE_SCALE);

export interface QuoteFill {
	quote: ProcessedQuote;
	price: number; // Human-readable price (quote token per asset token)
	quantityFilled: bigint; // Amount of asset filled (scaled to 1e18)
	cost: bigint; // Quote token cost scaled to 1e18
}

export interface WalkQuotesOptions {
	quotes: ProcessedQuote[];
	orderSide: MarketOrderSide;
	selectedAmount: bigint;
	assetDecimals?: number;
}

export interface WalkQuotesResult {
	quantityFilled: bigint;
	weightedAveragePrice: number; // Human-readable weighted average price (quote per asset)
	fills: QuoteFill[];
	totalCostScaled: bigint; // Total quote tokens (1e18 scale)
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
	assetPerQuote?: number;
}

export type TokenPriceSummary = {
	bid?: number;
	ask?: number;
	bidAssetPerQuote?: number;
	askAssetPerQuote?: number;
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
	price: number
): bigint {
	// Convert hex-encoded Float to bigint scaled amount
	let maxOutputBigInt: bigint | null = null;
	if (typeof quote.maxOutput === 'string' && quote.maxOutput.startsWith('0x')) {
		try {
			const floatResult = Float.fromHex(quote.maxOutput as `0x${string}`);
			if (!floatResult.error && floatResult.value) {
				const outputDecimals = quote.outputTokenDecimals ?? 18;
				const decimalResult = floatResult.value.toFixedDecimalLossy(outputDecimals);
				if (!decimalResult.error && decimalResult.value) {
					maxOutputBigInt = BigInt(decimalResult.value.value);
				}
			}
		} catch (error) {
			console.warn('Failed to convert maxOutput Float:', error);
		}
	} else if (typeof quote.maxOutput === 'bigint') {
		maxOutputBigInt = quote.maxOutput;
	}

	if (maxOutputBigInt === null) return 0n;

	const outputDecimals = quote.outputTokenDecimals ?? 18;
	const maxOutputScaled = scaleAmount(maxOutputBigInt, outputDecimals, 18);
	if (maxOutputScaled <= 0n) return 0n;

	if (orderSide === 'Buy') {
		// Order outputs the asset directly; availability is the scaled maxOutput
		return maxOutputScaled;
	}

	// Sell: order outputs quote token. Convert quote token availability into asset availability
	if (price <= 0) return 0n;
	// maxOutputScaled is in 1e18 scale, price is human-readable
	// Scale price to 1e18 to maintain precision when dividing: (quoteAmount / price)
	const scaledPrice = BigInt(Math.round(price * 1e18));
	if (scaledPrice <= 0n) return 0n;
	// Multiply numerator before dividing so the result stays in 1e18 asset scale
	return (maxOutputScaled * FIXED_POINT_SCALE) / scaledPrice;
}

export function walkOrderbook(options: WalkQuotesOptions): WalkQuotesResult {
	const { quotes, orderSide, selectedAmount } = options;
	const assetDecimals = options.assetDecimals ?? 18;
	if (selectedAmount <= 0n || !quotes.length) {
		return { quantityFilled: 0n, weightedAveragePrice: 0, fills: [], totalCostScaled: 0n };
	}

	const targetAmount = scaleAmount(selectedAmount, assetDecimals, 18);
	let quantityFilled = 0n;
	let totalCostScaled = 0n; // Quote tokens scaled to 1e18
	const fills: QuoteFill[] = [];

	for (const quote of quotes) {
		if (quantityFilled >= targetAmount) break;

		const price = getQuotePrice(quote);
		if (!price || price <= 0) continue;

		const availableQuantity = computeAvailableQuantity(quote, orderSide, price);
		if (availableQuantity <= 0n) continue;

		const remaining = targetAmount - quantityFilled;
		const quantityFromQuote = remaining < availableQuantity ? remaining : availableQuantity;
		if (quantityFromQuote <= 0n) continue;

		const priceScaled = BigInt(Math.round(price * PRICE_SCALE_NUMBER));
		const costBigInt = (quantityFromQuote * priceScaled) / PRICE_SCALE;
		if (costBigInt <= 0n) continue;

		quantityFilled += quantityFromQuote;
		totalCostScaled += costBigInt;
		fills.push({ quote, price, quantityFilled: quantityFromQuote, cost: costBigInt });
	}

	const weightedAveragePrice =
		quantityFilled > 0n ? Number(totalCostScaled) / Number(quantityFilled) : 0;

	return { quantityFilled, weightedAveragePrice, fills, totalCostScaled };
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
	describeQuoteFn: (quote: ProcessedQuote, quoteAddress: string) => {
		assetAddress: string;
		side: MarketSide;
		quotePerAsset: number | null;
		assetPerQuote: number | null;
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
						quotePerAsset: quote.quotePerAsset,
						assetPerQuote: quote.assetPerQuote
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
			if (
				Number.isFinite(metrics.assetPerQuote) &&
				metrics.assetPerQuote &&
				metrics.assetPerQuote > 0
			) {
				existing.askAssetPerQuote = chooseBestPrice(
					existing.askAssetPerQuote,
					metrics.assetPerQuote,
					'max'
				);
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
			if (
				Number.isFinite(metrics.assetPerQuote) &&
				metrics.assetPerQuote &&
				metrics.assetPerQuote > 0
			) {
				existing.bidAssetPerQuote = chooseBestPrice(
					existing.bidAssetPerQuote,
					metrics.assetPerQuote,
					'min'
				);
			}
		}

		priceMap.set(assetAddress, existing);
	});

	return priceMap;
};
