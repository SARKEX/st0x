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

// Re-export so observability helpers (Plan 01-07 OBS-03) can import the same shape
// from the service module without reaching through to $lib/api/orders.
export type { ProcessedQuote };
import { getLoadBalancedClient } from '$lib/clients/raindex';
import type { Network } from '$lib/config/network';
import type { TakeOrdersParams, TokenInfo } from '$lib/types/transactions';
import {
	RaindexOrders,
	type OrderV4,
	type RaindexOrder,
	type RaindexOrderQuote,
	type SgOrder,
	type TakeOrdersMode,
	type TakeOrdersRequest,
	type WasmEncodedResult
} from '@rainlanguage/orderbook';
import { AbiCoder } from 'ethers';
import { formatUnits } from 'viem';
import { Float } from '@rainlanguage/float';
import { get } from 'svelte/store';
import { TransactionStatus, transactionStoreInternal } from '$lib/stores/transactionShared';
import {
	preloadAggregatedTakeOrdersCalldata,
	handleAggregatedTakeOrdersCalldata,
	handleOracleOrders
} from '$lib/stores/marketTakeStore';
import { getSignerAddress } from '$lib/services/walletService';
import {
	computeRatioMultiplier,
	DEFAULT_MARKET_ORDER_SLIPPAGE_BPS as DEFAULT_BPS,
	MAX_SLIPPAGE_BPS as MAX_BPS
} from '$lib/utils/marketOrderFill';
import {
	captureTakeOrderFailure,
	type TakeOrderTranscript,
	type TakeOrderFailureReason
} from '$lib/services/observability/captureTakeOrderFailure';
import { getMakerInputIOIndex, getMakerOutputIOIndex, getMakerInputTokenAddress, getMakerOutputTokenAddress } from "$lib/types/orderPerspective";
import { withRetry } from '$lib/utils/retry';

// TRADE-03 (Plan 02-06): pre-flight + auto-walk depth bound. Two walks max — the
// subgraph that produced these candidates is what's stale, so re-walking from
// scratch beyond level 2 has no better information source. Future tunable.
const PREFLIGHT_MAX_WALKS = 2;

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

	// OBS-03 transcript — built at function entry, mutated as the function progresses,
	// dispatched on every failure path via `failWith`. Per CONTEXT D-15: client-side
	// dual-sink (Sentry + console.error JSON line). NOT a server-relayed endpoint.
	// vaultBalance stays null in Phase 1 (D-08-LIMITATION — Phase 2 / TRADE-03 introduces
	// a server-side pre-flight read). request_id stays null on browser-only paths
	// (logger.ts is server-only).
	const transcript: TakeOrderTranscript = {
		subgraphQuoteHash: null,
		fullQuotePayload: quotes ?? [],
		onChainStateRead: {
			orderHash: null,
			vaultBalance: null,
			IOIndex: { input: null, output: null }
		},
		ratio: null,
		slippageBps,
		priceCap: null,
		// Taker Buy crosses ask (counterparty sells); taker Sell crosses bid (counterparty buys).
		side: orderSide === 'Buy' ? 'ask' : 'bid',
		takerAction: orderSide,
		userAction: orderSide,
		mode: orderSide === 'Sell' || inputMode === 'spend' ? 'spendUpTo' : 'buyUpTo',
		walletAddress: null,
		request_id: null,
		timestamp: new Date().toISOString()
	};

	// Single-seam dispatcher: every failure-return path routes through this so the
	// transcript-builder pattern stays correct under future edits. Phase 1 fence:
	// user-facing error strings are preserved verbatim (Phase 2 / TRADE-04 owns any
	// UX refactor of these messages).
	const failWith = (
		reason: TakeOrderFailureReason,
		errOrMessage: unknown,
		userFacingError: string
	) => {
		captureTakeOrderFailure(errOrMessage, transcript, reason);
		return { success: false, error: userFacingError };
	};

	try {
		const takerAddress = getSignerAddress();
		if (!takerAddress) {
			// SKIP — not a no-liquidity scenario per RESEARCH §OBS-03 (the user disconnected
			// the wallet; nothing to capture in a take-order transcript).
			return { success: false, error: 'Wallet not connected. Please reconnect and try again.' };
		}
		transcript.walletAddress = takerAddress;
		const externalQuotes = excludeTakerOwnedQuotes(quotes, takerAddress);
		transcript.fullQuotePayload = externalQuotes;
		// Per CONTEXT D-08 + checker W2: populate subgraphQuoteHash via SHA-256 of the
		// serialized payload so the transcript field is non-null at emit time.
		// crypto.subtle is available in browser context (this module is client-side).
		try {
			const hashBuf = await crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(JSON.stringify(externalQuotes))
			);
			transcript.subgraphQuoteHash =
				'0x' +
				Array.from(new Uint8Array(hashBuf))
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
		} catch {
			// crypto.subtle should always be present in supported browsers; fall back to
			// null rather than throwing through the trade UI.
			transcript.subgraphQuoteHash = null;
		}

		if (externalQuotes.length === 0) {
			return failWith(
				'no_quotes_available',
				new Error('No external orders available to fill'),
				'No external orders available to fill'
			);
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
			return failWith(
				'no_walk_fills',
				new Error('No orders available to fill at current prices'),
				'No orders available to fill'
			);
		}

		// Emergency ratio from worst priced leg (used for aggregated SDK take + legacy paths)
		const worstFill = walkResult.fills[walkResult.fills.length - 1];
		if (!worstFill?.quote?.ratio) {
			return failWith(
				'caught_exception',
				new Error('worstFill missing ratio'),
				'Unable to calculate order price. Please try again.'
			);
		}
		transcript.ratio = worstFill.quote.ratio;
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
			return failWith(
				'caught_exception',
				new Error('emergencyRatioHex computation returned null'),
				'Unable to calculate order price. Please try again.'
			);
		}

		const priceCapStrForSdk = isBuy
			? humanPriceCapStr(worstFill.price, ratioMultiplier, emergencyRatioHex)
			: String(Float.fromHex(emergencyRatioHex).value?.format().value ?? '1e+18');
		transcript.priceCap = priceCapStrForSdk;

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
		// Per CONTEXT D-08 + checker W3: orderHash + IOIndex.{input,output} are available
		// locally on firstQuote (no new on-chain read required). Populate from the same
		// data dispatchTakeOrders already receives below via aggregatedParams.
		// vaultBalance stays null — populating it requires a new on-chain getVaultBalance
		// call which is Phase 2 / TRADE-03 scope (the freshness-illusion fix introduces a
		// server-side pre-flight read).
		transcript.onChainStateRead.orderHash =
			(firstQuote.sgOrder as { orderHash?: string } | undefined)?.orderHash ??
			firstQuote.orderHash ??
			null;
		transcript.onChainStateRead.IOIndex.input = getMakerInputIOIndex(firstQuote) ?? null;
		transcript.onChainStateRead.IOIndex.output = getMakerOutputIOIndex(firstQuote) ?? null;
		if (!firstQuote.orderData || !firstQuote.sgOrder) {
			return failWith(
				'unhydrated_fills',
				new Error('firstQuote missing orderData/sgOrder after hydration'),
				'Unable to prepare aggregated order route. Please refresh and retry.'
			);
		}

		// === TRADE-03 (Plan 02-06): pre-flight multicall + auto-walk ===
		// Per Decision D-03: silent safety net — slippage protects "price moved within
		// an order"; pre-flight catches "order isn't there anymore" (filled / drained /
		// cancelled). The two safeguards coexist non-redundantly. Per D-04: on detected
		// staleness, auto-walk to the next-best on-chain order (≤ 2 levels) using fresh
		// on-chain truth, NOT the stale subgraph.
		// Per D-06: every error-return path routes through `failWith()` so the OBS-03
		// transcript captures the failure mode. This block contributes 3 new failWith
		// call sites (preflight_chain_unreachable, preflight_order_vanished, auto_retry_exhausted).
		let preflightWalkCount = 0;
		let workingFills = walkResult.fills;
		let preflightCompleted = false;
		while (preflightWalkCount < PREFLIGHT_MAX_WALKS) {
			const targetedOrders: RaindexOrder[] = workingFills
				.map((f) => f.quote.raindexOrder)
				.filter((o): o is RaindexOrder => Boolean(o));

			if (targetedOrders.length === 0) {
				return failWith(
					'preflight_chain_unreachable',
					new Error('No hydrated RaindexOrder instances available to pre-flight'),
					'Unable to verify orderbook state. Please refresh quotes and retry.'
				);
			}

			const ordersWrapper = new RaindexOrders();
			for (const o of targetedOrders) ordersWrapper.push(o);

			const preflightClient = await getLoadBalancedClient(network);
			let preflightResult: WasmEncodedResult<RaindexOrderQuote[][]>;
			try {
				preflightResult = await withRetry(() =>
					preflightClient.getOrderQuotesBatch(ordersWrapper, null, null)
				);
			} catch (e) {
				return failWith(
					'preflight_chain_unreachable',
					e instanceof Error ? e : new Error(String(e)),
					'Unable to verify orderbook state. Please refresh quotes and retry.'
				);
			}

			if (preflightResult.error || !preflightResult.value) {
				return failWith(
					'preflight_chain_unreachable',
					new Error(
						preflightResult.error?.readableMsg ?? 'getOrderQuotesBatch returned no value'
					),
					'Unable to verify orderbook state. Please refresh quotes and retry.'
				);
			}

			// Pitfall 3 (02-RESEARCH): SDK returns RaindexOrderQuote[][] — outer array per
			// order, inner array per IO-pair quote. Use `result[i]?.[0]?.data?.formattedMaxOutput`
			// (with the `[0]` to pick the first inner element), NOT `result[i].data.formattedMaxOutput`.
			// Populate transcript.vaultBalance from the first (best) candidate — closes the
			// Phase 1 D-08 LIMITATION (`01-CONTEXT.md` left it null deliberately). Populated
			// BEFORE any failure path can fire so even `preflight_order_vanished` carries it.
			transcript.onChainStateRead.vaultBalance =
				preflightResult.value[0]?.[0]?.data?.formattedMaxOutput ?? null;

			// Filter candidates: drop any with success=false OR maxOutput==='0'.
			const survivors = workingFills.filter((_fill, i) => {
				const candidateQuote = preflightResult.value![i]?.[0];
				if (!candidateQuote) return false;
				if (!candidateQuote.success) return false;
				const maxOut = candidateQuote.data?.formattedMaxOutput ?? '0';
				return maxOut !== '0' && Number(maxOut) > 0;
			});

			if (survivors.length === workingFills.length) {
				// All candidates passed pre-flight — proceed to dispatch with the original walk.
				preflightCompleted = true;
				break;
			}

			if (survivors.length > 0) {
				// Some candidates dropped; one or more orders vanished/drained.
				// Replace fills with survivors and re-enter loop for the next walk level.
				workingFills = survivors;
				preflightWalkCount += 1;
				continue;
			}

			// All candidates dropped at this walk level.
			if (preflightWalkCount + 1 < PREFLIGHT_MAX_WALKS) {
				// Theoretically we could re-walk the orderbook from scratch here, but the
				// subgraph is what produced these candidates and it's stale — we have no
				// better source on a single page render. Fail terminally with the
				// vanished-order signal.
				return failWith(
					'preflight_order_vanished',
					new Error(
						`All ${targetedOrders.length} candidate orders failed pre-flight at walk level ${preflightWalkCount + 1}`
					),
					'No liquidity available right now for this size. Try a smaller amount or check back in a minute.'
				);
			}

			return failWith(
				'auto_retry_exhausted',
				new Error(`Pre-flight + auto-walk exhausted after ${PREFLIGHT_MAX_WALKS} levels`),
				'No liquidity available right now for this size. Try a smaller amount or check back in a minute.'
			);
		}
		if (!preflightCompleted) {
			// Loop ran PREFLIGHT_MAX_WALKS times without locking in survivors (always had
			// some drops but never zero — the partial-survivor branch falls through here).
			return failWith(
				'auto_retry_exhausted',
				new Error(`Pre-flight + auto-walk exhausted after ${PREFLIGHT_MAX_WALKS} levels`),
				'No liquidity available right now for this size. Try a smaller amount or check back in a minute.'
			);
		}
		// After the loop: workingFills contains the survivors that passed pre-flight.
		// Mutate walkResult.fills (NOT a fresh object) so all downstream consumers see
		// the same shape. The aggregatedParams construction below operates on these
		// post-pre-flight fills.
		walkResult.fills = workingFills;
		// === END TRADE-03 pre-flight block ===

		// NOTE: Slippage cap (priceCap) constructed above operates on the survivors from
		// TRADE-03 pre-flight. Slippage protects "price moved within an order"; pre-flight
		// catches "order isn't there anymore". The two safeguards are non-redundant — DO NOT
		// remove either thinking the other replaces it. (See 02-CONTEXT.md §"specifics".)

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
		void preloadAggregatedTakeOrdersCalldata(takeRequest);
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
			ioIndexes: { input: getMakerInputIOIndex(firstQuote) ?? 0, output: getMakerOutputIOIndex(firstQuote) ?? 0 },
			takerWantsToken: toTokenInfo(isBuy ? assetToken : paymentToken),
			takerPaysToken: toTokenInfo(isBuy ? paymentToken : assetToken),
			requestedTakerWantsAmount: isBuy && inputMode !== 'spend' ? amount : inputAmountFilled,
			requestedTakerPaysAmount: isSpendAnchored ? amount : undefined,
			simulation: walkResult,
			orderFillAmounts,
			orderFillDecimals
		};
		const approvalSymbol = isBuy ? paymentToken.symbol : assetToken.symbol;
		const aggregatedHandled = await handleAggregatedTakeOrdersCalldata(
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
				return failWith(
					'aggregated_failed',
					new Error('indexedFills empty in fallback path'),
					'Unable to prepare order transaction. Please refresh quotes and retry.'
				);
			}
			console.log('[executeMarketOrder] Falling back to per-order execution', {
				hydratedFills: indexedFills.length,
				totalFills: walkResult.fills.length
			});
			const oracleInputs = indexedFills.map(({ fill }) => ({
				raindexOrder: fill.quote.raindexOrder as RaindexOrder,
				inputIndex: getMakerInputIOIndex(fill.quote) ?? 0,
				outputIndex: getMakerOutputIOIndex(fill.quote) ?? 0,
				amountStr: '',
				priceCapStr: priceCapStrForSdk,
				taker: takerAddress
			}));
			const fallbackParams: TakeOrdersParams = {
				...aggregatedParams,
				orderFillAmounts: indexedFills.map(({ fillAmount }) => fillAmount)
			};
			await handleOracleOrders(
				oracleInputs,
				mode,
				firstQuote.sgOrder as SgOrder,
				approvalSymbol,
				fallbackParams
			);
		}
		const { status, error: txError } = get(transactionStoreInternal);
		if (status === TransactionStatus.SUCCESS) {
			return { success: true };
		}
		if (status === TransactionStatus.ERROR) {
			return failWith(
				'aggregated_failed',
				new Error(txError ?? 'Transaction store reported ERROR status'),
				txError || 'Order failed'
			);
		}
		return failWith(
			'aggregated_failed',
			new Error(`Transaction store terminal status: ${String(status)}`),
			'Order did not complete. Please try again.'
		);
	} catch (error) {
		console.error('Market order execution error:', error);
		return failWith(
			'caught_exception',
			error,
			error instanceof Error ? error.message : 'Unknown error occurred'
		);
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
		const inputAddr = getMakerInputTokenAddress(quote)?.toLowerCase();
		const outputAddr = getMakerOutputTokenAddress(quote)?.toLowerCase();
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
