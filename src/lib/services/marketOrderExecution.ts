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
import { getLoadBalancedClient } from '$lib/clients/raindex';
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
import {
	computeRatioMultiplier,
	DEFAULT_MARKET_ORDER_SLIPPAGE_BPS as DEFAULT_BPS,
	MAX_SLIPPAGE_BPS as MAX_BPS
} from '$lib/utils/marketOrderFill';

// Re-export so existing imports (`MarketOrder.svelte`, `QuickTrade.svelte`) keep working.
export const DEFAULT_MARKET_ORDER_SLIPPAGE_BPS = DEFAULT_BPS;
export const MAX_SLIPPAGE_BPS = MAX_BPS;

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
	multiplierRaw: string
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
		network
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
		// Apply user-configured slippage to BOTH Buy and Sell. Previously Sell hardcoded
		// a 2x emergency multiplier (~100% tolerance) regardless of user input — meaning
		// a user setting "0.1% slippage" on a sell would still get filled at deep
		// discounts. The SDK's `priceCap` is per-leg in either direction, so the same
		// formula applies symmetrically.
		const ratioMultiplier = computeRatioMultiplier(slippageBps);
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
			const client = await getLoadBalancedClient(network);
			const uniqueHashes = [...new Set(quotesToHydrate.map((q) => q.orderHash))];
			await Promise.all(
				uniqueHashes.map(async (hash) => {
					try {
						const ordersResult = await client.getOrders(
							[network.id],
							{ orderHash: hash as `0x${string}`, owners: [] },
							1
						);
						if (ordersResult.error || !ordersResult.value?.orders.length) return;
						const raindexOrder = ordersResult.value.orders[0];
						const sgResult = raindexOrder.convertToSgOrder();
						if (sgResult.error || !sgResult.value) return;
						const sgOrder = sgResult.value;
						const decoded = AbiCoder.defaultAbiCoder().decode(
							[OrderV4_ABI],
							sgOrder.orderBytes
						);
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
				})
			);
		}

		// Build aggregated take via RaindexClient.getTakeOrdersCalldata(): one tx, subgraph-driven
		// route across multiple maker orders (handles split across thin + deep liquidity).
		// Verify all fills have orderData after hydration
		const unhydratedFills = walkResult.fills.filter(
			(f) => !f.quote.orderData || !(f.quote as ProcessedQuote).sgOrder?.orderBytes
		);
		if (unhydratedFills.length > 0) {
			console.warn(
				`[executeMarketOrder] ${unhydratedFills.length}/${walkResult.fills.length} fills missing orderData after hydration`
			);
		}
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
		// Compute per-fill amounts for per-order fallback path
		let orderFillAmounts: bigint[];
		let orderFillDecimals: number;
		if (orderSide === 'Sell') {
			orderFillAmounts = walkResult.fills.map((f) => f.assetAmount);
			orderFillDecimals = assetToken.decimals;
		} else if (inputMode === 'spend') {
			orderFillAmounts = walkResult.fills.map((f) => f.paymentAmount);
			orderFillDecimals = paymentToken.decimals;
		} else {
			orderFillAmounts = walkResult.fills.map((f) => f.assetAmount);
			orderFillDecimals = assetToken.decimals;
		}
		// Anchor for partial-fill detection lives on whichever side the user typed:
		//   - Buy-by-asset (mode buyUpTo):  user's typed `amount` IS the wants amount
		//   - Buy-by-spend  (mode spendUpTo): user's typed `amount` IS the pays amount
		//   - Sell          (mode spendUpTo): user's typed `amount` IS the pays amount
		// Setting `requestedTakerPaysAmount` for spend-mode flows lets downstream code
		// compare actual paid vs typed paid (the right anchor) instead of conflating
		// price slippage with quantity shortfall on the receive side.
		const isSpendAnchored = orderSide === 'Sell' || inputMode === 'spend';
		const aggregatedParams: TakeOrdersParams = {
			orderData: firstQuote.orderData as OrderV4,
			ioIndexes: { input: firstQuote.inputIOIndex ?? 0, output: firstQuote.outputIOIndex ?? 0 },
			takerWantsToken: toTokenInfo(isBuy ? assetToken : paymentToken),
			takerPaysToken: toTokenInfo(isBuy ? paymentToken : assetToken),
			requestedTakerWantsAmount: isBuy && inputMode !== 'spend' ? amount : inputAmountFilled,
			requestedTakerPaysAmount: isSpendAnchored ? amount : undefined,
			simulation: walkResult,
			orderFillAmounts,
			orderFillDecimals
		};
		const approvalSymbol = isBuy ? paymentToken.symbol : assetToken.symbol;
		const aggregatedHandled = await transactionStore.handleAggregatedTakeOrdersCalldata(
			takeRequest,
			firstQuote.sgOrder as SgOrder,
			aggregatedParams,
			approvalSymbol
		);
		if (!aggregatedHandled) {
			// Aggregated SDK path failed (often stale subgraph vault balances).
			// Fall back to per-order execution using hydrated RaindexOrder instances.
			const indexedFills = walkResult.fills
				.map((f, i) => ({ fill: f, fillAmount: orderFillAmounts[i] ?? 0n }))
				.filter(
					({ fill }) =>
						fill.quote.raindexOrder &&
						fill.quote.orderData &&
						(fill.quote as ProcessedQuote).sgOrder?.orderBytes
				);
			if (indexedFills.length === 0) {
				return {
					success: false,
					error: 'Unable to prepare order transaction. Please refresh quotes and retry.'
				};
			}
			console.log('[executeMarketOrder] Falling back to per-order execution', {
				hydratedFills: indexedFills.length,
				totalFills: walkResult.fills.length
			});
			const oracleInputs = indexedFills.map(({ fill }) => ({
				raindexOrder: fill.quote.raindexOrder as RaindexOrder,
				inputIndex: fill.quote.inputIOIndex ?? 0,
				outputIndex: fill.quote.outputIOIndex ?? 0,
				amountStr: '',
				priceCapStr: priceCapStrForSdk,
				taker: takerAddress
			}));
			const fallbackParams: TakeOrdersParams = {
				...aggregatedParams,
				orderFillAmounts: indexedFills.map(({ fillAmount }) => fillAmount)
			};
			await transactionStore.handleOracleOrders(
				oracleInputs,
				mode,
				firstQuote.sgOrder as SgOrder,
				approvalSymbol,
				fallbackParams
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
