<script lang="ts">
	import type { CategorizedToken } from '$lib/config/network';
	import { currentNetwork } from '$lib/stores';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { formatUnits } from 'viem';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import { promptWalletConnection } from '$lib/stores/accessStore';
	import { validateSelectedAmount } from '$lib/utils/validation';
	import type { OrderbookQuoteCache } from '$lib/queries/orderbook';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';
	import { createQuery, type CreateQueryResult } from '@tanstack/svelte-query';
	import { apiGetSwapQuoteV2, type ApiSwapQuoteV2Response } from '$lib/api/st0xApi';
	import {
		buildMarketSwapQuoteRequest,
		DEFAULT_MARKET_ORDER_SLIPPAGE_BPS,
		MAX_SLIPPAGE_BPS,
		executeMarketOrder,
		oracleReferenceIoRatio
	} from '$lib/services/marketOrderExecution';
	import { isOutsideMarketHours } from '$lib/utils/marketHours';
	import { trackTradeEvent, type ErrorClass } from '$lib/services/observability/tradeEvents';
	import {
		captureTradeFlowError,
		inferWalletFailureStage,
		type TradeFlowStage
	} from '$lib/services/observability/tradeFlow';
	import { withTradeId } from '$lib/services/observability/tradeId';
	import {
		createTradeError,
		toUserFacingTradeError,
		type UserFacingTradeError
	} from '$lib/services/tradeError';
	import TradeErrorPanel from '$lib/components/trade/TradeErrorPanel.svelte';
	import { selectVisibleTradeError } from '$lib/components/trade/tradeErrorUi';
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
	/**
	 * When `displayDenom === 'unwrapped'`, the input field, balance row, market
	 * price, and order summary are re-labeled in the share token (tX) and
	 * displayed values are scaled by `wrapRatio` (so a wt-denominated BigInt
	 * of 0.01 wtSGOV reads as 0.01003 tSGOV on a 1.0027 ratio). The order
	 * itself still goes on-chain in wt — `selectedAmount` stays wt
	 * regardless of denom. `wrapRatio` is ignored when 'wrapped'.
	 */
	export let displayDenom: 'wrapped' | 'unwrapped' = 'wrapped';
	export let wrapRatio: number = 1;

	const ORDERBOOK_MAX_STALENESS_MS = 20_000; // 20 seconds
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
		trackTradeEvent('trade_panel_opened', {
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
		trackTradeEvent('trade_error_shown', {
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
		trackTradeEvent('trade_error_shown', {
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
		trackTradeEvent('trade_error_shown', {
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
			trackTradeEvent('trade_panel_abandoned', {
				order_type: 'market',
				token_symbol: trackingState.tokenSymbol,
				order_side: trackingState.orderSide as 'buy' | 'sell',
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
	let orderPreparationTradeError: UserFacingTradeError | null = null;

	// Best orderbook price based on order side (from parent props)
	// Buy: use sellPrice (best ask - what you pay when buying)
	// Sell: use buyPrice (best bid - what you get when selling)
	$: bestOrderbookPrice = orderSide === 'Buy' ? sellPrice : buyPrice;

	$: paymentToken = $currentNetwork?.defaultPaymentToken || $currentNetwork?.paymentTokens?.[0];
	$: paymentTokenSymbol = paymentToken?.symbol ?? 'Quote';

	// Display denom helpers — see the `displayDenom`/`wrapRatio` prop docs.
	$: displayedAssetSymbol =
		displayDenom === 'unwrapped' && assetToken
			? assetToken.symbol.replace(/^wt/, 't')
			: assetToken?.symbol ?? '';
	$: displayScale =
		displayDenom === 'unwrapped' && Number.isFinite(wrapRatio) && wrapRatio > 0 ? wrapRatio : 1;
	$: displayedSpendingTokenSymbol = orderSide === 'Buy' ? paymentTokenSymbol : displayedAssetSymbol;
	/** USDC per displayed asset unit (USDC/wt when wrapped, USDC/t when unwrapped). */
	$: displayedMarketPrice = displayScale > 0 ? marketPrice / displayScale : marketPrice;
	$: displayedBestOrderbookPrice =
		bestOrderbookPrice == null
			? null
			: displayScale > 0
				? bestOrderbookPrice / displayScale
				: bestOrderbookPrice;
	$: showShareEquivalent = displayDenom === 'unwrapped' && displayScale !== 1;
	$: wtDecimalsForSummary = showShareEquivalent ? 5 : 3;

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

	// Exact spend-anchored inputs can be checked against the wallet balance
	// without estimating a price. Buy-by-amount is intentionally left to REST,
	// because a browser-side cost estimate must not reject an executable order.
	$: {
		if (!selectedAmount || selectedAmount === 0n) {
			insufficientBalanceError = false;
		} else if (orderSide === 'Sell') {
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else if (inputMode === 'spend') {
			insufficientBalanceError = selectedAmount > spendingTokenBalance;
		} else {
			insufficientBalanceError = false;
		}
	}

	// D-09 error-class taxonomy (compound testid for TEST-08 assertions):
	//   - slippage             ← REST/SDK price-cap rejection
	//   - no_liquidity         ← REST/SDK reports no executable route
	//   - stale_oracle         ← REST/SDK oracle validation fails
	//   - insufficient_balance ← exact spend exceeds the local wallet balance
	//   - market_closed        ← marketHours.isOutsideMarketHours()
	// Order is precedence-significant: highest-priority class wins when multiple are
	// active (e.g. insufficient_balance trumps no_liquidity to surface the actionable
	// error first). Returns null when no error is active.
	// Discriminated class returned by executeMarketOrder when the take itself
	// fails — preferred over local substring derivation so the data-error-class
	// + trade_failed event_class never disagree with the service's own
	// classification. Reset on each new submit; null when no service-side error
	// is in flight (the reactive block below then falls back to the local
	// signals: insufficientBalanceError, priceError, …).
	let serviceErrorClass: ErrorClass | null = null;
	// Clear only failure state when the trade context changes. The amount and
	// other form choices remain intact so the user can correct and retry.
	$: if (
		selectedAmount ||
		orderSide ||
		assetToken?.address ||
		paymentToken?.address ||
		$currentNetwork?.id
	) {
		orderPreparationError = null;
		orderPreparationTradeError = null;
		serviceErrorClass = null;
	}
	$: errorClass = (() => {
		if (insufficientBalanceError) return 'insufficient_balance';
		if (serviceErrorClass) return serviceErrorClass;
		if (isOutsideMarketHours() && orderPreparationError) return 'market_closed';
		if (priceError && (priceErrorReason === 'no_quotes' || priceErrorReason === 'no_fill'))
			return 'no_liquidity';
		if (orderPreparationError) return 'unknown'; // fallback when neither service nor local class fits
		return null;
	})();

	// The REST quote uses the same mode, amount, slippage and oracle guard as
	// calldata generation. The browser only formats the returned simulation.
	$: marketQuoteTradeError =
		$marketQuoteQuery?.isError && !$marketQuoteQuery?.data
			? toUserFacingTradeError($marketQuoteQuery?.error, 'quote')
			: null;
	$: quoteCalculationTradeError =
		priceError && selectedAmount > 0n
			? createTradeError(
					priceErrorReason === 'no_quotes' || priceErrorReason === 'no_fill'
						? 'SWAP_NO_LIQUIDITY'
						: 'SWAP_QUOTE_FAILED',
					{ stage: 'quote' }
				)
			: null;
	$: visibleTradeError = selectVisibleTradeError(
		marketQuoteTradeError,
		orderPreparationTradeError,
		quoteCalculationTradeError
	);

	// Liquidity warning: check if there's enough liquidity within price guard
	let insufficientLiquidityWarning: boolean = false;
	let availableLiquidityFormatted: string = '0';
	$: quoteOraclePrice = assetToken
		? $oracleQuotesQuery?.data?.[assetToken.address.toLowerCase()]?.price
		: undefined;
	$: quoteReferenceIoRatio = oracleReferenceIoRatio(orderSide, quoteOraclePrice);
	$: marketQuoteRequest =
		selectedAmount > 0n && assetToken && paymentToken && $currentNetwork
			? buildMarketSwapQuoteRequest(
					{
						orderSide,
						amount: selectedAmount,
						inputMode,
						slippageBps,
						referenceIoRatio: quoteReferenceIoRatio,
						assetToken,
						paymentToken,
						network: $currentNetwork
					},
					$walletAddress ?? undefined
				)
			: null;
	let marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>({
		queryKey: ['marketSwapQuoteV2', undefined, null],
		enabled: false,
		queryFn: () => Promise.reject(new Error('Missing market quote request'))
	});
	$: marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>({
		queryKey: ['marketSwapQuoteV2', $currentNetwork?.id, marketQuoteRequest],
		enabled: Boolean(marketQuoteRequest),
		staleTime: 5_000,
		retry: 1,
		queryFn: () => {
			if (!marketQuoteRequest) throw new Error('Missing market quote request');
			return apiGetSwapQuoteV2(marketQuoteRequest);
		}
	});
	$: marketQuote = $marketQuoteQuery?.data;
	$: {
		insufficientLiquidityWarning = Boolean(
			selectedAmount > 0n && marketQuote && !marketQuote.fullyFilled
		);
		if (!marketQuote || !assetToken) {
			availableLiquidityFormatted = '0';
		} else if (inputMode === 'spend') {
			availableLiquidityFormatted = `${Number(marketQuote.estimatedInput).toFixed(2)} ${
				paymentToken?.symbol ?? 'USDC'
			}`;
		} else {
			const availableAsset =
				orderSide === 'Buy' ? marketQuote.estimatedOutput : marketQuote.estimatedInput;
			availableLiquidityFormatted = `${Number(availableAsset).toFixed(4)} ${
				assetToken.symbol ?? 'tokens'
			}`;
		}
	}

	$: summaryAccentClass = orderSide === 'Buy' ? 'text-green-400' : 'text-red-400';
	$: actionButtonClass =
		orderSide === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-text'
			: 'bg-red-500 hover:bg-red-600 text-text';

	$: disableDeploy =
		!selectedAmount ||
		!assetToken ||
		selectedAmountError ||
		insufficientBalanceError ||
		isSubmittingMarketOrder;

	// Calculate the "other side" of the trade for display
	// In amount mode: show how much payment token you'll spend
	// In spend mode: show how many asset tokens you'll receive
	$: estimatedTradeResult = (() => {
		if (!selectedAmount || !marketQuote) return { value: '0.00', label: '' };
		if (inputMode === 'spend') {
			return {
				value: `~${Number(marketQuote.estimatedOutput).toFixed(4)} ${
					assetToken?.symbol ?? 'tokens'
				}`,
				label: 'Est. tokens'
			};
		} else {
			const paymentEstimate =
				orderSide === 'Buy' ? marketQuote.estimatedInput : marketQuote.estimatedOutput;
			return {
				value: `~${Number(paymentEstimate).toFixed(2)} ${paymentTokenSymbol}`,
				label: orderSide === 'Buy' ? 'Est. cost' : 'Est. proceeds'
			};
		}
	})();

	let isSubmittingMarketOrder = false;

	// Percentage actions are exact spend anchors. For Buy this switches to spend
	// mode so REST receives the chosen payment-token amount directly.
	const handlePercentageClick = (percent: number) => {
		if (!spendingTokenBalance || spendingTokenBalance === 0n) return;
		if (spendingTokenBalanceDecimals === null) return;
		if (!tradeAmountInputRef) return;

		if (orderSide === 'Sell') {
			// For SELL: balance is in asset token, amount is in asset token - direct calculation
			const percentAmount = (spendingTokenBalance * BigInt(percent)) / 100n;
			tradeAmountInputRef.setAmountValue(percentAmount);
		} else {
			inputMode = 'spend';
			const percentAmount = (spendingTokenBalance * BigInt(percent)) / 100n;
			tradeAmountInputRef.setAmountValue(percentAmount);
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

	$: isLoadingPrice = selectedAmount > 0n && Boolean($marketQuoteQuery?.isFetching);
	$: priceError = selectedAmount > 0n && Boolean($marketQuoteQuery?.isError);
	$: {
		if (!priceError) {
			priceErrorReason = null;
		} else {
			const message = String($marketQuoteQuery?.error ?? '').toLowerCase();
			priceErrorReason =
				message.includes('liquidity') || message.includes('not found') ? 'no_quotes' : 'error';
		}
	}
	$: {
		if (!marketQuote) {
			marketPrice = 0;
		} else {
			const estimatedInput = Number(marketQuote.estimatedInput);
			const estimatedOutput = Number(marketQuote.estimatedOutput);
			const price =
				orderSide === 'Buy' ? estimatedInput / estimatedOutput : estimatedOutput / estimatedInput;
			marketPrice = Number.isFinite(price) && price > 0 ? price : 0;
		}
	}

	const handleMarketOrder = async () => {
		// Check if user is connected
		if (!$isAuthenticated) {
			promptWalletConnection();
			return;
		}

		if (!selectedAmount) {
			return;
		}

		if (isSubmittingMarketOrder) {
			return;
		}
		isSubmittingMarketOrder = true;
		orderPreparationError = null;
		orderPreparationTradeError = null;
		serviceErrorClass = null;

		// Mint after early-return guards so unauthenticated/idle clicks do not
		// pollute the funnel; withTradeId clears in finally (T-2-E mitigation).
		await withTradeId(async (tradeId) => {
			let activeStage: TradeFlowStage = 'quote';
			const flowContext = (stage: TradeFlowStage, operation: string) => ({
				stage,
				operation,
				orderType: 'market' as const,
				orderSide: orderSide.toLowerCase() as 'buy' | 'sell',
				tradeId,
				chainId: $currentNetwork?.id,
				assetSymbol: assetToken?.symbol,
				paymentSymbol: paymentToken?.symbol
			});
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
					captureTradeFlowError(
						new Error('Payment token configuration is incomplete'),
						flowContext('quote', 'validate_token_config')
					);
					orderPreparationTradeError = createTradeError('SWAP_QUOTE_FAILED', {
						stage: 'quote'
					});
					orderPreparationError = orderPreparationTradeError.message;
					return;
				}
				if (!assetToken || typeof assetToken.decimals !== 'number') {
					captureTradeFlowError(
						new Error('Asset token configuration is incomplete'),
						flowContext('quote', 'validate_token_config')
					);
					orderPreparationTradeError = createTradeError('SWAP_QUOTE_FAILED', {
						stage: 'quote'
					});
					orderPreparationError = orderPreparationTradeError.message;
					return;
				}
				// Execution requests fresh REST API-built calldata with the same
				// request semantics used by the display quote above.
				const oracleAddress = assetToken.address.toLowerCase();
				const oraclePrice = $oracleQuotesQuery?.data?.[oracleAddress]?.price;
				const referenceIoRatio = oracleReferenceIoRatio(orderSide, oraclePrice);
				activeStage = 'calldata';
				const result = await executeMarketOrder({
					orderSide,
					amount: selectedAmount,
					inputMode,
					slippageBps,
					referenceIoRatio,
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
					network: $currentNetwork
				});

				if (!result.success && result.error) {
					const userFacingError =
						result.tradeError ?? toUserFacingTradeError(result.error, activeStage);
					orderPreparationTradeError = userFacingError;
					orderPreparationError = userFacingError.message;
					// Prefer the service's discriminated errorClass; fall back to
					// substring-classifying the user-facing string only if absent
					// (shouldn't happen post-Phase-2 but kept as a defence).
					const eventErrorClass = result.errorClass ?? userFacingError.errorClass;
					serviceErrorClass = eventErrorClass;
					trackTradeEvent('trade_failed', {
						order_type: 'market',
						order_side: orderSide.toLowerCase() as 'buy' | 'sell',
						asset_symbol: assetToken?.symbol,
						payment_symbol: paymentToken?.symbol,
						amount: formatUnits(
							selectedAmount,
							inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
						),
						avg_price: marketPrice,
						error_class: eventErrorClass,
						error_message: userFacingError.message,
						error_code: userFacingError.code,
						...(userFacingError.requestId ? { request_id: userFacingError.requestId } : {})
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
				// executeMarketOrder owns quote/calldata failures internally. A rejection
				// escaping after preparation is at the wallet boundary, so distinguish a
				// signing rejection from a submission/transport failure.
				const failureStage =
					activeStage === 'calldata' ? inferWalletFailureStage(error) : activeStage;
				captureTradeFlowError(error, flowContext(failureStage, 'submit_market_order'));
				const userFacingError = toUserFacingTradeError(error, failureStage);
				orderPreparationTradeError = userFacingError;
				orderPreparationError = userFacingError.message;
				trackTradeEvent('trade_failed', {
					order_type: 'market',
					order_side: orderSide.toLowerCase() as 'buy' | 'sell',
					asset_symbol: assetToken?.symbol,
					payment_symbol: paymentToken?.symbol,
					amount: formatUnits(
						selectedAmount,
						inputMode === 'spend' ? paymentToken?.decimals ?? 6 : assetToken?.decimals ?? 18
					),
					avg_price: marketPrice,
					error_class: userFacingError.errorClass,
					error_message: userFacingError.message,
					error_code: userFacingError.code,
					...(userFacingError.requestId ? { request_id: userFacingError.requestId } : {})
				});
			} finally {
				isSubmittingMarketOrder = false;
			}
		});
	};
</script>

<svelte:window
	on:keydown={(e) => {
		if (e.key === 'Escape' && showHighSlippageWarning) cancelHighSlippage();
	}}
/>

{#if $currentNetwork && assetToken}
	<div data-testid="market-form" data-mode="market" data-side={orderSide.toLowerCase()}>
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
						class="flex items-center rounded-lg border border-line bg-surface-3 transition-colors focus-within:border-accent-line"
					>
						<!-- Left side: Buy/Spend or Sell toggle -->
						{#if orderSide === 'Buy'}
							<button
								type="button"
								data-testid="input-mode-toggle"
								data-mode={inputMode}
								on:click={() => {
									inputMode = inputMode === 'amount' ? 'spend' : 'amount';
									selectedAmount = 0n;
								}}
								class="flex items-center gap-1.5 py-3 pl-4 pr-2 text-sm font-medium text-green-400 transition-colors hover:text-green-300"
							>
								{inputMode === 'amount' ? 'Buy' : 'Spend'}
								<Icon name="swap" className="h-3 w-3 opacity-50" />
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
								displayScale={inputMode === 'spend' ? 1 : displayScale}
							/>
						</div>

						<!-- Right side: Token symbol -->
						<span class="py-3 pl-2 pr-4 text-sm font-medium text-text-2">
							{inputMode === 'spend' ? paymentTokenSymbol : displayedAssetSymbol}
						</span>
					</div>

					<!-- Balance display. When the spending token is the asset and the user
					     opted into the share-denominated view, scale the displayed balance
					     by the wrap ratio and use the share symbol. Payment-token spends
					     (USDC) are unaffected since they aren't wrapped. -->
					<div class="mt-1.5 text-sm text-text-2">
						{#if spendingTokenBalanceDecimals !== null}
							{@const balanceFormatted = parseFloat(
								formatUnits(spendingTokenBalance, spendingTokenBalanceDecimals)
							)}
							{@const balanceScale = orderSide === 'Sell' ? displayScale : 1}
							{@const balanceRounded = Math.round(balanceFormatted * balanceScale * 1000) / 1000}
							Balance: {balanceRounded.toFixed(3)}
							{orderSide === 'Sell' ? displayedSpendingTokenSymbol : spendingToken?.symbol ?? ''}
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
								class="flex-1 rounded border border-line bg-surface-3 px-2 py-1 text-xs text-text-2 transition-colors hover:border-line-strong hover:bg-overlay-hover"
							>
								{percent === 100 ? 'Max' : `${percent}%`}
							</button>
						{/each}
					</div>
				</div>
				<div>
					<div class="mb-2 block text-sm font-medium text-text-2">
						Market Price
						<span class="ml-1 text-xs text-text-3">(per {displayedAssetSymbol})</span>
					</div>
					<div class="relative">
						<input
							type="text"
							value={!selectedAmount || selectedAmount === 0n
								? displayedBestOrderbookPrice !== null
									? `~${displayedBestOrderbookPrice.toFixed(2)} ${paymentTokenSymbol}`
									: 'No quotes available'
								: isLoadingPrice
									? 'Loading...'
									: priceError
										? 'Price unavailable'
										: `~${displayedMarketPrice.toFixed(2)} ${paymentTokenSymbol}`}
							disabled
							class="focus:ring-accent-line/20 w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-text-2 placeholder-text-3 focus:border-accent-line focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
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
								? 'text-amber-700 dark:text-amber-400'
								: 'text-text-3'}"
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
			<div class="rounded-xl border border-line bg-overlay-1 p-4">
				<h4 class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-text-2">
					Order Summary
				</h4>
				<div class="space-y-2 text-sm">
					<div class="flex items-center justify-between">
						<label for="market-slippage" class="text-text-2">Slippage tolerance</label>
						<div class="flex items-center gap-1">
							<input
								id="market-slippage"
								data-testid="slippage-input"
								type="text"
								inputmode="decimal"
								value={slippageInputValue}
								on:input={handleSlippageInput}
								on:blur={handleSlippageCommit}
								on:keydown={(e) => {
									if (e.key === 'Enter') {
										e.currentTarget.blur();
									}
								}}
								class="w-16 rounded border border-line bg-surface-2 px-2 py-1 text-right text-sm text-text-2 focus:border-accent-line focus:outline-none {slippageBps >
								HIGH_SLIPPAGE_WARNING_BPS
									? 'border-amber-500/50 text-amber-700 dark:text-amber-400'
									: ''}"
							/>
							<span class="text-text-3">%</span>
						</div>
					</div>
					{#if inputMode === 'spend'}
						<!-- Spend mode: show spending amount first -->
						<div class="flex justify-between">
							<span class="text-text-2">Spending</span>
							<span class="font-mono font-medium tabular-nums">
								{selectedAmount
									? parseFloat(formatUnits(selectedAmount, paymentToken?.decimals ?? 6)).toFixed(2)
									: '0'}
								{paymentTokenSymbol}
							</span>
						</div>
					{:else}
						<!-- Amount mode: show buying/selling amount. The Order Summary is
						     the on-chain ground truth, so we always render the wt
						     quantity here regardless of the panel denom toggle. When
						     unwrapped is active we bump precision to 5 decimals so the
						     wrap-ratio gap is actually visible (otherwise e.g. 0.00997
						     wt vs 0.01 t both round to "0.010" and the user thinks the
						     conversion didn't happen). -->
						<div class="flex items-start justify-between gap-3">
							<span class="text-text-2">{orderSide === 'Buy' ? 'Buying' : 'Selling'}</span>
							<div class="text-right">
								<span class="font-mono font-medium tabular-nums">
									{(selectedAmount
										? parseFloat(formatUnits(selectedAmount, assetToken.decimals))
										: 0
									).toFixed(wtDecimalsForSummary)}
									{assetToken.symbol}
								</span>
								{#if showShareEquivalent}
									<div class="text-[11px] text-text-3">
										equivalent to {(
											(selectedAmount
												? parseFloat(formatUnits(selectedAmount, assetToken.decimals))
												: 0) * displayScale
										).toFixed(5)}
										{displayedAssetSymbol}
									</div>
								{/if}
							</div>
						</div>
					{/if}
					<div class="flex items-start justify-between gap-3">
						<span class="text-text-2">
							{#if !selectedAmount || selectedAmount === 0n}
								{orderSide === 'Buy' ? 'Best ask' : 'Best bid'}
							{:else}
								Avg. price
							{/if}
						</span>
						<div class="text-right">
							<span class="font-mono font-medium tabular-nums">
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
							{#if displayDenom === 'unwrapped' && displayScale !== 1 && !isLoadingPrice && !priceError}
								{@const perTPrice =
									!selectedAmount || selectedAmount === 0n
										? displayedBestOrderbookPrice
										: displayedMarketPrice}
								{#if perTPrice !== null}
									<div class="text-[11px] text-text-3">
										equivalent to ~{perTPrice.toFixed(2)}
										{paymentTokenSymbol} per {displayedAssetSymbol}
									</div>
								{/if}
							{/if}
						</div>
					</div>
					<div class="mt-2 border-t border-line pt-2">
						<div class="flex justify-between">
							<span class="text-text-2">{estimatedTradeResult.label || 'Estimated'}</span>
							<span class={`font-mono text-lg font-semibold tabular-nums ${summaryAccentClass}`}>
								{isLoadingPrice || priceError ? 'N/A' : estimatedTradeResult.value}
							</span>
						</div>
						{#if insufficientBalanceError}
							<div class="mt-2 text-sm text-red-400">
								Insufficient {orderSide === 'Sell'
									? displayedSpendingTokenSymbol
									: spendingToken?.symbol ?? 'token'} balance
							</div>
						{/if}
						{#if insufficientLiquidityWarning && !insufficientBalanceError}
							<div
								class="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-300"
							>
								There currently isn't enough orderbook liquidity to fully fill this order. Continue
								to fill approx. {availableLiquidityFormatted}.
								{#if isOutsideMarketHours()}
									<br /><br />This might be because US markets are currently closed.
								{/if}
							</div>
						{/if}
						{#if visibleTradeError}
							<div class="mt-2">
								<TradeErrorPanel error={visibleTradeError} />
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
				class={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
					disableDeploy
						? 'cursor-not-allowed bg-line-strong text-text-2 opacity-50'
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
		     Visible UX is rendered above (per-error inline blocks); this element
		     exposes a stable Playwright selector + machine-readable
		     `data-error-class`. Hidden from assistive tech via `aria-hidden`
		     because the textContent is internal taxonomy (`no_liquidity`,
		     `stale_oracle`, …) — the visible blocks above already carry the
		     human-readable announcement. The five error-class values cover all
		     TEST-08 modes (slippage / no_liquidity / stale_oracle /
		     insufficient_balance / market_closed). -->
			{#if errorClass}
				<div
					data-testid="error-banner"
					data-error-class={errorClass}
					data-mode="market"
					data-side={orderSide.toLowerCase()}
					class="sr-only"
					aria-hidden="true"
				>
					{errorClass}
				</div>
			{/if}
			{#if tradeSubmittedSuccessfully}
				<div
					data-testid="success-toast"
					data-mode="market"
					data-side={orderSide.toLowerCase()}
					class="sr-only"
					role="status"
					aria-live="polite"
				>
					Order submitted
				</div>
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
			class="mx-4 w-full max-w-sm rounded-xl border border-amber-500/30 bg-surface-1 p-6 shadow-xl"
			on:click|stopPropagation
		>
			<h3 class="mb-2 text-lg font-semibold text-amber-600 dark:text-amber-400">
				High slippage warning
			</h3>
			<p class="mb-4 text-sm text-text-2">
				You are setting slippage tolerance to
				<span class="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400"
					>{pendingHighSlippageBps !== null ? (pendingHighSlippageBps / 100).toFixed(2) : ''}%</span
				>. This means your order could execute at a price significantly worse than the current
				market price.
			</p>
			<div class="flex gap-3">
				<button
					class="flex-1 rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm text-text-2 hover:bg-surface-3"
					on:click={cancelHighSlippage}
				>
					Cancel
				</button>
				<button
					class="flex-1 rounded-xl bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-500/30 dark:text-amber-400"
					on:click={confirmHighSlippage}
				>
					I understand, continue
				</button>
			</div>
		</div>
	</div>
{/if}
