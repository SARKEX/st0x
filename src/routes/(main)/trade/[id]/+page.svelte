<script lang="ts">
	import axios from 'axios';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { currentNetwork, sfts } from '$lib/stores';
	import { formatUnits } from 'viem';
	import { TOKENS, USDC_TOKENS } from '$lib/network';
	import Footer from '$lib/components/Footer.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import LimitStrategy from '$lib/components/orders/LimitStrategy.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import TradingViewChart from '$lib/components/charts/TradingViewChart.svelte';
	import TradingViewSymbolOverview from '$lib/components/charts/TradingViewSymbolOverview.svelte';
	import TradingViewSymbolInfo from '$lib/components/charts/TradingViewSymbolInfo.svelte';
	import TradingViewCompanyProfile from '$lib/components/charts/TradingViewCompanyProfile.svelte';
	import TradingViewFundamentalData from '$lib/components/charts/TradingViewFundamentalData.svelte';
	import TradingViewTechnicalAnalysis from '$lib/components/charts/TradingViewTechnicalAnalysis.svelte';
import TradingViewTopStories from '$lib/components/charts/TradingViewTopStories.svelte';
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Select from '$lib/components/ui/Select.svelte';
	import { createQuery } from '@tanstack/svelte-query';
import { fetchAndQuoteUSDCOrders, buildTokenPriceMap } from '$lib/utils/quote';

	$: tokenId = $page.params.id;
	$: currentToken = $sfts?.find((sft) => sft.id === tokenId);

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

	const ASSET_TABS = [
		{ id: 'company', label: 'Company Info' },
		{ id: 'fundamentals', label: 'Fundamentals' },
		{ id: 'technical', label: 'Technical' },
		{ id: 'news', label: 'Top Stories' }
	] as const;
	type AssetTabId = (typeof ASSET_TABS)[number]['id'];
	let activeAssetTab: AssetTabId = 'company';

	const TOKEN_TABS = [
		{ id: 'contract', label: 'Contract' },
		{ id: 'supply', label: 'Supply' },
		{ id: 'mints', label: 'Mints' },
		{ id: 'burns', label: 'Burns' }
	] as const;
	type TokenTabId = (typeof TOKEN_TABS)[number]['id'];
	let activeTokenTab: TokenTabId = 'contract';
	let infoCollapsed = false;
	let showTradePanel = false;
	let panelOrderSide: 'Buy' | 'Sell' = 'Buy';
	let panelStrategy: 'limit' | 'dca' = 'limit';
	let panelOpenedFromTerminal = false;
	const PANEL_STRATEGY_OPTIONS: Array<'limit' | 'dca'> = ['limit', 'dca'];
	const PANEL_STRATEGY_SELECT_ID = 'panel-strategy-select';
	const PANEL_STRATEGY_LABEL_ID = 'panel-strategy-label';

	let oraclePriceData: { price: number; confidence: number } | null = null;
	let oracleLoading = false;
	let oracleError: string | null = null;
	let oracleRequestToken = 0;
	let buyPrice: number | null = null;
	let sellPrice: number | null = null;

	function resetOracleState() {
		oraclePriceData = null;
		oracleError = null;
		oracleLoading = false;
	}

	function formatNumeric(value: number | null | undefined): string {
		if (value === null || value === undefined || Number.isNaN(value)) {
			return '—';
		}
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: value > 1 ? 2 : 4,
			maximumFractionDigits: value > 1 ? 2 : 6
		}).format(value);
	}

	async function fetchOracleData(feedId: string) {
		if (!browser) return;
		const requestId = ++oracleRequestToken;
		oracleLoading = true;
		oracleError = null;
		oraclePriceData = null;

		try {
			const resp = await axios.get(
				`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`
			);
			if (requestId !== oracleRequestToken) return;
			const parsed = resp.data.parsed?.[0]?.price;
			if (parsed) {
				const expo = Number(parsed.expo ?? 0);
				const multiplier = Math.pow(10, expo);
				oraclePriceData = {
					price: Number(parsed.price) * multiplier,
					confidence: Number(parsed.conf) * multiplier
				};
			} else {
				oraclePriceData = null;
			}
		} catch (error) {
			if (requestId === oracleRequestToken) {
				console.warn('[oracle] failed to fetch price data', error);
				oracleError = 'Failed to fetch oracle data';
				oraclePriceData = null;
			}
		} finally {
			if (requestId === oracleRequestToken) {
				oracleLoading = false;
			}
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			const isMobile = window.innerWidth < 640;
			infoCollapsed = isMobile;
		}
		return () => {};
	});

	const handleAssetTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (ASSET_TABS.some((tab) => tab.id === nextId)) {
			activeAssetTab = nextId as AssetTabId;
		}
	};

	$: currentFeedId = browser ? currentPythToken?.priceFeedId ?? null : null;
	$: if (currentFeedId) {
		fetchOracleData(currentFeedId);
	} else {
		resetOracleState();
	}

	const handleTokenTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (TOKEN_TABS.some((tab) => tab.id === nextId)) {
			activeTokenTab = nextId as TokenTabId;
		}
	};

	let showChartModal = false;

	function openChartModal(event?: Event) {
		event?.stopPropagation?.();
		showChartModal = true;
	}

	const closeTradePanel = () => {
		panelOpenedFromTerminal = false;
		showTradePanel = false;
	};

	const closeChartModal = () => {
		showChartModal = false;
		if (panelOpenedFromTerminal) {
			closeTradePanel();
		}
	};

	const openTradePanel = (side: 'Buy' | 'Sell', options: { closeTerminal?: boolean } = {}) => {
		panelOrderSide = side;
		panelStrategy = 'limit';
		const shouldCloseTerminal = options.closeTerminal ?? true;
		panelOpenedFromTerminal = !shouldCloseTerminal;
		showTradePanel = true;
		if (shouldCloseTerminal) {
			showChartModal = false;
		}
	};

	const handleGlobalKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			let handled = false;
			if (showTradePanel) {
				handled = true;
				closeTradePanel();
			}
			if (showChartModal) {
				handled = true;
				closeChartModal();
			}
			if (handled) {
				event.preventDefault();
			}
		}
	};

	$: onChainQuoteQuery = createQuery({
		queryKey: ['fetchAndQuoteUSDCOrders', $currentNetwork?.id],
		enabled: browser && !!$currentNetwork?.chainId,
		staleTime: 20_000,
		queryFn: async () => {
			if (!browser) return [];
			const networkId = $currentNetwork?.chainId;
			if (!networkId) return [];
			try {
				return await fetchAndQuoteUSDCOrders(networkId);
			} catch (error) {
				console.warn('[onchain-quotes] failed to fetch quotes', error);
				return [];
			}
		}
	});

	const resetOnChainPrices = () => {
		buyPrice = null;
		sellPrice = null;
	};

	$: {
		if (!browser || !currentToken) {
			resetOnChainPrices();
		} else {
			const networkId = $currentNetwork?.chainId;
			const usdcToken = networkId ? USDC_TOKENS[networkId] : undefined;
			const quotes = $onChainQuoteQuery.data ?? [];

				if (!usdcToken || !quotes.length) {
					resetOnChainPrices();
				} else {
					const map = buildTokenPriceMap(quotes, usdcToken.address);
					const summary = map.get(currentToken.address.toLowerCase()) ?? null;
					buyPrice = summary?.buy ?? null;
					sellPrice = summary?.sell ?? null;

					if (browser) {
						// Logging removed after validation
					}
				}
		}
	}

	$: tokenDisplayName = currentToken?.name ?? currentToken?.symbol ?? 'Token';
	$: tokenDisplaySymbol = currentToken?.symbol ?? '';
	$: pageTitle = `Trade ${tokenDisplayName}`;
	$: modalTitle = tokenDisplaySymbol
		? `Terminal View — ${tokenDisplayName} (${tokenDisplaySymbol})`
		: `Terminal View — ${tokenDisplayName}`;
	$: panelTokenLabel = tokenDisplaySymbol || currentToken?.symbol || tokenDisplayName;
	$: panelSummaryVerb = panelOrderSide === 'Buy' ? 'Buying' : 'Selling';
	$: panelSummaryPreposition = panelOrderSide === 'Buy' ? 'with' : 'for';
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<svelte:window on:keydown={handleGlobalKeydown} />

{#if !currentToken}
	<div class="flex h-screen items-center justify-center">
		<LoadingSpinner variant="fullscreen" size="xl" text="Loading token data..." />
	</div>
{:else}
	<div class="space-y-6 p-4 sm:p-6">
		<div class="flex flex-col gap-1 text-left sm:flex-row sm:items-baseline sm:gap-3">
			<h1 class="text-2xl font-bold">
				Trade {tokenDisplayName}
				{#if tokenDisplaySymbol}
					<span class="ml-2 text-lg font-normal text-gray-400">({tokenDisplaySymbol})</span>
				{/if}
			</h1>
		</div>
		<!-- Header Section with Chart -->
		<Section>
			<div class="grid grid-cols-1 gap-6 xl:grid-cols-5">
				<!-- Left: Symbol info -->
				<div class="space-y-4 xl:col-span-2">
					<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
						<div class="border-b border-white/10 bg-gray-900/60 px-4 py-3">
							<div class="flex items-start justify-between gap-4">
								<div>
									<p class="text-xs uppercase tracking-wide text-gray-400">Off-chain Reference</p>
									<p class="mt-1 text-base font-semibold text-gray-200">{tokenDisplayName}</p>
								</div>
								{#if tradingViewSymbol}
									<span class="text-sm text-gray-400">{tradingViewSymbol}</span>
								{/if}
							</div>
						</div>
						{#if tradingViewSymbol}
							<TradingViewSymbolInfo symbol={tradingViewSymbol} height="420" />
						{:else}
							<div class="flex h-48 items-center justify-center px-4 py-6 text-sm text-gray-400">
								TradingView data unavailable for this token.
							</div>
						{/if}
					</div>

					<div class={containerStyles.cardBordered}>
						<div class="border-b border-white/10 pb-3">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400">
								On-chain Price
							</h3>
						</div>
						<dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
							<div>
								<dt class="text-xs uppercase tracking-wide text-gray-500">Oracle Price</dt>
								<dd class="mt-1 font-medium text-gray-100">
									{#if oracleLoading}
										Loading...
									{:else if oraclePriceData}
										${formatNumeric(oraclePriceData.price)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wide text-gray-500">Confidence</dt>
								<dd class="mt-1 font-medium text-gray-100">
									{#if oracleLoading}
										Loading...
									{:else if oraclePriceData}
										± ${formatNumeric(oraclePriceData.confidence)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
							<div>
								<dt class="text-xs uppercase tracking-wide text-gray-500">Price to Buy</dt>
								<dd class="mt-1 font-medium text-gray-100">
									{#if $onChainQuoteQuery.isLoading}
										Loading...
									{:else if sellPrice !== null}
										${formatNumeric(sellPrice)}
									{:else}
										—
									{/if}
								</dd>
							</div>
							<div>
								<dt class="text-xs uppercase tracking-wide text-gray-500">Price to Sell</dt>
								<dd class="mt-1 font-medium text-gray-100">
									{#if $onChainQuoteQuery.isLoading}
										Loading...
									{:else if buyPrice !== null}
										${formatNumeric(buyPrice)}
									{:else}
										—
									{/if}
								</dd>
							</div>
						</dl>
						{#if oracleError}
							<p class="mt-4 text-xs text-red-400">{oracleError}</p>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							class="rounded-xl bg-green-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-gray-900"
							on:click={() => openTradePanel('Buy')}
						>
							Buy
						</button>
						<button
							type="button"
							class="rounded-xl bg-red-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-gray-900"
							on:click={() => openTradePanel('Sell')}
						>
							Sell
						</button>
					</div>
				</div>

				<!-- Right: Overview and chart -->
				<div class="flex h-full flex-col gap-4 xl:col-span-3">
					{#if tradingViewSymbol}
						<div class={`${containerStyles.cardBordered} flex-1 overflow-hidden p-0`}>
							<TradingViewSymbolOverview
								symbol={tradingViewSymbol}
								displayName={currentToken.name || currentToken.symbol}
								dateRange="1D"
								showVolume={false}
								autosize={false}
								height="485"
							/>
						</div>
					{:else}
						<div class={`${containerStyles.cardBordered} flex-1`}>
							<div class="flex h-[495px] items-center justify-center text-sm text-gray-400">
								TradingView data unavailable for this token.
							</div>
						</div>
					{/if}
					<div class="mb-[25px] mt-auto flex justify-end">
						<Button
							variant="secondary"
							size="md"
							className="w-full rounded-xl border border-yellow-400/40 bg-yellow-500/20 px-4 py-3 text-base font-semibold text-yellow-300 shadow-lg shadow-yellow-500/30 transition hover:border-yellow-300 hover:bg-yellow-500/30 hover:text-white sm:w-auto"
							aria-label="Open terminal view"
							on:click={(event) => openChartModal(event)}
						>
							Terminal View
						</Button>
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
				<div class="grid gap-6 lg:grid-cols-2">
					<div class="space-y-4">
						<div class="space-y-3">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
								Asset Details
							</h3>
							<TabNav
								tabs={ASSET_TABS}
								activeId={activeAssetTab}
								on:change={handleAssetTabChange}
							/>
						</div>
						{#if activeAssetTab === 'company'}
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewCompanyProfile symbol={tradingViewSymbol} height="480" />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						{:else if activeAssetTab === 'fundamentals'}
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewFundamentalData symbol={tradingViewSymbol} height={520} />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						{:else if activeAssetTab === 'technical'}
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewTechnicalAnalysis symbol={tradingViewSymbol} height="520" />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						{:else if tradingViewSymbol}
							<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
								<TradingViewTopStories symbol={tradingViewSymbol} height="600" />
							</div>
						{:else}
							<div class={`${containerStyles.cardBordered}`}>
								<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
							</div>
						{/if}
					</div>

					<div class="space-y-4">
						<div class="space-y-3">
							<h3 class="text-sm font-semibold uppercase tracking-wide text-gray-400">
								Token Details
							</h3>
							<TabNav
								tabs={TOKEN_TABS}
								activeId={activeTokenTab}
								on:change={handleTokenTabChange}
							/>
						</div>
						{#if activeTokenTab === 'contract'}
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
										<a href={`/trade/${tokenId}/proofs`} class="text-blue-400 hover:text-blue-300">
											View proofs
										</a>
									</div>
								</div>
							</div>
						{:else if activeTokenTab === 'supply'}
							<div class={containerStyles.cardBordered}>
								<h3 class="mb-3 font-semibold">Supply & Distribution</h3>
								<div class="space-y-3 text-sm">
									<div class="flex justify-between">
										<span class="text-gray-400">Total Supply</span>
										<span>{formatUnits(BigInt(currentToken.totalShares), 18)}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">On-Chain Market Cap</span>
										<span>N/A</span>
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
						{:else if activeTokenTab === 'mints'}
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
														<span class="font-medium text-green-400">
															+ {formatUnits(BigInt(dep.amount), 18)}
															{currentToken.symbol}
														</span>
													</div>
													<div class="flex flex-shrink-0 items-center gap-2">
														<TxLink hash={dep.transaction.id} />
													</div>
												</div>
												<div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
													<span class="text-gray-400">
														<span class="sm:hidden">…{dep.emitter.address.slice(-6)}</span>
														<span class="hidden sm:inline">
															{dep.emitter.address.slice(0, 6)}...{dep.emitter.address.slice(-4)}
														</span>
													</span>
													<span class="mx-2 text-gray-500">•</span>
													<span>{new Date(Number(dep.timestamp) * 1000).toLocaleString()}</span>
												</div>
											</div>
										{/each}
									</div>
								{:else}
									<div class="text-sm text-gray-400">No recent mints.</div>
								{/if}
							</div>
						{:else}
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
														<span class="font-medium text-red-400">
															− {formatUnits(BigInt(w.amount), 18)}
															{currentToken.symbol}
														</span>
													</div>
													<div class="flex flex-shrink-0 items-center gap-2">
														<TxLink hash={w.transaction.id} />
													</div>
												</div>
												<div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
													<span class="text-gray-400">
														<span class="sm:hidden">…{w.emitter.address.slice(-6)}</span>
														<span class="hidden sm:inline">
															{w.emitter.address.slice(0, 6)}...{w.emitter.address.slice(-4)}
														</span>
													</span>
													<span class="mx-2 text-gray-500">•</span>
													<span>{new Date(Number(w.timestamp) * 1000).toLocaleString()}</span>
												</div>
											</div>
										{/each}
									</div>
								{:else}
									<div class="text-sm text-gray-400">No recent burns.</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</Section>
	</div>

	{#if showTradePanel}
		<div class="fixed inset-0 z-[2100] flex">
			<button type="button" class="flex-1" aria-label="Close trade panel" on:click={closeTradePanel}
			></button>
			<aside
				class="relative h-full w-full max-w-[20rem] border-l border-white/10 bg-gradient-to-b from-gray-950 to-gray-900 shadow-2xl"
				in:fly={{ x: 320, duration: 220 }}
				out:fly={{ x: 320, duration: 180 }}
				role="dialog"
				aria-modal="true"
				aria-label={'Trade ' + tokenDisplayName}
			>
				<div class="flex h-full flex-col">
					<div class="flex items-start justify-between border-b border-white/10 px-6 py-5">
					<div class="flex items-start gap-3">
						{#if currentPythToken?.logoUrl}
							<img
								src={currentPythToken.logoUrl}
								alt={tokenDisplaySymbol || tokenDisplayName}
									class="h-10 w-10 rounded-full border border-white/10 object-cover"
								/>
							{/if}
						<div>
							<h2 class="text-lg font-semibold text-white">{tokenDisplayName}</h2>
							{#if tokenDisplaySymbol}
								<p class="text-sm text-gray-400">{tokenDisplaySymbol}</p>
							{/if}
							</div>
						</div>
						<button
							type="button"
							class="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
							on:click={closeTradePanel}
							aria-label="Close trade panel"
						>
							<svg
								class="h-5 w-5"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M6 6l12 12M6 18L18 6" />
							</svg>
						</button>
					</div>
					<div class="flex-1 overflow-y-auto px-6 py-6">
						<div class="space-y-6 pb-10">
							<div class="grid grid-cols-2 gap-3" aria-label="Select order side">
								<button
									type="button"
									class={`rounded-lg px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 ${
										panelOrderSide === 'Buy'
											? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
											: 'bg-white/5 text-gray-200 hover:bg-white/10'
									}`}
									on:click={() => (panelOrderSide = 'Buy')}
								>
									Buy
								</button>
								<button
									type="button"
									class={`rounded-lg px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-yellow-500/40 ${
										panelOrderSide === 'Sell'
											? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
											: 'bg-white/5 text-gray-200 hover:bg-white/10'
									}`}
									on:click={() => (panelOrderSide = 'Sell')}
								>
									Sell
								</button>
							</div>
						<div class="flex items-center gap-2 text-sm font-medium text-gray-300">
							<span>{panelSummaryVerb} {panelTokenLabel}</span>
							<span class="text-gray-500">{panelSummaryPreposition}</span>
							<span class="inline-flex items-center gap-1 text-gray-200">
								USDC
								<img src="/images/USDC.png" alt="USDC" class="h-4 w-4" />
							</span>
						</div>
						<label class="block space-y-2" for={PANEL_STRATEGY_SELECT_ID}>
							<span id={PANEL_STRATEGY_LABEL_ID} class="block text-sm font-medium text-gray-300">
								Order Type
							</span>
								<Select
									options={PANEL_STRATEGY_OPTIONS}
									bind:selected={panelStrategy}
									id={PANEL_STRATEGY_SELECT_ID}
									ariaLabelledby={PANEL_STRATEGY_LABEL_ID}
									getOptionLabel={(opt) => (opt === 'limit' ? 'Limit Order' : 'DCA Order')}
								/>
							</label>
							<div>
								{#if panelStrategy === 'limit'}
									<LimitStrategy orderSide={panelOrderSide} passedOutputToken={currentPythToken} />
								{:else}
									<div class="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
										<div class="flex items-center justify-between">
											<span class="font-semibold text-gray-300">DCA orders</span>
											<span class="rounded-full bg-yellow-400/10 px-2 py-0.5 text-xs font-semibold text-yellow-300">
												Coming soon
											</span>
										</div>
										<p class="mt-2 text-xs text-gray-500">
											Automated DCA flows are on the way. Stay tuned, or place a limit order in the meantime.
										</p>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</aside>
		</div>
	{/if}

	<Footer />
{/if}

{#if showChartModal}
	<div class="fixed inset-0 z-[2000]">
		<button
			type="button"
			class="absolute inset-0 h-full w-full bg-black/60"
			aria-label="Close terminal view"
			on:click={closeChartModal}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					closeChartModal();
				}
			}}
		></button>
		<div class="relative z-10 flex h-full flex-col bg-gray-950">
			<div class="flex items-center justify-between border-b border-white/10 px-6 py-5">
				<div>
					<p class="text-xs uppercase tracking-wide text-gray-500">Terminal View</p>
					<h2 class="text-xl font-semibold text-white">{modalTitle}</h2>
				</div>
				<button
					type="button"
					class="rounded-lg p-2 text-gray-400 transition hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
					on:click={closeChartModal}
					aria-label="Close terminal view"
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</div>
			<div class="flex-1 overflow-hidden px-6 pb-6 pt-4">
				<div class="h-full w-full rounded-xl border border-white/10 bg-gray-900 p-2">
					{#if tradingViewSymbol}
						<TradingViewChart symbol={tradingViewSymbol} interval="60" />
					{:else}
						<div class="flex h-full items-center justify-center text-sm text-gray-400">
							TradingView data unavailable for this token.
						</div>
					{/if}
				</div>
			</div>
			<div
				class="flex flex-col gap-3 border-t border-white/10 bg-gradient-to-r from-green-500/10 via-gray-900/80 to-red-500/10 px-6 py-6 sm:flex-row sm:justify-end"
			>
				<button
					type="button"
					class="w-full rounded-2xl bg-green-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-green-500/30 transition hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:w-auto"
					on:click={() => openTradePanel('Buy', { closeTerminal: false })}
				>
					Buy
				</button>
				<button
					type="button"
					class="w-full rounded-2xl bg-red-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-red-500/30 transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400/60 focus:ring-offset-2 focus:ring-offset-gray-900 sm:w-auto"
					on:click={() => openTradePanel('Sell', { closeTerminal: false })}
				>
					Sell
				</button>
			</div>
		</div>
	</div>
{/if}
