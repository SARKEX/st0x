<script lang="ts">
	import { web3Modal, wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import { readContract } from '@wagmi/core';
	import { erc20Abi, formatUnits } from 'viem';
	import { createQuery } from '@tanstack/svelte-query';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { OrderbookQuoteCache } from '$lib/queries/orderbook';
	import { createApiTokensQuery } from '$lib/queries/tokens';
	import { createMidpointPricesQuery, getMidpointPrice } from '$lib/queries/midpointPrices';
	import { openAuthModal } from '$lib/stores/dynamicStore';
	import type { ProcessedQuote } from '$lib/utils/orderbook';
	import {
		getMakerInputTokenAddress,
		getMakerOutputTokenAddress
	} from '$lib/types/orderPerspective';
	import Button from './ui/Button.svelte';
	import TradeErrorPanel from './trade/TradeErrorPanel.svelte';
	import { selectVisibleTradeError, toTradeFailureAnalytics } from './trade/tradeErrorUi';
	import { isOutsideMarketHours } from '$lib/utils/marketHours';
	import { track } from '$lib/services/analytics';
	import { isSgov } from '$lib/config/earn';
	import QuickTradeChart from './earn/QuickTradeChart.svelte';
	import Icon from './ui/Icon.svelte';
	import { goto } from '$app/navigation';
	import { resolveMarketOrderAnchor } from '$lib/utils/marketOrderInput';
	import {
		apiGetSwapQuoteV2,
		type ApiSwapQuoteV2Request,
		type ApiSwapQuoteV2Response
	} from '$lib/api/st0xApi';
	import { createDebouncedRequest } from '$lib/stores/debouncedValue';
	import {
		buildMarketSwapQuoteRequest,
		DEFAULT_MARKET_ORDER_SLIPPAGE_BPS
	} from '$lib/services/marketOrderExecution';
	import {
		createTradeError,
		shouldRetryTradeQuery,
		toUserFacingTradeError,
		type UserFacingTradeError
	} from '$lib/services/tradeError';

	// Quick Trade intentionally uses a fixed 1% slippage tolerance to keep the
	// simplified flow free of advanced order controls.
	const QUICK_TRADE_SLIPPAGE_BPS = DEFAULT_MARKET_ORDER_SLIPPAGE_BPS;

	function normalizeAddress(value: string | null | undefined): string | null {
		const trimmed = value?.trim();
		return trimmed ? trimmed.toLowerCase() : null;
	}

	// Analytics tracking
	let panelOpenTime = Date.now();
	let tradeSubmittedSuccessfully = false;
	let previousTokenSymbol: string | null = null;

	// ============ TOKEN SELECTION (completely independent) ============
	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: midpointPricesQuery = createMidpointPricesQuery($currentNetwork);
	$: apiTokens = $apiTokensQuery.data ?? [];
	// Pin SGOV (the Save & Earn product) to the top of the tradable list.
	$: tradableTokens = apiTokens
		.filter((t) => t.category === 'ST0x')
		.sort((a, b) => (isSgov(b.address) ? 1 : 0) - (isSgov(a.address) ? 1 : 0));

	let selectedTokenAddress: string | null = null;
	let isDropdownOpen = false;

	// Auto-select first token on mount
	$: if (
		tradableTokens.length > 0 &&
		(!selectedTokenAddress ||
			!tradableTokens.some((t) => t.address.toLowerCase() === selectedTokenAddress?.toLowerCase()))
	) {
		selectedTokenAddress = tradableTokens[0].address;
	}

	$: selectedToken = tradableTokens.find(
		(t) => t.address.toLowerCase() === selectedTokenAddress?.toLowerCase()
	);
	$: selectedMarketPrice = getMidpointPrice(
		$midpointPricesQuery?.data,
		selectedToken?.address
	)?.price;

	function handleTokenSelect(address: string) {
		const newToken = tradableTokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
		track('quick_trade_token_selected', {
			token_symbol: newToken?.symbol,
			previous_token: previousTokenSymbol
		});
		previousTokenSymbol = newToken?.symbol ?? null;

		selectedTokenAddress = address;
		isDropdownOpen = false;
		// Reset form when changing tokens
		topAmount = '';
		bottomAmount = '';
		lastEditedField = null;
		tradeErrorDetails = null;
	}

	function toggleDropdown(e: MouseEvent) {
		e.stopPropagation();
		isDropdownOpen = !isDropdownOpen;
		// Reset scroll indicators when opening
		if (isDropdownOpen) {
			canScrollUp = false;
			canScrollDown = true;
			track('quick_trade_dropdown_opened', {
				current_token: selectedToken?.symbol
			});
		}
	}

	// Scroll indicator state
	let canScrollUp = false;
	let canScrollDown = true;
	let dropdownScrollEl: HTMLDivElement | null = null;

	function handleDropdownScroll(e: Event) {
		const el = e.target as HTMLDivElement;
		canScrollUp = el.scrollTop > 0;
		canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight - 1;
	}

	function closeDropdown() {
		isDropdownOpen = false;
	}

	// ============ FORM STATE ============
	let topAmount = '';
	let bottomAmount = '';
	let isBuying = true;
	let lastEditedField: 'top' | 'bottom' | null = null;
	let isExecutingTrade = false;
	let tradeErrorDetails: UserFacingTradeError | null = null;
	$: tradeError = tradeErrorDetails?.message ?? null;
	let tradeErrorNetworkId = $currentNetwork?.id;

	function clearTradeError() {
		tradeErrorDetails = null;
	}

	$: if ($currentNetwork?.id !== tradeErrorNetworkId) {
		tradeErrorNetworkId = $currentNetwork?.id;
		clearTradeError();
	}

	// ============ DATA LOADING ============
	$: paymentToken = $currentNetwork?.defaultPaymentToken;
	$: tradeAnchor =
		selectedToken && paymentToken
			? resolveMarketOrderAnchor({
					orderSide: isBuying ? 'Buy' : 'Sell',
					editedField: lastEditedField,
					paymentAmount: topAmount,
					assetAmount: bottomAmount,
					paymentDecimals: paymentToken.decimals,
					assetDecimals: selectedToken.decimals
				})
			: null;

	// TanStack Query for quotes — polls every 15s, retries on failure, preserves stale data
	$: orderbookQuery = createQuery<OrderbookQuoteCache>({
		queryKey: ['tokenOrderbookQuotes', $currentNetwork?.id, selectedTokenAddress],
		enabled: browser && Boolean($currentNetwork && selectedTokenAddress),
		staleTime: 30_000,
		retry: 2,
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
		refetchOnMount: 'always',
		refetchInterval: 15_000,
		refetchOnWindowFocus: true,
		refetchIntervalInBackground: false,
		queryFn: async () => {
			if (!browser || !$currentNetwork || !selectedTokenAddress) {
				return { summary: {}, quotes: [] };
			}
			const { refreshTokenQuotes } = await import('$lib/queries/orderbook');
			return refreshTokenQuotes($currentNetwork.id, selectedTokenAddress);
		}
	});
	$: quotes = $orderbookQuery.data?.quotes ?? [];
	let marketQuoteRequest: ApiSwapQuoteV2Request | null;
	$: marketQuoteRequest =
		tradeAnchor && selectedToken && paymentToken && $currentNetwork
			? buildMarketSwapQuoteRequest(
					{
						orderSide: isBuying ? 'Buy' : 'Sell',
						amount: tradeAnchor.amount,
						inputMode: tradeAnchor.inputMode,
						slippageBps: QUICK_TRADE_SLIPPAGE_BPS,
						assetToken: selectedToken,
						paymentToken,
						network: $currentNetwork
					},
					$walletAddress ?? undefined
				)
			: null;
	const debouncedMarketQuoteRequest = createDebouncedRequest<ApiSwapQuoteV2Request>(300);
	$: debouncedMarketQuoteRequest.set(marketQuoteRequest);
	let marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>({
		queryKey: ['swapQuoteV2', undefined, null],
		enabled: false,
		queryFn: () => Promise.reject(new Error('Missing swap quote request'))
	});
	$: marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>({
		queryKey: ['swapQuoteV2', $currentNetwork?.id, $debouncedMarketQuoteRequest.fingerprint],
		enabled: browser && Boolean($debouncedMarketQuoteRequest.request),
		staleTime: 5_000,
		retry: shouldRetryTradeQuery,
		queryFn: ({ signal }) => {
			const request = $debouncedMarketQuoteRequest.request;
			if (!request) throw new Error('Missing swap quote request');
			return apiGetSwapQuoteV2(request, signal);
		}
	});
	$: quoteTradeError =
		$marketQuoteQuery?.isError && !$marketQuoteQuery?.data
			? toUserFacingTradeError($marketQuoteQuery?.error, 'quote')
			: null;
	// A blocking no-data quote failure describes the current form context and
	// must not be hidden by an older execution failure.
	$: visibleTradeError = selectVisibleTradeError(quoteTradeError, tradeErrorDetails);

	// On mount: analytics only. The selected-token query above fetches the visible quote data.
	onMount(() => {
		panelOpenTime = Date.now();
		track('quick_trade_panel_viewed', {
			has_wallet: Boolean($walletAddress),
			token_selected: selectedToken?.symbol
		});
	});

	// Track abandonment on unmount
	onDestroy(() => {
		debouncedMarketQuoteRequest.destroy();
		if (!tradeSubmittedSuccessfully && (topAmount || bottomAmount)) {
			track('quick_trade_abandoned', {
				token_symbol: selectedToken?.symbol,
				direction: isBuying ? 'buy' : 'sell',
				values_entered: {
					usdc_amount: topAmount || null,
					token_amount: bottomAmount || null
				},
				time_spent_ms: Date.now() - panelOpenTime,
				last_error: tradeError || (quote && !quote.hasLiquidity ? 'insufficient_liquidity' : null)
			});
		}
	});

	// ============ BALANCE QUERIES ============
	$: usdcBalanceQuery = createQuery({
		queryKey: ['usdcBalance', $currentNetwork?.id, paymentToken?.address, $walletAddress],
		queryFn: async () => {
			if (!paymentToken?.address || !$walletAddress || !$wagmiConfig) return 0n;
			return (await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: paymentToken.address as `0x${string}`,
				functionName: 'balanceOf',
				args: [$walletAddress as `0x${string}`]
			})) as bigint;
		},
		enabled: Boolean(paymentToken?.address && $walletAddress && $wagmiConfig)
	});

	$: tokenBalanceQuery = createQuery({
		queryKey: ['tokenBalance', $currentNetwork?.id, selectedTokenAddress, $walletAddress],
		queryFn: async () => {
			if (!selectedTokenAddress || !$walletAddress || !$wagmiConfig) return 0n;
			return (await readContract($wagmiConfig, {
				abi: erc20Abi,
				address: selectedTokenAddress as `0x${string}`,
				functionName: 'balanceOf',
				args: [$walletAddress as `0x${string}`]
			})) as bigint;
		},
		enabled: Boolean(selectedTokenAddress && $walletAddress && $wagmiConfig)
	});

	$: usdcBalance = $usdcBalanceQuery.data ?? 0n;
	$: usdcDecimals = paymentToken?.decimals ?? 6;
	$: formattedUsdcBalance = Number(formatUnits(usdcBalance, usdcDecimals));
	$: tokenBalance = $tokenBalanceQuery.data ?? 0n;
	$: tokenDecimals = selectedToken?.decimals ?? 18;
	$: formattedTokenBalance = Number(formatUnits(tokenBalance, tokenDecimals));

	// ============ QUOTE FILTERING ============
	$: askQuotes = (() => {
		if (!selectedToken || !paymentToken) return [];
		const assetAddress = normalizeAddress(selectedToken.address);
		const quoteAddress = normalizeAddress(paymentToken.address);

		return quotes
			.filter((quote: ProcessedQuote) => {
				const inputAddr = normalizeAddress(getMakerInputTokenAddress(quote));
				const outputAddr = normalizeAddress(getMakerOutputTokenAddress(quote));
				const price = quote.quotePerAsset;
				return (
					inputAddr === quoteAddress &&
					outputAddr === assetAddress &&
					quote.side === 'ask' &&
					price !== undefined &&
					Number.isFinite(price) &&
					price > 0
				);
			})
			.sort((a, b) => (a.quotePerAsset ?? Infinity) - (b.quotePerAsset ?? Infinity));
	})();

	$: bidQuotes = (() => {
		if (!selectedToken || !paymentToken) return [];
		const assetAddress = normalizeAddress(selectedToken.address);
		const quoteAddress = normalizeAddress(paymentToken.address);

		return quotes
			.filter((quote: ProcessedQuote) => {
				const inputAddr = normalizeAddress(getMakerInputTokenAddress(quote));
				const outputAddr = normalizeAddress(getMakerOutputTokenAddress(quote));
				const price = quote.quotePerAsset;
				return (
					inputAddr === assetAddress &&
					outputAddr === quoteAddress &&
					quote.side === 'bid' &&
					price !== undefined &&
					Number.isFinite(price) &&
					price > 0
				);
			})
			.sort((a, b) => (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0));
	})();

	$: bestAskPrice = askQuotes.length > 0 ? askQuotes[0].quotePerAsset : null;
	$: bestBidPrice = bidQuotes.length > 0 ? bidQuotes[0].quotePerAsset : null;

	// ============ AUTHORITATIVE REST QUOTE ============
	$: quote = toDisplayQuote(
		$debouncedMarketQuoteRequest.request ? $marketQuoteQuery?.data : undefined,
		isBuying,
		lastEditedField
	);

	$: syncOtherField(quote, lastEditedField);

	function syncOtherField(q: typeof quote, editedField: typeof lastEditedField) {
		if (!q?.calculatedAmount || !editedField) return;
		const newValue = formatTokenAmount(q.calculatedAmount);
		if (editedField === 'top') {
			bottomAmount = newValue;
		} else {
			topAmount = newValue;
		}
	}

	function toDisplayQuote(
		response: ApiSwapQuoteV2Response | undefined,
		buying: boolean,
		editedField: 'top' | 'bottom' | null
	) {
		if (!response || !editedField) return null;
		const estimatedInput = Number(response.estimatedInput);
		const estimatedOutput = Number(response.estimatedOutput);
		if (
			!Number.isFinite(estimatedInput) ||
			!Number.isFinite(estimatedOutput) ||
			estimatedInput <= 0 ||
			estimatedOutput <= 0
		) {
			return null;
		}

		const calculatedAmount =
			editedField === 'top'
				? buying
					? estimatedOutput
					: estimatedInput
				: buying
					? estimatedInput
					: estimatedOutput;
		const avgPrice = buying ? estimatedInput / estimatedOutput : estimatedOutput / estimatedInput;
		return {
			calculatedAmount,
			avgPrice,
			hasLiquidity: response.fullyFilled
		};
	}

	// ============ INPUT HANDLERS ============
	function handleTopInput(e: Event) {
		const target = e.target as HTMLInputElement;
		topAmount = target.value;
		lastEditedField = 'top';
		// Clear the other field to prevent both having user-entered values while prices load
		bottomAmount = '';
		clearTradeError();
	}

	function handleBottomInput(e: Event) {
		const target = e.target as HTMLInputElement;
		bottomAmount = target.value;
		lastEditedField = 'bottom';
		// Clear the other field to prevent both having user-entered values while prices load
		topAmount = '';
		clearTradeError();
	}

	function handleSwapDirection() {
		isBuying = !isBuying;
		clearTradeError();
		track('quick_trade_direction_changed', {
			direction: isBuying ? 'buy' : 'sell',
			token_symbol: selectedToken?.symbol
		});
	}

	function handleUsdcPercentClick(percent: number) {
		const amount = (formattedUsdcBalance * percent) / 100;
		// Use floor to prevent rounding up beyond actual balance (fixes "not enough funds" on MAX)
		const flooredAmount = Math.floor(amount * 100) / 100;
		topAmount = flooredAmount.toFixed(2);
		lastEditedField = 'top';
		clearTradeError();
	}

	function handleTokenPercentClick(percent: number) {
		const amount = (formattedTokenBalance * percent) / 100;
		// Use floor to prevent rounding up beyond actual balance (fixes "not enough funds" on MAX)
		const flooredAmount = Math.floor(amount * 1e6) / 1e6;
		bottomAmount = flooredAmount.toFixed(6);
		lastEditedField = 'bottom';
		clearTradeError();
	}

	// ============ TRADE EXECUTION ============
	async function handleTrade() {
		// Track button click
		track('quick_trade_button_clicked', {
			token_symbol: selectedToken?.symbol,
			direction: isBuying ? 'buy' : 'sell',
			usdc_amount: topAmount,
			token_amount: bottomAmount,
			avg_price: quote?.avgPrice,
			is_authenticated: $isAuthenticated
		});

		if (!$isAuthenticated) {
			openAuthModal();
			return;
		}
		if (
			!selectedToken ||
			!paymentToken ||
			!$currentNetwork ||
			!lastEditedField ||
			isExecutingTrade
		) {
			return;
		}

		const orderSide = isBuying ? 'Buy' : 'Sell';
		if (!tradeAnchor) {
			tradeErrorDetails = createTradeError('SWAP_QUOTE_FAILED', { stage: 'quote' });
			return;
		}

		isExecutingTrade = true;
		tradeErrorDetails = null;

		try {
			const { executeMarketOrder } = await import('$lib/services/marketOrderExecution');

			const result = await executeMarketOrder({
				orderSide,
				amount: tradeAnchor.amount,
				inputMode: tradeAnchor.inputMode,
				slippageBps: QUICK_TRADE_SLIPPAGE_BPS,
				assetToken: {
					address: selectedToken.address,
					decimals: selectedToken.decimals,
					symbol: selectedToken.symbol
				},
				paymentToken: {
					address: paymentToken.address,
					decimals: paymentToken.decimals,
					symbol: paymentToken.symbol
				},
				network: $currentNetwork
			});

			if (!result.success) {
				const userFacingError =
					result.tradeError ?? toUserFacingTradeError(result.error, 'submission');
				tradeErrorDetails = userFacingError;
				track('quick_trade_failed', {
					token_symbol: selectedToken?.symbol,
					direction: isBuying ? 'buy' : 'sell',
					usdc_amount: topAmount,
					token_amount: bottomAmount,
					avg_price: quote?.avgPrice,
					...toTradeFailureAnalytics(userFacingError)
				});
			} else {
				tradeSubmittedSuccessfully = true;
				track('quick_trade_completed', {
					token_symbol: selectedToken?.symbol,
					direction: isBuying ? 'buy' : 'sell',
					usdc_amount: topAmount,
					token_amount: bottomAmount,
					avg_price: quote?.avgPrice
				});
				topAmount = '';
				bottomAmount = '';
				lastEditedField = null;
			}
		} catch (error) {
			console.error('Trade error:', error);
			const userFacingError = toUserFacingTradeError(error, 'submission');
			tradeErrorDetails = userFacingError;
			track('quick_trade_failed', {
				token_symbol: selectedToken?.symbol,
				direction: isBuying ? 'buy' : 'sell',
				usdc_amount: topAmount,
				token_amount: bottomAmount,
				avg_price: quote?.avgPrice,
				...toTradeFailureAnalytics(userFacingError)
			});
		} finally {
			isExecutingTrade = false;
		}
	}

	function handleConnectWallet() {
		$web3Modal.open();
	}

	function formatTokenAmount(amount: number): string {
		if (amount >= 1000) return amount.toFixed(2);
		if (amount >= 1) return amount.toFixed(4);
		return amount.toFixed(6);
	}

	function formatPrice(price: number): string {
		if (price >= 1000) return '$' + price.toFixed(0);
		if (price >= 100) return '$' + price.toFixed(1);
		if (price >= 1) return '$' + price.toFixed(2);
		return '$' + price.toFixed(4);
	}
</script>

<!-- Close dropdown when clicking outside -->
<svelte:window on:click={closeDropdown} />

<div
	class="bg-surface-1/80 relative w-full rounded-2xl border border-line p-4 shadow-2xl backdrop-blur-xl sm:p-6 md:grid md:grid-cols-2 md:items-stretch md:gap-6"
>
	<div class="relative space-y-4">
		<!-- Card header -->
		<div class="flex items-center justify-between text-xs text-text-2">
			<span>Quick trade</span>
			<span>Base · {paymentToken?.symbol ?? 'USDC'}</span>
		</div>

		<!-- USDC section -->
		<div class="space-y-1">
			<div
				class="flex items-center gap-3 rounded-xl border border-line bg-overlay-strong px-3.5 py-3.5"
			>
				<div class="flex items-center gap-2 rounded-full bg-overlay-2 px-3 py-1.5">
					{#if paymentToken?.logoUrl}
						<img
							src={paymentToken.logoUrl}
							alt={paymentToken.symbol}
							class="h-6 w-6 rounded-full"
						/>
					{/if}
					<span class="font-medium text-text">{paymentToken?.symbol ?? 'USDC'}</span>
				</div>
				<div class="flex-1 text-right">
					<input
						type="text"
						inputmode="decimal"
						placeholder="0"
						value={topAmount}
						on:input={handleTopInput}
						class="w-full bg-transparent text-right text-xl font-medium text-text placeholder-text-3 focus:outline-none sm:text-2xl"
					/>
				</div>
			</div>
			<div class="flex items-center justify-between px-1 text-xs">
				<span class="text-text-3">
					{#if $isAuthenticated && $walletAddress}
						Balance: {formattedUsdcBalance.toFixed(2)} {paymentToken?.symbol ?? 'USDC'}
					{:else}
						&nbsp;
					{/if}
				</span>
				<div class="flex items-center gap-1">
					{#if isBuying && $isAuthenticated && $walletAddress && formattedUsdcBalance > 0}
						{#each [25, 50, 75, 100] as percent}
							<button
								type="button"
								on:click={() => handleUsdcPercentClick(percent)}
								class="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-3 transition hover:bg-surface-2 hover:text-text"
							>
								{percent === 100 ? 'MAX' : `${percent}%`}
							</button>
						{/each}
					{/if}
				</div>
			</div>
			{#if isBuying && quote && !quote.hasLiquidity}
				<div
					class="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300"
				>
					Not enough liquidity to fully fill your order.
					{#if isOutsideMarketHours()}
						<br />This might be because US markets are currently closed.
					{/if}
				</div>
			{/if}
		</div>

		<!-- Direction arrow (overlapping swap pivot) -->
		<div class="relative z-10 -my-3 flex justify-center">
			<button
				type="button"
				on:click={handleSwapDirection}
				class="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-1 transition hover:border-line-strong hover:bg-surface-2"
			>
				<Icon
					name="arrowDown"
					className="h-4 w-4 text-text-3 transition-transform duration-200 {!isBuying
						? 'rotate-180'
						: ''}"
				/>
			</button>
		</div>

		<!-- Token section -->
		<div class="space-y-1">
			<div
				class="flex items-center gap-3 rounded-xl border border-line bg-overlay-strong px-3.5 py-3.5"
			>
				<!-- Token selector - completely independent -->
				<div class="relative">
					<button
						type="button"
						on:click={toggleDropdown}
						class="flex items-center gap-2 rounded-full bg-overlay-2 px-3 py-1.5 transition hover:bg-overlay-hover"
					>
						{#if selectedToken}
							<img
								src={selectedToken.logoUrl}
								alt={selectedToken.symbol}
								class="h-6 w-6 rounded-full"
							/>
							<span class="font-medium text-text">{selectedToken.symbol}</span>
						{:else}
							<span class="text-text-3">Select</span>
						{/if}
						<svg class="h-4 w-4 text-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					{#if isDropdownOpen}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							on:click|stopPropagation
							class="absolute left-0 top-full z-[100] mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface-1 shadow-xl"
						>
							<!-- Scroll up indicator -->
							{#if canScrollUp}
								<div class="flex justify-center border-b border-line py-1">
									<svg
										class="h-4 w-4 text-text-muted"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 15l7-7 7 7"
										/>
									</svg>
								</div>
							{/if}
							<div
								class="token-dropdown max-h-[232px] overflow-y-scroll py-2"
								on:scroll={handleDropdownScroll}
								bind:this={dropdownScrollEl}
							>
								{#each tradableTokens as token (token.address)}
									<button
										type="button"
										on:click|stopPropagation={() => handleTokenSelect(token.address)}
										class="flex w-full items-center gap-3 px-4 py-2 text-left transition hover:bg-surface-2"
									>
										<img src={token.logoUrl} alt={token.symbol} class="h-6 w-6 rounded-full" />
										<div>
											<div class="font-medium text-text">{token.symbol}</div>
											<div class="text-xs text-text-3">{token.name}</div>
										</div>
									</button>
								{/each}
							</div>
							<!-- Scroll down indicator -->
							{#if canScrollDown}
								<div class="flex justify-center border-t border-line py-1">
									<svg
										class="h-4 w-4 text-text-muted"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 9l-7 7-7-7"
										/>
									</svg>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<div class="flex-1 text-right">
					<input
						type="text"
						inputmode="decimal"
						placeholder="0"
						value={bottomAmount}
						on:input={handleBottomInput}
						class="w-full bg-transparent text-right text-xl font-medium text-text placeholder-text-3 focus:outline-none sm:text-2xl"
					/>
				</div>
			</div>
			<div class="flex items-center justify-between px-1 text-xs">
				<span class="text-text-3">
					{#if $isAuthenticated && $walletAddress}
						Balance: {formattedTokenBalance.toFixed(4)} {selectedToken?.symbol ?? ''}
					{:else if quote?.avgPrice}
						~{formatPrice(quote.avgPrice)}/token
					{:else if isBuying ? bestAskPrice : bestBidPrice}
						Best: {formatPrice((isBuying ? bestAskPrice : bestBidPrice) ?? 0)}
					{/if}
				</span>
				<div class="flex items-center gap-1">
					{#if !isBuying && $isAuthenticated && $walletAddress && formattedTokenBalance > 0}
						{#each [25, 50, 75, 100] as percent}
							<button
								type="button"
								on:click={() => handleTokenPercentClick(percent)}
								class="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-3 transition hover:bg-surface-2 hover:text-text"
							>
								{percent === 100 ? 'MAX' : `${percent}%`}
							</button>
						{/each}
					{/if}
				</div>
			</div>
			{#if !isBuying && quote && !quote.hasLiquidity}
				<div
					class="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300"
				>
					Not enough liquidity to fully fill your order.
					{#if isOutsideMarketHours()}
						<br />This might be because US markets are currently closed.
					{/if}
				</div>
			{/if}
		</div>

		<!-- Network info -->
		<div class="flex items-center justify-center gap-2 text-xs text-text-3">
			<span>Trading on</span>
			<img src="/images/BASE.svg" alt="Base" class="h-4 w-4" />
			<span class="text-text-2">{$currentNetwork?.displayName ?? 'Base'}</span>
		</div>

		<!-- Error display -->
		{#if visibleTradeError}
			<TradeErrorPanel error={visibleTradeError} />
		{/if}

		<!-- Action button -->
		{#if $isAuthenticated && $walletAddress}
			<Button
				variant="primary"
				size="lg"
				className="w-full rounded-xl py-4 text-base font-semibold"
				disabled={isExecutingTrade || !tradeAnchor}
				on:click={handleTrade}
			>
				{#if isExecutingTrade}
					<span class="flex items-center justify-center gap-2">
						<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
						</svg>
						Processing...
					</span>
				{:else if !topAmount && !bottomAmount}
					Enter amount
				{:else if isBuying}
					Buy {selectedToken?.symbol}
				{:else}
					Sell {selectedToken?.symbol}
				{/if}
			</Button>
		{:else}
			<Button
				variant="primary"
				size="lg"
				className="w-full rounded-xl py-4 text-base font-semibold"
				on:click={handleConnectWallet}
			>
				Connect wallet
			</Button>
		{/if}

		<!-- or divider -->
		<div class="flex items-center gap-3 text-[11px] uppercase tracking-wider text-text-muted">
			<span class="h-px flex-1 bg-line"></span>
			<span>or</span>
			<span class="h-px flex-1 bg-line"></span>
		</div>

		<!-- Launch Trading Terminal (secondary) -->
		<button
			type="button"
			class="w-full rounded-xl border border-line-strong bg-overlay-2 py-3 text-sm font-semibold text-text transition hover:bg-overlay-hover"
			on:click={() => goto('/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95')}
		>
			Launch Trading Terminal
		</button>
	</div>

	<!-- Right: ambient price chart for the selected token (md+ only) -->
	<div class="relative hidden md:block">
		<div class="h-full min-h-[320px] overflow-hidden rounded-xl border border-line bg-bg-deep">
			<QuickTradeChart token={selectedToken} fallbackPrice={selectedMarketPrice ?? null} />
		</div>
	</div>
</div>

<style>
	.token-dropdown {
		scrollbar-width: thin;
		scrollbar-color: rgb(107 114 128) rgb(55 65 81);
	}

	.token-dropdown::-webkit-scrollbar {
		width: 8px;
		-webkit-appearance: none;
	}

	.token-dropdown::-webkit-scrollbar-track {
		background: rgb(55 65 81);
		border-radius: 4px;
	}

	.token-dropdown::-webkit-scrollbar-thumb {
		background-color: rgb(107 114 128);
		border-radius: 4px;
	}

	.token-dropdown::-webkit-scrollbar-thumb:hover {
		background-color: rgb(156 163 175);
	}
</style>
