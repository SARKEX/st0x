<script lang="ts">
	import { page } from '$app/stores';
	import { currentNetwork, sfts } from '$lib/stores';
	import { formatUnits } from 'viem';
	import { TOKENS } from '$lib/network';
	import Footer from '$lib/components/Footer.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import LimitStrategy from '$lib/components/orders/LimitStrategy.svelte';
	import DcaStrategy from '$lib/components/orders/DcaStrategy.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import TradingViewChart from '$lib/components/charts/TradingViewChart.svelte';
	import TradingViewSymbolOverview from '$lib/components/charts/TradingViewSymbolOverview.svelte';
	import TradingViewSymbolInfo from '$lib/components/charts/TradingViewSymbolInfo.svelte';
	import TradingViewCompanyProfile from '$lib/components/charts/TradingViewCompanyProfile.svelte';
	import TradingViewFundamentalData from '$lib/components/charts/TradingViewFundamentalData.svelte';
	import TradingViewTechnicalAnalysis from '$lib/components/charts/TradingViewTechnicalAnalysis.svelte';
	import TradingViewTopStories from '$lib/components/charts/TradingViewTopStories.svelte';
	import TxLink from '$lib/components/ui/TxLink.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { onMount } from 'svelte';
	import { slide, fade } from 'svelte/transition';

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

	let activeTab: 'company' | 'fundamentals' | 'technical' | 'news' | 'token' | 'mints-burns' = 'company';
	let activeOrderType: 'limit' | 'dca' = 'limit';
	let infoCollapsed = false;
	let tradeCollapsed = false;

	onMount(() => {
		if (typeof window !== 'undefined') {
			const isMobile = window.innerWidth < 640;
			infoCollapsed = isMobile;
			tradeCollapsed = isMobile;
		}
		return () => {};
	});

	const TABS = [
		{ id: 'company', label: 'Company Info' },
		{ id: 'fundamentals', label: 'Fundamentals' },
		{ id: 'technical', label: 'Technical' },
		{ id: 'news', label: 'Top Stories' },
		{ id: 'token', label: 'Token Info' },
		{ id: 'mints-burns', label: 'Mints & Burns' }
	];

	let showChartModal = false;

	function openChartModal() {
		showChartModal = true;
	}

	$: tokenDisplayName = currentToken?.name ?? currentToken?.symbol ?? 'Token';
	$: tokenDisplaySymbol = currentToken?.symbol ?? '';
	$: pageTitle = `Trade ${tokenDisplayName}`;
	$: modalTitle = tokenDisplaySymbol
		? `Advanced Chart — ${tokenDisplayName} (${tokenDisplaySymbol})`
		: `Advanced Chart — ${tokenDisplayName}`;

</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

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
					{#if tradingViewSymbol}
						<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
							<div class="border-b border-white/10 bg-gray-900/60 px-4 py-3">
								<p class="text-xs uppercase tracking-wide text-gray-400">Asset</p>
								<div class="mt-1 flex items-center justify-between gap-4">
									<span class="text-base font-semibold text-gray-200">{tokenDisplayName}</span>
									<span class="text-sm text-gray-400">{tradingViewSymbol}</span>
								</div>
							</div>
							<TradingViewSymbolInfo symbol={tradingViewSymbol} height="360" />
						</div>
					{:else}
						<div class={`${containerStyles.cardBordered}`}>
							<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
						</div>
					{/if}
				</div>

				<!-- Right: Overview and chart -->
				<div class="space-y-4 xl:col-span-3">
					{#if tradingViewSymbol}
						<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
							<TradingViewSymbolOverview
								symbol={tradingViewSymbol}
								displayName={currentToken.name || currentToken.symbol}
								dateRange="1D"
								showVolume={false}
								autosize={false}
								height="360"
							/>
						</div>
						<div class="flex justify-end">
							<Button
								variant="ghost"
								size="sm"
								className="px-4"
								aria-label="View advanced chart"
								on:click={openChartModal}
							>
								View Advanced Chart
							</Button>
						</div>
					{:else}
						<div class={`${containerStyles.cardBordered}`}>
							<div class="flex h-60 items-center justify-center text-sm text-gray-400">
								TradingView data unavailable for this token.
							</div>
						</div>
					{/if}
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
						<TabNav className="mb-6" tabs={TABS} bind:activeId={activeTab} />

										<!-- Tab Content -->
					{#if activeTab === 'company'}
						<div id="panel-company" role="tabpanel" class="space-y-4">
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewCompanyProfile symbol={tradingViewSymbol} height="480" />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'fundamentals'}
						<div id="panel-fundamentals" role="tabpanel" class="space-y-4">
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewFundamentalData symbol={tradingViewSymbol} height={520} />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'technical'}
						<div id="panel-technical" role="tabpanel" class="space-y-4">
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewTechnicalAnalysis symbol={tradingViewSymbol} height="520" />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'news'}
						<div id="panel-news" role="tabpanel" class="space-y-4">
							{#if tradingViewSymbol}
								<div class={`${containerStyles.cardBordered} overflow-hidden p-0`}>
									<TradingViewTopStories symbol={tradingViewSymbol} height="600" />
								</div>
							{:else}
								<div class={`${containerStyles.cardBordered}`}>
									<p class="text-sm text-gray-400">TradingView data unavailable for this token.</p>
								</div>
							{/if}
						</div>
					{:else if activeTab === 'token'}
						<div id="panel-token" role="tabpanel" class="space-y-4">
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
												<span class="font-medium text-green-400">
													+ {formatUnits(BigInt(dep.amount), 18)} {currentToken.symbol}
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
													− {formatUnits(BigInt(w.amount), 18)} {currentToken.symbol}
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
								<LimitStrategy passedOutputToken={currentPythToken} />
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
	title={modalTitle}
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
