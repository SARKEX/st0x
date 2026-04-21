/**
 * Market Order Execution Service
 *
 * Shared logic for executing market orders, used by both MarketOrder.svelte and QuickTrade.svelte
 */

import {
	OrderV4_ABI,
	normalizeOrderData,
	type ProcessedQuote,
	walkOrderbook
} from '$lib/api/orders';
import { createRaindexClient } from '$lib/clients/raindex';
import type { Network } from '$lib/config/network';
import type { TakeOrdersParams, TokenInfo } from '$lib/types/transactions';
import {
	type OrderV4,
	type RaindexOrder,
	type RaindexOrderQuote,
	type SgOrder,
	type TakeOrderConfigV4,
	type TakeOrdersConfigV5,
	type TakeOrdersMode,
	type TakeOrdersRequest
} from '@rainlanguage/orderbook';
import { AbiCoder } from 'ethers';
import { formatUnits } from 'viem';
import { Float } from '@rainlanguage/float';
import { get } from 'svelte/store';
import transactionStore, { TransactionStatus } from '$lib/stores/transaction';
import { getSignerAddress } from '$lib/services/walletService';

// Safety bounds for market order execution
const EMERGENCY_RATIO_MULTIPLIER = '2'; // stricter cap for spend/sell modes
const BUY_EXACT_RATIO_MULTIPLIER = '1.01'; // tighter cap for buy-exact to avoid oversized approvals
const MINIMUM_IO = Float.fromBigint(0n).asHex();

/**
 * `getTakeOrdersCalldata` / oracle take helpers expect `priceCap` as a **human** decimal:
 * max sell (payment token) per 1 buy (asset token) for typical buy flows — i.e. the same units as
 * `quotePerAsset` from the orderbook walk (~USDC per wtIAU), not the on-chain IO `ratio` Float hex.
 */
function humanPriceCapStr(
	worstFillPrice: number,
	ratioMultiplier: string,
	fallbackEmergencyRatioHex: `0x${string}`
): string {
	const mult = Number(ratioMultiplier);
	if (Number.isFinite(worstFillPrice) && worstFillPrice > 0 && Number.isFinite(mult) && mult > 0) {
		return String(worstFillPrice * mult);
	}
	const emergencyFloat = Float.fromHex(fallbackEmergencyRatioHex);
	return String(emergencyFloat.value?.format().value ?? '1');
}

/**
 * Optional per-leg shave on buy asset amount sent to `getTakeCalldata` / `takeOrders`.
 * Temporary stabilizer for thin-book execution edge cases (Insufficient liquidity / MinimumIO).
 * This may underfill exact-size buys slightly.
 */
const BUY_FILL_EXECUTION_HAIRCUT_BPS = 30n;

function haircutBuyExecutionFill(amount: bigint): bigint {
	if (amount <= 0n) return 0n;
	const reduced = (amount * (10000n - BUY_FILL_EXECUTION_HAIRCUT_BPS)) / 10000n;
	return reduced > 0n ? reduced : amount;
}

/**
 * On-chain `maximumIORatio` caps the worst IO ratio the taker will accept. Using the Float domain
 * maximum avoids rejecting valid takes when an emergency "worst leg × multiplier" is too tight
 * (see https://github.com/SARKEX/st0x/pull/150). Trade size and economics stay bounded by
 * `maximumIO` and each maker order's ratio.
 */
function getMaximumIORatioHex(fallback: `0x${string}`): `0x${string}` {
	const r = Float.maxPositiveValue();
	if (!r.error && r.value) {
		return r.value.asHex() as `0x${string}`;
	}
	return fallback;
}

/**
 * Compute emergency ratio hex from a quote's worst fill ratio.
 * Returns the ratio as a hex string, or null if any Float operation fails.
 */
function computeEmergencyRatioHex(
	ratioHex: `0x${string}`,
	multiplierRaw: string = EMERGENCY_RATIO_MULTIPLIER
): `0x${string}` | null {
	const ratio = Float.fromHex(ratioHex);
	if (ratio.error || !ratio.value) return null;

	const multiplier = Float.parse(multiplierRaw);
	if (multiplier.error || !multiplier.value) return null;

	const emergency = ratio.value.mul(multiplier.value);
	if (emergency.error || !emergency.value) return null;

	return emergency.value.asHex();
}

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

interface OrderInfo {
	order: SgOrder;
	orderData: OrderV4;
	quotes: RaindexOrderQuote[];
	price: number;
	inputIOIndex: number;
	outputIOIndex: number;
	raindexOrder?: RaindexOrder;
}

/**
 * Execute a market order by walking the orderbook and taking available orders
 */
export async function executeMarketOrder(input: MarketOrderInput): Promise<MarketOrderResult> {
	const {
		orderSide,
		amount,
		inputMode = 'amount',
		assetToken,
		paymentToken,
		quotes,
		network,
		refreshQuotes
	} = input;

	try {
		// 1. Walk the orderbook to get fills (best-priced quotes first — required for correct splitting
		// across multiple maker orders: e.g. take all available at the thin 0x846f… leg, then the rest
		// from the deep 0x4bc4… leg).
		const orderedQuotes = sortQuotesByPrice(quotes, orderSide);
		const walkResult = walkOrderbook({
			quotes: orderedQuotes,
			orderSide,
			selectedAmount: amount,
			assetDecimals: assetToken.decimals,
			paymentDecimals: paymentToken.decimals,
			mode: inputMode === 'spend' ? 'spend' : 'receive'
		});

		if (!walkResult || walkResult.fills.length === 0) {
			return { success: false, error: 'No orders available to fill' };
		}

		// Emergency ratio from worst priced leg (used for aggregated SDK take + legacy paths)
		const worstFill = walkResult.fills[walkResult.fills.length - 1];
		if (!worstFill?.quote?.ratio) {
			return { success: false, error: 'Unable to calculate order price. Please try again.' };
		}
		const isBuy = orderSide === 'Buy';
		const ratioMultiplier =
			isBuy && inputMode !== 'spend' ? BUY_EXACT_RATIO_MULTIPLIER : EMERGENCY_RATIO_MULTIPLIER;
		const emergencyRatioHex = computeEmergencyRatioHex(
			worstFill.quote.ratio as `0x${string}`,
			ratioMultiplier
		);
		if (!emergencyRatioHex) {
			return { success: false, error: 'Unable to calculate order price. Please try again.' };
		}

		const priceCapStrForSdk = isBuy
			? humanPriceCapStr(worstFill.price, ratioMultiplier, emergencyRatioHex)
			: String(Float.fromHex(emergencyRatioHex).value?.format().value ?? '1e+18');

		const maximumIORatioHex = getMaximumIORatioHex(emergencyRatioHex);

		// 2. Build order info from fills
		const orderInfoMap = new Map<string, OrderInfo>();
		for (const fill of walkResult.fills) {
			const orderHash = fill.quote.orderHash;
			if (!orderInfoMap.has(orderHash)) {
				orderInfoMap.set(orderHash, {
					order: fill.quote.sgOrder as SgOrder,
					orderData: fill.quote.orderData as OrderV4,
					quotes: [],
					price: fill.price,
					inputIOIndex: fill.quote.inputIOIndex ?? 0,
					outputIOIndex: fill.quote.outputIOIndex ?? 0,
					raindexOrder: fill.quote.raindexOrder
				});
			}
		}

		// 3. Hydrate orders from Raindex to get full order data
		const client = await createRaindexClient();

		// 3a. Prefer RaindexClient.getTakeOrdersCalldata(): one tx, subgraph-driven route across
		// multiple maker orders (matches “split” across thin + deep liquidity).
		//
		// If this path is skipped or fails, fallbacks use RaindexOrder.getTakeCalldata() once per maker
		// order (see handleTakeOrders / handleOracleOrders). A failure preparing the *first* leg
		// (often the best-priced, thin order) aborts the whole flow even when a later order could cover
		// the remainder — hence aggressive quote freshness + conservative per-leg fill (haircut).
		const takerAddress = getSignerAddress();
		if (!takerAddress) {
			return { success: false, error: 'Wallet not connected. Please reconnect and try again.' };
		}
		const firstQuote = walkResult.fills[0].quote as ProcessedQuote;
		if (!firstQuote.orderData || !firstQuote.sgOrder) {
			return { success: false, error: 'Unable to prepare aggregated order route. Please refresh and retry.' };
		}
		let mode: TakeOrdersMode;
		let amountDecimals: number;
		if (orderSide === 'Sell') {
			mode = 'spendExact';
			amountDecimals = assetToken.decimals;
		} else if (inputMode === 'spend') {
			mode = 'spendExact';
			amountDecimals = paymentToken.decimals;
		} else {
			mode = 'buyExact';
			amountDecimals = assetToken.decimals;
		}
		const takeRequest: TakeOrdersRequest = {
			taker: takerAddress,
			chainId: network.id,
			sellToken: orderSide === 'Buy' ? paymentToken.address : assetToken.address,
			buyToken: orderSide === 'Buy' ? assetToken.address : paymentToken.address,
			mode,
			amount: formatUnits(amount, amountDecimals),
			priceCap: priceCapStrForSdk
		};
		// Opportunistically prefetch aggregated calldata while we build final params.
		void transactionStore.preloadAggregatedTakeOrdersCalldata(takeRequest);
		const { inputAmountFilled } = walkResult;
		const toTokenInfo = ({ address, decimals, symbol }: TokenInfo): TokenInfo => ({
			address,
			decimals,
			symbol
		});
		const aggregatedParams: TakeOrdersParams = {
			orderData: firstQuote.orderData as OrderV4,
			ioIndexes: { input: firstQuote.inputIOIndex ?? 0, output: firstQuote.outputIOIndex ?? 0 },
			takerWantsToken: toTokenInfo(isBuy ? assetToken : paymentToken),
			takerPaysToken: toTokenInfo(isBuy ? paymentToken : assetToken),
			requestedTakerWantsAmount: isBuy && inputMode !== 'spend' ? amount : inputAmountFilled,
			simulation: walkResult
		};
		const aggregatedHandled = await transactionStore.handleAggregatedTakeOrdersCalldata(
			takeRequest,
			firstQuote.sgOrder as SgOrder,
			aggregatedParams,
			isBuy ? paymentToken.symbol : assetToken.symbol
		);
		if (!aggregatedHandled) {
			return {
				success: false,
				error: 'Unable to prepare aggregated order transaction. Please refresh quotes and retry.'
			};
		}
		const { status, error: txError } = get(transactionStore);
		if (status === TransactionStatus.SUCCESS) {
			return { success: true };
		}
		if (status === TransactionStatus.ERROR) {
			return {
				success: false,
				error: txError || 'Order failed'
			};
		}
		return {
			success: false,
			error: 'Order did not complete. Please try again.'
		};
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
	const debugHashes = new Set([
		'0x560f94e25b5f7023862e8ba37a928c91e675de082c1fff41ea68f6da3d9ca2e8',
		'0x3848e87a452747f3ab43158cfa706d449326c5024c28e6ce00818438a8519e4e'
	]);

	return quotes.filter((quote) => {
		const inputAddr = quote.inputTokenAddress?.toLowerCase();
		const outputAddr = quote.outputTokenAddress?.toLowerCase();
		const price = quote.quotePerAsset;
		const orderHashLc = quote.orderHash?.toLowerCase();
		const isDebug = !!orderHashLc && debugHashes.has(orderHashLc);
		if (isDebug) {
			console.log('[orders-debug] filterQuotesForSide incoming', {
				orderHash: quote.orderHash,
				orderSide,
				inputAddr,
				outputAddr,
				normalizedAsset,
				normalizedPayment,
				side: quote.side,
				price
			});
		}

		if (orderSide === 'Buy') {
			// For Buy: we need ASK orders (seller offering asset for payment)
			const include =
				inputAddr === normalizedPayment &&
				outputAddr === normalizedAsset &&
				quote.side === 'ask' &&
				price !== undefined &&
				Number.isFinite(price) &&
				price > 0;
			if (isDebug) {
				console.log('[orders-debug] filterQuotesForSide buy decision', {
					orderHash: quote.orderHash,
					include
				});
			}
			return include;
		} else {
			// For Sell: we need BID orders (buyer offering payment for asset)
			const include =
				inputAddr === normalizedAsset &&
				outputAddr === normalizedPayment &&
				quote.side === 'bid' &&
				price !== undefined &&
				Number.isFinite(price) &&
				price > 0;
			if (isDebug) {
				console.log('[orders-debug] filterQuotesForSide sell decision', {
					orderHash: quote.orderHash,
					include
				});
			}
			return include;
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
