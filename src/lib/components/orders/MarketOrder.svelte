<script lang="ts">
	import type { CategorizedToken } from '$lib/config/network';
	import { currentNetwork } from '$lib/stores';
	import {
		type ProcessedQuote,
		walkOrderbook
	} from '$lib/api/orders';
	import { normalizeAddress } from '$lib/utils/tokenMath';
		import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { formatUnits, parseUnits } from 'viem';
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import { walletRegistered, promptWalletConnection, promptLogin } from '$lib/stores/accessStore';
	import { validateSelectedAmount } from '$lib/utils/validation';
	import type { OrderbookQuoteCache } from '$lib/queries/orderbook';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
	import type { CreateQueryResult } from '@tanstack/svelte-query';
	import { executeMarketOrder, filterQuotesForSide, sortQuotesByPrice } from '$lib/services/marketOrderExecution';

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
	let hasAvailableOrders = false;

	$: paymentToken = $currentNetwork?.defaultPaymentToken || $currentNetwork?.paymentTokens?.[0];
	$: paymentTokenSymbol = paymentToken?.symbol ?? 'Quote';

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
				label: 'Est. tokens'
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
				hasAvailableOrders = false;
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
				hasAvailableOrders = fills.length > 0;
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
		hasAvailableOrders = false;
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

	// Get quotes filtered by price guard for execution
	function getQuotesWithPriceGuard(): ProcessedQuote[] {
		if (!assetToken || !paymentToken) return [];

		const allQuotes = $orderbookQuotesQuery?.data?.quotes ?? [];
		const assetAddressNormalized = normalizeAddress(assetToken.address) ?? '';
		const paymentTokenAddressNormalized = normalizeAddress(paymentToken.address) ?? '';

		// Get oracle price for price guard filtering
		const oracleAddr = assetToken?.address?.toLowerCase();
		const oracleEntryData = oracleAddr ? $oracleQuotesQuery?.data?.[oracleAddr] : null;
		const oraclePrice = oracleEntryData?.price;

		// Calculate price guard bounds
		const maxAcceptablePrice =
			oraclePrice && oraclePrice > 0 ? oraclePrice * PRICE_GUARD_MULTIPLIER : Infinity;
		const minAcceptablePrice =
			oraclePrice && oraclePrice > 0 ? oraclePrice / PRICE_GUARD_MULTIPLIER : 0;

		// Filter quotes by side, token pair, and price guard
		const filteredQuotes = filterQuotesForSide(
			allQuotes,
			orderSide,
			assetAddressNormalized,
			paymentTokenAddressNormalized
		).filter((quote) => {
			const quotePerAsset = quote.quotePerAsset ?? 0;
			if (orderSide === 'Buy') {
				return quotePerAsset <= maxAcceptablePrice;
			} else {
				return quotePerAsset >= minAcceptablePrice;
			}
		});

		return sortQuotesByPrice(filteredQuotes, orderSide);
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

		if (!hasAvailableOrders || !selectedAmount) {
			return;
		}

		if (isSubmittingMarketOrder) {
			return;
		}
		isSubmittingMarketOrder = true;
		orderPreparationError = null;

		try {
			// Validate token configuration
			if (!paymentToken || typeof paymentToken.decimals !== 'number') {
				orderPreparationError = 'Token configuration error. Please refresh the page.';
				return;
			}
			if (!assetToken || typeof assetToken.decimals !== 'number') {
				orderPreparationError = 'Token configuration error. Please refresh the page.';
				return;
			}

			// Refresh orderbook quotes if stale
			const lastUpdated = $orderbookQuotesQuery?.dataUpdatedAt ?? 0;
			const isStaleQuotes = !lastUpdated || Date.now() - lastUpdated > ORDERBOOK_MAX_STALENESS_MS;
			if (isStaleQuotes) {
				await $orderbookQuotesQuery?.refetch?.();
				await fetchMarketPrice();
				if (priceError) {
					return;
				}
			}

			// Get filtered quotes with price guard
			const filteredQuotes = getQuotesWithPriceGuard();
			if (filteredQuotes.length === 0) {
				priceError = true;
				priceErrorReason = 'no_quotes';
				return;
			}

			// Execute market order using shared service
			const result = await executeMarketOrder({
				orderSide,
				amount: selectedAmount,
				inputMode,
				assetToken: {
					address: assetToken.address,
					decimals: assetToken.decimals,
					symbol: assetToken.symbol
				},
				paymentToken: {
					address: paymentToken.address,
					decimals: paymentToken.decimals,
					symbol: paymentToken.symbol
				},
				quotes: filteredQuotes,
				network: $currentNetwork,
				refreshQuotes: async () => {
					await $orderbookQuotesQuery?.refetch?.();
					return getQuotesWithPriceGuard();
				}
			});

			if (!result.success && result.error) {
				orderPreparationError = result.error;
			}
		} catch (error) {
			console.error('Market order error:', error);
			orderPreparationError = error instanceof Error ? error.message : 'Unknown error occurred';
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
							class="flex items-center gap-1.5 pl-4 pr-2 py-3 text-sm font-medium text-green-400 transition-colors hover:text-green-300"
						>
							{inputMode === 'amount' ? 'Buy' : 'Spend'}
							<svg class="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
							</svg>
						</button>
					{:else}
						<span class="pl-4 pr-2 py-3 text-sm font-medium text-red-400">
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
					<span class="pl-2 pr-4 py-3 text-sm font-medium text-gray-300">
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
