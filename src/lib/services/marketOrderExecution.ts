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
	type SgOrder,
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
	/** User-configurable slippage in basis points (100 = 1%). */
	slippageBps?: number;

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
		slippageBps = DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
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
		const effectiveSlippageBps = clampSlippageBps(slippageBps);
		const ratioMultiplier = isBuy
			? String(1 + effectiveSlippageBps / 10_000)
			: EMERGENCY_RATIO_MULTIPLIER;
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

		// Hydrate orderData/sgOrder for quotes sourced from the REST API (which only
		// returns summaries). We need the full on-chain OrderV4 struct for take-order calldata.
		const quotesToHydrate = walkResult.fills
			.map((f) => f.quote as ProcessedQuote)
			.filter((q) => !q.orderData || !q.sgOrder?.orderBytes);
		if (quotesToHydrate.length > 0) {
			const client = await createRaindexClient();
			const uniqueHashes = [...new Set(quotesToHydrate.map((q) => q.orderHash))];
			for (const hash of uniqueHashes) {
				try {
					const ordersResult = await client.getOrders(
						[network.id],
						{ orderHash: hash as `0x${string}`, owners: [] },
						1
					);
					if (ordersResult.error || !ordersResult.value?.orders.length) continue;
					const raindexOrder = ordersResult.value.orders[0];
					const sgResult = raindexOrder.convertToSgOrder();
					if (sgResult.error || !sgResult.value) continue;
					const sgOrder = sgResult.value;
					const decoded = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], sgOrder.orderBytes);
					const orderData = normalizeOrderData(decoded[0] as OrderV4);
					for (const fill of walkResult.fills) {
						if (fill.quote.orderHash === hash) {
							fill.quote.sgOrder = sgOrder;
							fill.quote.orderData = orderData;
							fill.quote.raindexOrder = raindexOrder as unknown as RaindexOrder;
						}
					}
				} catch (e) {
					console.warn(`[executeMarketOrder] Failed to hydrate order ${hash}:`, e);
				}
			}
		}

		// Build aggregated take via RaindexClient.getTakeOrdersCalldata(): one tx, subgraph-driven
		// route across multiple maker orders (handles split across thin + deep liquidity).
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
