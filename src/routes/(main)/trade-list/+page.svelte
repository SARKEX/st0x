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
	import { getAllTokensByNetwork } from '$lib/network';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import type { ApiStockQuote } from '$lib/types';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import TableHead from '$lib/components/ui/table/TableHead.svelte';
	import TableRow from '$lib/components/ui/table/TableRow.svelte';
	import TableCell from '$lib/components/ui/table/TableCell.svelte';
	import Button from '$lib/components/Button.svelte';

	let st0xVaults: OffchainAssetReceiptVault[] = [];
	
	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let searchTerm = '';
	let filteredSfts: OffchainAssetReceiptVault[] = [];
	let biggestMovers: any[] = [];
	let biggestVolume: any[] = [];
	let recentlyAdded: OffchainAssetReceiptVault[] = [];
	let isSearching = false;
	let currentSearchId: string | null = null;

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

		// Calculate biggest movers based on AlphaVantage daily change percentage
		biggestMovers = [...st0xVaults]
			.map(sft => {
				const symbol = sft.symbol?.split('s1')[0];
				// Find the quote in the array by matching symbol
				const quoteData = ($tokenGlobalQuote as ApiStockQuote[]).find(
					q => q?.['Global Quote']?.['01. symbol'] === symbol
				);
				const globalQuote = quoteData?.['Global Quote'];
				const changePercent = globalQuote?.['10. change percent'] ? 
					parseFloat(globalQuote['10. change percent'].replace('%', '')) : 0;
				return { ...sft, changePercent };
			})
			.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
			.slice(0, 5);

		// Calculate biggest volume based on on-chain transfers and deposits/withdrawals
		biggestVolume = [...st0xVaults]
			.map(sft => {
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

</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner variant="fullscreen" size="lg" text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..." />
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
					<ListCard 
						title="Biggest Movers (24H)" 
						items={biggestMovers.map((s) => {
							const symbol = s.symbol?.split('s1')[0];
							const quoteData = $tokenGlobalQuote.find(
								q => q?.['Global Quote']?.['01. symbol'] === symbol
							);
							const price = quoteData?.['Global Quote']?.['05. price'];
							const tokenInfo = ALL_TOKENS.find((t) => t.address.toLowerCase() === s.address.toLowerCase());
							return { 
								name: s.name, 
								symbol: s.symbol, 
								href: `/trade/${s.id}`,
								logoUrl: tokenInfo?.logoUrl,
								price: price ? parseFloat(price).toFixed(2) : 'N/A',
								metadata: s.changePercent ? `${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}%` : 'N/A',
								metadataClass: s.changePercent > 0 ? 'text-green-400' : s.changePercent < 0 ? 'text-red-400' : 'text-gray-400',
								showTradeButton: true
							};
						})} 
					/>
					<ListCard 
						title="Biggest Volume" 
						items={biggestVolume.map((s) => {
							const tokenInfo = ALL_TOKENS.find((t) => t.address.toLowerCase() === s.address.toLowerCase());
							const volumeInShares = parseFloat(formatUnits(s.totalVolume, 18));
							const symbol = s.symbol?.split('s1')[0];
							const quoteData = $tokenGlobalQuote.find(
								q => q?.['Global Quote']?.['01. symbol'] === symbol
							);
							const price = quoteData?.['Global Quote']?.['05. price'] ? 
								parseFloat(quoteData['Global Quote']['05. price']) : 0;
							const dollarVolume = volumeInShares * price;
							
							const volumeStr = dollarVolume >= 1000000 ? 
								`$${(dollarVolume / 1000000).toFixed(2)}M` : 
								dollarVolume >= 1000 ? 
								`$${(dollarVolume / 1000).toFixed(1)}K` : 
								`$${dollarVolume.toFixed(2)}`;
							
							return { 
								name: s.name, 
								symbol: s.symbol, 
								href: `/trade/${s.id}`,
								logoUrl: tokenInfo?.logoUrl,
								metadata: `${s.transferCount} txs\n${volumeStr}`,
								metadataClass: 'text-yellow-400',
								showTradeButton: true
							};
						})} 
					/>
					<ListCard 
						title="Most Recently Added" 
						items={recentlyAdded.map((s) => {
							const timestamp = parseInt(s.deployTimestamp || '0');
							const date = new Date(timestamp * 1000);
							const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
							const tokenInfo = ALL_TOKENS.find((t) => t.address.toLowerCase() === s.address.toLowerCase());
							return { 
								name: s.name, 
								symbol: s.symbol, 
								href: `/trade/${s.id}`,
								logoUrl: tokenInfo?.logoUrl,
								metadata: daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`,
								metadataClass: 'text-blue-400',
								showTradeButton: true
							};
						})} 
					/>
				</div>
			</Section>

			<!-- Stock Table Section -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Browse Stocks</h2>
				</div>
				<div class="overflow-x-auto rounded-lg border border-white/10 bg-gray-800/50">
					<Table>
						<TableHead>
							<TableRow className="border-b border-white/10">
								<TableCell header className="px-4 py-3 text-left text-xs font-medium text-gray-400">Stock</TableCell>
								<TableCell header className="px-4 py-3 text-left text-xs font-medium text-gray-400">Price</TableCell>
								<TableCell header className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">On-Chain Price</TableCell>
								<TableCell header className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden md:table-cell">On-Chain Market Cap</TableCell>
								<TableCell header className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden lg:table-cell">On-Chain Supply</TableCell>
								<TableCell header className="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden xl:table-cell">Holders</TableCell>
								<TableCell header className="px-4 py-3 text-center text-xs font-medium text-gray-400">Trade</TableCell>
							</TableRow>
						</TableHead>
						<tbody>
							{#each $query.data || [] as token (token.id)}
								{@const sft = $sfts.find(s => s.id === token.id)}
								{@const deposits = sft ? sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0)) : BigInt(0)}
								{@const withdraws = sft ? sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0)) : BigInt(0)}
								{@const circulating = deposits - withdraws}
								{@const circulatingSupply = parseFloat(formatUnits(circulating, 18))}
								{@const onChainPrice = parseFloat(token.price.toString())}
								{@const onChainMarketCap = circulatingSupply * onChainPrice}
								<TableRow>
									<TableCell className="px-4 py-3">
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
									</TableCell>
									<TableCell className="px-4 py-3">
										<div class="font-medium">${onChainPrice.toFixed(2)}</div>
									</TableCell>
									<TableCell className="px-4 py-3 hidden sm:table-cell">
										<div class="text-sm text-gray-500">TBD</div>
									</TableCell>
									<TableCell className="px-4 py-3 hidden md:table-cell">
										<div class="text-sm">
											${onChainMarketCap >= 1000000 ? 
												`${(onChainMarketCap / 1000000).toFixed(2)}M` : 
												onChainMarketCap >= 1000 ? 
												`${(onChainMarketCap / 1000).toFixed(1)}K` : 
												onChainMarketCap.toFixed(2)}
										</div>
									</TableCell>
									<TableCell className="px-4 py-3 hidden lg:table-cell">
										<div class="text-sm">
											{circulatingSupply >= 1000 ? 
												`${(circulatingSupply / 1000).toFixed(2)}K` : 
												circulatingSupply.toFixed(2)}
										</div>
									</TableCell>
									<TableCell className="px-4 py-3 hidden xl:table-cell">
										<div class="text-sm">{token.totalHolders}</div>
									</TableCell>
									<TableCell className="px-4 py-3">
										<div class="flex justify-center gap-2">
											<Button size="sm" variant="primary" on:click={() => goto(`/trade/${token.id}`)}>Trade</Button>
										</div>
									</TableCell>
								</TableRow>
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
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
			<p class="text-gray-500">No SFTs available on {$currentNetwork?.displayName || 'this network'}.</p>
		</div>
	</div>
{/if}
