<script lang="ts">
	import type { CategorizedToken } from '$lib/config/network';
	import { currentNetwork } from '$lib/stores';
	import { type ProcessedQuote, walkOrderbook } from '$lib/api/orders';
	import {
		getMakerInputTokenAddress,
		getMakerOutputTokenAddress
	} from '$lib/types/orderPerspective';
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
		DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
		MAX_SLIPPAGE_BPS,
		executeMarketOrder,
		filterQuotesForSide,
		sortQuotesByPrice
	} from '$lib/services/marketOrderExecution';
	import { isOutsideMarketHours } from '$lib/utils/marketHours';
	import { track } from '$lib/services/analytics';
	import {
		trackTradeEvent,
		type ErrorClass
	} from '$lib/services/observability/tradeEvents';
	import { mintTradeId, clearTradeId } from '$lib/services/observability/tradeId';
	import { onMount } from 'svelte';

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
	/**
	 * Best bid/ask prices from orderbook (passed from parent)
	 */
	export let buyPrice: number | null = null;
	export let sellPrice: number | null = null;

	const ORDERBOOK_MAX_STALENESS_MS = 20_000; // 20 seconds
	const PRICE_GUARD_MULTIPLIER = 1.05; // 5% price tolerance for slippage and liquidity checks
	const HIGH_SLIPPAGE_WARNING_BPS = 500; // 5% — warn above this
	let slippageBps = DEFAULT_MARKET_ORDER_SLIPPAGE_BPS;
	let slippageInputValue = String(slippageBps / 100);
	let showHighSlippageWarning = false;
	let pendingHighSlippageBps: number | null = null;

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

	// TRADE-03 D-05 (Plan 02-06): detect terminal-state failure from the pre-flight
	// + auto-retry cascade. The user-facing error string carrying the D-05 copy is
	// returned by `executeMarketOrder()` and stored locally in `orderPreparationError`
	// (see handleMarketOrder below). When the cascade exhausts (auto_retry_exhausted
	// or preflight_order_vanished), the inline block below renders without a form
	// reset or toast — user input stays intact. (See `marketOrderExecution.ts` for
	// the failWith() user-facing copy that lands here.)
	$: noLiquidityError = (orderPreparationError ?? '').includes('No liquidity available right now');

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
	$: spendingToken = orderSide === 'Buy' ? paymentToken : assetToken;

	// Check if oracle price is available (needed for BUY percentage calculations)
	$: oracleAddress = assetToken?.address?.toLowerCase();
	$: oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
	$: oraclePriceAvailable = oracleEntry?.price && oracleEntry.price > 0;
	// Percentage buttons need oracle price for BUY in 'amount' mode (to convert payment to asset amount)
	// In 'spend' mode, no conversion needed - direct percentage of balance
	$: percentageButtonsDisabled =
		orderSide === 'Buy' &&
		inputMode === 'amount' &&
		!oraclePriceAvailable &&
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
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else {
			// For BUY in amount mode: user is spending the payment token (USDC)
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

	// D-09 error-class taxonomy (compound testid for TEST-08 assertions):
	//   - slippage             ← ratio-cap math reject (slippage_cap reason in failWith transcript)
	//   - no_liquidity         ← OBS-03 no_quotes_available / preflight_order_vanished cascade
	//   - stale_oracle         ← OBS-03 preflight_chain_unreachable / pyth-staleness
	//   - insufficient_balance ← wallet/approval failure (selected amount > balance)
	//   - market_closed        ← marketHours.isOutsideMarketHours()
	// Order is precedence-significant: highest-priority class wins when multiple are
	// active (e.g. insufficient_balance trumps no_liquidity to surface the actionable
	// error first). Returns null when no error is active.
	$: errorClass = (() => {
		if (insufficientBalanceError) return 'insufficient_balance';
		if (noLiquidityError) return 'no_liquidity';
		const prepErr = (orderPreparationError ?? '').toLowerCase();
		if (prepErr.includes('slippage') || prepErr.includes('ratio')) return 'slippage';
		if (
			prepErr.includes('stale') ||
			prepErr.includes('oracle') ||
			prepErr.includes('chain_unreachable')
		)
			return 'stale_oracle';
		if (prepErr.includes('market') && prepErr.includes('closed')) return 'market_closed';
		if (isOutsideMarketHours() && orderPreparationError) return 'market_closed';
		if (priceError && (priceErrorReason === 'no_quotes' || priceErrorReason === 'no_fill'))
			return 'no_liquidity';
		if (orderPreparationError) return 'slippage'; // fallback for generic prep errors
		return null;
	})();

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
				const quoteOutputAddressNormalized = normalizeAddress(getMakerOutputTokenAddress(quote));
				const quoteInputAddressNormalized = normalizeAddress(getMakerInputTokenAddress(quote));
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
	// Small safety buffer (0.1%) for Max to handle rounding and minor price fluctuations
	const MAX_SAFETY_BUFFER = 0.999;

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
			// Use actual market prices by walking the orderbook in spend mode
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

			// Walk the orderbook in spend mode to get the exact asset amount at market prices
			const assetAmount = calculateAssetAmountForSpend(
				paymentToSpend,
				assetDecimals,
				paymentDecimals
			);

			if (assetAmount && assetAmount > 0n) {
				tradeAmountInputRef.setAmountValue(assetAmount);
			} else {
				// Fall back to oracle price if orderbook walk fails
				const oracleAddr = assetToken?.address?.toLowerCase();
				const oracleEntryData = oracleAddr ? $oracleQuotesQuery?.data?.[oracleAddr] : null;
				const oraclePrice = oracleEntryData?.price;

				if (!oraclePrice || oraclePrice <= 0) return;

				const paymentInFloat = parseFloat(formatUnits(paymentToSpend, paymentDecimals));
				const assetAmountFloat = paymentInFloat / oraclePrice;
				const assetAmountScaled = Math.floor(assetAmountFloat * 10 ** assetDecimals);
				tradeAmountInputRef.setAmountValue(BigInt(assetAmountScaled));
			}
		}
	};

	function applySlippage(bps: number) {
		slippageBps = bps;
		slippageInputValue = String(bps / 100);
	}

	function handleSlippageInput(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) return;
		slippageInputValue = target.value;
	}

	function handleSlippageCommit() {
		const pct = parseFloat(slippageInputValue);
		if (!Number.isFinite(pct) || pct <= 0) {
			// Reset to current value on invalid input
			slippageInputValue = String(slippageBps / 100);
			return;
		}
		const maxPct = MAX_SLIPPAGE_BPS / 100;
		const clampedPct = Math.min(pct, maxPct);
		const bps = Math.round(clampedPct * 100);
		if (pct > maxPct) {
			slippageInputValue = String(maxPct);
		}
		if (bps > HIGH_SLIPPAGE_WARNING_BPS) {
			pendingHighSlippageBps = bps;
			showHighSlippageWarning = true;
		} else {
			applySlippage(bps);
		}
	}

	function confirmHighSlippage() {
		if (pendingHighSlippageBps !== null) {
			applySlippage(pendingHighSlippageBps);
		}
		pendingHighSlippageBps = null;
		showHighSlippageWarning = false;
	}

	function cancelHighSlippage() {
		// Reset input to current applied value
		slippageInputValue = String(slippageBps / 100);
		pendingHighSlippageBps = null;
		showHighSlippageWarning = false;
	}

	// Calculate how much asset can be bought for a given payment amount using actual orderbook prices
	function calculateAssetAmountForSpend(
		paymentAmount: bigint,
		assetDecimals: number,
		paymentDecimals: number
	): bigint | null {
		if (!assetToken || !paymentToken) return null;

		const allQuotes = $orderbookQuotesQuery?.data?.quotes ?? [];
		const assetAddressNormalized = normalizeAddress(assetToken.address);
		const paymentTokenAddressNormalized = normalizeAddress(
			paymentToken.address?.toLowerCase() || ''
		);

		// Get oracle price for price guard filtering
		const oracleAddr = assetToken?.address?.toLowerCase();
		const oracleEntryData = oracleAddr ? $oracleQuotesQuery?.data?.[oracleAddr] : null;
		const oraclePrice = oracleEntryData?.price;

		// Calculate price guard bounds
		const maxAcceptablePrice =
			oraclePrice && oraclePrice > 0 ? oraclePrice * PRICE_GUARD_MULTIPLIER : Infinity;

		// Filter quotes for BUY side with price guard
		const relevantQuotes = allQuotes.filter((quote: ProcessedQuote) => {
			const quoteOutputAddressNormalized = normalizeAddress(getMakerOutputTokenAddress(quote));
			const quoteInputAddressNormalized = normalizeAddress(getMakerInputTokenAddress(quote));
			const quotePerAsset = quote.quotePerAsset;

			return (
				quoteOutputAddressNormalized === assetAddressNormalized &&
				quoteInputAddressNormalized === paymentTokenAddressNormalized &&
				quote.side === 'ask' &&
				quotePerAsset !== undefined &&
				Number.isFinite(quotePerAsset) &&
				quotePerAsset > 0 &&
				quotePerAsset <= maxAcceptablePrice
			);
		});

		if (relevantQuotes.length === 0) return null;

		// Sort by price (best first for BUY)
		const sortedQuotes = [...relevantQuotes].sort(
			(a, b) => (a.quotePerAsset ?? 0) - (b.quotePerAsset ?? 0)
		);

		// Walk orderbook in spend mode to get asset amount for the payment
		const walkResult = walkOrderbook({
			quotes: sortedQuotes,
			orderSide: 'Buy',
			selectedAmount: paymentAmount,
			assetDecimals,
			paymentDecimals,
			mode: 'spend'
		});

		// Return the asset amount that would be received
		return walkResult.inputAmountFilled;
	}

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
			const quoteOutputAddressNormalized = normalizeAddress(getMakerOutputTokenAddress(quote));
			const quoteInputAddressNormalized = normalizeAddress(getMakerInputTokenAddress(quote));
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

	// OBS-07/OBS-09 (Plan 02-03): map raw error → ErrorClass for trade_failed events.
	// Inline (per CLAUDE.md "avoid over-engineering" — duplicated once in LimitOrder /
	// DcaOrder; extract to shared module at three call sites).
	function classifyMarketError(err: unknown): ErrorClass {
		const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
		if (msg.includes('slippage')) return 'slippage_exceeded';
		if (msg.includes('liquidity') || msg.includes('no_walk_fills') || msg.includes('no_quotes'))
			return 'no_liquidity';
		if (msg.includes('stale') || msg.includes('oracle')) return 'stale_oracle';
		if (msg.includes('insufficient') || msg.includes('balance')) return 'insufficient_balance';
		if (msg.includes('market') && msg.includes('closed')) return 'market_closed';
		if (msg.includes('user reject') || msg.includes('user denied') || msg.includes('rejected'))
			return 'user_rejected';
		if (msg.includes('rpc') || msg.includes('network')) return 'rpc_error';
		return 'unknown';
	}

	const handleMarketOrder = async () => {
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

		// Mint AFTER early-return guards so unauthenticated/idle clicks do not pollute
		// the funnel; clear in `finally` (Pitfall 2 — T-2-E mitigation).
		mintTradeId();
		try {
			trackTradeEvent('trade_button_clicked', {
				order_type: 'market',
				order_side: orderSide.toLowerCase() as 'buy' | 'sell',
				asset_symbol: assetToken?.symbol,
				payment_symbol: paymentToken?.symbol,
				amount: selectedAmount
					? formatUnits(
							selectedAmount,
							inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
						)
					: '0',
				slippage_bps: slippageBps,
				mode: inputMode === 'spend' ? 'spendUpTo' : 'buyUpTo'
			});
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

			// OBS-07 funnel step: post-walk, pre-execute. Once we have at least one
			// price-guard-passing quote we count `quote_received` as fired.
			trackTradeEvent('quote_received', {
				order_type: 'market',
				order_side: orderSide.toLowerCase() as 'buy' | 'sell',
				asset_symbol: assetToken?.symbol,
				payment_symbol: paymentToken?.symbol,
				amount: formatUnits(
					selectedAmount,
					inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
				),
				quote_count: filteredQuotes.length,
				slippage_bps: slippageBps
			});

			// Execute market order using shared service.
			// `broadcast` and `confirmed` step events are emitted from
			// `marketOrderExecution.ts` at SDK callback boundaries (Task 1b).
			const result = await executeMarketOrder({
				orderSide,
				amount: selectedAmount,
				inputMode,
				slippageBps,
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
				network: $currentNetwork
			});

			if (!result.success && result.error) {
				orderPreparationError = result.error;
				trackTradeEvent('trade_failed', {
					order_type: 'market',
					order_side: orderSide.toLowerCase() as 'buy' | 'sell',
					asset_symbol: assetToken?.symbol,
					error_class: classifyMarketError(new Error(result.error)),
					error_message: result.error
				});
			} else if (result.success) {
				tradeSubmittedSuccessfully = true;
				trackTradeEvent('trade_initiated', {
					order_type: 'market',
					order_side: orderSide.toLowerCase() as 'buy' | 'sell',
					asset_symbol: assetToken?.symbol,
					payment_symbol: paymentToken?.symbol,
					amount: formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					),
					avg_price: marketPrice
				});
			}
		} catch (error) {
			console.error('Market order error:', error);
			orderPreparationError = error instanceof Error ? error.message : 'Unknown error occurred';
			trackTradeEvent('trade_failed', {
				order_type: 'market',
				order_side: orderSide.toLowerCase() as 'buy' | 'sell',
				asset_symbol: assetToken?.symbol,
				error_class: classifyMarketError(error),
				error_message: orderPreparationError
			});
		} finally {
			isSubmittingMarketOrder = false;
			// CRITICAL: Pitfall 2 (T-2-E) — clear module state so the next submit click
			// gets a fresh trade_id. Always runs, including on early-return success paths.
			clearTradeId();
		}
	};
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape' && showHighSlippageWarning) cancelHighSlippage(); }} />

{#if $currentNetwork && assetToken}
	<div
		data-testid="market-form"
		data-mode="market"
		data-side={orderSide.toLowerCase()}
	>
	<div
		class="space-y-4"
		data-testid="market-form-loaded"
		data-mode="market"
		data-side={orderSide.toLowerCase()}
	>
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
					<!-- D-09 testid: spend-input when inputMode is 'spend' (payment amount),
					     asset-input when inputMode is 'amount' (asset quantity). The same
					     TradeAmountInput renders both; the testid follows the mode so E2E can
					     compose `[data-testid="asset-input"]` for asset-anchored entry and
					     `[data-testid="spend-input"]` for payment-anchored entry. -->
					<div class="flex-1" data-testid={inputMode === 'spend' ? 'spend-input' : 'asset-input'}>
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
				<!-- TRADE-03 D-05 (Plan 02-06): terminal-state inline error when the
					 pre-flight + auto-retry cascade exhausts. User input stays intact (no
					 form reset, no toast). Copy locked in 02-CONTEXT.md D-05. -->
				{#if noLiquidityError}
					<p class="mt-2 text-xs text-red-400">
						No liquidity available right now for this size. Try a smaller amount or check back in a minute.
					</p>
				{/if}
			</div>
		</div>

		<!-- Order summary -->
		<div class={containerStyles.cardBordered}>
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
			<div class="space-y-2 text-sm">
				<div class="flex items-center justify-between">
					<label for="market-slippage" class="text-gray-400">Slippage tolerance</label>
					<div class="flex items-center gap-1">
						<input
							id="market-slippage"
							data-testid="slippage-input"
							type="text"
							inputmode="decimal"
							value={slippageInputValue}
							on:input={handleSlippageInput}
							on:blur={handleSlippageCommit}
							on:keydown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
							class="w-16 rounded border border-white/10 bg-gray-800 px-2 py-1 text-right text-sm text-gray-200 focus:border-yellow-400/50 focus:outline-none {slippageBps > HIGH_SLIPPAGE_WARNING_BPS ? 'border-yellow-500/50 text-yellow-400' : ''}"
						/>
						<span class="text-gray-500">%</span>
					</div>
				</div>
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
					{#if orderPreparationError && !noLiquidityError}
						<!-- TRADE-03: when the D-05 inline block above is rendering the
							 verbatim "No liquidity available right now ..." copy, suppress
							 the generic orderPreparationError box so the message is not
							 duplicated. Other preparation errors still surface here. -->
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
			data-testid="trade-submit"
			data-side={orderSide.toLowerCase()}
			data-mode="market"
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
		<!-- D-09 error-banner: classified error surface for TEST-08 E2E assertions.
		     Visible UX is rendered above (per-error inline blocks); this element exposes
		     a stable selector + machine-readable `data-error-class` for Playwright. The
		     element is sr-only so it doesn't duplicate visible text. The five error-class
		     values cover all TEST-08 modes (slippage / no_liquidity / stale_oracle /
		     insufficient_balance / market_closed). -->
		{#if errorClass}
			<div
				data-testid="error-banner"
				data-error-class={errorClass}
				data-mode="market"
				data-side={orderSide.toLowerCase()}
				class="sr-only"
				role="alert"
				aria-live="polite"
			>{errorClass}</div>
		{/if}
		{#if tradeSubmittedSuccessfully}
			<div
				data-testid="success-toast"
				data-mode="market"
				data-side={orderSide.toLowerCase()}
				class="sr-only"
				role="status"
				aria-live="polite"
			>Order submitted</div>
		{/if}
	</div>
	</div>
{:else}
	<div class="flex h-32 items-center justify-center">
		<LoadingSpinner size="md" text="Loading..." />
	</div>
{/if}

{#if showHighSlippageWarning}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
		on:click={cancelHighSlippage}
	>
		<div
			class="mx-4 w-full max-w-sm rounded-lg border border-yellow-500/30 bg-gray-900 p-6 shadow-xl"
			on:click|stopPropagation
		>
			<h3 class="mb-2 text-lg font-semibold text-yellow-400">High slippage warning</h3>
			<p class="mb-4 text-sm text-gray-300">
				You are setting slippage tolerance to
				<span class="font-semibold text-yellow-400"
					>{pendingHighSlippageBps !== null ? (pendingHighSlippageBps / 100).toFixed(2) : ''}%</span
				>. This means your order could execute at a price significantly worse than the current market
				price.
			</p>
			<div class="flex gap-3">
				<button
					class="flex-1 rounded-lg border border-white/10 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
					on:click={cancelHighSlippage}
				>
					Cancel
				</button>
				<button
					class="flex-1 rounded-lg bg-yellow-500/20 px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-yellow-500/30"
					on:click={confirmHighSlippage}
				>
					I understand, continue
				</button>
			</div>
		</div>
	</div>
{/if}
