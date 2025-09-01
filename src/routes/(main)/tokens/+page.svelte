<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { sfts, tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import { ArrowUpRightFromSquareOutline } from 'flowbite-svelte-icons';
	import { createQuery } from '@tanstack/svelte-query';
	import { getAllTokensByNetwork, getTokensByCategory } from '$lib/network';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { goto } from '$app/navigation';
	import type { ApiStockQuote } from '$lib/types';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let viewMode = 'table';
	let activeFilter = 'All';

	$: query = createQuery({
		queryKey: ['getSftsStocks', $currentNetwork?.id, $sfts?.length, $tokenGlobalQuote?.length],
		enabled: !!($tokenGlobalQuote && $tokenGlobalQuote.length > 0 && $currentNetwork?.chainId),
		queryFn: () => {
			const sftVaults: OffchainAssetReceiptVault[] = $sfts || [];
			const tokens = [];

			// Process SFT vaults (from subgraph)
			for (let sft of sftVaults) {
				const tokenSymbol = sft.symbol?.includes('s1') ? sft.symbol?.split('s1')[0] : sft.symbol?.split('0x')[0]
				const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === tokenSymbol
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

			// Process regular tokens (not in subgraph) - CRYPTO tokens like WBTC, USDC
			const cryptoTokens = getTokensByCategory('CRYPTO').filter(
				(token) => token.chainId === $currentNetwork?.chainId
			);
			for (let token of cryptoTokens) {
				// Check if this token is not already processed as an SFT
				const existingToken = tokens.find(
					(t) => t.address.toLowerCase() === token.address.toLowerCase()
				);
				if (!existingToken) {
					// For crypto tokens, we don't have subgraph data, so we'll use placeholder values
					tokens.push({
						id: token.address, // Use address as ID for regular tokens
						address: token.address,
						name: token.name,
						symbol: token.symbol,
						price: 0, // Will be populated by price data if available
						totalHolders: 'N/A',
						totalSupply: 'N/A',
						marketCap: 'N/A',
						totalTransfers: 'N/A',
						createdAt: '0', // No deploy timestamp for regular tokens
						isSft: false
					});
				}
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
		if (activeFilter === 'ST0NX') {
			return getTokensByCategory('ST0NX')
				.filter((t) => t.chainId === $currentNetwork?.chainId)
				.some((t) => t.address.toLowerCase() === token.address.toLowerCase());
		}
		if (activeFilter === 'CRYPTO') {
			return getTokensByCategory('CRYPTO')
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

{#if $query.isLoading || $query.isFetching || $query.isRefetching}
	<div class="flex flex-col items-center justify-center p-8">
		<LoadingSpinner
			variant="inline"
			size="md"
			text="Loading tokens from {$currentNetwork?.displayName || 'network'}..."
		/>
	</div>
{:else if $query.error}
	<div data-testid="error">
		An error has occurred:
		{$query.error.message}
	</div>
{:else if $query.data}
	<!-- Main Content -->
	<div>
		<!-- Token List Content -->
		<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
			<!-- Token List Section -->
			<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-4 backdrop-blur-sm sm:p-6">
				<div
					class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<h2 class="text-lg font-semibold sm:text-xl">Available Tokens</h2>
						<p class="text-xs text-gray-400 sm:text-sm">
							Explore all tokenized assets on {$currentNetwork?.displayName || 'the platform'}
						</p>
					</div>
				</div>

				<!-- Filter Bar -->
				<div
					class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex w-full gap-2 rounded-lg bg-white/5 p-1 sm:w-auto">
						{#each ['All', 'ST0x', 'ETFs', 'ST0NX', 'CRYPTO'] as filter}
							<button
								on:click={() => (activeFilter = filter)}
								class="rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm {activeFilter ===
								filter
									? 'bg-yellow-500/20 text-yellow-500'
									: 'text-gray-400 hover:text-white'}"
							>
								{filter}
							</button>
						{/each}
					</div>

					<div class="flex w-full gap-2 rounded-lg bg-white/5 p-1 sm:w-auto">
						<button
							on:click={() => (viewMode = 'grid')}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm {viewMode ===
							'grid'
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-400 hover:text-white'}"
						>
							Grid
						</button>
						<button
							on:click={() => (viewMode = 'table')}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-all sm:text-sm {viewMode ===
							'table'
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-400 hover:text-white'}"
						>
							Table
						</button>
					</div>
				</div>

				{#if viewMode === 'grid'}
					<!-- Grid View -->
					<div
						class="grid grid-cols-1 gap-4 transition-all duration-300 ease-in-out sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
					>
						{#each filteredData as token (token.id)}
							{#if token.isSft}
								<div
									class="animate-in fade-in-0 slide-in-from-bottom-2 group relative cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all duration-300 ease-in-out hover:border-yellow-500/30"
									role="link"
									tabindex="0"
									on:click={() => goto(`/tokens/${token.id}`)}
									on:keydown={(e) => e.key === 'Enter' && goto(`/tokens/${token.id}`)}
								>
									<div
										class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
									/>

									<!-- Header with token info and price -->
									<div
										class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
									>
										<div class="flex items-center gap-3">
											<div
												class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold"
											>
												<img
													src={ALL_TOKENS.find(
														(s) => s.address.toLowerCase() === token.address.toLowerCase()
													)?.logoUrl}
													alt={token.symbol}
													class="h-10 w-10 rounded-full bg-gray-700"
												/>
											</div>
											<div>
												<h3 class="text-base font-semibold sm:text-lg">{token.symbol}</h3>
												<p class="text-xs text-gray-400 sm:text-sm">{token.name}</p>
												<p class="text-xs text-gray-400 sm:text-sm">
													<a
														href={`${$currentNetwork.sftExplorer}/token/${token.id}`}
														target="_blank"
														class="text-blue-400 underline hover:text-blue-300"
														on:click|stopPropagation
													>
														{truncateId(token.id)}
													</a>
												</p>
											</div>
										</div>

										<div class="text-right">
											<div class="text-base font-bold sm:text-lg">
												${parseFloat(token.price.toString()).toFixed(2)}
											</div>
										</div>
									</div>

									<!-- Simple metrics row -->
									<div class="mb-3 flex flex-wrap justify-between gap-2 text-xs sm:text-sm">
										<div class="text-center">
											<div class="text-gray-400">Supply</div>
											<div class="font-medium text-white">{token.totalSupply}</div>
										</div>
										<div class="text-center">
											<div class="text-gray-400">Holders</div>
											<div class="font-medium text-white">{token.totalHolders}</div>
										</div>
										<div class="text-center">
											<div class="text-gray-400">Transfers</div>
											<div class="font-medium text-white">{token.totalTransfers}</div>
										</div>
										<div class="text-center">
											<div class="text-gray-400">Market Cap</div>
											<div class="font-medium text-white">${token.marketCap}</div>
										</div>
									</div>

									<!-- Status and last activity -->
									<div
										class="flex flex-col gap-2 border-t border-white/10 pt-3 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between"
									>
										<span
											class="rounded bg-green-500/20 px-2 py-1 text-xs font-medium text-green-400"
										>
											Active
										</span>
										<span>{new Date(Number(token.createdAt) * 1000).toLocaleDateString()}</span>
									</div>
								</div>
							{:else}
								<div
									class="animate-in fade-in-0 slide-in-from-bottom-2 group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all duration-300 ease-in-out hover:border-yellow-500/30"
								>
									<div
										class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
									/>

									<!-- Header with token info and price -->
									<div
										class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
									>
										<div class="flex items-center gap-3">
											<div
												class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold"
											>
												<img
													src={ALL_TOKENS.find(
														(s) => s.address.toLowerCase() === token.address.toLowerCase()
													)?.logoUrl}
													alt={token.symbol}
													class="h-10 w-10 rounded-full bg-gray-700"
												/>
											</div>
											<div>
												<h3 class="text-base font-semibold sm:text-lg">{token.symbol}</h3>
												<p class="text-xs text-gray-400 sm:text-sm">{token.name}</p>
												<p class="text-xs text-gray-400 sm:text-sm">
													<a
														href={`${$currentNetwork.sftExplorer}/token/${token.id}`}
														target="_blank"
														class="text-blue-400 underline hover:text-blue-300"
														on:click|stopPropagation
													>
														{truncateId(token.id)}
													</a>
												</p>
											</div>
										</div>

										<div class="text-right">
											<div class="text-base font-bold sm:text-lg">
												${parseFloat(token.price.toString()).toFixed(2)}
											</div>
										</div>
									</div>

									<!-- Simple metrics row -->
									<div class="mb-3 flex flex-wrap justify-between gap-2 text-xs sm:text-sm">
										<div class="text-center">
											<div class="text-gray-400">Supply</div>
											<div class="font-medium text-white">{token.totalSupply}</div>
										</div>
										<div class="text-center">
											<div class="text-gray-400">Holders</div>
											<div class="font-medium text-white">{token.totalHolders}</div>
										</div>
										<div class="text-center">
											<div class="text-gray-400">Transfers</div>
											<div class="font-medium text-white">{token.totalTransfers}</div>
										</div>
										<div class="text-center">
											<div class="text-gray-400">Market Cap</div>
											<div class="font-medium text-white">{token.marketCap}</div>
										</div>
									</div>

									<!-- Status and last activity -->
									<div
										class="flex flex-col gap-2 border-t border-white/10 pt-3 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between"
									>
										<span
											class="rounded bg-green-500/20 px-2 py-1 text-xs font-medium text-green-400"
										>
											Active
										</span>
										<span>{new Date(Number(token.createdAt) * 1000).toLocaleDateString()}</span>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{:else}
					<!-- Table View -->
					<div class="overflow-x-auto transition-all duration-300 ease-in-out">
						<table class="w-full min-w-[600px]">
							<thead>
								<tr class="border-b border-white/10">
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Token</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Address</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Price</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Market Cap</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Supply</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Holders</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Chart</th
									>
									<th
										class="cursor-pointer px-4 py-4 text-left text-xs font-medium text-gray-400 hover:text-white sm:px-6 sm:text-sm"
										>Trade</th
									>
									<th
										class="px-4 py-4 text-left text-xs font-medium text-gray-400 sm:px-6 sm:text-sm"
										>Proofs</th
									>
								</tr>
							</thead>
							<tbody>
								{#each filteredData as token, index (token.id)}
									<tr
										class="border-b border-white/5 {token.isSft
											? 'cursor-pointer hover:bg-white/5'
											: ''} animate-in fade-in-0 slide-in-from-bottom-2 transition-all duration-300 ease-in-out"
										style="animation-delay: {index * 50}ms"
										on:click={() => token.isSft && goto(`/tokens/${token.id}`)}
									>
										<td class="px-4 py-4 sm:px-6">
											<div class="flex items-center gap-3">
												<div
													class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold"
												>
													<img
														src={ALL_TOKENS.find(
															(s) => s.address.toLowerCase() === token.address.toLowerCase()
														)?.logoUrl}
														alt={token.symbol}
														class="h-10 w-10 rounded-full bg-gray-700"
													/>
												</div>
												<div>
													<div class="font-medium">{token.symbol}</div>
													<div class="text-xs text-gray-400">{token.name}</div>
												</div>
											</div>
										</td>
										<td class="px-4 py-4 sm:px-6">
											<a
												href={`${$currentNetwork.blockExplorer}/token/${token.id}`}
												target="_blank"
												class="text-xs text-blue-400 underline hover:text-blue-300 sm:text-sm"
												on:click|stopPropagation
											>
												{truncateId(token.id)}
											</a>
										</td>
										<td class="px-4 py-4 font-medium text-white sm:px-6">${token.price}</td>
										<td class="px-4 py-4 text-white sm:px-6">{token.marketCap}</td>
										<td class="px-4 py-4 text-white sm:px-6">{token.totalSupply}</td>
										<td class="px-4 py-4 text-white sm:px-6">{token.totalHolders}</td>
										<td class="px-4 py-4 sm:px-6">
											{#if token.isSft}
												<button
													on:click|stopPropagation={() => goto(`/tokens/${token.id}/chart`)}
													class="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 sm:text-sm"
												>
													View
													<ArrowUpRightFromSquareOutline class="h-4 w-4" />
												</button>
											{:else}
												<span class="text-xs text-gray-500 sm:text-sm">N/A</span>
											{/if}
										</td>
										<td class="px-4 py-4 sm:px-6">
											{#if token.isSft}
												<button
													on:click|stopPropagation={() => goto(`/trade`)}
													class="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 sm:text-sm"
												>
													View
													<ArrowUpRightFromSquareOutline class="h-4 w-4" />
												</button>
											{:else}
												<span class="text-xs text-gray-500 sm:text-sm">N/A</span>
											{/if}
										</td>
										<td class="px-4 py-4 sm:px-6">
											{#if token.isSft}
												<button
													on:click|stopPropagation={() => goto(`/tokens/${token.id}/proofs`)}
													class="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 sm:text-sm"
												>
													View
													<ArrowUpRightFromSquareOutline class="h-4 w-4" />
												</button>
											{:else}
												<span class="text-xs text-gray-500 sm:text-sm">N/A</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<Footer />
	</div>

	<style>
		:global(body) {
			margin: 0;
			padding: 0;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
				sans-serif;
		}
	</style>
{/if}
