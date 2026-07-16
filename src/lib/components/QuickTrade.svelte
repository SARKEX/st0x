<script lang="ts">
	import { web3Modal, wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import { readContract } from '@wagmi/core';
	import { erc20Abi, formatUnits, parseUnits } from 'viem';
	import { createQuery } from '@tanstack/svelte-query';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { OrderbookQuoteCache } from '$lib/queries/orderbook';
	import { createApiTokensQuery } from '$lib/queries/tokens';
	import { walletRegistered, promptLogin } from '$lib/stores/accessStore';
	import { openAuthModal } from '$lib/stores/dynamicStore';
	import type { ProcessedQuote } from '$lib/utils/orderbook';
	import {
		getMakerInputTokenAddress,
		getMakerOutputTokenAddress
	} from '$lib/types/orderPerspective';
	import Button from './ui/Button.svelte';
	import { isOutsideMarketHours } from '$lib/utils/marketHours';
	import { track } from '$lib/services/analytics';
	import QuickTradeChart from './QuickTradeChart.svelte';
	import Icon from './ui/Icon.svelte';
	import { goto } from '$app/navigation';

	type ParseFloatHex = typeof import('$lib/utils/tokenMath').parseFloatHex;

	let parseFloatHexFn: ParseFloatHex | null = null;
	let parseFloatVersion = 0;
	let parseFloatImportPromise: Promise<ParseFloatHex> | null = null;

	function normalizeAddress(value: string | null | undefined): string | null {
		const trimmed = value?.trim();
		return trimmed ? trimmed.toLowerCase() : null;
	}

	function loadParseFloatHex(): Promise<ParseFloatHex> {
		parseFloatImportPromise ??= import('$lib/utils/tokenMath').then((mod) => {
			parseFloatHexFn = mod.parseFloatHex;
			parseFloatVersion += 1;
			return mod.parseFloatHex;
		});
		return parseFloatImportPromise;
	}

	function parseQuoteFloat(hexAmount: string, decimals: number): bigint {
		if (!parseFloatHexFn) {
			void loadParseFloatHex();
			return 0n;
		}
		return parseFloatHexFn(hexAmount, decimals);
	}

	// Analytics tracking
	let panelOpenTime = Date.now();
	let tradeSubmittedSuccessfully = false;
	let previousTokenSymbol: string | null = null;

	// ============ TOKEN SELECTION (completely independent) ============
	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: apiTokens = $apiTokensQuery.data ?? [];
	$: tradableTokens = apiTokens.filter((t) => t.category === 'ST0x');

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
		tradeError = null;
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
	let tradeError: string | null = null;

	// ============ DATA LOADING ============
	$: paymentToken = $currentNetwork?.defaultPaymentToken;

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
	$: isLoadingQuotes = $orderbookQuery.isPending && !$orderbookQuery.data;
	$: quoteFetchError = $orderbookQuery.isError;

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
		if (!tradeSubmittedSuccessfully && (topAmount || bottomAmount)) {
			track('quick_trade_abandoned', {
				token_symbol: selectedToken?.symbol,
				direction: isBuying ? 'buy' : 'sell',
				values_entered: {
					usdc_amount: topAmount || null,
					token_amount: bottomAmount || null
				},
				time_spent_ms: Date.now() - panelOpenTime,
				last_error: tradeError || (showLiquidityWarning ? 'insufficient_liquidity' : null)
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

	$: relevantQuotes = isBuying ? askQuotes : bidQuotes;
	$: bestAskPrice = askQuotes.length > 0 ? askQuotes[0].quotePerAsset : null;
	$: bestBidPrice = bidQuotes.length > 0 ? bidQuotes[0].quotePerAsset : null;

	// ============ MAX LIQUIDITY CALCULATION ============
	// Calculate maximum USDC that can be spent when buying
	$: maxBuyUsdcAvailable = (() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dep: re-run once parseFloatHex lazy-loads (parseQuoteFloat returns 0n until then)
		parseFloatVersion;
		if (askQuotes.length === 0 || !selectedToken || !paymentToken) return 0;
		let totalUsdc = 0n;
		const paymentDecimals = paymentToken.decimals ?? 6;
		const assetDecimals = selectedToken.decimals ?? 18;

		for (const q of askQuotes) {
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;
			let maxAssetAvailable = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? assetDecimals;
				maxAssetAvailable = parseQuoteFloat(q.maxOutput, outputDecimals);
			}
			if (maxAssetAvailable <= 0n) continue;
			const usdcForQuote = BigInt(
				Math.ceil((Number(maxAssetAvailable) / 10 ** assetDecimals) * price * 10 ** paymentDecimals)
			);
			totalUsdc += usdcForQuote;
		}
		return Number(totalUsdc) / 10 ** paymentDecimals;
	})();

	// Calculate maximum tokens that can be bought (sum of ask maxOutput)
	$: maxBuyTokensAvailable = (() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dep: re-run once parseFloatHex lazy-loads (parseQuoteFloat returns 0n until then)
		parseFloatVersion;
		if (askQuotes.length === 0 || !selectedToken) return 0;
		let totalTokens = 0n;
		const assetDecimals = selectedToken.decimals ?? 18;

		for (const q of askQuotes) {
			let maxAssetAvailable = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? assetDecimals;
				maxAssetAvailable = parseQuoteFloat(q.maxOutput, outputDecimals);
				if (outputDecimals !== assetDecimals) {
					const scale = 10n ** BigInt(Math.abs(assetDecimals - outputDecimals));
					maxAssetAvailable =
						outputDecimals < assetDecimals ? maxAssetAvailable * scale : maxAssetAvailable / scale;
				}
			}
			if (maxAssetAvailable > 0n) totalTokens += maxAssetAvailable;
		}
		return Number(totalTokens) / 10 ** assetDecimals;
	})();

	// Calculate maximum tokens that can be sold
	$: maxSellTokensAvailable = (() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dep: re-run once parseFloatHex lazy-loads (parseQuoteFloat returns 0n until then)
		parseFloatVersion;
		if (bidQuotes.length === 0 || !selectedToken || !paymentToken) return 0;
		let totalTokens = 0n;
		const paymentDecimals = paymentToken.decimals ?? 6;
		const assetDecimals = selectedToken.decimals ?? 18;

		for (const q of bidQuotes) {
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;
			let maxUsdcFromBid = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? paymentDecimals;
				maxUsdcFromBid = parseQuoteFloat(q.maxOutput, outputDecimals);
			}
			if (maxUsdcFromBid <= 0n) continue;
			const tokensForBid = BigInt(
				Math.floor((Number(maxUsdcFromBid) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
			);
			totalTokens += tokensForBid;
		}
		return Number(totalTokens) / 10 ** assetDecimals;
	})();

	// Calculate maximum USDC that can be received when selling (sum of bid maxOutput)
	$: maxSellUsdcAvailable = (() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dep: re-run once parseFloatHex lazy-loads (parseQuoteFloat returns 0n until then)
		parseFloatVersion;
		if (bidQuotes.length === 0 || !paymentToken) return 0;
		let totalUsdc = 0n;
		const paymentDecimals = paymentToken.decimals ?? 6;

		for (const q of bidQuotes) {
			let maxUsdcFromBid = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? paymentDecimals;
				maxUsdcFromBid = parseQuoteFloat(q.maxOutput, outputDecimals);
				if (outputDecimals !== paymentDecimals) {
					const scale = 10n ** BigInt(Math.abs(paymentDecimals - outputDecimals));
					maxUsdcFromBid =
						outputDecimals < paymentDecimals ? maxUsdcFromBid * scale : maxUsdcFromBid / scale;
				}
			}
			if (maxUsdcFromBid > 0n) totalUsdc += maxUsdcFromBid;
		}
		return Number(totalUsdc) / 10 ** paymentDecimals;
	})();

	// ============ QUOTE CALCULATION ============
	$: quote = (() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- reactive dep: re-run once parseFloatHex lazy-loads (parseQuoteFloat returns 0n until then)
		parseFloatVersion;
		return computeQuote(
			isBuying,
			lastEditedField,
			topAmount,
			bottomAmount,
			askQuotes,
			bidQuotes,
			selectedToken,
			paymentToken
		);
	})();

	$: syncOtherField(quote, lastEditedField);

	function syncOtherField(q: typeof quote, editedField: typeof lastEditedField) {
		if (!q?.calculatedAmount || !editedField) return;
		const newValue = formatTokenAmount(q.calculatedAmount);
		if (editedField === 'top') {
			bottomAmount = newValue;
		} else {
			topAmount = newValue;
		}
		// Note: We no longer cap while typing - capping happens on blur
	}

	// Track if we capped due to liquidity - persists until user types again
	let showLiquidityWarning = false;
	let hasCappedThisBlur = false;

	// Cap amounts at max available when liquidity is insufficient
	function capAmountsIfNeeded() {
		// If there's sufficient liquidity and we haven't capped, nothing to do
		if (!quote || (quote.hasLiquidity && !showLiquidityWarning)) {
			return;
		}

		// If we already capped on this blur event, don't cap again
		if (hasCappedThisBlur) return;

		// If there's not enough liquidity, cap and show warning
		if (!quote.hasLiquidity) {
			if (isBuying) {
				if (lastEditedField === 'top') {
					// User edited USDC amount - cap USDC to max available
					const enteredUsdc = parseFloat(topAmount);
					if (
						Number.isFinite(enteredUsdc) &&
						enteredUsdc > maxBuyUsdcAvailable &&
						maxBuyUsdcAvailable > 0
					) {
						topAmount = maxBuyUsdcAvailable.toFixed(2);
						showLiquidityWarning = true;
						hasCappedThisBlur = true;
					}
				} else if (lastEditedField === 'bottom') {
					// User edited token amount - cap tokens to max available
					const enteredTokens = parseFloat(bottomAmount);
					if (
						Number.isFinite(enteredTokens) &&
						enteredTokens > maxBuyTokensAvailable &&
						maxBuyTokensAvailable > 0
					) {
						bottomAmount = formatTokenAmount(maxBuyTokensAvailable);
						showLiquidityWarning = true;
						hasCappedThisBlur = true;
					}
				}
			} else {
				// Selling
				if (lastEditedField === 'bottom') {
					// User edited token amount - cap tokens to max available
					const enteredTokens = parseFloat(bottomAmount);
					if (
						Number.isFinite(enteredTokens) &&
						enteredTokens > maxSellTokensAvailable &&
						maxSellTokensAvailable > 0
					) {
						bottomAmount = formatTokenAmount(maxSellTokensAvailable);
						showLiquidityWarning = true;
						hasCappedThisBlur = true;
					}
				} else if (lastEditedField === 'top') {
					// User edited USDC amount - cap USDC to max available
					const enteredUsdc = parseFloat(topAmount);
					if (
						Number.isFinite(enteredUsdc) &&
						enteredUsdc > maxSellUsdcAvailable &&
						maxSellUsdcAvailable > 0
					) {
						topAmount = maxSellUsdcAvailable.toFixed(2);
						showLiquidityWarning = true;
						hasCappedThisBlur = true;
					}
				}
			}
		}
	}

	function computeQuote(
		buying: boolean,
		editedField: 'top' | 'bottom' | null,
		top: string,
		bottom: string,
		asks: ProcessedQuote[],
		bids: ProcessedQuote[],
		asset: (typeof tradableTokens)[0] | undefined,
		payment: typeof paymentToken
	) {
		if (!asset || !payment || !editedField) return null;

		const assetDecimals = asset.decimals ?? 18;
		const paymentDecimals = payment.decimals ?? 6;

		if (buying) {
			const quotes = asks;
			if (quotes.length === 0) return null;

			if (editedField === 'top') {
				const usdcAmount = parseFloat(top);
				if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
				return walkUsdcToTokens(usdcAmount, quotes, assetDecimals, paymentDecimals);
			} else {
				const tokenAmount = parseFloat(bottom);
				if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;
				return walkTokensToUsdc(tokenAmount, quotes, assetDecimals, paymentDecimals, 'buy');
			}
		} else {
			const quotes = bids;
			if (quotes.length === 0) return null;

			if (editedField === 'bottom') {
				const tokenAmount = parseFloat(bottom);
				if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return null;
				return walkTokensToUsdc(tokenAmount, quotes, assetDecimals, paymentDecimals, 'sell');
			} else {
				const usdcAmount = parseFloat(top);
				if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
				return walkUsdcToTokensSell(usdcAmount, quotes, assetDecimals, paymentDecimals);
			}
		}
	}

	function walkUsdcToTokens(
		usdcAmount: number,
		quotes: ProcessedQuote[],
		assetDecimals: number,
		paymentDecimals: number
	) {
		let remainingUsdc = parseUnits(usdcAmount.toString(), paymentDecimals);
		let totalTokensOut = 0n;
		let weightedPriceSum = 0;

		for (const q of quotes) {
			if (remainingUsdc <= 0n) break;
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;

			let maxAssetAvailable = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? assetDecimals;
				maxAssetAvailable = parseQuoteFloat(q.maxOutput, outputDecimals);
				if (outputDecimals !== assetDecimals) {
					const scale = 10n ** BigInt(Math.abs(assetDecimals - outputDecimals));
					maxAssetAvailable =
						outputDecimals < assetDecimals ? maxAssetAvailable * scale : maxAssetAvailable / scale;
				}
			}
			if (maxAssetAvailable <= 0n) continue;

			const maxUsdcForQuote = BigInt(
				Math.ceil((Number(maxAssetAvailable) / 10 ** assetDecimals) * price * 10 ** paymentDecimals)
			);
			const usdcToUse = remainingUsdc < maxUsdcForQuote ? remainingUsdc : maxUsdcForQuote;
			const tokensFromQuote = BigInt(
				Math.floor((Number(usdcToUse) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
			);
			if (tokensFromQuote <= 0n) continue;

			totalTokensOut += tokensFromQuote;
			remainingUsdc -= usdcToUse;
			weightedPriceSum += price * Number(tokensFromQuote);
		}

		if (totalTokensOut <= 0n) return null;
		return {
			calculatedAmount: Number(totalTokensOut) / 10 ** assetDecimals,
			avgPrice: weightedPriceSum / Number(totalTokensOut),
			hasLiquidity: remainingUsdc <= 0n
		};
	}

	function walkTokensToUsdc(
		tokenAmount: number,
		quotes: ProcessedQuote[],
		assetDecimals: number,
		paymentDecimals: number,
		direction: 'buy' | 'sell'
	) {
		let remainingTokens = parseUnits(tokenAmount.toString(), assetDecimals);
		let totalUsdc = 0n;
		let weightedPriceSum = 0;
		let tokensFilled = 0n;

		for (const q of quotes) {
			if (remainingTokens <= 0n) break;
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;

			let maxAvailable = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals =
					q.outputTokenDecimals ?? (direction === 'buy' ? assetDecimals : paymentDecimals);
				maxAvailable = parseQuoteFloat(q.maxOutput, outputDecimals);
			}
			if (maxAvailable <= 0n) continue;

			let tokensFromQuote: bigint;
			let usdcFromQuote: bigint;

			if (direction === 'buy') {
				const maxTokens = maxAvailable;
				tokensFromQuote = remainingTokens < maxTokens ? remainingTokens : maxTokens;
				usdcFromQuote = BigInt(
					Math.ceil((Number(tokensFromQuote) / 10 ** assetDecimals) * price * 10 ** paymentDecimals)
				);
			} else {
				const maxUsdcFromBid = maxAvailable;
				const maxTokensForBid = BigInt(
					Math.floor((Number(maxUsdcFromBid) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
				);
				tokensFromQuote = remainingTokens < maxTokensForBid ? remainingTokens : maxTokensForBid;
				usdcFromQuote = BigInt(
					Math.floor(
						(Number(tokensFromQuote) / 10 ** assetDecimals) * price * 10 ** paymentDecimals
					)
				);
			}

			if (tokensFromQuote <= 0n) continue;
			tokensFilled += tokensFromQuote;
			totalUsdc += usdcFromQuote;
			remainingTokens -= tokensFromQuote;
			weightedPriceSum += price * Number(tokensFromQuote);
		}

		if (tokensFilled <= 0n) return null;
		return {
			calculatedAmount: Number(totalUsdc) / 10 ** paymentDecimals,
			avgPrice: weightedPriceSum / Number(tokensFilled),
			hasLiquidity: remainingTokens <= 0n
		};
	}

	function walkUsdcToTokensSell(
		usdcAmount: number,
		quotes: ProcessedQuote[],
		assetDecimals: number,
		paymentDecimals: number
	) {
		let remainingUsdc = parseUnits(usdcAmount.toString(), paymentDecimals);
		let totalTokensNeeded = 0n;
		let weightedPriceSum = 0;

		for (const q of quotes) {
			if (remainingUsdc <= 0n) break;
			const price = q.quotePerAsset ?? 0;
			if (price <= 0) continue;

			let maxUsdcFromBid = 0n;
			if (typeof q.maxOutput === 'string' && q.maxOutput.startsWith('0x')) {
				const outputDecimals = q.outputTokenDecimals ?? paymentDecimals;
				maxUsdcFromBid = parseQuoteFloat(q.maxOutput, outputDecimals);
			}
			if (maxUsdcFromBid <= 0n) continue;

			const usdcToGet = remainingUsdc < maxUsdcFromBid ? remainingUsdc : maxUsdcFromBid;
			const tokensNeeded = BigInt(
				Math.ceil((Number(usdcToGet) / 10 ** paymentDecimals / price) * 10 ** assetDecimals)
			);
			if (tokensNeeded <= 0n) continue;

			totalTokensNeeded += tokensNeeded;
			remainingUsdc -= usdcToGet;
			weightedPriceSum += price * Number(tokensNeeded);
		}

		if (totalTokensNeeded <= 0n) return null;
		return {
			calculatedAmount: Number(totalTokensNeeded) / 10 ** assetDecimals,
			avgPrice: weightedPriceSum / Number(totalTokensNeeded),
			hasLiquidity: remainingUsdc <= 0n
		};
	}

	// ============ INPUT HANDLERS ============
	function handleTopInput(e: Event) {
		const target = e.target as HTMLInputElement;
		topAmount = target.value;
		lastEditedField = 'top';
		// Reset warning flags when user starts typing
		showLiquidityWarning = false;
		hasCappedThisBlur = false;
		// Clear the other field to prevent both having user-entered values while prices load
		bottomAmount = '';
	}

	function handleBottomInput(e: Event) {
		const target = e.target as HTMLInputElement;
		bottomAmount = target.value;
		lastEditedField = 'bottom';
		// Reset warning flags when user starts typing
		showLiquidityWarning = false;
		hasCappedThisBlur = false;
		// Clear the other field to prevent both having user-entered values while prices load
		topAmount = '';
	}

	function handleSwapDirection() {
		isBuying = !isBuying;
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
		showLiquidityWarning = false;
		hasCappedThisBlur = false;
	}

	function handleTokenPercentClick(percent: number) {
		const amount = (formattedTokenBalance * percent) / 100;
		// Use floor to prevent rounding up beyond actual balance (fixes "not enough funds" on MAX)
		const flooredAmount = Math.floor(amount * 1e6) / 1e6;
		bottomAmount = flooredAmount.toFixed(6);
		lastEditedField = 'bottom';
		showLiquidityWarning = false;
		hasCappedThisBlur = false;
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
		if (!$walletRegistered) {
			promptLogin();
			return;
		}
		if (!selectedToken || !paymentToken || !$currentNetwork || !quote || isExecutingTrade) {
			return;
		}

		const tokenAmount = parseFloat(bottomAmount);
		if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) return;
		const tradeAmount = parseUnits(tokenAmount.toString(), selectedToken.decimals);
		const orderSide = isBuying ? 'Buy' : 'Sell';

		isExecutingTrade = true;
		tradeError = null;

		try {
			const { executeMarketOrder, filterQuotesForSide, sortQuotesByPrice } = await import(
				'$lib/services/marketOrderExecution'
			);
			const relevantQuotes = filterQuotesForSide(
				quotes,
				orderSide,
				selectedToken.address,
				paymentToken.address
			);
			const sortedQuotes = sortQuotesByPrice(relevantQuotes, orderSide);

			if (sortedQuotes.length === 0) {
				tradeError = 'No liquidity available';
				return;
			}

			const result = await executeMarketOrder({
				orderSide,
				amount: tradeAmount,
				inputMode: 'amount',
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
				quotes: sortedQuotes,
				network: $currentNetwork
			});

			if (!result.success) {
				tradeError = result.error || 'Trade failed';
				track('quick_trade_failed', {
					token_symbol: selectedToken?.symbol,
					direction: isBuying ? 'buy' : 'sell',
					usdc_amount: topAmount,
					token_amount: bottomAmount,
					avg_price: quote?.avgPrice,
					error: tradeError
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
			tradeError = error instanceof Error ? error.message : 'Trade failed';
			track('quick_trade_failed', {
				token_symbol: selectedToken?.symbol,
				direction: isBuying ? 'buy' : 'sell',
				usdc_amount: topAmount,
				token_amount: bottomAmount,
				avg_price: quote?.avgPrice,
				error: tradeError
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
						on:blur={capAmountsIfNeeded}
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
			{#if isBuying && quote && (!quote.hasLiquidity || showLiquidityWarning)}
				<div
					class="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300"
				>
					{#if showLiquidityWarning}
						Order capped to max available liquidity.
					{:else}
						Not enough liquidity to fully fill your order.
					{/if}
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
						on:blur={capAmountsIfNeeded}
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
			{#if !isBuying && quote && (!quote.hasLiquidity || showLiquidityWarning)}
				<div
					class="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300"
				>
					{#if showLiquidityWarning}
						Order capped to max available liquidity.
					{:else}
						Not enough liquidity to fully fill your order.
					{/if}
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
		{#if tradeError}
			<div class="rounded-lg bg-down-soft px-3 py-2 text-center text-sm text-down">
				{tradeError}
			</div>
		{/if}

		<!-- Action button -->
		{#if $isAuthenticated && $walletAddress}
			<Button
				variant="primary"
				size="lg"
				className="w-full rounded-xl py-4 text-base font-semibold"
				disabled={isExecutingTrade ||
					isLoadingQuotes ||
					(!(quoteFetchError && relevantQuotes.length === 0) &&
						(!quote || (!topAmount && !bottomAmount)))}
				on:click={quoteFetchError && relevantQuotes.length === 0
					? () => $orderbookQuery.refetch()
					: handleTrade}
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
				{:else if isLoadingQuotes}
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
						Loading prices...
					</span>
				{:else if quoteFetchError && relevantQuotes.length === 0}
					Couldn't load prices — tap to retry
				{:else if relevantQuotes.length === 0}
					No liquidity
				{:else if !quote}
					No liquidity
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
			<QuickTradeChart token={selectedToken} fallbackPrice={bestAskPrice ?? bestBidPrice} />
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
