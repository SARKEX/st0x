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
	import TradingViewChart from '$lib/components/charts/TradingViewChart.svelte';
	// inline icons used instead of external icon package
	import TxLink from '$lib/components/ui/TxLink.svelte';
	// Removed wallet-gating for trading window
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';
	import {
		getQuote,
		getFundamentals,
		getTechnicals,
		type TradingViewQuote,
		type TradingViewFundamentals,
		type TradingViewTechnicals
	} from '$lib/services/tradingview';

	$: tokenId = $page.params.id;
	$: currentToken = $sfts?.find((sft) => sft.id === tokenId);

	// Find the corresponding PythToken from TOKENS array
	$: currentPythToken = TOKENS.find(
		(token) =>
			token.address.toLowerCase() === currentToken?.address.toLowerCase() &&
			token.chainId === $currentNetwork?.chainId
	);

	function baseFromSymbol(sym?: string | null) {
		if (!sym) return undefined;
		if (sym.includes('s1')) return sym.split('s1')[0];
		if (sym.includes('0x')) return sym.split('0x')[0];
		return sym;
	}

	$: baseSymbol = baseFromSymbol(currentToken?.symbol);
	$: tradingViewSymbol = currentPythToken?.tradingViewSymbol ?? baseSymbol;
	$: tradingViewMarket = currentPythToken?.tradingViewMarket ?? 'america';

	function formatNumber(value: number | null | undefined, digits = 2) {
		return value != null ? value.toFixed(digits) : 'N/A';
	}

	function formatPercent(value: number | null | undefined, digits = 2) {
		return value != null ? `${(value * 100).toFixed(digits)}%` : 'N/A';
	}

	// Tab state
	let activeTab: 'fundamentals' | 'technical' | 'token' | 'mints-burns' = 'fundamentals';
	let activeOrderType = 'limit';
	// Default to expanded on desktop; adjust on mount for mobile
	let infoCollapsed = false;
	let tradeCollapsed = false;
	let priceDetailsCollapsed = false;

	onMount(() => {
		// Collapse panels on mobile, expanded on larger screens
		if (typeof window !== 'undefined') {
			const isMobile = window.innerWidth < 640;
			priceDetailsCollapsed = isMobile;
			infoCollapsed = isMobile;
			tradeCollapsed = isMobile;
		}
		return () => {};
	});

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

	// Query for price data via TradingView
	$: quoteQuery = createQuery({
		queryKey: ['tv-quote', tradingViewSymbol, tradingViewMarket, $currentNetwork?.id],
		queryFn: async () => {
			if (!tradingViewSymbol) return null;
			return getQuote(tradingViewSymbol, tradingViewMarket);
		},
		enabled: !!tradingViewSymbol,
		refetchInterval: 60000
	});

	// Query for fundamental data only when tab active
	$: overviewQuery = createQuery({
		queryKey: ['tv-fundamentals', tradingViewSymbol, tradingViewMarket, $currentNetwork?.id],
		queryFn: async () => {
			if (!tradingViewSymbol) return null;
			return getFundamentals(tradingViewSymbol, tradingViewMarket);
		},
		enabled: !!tradingViewSymbol && activeTab === 'fundamentals'
	});

	// Query for technical indicators when technical tab active
	$: technicalsQuery = createQuery({
		queryKey: ['tv-technicals', tradingViewSymbol, tradingViewMarket, $currentNetwork?.id],
		queryFn: async () => {
			if (!tradingViewSymbol) return null;
			return getTechnicals(tradingViewSymbol, tradingViewMarket);
		},
		enabled: !!tradingViewSymbol && activeTab === 'technical'
	});

	$: quoteData = $quoteQuery.data as TradingViewQuote | null;
	$: overview = $overviewQuery.data as TradingViewFundamentals | null;
	$: technicals = $technicalsQuery.data as TradingViewTechnicals | null;

	$: latestPrice = quoteData?.close ?? null;
	$: latestPriceLabel =
		latestPrice !== null && latestPrice !== undefined ? `$${latestPrice.toFixed(2)}` : 'N/A';
	$: latestPriceValue = latestPrice !== null && latestPrice !== undefined ? latestPrice.toFixed(2) : undefined;
	$: openPrice = quoteData?.open ?? null;
	$: highPrice = quoteData?.high ?? null;
	$: lowPrice = quoteData?.low ?? null;
	$: volumeValue = quoteData?.volume ?? null;
	$: prevClose = quoteData?.prevClose ?? null;
	$: week52High = quoteData?.week52High ?? null;
	$: week52Low = quoteData?.week52Low ?? null;

	$: marketCapDisplay =
		quoteData?.marketCap != null ? `$${formatCompact(quoteData.marketCap)}` : 'N/A';

	$: priceChange = quoteData?.change ?? 0;
	$: priceChangePercent = quoteData?.changePercent ?? 0;

	$: macdValues = technicals
		? {
			macd: technicals.macd,
			signal: technicals.macdSignal,
			histogram: technicals.macdHistogram
		}
		: null;
	$: rsiValue = technicals?.rsi ?? null;
	$: obvValue = technicals?.obv ?? null;

	function openChartModal() {
		showChartModal = true;
	}

</script>

{#if !currentToken}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading token data..." />
	</div>
{:else}
	<div class="space-y-6 p-4 sm:p-6">
		<!-- Header Section with Chart -->
		<Section>
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
				<!-- Left: Price Info (narrower) -->
				<div class="lg:col-span-2">
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
							{latestPriceLabel}
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

					<div class="mt-4">
						<div class="mb-2 flex items-center justify-between">
							<h3 class="text-sm font-semibold text-gray-300">Daily Stats</h3>
							<button
								class="rounded-md border border-white/10 p-1 text-xs text-gray-200 hover:bg-white/5"
								aria-label={priceDetailsCollapsed ? 'Expand daily stats' : 'Collapse daily stats'}
								on:click={() => (priceDetailsCollapsed = !priceDetailsCollapsed)}
							>
								<svg
									class="h-4 w-4 transition-transform duration-200 ease-out {priceDetailsCollapsed
										? ''
										: 'rotate-180'}"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M6 9l6 6 6-6" />
								</svg>
							</button>
						</div>
						{#if !priceDetailsCollapsed}
							<div in:fade|local out:fade|local>
									<div class="grid grid-cols-2 gap-4 text-sm" transition:slide|local>
										<div>
											<span class="text-gray-400">Open</span>
											<div class="font-medium">
												{openPrice != null ? `$${formatNumber(openPrice)}` : 'N/A'}
											</div>
										</div>
										<div>
											<span class="text-gray-400">Volume</span>
											<div class="font-medium">
												{volumeValue != null ? formatCompact(volumeValue) : 'N/A'}
											</div>
										</div>
										<div>
											<span class="text-gray-400">Day Range</span>
											<div class="font-medium">
												{lowPrice != null && highPrice != null
													? `$${formatNumber(lowPrice)} - $${formatNumber(highPrice)}`
													: 'N/A'}
											</div>
										</div>
										<div>
											<span class="text-gray-400">Prev Close</span>
											<div class="font-medium">
												{prevClose != null ? `$${formatNumber(prevClose)}` : 'N/A'}
											</div>
										</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Right: Chart (wider) -->
				<div
					class={`${containerStyles.cardBordered} h-[55vw] max-h-96 min-h-56 p-2 sm:h-96 lg:col-span-3`}
					style="display: flex; flex-direction: column;"
				>
					<div class="relative flex-1">
						<Button
							variant="ghost"
							size="sm"
							className="absolute left-2 top-2 z-10 rounded-md bg-gray-700/60 p-1.5 text-gray-300 hover:bg-gray-600 hover:text-white"
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
						{#if tradingViewSymbol}
							<TradingViewChart symbol={tradingViewSymbol} interval="30" />
						{:else}
							<div class="flex h-full items-center justify-center text-sm text-gray-400">
								TradingView data unavailable for this token.
							</div>
						{/if}
					</div>
				</div>
			</div>
		</Section>

		<!-- Tabbed Information Section (collapsible) -->
		<Section>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold">Details</h2>
				<button
					class="rounded-md border border-white/10 p-1 text-xs text-gray-200 hover:bg-white/5"
					aria-label={infoCollapsed ? 'Expand details' : 'Collapse details'}
					on:click={() => (infoCollapsed = !infoCollapsed)}
				>
					<svg
						class="h-4 w-4 transition-transform duration-200 ease-out {infoCollapsed
							? ''
							: 'rotate-180'}"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>
			</div>
			{#if !infoCollapsed}
				<div in:fade|local out:fade|local>
					<div transition:slide|local>
						<TabNav className="mb-6" tabs={TABS} activeId={activeTab} on:change={onTabChange} />

						<!-- Tab Content -->
						{#if activeTab === 'fundamentals'}
							<div
								id="panel-fundamentals"
								role="tabpanel"
								class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
							>
								{#if overview}
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">P/E Ratio</div>
										<div class="text-lg font-semibold">{formatNumber(overview.peRatio)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">Forward P/E</div>
										<div class="text-lg font-semibold">{formatNumber(overview.forwardPe)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">PEG Ratio</div>
										<div class="text-lg font-semibold">{formatNumber(overview.pegRatio)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">P/B Ratio</div>
										<div class="text-lg font-semibold">{formatNumber(overview.priceToBook)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">Market Cap</div>
										<div class="text-lg font-semibold">
											{overview.marketCap != null ? `$${formatCompact(overview.marketCap)}` : 'N/A'}
										</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">EPS</div>
										<div class="text-lg font-semibold">{formatNumber(overview.eps)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">Dividend Yield</div>
										<div class="text-lg font-semibold">{formatPercent(overview.dividendYield)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">Beta</div>
										<div class="text-lg font-semibold">{formatNumber(overview.beta)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">52W High</div>
										<div class="text-lg font-semibold">
											{overview.week52High != null ? `$${formatNumber(overview.week52High)}` : 'N/A'}
										</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">52W Low</div>
										<div class="text-lg font-semibold">
											{overview.week52Low != null ? `$${formatNumber(overview.week52Low)}` : 'N/A'}
										</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">Profit Margin</div>
										<div class="text-lg font-semibold">{formatPercent(overview.profitMargin)}</div>
									</div>
									<div class={`${containerStyles.cardBordered} p-3`}>
										<div class="text-xs text-gray-400">ROE</div>
										<div class="text-lg font-semibold">{formatPercent(overview.returnOnEquity)}</div>
									</div>
								{:else}
									<div class="col-span-full py-4">
										<div class="flex items-center justify-center">
											<LoadingSpinner size="md" text="Loading fundamental data..." />
										</div>
									</div>
								{/if}
							</div>
						{:else if activeTab === 'technical'}
							<div id="panel-technical" role="tabpanel" class="space-y-4">
								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
									<!-- MACD -->
									<div class={containerStyles.cardBordered}>
										<h3 class="mb-3 font-semibold">MACD</h3>
										{#if macdValues}
											<div class="space-y-2 text-sm">
												<div class="flex justify-between">
													<span class="text-gray-400">MACD</span>
													<span class="font-medium">{formatNumber(macdValues.macd, 4)}</span>
												</div>
												<div class="flex justify-between">
													<span class="text-gray-400">Signal</span>
													<span class="font-medium">{formatNumber(macdValues.signal, 4)}</span>
												</div>
												<div class="flex justify-between">
													<span class="text-gray-400">Histogram</span>
													<span
														class="font-medium {macdValues.histogram != null && macdValues.histogram >= 0
															? 'text-green-500'
															: 'text-red-500'}"
													>
														{formatNumber(macdValues.histogram, 4)}
													</span>
												</div>
											</div>
										{:else}
											<div class="py-2">
												<LoadingSpinner size="sm" text="Loading..." />
											</div>
										{/if}
									</div>

									<!-- RSI -->
									<div class={containerStyles.cardBordered}>
										<h3 class="mb-3 font-semibold">RSI (14)</h3>
										{#if rsiValue != null}
											<div class="space-y-2">
												<div
													class="text-2xl font-bold {rsiValue > 70
														? 'text-red-500'
														: rsiValue < 30
															? 'text-green-500'
															: 'text-white'}"
												>
													{formatNumber(rsiValue, 2)}
												</div>
												<div class="text-xs text-gray-400">
													{rsiValue > 70
														? 'Overbought'
														: rsiValue < 30
															? 'Oversold'
															: 'Neutral'}
												</div>
											</div>
										{:else}
											<div class="py-2">
												<LoadingSpinner size="sm" text="Loading..." />
											</div>
										{/if}
									</div>

									<!-- OBV -->
									<div class={containerStyles.cardBordered}>
										<h3 class="mb-3 font-semibold">OBV</h3>
										{#if obvValue != null}
											<div class="space-y-2">
												<div class="text-lg font-bold">
													{formatCompact(obvValue)}
												</div>
												<div class="text-xs text-gray-400">On-Balance Volume</div>
											</div>
										{:else}
											<div class="py-2">
												<LoadingSpinner size="sm" text="Loading..." />
											</div>
										{/if}
									</div>
								</div>

								<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
									<p class="text-sm text-yellow-400">
										Technical indicators are calculated using daily price data. MACD uses 12-day and
										26-day exponential moving averages. RSI is calculated over a 14-day period.
										Values update daily after market close.
									</p>
								</div>
							</div>
						{:else if activeTab === 'token'}
							<div id="panel-token" role="tabpanel" class="space-y-4">
								<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div class={containerStyles.cardBordered}>
										<h3 class="mb-3 font-semibold">Contract Information</h3>
										<div class="space-y-3 text-sm">
											<div class="flex items-center justify-between gap-2">
												<span class="text-gray-400">Address</span>
												<div>
													<div class="sm:hidden">
														<ExternalLink
															href="{$currentNetwork.blockExplorer}/token/{currentToken.address}"
															label={currentToken.address}
															truncate={{ start: 0, end: 6 }}
															className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
														/>
													</div>
													<div class="hidden sm:block">
														<ExternalLink
															href="{$currentNetwork.blockExplorer}/token/{currentToken.address}"
															label={truncateAddress(currentToken.address)}
															className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
														/>
													</div>
												</div>
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
												<a
													href={`/trade/${tokenId}/proofs`}
													class="text-blue-400 hover:text-blue-300"
												>
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
												<span>{marketCapDisplay}</span>
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
							<div
								id="panel-mints-burns"
								role="tabpanel"
								class="grid grid-cols-1 gap-4 sm:grid-cols-2"
							>
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
															<span class="text-gray-400">
																<span class="sm:hidden">…{dep.emitter.address.slice(-6)}</span>
																<span class="hidden sm:inline"
																	>{dep.emitter.address.slice(0, 6)}...{dep.emitter.address.slice(
																		-4
																	)}</span
																>
															</span>
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
															<span class="text-gray-400">
																<span class="sm:hidden">…{w.emitter.address.slice(-6)}</span>
																<span class="hidden sm:inline"
																	>{w.emitter.address.slice(0, 6)}...{w.emitter.address.slice(
																		-4
																	)}</span
																>
															</span>
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
															currentToken.deposits.reduce(
																(sum, d) => sum + BigInt(d.amount),
																BigInt(0)
															),
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
													<td class="p-2 text-right font-medium"
														>{currentToken.shareTransfers.length}</td
													>
												</tr>
												<tr class="border-b border-white/5">
													<td class="p-2 text-gray-400">Unique Holders</td>
													<td class="p-2 text-right font-medium"
														>{currentToken.tokenHolders.length}</td
													>
												</tr>
												<tr class="border-b border-white/5">
													<td class="p-2 text-gray-400">Certifications</td>
													<td class="p-2 text-right font-medium"
														>{currentToken.certifications.length}</td
													>
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
												<div class="text-lg font-semibold">
													{currentToken.shareTransfers.length}
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</Section>

		<!-- Trade Section (collapsible) -->
		<Section>
			<!-- Anchor element for intersection observer -->
			<!-- removed unused tradeSectionEl anchor -->
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-semibold">Trade {currentToken.symbol}</h2>
				<button
					class="rounded-md border border-white/10 p-1 text-xs text-gray-200 hover:bg-white/5"
					aria-label={tradeCollapsed ? 'Expand trade panel' : 'Collapse trade panel'}
					on:click={() => (tradeCollapsed = !tradeCollapsed)}
				>
					<svg
						class="h-4 w-4 transition-transform duration-200 ease-out {tradeCollapsed
							? ''
							: 'rotate-180'}"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M6 9l6 6 6-6" />
					</svg>
				</button>
			</div>

			{#if !tradeCollapsed}
				<div in:fade|local out:fade|local>
					<div transition:slide|local>
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

						<div class={containerStyles.cardBordered}>
							{#if activeOrderType === 'limit'}
								<LimitStrategy passedOutputToken={currentPythToken} currentPrice={latestPriceValue} />
							{:else}
								<DcaStrategy passedInputToken={currentPythToken} />
							{/if}
						</div>
					</div>
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
		<div class={`${containerStyles.cardBordered} h-[70vh] p-2`}>
			{#if tradingViewSymbol}
				<TradingViewChart symbol={tradingViewSymbol} interval="60" />
			{:else}
				<div class="flex h-full items-center justify-center text-sm text-gray-400">
					TradingView data unavailable for this token.
				</div>
			{/if}
		</div>
	</div>
</Modal>
