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
	type TakeOrdersMode
} from '@rainlanguage/orderbook';
import { AbiCoder } from 'ethers';
import { Float } from '@rainlanguage/float';
import transactionStore from '$lib/stores/transaction';
import { getSignerAddress } from '$lib/services/walletService';

// Safety bounds for market order execution
const MINIMUM_IO = Float.fromBigint(0n).asHex();
// No price cap: accept any ratio the order offers
const MAX_IO_RATIO_HEX = Float.maxPositiveValue().value!.asHex();
const MAX_IO_RATIO_STR = String(Float.maxPositiveValue().value!.formatWithScientific(true).value ?? '1e+38');

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
		// 1. Walk the orderbook to get fills
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
		const orderInfos = Array.from(orderInfoMap.values());

		await Promise.all(
			orderInfos.map(async (orderInfo) => {
				if (orderInfo.raindexOrder) {
					// We already have the RaindexOrder object from quote processing.
					return;
				}
				try {
					const ordersResult = await client.getOrders(
						[network.id],
						{
							owners: [],
							orderHash: orderInfo.order.orderHash as `0x${string}`
						},
						1
					);

					if (ordersResult.error || !ordersResult.value?.orders.length) {
						console.warn('[marketOrderExecution] Failed to hydrate RaindexOrder by hash', {
							orderHash: orderInfo.order.orderHash,
							error: ordersResult.error?.readableMsg
						});
						return;
					}

					const raindexOrderObj = ordersResult.value.orders[0];
					// Always keep the RaindexOrder object so we can use getTakeCalldata(),
					// which populates signedContext internally for oracle-enabled orders.
					orderInfo.raindexOrder = raindexOrderObj;

					// If we already have hydrated order data from quotes, no need to decode again.
					if (orderInfo.orderData?.owner) {
						return;
					}

					const quotesResult = await raindexOrderObj.getQuotes();
					if (quotesResult.error || !quotesResult.value?.length) return;

					const validQuotes = quotesResult.value.filter(
						(q: RaindexOrderQuote) => q.success && q.data
					);
					if (validQuotes.length === 0) return;

					const sgOrderResult = raindexOrderObj.convertToSgOrder();
					if (sgOrderResult.error || !sgOrderResult.value) return;

					const sgOrder = sgOrderResult.value;
					const decodedOrder = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], sgOrder.orderBytes);
					const orderData = normalizeOrderData(decodedOrder[0] as OrderV4);

					orderInfo.order = sgOrder;
					orderInfo.orderData = orderData;
					orderInfo.quotes = validQuotes;
				} catch (orderError) {
					console.error('Error hydrating order', orderInfo.order.orderHash, orderError);
				}
			})
		);

		// 4. Filter to only executable orders (exclude user's own orders)
		const userAddress = getSignerAddress()?.toLowerCase();
		const executableOrders = orderInfos.filter((info) => {
			if (!info.orderData?.owner) return false;
			// Cannot take your own order - contract will reject it
			if (userAddress && info.orderData.owner.toLowerCase() === userAddress) {
				console.log('[marketOrderExecution] Excluding own order:', info.order.orderHash);
				return false;
			}
			return true;
		});
		if (executableOrders.length === 0) {
			return { success: false, error: 'Orders temporarily unavailable. Please try again.' };
		}

		// Determine if we can use an exact output cap (IOIsInput=false) instead of
		// estimating the receive amount. This applies when the user specifies exactly
		// how much they want to spend: Buy+spend (USD budget) or Sell (asset amount).
		const useOutputCap = orderSide === 'Sell' || inputMode === 'spend';

		// 5. Compute per-order fill amounts from walkResult
		// Output-cap (IOIsInput=false): amounts are what taker pays per order
		// Input-cap (IOIsInput=true): amounts are what taker receives per order
		const isBuy = orderSide === 'Buy';
		const fillAmountsByOrderHash = new Map<string, bigint>();
		for (const fill of walkResult.fills) {
			const orderHash = fill.quote.orderHash?.toLowerCase() ?? '';
			if (!orderHash) continue;
			const wantAsset = useOutputCap ? !isBuy : isBuy;
			const fillAmount = wantAsset ? fill.assetAmount : fill.paymentAmount;
			const current = fillAmountsByOrderHash.get(orderHash) ?? 0n;
			fillAmountsByOrderHash.set(orderHash, current + fillAmount);
		}

		// 6. Build TakeOrderConfigs with parallel fill amounts array
		const takeOrderConfigs: TakeOrderConfigV4[] = [];
		const orderFillAmounts: bigint[] = [];
		const takeOrderRaindexOrders: RaindexOrder[] = [];
		for (const orderInfo of executableOrders) {
			if (!orderInfo.orderData?.validInputs?.length || !orderInfo.orderData?.validOutputs?.length) {
				continue;
			}
			if (!orderInfo.raindexOrder) {
				continue;
			}

			const inputIndex = orderInfo.inputIOIndex;
			const outputIndex = orderInfo.outputIOIndex;
			const hasInput = orderInfo.orderData.validInputs[inputIndex];
			const hasOutput = orderInfo.orderData.validOutputs[outputIndex];

			if (!hasInput || !hasOutput) {
				continue;
			}

			const matchingFill = walkResult.fills.find(
				(f) =>
					(f.quote.orderHash?.toLowerCase() ?? '') ===
						(orderInfo.order.orderHash?.toLowerCase() ?? '') &&
					(f.quote.inputIOIndex ?? 0) === inputIndex &&
					(f.quote.outputIOIndex ?? 0) === outputIndex
			);
			const signedContext =
				(
					matchingFill?.quote as ProcessedQuote & {
						signedContext?: TakeOrderConfigV4['signedContext'];
					}
				)?.signedContext ?? [];

			takeOrderConfigs.push({
				order: orderInfo.orderData,
				inputIOIndex: inputIndex.toString(),
				outputIOIndex: outputIndex.toString(),
				signedContext
			});
			takeOrderRaindexOrders.push(orderInfo.raindexOrder);

			// Add fill amount for this order (parallel to takeOrderConfigs)
			const orderHash = orderInfo.order.orderHash?.toLowerCase() ?? '';
			orderFillAmounts.push(fillAmountsByOrderHash.get(orderHash) ?? 0n);
		}

		if (takeOrderConfigs.length === 0) {
			return { success: false, error: 'Unable to prepare order. Please try again.' };
		}

		const primaryOrder = executableOrders[0];

		// 7. Calculate approval amount
		const { inputAmountFilled, outputAmountGiven, inputDecimals, outputDecimals } = walkResult;

		let requiredApprovalAmount: bigint;
		if (isBuy && inputMode !== 'spend') {
			// Buy+amount: worst-case payment = requested asset amount / worst fill ratio.
			// ratio = asset/payment (e.g. STOX per USDC), so maxPayment = assetAmount / ratio.
			const worstFill = walkResult.fills[walkResult.fills.length - 1];
			const worstRatioResult = worstFill?.quote?.ratio
				? Float.fromHex(worstFill.quote.ratio as `0x${string}`)
				: null;
			const ratioStr = worstRatioResult?.value?.format().value;
			const assetAmountStr = Float.fromFixedDecimalLossy(amount, assetToken.decimals).float.format().value;

			let maxPaymentFromRatio = 0n;
			if (ratioStr != null && assetAmountStr != null) {
				const ratioNum = parseFloat(String(ratioStr));
				const assetNum = parseFloat(String(assetAmountStr));
				// ratio = asset/payment (STOX per USDC), so maxPayment = assetAmount / ratio
				if (ratioNum > 0) {
					const maxPaymentDecimal = assetNum / ratioNum;
					// Add 1% rounding buffer on top of the theoretical maximum
					const bufferedPayment = maxPaymentDecimal * 1.01;
					maxPaymentFromRatio = BigInt(Math.ceil(bufferedPayment * Math.pow(10, paymentToken.decimals)));
				}
			}

			// Fallback: outputAmountGiven + 20% if Float parsing fails
			const fallbackBuffer = outputAmountGiven / 5n;
			const fallback = outputAmountGiven + (fallbackBuffer > 0n ? fallbackBuffer : 1n);

			requiredApprovalAmount = maxPaymentFromRatio > 0n ? maxPaymentFromRatio : fallback;
		} else {
			// Buy+spend or Sell: exact spend amount, no padding needed
			requiredApprovalAmount = amount;
		}

		// 9a. Use getTakeCalldata() only when signed context is not already present on fills.
		// If signed context exists, prefer the regular takeOrders path with explicit signedContext
		// to avoid "not ready" oracle-calldata skips.
		const ordersWithCalldata = executableOrders.filter((o) => o.raindexOrder);
		const hasSignedContextOnFills = walkResult.fills.some((fill) => {
			const quoteWithContext = fill.quote as ProcessedQuote & { signedContext?: unknown[] };
			return (quoteWithContext.signedContext?.length ?? 0) > 0;
		});
		console.log('[marketOrderExecution] path decision', {
			orderSide,
			inputMode,
			totalExecutableOrders: executableOrders.length,
			ordersWithCalldata: ordersWithCalldata.length,
			hasSignedContextOnFills,
			fillCount: walkResult.fills.length
		});
		if (ordersWithCalldata.length > 0 && !hasSignedContextOnFills) {
			const mode: TakeOrdersMode =
				orderSide === 'Sell'
					? 'spendExact'
					: inputMode === 'spend'
						? 'spendExact'
						: 'buyExact';

			// Amount decimals: what the taker specifies (asset for buy/sell, payment for buy+spend)
			const amountDecimals =
				orderSide === 'Buy' && inputMode === 'spend'
					? paymentToken.decimals
					: assetToken.decimals;

			const priceCapStr = MAX_IO_RATIO_STR;

			const takerAddress = getSignerAddress();
			if (!takerAddress) {
				return { success: false, error: 'Wallet not connected. Please reconnect and try again.' };
			}

			const oracleInputs = ordersWithCalldata
				.filter((o) => o.raindexOrder)
				.map((orderInfo) => {
					const fillAmount =
						fillAmountsByOrderHash.get(orderInfo.order.orderHash?.toLowerCase() ?? '') ?? 0n;
					const amountStr = String(
						Float.fromFixedDecimalLossy(fillAmount, amountDecimals).float.format().value ?? '0'
					);
					console.log('[marketOrderExecution] oracle input', {
						orderHash: orderInfo.order.orderHash,
						inputIndex: orderInfo.inputIOIndex,
						outputIndex: orderInfo.outputIOIndex,
						fillAmount: fillAmount.toString(),
						amountStr,
						priceCapStr
					});
					return {
						raindexOrder: orderInfo.raindexOrder!,
						inputIndex: orderInfo.inputIOIndex,
						outputIndex: orderInfo.outputIOIndex,
						fillAmount,
						amountStr,
						priceCapStr,
						taker: takerAddress
					};
				})
				.filter((input) => input.fillAmount > 0n)
				.map(({ fillAmount: _fillAmount, ...input }) => input);

			if (oracleInputs.length === 0) {
				return {
					success: false,
					error: 'No executable quote amount found for selected order(s). Please refresh and try again.'
				};
			}

			// 10–13 (oracle variant) - use params built from the same walkResult
			const toTokenInfo = ({ address, decimals, symbol }: TokenInfo): TokenInfo => ({
				address,
				decimals,
				symbol
			});
			const takerWantsInfo = toTokenInfo(isBuy ? assetToken : paymentToken);
			const takerPaysInfo = toTokenInfo(isBuy ? paymentToken : assetToken);
			const requestedTakerWantsAmount =
				isBuy && inputMode !== 'spend' ? amount : inputAmountFilled;

			const oracleParams: TakeOrdersParams = {
				orderData: primaryOrder.orderData,
				ioIndexes: { input: primaryOrder.inputIOIndex, output: primaryOrder.outputIOIndex },
				takerWantsToken: takerWantsInfo,
				takerPaysToken: takerPaysInfo,
				requestedTakerWantsAmount,
				simulation: walkResult,
				orderFillAmounts,
				orderFillDecimals: useOutputCap ? outputDecimals : inputDecimals
			};

			console.log('[marketOrderExecution] executing oracle calldata path', {
				oracleInputCount: oracleInputs.length,
				mode
			});
			await transactionStore.handleOracleOrders(
				oracleInputs,
				mode,
				primaryOrder.order,
				takerPaysInfo.address,
				takerPaysInfo.symbol,
				requiredApprovalAmount,
				oracleParams
			);
			return { success: true };
		}
		console.log('[marketOrderExecution] executing takeOrders fallback path', {
			orderCount: takeOrderConfigs.length,
			raindexOrderCount: takeOrderRaindexOrders.length,
			signedContextLengths: JSON.stringify(
				takeOrderConfigs.map((o) => o.signedContext?.length ?? 0)
			),
			requiredApprovalAmount: requiredApprovalAmount.toString()
		});

		// 9. Build TakeOrdersConfig
		// Output-cap: maximumIO is exact spend amount (IOIsInput=false)
		// Input-cap: maximumIO is exact receive amount (IOIsInput=true)
		const maximumIOAmount = useOutputCap ? amount : inputAmountFilled;
		const maximumIODecimals = useOutputCap ? outputDecimals : inputDecimals;
		const maximumIOFloat = Float.fromFixedDecimalLossy(maximumIOAmount, maximumIODecimals);

		const takeOrdersConfig: TakeOrdersConfigV5 = {
			minimumIO: MINIMUM_IO,
			maximumIO: maximumIOFloat.float.asHex(),
			maximumIORatio: MAX_IO_RATIO_HEX,
			IOIsInput: !useOutputCap as unknown as string,
			orders: takeOrderConfigs,
			data: '0x'
		};

		// 10. Determine taker perspective tokens
		const toTokenInfo = ({ address, decimals, symbol }: TokenInfo): TokenInfo => ({
			address,
			decimals,
			symbol
		});
		const takerWantsInfo = toTokenInfo(isBuy ? assetToken : paymentToken);
		const takerPaysInfo = toTokenInfo(isBuy ? paymentToken : assetToken);

		// 11. Calculate requested amount
		// Buy+amount: user specified exact asset quantity
		// Buy+spend or Sell: estimated receive from orderbook walk
		const requestedTakerWantsAmount = isBuy && inputMode !== 'spend' ? amount : inputAmountFilled;

		// 12. Build recalculate callback if needed
		// Output-cap mode recalculates to get a fresh emergency ratio after approval wait.
		// The spend amount stays fixed; only the ratio is refreshed from current quotes.
		const recalculateConfig =
			useOutputCap && refreshQuotes
				? async (): Promise<TakeOrdersConfigV5 | null> => {
						try {
							const freshQuotes = await refreshQuotes();

							const freshWalkResult = walkOrderbook({
								quotes: freshQuotes,
								orderSide,
								selectedAmount: amount,
								assetDecimals: assetToken.decimals,
								paymentDecimals: paymentToken.decimals,
								mode: inputMode === 'spend' ? 'spend' : 'receive'
							});

							if (!freshWalkResult || freshWalkResult.inputAmountFilled === 0n) {
								return null;
							}

							const freshMaximumIO = Float.fromFixedDecimalLossy(
								amount,
								freshWalkResult.outputDecimals
							);

							return {
								minimumIO: MINIMUM_IO,
								maximumIO: freshMaximumIO.float.asHex(),
								maximumIORatio: MAX_IO_RATIO_HEX,
								IOIsInput: false as unknown as string,
								orders: takeOrderConfigs,
								data: '0x'
							};
						} catch {
							return null;
						}
					}
				: undefined;

		// 13. Execute transaction
		const params: TakeOrdersParams = {
			orderData: primaryOrder.orderData,
			ioIndexes: { input: primaryOrder.inputIOIndex, output: primaryOrder.outputIOIndex },
			takerWantsToken: takerWantsInfo,
			takerPaysToken: takerPaysInfo,
			requestedTakerWantsAmount,
			simulation: walkResult,
			orderFillAmounts,
			orderFillDecimals: useOutputCap ? outputDecimals : inputDecimals
		};

		await transactionStore.handleTakeOrders(
			takeOrdersConfig,
			primaryOrder.order,
			requiredApprovalAmount,
			params,
			recalculateConfig,
			takeOrderRaindexOrders
		);

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
