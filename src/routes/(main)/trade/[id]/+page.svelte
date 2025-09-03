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
	import { truncateAddress, formatCompact } from '$lib/utils/format';
	import EquityChart from '$lib/components/charts/EquityChart.svelte';
	// inline icons used instead of external icon package
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import * as alpha from '$lib/services/alpha';
	import { connected } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';

	$: tokenId = $page.params.id;
	$: currentToken = $sfts?.find((sft) => sft.id === tokenId);

	// Find the corresponding PythToken from TOKENS array
	$: currentPythToken = TOKENS.find(
		(token) =>
			token.address.toLowerCase() === currentToken?.address.toLowerCase() &&
			token.chainId === $currentNetwork?.chainId
	);

	// Extract base symbol for API calls
	$: symbol = currentToken?.symbol?.split('s1')[0];

	// Tab state
	let activeTab: 'fundamentals' | 'technical' | 'token' | 'mints-burns' = 'fundamentals';
	let activeOrderType = 'limit';

	const TABS = [
		{ id: 'fundamentals', label: 'Fundamentals' },
		{ id: 'technical', label: 'Technical' },
		{ id: 'token', label: 'Token Info' },
		{ id: 'mints-burns', label: 'Mints & Burns' }
	];

	function onTabChange(e: CustomEvent<{ id: string }>) {
		// The ids map to our union, safe to assign
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		activeTab = e.detail.id as any;
	}

	// Chart modal state
	let showChartModal = false;
	let chartInterval = '30min';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let modalChartData: any = null;

	// Query for intraday data (5-minute intervals for more detail)
	$: intradayQuery = createQuery({
		queryKey: ['intraday', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getIntraday(
				symbol as string,
				'5min',
				publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY,
				'full'
			);
		},
		enabled: !!symbol,
		refetchInterval: 300000
	});

	// Query for daily data (for fullscreen view)
	$: dailyQuery = createQuery({
		queryKey: ['daily', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getDaily(symbol as string, publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY);
		},
		enabled: !!symbol && showChartModal && chartInterval === 'daily',
		refetchInterval: false
	});

	// Query for different intervals when modal is open
	$: modalIntradayQuery = createQuery({
		queryKey: ['modalIntraday', symbol, $currentNetwork?.id, chartInterval],
		queryFn: async () => {
			if (chartInterval === 'daily') return null;
			return alpha.getIntraday(
				symbol as string,
				chartInterval,
				publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY,
				'full'
			);
		},
		enabled: !!symbol && showChartModal && chartInterval !== 'daily',
		refetchInterval: false
	});

	// Query for price data
	$: priceQuery = createQuery({
		queryKey: ['tokenPrice', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getGlobalQuote(symbol as string, publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY);
		},
		enabled: !!symbol,
		refetchInterval: 60000
	});

	// Query for comprehensive overview data (fundamentals)
	$: overviewQuery = createQuery({
		queryKey: ['tokenOverview', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getOverview(symbol as string, publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY);
		},
		enabled: !!symbol && activeTab === 'fundamentals' // Only load when tab is active
	});

	// Query for technical indicators - only load when technical tab is active to save API calls
	$: macdQuery = createQuery({
		queryKey: ['macd', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getMACD(symbol as string, 'daily', publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY);
		},
		enabled: !!symbol && activeTab === 'technical' // Only load when tab is active
	});

	$: rsiQuery = createQuery({
		queryKey: ['rsi', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getRSI(
				symbol as string,
				'daily',
				14,
				'close',
				publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY
			);
		},
		enabled: !!symbol && activeTab === 'technical' // Only load when tab is active
	});

	$: obvQuery = createQuery({
		queryKey: ['obv', symbol, $currentNetwork?.id],
		queryFn: async () => {
			return alpha.getOBV(symbol as string, 'daily', publicEnv.PUBLIC_ALPHAVANTAGE_API_KEY);
		},
		enabled: !!symbol && activeTab === 'technical' // Only load when tab is active
	});

	// Loosen types for AlphaVantage responses to satisfy TS
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: priceData = $priceQuery.data as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: intradayData = $intradayQuery.data as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: overviewData = $overviewQuery.data as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: macdData = $macdQuery.data as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: rsiData = $rsiQuery.data as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: obvData = $obvQuery.data as any;

	$: globalQuote = priceData?.error ? null : priceData?.['Global Quote'];
	$: overview = overviewData?.error ? null : overviewData;

	// Check if any query hit the API limit
	$: hasApiLimitError =
		priceData?.error === 'API_LIMIT' ||
		intradayData?.error === 'API_LIMIT' ||
		overviewData?.error === 'API_LIMIT';

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

	// Get latest technical indicator values (typed)
	type TAResponse = Record<string, Record<string, string>>;
	$: latestMACD = (macdData as TAResponse)?.['Technical Analysis: MACD']
		? (Object.values((macdData as TAResponse)['Technical Analysis: MACD'])[0] as unknown as Record<
				string,
				string
			>)
		: null;
	$: latestRSI = (rsiData as TAResponse)?.['Technical Analysis: RSI']
		? (Object.values((rsiData as TAResponse)['Technical Analysis: RSI'])[0] as unknown as Record<
				string,
				string
			>)
		: null;
	$: latestOBV = (obvData as TAResponse)?.['Technical Analysis: OBV']
		? (Object.values((obvData as TAResponse)['Technical Analysis: OBV'])[0] as unknown as Record<
				string,
				string
			>)
		: null;

	function openChartModal() {
		showChartModal = true;
	}

	function changeChartInterval(interval: string) {
		chartInterval = interval;
	}

	// Get the right data for the modal chart based on interval
	$: modalChartData = showChartModal
		? chartInterval === 'daily'
			? $dailyQuery.data
			: $modalIntradayQuery.data
		: null;
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
					The free AlphaVantage API allows only 25 requests per day, and this limit has been
					reached.
				</p>
				<p class="mt-2 text-sm text-red-300">To continue using real-time market data, you can:</p>
				<ul class="mt-1 list-inside list-disc text-sm text-red-300">
					<li>Wait until tomorrow when the limit resets</li>
					<li>Use a different API key</li>
					<li>
						<ExternalLink
							href="https://www.alphavantage.co/premium/"
							label="Upgrade to a premium AlphaVantage plan"
							className="underline"
						/>
					</li>
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
									<path
										fill-rule="evenodd"
										d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
										clip-rule="evenodd"
									/>
								</svg>
								<span class="text-green-500">
									${Math.abs(priceChange).toFixed(2)} ({Math.abs(priceChangePercent).toFixed(2)}%)
								</span>
							{:else}
								<svg class="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
									<path
										fill-rule="evenodd"
										d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
										clip-rule="evenodd"
									/>
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
							<div class="font-medium">
								{globalQuote?.['06. volume']
									? formatCompact(parseFloat(globalQuote['06. volume']))
									: 'N/A'}
							</div>
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
				<div class={`${containerStyles.cardBordered} relative h-64 p-2`}>
					<Button
						variant="ghost"
						size="sm"
						className="absolute right-2 top-2 z-10 rounded-md bg-gray-700/80 p-1.5 text-gray-400 hover:bg-gray-600 hover:text-white"
						aria-label="View fullscreen chart"
						on:click={openChartModal}
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 8V4h4M20 16v4h-4M4 20l6-6M20 4l-6 6"
							/>
						</svg>
					</Button>
					{#if intradayData?.error === 'API_LIMIT'}
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
			<TabNav className="mb-6" tabs={TABS} activeId={activeTab} on:change={onTabChange} />

			<!-- Tab Content -->
			{#if activeTab === 'fundamentals'}
				<div
					id="panel-fundamentals"
					role="tabpanel"
					class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
				>
					{#if overview && Object.keys(overview).length > 0}
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">P/E Ratio</div>
							<div class="text-lg font-semibold">{overview.PERatio || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">Forward P/E</div>
							<div class="text-lg font-semibold">{overview.ForwardPE || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">PEG Ratio</div>
							<div class="text-lg font-semibold">{overview.PEGRatio || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">P/B Ratio</div>
							<div class="text-lg font-semibold">{overview.PriceToBookRatio || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">Market Cap</div>
							<div class="text-lg font-semibold">
								{overview.MarketCapitalization
									? formatCompact(parseFloat(overview.MarketCapitalization))
									: 'N/A'}
							</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">EPS</div>
							<div class="text-lg font-semibold">${overview.EPS || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">Dividend Yield</div>
							<div class="text-lg font-semibold">
								{overview.DividendYield
									? (parseFloat(overview.DividendYield) * 100).toFixed(2) + '%'
									: 'N/A'}
							</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">Beta</div>
							<div class="text-lg font-semibold">{overview.Beta || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">52W High</div>
							<div class="text-lg font-semibold">${overview['52WeekHigh'] || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">52W Low</div>
							<div class="text-lg font-semibold">${overview['52WeekLow'] || 'N/A'}</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">Profit Margin</div>
							<div class="text-lg font-semibold">
								{overview.ProfitMargin
									? (parseFloat(overview.ProfitMargin) * 100).toFixed(2) + '%'
									: 'N/A'}
							</div>
						</div>
						<div class={`${containerStyles.cardBordered} p-3`}>
							<div class="text-xs text-gray-400">ROE</div>
							<div class="text-lg font-semibold">
								{overview.ReturnOnEquityTTM
									? (parseFloat(overview.ReturnOnEquityTTM) * 100).toFixed(2) + '%'
									: 'N/A'}
							</div>
						</div>
					{:else}
						<div class="col-span-full text-center text-gray-400">Loading fundamental data...</div>
					{/if}
				</div>
			{:else if activeTab === 'technical'}
				<div id="panel-technical" role="tabpanel" class="space-y-4">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<!-- MACD -->
						<div class={containerStyles.cardBordered}>
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
										<span
											class="font-medium {parseFloat(latestMACD.MACD_Hist) >= 0
												? 'text-green-500'
												: 'text-red-500'}"
										>
											{parseFloat(latestMACD.MACD_Hist).toFixed(4)}
										</span>
									</div>
								</div>
							{:else}
								<div class="text-sm text-gray-400">Loading...</div>
							{/if}
						</div>

						<!-- RSI -->
						<div class={containerStyles.cardBordered}>
							<h3 class="mb-3 font-semibold">RSI (14)</h3>
							{#if latestRSI}
								<div class="space-y-2">
									<div
										class="text-2xl font-bold {parseFloat(latestRSI.RSI) > 70
											? 'text-red-500'
											: parseFloat(latestRSI.RSI) < 30
												? 'text-green-500'
												: 'text-white'}"
									>
										{parseFloat(latestRSI.RSI).toFixed(2)}
									</div>
									<div class="text-xs text-gray-400">
										{parseFloat(latestRSI.RSI) > 70
											? 'Overbought'
											: parseFloat(latestRSI.RSI) < 30
												? 'Oversold'
												: 'Neutral'}
									</div>
								</div>
							{:else}
								<div class="text-sm text-gray-400">Loading...</div>
							{/if}
						</div>

						<!-- OBV -->
						<div class={containerStyles.cardBordered}>
							<h3 class="mb-3 font-semibold">OBV</h3>
							{#if latestOBV}
								<div class="space-y-2">
									<div class="text-lg font-bold">
										{latestOBV.OBV ? formatCompact(parseFloat(latestOBV.OBV)) : 'N/A'}
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
							Technical indicators are calculated using daily price data. MACD uses 12-day and
							26-day exponential moving averages. RSI is calculated over a 14-day period. Values
							update daily after market close.
						</p>
					</div>
				</div>
			{:else if activeTab === 'token'}
				<div id="panel-token" role="tabpanel" class="space-y-4">
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div class={containerStyles.cardBordered}>
							<h3 class="mb-3 font-semibold">Contract Information</h3>
							<div class="space-y-3 text-sm">
								<div class="flex justify-between">
									<span class="text-gray-400">Address</span>
									<ExternalLink
										href="{$currentNetwork.blockExplorer}/token/{currentToken.address}"
										label={truncateAddress(currentToken.address)}
										className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
									/>
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
								<div class="flex items-center justify-between">
									<span class="text-gray-400">Proofs</span>
									<a href={`/trade/${tokenId}/proofs`} class="text-blue-400 hover:text-blue-300">
										View proofs
									</a>
								</div>
							</div>
						</div>
						<div class={containerStyles.cardBordered}>
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
			{:else if activeTab === 'mints-burns'}
				<div id="panel-mints-burns" role="tabpanel" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class={containerStyles.cardBordered}>
						<div class="mb-2 flex items-center justify-between">
							<h3 class="font-semibold">Latest Mints</h3>
							<ExternalLink
								href="https://portal.s01issuer.com/metrics"
								label="View All"
								className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
							/>
						</div>
						{#if currentToken?.deposits?.length}
							<div class="space-y-1">
								{#each currentToken.deposits.slice(0, 5) as dep}
									<div class="rounded border border-white/10 bg-gray-800/40 px-3 py-2">
										<div class="flex items-center justify-between gap-3 text-xs">
											<div class="min-w-0 truncate">
												<span class="font-medium text-green-400"
													>+ {formatUnits(BigInt(dep.amount), 18)} {currentToken.symbol}</span
												>
												<span class="mx-2 text-gray-500">•</span>
												<span class="text-gray-400"
													>{dep.emitter.address.slice(0, 8)}...{dep.emitter.address.slice(-6)}</span
												>
												<span class="mx-2 text-gray-500">•</span>
												<span class="text-gray-400"
													>{new Date(Number(dep.timestamp) * 1000).toLocaleString()}</span
												>
											</div>
											<div class="flex flex-shrink-0 items-center gap-2">
												<TxLink hash={dep.transaction.id} />
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-sm text-gray-400">No recent mints.</div>
						{/if}
					</div>

					<div class={containerStyles.cardBordered}>
						<div class="mb-2 flex items-center justify-between">
							<h3 class="font-semibold">Latest Burns</h3>
							<ExternalLink
								href="https://portal.s01issuer.com/metrics"
								label="View All"
								className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
							/>
						</div>
						{#if currentToken?.withdraws?.length}
							<div class="space-y-1">
								{#each currentToken.withdraws.slice(0, 5) as w}
									<div class="rounded border border-white/10 bg-gray-800/40 px-3 py-2">
										<div class="flex items-center justify-between gap-3 text-xs">
											<div class="min-w-0 truncate">
												<span class="font-medium text-red-400"
													>− {formatUnits(BigInt(w.amount), 18)} {currentToken.symbol}</span
												>
												<span class="mx-2 text-gray-500">•</span>
												<span class="text-gray-400"
													>{w.emitter.address.slice(0, 8)}...{w.emitter.address.slice(-6)}</span
												>
												<span class="mx-2 text-gray-500">•</span>
												<span class="text-gray-400"
													>{new Date(Number(w.timestamp) * 1000).toLocaleString()}</span
												>
											</div>
											<div class="flex flex-shrink-0 items-center gap-2">
												<TxLink hash={w.transaction.id} />
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-sm text-gray-400">No recent burns.</div>
						{/if}
					</div>
				</div>
			{:else if activeTab === 'trading'}
				<div class="space-y-4">
					<!-- Token Trading Volumes Table -->
					<div class={containerStyles.cardBordered}>
						<h3 class="mb-4 font-semibold">Trading Activity</h3>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr
										class="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-gray-400"
									>
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
												currentToken.withdraws.reduce(
													(sum, w) => sum + BigInt(w.amount),
													BigInt(0)
												),
												18
											)}
										</td>
									</tr>
									<tr class="border-b border-white/5">
										<td class="p-2 text-gray-400">Net Volume</td>
										<td
											class="p-2 text-right font-medium {parseFloat(
												formatUnits(
													currentToken.deposits.reduce(
														(sum, d) => sum + BigInt(d.amount),
														BigInt(0)
													) -
														currentToken.withdraws.reduce(
															(sum, w) => sum + BigInt(w.amount),
															BigInt(0)
														),
													18
												)
											) >= 0
												? 'text-green-400'
												: 'text-red-400'}"
										>
											{formatUnits(
												currentToken.deposits.reduce(
													(sum, d) => sum + BigInt(d.amount),
													BigInt(0)
												) -
													currentToken.withdraws.reduce(
														(sum, w) => sum + BigInt(w.amount),
														BigInt(0)
													),
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
					<div class={containerStyles.cardBordered}>
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
				<Button
					fullWidth={true}
					variant="ghost"
					className={`rounded-md px-3 py-2 text-sm font-medium transition-all ${
						activeOrderType === 'limit'
							? 'bg-yellow-500/20 text-yellow-500'
							: 'text-gray-400 hover:text-white'
					}`}
					on:click={() => (activeOrderType = 'limit')}
				>
					Limit Order
				</Button>
				<Button
					fullWidth={true}
					variant="ghost"
					className={`rounded-md px-3 py-2 text-sm font-medium transition-all ${
						activeOrderType === 'dca'
							? 'bg-yellow-500/20 text-yellow-500'
							: 'text-gray-400 hover:text-white'
					}`}
					on:click={() => (activeOrderType = 'dca')}
				>
					DCA Order
				</Button>
			</div>

			{#if $connected}
				<div class={containerStyles.cardBordered}>
					{#if activeOrderType === 'limit'}
						<LimitStrategy
							passedOutputToken={currentPythToken}
							currentPrice={globalQuote?.['05. price']}
						/>
					{:else}
						<DcaStrategy passedInputToken={currentPythToken} />
					{/if}
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center gap-4 py-12">
					<WalletConnect />
					<p class="text-center text-sm text-gray-400">Connect your wallet to start trading</p>
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
	maxWidthClass="max-w-7xl"
	maxHeightVh={90}
	onClose={() => (showChartModal = false)}
>
	<div class="space-y-4">
		<!-- Interval Selector -->
		<div class="flex gap-2">
			<Button
				variant="ghost"
				size="sm"
				className={`rounded-md px-3 py-1.5 text-sm font-medium ${
					chartInterval === '5min'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
				}`}
				on:click={() => changeChartInterval('5min')}>5 min</Button
			>
			<Button
				variant="ghost"
				size="sm"
				className={`rounded-md px-3 py-1.5 text-sm font-medium ${
					chartInterval === '15min'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
				}`}
				on:click={() => changeChartInterval('15min')}>15 min</Button
			>
			<Button
				variant="ghost"
				size="sm"
				className={`rounded-md px-3 py-1.5 text-sm font-medium ${
					chartInterval === '30min'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
				}`}
				on:click={() => changeChartInterval('30min')}>30 min</Button
			>
			<Button
				variant="ghost"
				size="sm"
				className={`rounded-md px-3 py-1.5 text-sm font-medium ${
					chartInterval === '60min'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
				}`}
				on:click={() => changeChartInterval('60min')}>1 hour</Button
			>
			<Button
				variant="ghost"
				size="sm"
				className={`rounded-md px-3 py-1.5 text-sm font-medium ${
					chartInterval === 'daily'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
				}`}
				on:click={() => changeChartInterval('daily')}>Daily</Button
			>
		</div>

		<!-- Chart -->
		<div class={`${containerStyles.cardBordered} h-[70vh] p-2`}>
			{#if modalChartData}
				<EquityChart
					timeseriesData={modalChartData}
					barCount={180}
					alignToNow={true}
					interval={chartInterval}
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
				<div class="font-medium">
					{globalQuote?.['06. volume']
						? formatCompact(parseFloat(globalQuote['06. volume']))
						: 'N/A'}
				</div>
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
