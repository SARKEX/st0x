<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { sfts, tokenGlobalQuote } from '$lib/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { SFT_EXPLORER_URL, STOXs, ETFs, ST0NX } from '$lib/network';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { goto } from '$app/navigation';
	import type { ApiStockQuote } from '$lib/types';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Header from '$lib/components/Header.svelte';

	let viewMode = 'table';
	let activeFilter = 'All';

	$: query = createQuery({
		queryKey: ['getSftsStocks', $sfts?.length, $tokenGlobalQuote?.length],
		enabled: !!($sfts && $sfts.length > 0 && $tokenGlobalQuote && $tokenGlobalQuote.length > 0),
		queryFn: () => {
			const sftVaults: OffchainAssetReceiptVault[] = $sfts;
			const tokens = [];
			for (let sft of sftVaults) {
				const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === sft.symbol?.split('s1')[0]
				);
				const sftPrice = quote?.['Global Quote']?.['05. price'] ?? 0;
				tokens.push({
					id: sft.id,
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
					createdAt: sft.deployTimestamp
				});
			}
			return tokens;
		}
	});

	$: filteredData = ($query.data ?? []).filter((token) => {
		if (activeFilter === 'All') return true;
		if (activeFilter === 'STOXs') {
			return STOXs.some((t) => t.address.toLowerCase() === token.id.toLowerCase());
		}
		if (activeFilter === 'ETFs') {
			return ETFs.some((t) => t.address.toLowerCase() === token.id.toLowerCase());
		}
		if (activeFilter === 'ST0NX') {
			return ST0NX.some((t) => t.address.toLowerCase() === token.id.toLowerCase());
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
		<LoadingSpinner variant="inline" size="md" text="Loading..." />
	</div>
{:else if $query.error}
	<div data-testid="error">
		An error has occurred:
		{$query.error.message}
	</div>
{:else if $query.data}
	<!-- Main Content -->
	<div>
		<!-- Header -->
		<Header title="Tokens" description="Browse all available tokenized assets" />
		<div class="mx-6 mt-4 flex max-w-full justify-center">
			<div
				class="flex w-full max-w-full flex-col items-start rounded-lg border border-white/10 px-4 py-3 shadow"
			>
				<div class="mb-1 text-xl font-bold tracking-wide text-white">Token List</div>
				<div class="text-sm font-medium leading-relaxed text-gray-300">
					Explore all tokenized assets on the platform.
				</div>
			</div>
		</div>

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
							Explore all tokenized assets on the platform
						</p>
					</div>
				</div>

				<!-- Filter Bar -->
				<div
					class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="flex w-full gap-2 rounded-lg bg-white/5 p-1 sm:w-auto">
						{#each ['All', 'STOXs', 'ETFs', 'ST0NX'] as filter}
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
					<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each filteredData as token (token.id)}
							<div
								class="group relative cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all hover:border-yellow-500/30"
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
												src={STOXs.find((s) => s.address.toLowerCase() === token.id.toLowerCase())
													?.logoUrl}
												alt={token.symbol}
												class="h-10 w-10 rounded-full bg-gray-700"
											/>
										</div>
										<div>
											<h3 class="text-base font-semibold sm:text-lg">{token.symbol}</h3>
											<p class="text-xs text-gray-400 sm:text-sm">{token.name}</p>
											<p class="text-xs text-gray-400 sm:text-sm">
												<a
													href={`https://stox.h20.market/token/${token.id}`}
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
						{/each}
					</div>
				{:else}
					<!-- Table View -->
					<div class="overflow-x-auto">
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
										class="px-4 py-4 text-left text-xs font-medium text-gray-400 sm:px-6 sm:text-sm"
										>Status</th
									>
									<th
										class="px-4 py-4 text-left text-xs font-medium text-gray-400 sm:px-6 sm:text-sm"
										>Proof Of Reserves</th
									>
								</tr>
							</thead>
							<tbody>
								{#each filteredData as token (token.id)}
									<tr
										class="cursor-pointer border-b border-white/5 hover:bg-white/5"
										on:click={() => goto(`/tokens/${token.id}`)}
									>
										<td class="px-4 py-4 sm:px-6">
											<div class="flex items-center gap-3">
												<div
													class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold"
												>
													<img
														src={STOXs.find(
															(s) => s.address.toLowerCase() === token.id.toLowerCase()
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
												href={`${SFT_EXPLORER_URL}/token/${token.id}`}
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
											<span
												class="rounded-full bg-green-500/20 px-2 py-1 text-xs font-medium text-green-400"
											>
												Active
											</span>
										</td>
										<td class="px-4 py-4 sm:px-6">
											<a
												href={`${SFT_EXPLORER_URL}/token/${token.id}`}
												target="_blank"
												class="text-xs text-blue-400 hover:text-blue-300 sm:text-sm"
												on:click|stopPropagation
											>
												Proof Of Reserves →
											</a>
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
