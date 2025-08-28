<script lang="ts">
	import { page } from '$app/stores';
	import { currentNetwork, sfts } from '$lib/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { TOKENS } from '$lib/network';
	import { env as publicEnv } from '$env/dynamic/public';
	import Footer from '$lib/components/Footer.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import LimitStrategy from '$lib/components/orders/LimitStrategy.svelte';
	import DcaStrategy from '$lib/components/orders/DcaStrategy.svelte';
	import EquityChart from '$lib/components/charts/EquityChart.svelte';
	import { ArrowUpRightFromSquareSolid, ExpandOutline } from 'flowbite-svelte-icons';
	import { connected } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Modal from '$lib/components/Modal.svelte';

	$: tokenId = $page.params.id;
	$: currentToken = $sfts?.find(sft => sft.id === tokenId);
	
	// Find the corresponding PythToken from TOKENS array
	$: currentPythToken = TOKENS.find(
		(token) => token.address.toLowerCase() === currentToken?.address.toLowerCase() && 
		token.chainId === $currentNetwork?.chainId
	);

	// Extract base symbol for API calls
	$: symbol = currentToken?.symbol?.split('s1')[0];

	// Tab state
	let activeTab: 'fundamentals' | 'technical' | 'token' = 'fundamentals';
	let activeOrderType = 'limit';
	
	// Chart modal state
	let showChartModal = false;
	let chartInterval = '30min';
	let modalChartData: any = null;

	// Query for intraday data (5-minute intervals for more detail)
	$: intradayQuery = createQuery({
		queryKey: ['intraday', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=5min&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}&outputsize=full`
			);
			const data = await response.json();
			if (data.Information || data.Note) {
				return { error: 'API_LIMIT', message: data.Information || data.Note };
			}
			return data;
		},
		enabled: !!symbol,
		refetchInterval: 300000
	});
	
	// Query for daily data (for fullscreen view)
	$: dailyQuery = createQuery({
		queryKey: ['daily', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			return await response.json();
		},
		enabled: !!symbol && showChartModal && chartInterval === 'daily',
		refetchInterval: false
	});
	
	// Query for different intervals when modal is open
	$: modalIntradayQuery = createQuery({
		queryKey: ['modalIntraday', symbol, $currentNetwork?.id, chartInterval],
		queryFn: async () => {
			if (chartInterval === 'daily') return null;
			const response = await fetch(
				`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${chartInterval}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			return await response.json();
		},
		enabled: !!symbol && showChartModal && chartInterval !== 'daily',
		refetchInterval: false
	});

	// Query for price data
	$: priceQuery = createQuery({
		queryKey: ['tokenPrice', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			const data = await response.json();
			if (data.Information || data.Note) {
				return { error: 'API_LIMIT', message: data.Information || data.Note };
			}
			return data;
		},
		enabled: !!symbol,
		refetchInterval: 60000
	});

	// Query for comprehensive overview data (fundamentals)
	$: overviewQuery = createQuery({
		queryKey: ['tokenOverview', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			const data = await response.json();
			if (data.Information || data.Note) {
				return { error: 'API_LIMIT', message: data.Information || data.Note };
			}
			return data;
		},
		enabled: !!symbol && activeTab === 'fundamentals' // Only load when tab is active
	});

	// Query for technical indicators - only load when technical tab is active to save API calls
	$: macdQuery = createQuery({
		queryKey: ['macd', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=MACD&symbol=${symbol}&interval=daily&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			const data = await response.json();
			if (data.Information) {
				console.warn('AlphaVantage API limit reached:', data.Information);
				return { error: 'API_LIMIT', message: data.Information };
			}
			return data;
		},
		enabled: !!symbol && activeTab === 'technical' // Only load when tab is active
	});

	$: rsiQuery = createQuery({
		queryKey: ['rsi', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			const data = await response.json();
			if (data.Information) {
				return { error: 'API_LIMIT', message: data.Information };
			}
			return data;
		},
		enabled: !!symbol && activeTab === 'technical' // Only load when tab is active
	});

	$: obvQuery = createQuery({
		queryKey: ['obv', symbol, $currentNetwork?.id],
		queryFn: async () => {
			const response = await fetch(
				`https://www.alphavantage.co/query?function=OBV&symbol=${symbol}&interval=daily&apikey=${publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY}`
			);
			const data = await response.json();
			if (data.Information) {
				return { error: 'API_LIMIT', message: data.Information };
			}
			return data;
		},
		enabled: !!symbol && activeTab === 'technical' // Only load when tab is active
	});

	$: globalQuote = $priceQuery.data?.error ? null : $priceQuery.data?.['Global Quote'];
	$: overview = $overviewQuery.data?.error ? null : $overviewQuery.data;
	
	// Check if any query hit the API limit
	$: hasApiLimitError = 
		$priceQuery.data?.error === 'API_LIMIT' ||
		$intradayQuery.data?.error === 'API_LIMIT' ||
		$overviewQuery.data?.error === 'API_LIMIT';

	$: marketCap =
		currentToken?.totalShares && globalQuote?.['05. price']
			? formatUnits(
					BigInt(Math.floor(parseFloat(globalQuote['05. price']) * 100)) * 
					BigInt(currentToken.totalShares),
					20
				)
			: '0';

	$: priceChange = parseFloat(globalQuote?.['09. change']) || 0;
	$: priceChangePercent = parseFloat(globalQuote?.['10. change percent']?.replace('%', '')) || 0;

	// Get latest technical indicator values
	$: latestMACD = $macdQuery.data?.['Technical Analysis: MACD'] ? 
		Object.values($macdQuery.data['Technical Analysis: MACD'])[0] as any : null;
	$: latestRSI = $rsiQuery.data?.['Technical Analysis: RSI'] ? 
		Object.values($rsiQuery.data['Technical Analysis: RSI'])[0] as any : null;
	$: latestOBV = $obvQuery.data?.['Technical Analysis: OBV'] ? 
		Object.values($obvQuery.data['Technical Analysis: OBV'])[0] as any : null;

	function truncateAddress(address: string) {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatNumber(value: string | number | undefined): string {
		if (!value) return 'N/A';
		const num = typeof value === 'string' ? parseFloat(value) : value;
		if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
		if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
		if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
		return num.toFixed(2);
	}
	
	function openChartModal() {
		showChartModal = true;
	}
	
	function changeChartInterval(interval: string) {
		chartInterval = interval;
	}
	
	// Get the right data for the modal chart based on interval
	$: modalChartData = showChartModal ? 
		(chartInterval === 'daily' ? $dailyQuery.data : $modalIntradayQuery.data) : 
		null;
</script>

{#if !currentToken}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading token data..." />
	</div>
{:else}
	<div class="space-y-6 p-4 sm:p-6">
		<!-- API Rate Limit Warning -->
		{#if hasApiLimitError}
			<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
				<h3 class="mb-2 font-semibold text-red-400">AlphaVantage API Rate Limit Reached</h3>
				<p class="text-sm text-red-300">
					The free AlphaVantage API allows only 25 requests per day, and this limit has been reached.
				</p>
				<p class="mt-2 text-sm text-red-300">
					To continue using real-time market data, you can:
				</p>
				<ul class="mt-1 list-inside list-disc text-sm text-red-300">
					<li>Wait until tomorrow when the limit resets</li>
					<li>Use a different API key</li>
					<li><a href="https://www.alphavantage.co/premium/" target="_blank" class="underline">Upgrade to a premium AlphaVantage plan</a></li>
				</ul>
			</div>
		{/if}
		
		<!-- Header Section with Chart -->
		<Section>
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Left: Price Info -->
				<div>
					<div class="mb-4">
						<div class="flex items-center gap-3">
							<img
								src={currentPythToken?.logoUrl || '/placeholder.png'}
								alt={currentToken.symbol}
								class="h-12 w-12 rounded-full bg-gray-700"
							/>
							<div>
								<h1 class="text-xl font-bold">{currentToken.name}</h1>
								<p class="text-sm text-gray-400">{currentToken.symbol}</p>
							</div>
						</div>
					</div>
					
					<div class="flex items-baseline gap-4">
						<span class="text-3xl font-bold">
							${globalQuote?.['05. price'] || '0.00'}
						</span>
						<div class="flex items-center gap-2">
							{#if priceChange >= 0}
								<svg class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
								</svg>
								<span class="text-green-500">
									${Math.abs(priceChange).toFixed(2)} ({Math.abs(priceChangePercent).toFixed(2)}%)
								</span>
							{:else}
								<svg class="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd" />
								</svg>
								<span class="text-red-500">
									${Math.abs(priceChange).toFixed(2)} ({Math.abs(priceChangePercent).toFixed(2)}%)
								</span>
							{/if}
						</div>
					</div>
					
					<div class="mt-4 grid grid-cols-2 gap-4 text-sm">
						<div>
							<span class="text-gray-400">Open</span>
							<div class="font-medium">${globalQuote?.['02. open'] || 'N/A'}</div>
						</div>
						<div>
							<span class="text-gray-400">Volume</span>
							<div class="font-medium">{formatNumber(globalQuote?.['06. volume'])}</div>
						</div>
						<div>
							<span class="text-gray-400">Day Range</span>
							<div class="font-medium">
								${globalQuote?.['04. low'] || 'N/A'} - ${globalQuote?.['03. high'] || 'N/A'}
							</div>
						</div>
						<div>
							<span class="text-gray-400">Prev Close</span>
							<div class="font-medium">${globalQuote?.['08. previous close'] || 'N/A'}</div>
						</div>
					</div>
				</div>
				
				<!-- Right: Chart -->
				<div class="relative h-64 rounded-lg border border-white/10 bg-gray-800/50 p-2">
					<button
						on:click={openChartModal}
						class="absolute right-2 top-2 z-10 rounded-md bg-gray-700/80 p-1.5 text-gray-400 transition-colors hover:bg-gray-600 hover:text-white"
						aria-label="View fullscreen chart"
					>
						<ExpandOutline class="h-4 w-4" />
					</button>
					{#if $intradayQuery.data?.error === 'API_LIMIT'}
						<div class="flex h-full items-center justify-center">
							<p class="text-sm text-gray-400">Chart unavailable (API limit reached)</p>
						</div>
					{:else if $intradayQuery.data}
						<EquityChart timeseriesData={$intradayQuery.data} height={240} />
					{:else}
						<div class="flex h-full items-center justify-center">
							<LoadingSpinner variant="inline" size="md" text="Loading chart..." />
						</div>
					{/if}
				</div>
			</div>
		</Section>

		<!-- Tabbed Information Section -->
		<Section>
			<!-- Tab Navigation -->
			<div class="mb-6 flex gap-2 border-b border-white/10">
				<button
					on:click={() => (activeTab = 'fundamentals')}
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'fundamentals'
						? 'border-yellow-500 text-yellow-500'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					Fundamentals
				</button>
				<button
					on:click={() => (activeTab = 'technical')}
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'technical'
						? 'border-yellow-500 text-yellow-500'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					Technical
				</button>
				<button
					on:click={() => (activeTab = 'token')}
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'token'
						? 'border-yellow-500 text-yellow-500'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					Token Info
				</button>
			</div>

			<!-- Tab Content -->
			{#if activeTab === 'fundamentals'}
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{#if overview && Object.keys(overview).length > 0}
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">P/E Ratio</div>
							<div class="text-lg font-semibold">{overview.PERatio || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">Forward P/E</div>
							<div class="text-lg font-semibold">{overview.ForwardPE || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">PEG Ratio</div>
							<div class="text-lg font-semibold">{overview.PEGRatio || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">P/B Ratio</div>
							<div class="text-lg font-semibold">{overview.PriceToBookRatio || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">Market Cap</div>
							<div class="text-lg font-semibold">
								{formatNumber(overview.MarketCapitalization)}
							</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">EPS</div>
							<div class="text-lg font-semibold">${overview.EPS || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">Dividend Yield</div>
							<div class="text-lg font-semibold">
								{overview.DividendYield ? (parseFloat(overview.DividendYield) * 100).toFixed(2) + '%' : 'N/A'}
							</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">Beta</div>
							<div class="text-lg font-semibold">{overview.Beta || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">52W High</div>
							<div class="text-lg font-semibold">${overview['52WeekHigh'] || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">52W Low</div>
							<div class="text-lg font-semibold">${overview['52WeekLow'] || 'N/A'}</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">Profit Margin</div>
							<div class="text-lg font-semibold">
								{overview.ProfitMargin ? (parseFloat(overview.ProfitMargin) * 100).toFixed(2) + '%' : 'N/A'}
							</div>
						</div>
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-3">
							<div class="text-xs text-gray-400">ROE</div>
							<div class="text-lg font-semibold">
								{overview.ReturnOnEquityTTM ? (parseFloat(overview.ReturnOnEquityTTM) * 100).toFixed(2) + '%' : 'N/A'}
							</div>
						</div>
					{:else}
						<div class="col-span-full text-center text-gray-400">
							Loading fundamental data...
						</div>
					{/if}
				</div>
			{:else if activeTab === 'technical'}
				<div class="space-y-4">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<!-- MACD -->
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
							<h3 class="mb-3 font-semibold">MACD</h3>
							{#if latestMACD}
								<div class="space-y-2 text-sm">
									<div class="flex justify-between">
										<span class="text-gray-400">MACD</span>
										<span class="font-medium">{parseFloat(latestMACD.MACD).toFixed(4)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">Signal</span>
										<span class="font-medium">{parseFloat(latestMACD.MACD_Signal).toFixed(4)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">Histogram</span>
										<span class="font-medium {parseFloat(latestMACD.MACD_Hist) >= 0 ? 'text-green-500' : 'text-red-500'}">
											{parseFloat(latestMACD.MACD_Hist).toFixed(4)}
										</span>
									</div>
								</div>
							{:else}
								<div class="text-sm text-gray-400">Loading...</div>
							{/if}
						</div>
						
						<!-- RSI -->
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
							<h3 class="mb-3 font-semibold">RSI (14)</h3>
							{#if latestRSI}
								<div class="space-y-2">
									<div class="text-2xl font-bold {parseFloat(latestRSI.RSI) > 70 ? 'text-red-500' : parseFloat(latestRSI.RSI) < 30 ? 'text-green-500' : 'text-white'}">
										{parseFloat(latestRSI.RSI).toFixed(2)}
									</div>
									<div class="text-xs text-gray-400">
										{parseFloat(latestRSI.RSI) > 70 ? 'Overbought' : parseFloat(latestRSI.RSI) < 30 ? 'Oversold' : 'Neutral'}
									</div>
								</div>
							{:else}
								<div class="text-sm text-gray-400">Loading...</div>
							{/if}
						</div>
						
						<!-- OBV -->
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
							<h3 class="mb-3 font-semibold">OBV</h3>
							{#if latestOBV}
								<div class="space-y-2">
									<div class="text-lg font-bold">
										{formatNumber(latestOBV.OBV)}
									</div>
									<div class="text-xs text-gray-400">On-Balance Volume</div>
								</div>
							{:else}
								<div class="text-sm text-gray-400">Loading...</div>
							{/if}
						</div>
					</div>
					
					<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
						<p class="text-sm text-yellow-400">
							Technical indicators are calculated using daily price data. MACD uses 12-day and 26-day exponential moving averages.
							RSI is calculated over a 14-day period. Values update daily after market close.
						</p>
					</div>
				</div>
			{:else if activeTab === 'token'}
				<div class="space-y-4">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
							<h3 class="mb-3 font-semibold">Contract Information</h3>
							<div class="space-y-3 text-sm">
								<div class="flex justify-between">
									<span class="text-gray-400">Address</span>
									<a
										href="{$currentNetwork.blockExplorer}/token/{currentToken.address}"
										target="_blank"
										class="flex items-center gap-1 text-blue-400 hover:text-blue-300"
									>
										{truncateAddress(currentToken.address)}
										<ArrowUpRightFromSquareSolid class="h-3 w-3" />
									</a>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Network</span>
									<span>{$currentNetwork.displayName}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Symbol</span>
									<span>{currentToken.symbol}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Decimals</span>
									<span>18</span>
								</div>
							</div>
						</div>
						
						<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
							<h3 class="mb-3 font-semibold">Supply & Distribution</h3>
							<div class="space-y-3 text-sm">
								<div class="flex justify-between">
									<span class="text-gray-400">Total Supply</span>
									<span>{formatUnits(BigInt(currentToken.totalShares), 18)}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">On-Chain Market Cap</span>
									<span>${marketCap}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Holders</span>
									<span>{currentToken.tokenHolders.length}</span>
								</div>
								<div class="flex justify-between">
									<span class="text-gray-400">Total Transfers</span>
									<span>{currentToken.shareTransfers.length}</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else if activeTab === 'trading'}
				<div class="space-y-4">
					<!-- Token Trading Volumes Table -->
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<h3 class="mb-4 font-semibold">Trading Activity</h3>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
										<th class="p-2">Metric</th>
										<th class="p-2 text-right">Value</th>
									</tr>
								</thead>
								<tbody>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Total Minted (In Volume)</td>
										<td class="p-2 text-right font-medium">
											{formatUnits(
												currentToken.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0)),
												18
											)}
										</td>
									</tr>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Total Redeemed (Out Volume)</td>
										<td class="p-2 text-right font-medium">
											{formatUnits(
												currentToken.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0)),
												18
											)}
										</td>
									</tr>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Net Volume</td>
										<td class="p-2 text-right font-medium {parseFloat(formatUnits(
												currentToken.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0)) -
												currentToken.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0)),
												18
											)) >= 0 ? 'text-green-400' : 'text-red-400'}">
											{formatUnits(
												currentToken.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0)) -
												currentToken.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0)),
												18
											)}
										</td>
									</tr>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Total Transfers</td>
										<td class="p-2 text-right font-medium">{currentToken.shareTransfers.length}</td>
									</tr>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Unique Holders</td>
										<td class="p-2 text-right font-medium">{currentToken.tokenHolders.length}</td>
									</tr>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Certifications</td>
										<td class="p-2 text-right font-medium">{currentToken.certifications.length}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<!-- Historical Activity -->
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<h3 class="mb-4 font-semibold">Recent Activity</h3>
						<div class="space-y-3">
							<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
								<div class="rounded-lg bg-gray-800/50 p-3">
									<div class="text-xs text-gray-400">Total Deposits</div>
									<div class="text-lg font-semibold">{currentToken.deposits.length}</div>
								</div>
								<div class="rounded-lg bg-gray-800/50 p-3">
									<div class="text-xs text-gray-400">Total Withdrawals</div>
									<div class="text-lg font-semibold">{currentToken.withdraws.length}</div>
								</div>
								<div class="rounded-lg bg-gray-800/50 p-3">
									<div class="text-xs text-gray-400">Transfer Events</div>
									<div class="text-lg font-semibold">{currentToken.shareTransfers.length}</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</Section>

		<!-- Trade Section -->
		<Section>
			<h2 class="mb-4 text-lg font-semibold">Trade {currentToken.symbol}</h2>
			
			<!-- Order Type Selector -->
			<div class="mb-4 flex gap-2 rounded-lg bg-white/5 p-1">
				<button
					on:click={() => (activeOrderType = 'limit')}
					class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all {activeOrderType === 'limit'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					Limit Order
				</button>
				<button
					on:click={() => (activeOrderType = 'dca')}
					class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all {activeOrderType === 'dca'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					DCA Strategy
				</button>
			</div>

			{#if $connected}
				<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
					{#if activeOrderType === 'limit'}
						<LimitStrategy
							passedOutputToken={currentPythToken}
							currentPrice={globalQuote?.['05. price']}
						/>
					{:else}
						<DcaStrategy 
							passedInputToken={currentPythToken}
						/>
					{/if}
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center gap-4 py-12">
					<WalletConnect />
					<p class="text-center text-sm text-gray-400">
						Connect your wallet to start trading
					</p>
				</div>
			{/if}
		</Section>
	</div>

	<Footer />
{/if}

<!-- Chart Modal -->
<Modal
	show={showChartModal}
	title="{currentToken?.symbol} - {currentToken?.name} Chart"
	onClose={() => (showChartModal = false)}
>
	<div class="space-y-4">
		<!-- Interval Selector -->
		<div class="flex gap-2">
			<button
				on:click={() => changeChartInterval('5min')}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {chartInterval === '5min'
					? 'bg-yellow-500/20 text-yellow-500'
					: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}"
			>
				5 min
			</button>
			<button
				on:click={() => changeChartInterval('15min')}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {chartInterval === '15min'
					? 'bg-yellow-500/20 text-yellow-500'
					: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}"
			>
				15 min
			</button>
			<button
				on:click={() => changeChartInterval('30min')}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {chartInterval === '30min'
					? 'bg-yellow-500/20 text-yellow-500'
					: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}"
			>
				30 min
			</button>
			<button
				on:click={() => changeChartInterval('60min')}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {chartInterval === '60min'
					? 'bg-yellow-500/20 text-yellow-500'
					: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}"
			>
				1 hour
			</button>
			<button
				on:click={() => changeChartInterval('daily')}
				class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {chartInterval === 'daily'
					? 'bg-yellow-500/20 text-yellow-500'
					: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}"
			>
				Daily
			</button>
		</div>
		
		<!-- Chart -->
		<div class="h-96 rounded-lg border border-white/10 bg-gray-800/50 p-2">
			{#if modalChartData}
				<EquityChart 
					timeseriesData={modalChartData} 
					height={368} 
				/>
			{:else}
				<div class="flex h-full items-center justify-center">
					<LoadingSpinner variant="inline" size="md" text="Loading chart..." />
				</div>
			{/if}
		</div>
		
		<!-- Price Info -->
		<div class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
			<div>
				<span class="text-gray-400">Current Price</span>
				<div class="font-medium">${globalQuote?.['05. price'] || 'N/A'}</div>
			</div>
			<div>
				<span class="text-gray-400">Change</span>
				<div class="font-medium {priceChange >= 0 ? 'text-green-500' : 'text-red-500'}">
					{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
				</div>
			</div>
			<div>
				<span class="text-gray-400">Volume</span>
				<div class="font-medium">{formatNumber(globalQuote?.['06. volume'])}</div>
			</div>
			<div>
				<span class="text-gray-400">Day Range</span>
				<div class="font-medium">
					${globalQuote?.['04. low'] || 'N/A'} - ${globalQuote?.['03. high'] || 'N/A'}
				</div>
			</div>
		</div>
	</div>
</Modal>