<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, sfts, tokenGlobalQuote } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import ListCard from '$lib/components/ui/ListCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { searchAnalytics, trackSearchDebounced } from '$lib/analytics';
	import { createQuery } from '@tanstack/svelte-query';
	import { getAllTokensByNetwork } from '$lib/network';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import type { TradingViewQuote } from '$lib/services/tradingview';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	// Consolidated table usage
	import { containerStyles } from '$lib/utils/styles';
	import { onMount } from 'svelte';

	let st0xVaults: OffchainAssetReceiptVault[] = [];

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let searchTerm = '';
	let filteredSfts: OffchainAssetReceiptVault[] = [];
	/* eslint-disable @typescript-eslint/no-explicit-any */
	let biggestMovers: any[] = [];
	let biggestVolume: any[] = [];
	let recentlyAdded: OffchainAssetReceiptVault[] = [];
	let isSearching = false;
	let currentSearchId: string | null = null;

	function baseFromSymbol(sym?: string) {
		if (!sym) return undefined;
		if (sym.includes('s1')) return sym.split('s1')[0];
		if (sym.includes('0x')) return sym.split('0x')[0];
		return sym;
	}

	function findTradingViewSymbol(symbol?: string) {
		const base = baseFromSymbol(symbol);
		if (!base) return undefined;
		const match = ALL_TOKENS.find((token) => baseFromSymbol(token.symbol)?.toUpperCase() === base.toUpperCase());
		return match?.tradingViewSymbol;
	}

	function findQuoteForSymbol(symbol?: string) {
		if (!$tokenGlobalQuote?.length) return undefined;
		const quotes = $tokenGlobalQuote as TradingViewQuote[];
		const tradingSymbol = findTradingViewSymbol(symbol);
		if (tradingSymbol) {
			const tsUpper = tradingSymbol.toUpperCase();
			const direct = quotes.find((q) => (q.symbol ?? '').toUpperCase() === tsUpper);
			if (direct) return direct;
		}
		const base = baseFromSymbol(symbol)?.toUpperCase();
		if (!base) return undefined;
		return quotes.find((q) => {
			const quoteSymbol = (q.symbol ?? '').toUpperCase();
			if (quoteSymbol === base) return true;
			const parts = quoteSymbol.split(':');
			return parts[parts.length - 1] === base;
		});
	}

	// Scroll indicator for Discover section
	let discoverScrollEl: HTMLDivElement;
	let showScrollIndicator = false;
	let hasDiscoverOverflow = false;
	let customScrollThumbWidth = 0;
	let customScrollThumbLeft = 0;

	function updateCustomScrollbarMetrics() {
		if (!discoverScrollEl) return;
		const el = discoverScrollEl;
		hasDiscoverOverflow = el.scrollWidth > el.clientWidth + 1;
		if (!hasDiscoverOverflow) {
			customScrollThumbWidth = 0;
			customScrollThumbLeft = 0;
			return;
		}
		const visibleRatio = el.clientWidth / el.scrollWidth;
		const minThumb = 24; // px
		customScrollThumbWidth = Math.max(minThumb, Math.floor(visibleRatio * el.clientWidth));
		const maxLeft = Math.max(0, el.clientWidth - customScrollThumbWidth);
		const scrollRatio = el.scrollLeft / (el.scrollWidth - el.clientWidth);
		customScrollThumbLeft = Math.max(
			0,
			Math.min(maxLeft, Math.floor(maxLeft * (isFinite(scrollRatio) ? scrollRatio : 0)))
		);
	}

	function checkScrollable() {
		if (discoverScrollEl && window.innerWidth >= 640) {
			const hasOverflow = discoverScrollEl.scrollWidth > discoverScrollEl.clientWidth;
			const isAtEnd =
				discoverScrollEl.scrollLeft + discoverScrollEl.clientWidth >=
				discoverScrollEl.scrollWidth - 5;
			showScrollIndicator = hasOverflow && !isAtEnd;
			updateCustomScrollbarMetrics();
		} else {
			showScrollIndicator = false;
			hasDiscoverOverflow = false;
		}
	}

	onMount(() => {
		checkScrollable();
		window.addEventListener('resize', checkScrollable);
		return () => {
			window.removeEventListener('resize', checkScrollable);
		};
	});

	$: {
		const trimmedSearch = searchTerm.trim();
		if (trimmedSearch.length >= 3) {
			// Start tracking search
			searchAnalytics.trackSearchStart();

			isSearching = true;
			filteredSfts = $sfts.filter(
				(s) =>
					s.name.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
					s.symbol.toLowerCase().includes(trimmedSearch.toLowerCase())
			);

			// Track the search with debouncing (800ms delay) to avoid too many events
			trackSearchDebounced(trimmedSearch, filteredSfts.length, 800);
			currentSearchId = trimmedSearch; // Store for click tracking
		} else {
			isSearching = false;
			filteredSfts = [];
			currentSearchId = null;
		}
	}

	function handleResultClick(sft: OffchainAssetReceiptVault, position: number) {
		// Track the click
		if (currentSearchId) {
			searchAnalytics.trackClick(currentSearchId, sft.symbol, position);
		}
		// Clear search term
		searchTerm = '';
	}

	$: if ($sfts && $tokenGlobalQuote) {
		st0xVaults = $sfts;

		// Check if scrollable after data loads
		setTimeout(checkScrollable, 100);

		// Calculate biggest movers based on TradingView daily change percentage
		biggestMovers = [...st0xVaults]
			.map((sft) => {
				const quote = findQuoteForSymbol(sft.symbol);
				const changePercent = quote?.changePercent ?? 0;
				return { ...sft, changePercent };
			})
			.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
			.slice(0, 5);

		// Calculate biggest volume based on on-chain transfers and deposits/withdrawals
		biggestVolume = [...st0xVaults]
			.map((sft) => {
				// Calculate total on-chain volume (deposits + withdrawals + transfers)
				const depositVolume = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
				const withdrawVolume = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
				const totalVolume = depositVolume + withdrawVolume;
				const transferCount = sft.shareTransfers.length;
				return { ...sft, totalVolume, transferCount };
			})
			.sort((a, b) => {
				// Sort by total volume, then by transfer count as tiebreaker
				const volumeDiff = Number(b.totalVolume - a.totalVolume);
				return volumeDiff !== 0 ? volumeDiff : b.transferCount - a.transferCount;
			})
			.slice(0, 5);

		// Sort by deployment timestamp (most recent first)
		recentlyAdded = [...st0xVaults]
			.sort((a, b) => {
				// deployTimestamp is a string timestamp in seconds
				const timestampA = parseInt(a.deployTimestamp || '0');
				const timestampB = parseInt(b.deployTimestamp || '0');
				return timestampB - timestampA;
			})
			.slice(0, 5);
	}

	// Process tokens with quote data
	$: query = createQuery({
		queryKey: ['getSftsStocks', $currentNetwork?.id, $sfts?.length, $tokenGlobalQuote?.length],
		enabled: !!($sfts && $currentNetwork?.chainId),
		queryFn: () => {
			const sftVaults: OffchainAssetReceiptVault[] = $sfts || [];
			const tokens = [];

			// Process SFT vaults (from subgraph)
			for (let sft of sftVaults) {
				const quote = findQuoteForSymbol(sft.symbol);
				const price = quote?.close ?? 0;
				tokens.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					price,
					totalHolders: sft.tokenHolders.length.toString(),
					totalSupply: formatUnits(BigInt(sft.totalShares), 18),
					totalTransfers: sft.shareTransfers.length.toString(),
					createdAt: sft.deployTimestamp,
					isSft: true
				});
			}

			return tokens;
		}
	});
</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner
			variant="fullscreen"
			size="lg"
			text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..."
		/>
	</div>
{:else if $sfts.length > 0}
	<div>
		<PageContainer>
			<div class="relative z-50 mb-8">
				<Section>
					<div class="mx-auto max-w-3xl">
						<div class="relative">
							<SearchBar
								bind:value={searchTerm}
								placeholder="Search stocks by name or symbol..."
								minChars={3}
							/>
						</div>
					</div>
				</Section>
				{#if isSearching}
					<div
						class="absolute left-1/2 top-full z-50 mt-2 w-full max-w-3xl -translate-x-1/2 px-4 sm:px-6"
					>
						{#if filteredSfts.length > 0}
							<div
								class="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm"
							>
								<div class="bg-gray-800/50 px-4 py-2 text-xs text-gray-400">
									{filteredSfts.length} result{filteredSfts.length === 1 ? '' : 's'} found
								</div>
								{#each filteredSfts.slice(0, 10) as sft, index}
									<a
										class="block px-4 py-3 transition-colors hover:bg-white/10"
										href={`/trade/${sft.id}`}
										on:click={() => handleResultClick(sft, index)}
									>
										<div class="flex items-center justify-between">
											<div class="min-w-0">
												<div class="truncate text-sm font-semibold text-white sm:text-base">
													<!-- eslint-disable-next-line svelte/no-at-html-tags -->
													{@html sft.name.replace(
														new RegExp(`(${searchTerm.trim()})`, 'gi'),
														'<span class="text-yellow-400">$1</span>'
													)}
												</div>
												<div class="text-xs text-gray-400">
													<!-- eslint-disable-next-line svelte/no-at-html-tags -->
													{@html sft.symbol.replace(
														new RegExp(`(${searchTerm.trim()})`, 'gi'),
														'<span class="text-yellow-400">$1</span>'
													)}
												</div>
											</div>
											<div class="ml-3 flex items-center gap-1 text-xs text-yellow-500">
												<span>View</span>
												<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M9 5l7 7-7 7"
													/>
												</svg>
											</div>
										</div>
									</a>
								{/each}
								{#if filteredSfts.length > 10}
									<div class="bg-gray-800/50 px-4 py-2 text-center text-xs text-gray-400">
										Showing first 10 results
									</div>
								{/if}
							</div>
						{:else}
							<EmptyState
								title="No stocks found matching '{searchTerm}'"
								description="Try searching for a different name or symbol"
								showBorder={true}
								className="shadow-xl"
							/>
						{/if}
					</div>
				{/if}
			</div>

			<Section>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Discover</h2>
				</div>
				<div class="relative">
					<style>
						/* Base: reserve gutter for a visible scrollbar and style it */
						.discover-scroll {
							overflow-x: auto; /* Show scrollbar only if needed */
							overflow-y: hidden;
							padding-bottom: 16px; /* space for scrollbar */
							margin-bottom: -16px; /* pull content back up */
							position: relative;
							scrollbar-gutter: stable both-edges; /* keep scrollbar track space reserved */
							-ms-overflow-style: scrollbar; /* legacy Edge/IE - prefer classic scrollbars */
						}

						/* WebKit (Chrome, Safari, Edge) */
						.discover-scroll::-webkit-scrollbar {
							height: 10px;
						}
						.discover-scroll::-webkit-scrollbar-track {
							background: rgba(31, 41, 55, 0.2);
							border-radius: 5px;
							transition: background 0.2s;
						}
						.discover-scroll:hover::-webkit-scrollbar-track {
							background: rgba(31, 41, 55, 0.6);
						}
						.discover-scroll::-webkit-scrollbar-thumb {
							background: rgba(75, 85, 99, 0.45);
							border-radius: 5px;
							transition: background 0.2s;
						}
						.discover-scroll:hover::-webkit-scrollbar-thumb {
							background: rgba(107, 114, 128, 0.85);
						}
						.discover-scroll::-webkit-scrollbar-thumb:hover {
							background: #6b7280;
						}

						/* Firefox */
						.discover-scroll {
							scrollbar-width: auto;
							scrollbar-color: rgba(75, 85, 99, 0.45) rgba(31, 41, 55, 0.2);
						}
						.discover-scroll:hover {
							scrollbar-color: rgba(107, 114, 128, 0.85) rgba(31, 41, 55, 0.6);
						}

						/* On sm+ we intentionally allow horizontal scrolling for the card row */
						@media (min-width: 640px) {
							.discover-scroll {
								overflow-x: auto; /* keep auto; gutter ensures the track area is visible */
							}
						}

						/* Custom persistent scrollbar (mirrors native scroll) */
						.custom-scrollbar {
							position: absolute;
							left: 0;
							right: 0;
							bottom: 0;
							height: 8px;
							background: rgba(31, 41, 55, 0.25);
							border-radius: 4px;
							pointer-events: none; /* visual indicator only */
						}
						.custom-scrollbar__thumb {
							height: 100%;
							background: rgba(243, 177, 60, 0.85); /* brand yellow-ish */
							border-radius: 4px;
							transform: translateX(0);
							will-change: transform, width;
						}
					</style>
					<!-- Mobile: vertical stack, Desktop: horizontal scroll -->
					<div class="discover-scroll" bind:this={discoverScrollEl} on:scroll={checkScrollable}>
						<div
							class="grid grid-cols-1 gap-3 sm:min-w-[1080px] sm:grid-cols-3 sm:gap-4 sm:[grid-template-columns:repeat(3,minmax(336px,1fr))]"
						>
							<ListCard
								title="Biggest Movers (24H)"
								items={biggestMovers.map((s) => {
									const quote = findQuoteForSymbol(s.symbol);
									const price = quote?.close ?? null;
									const tokenInfo = ALL_TOKENS.find(
										(t) => t.address.toLowerCase() === s.address.toLowerCase()
									);
									return {
										name: s.name,
										symbol: s.symbol,
										href: `/trade/${s.id}`,
										logoUrl: tokenInfo?.logoUrl,
										price: price != null ? price.toFixed(2) : 'N/A',
										metadata: s.changePercent
											? `${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}%`
											: 'N/A',
										metadataClass:
											s.changePercent > 0
												? 'text-green-400'
												: s.changePercent < 0
													? 'text-red-400'
													: 'text-gray-400'
									};
								})}
							/>
							<ListCard
								title="Biggest Volume"
								items={biggestVolume.map((s) => {
									const tokenInfo = ALL_TOKENS.find(
										(t) => t.address.toLowerCase() === s.address.toLowerCase()
									);
									const volumeInShares = parseFloat(formatUnits(s.totalVolume, 18));
									const quote = findQuoteForSymbol(s.symbol);
									const price = quote?.close ?? 0;
									const dollarVolume = volumeInShares * price;

									const volumeStr =
										dollarVolume >= 1000000
											? `$${(dollarVolume / 1000000).toFixed(2)}M`
											: dollarVolume >= 1000
												? `$${(dollarVolume / 1000).toFixed(1)}K`
												: `$${dollarVolume.toFixed(2)}`;

									return {
										name: s.name,
										symbol: s.symbol,
										href: `/trade/${s.id}`,
										logoUrl: tokenInfo?.logoUrl,
										metadata: `${s.transferCount} txs\n${volumeStr}`,
										metadataClass: 'text-yellow-400'
									};
								})}
							/>
							<ListCard
								title="Most Recently Added"
								items={recentlyAdded.map((s) => {
									const timestamp = parseInt(s.deployTimestamp || '0');
									const date = new Date(timestamp * 1000);
									const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
									const tokenInfo = ALL_TOKENS.find(
										(t) => t.address.toLowerCase() === s.address.toLowerCase()
									);
									return {
										name: s.name,
										symbol: s.symbol,
										href: `/trade/${s.id}`,
										logoUrl: tokenInfo?.logoUrl,
										metadata:
											daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`,
										metadataClass: 'text-blue-400'
									};
								})}
							/>
						</div>
					</div>
					<!-- Always-visible custom scrollbar for Chrome/Firefox on macOS -->
					{#if hasDiscoverOverflow}
						<div class="custom-scrollbar hidden sm:block" aria-hidden="true">
							<div
								class="custom-scrollbar__thumb"
								style={`width:${customScrollThumbWidth}px; transform: translateX(${customScrollThumbLeft}px);`}
							/>
						</div>
					{/if}
					<!-- Scroll indicator arrow -->
					{#if showScrollIndicator}
						<div
							class="pointer-events-none absolute -right-1 top-0 hidden h-full items-center sm:flex"
						>
							<div class="animate-pulse rounded-full bg-yellow-500/20 p-1.5 backdrop-blur-sm">
								<svg
									class="h-4 w-4 text-yellow-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2.5"
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</div>
						</div>
					{/if}
				</div>
			</Section>

			<!-- Stock Table Section -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Browse Stocks</h2>
				</div>
				<div class={'overflow-x-auto ' + containerStyles.cardBordered}>
					<Table>
						<thead>
							<tr class="border-b border-white/10">
								<th
									class="sticky left-0 z-10 bg-gray-800 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Stock</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Price</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>On-Chain Price</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>On-Chain Market Cap</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>On-Chain Supply</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Holders</th
								>
								<th class="w-8"></th>
							</tr>
						</thead>
						<tbody>
							{#each $query.data || [] as token (token.id)}
								{@const sft = $sfts.find((s) => s.id === token.id)}
								{@const deposits = sft
									? sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0))
									: BigInt(0)}
								{@const withdraws = sft
									? sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0))
									: BigInt(0)}
								{@const circulating = deposits - withdraws}
								{@const circulatingSupply = parseFloat(formatUnits(circulating, 18))}
								{@const onChainPrice = parseFloat(token.price.toString())}
								{@const onChainMarketCap = circulatingSupply * onChainPrice}
								<tr
									class="cursor-pointer transition-colors hover:bg-yellow-500/5"
									on:click={() => goto(`/trade/${token.id}`)}
								>
									<td class="sticky left-0 bg-gray-800 px-2 py-2 sm:px-4 sm:py-3">
										<TokenDisplay
											logoUrl={ALL_TOKENS.find(
												(s) => s.address.toLowerCase() === token.address.toLowerCase()
											)?.logoUrl}
											symbol={token.symbol}
											name={token.name}
										/>
									</td>
									<td class="px-2 py-2 sm:px-4 sm:py-3">
										<div class="font-medium">${onChainPrice.toFixed(2)}</div>
									</td>
									<td class="px-2 py-2 sm:px-4 sm:py-3">
										<div class="text-sm text-gray-500">TBD</div>
									</td>
									<td class="px-2 py-2 sm:px-4 sm:py-3">
										<div class="text-sm">
											${onChainMarketCap >= 1000000
												? `${(onChainMarketCap / 1000000).toFixed(2)}M`
												: onChainMarketCap >= 1000
													? `${(onChainMarketCap / 1000).toFixed(1)}K`
													: onChainMarketCap.toFixed(2)}
										</div>
									</td>
									<td class="px-4 py-3">
										<div class="text-sm">
											{circulatingSupply >= 1000
												? `${(circulatingSupply / 1000).toFixed(2)}K`
												: circulatingSupply.toFixed(2)}
										</div>
									</td>
									<td class="px-2 py-2 sm:px-4 sm:py-3">
										<div class="text-sm">{token.totalHolders}</div>
									</td>
									<td class="px-2 py-2 sm:px-4 sm:py-3">
										<svg
											class="h-4 w-4 text-gray-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M9 5l7 7-7 7"
											/>
										</svg>
									</td>
								</tr>
							{/each}
						</tbody>
					</Table>
				</div>
			</Section>
		</PageContainer>

		<Footer />
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<EmptyState
			title="No SFTs Found"
			description="No SFTs available on {$currentNetwork?.displayName || 'this network'}."
		/>
	</div>
{/if}
