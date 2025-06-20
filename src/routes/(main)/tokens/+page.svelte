<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { sfts, tokenGlobalQuote } from '$lib/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { SFT_EXPLORER_URL, STOXs } from '$lib/network';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { goto } from '$app/navigation';
	import type { ApiStockQuote } from '$lib/types';

	let viewMode = 'table';

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
</script>

{#if $query.isLoading || $query.isFetching || $query.isRefetching}
	<div class="flex min-h-[50vh] flex-col items-center justify-center">
		<div
			class="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-indigo-600"
		></div>
		<p class="mt-3 text-lg font-medium text-gray-600">Loading...</p>
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
		<div
			class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<div>
						<h1 class="text-xl font-bold">Tokens</h1>
						<p class="text-sm text-gray-400">Browse all available tokenized assets</p>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<WalletConnect />
				</div>
			</div>
		</div>

		<!-- Token List Content -->
		<div class="space-y-8 p-6">

			<!-- Token List Section -->
			<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-6 backdrop-blur-sm">
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">Available Tokens</h2>
						<p class="text-gray-400">Explore all tokenized assets on the platform</p>
					</div>
				</div>

				<!-- Filter Bar -->
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<div class="flex gap-2 rounded-lg bg-white/5 p-1">
						<button
							on:click={() => (viewMode = 'grid')}
							class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {viewMode === 'grid'
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-400 hover:text-white'}"
						>
							Grid
						</button>
						<button
							on:click={() => (viewMode = 'table')}
							class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {viewMode === 'table'
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-400 hover:text-white'}"
						>
							Table
						</button>
					</div>
				</div>

				{#if viewMode === 'grid'}
					<!-- Grid View -->
					<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each $query.data as token (token.id)}
							<div
								class="group relative cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all hover:border-yellow-500/30"
							>
								<div
									class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
								/>

								<!-- Header with token info and price -->
								<div class="mb-4 flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div
											class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold"
										>
											<img
												src={STOXs.find((s) => s.address.toLowerCase() === token.id.toLowerCase())
													?.logoUrl}
												alt={token.symbol}
												class="h-10 w-10 rounded-full bg-gray-700"
											/>
										</div>
										<div>
											<h3 class="text-lg font-semibold">{token.symbol}</h3>
											<p class="text-sm text-gray-400">
												<button
													on:click={() => {
														goto(`/tokens/${token.id}`);
													}}
													class="text-sm underline hover:text-blue-300"
												>
													{token.name}
												</button>
											</p>
											<p class="text-sm text-gray-400">
												<a
													href={`https://stox.h20.market/token/${token.id}`}
													target="_blank"
													class="text-sm text-blue-400 underline hover:text-blue-300"
												>
													{token.id.slice(0, 6)}...{token.id.slice(-4)}
												</a>
											</p>
										</div>
									</div>

									<div class="text-right">
										<div class="text-lg font-bold">${token.price}</div>
									</div>
								</div>

								<!-- Simple metrics row -->
								<div class="mb-3 flex justify-between text-sm">
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
									class="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-gray-400"
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
						<table class="w-full">
							<thead>
								<tr class="border-b border-white/10">
									<th
										class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									>
										Token
									</th>
									<th
										class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									>
										Address
									</th>
									<th
										class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									>
										Price
									</th>
									<th
										class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									>
										Market Cap
									</th>
									<th
										class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									>
										Supply
									</th>
									<th
										class="cursor-pointer px-6 py-4 text-left font-medium text-gray-400 hover:text-white"
									>
										Holders
									</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Status</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">View on Explorer</th>
									<th class="px-6 py-4 text-left font-medium text-gray-400">Explorer</th>
								</tr>
							</thead>
							<tbody>
								{#each $query.data as token (token.id)}
									<tr class="border-b border-white/5 hover:bg-white/5">
										<td class="px-6 py-4">
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
										<td class="px-6 py-4">
											<a
												href={`${SFT_EXPLORER_URL}/token/${token.id}`}
												target="_blank"
												class="text-sm text-blue-400 underline hover:text-blue-300"
											>
												{token.id.slice(0, 6)}...{token.id.slice(-4)}
											</a>
										</td>
										<td class="px-6 py-4 font-medium text-white">${token.price}</td>
										<td class="px-6 py-4 text-white">{token.marketCap}</td>
										<td class="px-6 py-4 text-white">{token.totalSupply}</td>
										<td class="px-6 py-4 text-white">{token.totalHolders}</td>
										<td class="px-6 py-4">
											<span
												class="rounded-full bg-green-500/20 px-2 py-1 text-xs font-medium text-green-400"
											>
												Active
											</span>
										</td>
										<td class="px-6 py-4">
											<a
												href={`${SFT_EXPLORER_URL}/token/${token.id}`}
												target="_blank"
												class="text-sm text-blue-400 hover:text-blue-300"
											>
												View on Explorer →
											</a>
										</td>
										<td class="px-6 py-4">
											<button
												on:click={() => {
													goto(`/tokens/${token.id}`);
												}}
											>
												View Details →
											</button>
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
