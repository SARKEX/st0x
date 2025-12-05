<script lang="ts">
	import type { CategorizedToken } from '$lib/config/network';
	import { currentNetwork } from '$lib/stores';
	import {
		OrderV4_ABI,
		normalizeOrderData,
		type ProcessedQuote,
		walkOrderbook
	} from '$lib/api/orders';
	import { createRaindexClient } from '$lib/clients/raindex';
	import { normalizeAddress } from '$lib/utils/tokenMath';
	import { getUserTakerInfo } from '$lib/types/orderPerspective';
	import {
		type OrderV4,
		type RaindexOrderQuote,
		type SgOrder,
		type TakeOrderConfigV4,
		type TakeOrdersConfigV4
	} from '@rainlanguage/orderbook';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { AbiCoder } from 'ethers';
	import { formatUnits, parseUnits } from 'viem';
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import { walletRegistered, promptWalletConnection, promptLogin } from '$lib/stores/accessStore';
	import { validateSelectedAmount } from '$lib/utils/validation';
	import transactionStore from '$lib/stores/transaction';
	import { Float } from '@rainlanguage/float';
	import type { OrderbookQuoteCache } from '$lib/queries/orderbook';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
	import type { CreateQueryResult } from '@tanstack/svelte-query';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';

	// Input mode: 'amount' = specify asset quantity, 'spend' = specify payment amount
	let inputMode: 'amount' | 'spend' = 'amount';
	/**
	 * assetToken: The non-settlement token being traded (tSTOX, tNVDA, etc.)
	 *
	 * From taker perspective:
	 * - Buy action: takerWants=assetToken, takerPays=paymentToken
	 * - Sell action: takerWants=paymentToken, takerPays=assetToken
	 */
	export let assetToken: CategorizedToken | undefined;
	/**
	 * orderbookQuotesQuery: The orderbook quotes query (passed from parent)
	 */
	export let orderbookQuotesQuery: CreateQueryResult<OrderbookQuoteCache, Error>;

	const ORDERBOOK_MAX_STALENESS_MS = 20_000; // 20 seconds
	const PRICE_GUARD_MULTIPLIER = 1.05; // 5% price tolerance for slippage and liquidity checks
	const IO_RATIO_BUFFER = 1.0025; // 0.25% buffer for execution-time price variance

	let oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	$: oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);

	// Quote freshness tracking
	let quoteFreshnessSeconds = 0;
	let quoteFreshnessInterval: ReturnType<typeof setInterval> | null = null;

	function updateQuoteFreshness() {
		const lastUpdated = $orderbookQuotesQuery?.dataUpdatedAt ?? 0;
		if (lastUpdated > 0) {
			quoteFreshnessSeconds = Math.floor((Date.now() - lastUpdated) / 1000);
		}
	}

	$: if ($orderbookQuotesQuery?.dataUpdatedAt) {
		updateQuoteFreshness();
		// Clear existing interval
		if (quoteFreshnessInterval) clearInterval(quoteFreshnessInterval);
		// Update every second
		quoteFreshnessInterval = setInterval(updateQuoteFreshness, 1000);
	}

	// Cleanup interval on component destroy
	import { onDestroy } from 'svelte';
	onDestroy(() => {
		if (quoteFreshnessInterval) clearInterval(quoteFreshnessInterval);
	});

	$: isQuoteStale = quoteFreshnessSeconds > ORDERBOOK_MAX_STALENESS_MS / 1000;

	// State for market price and quantity
	let marketPrice: number = 0; // Human-readable price (quote per asset)
	let selectedAmount: bigint = 0n; // Quantity to acquire from order outputs (in output token decimals)
	let isLoadingPrice = true;
	let priceError = false;
	let priceErrorReason: 'no_quotes' | 'no_fill' | 'error' | null = null;
	let orderPreparationError: string | null = null;

	// Clear preparation error when inputs change
	$: if (selectedAmount || orderSide) {
		orderPreparationError = null;
	}
	let availableOrders: Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number; // Human-readable price (quote per asset)
		inputIOIndex: number;
		outputIOIndex: number;
	}> = [];
	let orderbook: string | undefined = undefined;

	$: paymentToken = $currentNetwork?.defaultPaymentToken || $currentNetwork?.paymentTokens?.[0];
	$: paymentTokenSymbol = paymentToken?.symbol ?? 'Quote';

	// Taker perspective: What the user wants to receive and what they'll pay
	$: takerInfo =
		assetToken && paymentToken ? getUserTakerInfo(orderSide, assetToken, paymentToken) : null;

	// Errors
	let selectedAmountError: boolean = false;
	let insufficientBalanceError: boolean = false;

	// Balance from TradeAmountInput (bound)
	let spendingTokenBalance: bigint = 0n;
	let spendingTokenBalanceDecimals: number | null = null;

	// Reference to TradeAmountInput for programmatic updates
	let tradeAmountInputRef: { setAmountValue: (amount: bigint) => void } | undefined;

	// Token being spent
	$: spendingToken = orderSide === 'Buy' ? paymentToken : assetToken;

	// Check if oracle price is available (needed for BUY percentage calculations)
	$: oracleAddress = assetToken?.address?.toLowerCase();
	$: oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
	$: oraclePriceAvailable = oracleEntry?.price && oracleEntry.price > 0;
	// Percentage buttons need oracle price for BUY in 'amount' mode (to convert payment to asset amount)
	// In 'spend' mode, no conversion needed - direct percentage of balance
	$: percentageButtonsDisabled =
		orderSide === 'Buy' && inputMode === 'amount' && !oraclePriceAvailable && spendingTokenBalance > 0n;

	// Calculate the amount being spent and check against balance
	$: {
		if (!selectedAmount || selectedAmount === 0n || !marketPrice || isLoadingPrice) {
			insufficientBalanceError = false;
		} else if (orderSide === 'Sell') {
			// For SELL: user is spending the asset token
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else if (inputMode === 'spend') {
			// For BUY in spend mode: selectedAmount is the exact payment amount
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else {
			// For BUY in amount mode: user is spending the payment token (USDC)
			// Calculate the estimated cost
			const assetDecimals = assetToken?.decimals ?? 18;
			const paymentDecimals = paymentToken?.decimals ?? 6;
			const outputInTokens = parseFloat(formatUnits(selectedAmount, assetDecimals));
			const estimatedCost = outputInTokens * marketPrice;
			// Convert to bigint in payment token decimals
			const estimatedCostBigInt = BigInt(Math.ceil(estimatedCost * 10 ** paymentDecimals));
			insufficientBalanceError = estimatedCostBigInt > spendingTokenBalance;
		}
	}

	// Liquidity warning: check if there's enough liquidity within price guard
	let insufficientLiquidityWarning: boolean = false;

	// Calculate available liquidity within price guard
	$: {
		if (!selectedAmount || selectedAmount === 0n || !assetToken) {
			insufficientLiquidityWarning = false;
		} else {
			const allQuotes = $orderbookQuotesQuery?.data?.quotes ?? [];
			const assetAddressNormalized = normalizeAddress(assetToken.address);
			const paymentTokenAddressNormalized = normalizeAddress(
				paymentToken?.address?.toLowerCase() || ''
			);

			// Filter quotes by side and token pair
			const relevantQuotes = allQuotes.filter((quote: ProcessedQuote) => {
				const quoteOutputAddressNormalized = normalizeAddress(quote.outputTokenAddress);
				const quoteInputAddressNormalized = normalizeAddress(quote.inputTokenAddress);
				const targetOutputAddress =
					orderSide === 'Buy' ? assetAddressNormalized : paymentTokenAddressNormalized;
				const targetInputAddress =
					orderSide === 'Buy' ? paymentTokenAddressNormalized : assetAddressNormalized;
				const targetSide = orderSide === 'Buy' ? 'ask' : 'bid';
				const quotePerAsset = quote.quotePerAsset;

				return (
					quoteOutputAddressNormalized === targetOutputAddress &&
					quoteInputAddressNormalized === targetInputAddress &&
					quote.side === targetSide &&
					quotePerAsset !== undefined &&
					Number.isFinite(quotePerAsset) &&
					quotePerAsset > 0
				);
			});

			// Get oracle price for price guard
			const oracleAddress = assetToken?.address?.toLowerCase();
			const oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
			const oraclePrice = oracleEntry?.price;

			if (!oraclePrice || oraclePrice <= 0 || relevantQuotes.length === 0) {
				insufficientLiquidityWarning = false;
			} else {
				// Filter quotes within price guard (5% of oracle price)
				const maxAcceptablePrice = oraclePrice * PRICE_GUARD_MULTIPLIER;
				const minAcceptablePrice = oraclePrice / PRICE_GUARD_MULTIPLIER;

				const quotesWithinGuard = relevantQuotes.filter((quote: ProcessedQuote) => {
					const price = quote.quotePerAsset ?? 0;
					return orderSide === 'Buy' ? price <= maxAcceptablePrice : price >= minAcceptablePrice;
				});

				if (quotesWithinGuard.length === 0) {
					insufficientLiquidityWarning = selectedAmount > 0n;
				} else {
					// Walk the filtered orderbook to calculate available liquidity
					const assetDecimals = assetToken?.decimals ?? 18;
					const paymentDecimals = paymentToken?.decimals ?? 6;

					// Sort quotes by price (best first)
					const sortedQuotes = [...quotesWithinGuard].sort((a, b) => {
						if (orderSide === 'Buy') {
							return (a.quotePerAsset ?? 0) - (b.quotePerAsset ?? 0);
						} else {
							return (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0);
						}
					});

					// Walk to calculate total available liquidity
					const walkResult = walkOrderbook({
						quotes: sortedQuotes,
						orderSide,
						selectedAmount: BigInt('0xffffffffffffffffffffffffffffffff'), // Max value to get total liquidity
						assetDecimals,
						paymentDecimals
					});

					// Compare based on input mode:
					// - amount mode: compare selectedAmount (asset) against available asset amount
					// - spend mode: compare selectedAmount (payment) against available payment capacity
					if (inputMode === 'spend') {
						// In spend mode, selectedAmount is payment amount
						// For BUY: outputAmountGiven is payment capacity
						const availablePaymentCapacity = walkResult.outputAmountGiven;
						insufficientLiquidityWarning = selectedAmount > availablePaymentCapacity;
					} else {
						// In amount mode, selectedAmount is asset amount
						// For BUY: inputAmountFilled is asset amount, For SELL: outputAmountGiven is asset amount
						const availableAssetAmount =
							orderSide === 'Buy' ? walkResult.inputAmountFilled : walkResult.outputAmountGiven;
						insufficientLiquidityWarning = selectedAmount > availableAssetAmount;
					}
				}
			}
		}
	}

	$: summaryAccentClass = orderSide === 'Buy' ? 'text-green-400' : 'text-red-400';
	$: actionButtonClass =
		orderSide === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	$: disableDeploy =
		!selectedAmount ||
		!marketPrice ||
		!assetToken ||
		selectedAmountError ||
		insufficientBalanceError ||
		isLoadingPrice ||
		priceError ||
		isSubmittingMarketOrder;

	// Calculate the "other side" of the trade for display
	// In amount mode: show how much payment token you'll spend
	// In spend mode: show how many asset tokens you'll receive
	$: estimatedTradeResult = (() => {
		if (!selectedAmount || !marketPrice) return { value: '0.00', label: '' };
		if (inputMode === 'spend') {
			// Spend mode: show estimated tokens received
			const spendInTokens = parseFloat(formatUnits(selectedAmount, paymentToken?.decimals || 6));
			const tokensReceived = spendInTokens / marketPrice;
			return {
				value: `~${tokensReceived.toFixed(4)} ${assetToken?.symbol ?? 'tokens'}`,
				label: 'Est. tokens received'
			};
		} else {
			// Amount mode: show estimated cost
			const outputInTokens = parseFloat(formatUnits(selectedAmount, assetToken?.decimals || 18));
			const total = outputInTokens * marketPrice;
			return {
				value: `~${total.toFixed(2)} ${paymentTokenSymbol}`,
				label: 'Est. cost'
			};
		}
	})();

	let isSubmittingMarketOrder = false;

	// Handle percentage button clicks for setting amount based on wallet balance
	const handlePercentageClick = (percent: number) => {
		if (!spendingTokenBalance || spendingTokenBalance === 0n) return;
		if (spendingTokenBalanceDecimals === null) return;
		if (!tradeAmountInputRef) return;

		if (orderSide === 'Sell') {
			// For SELL: balance is in asset token, amount is in asset token - direct calculation
			const percentAmount = (spendingTokenBalance * BigInt(percent)) / 100n;
			tradeAmountInputRef.setAmountValue(percentAmount);
		} else if (inputMode === 'spend') {
			// For BUY in spend mode: balance is in payment token, amount is in payment token - direct calculation
			const percentAmount = (spendingTokenBalance * BigInt(percent)) / 100n;
			tradeAmountInputRef.setAmountValue(percentAmount);
		} else {
			// For BUY in amount mode: balance is in payment token (USDC), need to convert to asset amount
			// We need the oracle price to estimate how much asset we can buy
			const oracleAddress = assetToken?.address?.toLowerCase();
			const oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
			const oraclePrice = oracleEntry?.price;

			if (!oraclePrice || oraclePrice <= 0) {
				// Fall back: can't convert without price - just don't set anything
				return;
			}

			const paymentDecimals = spendingTokenBalanceDecimals;
			const assetDecimals = assetToken?.decimals ?? 18;

			// Calculate payment amount to spend (percent of balance)
			const paymentToSpend = (spendingTokenBalance * BigInt(percent)) / 100n;

			// Convert payment amount to asset amount using oracle price
			// paymentAmount / price = assetAmount
			// But we need to handle decimals properly:
			// paymentToSpend is in payment decimals (e.g., 6 for USDC)
			// We want result in asset decimals (e.g., 18)
			const paymentInFloat = parseFloat(formatUnits(paymentToSpend, paymentDecimals));
			const assetAmount = paymentInFloat / oraclePrice;
			tradeAmountInputRef.setAmountValue(
				parseUnits(assetAmount.toFixed(assetDecimals), assetDecimals)
			);
		}
	};

	async function fetchMarketPrice() {
		if (!assetToken || !orderSide) {
			isLoadingPrice = false;
			return;
		}

		try {
			isLoadingPrice = true;
			priceError = false;
			priceErrorReason = null;

			// If no selected amount, don't calculate a price estimate
			if (!selectedAmount || selectedAmount === 0n) {
				marketPrice = 0;
				availableOrders = [];
				orderbook = undefined;
				return;
			}

			const walkResult = calculateOrderbookWalk();

			if (!walkResult) {
				console.warn('No relevant quotes found');
				priceError = true;
				priceErrorReason = 'no_quotes';
				isLoadingPrice = false;
				return;
			}

			const { inputAmountFilled, outputAmountGiven, ioRatio, fills } = walkResult;

			// Check if anything was filled (asset amount)
			const assetFilled = orderSide === 'Buy' ? inputAmountFilled : outputAmountGiven;
			if (assetFilled > 0n) {
				// Convert ioRatio to price (quote per asset) for display
				// BUY: ioRatio = asset/payment, so price = 1/ioRatio
				// SELL: ioRatio = payment/asset = price
				marketPrice = orderSide === 'Buy' ? (ioRatio > 0 ? 1 / ioRatio : 0) : ioRatio;

				availableOrders = fills.map((fill) => ({
					order:
						(fill.quote.sgOrder as SgOrder) ??
						({
							orderHash: fill.quote.orderHash,
							orderbook: { id: fill.quote.orderbookId ?? 'cached' }
						} as unknown as SgOrder),
					orderData: (fill.quote.orderData as OrderV4) ?? ({} as OrderV4),
					quotes: [] as RaindexOrderQuote[],
					price: fill.price,
					inputIOIndex: fill.quote.inputIOIndex ?? 0,
					outputIOIndex: fill.quote.outputIOIndex ?? 0
				}));
				orderbook = fills[0]?.quote.orderbookId ?? 'cached';
			} else {
				console.warn('No quantity filled from orderbook', {
					selectedAmount: selectedAmount.toString(),
					ordersWalked: fills.length
				});
				priceError = true;
				priceErrorReason = 'no_fill';
				isLoadingPrice = false;
				return;
			}
		} catch (error) {
			console.error('Error calculating market price:', error);
			priceError = true;
			priceErrorReason = 'error';
		} finally {
			isLoadingPrice = false;
		}
	}

	// Fetch market price when component mounts or dependencies change
	// Only calculates price when user has entered a quantity (selectedAmount > 0)
	// This ensures we only show price estimates when there's a meaningful quantity to estimate for
	$: if (assetToken && orderSide && selectedAmount > 0n && $orderbookQuotesQuery?.data?.quotes) {
		fetchMarketPrice();
	} else if (!selectedAmount || selectedAmount === 0n) {
		// Clear price when quantity is cleared
		marketPrice = 0;
		availableOrders = [];
		orderbook = undefined;
	}

	// Walk the orderbook with current quotes and selected amount
	// Applies the same price guard filter used during execution for consistency
	function calculateOrderbookWalk() {
		if (!assetToken || !orderSide || !selectedAmount || selectedAmount === 0n) {
			return null;
		}

		const allQuotes = $orderbookQuotesQuery?.data?.quotes ?? [];
		const assetAddressNormalized = normalizeAddress(assetToken.address);
		const paymentTokenAddressNormalized = normalizeAddress(
			paymentToken?.address?.toLowerCase() || ''
		);

		// Get oracle price for price guard filtering
		const oracleAddress = assetToken?.address?.toLowerCase();
		const oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
		const oraclePrice = oracleEntry?.price;

		// Calculate price guard bounds (same logic as getFilteredOrders)
		const maxAcceptablePrice =
			oraclePrice && oraclePrice > 0 ? oraclePrice * PRICE_GUARD_MULTIPLIER : Infinity;
		const minAcceptablePrice =
			oraclePrice && oraclePrice > 0 ? oraclePrice / PRICE_GUARD_MULTIPLIER : 0;

		const relevantQuotes = allQuotes.filter((quote: ProcessedQuote) => {
			const quoteOutputAddressNormalized = normalizeAddress(quote.outputTokenAddress);
			const quoteInputAddressNormalized = normalizeAddress(quote.inputTokenAddress);
			const targetOutputAddress =
				orderSide === 'Buy' ? assetAddressNormalized : paymentTokenAddressNormalized;
			const targetInputAddress =
				orderSide === 'Buy' ? paymentTokenAddressNormalized : assetAddressNormalized;
			const targetSide = orderSide === 'Buy' ? 'ask' : 'bid';
			const quotePerAsset = quote.quotePerAsset;

			// Basic validity checks
			if (
				quoteOutputAddressNormalized !== targetOutputAddress ||
				quoteInputAddressNormalized !== targetInputAddress ||
				quote.side !== targetSide ||
				quotePerAsset === undefined ||
				!Number.isFinite(quotePerAsset) ||
				quotePerAsset <= 0
			) {
				return false;
			}

			// Apply price guard filter (same as getFilteredOrders)
			// For BUY: only accept prices up to 5% above oracle
			// For SELL: only accept prices down to 5% below oracle
			if (orderSide === 'Buy') {
				return quotePerAsset <= maxAcceptablePrice;
			} else {
				return quotePerAsset >= minAcceptablePrice;
			}
		});

		if (relevantQuotes.length === 0) {
			return null;
		}

		// Validate token decimals are defined
		if (typeof assetToken.decimals !== 'number') {
			console.error('Asset token decimals are not defined');
			return null;
		}
		if (!paymentToken || typeof paymentToken.decimals !== 'number') {
			console.error('Payment token or its decimals are not defined');
			return null;
		}

		const sortedQuotes = [...relevantQuotes].sort((a, b) => {
			if (orderSide === 'Buy') {
				return (a.quotePerAsset ?? 0) - (b.quotePerAsset ?? 0);
			} else {
				return (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0);
			}
		});

		return walkOrderbook({
			quotes: sortedQuotes,
			orderSide,
			selectedAmount,
			assetDecimals: assetToken.decimals,
			paymentDecimals: paymentToken.decimals,
			mode: inputMode === 'spend' ? 'spend' : 'receive'
		});
	}

	// Filter orders to remove those >5% from oracle price, return filtered array
	function getFilteredOrders(): Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number;
		inputIOIndex: number;
		outputIOIndex: number;
	}> {
		if (availableOrders.length === 0) return [];

		// Try to get oracle price as reference
		const oracleAddress = assetToken?.address?.toLowerCase();
		const oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
		const oraclePrice = oracleEntry?.price;

		let referencePrice = availableOrders[0].price; // Fallback to best BBO price

		if (oraclePrice && Number.isFinite(oraclePrice) && oraclePrice > 0) {
			referencePrice = oraclePrice;
		}

		// Filter to only orders within price guard of reference price
		// For BUY: want prices up to 5% worse (higher) - price <= maxAcceptablePrice
		// For SELL: want prices down to 5% worse (lower) - price >= minAcceptablePrice
		const maxAcceptablePrice = referencePrice * PRICE_GUARD_MULTIPLIER; // For BUY
		const minAcceptablePrice = referencePrice / PRICE_GUARD_MULTIPLIER; // For SELL

		const filtered = availableOrders.filter((order) => {
			const passes =
				orderSide === 'Buy' ? order.price <= maxAcceptablePrice : order.price >= minAcceptablePrice;
			return passes;
		});

		return filtered;
	}

	const handleMarketOrder = async () => {
		// Check if user is connected
		if (!$connected) {
			promptWalletConnection();
			return;
		}
		// Check if user is registered (access code modal shows automatically after connecting)
		if (!$walletRegistered) {
			promptLogin();
			return;
		}

		if (availableOrders.length === 0 || !orderbook || !selectedAmount) {
			return;
		}

		if (isSubmittingMarketOrder) {
			return;
		}
		isSubmittingMarketOrder = true;
		orderPreparationError = null; // Reset any previous error

		try {
			// Refresh orderbook quotes if stale
			const lastUpdated = $orderbookQuotesQuery?.dataUpdatedAt ?? 0;
			const isStaleQuotes = !lastUpdated || Date.now() - lastUpdated > ORDERBOOK_MAX_STALENESS_MS;
			if (isStaleQuotes) {
				await $orderbookQuotesQuery?.refetch?.();
				await fetchMarketPrice();
				if (priceError) {
					console.error('Price unavailable after refresh');
					// Price error state is already set, user will see the error message
					return;
				}
			}

			// Get filtered orders
			const filteredOrders = getFilteredOrders();
			if (filteredOrders.length === 0) {
				console.error('No orders within slippage tolerance');
				// Set error state so user sees feedback
				priceError = true;
				priceErrorReason = 'no_quotes';
				return;
			}

			// Hydrate order details from Raindex
			const client = await createRaindexClient();
			await Promise.all(
				filteredOrders.map(async (orderInfo) => {
					if (orderInfo.orderData.owner) return;
					try {
						const ordersResult = await client.getOrders(
							[$currentNetwork.id],
							{
								active: true,
								owners: [],
								orderHash: orderInfo.order.orderHash as `0x${string}`
							},
							1
						);

						if (ordersResult.error || !ordersResult.value?.length) {
							console.error('Failed to fetch order:', orderInfo.order.orderHash);
							return;
						}

						const raindexOrderObj = ordersResult.value[0];
						const quotesResult = await raindexOrderObj.getQuotes();
						if (quotesResult.error || !quotesResult.value?.length) return;

						const validQuotes = quotesResult.value.filter(
							(q: RaindexOrderQuote) => q.success && q.data
						);
						if (validQuotes.length === 0) return;

						const sgOrderResult = raindexOrderObj.convertToSgOrder();
						if (sgOrderResult.error || !sgOrderResult.value) return;

						const sgOrder = sgOrderResult.value;
						const decodedOrder = AbiCoder.defaultAbiCoder().decode(
							[OrderV4_ABI],
							sgOrder.orderBytes
						);
						const orderData = normalizeOrderData(decodedOrder[0] as OrderV4);

						orderInfo.order = sgOrder;
						orderInfo.orderData = orderData;
						orderInfo.quotes = validQuotes;
					} catch (orderError) {
						console.error('Error hydrating order', orderInfo.order.orderHash, orderError);
					}
				})
			);

			const executableOrders = filteredOrders.filter((info) => info.orderData?.owner);
			if (!executableOrders.length) {
				console.error('No executable orders available after hydration');
				orderPreparationError = 'Orders temporarily unavailable. Please try again.';
				return;
			}

			// Build TakeOrderConfigs from executable orders
			const takeOrderConfigs: TakeOrderConfigV4[] = [];
			let totalBytecodeSize = 0;
			for (const orderInfo of executableOrders) {
				if (
					!orderInfo.orderData?.validInputs?.length ||
					!orderInfo.orderData?.validOutputs?.length
				) {
					console.warn('Skipping order without IO definitions', orderInfo.order.orderHash);
					continue;
				}

				const inputIndex = orderInfo.inputIOIndex ?? 0;
				const outputIndex = orderInfo.outputIOIndex ?? 0;
				const hasInput = orderInfo.orderData.validInputs[inputIndex];
				const hasOutput = orderInfo.orderData.validOutputs[outputIndex];

				if (!hasInput || !hasOutput) {
					console.warn('Skipping order with mismatched IO indexes', {
						orderHash: orderInfo.order.orderHash,
						inputIndex,
						outputIndex
					});
					continue;
				}

				// Log bytecode size for gas debugging
				const bytecode = orderInfo.orderData.evaluable?.bytecode ?? '';
				const bytecodeSize = typeof bytecode === 'string' ? bytecode.length / 2 : 0; // hex string to bytes
				totalBytecodeSize += bytecodeSize;

				takeOrderConfigs.push({
					order: orderInfo.orderData,
					inputIOIndex: inputIndex.toString(),
					outputIOIndex: outputIndex.toString(),
					signedContext: []
				});
			}

			// Log diagnostic info for gas cost investigation
			console.log('[MarketOrder] Order execution diagnostics:', {
				orderCount: takeOrderConfigs.length,
				totalBytecodeSize: `${totalBytecodeSize} bytes`,
				avgBytecodePerOrder: takeOrderConfigs.length > 0 ? Math.round(totalBytecodeSize / takeOrderConfigs.length) : 0,
				orderHashes: executableOrders.map(o => o.order.orderHash?.slice(0, 10) + '...')
			});

			if (takeOrderConfigs.length === 0) {
				console.error('Unable to build take order configs');
				orderPreparationError = 'Unable to prepare order. Please try again.';
				return;
			}

			const primaryInputIndex = executableOrders[0].inputIOIndex ?? 0;
			const primaryOutputIndex = executableOrders[0].outputIOIndex ?? 0;
			const primaryOrder = executableOrders[0].order;
			const primaryOrderData = executableOrders[0].orderData;

			// Calculate required approval amount for the output token (what we're spending)
			const walkResult = calculateOrderbookWalk();
			if (!walkResult) {
				console.error('Unable to calculate walk result for order execution');
				orderPreparationError = 'Unable to calculate order. Please try again.';
				return;
			}
			const { inputAmountFilled, outputAmountGiven, inputDecimals } = walkResult;

			// Validate that we have all required token data before proceeding
			if (!paymentToken || typeof paymentToken.decimals !== 'number') {
				console.error('Payment token or its decimals are not defined');
				orderPreparationError = 'Token configuration error. Please refresh the page.';
				return;
			}
			if (!assetToken || typeof assetToken.decimals !== 'number') {
				console.error('Asset token or its decimals are not defined');
				orderPreparationError = 'Token configuration error. Please refresh the page.';
				return;
			}

			// We approve what we're giving away (what flows out from us)
			// For BUY: we give USDC (payment token)
			// For SELL: we give tSTOX (asset token)
			let requiredApprovalAmount: bigint;

			if (orderSide === 'Buy') {
				if (inputMode === 'spend') {
					// BUY in spend mode: selectedAmount is the exact payment amount user wants to spend
					// No buffer needed - approve exactly what the user specified
					requiredApprovalAmount = selectedAmount;
				} else {
					// BUY in amount mode: outputAmountGiven comes from walkOrderbook which has rounding
					// Add 0.05% buffer to cover precision loss from price scaling and decimal conversions
					const roundingBuffer = outputAmountGiven / 2000n; // 0.05%
					requiredApprovalAmount = outputAmountGiven + (roundingBuffer > 0n ? roundingBuffer : 1n);
				}
			} else {
				// SELL: selectedAmount is the exact user input, no calculation involved
				// No buffer needed - approve exactly what the user specified
				requiredApprovalAmount = selectedAmount;
			}

			// Calculate maximumInput based on walk result
			// inputAmountFilled is already in native decimals (specified by inputDecimals from walkResult)
			const maximumInputAmount = inputAmountFilled;
			const maximumInputDecimals = inputDecimals;
			const maximumInputFloat = Float.fromFixedDecimalLossy(
				maximumInputAmount,
				maximumInputDecimals
			);

			// Calculate maximumIORatio from the worst (last) fill's original ratio
			// Using the original hex ratio avoids precision loss from price conversions
			// - ASK order ratio = quote/asset (price) - used directly for BUY
			// - BID order ratio = asset/quote (1/price) - used directly for SELL
			// This matches what TakeOrders expects: BUY uses price, SELL uses 1/price
			const worstFill = walkResult.fills[walkResult.fills.length - 1];
			if (!worstFill?.quote?.ratio) {
				console.error('No valid ratio found in worst fill');
				orderPreparationError = 'Unable to calculate order price. Please try again.';
				return;
			}

			// Parse the original hex ratio and apply buffer
			const originalRatioResult = Float.parse(worstFill.quote.ratio);
			if (originalRatioResult.error || !originalRatioResult.value) {
				console.error('Failed to parse original ratio:', worstFill.quote.ratio);
				orderPreparationError = 'Unable to calculate order price. Please try again.';
				return;
			}

			// Apply buffer by multiplying the ratio (makes it more permissive)
			// Float.parse returns the ratio as-is, so we multiply by buffer factor
			const bufferFloat = Float.parse(IO_RATIO_BUFFER.toString());
			if (bufferFloat.error || !bufferFloat.value) {
				console.error('Failed to parse buffer');
				orderPreparationError = 'Unable to calculate order price. Please try again.';
				return;
			}
			const bufferedRatioResult = originalRatioResult.value.mul(bufferFloat.value);
			if (bufferedRatioResult.error || !bufferedRatioResult.value) {
				console.error('Failed to apply buffer to ratio');
				orderPreparationError = 'Unable to calculate order price. Please try again.';
				return;
			}

			const takeOrdersConfig: TakeOrdersConfigV4 = {
				minimumInput: Float.fromBigint(0n).asHex(),
				maximumInput: maximumInputFloat.float.asHex(),
				maximumIORatio: bufferedRatioResult.value.asHex(),
				orders: takeOrderConfigs,
				data: '0x'
			};

			// Taker perspective: What user wants to receive vs what they'll pay
			// takerWants = what user receives (INPUT from order perspective)
			// takerPays = what user gives away (OUTPUT from order perspective)
			const takerWantsInfo = takerInfo
				? {
						address: takerInfo.takerWants.address,
						decimals: takerInfo.takerWants.decimals,
						symbol: takerInfo.takerWants.symbol
					}
				: orderSide === 'Buy'
					? {
							address: assetToken?.address,
							decimals: assetToken?.decimals,
							symbol: assetToken?.symbol
						}
					: {
							address: paymentToken?.address,
							decimals: paymentToken?.decimals,
							symbol: paymentToken?.symbol
						};

			const takerPaysInfo = takerInfo
				? {
						address: takerInfo.takerPays.address,
						decimals: takerInfo.takerPays.decimals,
						symbol: takerInfo.takerPays.symbol
					}
				: orderSide === 'Buy'
					? {
							address: paymentToken?.address,
							decimals: paymentToken?.decimals,
							symbol: paymentToken?.symbol
						}
					: {
							address: assetToken?.address,
							decimals: assetToken?.decimals,
							symbol: assetToken?.symbol
						};

			// Requested amount: what user wants to receive
			// For BUY in amount mode: user requests asset amount (selectedAmount)
			// For BUY in spend mode: user gets asset amount from walkResult (we calculate it)
			// For SELL: user requests payment amount (estimated from walkResult)
			const requestedTakerWantsAmount =
				orderSide === 'Buy'
					? inputMode === 'spend'
						? inputAmountFilled // Calculated asset amount from spend
						: selectedAmount // User-specified asset amount
					: walkResult.inputAmountFilled;

			// For SELL and BUY (spend mode), provide a callback to recalculate config after approval
			// This handles cases where prices move during the approval transaction
			const shouldRecalculate = orderSide === 'Sell' || inputMode === 'spend';
			const recalculateConfig = shouldRecalculate
				? async (): Promise<TakeOrdersConfigV4 | null> => {
						// Refresh orderbook quotes
						await $orderbookQuotesQuery?.refetch?.();

						// Re-walk the orderbook with current prices
						const freshWalkResult = calculateOrderbookWalk();
						if (!freshWalkResult || freshWalkResult.inputAmountFilled === 0n) {
							console.warn('Failed to recalculate orderbook walk after approval');
							return null; // Fall back to original config
						}

						// Recalculate maximumInput with fresh data
						const freshMaximumInputFloat = Float.fromFixedDecimalLossy(
							freshWalkResult.inputAmountFilled,
							freshWalkResult.inputDecimals
						);

						// Get fresh IO ratio from the worst fill's original ratio (avoids precision loss)
						const freshWorstFill = freshWalkResult.fills[freshWalkResult.fills.length - 1];
						if (!freshWorstFill?.quote?.ratio) {
							console.warn('No valid ratio found in fresh worst fill');
							return null;
						}

						const freshRatioResult = Float.parse(freshWorstFill.quote.ratio);
						if (freshRatioResult.error || !freshRatioResult.value) {
							console.warn('Failed to parse fresh ratio');
							return null;
						}

						// Apply buffer
						const freshBufferFloat = Float.parse(IO_RATIO_BUFFER.toString());
						if (freshBufferFloat.error || !freshBufferFloat.value) {
							console.warn('Failed to parse buffer for fresh ratio');
							return null;
						}
						const freshBufferedRatioResult = freshRatioResult.value.mul(freshBufferFloat.value);
						if (freshBufferedRatioResult.error || !freshBufferedRatioResult.value) {
							console.warn('Failed to apply buffer to fresh ratio');
							return null;
						}

						return {
							minimumInput: Float.fromBigint(0n).asHex(),
							maximumInput: freshMaximumInputFloat.float.asHex(),
							maximumIORatio: freshBufferedRatioResult.value.asHex(),
							orders: takeOrderConfigs,
							data: '0x'
						};
					}
				: undefined;

			// Execute transaction with walk result for accurate summary
			await transactionStore.handleTakeOrders(
				takeOrdersConfig,
				primaryOrder,
				requiredApprovalAmount,
				{
					orderData: primaryOrderData,
					ioIndexes: { input: primaryInputIndex, output: primaryOutputIndex },
					takerWantsToken: takerWantsInfo,
					takerPaysToken: takerPaysInfo,
					requestedTakerWantsAmount: requestedTakerWantsAmount,
					simulation: walkResult
				},
				recalculateConfig
			);
		} catch (error) {
			console.error('Market order error:', error);
		} finally {
			isSubmittingMarketOrder = false;
		}
	};
</script>

{#if $currentNetwork && assetToken}
	<div class="space-y-4">
		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<!-- Unified input with integrated toggle and token -->
				<div class="flex items-center rounded-lg border border-white/10 bg-gray-700/50 transition-colors focus-within:border-yellow-500/50">
					<!-- Left side: Buy/Spend or Sell toggle -->
					{#if orderSide === 'Buy'}
						<button
							type="button"
							on:click={() => {
								inputMode = inputMode === 'amount' ? 'spend' : 'amount';
								selectedAmount = 0n;
							}}
							class="flex items-center gap-1.5 border-r border-white/10 px-4 py-3 text-sm font-medium text-green-400 transition-colors hover:bg-gray-600/30"
						>
							{inputMode === 'amount' ? 'Buy' : 'Spend'}
							<svg class="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
							</svg>
						</button>
					{:else}
						<span class="border-r border-white/10 px-4 py-3 text-sm font-medium text-red-400">
							Sell
						</span>
					{/if}

					<!-- Middle: Amount input -->
					<div class="flex-1">
						<TradeAmountInput
							bind:this={tradeAmountInputRef}
							aria-label={inputMode === 'spend' ? 'Spend Amount' : 'Quantity'}
							amountToken={inputMode === 'spend' ? paymentToken : assetToken}
							balanceToken={orderSide === 'Buy' ? paymentToken : assetToken}
							bind:amount={selectedAmount}
							bind:balance={spendingTokenBalance}
							bind:balanceDecimals={spendingTokenBalanceDecimals}
							validate={validateSelectedAmount}
							bind:isError={selectedAmountError}
							showUnit={false}
							showMaxButton={false}
							compact={true}
							noBorder={true}
						/>
					</div>

					<!-- Right side: Token symbol -->
					<span class="border-l border-white/10 px-4 py-3 text-sm font-medium text-gray-300">
						{inputMode === 'spend' ? paymentTokenSymbol : assetToken.symbol}
					</span>
				</div>

				<!-- Balance display -->
				<div class="mt-1.5 text-sm text-gray-400">
					{#if spendingTokenBalanceDecimals !== null}
						{@const balanceFormatted = parseFloat(formatUnits(spendingTokenBalance, spendingTokenBalanceDecimals))}
						{@const balanceRounded = Math.round(balanceFormatted * 1000) / 1000}
						Balance: {balanceRounded.toFixed(3)} {spendingToken?.symbol ?? ''}
					{:else}
						Balance: —
					{/if}
				</div>

				<!-- Percentage buttons -->
				<div class="mt-2 flex gap-2">
					{#each [25, 50, 75, 100] as percent}
						<button
							type="button"
							on:click={() => handlePercentageClick(percent)}
							disabled={percentageButtonsDisabled}
							class="flex-1 rounded border border-white/10 bg-gray-700/50 px-2 py-1 text-xs text-gray-300 transition-colors hover:border-white/20 hover:bg-gray-600/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-gray-700/50"
							title={percentageButtonsDisabled ? 'Price data unavailable' : ''}
						>
							{percent === 100 ? 'Max' : `${percent}%`}
						</button>
					{/each}
				</div>
				{#if percentageButtonsDisabled}
					<p class="mt-1 text-xs text-yellow-400/80">
						Enter amount manually - price data loading
					</p>
				{/if}
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Market Price
					<span class="ml-1 text-xs text-gray-500">(per {assetToken.symbol})</span>
				</div>
				<div class="relative">
					<input
						type="text"
						value={!selectedAmount || selectedAmount === 0n
							? ''
							: isLoadingPrice
								? 'Loading...'
								: priceError
									? 'Price unavailable'
									: `~${marketPrice.toFixed(2)} ${paymentTokenSymbol}`}
						disabled
						class="w-full rounded-md border border-white/10 bg-gray-800/50 px-3 py-2 text-gray-300 placeholder-gray-500 focus:border-yellow-400/50 focus:outline-none focus:ring-1 focus:ring-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-50"
					/>
					{#if isLoadingPrice && selectedAmount > 0n}
						<div class="absolute right-3 top-1/2 -translate-y-1/2">
							<LoadingSpinner size="sm" />
						</div>
					{/if}
				</div>
				{#if selectedAmount && selectedAmount > 0n && !isLoadingPrice && !priceError}
					<p
						class="mt-1 text-xs {isQuoteStale
							? 'text-yellow-400'
							: 'text-gray-500'}"
					>
						{#if isQuoteStale}
							Price may be outdated ({quoteFreshnessSeconds}s ago)
						{:else}
							Updated {quoteFreshnessSeconds}s ago
						{/if}
					</p>
				{/if}
			</div>
		</div>

		<!-- Order summary -->
		<div class={containerStyles.cardBordered}>
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
			<div class="space-y-2 text-sm">
				{#if inputMode === 'spend'}
					<!-- Spend mode: show spending amount first -->
					<div class="flex justify-between">
						<span class="text-gray-400">Spending</span>
						<span class="font-medium">
							{selectedAmount
								? parseFloat(formatUnits(selectedAmount, paymentToken?.decimals ?? 6)).toFixed(2)
								: '0'}
							{paymentTokenSymbol}
						</span>
					</div>
				{:else}
					<!-- Amount mode: show buying/selling amount -->
					<div class="flex justify-between">
						<span class="text-gray-400">{orderSide === 'Buy' ? 'Buying' : 'Selling'}</span>
						<span class="font-medium">
							{selectedAmount
								? parseFloat(formatUnits(selectedAmount, assetToken.decimals)).toFixed(3)
								: '0'}
							{assetToken.symbol}
						</span>
					</div>
				{/if}
				<div class="flex justify-between">
					<span class="text-gray-400">At market price</span>
					<span class="font-medium">
						{isLoadingPrice
							? 'Loading...'
							: priceError
								? 'N/A'
								: `~${marketPrice.toFixed(2)} ${paymentTokenSymbol}`}
					</span>
				</div>
				<div class="mt-2 border-t border-white/10 pt-2">
					<div class="flex justify-between">
						<span class="text-gray-400">{estimatedTradeResult.label || 'Estimated'}</span>
						<span class={`text-lg font-semibold ${summaryAccentClass}`}>
							{isLoadingPrice || priceError ? 'N/A' : estimatedTradeResult.value}
						</span>
					</div>
					{#if insufficientBalanceError}
						<div class="mt-2 text-sm text-red-400">
							Insufficient {spendingToken?.symbol ?? 'token'} balance
						</div>
					{/if}
					{#if insufficientLiquidityWarning && !insufficientBalanceError}
						<div
							class="mt-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-sm text-yellow-300"
						>
							There currently isn't enough liquidity to fully fill this order. Continue to fill as
							much as possible.
						</div>
					{/if}
					{#if priceError && selectedAmount && selectedAmount > 0n}
						<div
							class="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300"
						>
							{#if priceErrorReason === 'no_quotes'}
								No orders available within acceptable price range. Try a limit order instead to set
								your own price.
							{:else if priceErrorReason === 'no_fill'}
								Order amount too large for current liquidity. Try a smaller amount or use a limit
								order.
							{:else}
								Unable to fetch market price. Please try again or use a limit order.
							{/if}
						</div>
					{/if}
					{#if orderPreparationError}
						<div
							class="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300"
						>
							{orderPreparationError}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Market Order Button -->
		<button
			on:click={handleMarketOrder}
			disabled={disableDeploy}
			class={`w-full rounded-md px-4 py-3 text-sm font-semibold transition-all ${
				disableDeploy
					? 'cursor-not-allowed bg-gray-600 text-gray-300 opacity-50'
					: actionButtonClass
			}`}
		>
			{#if isSubmittingMarketOrder}
				<span class="flex items-center justify-center gap-2">
					<LoadingSpinner size="sm" />
					Preparing order...
				</span>
			{:else if disableDeploy}
				{#if isLoadingPrice}
					Loading market price...
				{:else if priceError}
					{#if priceErrorReason === 'no_quotes'}
						No liquidity available
					{:else if priceErrorReason === 'no_fill'}
						Amount exceeds liquidity
					{:else}
						Price unavailable
					{/if}
				{:else if !selectedAmount}
					Enter an amount
				{:else if insufficientBalanceError}
					Insufficient {spendingToken?.symbol ?? 'token'} balance
				{:else}
					Complete all fields
				{/if}
			{:else}
				Place Market Order
			{/if}
		</button>
	</div>
{:else}
	<div class="flex h-32 items-center justify-center">
		<LoadingSpinner size="md" text="Loading..." />
	</div>
{/if}
