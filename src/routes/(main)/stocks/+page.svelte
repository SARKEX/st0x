<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, sfts, tokenGlobalQuote } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import ListCard from '$lib/components/ui/ListCard.svelte';
	import { searchAnalytics, trackSearchDebounced } from '$lib/analytics';
	import { createQuery } from '@tanstack/svelte-query';
	import { getAllTokensByNetwork, getTokensByCategory } from '$lib/network';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import type { ApiStockQuote } from '$lib/types';

	let st0xVaults: OffchainAssetReceiptVault[] = [];
	
	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];
	
	let viewMode = 'table';
	let activeFilter = 'All';

	let searchTerm = '';
	let filteredSfts: OffchainAssetReceiptVault[] = [];
	let biggestMovers: OffchainAssetReceiptVault[] = [];
	let biggestVolume: OffchainAssetReceiptVault[] = [];
	let recentlyAdded: OffchainAssetReceiptVault[] = [];
	let isSearching = false;
	let currentSearchId: string | null = null;

	function getRandomItems<T>(arr: T[], count: number): T[] {
		const copy = [...arr];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy.slice(0, count);
	}

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

	$: if ($sfts) {
		st0xVaults = $sfts;

		// Random selections for cards (placeholder until real metrics implemented)
		biggestMovers = getRandomItems(st0xVaults, 5);
		biggestVolume = getRandomItems(st0xVaults, 5);
		recentlyAdded = getRandomItems(st0xVaults, 5);
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
				const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === sft.symbol?.split('s1')[0]
				);
				const sftPrice = quote?.['Global Quote']?.['05. price'] ?? 0;
				tokens.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					price: sftPrice,
					totalHolders: sft.tokenHolders.length.toString(),
					totalSupply: formatUnits(BigInt(sft.totalShares), 18),
					marketCap: formatUnits(
						BigInt(Math.floor(Number(sftPrice))) * BigInt(sft.totalShares),
						18
					),
					totalTransfers: sft.shareTransfers.length.toString(),
					createdAt: sft.deployTimestamp,
					isSft: true
				});
			}

			return tokens;
		}
	});

	$: filteredData = ($query.data ?? []).filter((token) => {
		if (activeFilter === 'All') return true;
		if (activeFilter === 'ST0x') {
			return getTokensByCategory('ST0x')
				.filter((t) => t.chainId === $currentNetwork?.chainId)
				.some((t) => t.address.toLowerCase() === token.address.toLowerCase());
		}
		if (activeFilter === 'ETFs') {
			return getTokensByCategory('ETFs')
				.filter((t) => t.chainId === $currentNetwork?.chainId)
				.some((t) => t.address.toLowerCase() === token.address.toLowerCase());
		}
		return false;
	});

	function truncateId(id: string, start: number = 6, end: number = 4) {
		if (!id) return '';
		if (id.length <= start + end + 3) return id;
		return `${id.slice(0, start)}...${id.slice(-end)}`;
	}
</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..." />
	</div>
{:else if $sfts.length > 0}
	<div>
		<div class="space-y-4 p-3 sm:space-y-6 sm:p-4 lg:space-y-8 lg:p-6">
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
					<div class="absolute left-1/2 top-full z-50 mt-2 w-full max-w-3xl -translate-x-1/2 px-4 sm:px-6">
								{#if filteredSfts.length > 0}
									<div class="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm">
										<div class="bg-gray-800/50 px-4 py-2 text-xs text-gray-400">
											{filteredSfts.length} result{filteredSfts.length === 1 ? '' : 's'} found
										</div>
										{#each filteredSfts.slice(0, 10) as sft, index}
											<a 
												class="block px-4 py-3 transition-colors hover:bg-white/10" 
												href={`/tokens/${sft.id}`}
												on:click={() => handleResultClick(sft, index)}
											>
												<div class="flex items-center justify-between">
													<div class="min-w-0">
														<div class="truncate text-sm font-semibold text-white sm:text-base">
															{@html sft.name.replace(
																new RegExp(`(${searchTerm.trim()})`, 'gi'),
																'<span class="text-yellow-400">$1</span>'
															)}
														</div>
														<div class="text-xs text-gray-400">
															{@html sft.symbol.replace(
																new RegExp(`(${searchTerm.trim()})`, 'gi'),
																'<span class="text-yellow-400">$1</span>'
															)}
														</div>
													</div>
													<div class="ml-3 flex items-center gap-1 text-xs text-yellow-500">
														<span>View</span>
														<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
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
									<div class="rounded-xl border border-white/10 bg-gray-900/95 px-4 py-8 text-center shadow-xl backdrop-blur-sm">
										<div class="text-gray-400">No stocks found matching "{searchTerm}"</div>
										<div class="mt-2 text-xs text-gray-500">Try searching for a different name or symbol</div>
									</div>
						{/if}
					</div>
				{/if}
			</div>

			<Section>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Discover</h2>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
					<ListCard title="Biggest Movers" items={biggestMovers.map((s) => ({ name: s.name, symbol: s.symbol, href: `/trade/${s.id}` }))} />
					<ListCard title="Biggest Volume" items={biggestVolume.map((s) => ({ name: s.name, symbol: s.symbol, href: `/trade/${s.id}` }))} />
					<ListCard title="Most Recently Added" items={recentlyAdded.map((s) => ({ name: s.name, symbol: s.symbol, href: `/trade/${s.id}` }))} />
				</div>
			</Section>

			<!-- Stock Table Section -->
			<Section>
				<div class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">All Stocks</h2>
					<div class="flex gap-2">
						<div class="flex gap-1 rounded-lg bg-white/5 p-1">
							{#each ['All', 'ST0x', 'ETFs'] as filter}
								<button
									on:click={() => (activeFilter = filter)}
									class="rounded-md px-3 py-1.5 text-xs font-medium transition-all {activeFilter === filter ? 'bg-yellow-500/20 text-yellow-500' : 'text-gray-400 hover:text-white'}"
								>
									{filter}
								</button>
							{/each}
						</div>
						<div class="flex gap-1 rounded-lg bg-white/5 p-1">
							<button
								on:click={() => (viewMode = 'grid')}
								class="rounded-md px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'grid' ? 'bg-yellow-500/20 text-yellow-500' : 'text-gray-400 hover:text-white'}"
							>
								Grid
							</button>
							<button
								on:click={() => (viewMode = 'table')}
								class="rounded-md px-3 py-1.5 text-xs font-medium transition-all {viewMode === 'table' ? 'bg-yellow-500/20 text-yellow-500' : 'text-gray-400 hover:text-white'}"
							>
								Table
							</button>
						</div>
					</div>
				</div>
				
				{#if viewMode === 'table'}
					<!-- Table View -->
					<div class="overflow-x-auto rounded-lg border border-white/10 bg-gray-800/50">
						<table class="w-full">
							<thead>
								<tr class="border-b border-white/10">
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Token</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Price</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">Market Cap</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">Supply</th>
									<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">Holders</th>
									<th class="px-4 py-3 text-center text-xs font-medium text-gray-400">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredData as token (token.id)}
									<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
										<td class="px-4 py-3">
											<div class="flex items-center gap-3">
												<img
													src={ALL_TOKENS.find((s) => s.address.toLowerCase() === token.address.toLowerCase())?.logoUrl}
													alt={token.symbol}
													class="h-8 w-8 rounded-full bg-gray-700"
												/>
												<div>
													<div class="font-medium text-sm">{token.symbol}</div>
													<div class="text-xs text-gray-400">{token.name}</div>
												</div>
											</div>
										</td>
										<td class="px-4 py-3 font-medium">${parseFloat(token.price.toString()).toFixed(2)}</td>
										<td class="px-4 py-3 hidden sm:table-cell">${token.marketCap}</td>
										<td class="px-4 py-3 hidden lg:table-cell">{token.totalSupply}</td>
										<td class="px-4 py-3 hidden lg:table-cell">{token.totalHolders}</td>
										<td class="px-4 py-3">
											<div class="flex justify-center gap-2">
												<button
													on:click={() => goto(`/trade/${token.id}`)}
													class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105"
												>
													Trade
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<!-- Grid View -->
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each filteredData as token (token.id)}
							<div
								class="group cursor-pointer rounded-xl border border-white/5 bg-gray-800/50 p-4 transition-all hover:border-yellow-500/30"
								on:click={() => goto(`/trade/${token.id}`)}
								role="button"
								tabindex="0"
								on:keydown={(e) => e.key === 'Enter' && goto(`/trade/${token.id}`)}
							>
								<div class="mb-3 flex items-start justify-between">
									<div class="flex items-center gap-3">
										<img
											src={ALL_TOKENS.find((s) => s.address.toLowerCase() === token.address.toLowerCase())?.logoUrl}
											alt={token.symbol}
											class="h-10 w-10 rounded-full bg-gray-700"
										/>
										<div>
											<div class="font-semibold">{token.symbol}</div>
											<div class="text-xs text-gray-400">{truncateId(token.address)}</div>
										</div>
									</div>
								</div>
								<div class="mb-3 text-2xl font-bold">${parseFloat(token.price.toString()).toFixed(2)}</div>
								<div class="space-y-1 text-xs">
									<div class="flex justify-between">
										<span class="text-gray-400">Market Cap</span>
										<span>${token.marketCap}</span>
									</div>
									<div class="flex justify-between">
										<span class="text-gray-400">Holders</span>
										<span>{token.totalHolders}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</Section>
		</div>

		<Footer />
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
			<p class="text-gray-500">No SFTs available on {$currentNetwork?.displayName || 'this network'}.</p>
		</div>
	</div>
{/if}
