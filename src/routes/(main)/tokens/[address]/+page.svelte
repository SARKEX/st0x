<script lang="ts">
	import { currentToken } from '$lib/stores';
	import { createInfiniteQuery, createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import EquityChart from '$lib/components/charts/EquityChart.svelte';
	import { getTrades } from '$lib/query';
	import TradeHistoryTable from '$lib/components/tables/TradeHistoryTable.svelte';
	import { PUBLIC_ALPHAVANTAGE_API_KEY } from '$env/static/public';

	const symbol = $currentToken?.symbol.split('s1')[0];

	// Query for price data - refetches every 60 seconds
	$: priceQuery = createQuery({
		queryKey: ['tokenPrice', symbol],
		queryFn: async () => {
			console.log('refetching price');
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
		queryKey: ['tokenTimeseries', symbol],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			return await response.json();
		}
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

	$: marketCap =
		$currentToken?.totalShares && $priceQuery.data?.['Global Quote']?.['05. price']
			? (BigInt($currentToken.totalShares) *
					BigInt(Math.floor(parseFloat($priceQuery.data['Global Quote']['05. price']) * 100))) /
				BigInt(100)
			: 0n;

	$: priceChange = $priceQuery.data
		? parseFloat($priceQuery.data['Global Quote']['09. change'])
		: 0;
	$: percentChange = $priceQuery.data
		? parseFloat($priceQuery.data['Global Quote']['10. change percent'].replace('%', ''))
		: 0;

	// Utility Classes (matching dashboard theme)
	const CARD_BASE_CLASSES =
		'bg-gray-700/30 rounded-xl border border-white/5 relative overflow-hidden group hover:border-yellow-500/30 transition-all';
	const GRADIENT_HOVER_CLASSES =
		'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity';
	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';
</script>

{#if $priceQuery.isLoading || $overviewQuery.isLoading || $timeseriesQuery.isLoading || $tradesQuery.isLoading}
	<div class="flex w-full items-center justify-center p-8">
		<div class="relative">
			<div
				class="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-20"
			></div>
			<div
				class="relative h-16 w-16 animate-spin rounded-full border-4 border-transparent border-b-purple-700 border-l-green-500 border-r-blue-600 border-t-yellow-500"
			></div>
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="h-12 w-12 rounded-full bg-gray-800"></div>
			</div>
		</div>
	</div>
{:else if $priceQuery.data && $overviewQuery.data && $timeseriesQuery.data && $tradesQuery.data}
	<div class="space-y-8 p-6">
		<!-- Header Section -->
		<div
			class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-800 to-purple-900"
		>
			<div class="px-8 py-6 text-center">
				<h1 class="mb-2 text-3xl font-bold text-white">
					{$currentToken?.name} - {$currentToken?.symbol}
				</h1>
				<p class="font-mono text-sm text-indigo-200">Token ID: {$currentToken?.id}</p>
			</div>
		</div>

		<!-- Three Main Cards -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
			<!-- Card 1: Equity Price Information -->
			<div class="{CARD_BASE_CLASSES} p-6">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">Equity Price</h3>
				<div class="space-y-4">
					<div class="flex items-baseline justify-between">
						<span class="text-gray-400">Current Price</span>
						<div class="flex items-center gap-2">
							{#if $priceQuery.isFetching && !$priceQuery.isLoading}
								<div
									class="h-2 w-2 animate-pulse rounded-full bg-yellow-400"
									title="Updating price..."
								></div>
							{/if}
							<span class="text-2xl font-bold text-green-400">
								${parseFloat($priceQuery.data['Global Quote']['05. price']).toFixed(2)}
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
			</div>

			<!-- Card 2: Equity Overview -->
			<div class="{CARD_BASE_CLASSES} p-6">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">
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
			</div>

			<!-- Card 3: ST0X Token Overview -->
			<div class="{CARD_BASE_CLASSES} p-6">
				<div class={GRADIENT_HOVER_CLASSES}></div>
				<h3 class="mb-4 text-sm font-medium uppercase tracking-wide text-gray-400">ST0X Token</h3>
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
		</div>

		<!-- Equity Chart Section -->
		<div class={SECTION_CLASSES}>
			<h3 class="mb-4 text-xl font-semibold">Price History</h3>
			<EquityChart timeseriesData={$timeseriesQuery.data} />
		</div>

		<div class={SECTION_CLASSES}>
			<h3 class="mb-4 text-xl font-semibold">Trade History</h3>
			{#if $tradesQuery.data?.pages.flatMap((page) => page.trades).length > 0}
				<TradeHistoryTable query={tradesQuery} />
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
