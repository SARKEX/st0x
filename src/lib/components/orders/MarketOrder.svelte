<script lang="ts">
	import type { CategorizedToken } from '$lib/config/network';
	import { currentNetwork, payFeesInStablecoin } from '$lib/stores';
	import { type ProcessedQuote, walkOrderbook } from '$lib/api/orders';
	import { normalizeAddress } from '$lib/utils/tokenMath';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { formatUnits } from 'viem';
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { isAuthenticated } from '$lib/stores/authStore';
	import { walletRegistered, promptWalletConnection, promptLogin } from '$lib/stores/accessStore';
	import { validateSelectedAmount } from '$lib/utils/validation';
	import type { OrderbookQuoteCache } from '$lib/queries/orderbook';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
	import type { CreateQueryResult } from '@tanstack/svelte-query';
	import {
		executeMarketOrder,
		filterQuotesForSide,
		sortQuotesByPrice
	} from '$lib/services/marketOrderExecution';
	import { isOutsideMarketHours } from '$lib/utils/marketHours';
	import { track } from '$lib/services/analytics';
	import { onMount } from 'svelte';

	// Account Abstraction imports
	import TokenNetworkSelector from '$lib/components/aa/TokenNetworkSelector.svelte';
	import {
		type PaymentToken,
		SUPPORTED_NETWORKS,
		USDC_BASE,
		isRhinestoneConfigured,
		getPriceOracle
	} from '$lib/services/account-abstraction';
	import { aaPaymentStore, isSwapping, swapError } from '$lib/stores/aaPaymentStore';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';

	// Swap quote for cross-chain fee adjustment
	let swapQuote: { inputAmount: bigint; outputAmount: bigint; requiresSwap: boolean } | null = null;
	let isLoadingSwapQuote = false;

	// AA state for Buy orders (source token)
	let selectedSourceToken: PaymentToken | null = USDC_BASE;

	$: isAAEnabled = isRhinestoneConfigured();
	$: needsSwap =
		orderSide === 'Buy' &&
		selectedSourceToken &&
		(selectedSourceToken.chainId !== SUPPORTED_NETWORKS.BASE ||
			selectedSourceToken.symbol !== 'USDC');

	// Fetch swap quote when cross-chain swap is needed
	$: if (needsSwap && selectedAmount && selectedAmount > 0n && marketPrice > 0 && assetToken) {
		fetchSwapQuote();
	} else if (!needsSwap || !selectedAmount || selectedAmount === 0n) {
		swapQuote = null;
	}

	async function fetchSwapQuote() {
		if (!needsSwap || !selectedSourceToken || !selectedAmount || selectedAmount === 0n) {
			swapQuote = null;
			return;
		}

		isLoadingSwapQuote = true;
		try {
			let swapAmount: bigint;
			if (inputMode === 'spend') {
				swapAmount = selectedAmount;
			} else {
				const assetDecimals = assetToken?.decimals ?? 18;
				const sourceDecimals = selectedSourceToken.decimals;
				const outputInTokens = parseFloat(formatUnits(selectedAmount, assetDecimals));
				const estimatedCostUSD = outputInTokens * marketPrice;
				const isStablecoin =
					selectedSourceToken.symbol === 'USDC' || selectedSourceToken.symbol === 'USDT';
				if (isStablecoin) {
					swapAmount = BigInt(Math.ceil(estimatedCostUSD * 1.01 * 10 ** sourceDecimals));
				} else {
					const priceOracle = getPriceOracle();
					const tokenSymbol =
						selectedSourceToken.symbol === 'WETH' ? 'ETH' : selectedSourceToken.symbol;
					const tokenPrices = await priceOracle.getTokenPrices([tokenSymbol]);
					const sourceTokenPriceUSD = tokenPrices.get(tokenSymbol)?.priceUsd ?? 2500;
					const sourceTokenAmount = estimatedCostUSD / sourceTokenPriceUSD;
					swapAmount = BigInt(Math.ceil(sourceTokenAmount * 1.02 * 10 ** sourceDecimals));
				}
			}

			const quote = await aaPaymentStore.getSwapQuote(swapAmount);
			swapQuote = quote;
		} catch {
			swapQuote = null;
		} finally {
			isLoadingSwapQuote = false;
		}
	}

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
	/**
	 * Best bid/ask prices from orderbook (passed from parent)
	 */
	export let buyPrice: number | null = null;
	export let sellPrice: number | null = null;

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

	// Analytics tracking
	let panelOpenTime = Date.now();
	let lastTrackedError: string | null = null;
	let tradeSubmittedSuccessfully = false;

	// Store current tracking state for onDestroy (to avoid stale closure values)
	let trackingState = {
		tokenSymbol: assetToken?.symbol,
		orderSide: orderSide.toLowerCase(),
		amount: '0',
		marketPrice: 0,
		isSubmitting: false,
		currentError: null as string | null
	};

	// Keep tracking state up to date reactively
	$: trackingState = {
		tokenSymbol: assetToken?.symbol,
		orderSide: orderSide.toLowerCase(),
		amount: selectedAmount
			? formatUnits(
					selectedAmount,
					inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
				)
			: '0',
		marketPrice,
		isSubmitting: isSubmittingMarketOrder,
		currentError: insufficientBalanceError
			? 'insufficient_balance'
			: insufficientLiquidityWarning
				? 'insufficient_liquidity'
				: priceError
					? `price_${priceErrorReason}`
					: orderPreparationError
						? 'preparation_error'
						: null
	};

	onMount(() => {
		panelOpenTime = Date.now();
		track('trade_panel_opened', {
			order_type: 'market',
			token_symbol: assetToken?.symbol
		});
	});

	// Track errors when they appear
	$: if (
		insufficientBalanceError &&
		selectedAmount > 0n &&
		lastTrackedError !== 'insufficient_balance'
	) {
		lastTrackedError = 'insufficient_balance';
		track('trade_error_shown', {
			error_type: 'insufficient_balance',
			order_type: 'market',
			token_symbol: assetToken?.symbol,
			entered_amount: selectedAmount
				? formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					)
				: '0',
			balance_available:
				spendingTokenBalanceDecimals !== null
					? formatUnits(spendingTokenBalance, spendingTokenBalanceDecimals)
					: '0'
		});
	}

	$: if (
		insufficientLiquidityWarning &&
		selectedAmount > 0n &&
		lastTrackedError !== 'insufficient_liquidity'
	) {
		lastTrackedError = 'insufficient_liquidity';
		track('trade_error_shown', {
			error_type: 'insufficient_liquidity',
			order_type: 'market',
			token_symbol: assetToken?.symbol,
			entered_amount: selectedAmount
				? formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					)
				: '0',
			available_liquidity: availableLiquidityFormatted
		});
	}

	$: if (priceError && selectedAmount > 0n && lastTrackedError !== `price_${priceErrorReason}`) {
		lastTrackedError = `price_${priceErrorReason}`;
		track('trade_error_shown', {
			error_type: `price_${priceErrorReason}`,
			order_type: 'market',
			token_symbol: assetToken?.symbol,
			entered_amount: selectedAmount
				? formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					)
				: '0'
		});
	}

	// Reset error tracking when amount changes significantly
	$: if (selectedAmount === 0n) {
		lastTrackedError = null;
	}

	// Cleanup interval on component destroy
	import { onDestroy } from 'svelte';
	onDestroy(() => {
		if (quoteFreshnessInterval) clearInterval(quoteFreshnessInterval);

		// Track abandonment if user had entered values but didn't complete trade
		// Use trackingState to get current values (avoids stale closure)
		if (!tradeSubmittedSuccessfully && trackingState.amount !== '0') {
			track('trade_panel_abandoned', {
				order_type: 'market',
				token_symbol: trackingState.tokenSymbol,
				order_side: trackingState.orderSide,
				stage: trackingState.isSubmitting ? 'submitting' : 'ready_to_submit',
				values_entered: {
					amount: trackingState.amount,
					side: trackingState.orderSide
				},
				intended_trade_size_usd: trackingState.marketPrice
					? parseFloat(trackingState.amount) * trackingState.marketPrice
					: null,
				time_spent_ms: Date.now() - panelOpenTime,
				last_error: trackingState.currentError
			});
		}
	});

	$: isQuoteStale = quoteFreshnessSeconds > ORDERBOOK_MAX_STALENESS_MS / 1000;

	// State for market price and quantity
	let marketPrice: number = 0; // Human-readable price (quote per asset)
	let selectedAmount: bigint = 0n; // Quantity to acquire from order outputs (in output token decimals)
	let isLoadingPrice = true;
	let priceError = false;
	let priceErrorReason: 'no_quotes' | 'no_fill' | 'error' | null = null;
	let orderPreparationError: string | null = null;

	// Best orderbook price based on order side (from parent props)
	// Buy: use sellPrice (best ask - what you pay when buying)
	// Sell: use buyPrice (best bid - what you get when selling)
	$: bestOrderbookPrice = orderSide === 'Buy' ? sellPrice : buyPrice;

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
	// For Buy orders, use selectedSourceToken if available (USDT/WETH), otherwise default to paymentToken
	$: spendingToken = orderSide === 'Buy' ? selectedSourceToken || paymentToken : assetToken;

	// Check if oracle price is available (used for price guards)
	$: oracleAddress = assetToken?.address?.toLowerCase();
	$: oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
	$: _oraclePriceAvailable = oracleEntry?.price && oracleEntry.price > 0;
	// Percentage buttons need market price for BUY in 'amount' mode (to convert payment to asset amount)
	// In 'spend' mode, no conversion needed - direct percentage of balance
	$: percentageButtonsDisabled =
		orderSide === 'Buy' &&
		inputMode === 'amount' &&
		(!marketPrice || marketPrice <= 0) &&
		spendingTokenBalance > 0n;

	// Calculate the amount being spent and check against balance
	$: {
		if (!selectedAmount || selectedAmount === 0n || !marketPrice || isLoadingPrice) {
			insufficientBalanceError = false;
		} else if (orderSide === 'Sell') {
			// For SELL: user is spending the asset token
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else if (inputMode === 'spend') {
			// For BUY in spend mode: selectedAmount is the exact payment amount
			// When cross-chain swap is active, compare against source chain balance directly
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else {
			// For BUY in amount mode: user is spending the payment token (USDC)
			// When cross-chain swap is active and we have a quote, use the swap inputAmount
			if (needsSwap && swapQuote && swapQuote.requiresSwap) {
				insufficientBalanceError = swapQuote.inputAmount > spendingTokenBalance;
			} else {
				// Calculate the estimated cost using floor to avoid false "insufficient balance" errors
				// when clicking MAX button (precision errors from float conversion)
				const assetDecimals = assetToken?.decimals ?? 18;
				const paymentDecimals = paymentToken?.decimals ?? 6;
				const outputInTokens = parseFloat(formatUnits(selectedAmount, assetDecimals));
				const estimatedCost = outputInTokens * marketPrice;
				// Use floor instead of ceil to prevent rounding up beyond actual balance
				const estimatedCostBigInt = BigInt(Math.floor(estimatedCost * 10 ** paymentDecimals));
				insufficientBalanceError = estimatedCostBigInt > spendingTokenBalance;
			}
		}
	}

	// Liquidity warning: check if there's enough liquidity within price guard
	let insufficientLiquidityWarning: boolean = false;
	let availableLiquidityFormatted: string = '0';

	// Calculate available liquidity within price guard
	$: {
		if (!selectedAmount || selectedAmount === 0n || !assetToken) {
			insufficientLiquidityWarning = false;
			availableLiquidityFormatted = '0';
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
						// Format available amount for display
						const availableFloat = parseFloat(
							formatUnits(availablePaymentCapacity, paymentDecimals)
						);
						availableLiquidityFormatted = `${availableFloat.toFixed(2)} ${
							paymentToken?.symbol ?? 'USDC'
						}`;
					} else {
						// In amount mode, selectedAmount is asset amount
						// For BUY: inputAmountFilled is asset amount, For SELL: outputAmountGiven is asset amount
						const availableAssetAmount =
							orderSide === 'Buy' ? walkResult.inputAmountFilled : walkResult.outputAmountGiven;
						insufficientLiquidityWarning = selectedAmount > availableAssetAmount;
						// Format available amount for display
						const availableFloat = parseFloat(formatUnits(availableAssetAmount, assetDecimals));
						availableLiquidityFormatted = `${availableFloat.toFixed(4)} ${
							assetToken?.symbol ?? 'tokens'
						}`;
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
			// When cross-chain swap is active, use outputAmount (USDC arriving on Base after fees)
			if (needsSwap && swapQuote && swapQuote.requiresSwap) {
				const effectiveUSDC = parseFloat(formatUnits(swapQuote.outputAmount, 6));
				const tokensReceived = effectiveUSDC / marketPrice;
				return {
					value: `~${tokensReceived.toFixed(4)} ${assetToken?.symbol ?? 'tokens'}`,
					label: 'Est. tokens (after swap fees)'
				};
			}
			const spendInTokens = parseFloat(formatUnits(selectedAmount, paymentToken?.decimals || 6));
			const tokensReceived = spendInTokens / marketPrice;
			return {
				value: `~${tokensReceived.toFixed(4)} ${assetToken?.symbol ?? 'tokens'}`,
				label: 'Est. tokens'
			};
		} else {
			// Amount mode: show estimated cost
			// When cross-chain swap is active, show the source token amount (inputAmount) the user pays
			if (needsSwap && swapQuote && swapQuote.requiresSwap && selectedSourceToken) {
				const sourceAmount = parseFloat(
					formatUnits(swapQuote.inputAmount, selectedSourceToken.decimals)
				);
				return {
					value: `~${sourceAmount.toFixed(2)} ${selectedSourceToken.symbol}`,
					label: 'Est. cost (incl. swap fees)'
				};
			}
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
	// Small safety buffer (0.1%) for Max to handle rounding and minor price fluctuations
	const MAX_SAFETY_BUFFER = 0.999;

	const handlePercentageClick = async (percent: number) => {
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
			// For BUY in amount mode: balance is in payment token, need to convert to asset amount
			// Use marketPrice (from orderbook) since that's what execution uses
			if (!marketPrice || marketPrice <= 0) {
				// Fall back: can't convert without price - just don't set anything
				return;
			}

			const paymentDecimals = spendingTokenBalanceDecimals;
			const assetDecimals = assetToken?.decimals ?? 18;

			// Calculate payment amount to spend (percent of balance)
			// Apply small safety buffer for Max to handle rounding edge cases
			let paymentToSpend = (spendingTokenBalance * BigInt(percent)) / 100n;
			if (percent === 100) {
				const paymentFloat = parseFloat(formatUnits(paymentToSpend, paymentDecimals));
				paymentToSpend = BigInt(
					Math.floor(paymentFloat * MAX_SAFETY_BUFFER * 10 ** paymentDecimals)
				);
			}
			const paymentInFloat = parseFloat(formatUnits(paymentToSpend, paymentDecimals));

			// For non-stablecoin spending tokens (WETH), convert to USD value first
			let paymentValueInUSD = paymentInFloat;
			const isNonStablecoin =
				selectedSourceToken &&
				selectedSourceToken.symbol !== 'USDC' &&
				selectedSourceToken.symbol !== 'USDT';
			if (isNonStablecoin) {
				const priceOracle = getPriceOracle();
				const tokenSymbol =
					selectedSourceToken.symbol === 'WETH' ? 'ETH' : selectedSourceToken.symbol;
				const tokenPrices = await priceOracle.getTokenPrices([tokenSymbol]);
				const tokenPriceUSD = tokenPrices.get(tokenSymbol)?.priceUsd ?? 2500;
				paymentValueInUSD = paymentInFloat * tokenPriceUSD;
			}

			// Convert USD value to asset amount using market price (same price source as execution)
			const assetAmount = paymentValueInUSD / marketPrice;
			const assetAmountScaled = Math.floor(assetAmount * 10 ** assetDecimals);
			tradeAmountInputRef.setAmountValue(BigInt(assetAmountScaled));
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
		// Track button click
		track('trade_button_clicked', {
			order_type: 'market',
			token_symbol: assetToken?.symbol,
			order_side: orderSide.toLowerCase(),
			amount: selectedAmount
				? formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					)
				: '0',
			is_authenticated: $isAuthenticated,
			pay_with_stables: $payFeesInStablecoin,
			cross_chain_swap: needsSwap,
			source_token: selectedSourceToken?.symbol,
			source_chain_id: selectedSourceToken?.chainId
		});

		// Check if user is connected
		if (!$isAuthenticated) {
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

			// For BUY orders: Check if cross-chain swap is needed
			// If user selected a non-USDC token or different chain, swap to USDC on Base first
			let effectiveAmount = selectedAmount;
			if (orderSide === 'Buy' && needsSwap && selectedSourceToken) {
				// Calculate the amount to swap based on input mode
				let swapAmount: bigint;
				if (inputMode === 'spend') {
					// In spend mode, selectedAmount is already the payment amount in source token units
					swapAmount = selectedAmount;
				} else {
					// In amount mode, calculate the payment amount from market price
					const assetDecimals = assetToken.decimals;
					const sourceDecimals = selectedSourceToken.decimals;
					const outputInTokens = parseFloat(formatUnits(selectedAmount, assetDecimals));
					// estimatedCostUSD is the cost in USD terms
					const estimatedCostUSD = outputInTokens * marketPrice;

					// For stablecoins (USDC, USDT), 1 token ≈ $1
					// For non-stablecoins (WETH), we need to convert using the token's price
					const isStablecoin =
						selectedSourceToken.symbol === 'USDC' || selectedSourceToken.symbol === 'USDT';

					if (isStablecoin) {
						// Add 1% buffer for price movement during swap
						swapAmount = BigInt(Math.ceil(estimatedCostUSD * 1.01 * 10 ** sourceDecimals));
					} else {
						// Get the source token's price in USD (e.g., ETH price)
						const priceOracle = getPriceOracle();
						const tokenSymbol =
							selectedSourceToken.symbol === 'WETH' ? 'ETH' : selectedSourceToken.symbol;
						const tokenPrice = await priceOracle.getTokenPrices([tokenSymbol]);
						const sourceTokenPriceUSD = tokenPrice.get(tokenSymbol)?.priceUsd ?? 2500; // Default ETH price

						// Convert USD cost to source token amount
						// sourceTokenAmount = estimatedCostUSD / sourceTokenPriceUSD
						const sourceTokenAmount = estimatedCostUSD / sourceTokenPriceUSD;
						// Add 2% buffer for price movement and precision during swap
						swapAmount = BigInt(Math.ceil(sourceTokenAmount * 1.02 * 10 ** sourceDecimals));
					}
				}

				// Execute the cross-chain swap
				const swapResult = await aaPaymentStore.executeSwapIfNeeded(
					swapAmount,
					$payFeesInStablecoin
				);
				if (swapResult === null) {
					track('cross_chain_swap_failed', {
						order_type: 'market',
						token_symbol: assetToken?.symbol,
						source_token: selectedSourceToken.symbol,
						source_chain_id: selectedSourceToken.chainId,
						pay_with_stables: $payFeesInStablecoin
					});
					orderPreparationError = $swapError || 'Cross-chain swap failed';
					return;
				}
				track('cross_chain_swap_executed', {
					order_type: 'market',
					token_symbol: assetToken?.symbol,
					source_token: selectedSourceToken.symbol,
					source_chain_id: selectedSourceToken.chainId,
					pay_with_stables: $payFeesInStablecoin
				});

				// Use the USDC amount received from the swap
				// For amount mode, keep selectedAmount (asset quantity) unchanged
				// For spend mode, update to the USDC amount received
				if (inputMode === 'spend') {
					effectiveAmount = swapResult;
				}
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
			// After swap (if any), we now have USDC on Base, so use the network's payment token
			const result = await executeMarketOrder({
				orderSide,
				amount: inputMode === 'spend' ? effectiveAmount : selectedAmount,
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
				track('trade_failed', {
					order_type: 'market',
					token_symbol: assetToken?.symbol,
					order_side: orderSide.toLowerCase(),
					error_message: result.error
				});
			} else if (result.success) {
				tradeSubmittedSuccessfully = true;
				track('trade_initiated', {
					order_type: 'market',
					token_symbol: assetToken?.symbol,
					order_side: orderSide.toLowerCase(),
					amount: formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					),
					avg_price: marketPrice,
					pay_with_stables: $payFeesInStablecoin,
					cross_chain_swap: needsSwap,
					source_token: selectedSourceToken?.symbol,
					source_chain_id: selectedSourceToken?.chainId
				});
			}
		} catch (error) {
			console.error('Market order error:', error);
			orderPreparationError = error instanceof Error ? error.message : 'Unknown error occurred';
			track('trade_failed', {
				order_type: 'market',
				token_symbol: assetToken?.symbol,
				order_side: orderSide.toLowerCase(),
				error_message: orderPreparationError
			});
		} finally {
			isSubmittingMarketOrder = false;
			aaPaymentStore.clearError();
		}
	};
</script>

{#if $currentNetwork && assetToken}
	<div class="space-y-4">
		<!-- Cross-chain payment selector (Buy orders only) -->
		{#if orderSide === 'Buy' && isAAEnabled}
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Pay with</div>
				<TokenNetworkSelector
					bind:selectedToken={selectedSourceToken}
					disabled={isSubmittingMarketOrder || $isSwapping}
				/>
				{#if $isSwapping}
					<div class="mt-2 flex items-center gap-2 text-sm text-yellow-400">
						<LoadingSpinner size="sm" />
						Swapping to USDC on Base...
					</div>
				{/if}
			</div>
		{/if}

		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<!-- Unified input with integrated toggle and token -->
				<div
					class="flex items-center rounded-lg border border-white/10 bg-gray-700/50 transition-colors focus-within:border-yellow-500/50"
				>
					<!-- Left side: Buy/Spend or Sell toggle -->
					{#if orderSide === 'Buy'}
						<button
							type="button"
							on:click={() => {
								inputMode = inputMode === 'amount' ? 'spend' : 'amount';
								selectedAmount = 0n;
							}}
							class="flex items-center gap-1.5 py-3 pl-4 pr-2 text-sm font-medium text-green-400 transition-colors hover:text-green-300"
						>
							{inputMode === 'amount' ? 'Buy' : 'Spend'}
							<svg class="h-3 w-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M8 9l4-4 4 4m0 6l-4 4-4-4"
								/>
							</svg>
						</button>
					{:else}
						<span class="py-3 pl-4 pr-2 text-sm font-medium text-red-400"> Sell </span>
					{/if}

					<!-- Middle: Amount input -->
					<div class="flex-1">
						<TradeAmountInput
							bind:this={tradeAmountInputRef}
							aria-label={inputMode === 'spend' ? 'Spend Amount' : 'Quantity'}
							amountToken={inputMode === 'spend' ? selectedSourceToken || paymentToken : assetToken}
							balanceToken={orderSide === 'Buy' ? selectedSourceToken || paymentToken : assetToken}
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
					<span class="py-3 pl-2 pr-4 text-sm font-medium text-gray-300">
						{inputMode === 'spend' ? paymentTokenSymbol : assetToken.symbol}
					</span>
				</div>

				<!-- Balance display -->
				<div class="mt-1.5 text-sm text-gray-400">
					{#if spendingTokenBalanceDecimals !== null}
						{@const balanceFormatted = parseFloat(
							formatUnits(spendingTokenBalance, spendingTokenBalanceDecimals)
						)}
						{@const balanceRounded = Math.round(balanceFormatted * 1000) / 1000}
						Balance: {balanceRounded.toFixed(3)}
						{spendingToken?.symbol ?? ''}
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
					<p class="mt-1 text-xs text-yellow-400/80">Enter amount manually - price data loading</p>
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
							? bestOrderbookPrice !== null
								? `~${bestOrderbookPrice.toFixed(2)} ${paymentTokenSymbol}`
								: 'No quotes available'
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
					<p class="mt-1 text-xs {isQuoteStale ? 'text-yellow-400' : 'text-gray-500'}">
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
					<span class="text-gray-400">
						{#if !selectedAmount || selectedAmount === 0n}
							{orderSide === 'Buy' ? 'Best ask' : 'Best bid'}
						{:else}
							Avg. price
						{/if}
					</span>
					<span class="font-medium">
						{#if !selectedAmount || selectedAmount === 0n}
							{bestOrderbookPrice !== null
								? `~${bestOrderbookPrice.toFixed(2)} ${paymentTokenSymbol}`
								: 'N/A'}
						{:else if isLoadingPrice}
							Loading...
						{:else if priceError}
							N/A
						{:else}
							~{marketPrice.toFixed(2)} {paymentTokenSymbol}
						{/if}
					</span>
				</div>
				<div class="mt-2 border-t border-white/10 pt-2">
					<div class="flex justify-between">
						<span class="text-gray-400">{estimatedTradeResult.label || 'Estimated'}</span>
						<span class={`text-lg font-semibold ${summaryAccentClass}`}>
							{isLoadingPrice || priceError
								? 'N/A'
								: isLoadingSwapQuote
									? 'Loading...'
									: estimatedTradeResult.value}
						</span>
					</div>
					{#if needsSwap && swapQuote && swapQuote.requiresSwap && !isLoadingPrice && !priceError}
						<div class="mt-1 flex justify-between text-xs text-gray-500">
							<span>USDC after swap</span>
							<span>
								~{parseFloat(formatUnits(swapQuote.outputAmount, 6)).toFixed(2)} USDC
							</span>
						</div>
					{/if}
					{#if insufficientBalanceError}
						<div class="mt-2 text-sm text-red-400">
							Insufficient {spendingToken?.symbol ?? 'token'} balance
						</div>
					{/if}
					{#if insufficientLiquidityWarning && !insufficientBalanceError}
						<div
							class="mt-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-sm text-yellow-300"
						>
							There currently isn't enough orderbook liquidity to fully fill this order. Continue to
							fill approx. {availableLiquidityFormatted}.
							{#if isOutsideMarketHours()}
								<br /><br />This might be because US markets are currently closed.
							{/if}
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

		<!-- Pay fees in stablecoin option -->
		<label
			class="flex cursor-pointer items-center gap-2 py-2"
			title={orderSide === 'Buy'
				? 'Pay gas fees using the stablecoin you selected above instead of ETH'
				: 'Pay gas fees using USDC on Base instead of ETH'}
		>
			<input
				type="checkbox"
				checked={$payFeesInStablecoin}
				on:change={() => payFeesInStablecoin.toggle()}
				class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
			/>
			<span class="text-sm text-gray-300">Pay fees in stablecoin</span>
			<span class="group relative">
				<svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span
					class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded bg-gray-900 px-3 py-2 text-xs text-gray-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
				>
					{#if orderSide === 'Buy'}
						Pay gas fees using the stablecoin/network you selected to buy with (e.g., USDC or USDT
						on various networks). No ETH required.
					{:else}
						Pay gas fees using USDC on Base (your settlement token). No ETH required.
					{/if}
				</span>
			</span>
		</label>

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
