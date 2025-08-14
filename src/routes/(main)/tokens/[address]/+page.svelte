<script lang="ts">
	import { currentNetwork, currentToken } from '$lib/stores';
	import { createInfiniteQuery, createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { getTrades } from '$lib/query';
	import TradeHistoryTable from '$lib/components/tables/TradeHistoryTable.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { env as publicEnv } from '$env/dynamic/public';
	import { goto } from '$app/navigation';
	import { orderTokenStore } from '$lib/stores';
	import { TOKENS } from '$lib/network';
	import { ArrowUpRightFromSquareSolid } from 'flowbite-svelte-icons';
	import { page } from '$app/stores';

	const symbol = $currentToken?.symbol.split('s1')[0];

	// Find the corresponding PythToken from TOKENS array
	$: currentPythToken = TOKENS.find(
		(token) => token.address.toLowerCase() === $currentToken?.address.toLowerCase()
	);

	// Query for price data - refetches every 60 seconds
	$: priceQuery = createQuery({
		queryKey: ['tokenPrice', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY || ''}`
			);
			return await response.json();
		},
		refetchInterval: 60000 // Refetch every 60 seconds
	});

	// Query for overview data - fetches only once
	$: overviewQuery = createQuery({
		queryKey: ['tokenOverview', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY || ''}`
			);
			return await response.json();
		}
	});

	$: timeseriesQuery = createQuery({
		queryKey: ['timeseries', $currentToken?.symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${
					$currentToken?.symbol?.split('s1')[0]
				}&outputsize=full&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY || ''}`
			);
			return await response.json();
		},
		enabled: !!$currentToken?.symbol && !!$currentNetwork
	});

	$: tradesQuery = createInfiniteQuery({
		queryKey: ['trades', $currentToken?.id, $currentNetwork?.id],
		queryFn: async ({ pageParam = 0 }) => {
			const now = Math.floor(Date.now() / 1000);
			const monthAgo = now - 30 * 86400; // Example range, adjust as needed
			const trades = await getTrades(monthAgo, now, $currentNetwork);

			const filteredTrades = trades.filter(
				(trade) =>
					trade.outputVaultBalanceChange.vault.token.id.toLowerCase() ===
						$currentToken?.id.toLowerCase() ||
					trade.inputVaultBalanceChange.vault.token.id.toLowerCase() ===
						$currentToken?.id.toLowerCase()
			);

			// Simple pagination - return a subset based on pageParam
			const pageSize = 20;
			const startIndex = pageParam * pageSize;
			const endIndex = startIndex + pageSize;
			const paginatedTrades = filteredTrades.slice(startIndex, endIndex);

			return {
				trades: paginatedTrades,
				hasMore: endIndex < filteredTrades.length
			};
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage, _allPages, lastPageParam) => {
			return lastPage.hasMore ? lastPageParam + 1 : undefined;
		},
		enabled: !!$currentToken?.id && !!$currentNetwork
	});

	$: globalQuote = $priceQuery.data?.['Global Quote'];

	$: marketCap =
		$currentToken?.totalShares && globalQuote?.['05. price']
			? (BigInt($currentToken.totalShares) *
					BigInt(Math.floor(parseFloat(globalQuote['05. price']) * 100))) /
				BigInt(100)
			: 0n;

	$: priceChange = parseFloat(globalQuote?.['09. change']) || 0;

	$: percentChange = parseFloat(globalQuote?.['10. change percent']?.replace('%', '')) || 0;

	// Utility Classes (matching dashboard theme)
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';

	function handleBuyClick() {
		if (currentPythToken) {
			// Find USDC in TOKENS array to ensure it has priceFeedId
			const usdcWithPriceFeed =
				TOKENS.find((t) => t.symbol === 'USDC') || $currentNetwork.usdcToken;

			// Set the token data in the store for buying (USDC -> ST0x)
			orderTokenStore.set({
				inputToken: usdcWithPriceFeed,
				outputToken: currentPythToken,
				orderType: 'Buy'
			});

			// Navigate to the neworder page
			goto('/trade');
		}
	}

	function handleSellClick() {
		if (currentPythToken) {
			// Find USDC in TOKENS array to ensure it has priceFeedId
			const usdcWithPriceFeed =
				TOKENS.find((t) => t.symbol === 'USDC') || $currentNetwork.usdcToken;

			// Set the token data in the store for selling (ST0x -> USDC)
			orderTokenStore.set({
				inputToken: currentPythToken,
				outputToken: usdcWithPriceFeed,
				orderType: 'Sell'
			});

			// Navigate to the neworder page
			goto('/trade');
		}
	}
</script>

{#if $priceQuery.isLoading || $overviewQuery.isLoading || $timeseriesQuery.isLoading || $tradesQuery.isLoading}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading token data..." />
	</div>
{:else if $priceQuery.data && $overviewQuery.data && $timeseriesQuery.data && $tradesQuery.data}
	<div class="mx-6 mt-4 flex max-w-full justify-center">
		<div
			class="flex w-full max-w-full flex-col items-start rounded-lg border border-white/10 px-4 py-3 shadow"
		>
			<div class="mb-1 text-xl font-bold tracking-wide text-white">
				{$currentToken?.name} - {symbol} Token Details
			</div>
		</div>
	</div>

	<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
		<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
			<!-- Card 1: Equity Price Information -->
			<div class="{CARD_BASE_CLASSES} p-4 sm:p-6 lg:col-span-1">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:text-sm">
					Equity Price
				</h3>
				<div class="space-y-4">
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Current Price</span>
						<div class="flex items-center gap-2">
							{#if $priceQuery.isFetching && !$priceQuery.isLoading}
								<LoadingSpinner variant="dot" text="Updating price..." />
							{/if}
							<span class="text-xl font-bold text-green-400 sm:text-2xl">
								${(parseFloat(globalQuote?.['05. price']) || 0).toFixed(2)}
							</span>
						</div>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">24h Change</span>
						<span
							class="font-semibold"
							class:text-green-400={priceChange >= 0}
							class:text-red-400={priceChange < 0}
						>
							{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}
						</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">24h Change %</span>
						<span
							class="font-semibold"
							class:text-green-400={percentChange >= 0}
							class:text-red-400={percentChange < 0}
						>
							{percentChange.toFixed(2)}%
						</span>
					</div>
				</div>

				<div class="my-6 border-t border-white/10"></div>

				<h3 class="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:text-sm">
					Equity Overview
				</h3>
				<div class="space-y-4">
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Symbol</span>
						<span class="font-semibold">{$overviewQuery.data.Symbol}</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Name</span>
						<span class="font-semibold">{$overviewQuery.data.Name}</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Sector</span>
						<span class="font-semibold">{$overviewQuery.data.Sector}</span>
					</div>
				</div>
				<div class="mt-6 flex items-center gap-3">
					<a
						href={`/tokens/${$currentToken?.id}/chart`}
						class="flex items-center gap-2 rounded-lg border border-white/20 bg-gray-700/80 px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:border-yellow-500/50 hover:bg-gray-600/80"
					>
						<span>Open Chart</span>
						<ArrowUpRightFromSquareSolid class="h-4 w-4" />
					</a>
				</div>
			</div>

			<!-- Card 2: Market Cap & Supply -->
			<div class="{CARD_BASE_CLASSES} p-4 sm:p-6 lg:col-span-1">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:text-sm">
					Market Metrics
				</h3>
				<div class="space-y-4">
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Market Cap (approx)</span>
						<span class="font-semibold">${parseFloat(formatUnits(marketCap, 18)).toFixed(2)}</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Total Shares</span>
						<span class="font-semibold">{formatUnits(BigInt($currentToken?.totalShares || 0), 18)}</span>
					</div>
				</div>
			</div>

			<!-- Card 3: Buy/Sell Actions -->
			<div class="{CARD_BASE_CLASSES} p-4 sm:p-6 lg:col-span-1">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:text-sm">
					Actions
				</h3>
				<div class="flex gap-3">
					<button
						on:click={handleBuyClick}
						class="flex-1 rounded-lg border border-white/20 bg-green-600/20 px-3 py-2 text-sm font-semibold text-green-300 transition-all hover:border-green-500/40 hover:bg-green-600/30"
					>
						Buy
					</button>
					<button
						on:click={handleSellClick}
						class="flex-1 rounded-lg border border-white/20 bg-red-600/20 px-3 py-2 text-sm font-semibold text-red-300 transition-all hover:border-red-500/40 hover:bg-red-600/30"
					>
						Sell
					</button>
				</div>
			</div>
		</div>

		<!-- Trade History Table -->
		<div class="{SECTION_CLASSES}">
			<h3 class="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400 sm:text-sm">
				Trade History
			</h3>
			<TradeHistoryTable trades={$tradesQuery.data?.pages.flatMap((p) => p.trades) || []} />
		</div>
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">Failed to load token data</h2>
			<p class="text-gray-500">Please try again later.</p>
		</div>
	</div>
{/if}
