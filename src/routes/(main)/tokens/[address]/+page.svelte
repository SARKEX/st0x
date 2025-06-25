<script lang="ts">
	import { currentToken } from '$lib/stores';
	import { createInfiniteQuery, createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import EquityChart from '$lib/components/charts/EquityChart.svelte';
	import { getTrades } from '$lib/query';
	import TradeHistoryTable from '$lib/components/tables/TradeHistoryTable.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { PUBLIC_ALPHAVANTAGE_API_KEY } from '$env/static/public';
	import Header from '$lib/components/Header.svelte';

	const symbol = $currentToken?.symbol.split('s1')[0];

	// Query for price data - refetches every 60 seconds
	$: priceQuery = createQuery({
		queryKey: ['tokenPrice', symbol],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			return await response.json();
		},
		refetchInterval: 60000 // Refetch every 60 seconds
	});

	// Query for overview data - fetches only once
	$: overviewQuery = createQuery({
		queryKey: ['tokenOverview', symbol],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			return await response.json();
		}
	});

	$: timeseriesQuery = createQuery({
		queryKey: ['timeseries', $currentToken?.symbol],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${
					$currentToken?.symbol?.split('s1')[0]
				}&outputsize=full&apikey=${PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			return await response.json();
		},
		enabled: !!$currentToken?.symbol
	});

	$: tradesQuery = createInfiniteQuery({
		queryKey: ['trades', $currentToken?.id],
		queryFn: async ({ pageParam = 0 }) => {
			const now = Math.floor(Date.now() / 1000);
			const monthAgo = now - 30 * 86400; // Example range, adjust as needed
			const trades = await getTrades(monthAgo, now);

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
		enabled: !!$currentToken?.id
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
</script>

{#if $priceQuery.isLoading || $overviewQuery.isLoading || $timeseriesQuery.isLoading || $tradesQuery.isLoading}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading token data..." />
	</div>
{:else if $priceQuery.data && $overviewQuery.data && $timeseriesQuery.data && $tradesQuery.data}
	<div class="space-y-6 sm:space-y-8 p-4 sm:p-6">
		<!-- Header Section -->
		<Header title={$currentToken?.name ?? ''} description={$currentToken?.symbol ?? ''} />

		<!-- Bottom Row: Card 1 and Equity Chart -->
		<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
			<!-- Card 1: Equity Price Information -->
			<div class="{CARD_BASE_CLASSES} p-4 sm:p-6 lg:col-span-1">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-xs sm:text-sm font-medium uppercase tracking-wide text-gray-400">Equity Price</h3>
				<div class="space-y-4">
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Current Price</span>
						<div class="flex items-center gap-2">
							{#if $priceQuery.isFetching && !$priceQuery.isLoading}
								<LoadingSpinner variant="dot" text="Updating price..." />
							{/if}
							<span class="text-xl sm:text-2xl font-bold text-green-400">
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

				<h3 class="mb-4 text-xs sm:text-sm font-medium uppercase tracking-wide text-gray-400">
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
						<span class="text-gray-400">Market Cap</span>
						<span class="font-semibold">
							${parseInt($overviewQuery.data.MarketCapitalization).toLocaleString()}
						</span>
					</div>
				</div>

				<div class="my-6 border-t border-white/10"></div>

				<h3 class="mb-4 text-xs sm:text-sm font-medium uppercase tracking-wide text-gray-400">ST0X Token</h3>
				<div class="space-y-4">
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Name</span>
						<span class="font-semibold">{$currentToken?.name}</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Symbol</span>
						<span class="font-semibold">{$currentToken?.symbol}</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Total Shares</span>
						<span class="font-semibold">
							{formatUnits(BigInt($currentToken?.totalShares ?? 0n), 18)}
						</span>
					</div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Market Cap</span>
						<span class="font-semibold">${formatUnits(marketCap, 18)}</span>
					</div>
				</div>
			</div>

			<!-- Equity Chart Section -->
			<div class="{SECTION_CLASSES} flex flex-col p-4 sm:p-6 lg:col-span-2">
				<h3 class="mb-4 text-base sm:text-xl font-semibold">Price History</h3>
				<div class="flex-grow w-full">
					<EquityChart timeseriesData={$timeseriesQuery.data} height="h-full" />
				</div>
			</div>
		</div>

		<div class="{SECTION_CLASSES} p-4 sm:p-6">
			<h3 class="mb-4 text-base sm:text-xl font-semibold">Trade History</h3>
			{#if $tradesQuery.data?.pages.flatMap((page) => page.trades).length > 0}
				<div class="overflow-x-auto">
					<TradeHistoryTable query={tradesQuery} />
				</div>
			{:else}
				<p class="text-center text-gray-400">No trades found for this token.</p>
			{/if}
		</div>
	</div>
{:else if $priceQuery.error || $overviewQuery.error || $timeseriesQuery.error || $tradesQuery.error}
	<div class="rounded-2xl border border-red-500/30 bg-red-900/20 p-8">
		<h2 class="mb-4 text-xl font-semibold text-red-400">Error Loading Token Data</h2>
		<p class="mb-2 text-gray-300">There was an error fetching the token data:</p>
		<div class="mt-4 rounded border border-red-500/30 bg-red-900/20 p-4">
			<p class="text-sm text-red-300">
				{$priceQuery.error?.message ||
					$overviewQuery.error?.message ||
					$timeseriesQuery.error?.message ||
					$tradesQuery.error?.message ||
					'Unknown error occurred'}
			</p>
		</div>
	</div>
{/if}
