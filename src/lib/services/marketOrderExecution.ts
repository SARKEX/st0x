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
	if (Number.isFinite(worstFillPrice) && worstFillPrice > 0) {
		const price = Float.parse(String(worstFillPrice));
		const multiplier = Float.parse(ratioMultiplier);
		if (!price.error && price.value && !multiplier.error && multiplier.value) {
			const capped = price.value.mul(multiplier.value);
			if (!capped.error && capped.value) {
				return String(capped.value.format().value ?? '1');
			}
		}
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

function getQuoteMakerAddress(quote: ProcessedQuote): string | null {
	const ownerFromOrderData = quote.orderData?.owner;
	if (typeof ownerFromOrderData === 'string' && ownerFromOrderData.length > 0) {
		return ownerFromOrderData;
	}
	const ownerFromSgOrder = (quote.sgOrder as { owner?: unknown } | undefined)?.owner;
	if (typeof ownerFromSgOrder === 'string' && ownerFromSgOrder.length > 0) {
		return ownerFromSgOrder;
	}
	return null;
}

export function excludeTakerOwnedQuotes(quotes: ProcessedQuote[], takerAddress: string): ProcessedQuote[] {
	const normalizedTaker = takerAddress.toLowerCase();
	return quotes.filter((quote) => {
		const maker = getQuoteMakerAddress(quote);
		return !maker || maker.toLowerCase() !== normalizedTaker;
	});
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
		const takerAddress = getSignerAddress();
		if (!takerAddress) {
			return { success: false, error: 'Wallet not connected. Please reconnect and try again.' };
		}
		const externalQuotes = excludeTakerOwnedQuotes(quotes, takerAddress);
		if (externalQuotes.length === 0) {
			return { success: false, error: 'No external orders available to fill' };
		}
		// 1. Walk the orderbook to get fills (best-priced quotes first — required for correct splitting
		// across multiple maker orders: e.g. take all available at the thin 0x846f… leg, then the rest
		// from the deep 0x4bc4… leg).
		const orderedQuotes = sortQuotesByPrice(externalQuotes, orderSide);
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

		// 2. Build order info for fallback execution.
		// Include ordered quote candidates (not only initially-filled legs) so
		// per-order flow can reroute to the next maker if the first leg becomes non-executable.
		const orderInfoMap = new Map<string, OrderInfo>();
		const fillAmountByOrderHash = new Map<string, bigint>();
		for (const quote of orderedQuotes) {
			const orderHash = quote.orderHash;
			if (!orderHash || orderInfoMap.has(orderHash)) continue;
			if (!quote.orderData || !quote.sgOrder || !quote.raindexOrder) continue;

			orderInfoMap.set(orderHash, {
				order: quote.sgOrder as SgOrder,
				orderData: quote.orderData as OrderV4,
				quotes: quote.signedContext ? [{ signedContext: quote.signedContext } as RaindexOrderQuote] : [],
				price: quote.quotePerAsset ?? 0,
				inputIOIndex: quote.inputIOIndex ?? 0,
				outputIOIndex: quote.outputIOIndex ?? 0,
				raindexOrder: quote.raindexOrder
			});
		}
		for (const fill of walkResult.fills) {
			const orderHash = fill.quote.orderHash;
			if (!orderInfoMap.has(orderHash)) {
				orderInfoMap.set(orderHash, {
					order: fill.quote.sgOrder as SgOrder,
					orderData: fill.quote.orderData as OrderV4,
					quotes: fill.quote.signedContext ? [{ signedContext: fill.quote.signedContext } as RaindexOrderQuote] : [],
					price: fill.price,
					inputIOIndex: fill.quote.inputIOIndex ?? 0,
					outputIOIndex: fill.quote.outputIOIndex ?? 0,
					raindexOrder: fill.quote.raindexOrder
				});
			}
			const fillContribution =
				orderSide === 'Buy' && inputMode === 'spend' ? fill.paymentAmount : fill.assetAmount;
			fillAmountByOrderHash.set(
				orderHash,
				(fillAmountByOrderHash.get(orderHash) ?? 0n) + fillContribution
			);
		}

		// 3. Ensure we have hydrated Raindex order objects for per-order fallback execution.
		// createRaindexClient() remains intentionally called here to keep SDK initialization warm.
		await createRaindexClient();

		// 3a. Prefer RaindexClient.getTakeOrdersCalldata(): one tx, subgraph-driven route across
		// multiple maker orders (matches “split” across thin + deep liquidity).
		//
		// If this path is skipped or fails, fallbacks use RaindexOrder.getTakeCalldata() once per maker
		// order (see handleTakeOrders / handleOracleOrders). A failure preparing the *first* leg
		// (often the best-priced, thin order) aborts the whole flow even when a later order could cover
		// the remainder — hence aggressive quote freshness + conservative per-leg fill (haircut).
		const firstQuote = walkResult.fills[0].quote as ProcessedQuote;
		if (!firstQuote.orderData || !firstQuote.sgOrder) {
			return { success: false, error: 'Unable to prepare aggregated order route. Please refresh and retry.' };
		}
		// Use *UpTo modes instead of *Exact to tolerate tiny Float precision gaps
		// where the SDK's internal quote discovery computes available liquidity as
		// e.g. 0.999...999 instead of exactly 1. *UpTo fills as much as available
		// up to the requested amount, avoiding spurious "Insufficient liquidity" errors.
		let mode: TakeOrdersMode;
		let amountDecimals: number;
		if (orderSide === 'Sell') {
			mode = 'spendUpTo';
			amountDecimals = assetToken.decimals;
		} else if (inputMode === 'spend') {
			mode = 'spendUpTo';
			amountDecimals = paymentToken.decimals;
		} else {
			mode = 'buyUpTo';
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
		console.log('[executeMarketOrder] TakeOrdersRequest', {
			mode: takeRequest.mode,
			amount: takeRequest.amount,
			priceCap: takeRequest.priceCap,
			sellToken: takeRequest.sellToken,
			buyToken: takeRequest.buyToken,
			orderSide,
			inputMode,
			fillCount: walkResult.fills.length,
			walkOutputGiven: walkResult.outputAmountGiven?.toString(),
			walkInputFilled: walkResult.inputAmountFilled?.toString()
		});
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
			console.log('[executeMarketOrder] Aggregated path unavailable; falling back to per-order execution');
			const orderEntries = Array.from(orderInfoMap.values());
			const ordersConfig: TakeOrderConfigV4[] = [];
			const raindexOrders: RaindexOrder[] = [];
			const orderFillAmounts: bigint[] = [];

			for (const orderInfo of orderEntries) {
				if (!orderInfo.raindexOrder) {
					return {
						success: false,
						error: 'Unable to hydrate maker order route. Please refresh quotes and retry.'
					};
				}

				ordersConfig.push({
					order: orderInfo.orderData,
					inputIOIndex: String(orderInfo.inputIOIndex),
					outputIOIndex: String(orderInfo.outputIOIndex),
					signedContext: []
				});
				raindexOrders.push(orderInfo.raindexOrder);
				orderFillAmounts.push(fillAmountByOrderHash.get(orderInfo.order.orderHash) ?? 0n);
			}

			const maximumIO = Float.fromFixedDecimalLossy(amount, amountDecimals);
			const fallbackConfig: TakeOrdersConfigV5 = {
				minimumIO: MINIMUM_IO,
				maximumIO: maximumIO.float.asHex(),
				maximumIORatio: maximumIORatioHex,
				IOIsInput: (mode === 'buyUpTo') as unknown as string,
				orders: ordersConfig,
				data: '0x'
			};
			const fallbackParams: TakeOrdersParams = {
				...aggregatedParams,
				orderFillAmounts,
				orderFillDecimals:
					mode === 'buyUpTo' ? aggregatedParams.takerWantsToken.decimals : aggregatedParams.takerPaysToken.decimals
			};
			const requiredApprovalAmount = walkResult.outputAmountGiven;
			await transactionStore.handleTakeOrders(
				fallbackConfig,
				firstQuote.sgOrder as SgOrder,
				requiredApprovalAmount,
				fallbackParams,
				undefined,
				raindexOrders
			);
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
