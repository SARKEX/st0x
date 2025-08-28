<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { connected, signerAddress } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { currentNetwork, sfts, tokenGlobalQuote } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { getAllTokensByNetwork } from '$lib/network';
	import type { ApiStockQuote } from '$lib/types';
	import { goto } from '$app/navigation';

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let isNetworkLoading = false;
	let portfolioView = 'holdings'; // 'holdings' or 'strategies'

	// Watch for network changes and show loading state
	$: if ($currentNetwork) {
		isNetworkLoading = true;
		// Small delay to show loading state
		setTimeout(() => {
			isNetworkLoading = false;
		}, 300);
	}

	// Query user's token holdings
	$: holdingsQuery = createQuery({
		queryKey: ['userHoldings', $signerAddress, $currentNetwork?.id, $sfts?.length],
		enabled: !!($connected && $signerAddress && $sfts && $currentNetwork),
		queryFn: () => {
			if (!$sfts || !$signerAddress) return [];
			
			const userHoldings = [];
			for (const sft of $sfts) {
				const userHolder = sft.tokenHolders.find(
					holder => holder.address.toLowerCase() === $signerAddress.toLowerCase()
				);
				
				if (userHolder && BigInt(userHolder.balance) > 0n) {
					const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
						(q) => q?.['Global Quote']?.['01. symbol'] === sft.symbol?.split('s1')[0]
					);
					const price = parseFloat(quote?.['Global Quote']?.['05. price'] || '0');
					const priceChange = parseFloat(quote?.['Global Quote']?.['09. change'] || '0');
					const priceChangePercent = parseFloat(quote?.['Global Quote']?.['10. change percent']?.replace('%', '') || '0');
					
					const balance = formatUnits(BigInt(userHolder.balance), 18);
					const value = parseFloat(balance) * price;
					
					userHoldings.push({
						id: sft.id,
						address: sft.address,
						name: sft.name,
						symbol: sft.symbol,
						balance: balance,
						price: price,
						value: value,
						priceChange: priceChange,
						priceChangePercent: priceChangePercent,
						change24h: priceChangePercent, // Using daily change as 24h placeholder
						change7d: 0, // Would need historical data
						change1h: 0 // Would need more granular data
					});
				}
			}
			
			return userHoldings;
		}
	});

	$: totalValue = ($holdingsQuery.data || []).reduce((sum, holding) => sum + holding.value, 0);
	$: totalChange24h = ($holdingsQuery.data || []).reduce((sum, holding) => {
		const changeAmount = holding.value * (holding.priceChangePercent / 100);
		return sum + changeAmount;
	}, 0);

	function truncateAddress(address: string) {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
</script>

<!-- Main Content -->
<div>
	<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
		{#if isNetworkLoading}
			<div class="flex flex-col items-center justify-center gap-4 py-8">
				<LoadingSpinner
					variant="inline"
					size="md"
					text="Switching to {$currentNetwork?.displayName || 'network'}..."
				/>
			</div>
		{:else if !$connected}
			<Section>
				<div class="flex flex-col items-center justify-center gap-4 py-12">
					<h2 class="text-xl font-semibold">Connect Your Wallet</h2>
					<p class="text-center text-gray-400">
						Connect your wallet to view your portfolio on {$currentNetwork?.displayName || 'this network'}.
					</p>
					<WalletConnect />
				</div>
			</Section>
		{:else}
			<!-- Portfolio Overview -->
			<Section>
				<div class="mb-6">
					<h1 class="text-2xl font-bold">Your Portfolio</h1>
					<p class="text-gray-400">{truncateAddress($signerAddress || '')}</p>
				</div>
				
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Total Value</div>
						<div class="text-2xl font-bold">${totalValue.toFixed(2)}</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">24h Change</div>
						<div class="text-2xl font-bold {totalChange24h >= 0 ? 'text-green-500' : 'text-red-500'}">
							{totalChange24h >= 0 ? '+' : ''}{totalChange24h.toFixed(2)}
						</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Holdings</div>
						<div class="text-2xl font-bold">{$holdingsQuery.data?.length || 0}</div>
					</div>
				</div>
			</Section>

			<!-- View Selector -->
			<div class="flex gap-2 rounded-lg bg-white/5 p-1">
				<button
					on:click={() => (portfolioView = 'holdings')}
					class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all {portfolioView === 'holdings'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					Individual Holdings
				</button>
				<button
					on:click={() => (portfolioView = 'strategies')}
					class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all {portfolioView === 'strategies'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					Strategy Holdings
				</button>
			</div>

			<!-- Holdings Table -->
			{#if portfolioView === 'holdings'}
				<Section>
					<h2 class="mb-4 text-lg font-semibold">Your Holdings</h2>
					{#if $holdingsQuery.isLoading}
						<LoadingSpinner variant="inline" size="md" text="Loading holdings..." />
					{:else if $holdingsQuery.data && $holdingsQuery.data.length > 0}
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead>
									<tr class="border-b border-white/10">
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Token</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Balance</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Price</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Value</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">24h</th>
										<th class="px-4 py-3 text-center text-xs font-medium text-gray-400">Actions</th>
									</tr>
								</thead>
								<tbody>
									{#each $holdingsQuery.data as holding}
										<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
											<td class="px-4 py-3">
												<div class="flex items-center gap-3">
													<img
														src={ALL_TOKENS.find((s) => s.address.toLowerCase() === holding.address.toLowerCase())?.logoUrl}
														alt={holding.symbol}
														class="h-8 w-8 rounded-full bg-gray-700"
													/>
													<div>
														<div class="font-medium">{holding.symbol}</div>
														<div class="text-xs text-gray-400">{holding.name}</div>
													</div>
												</div>
											</td>
											<td class="px-4 py-3">{parseFloat(holding.balance).toFixed(4)}</td>
											<td class="px-4 py-3">${holding.price.toFixed(2)}</td>
											<td class="px-4 py-3 font-medium">${holding.value.toFixed(2)}</td>
											<td class="px-4 py-3 hidden sm:table-cell">
												<span class="{holding.priceChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}">
													{holding.priceChangePercent >= 0 ? '+' : ''}{holding.priceChangePercent.toFixed(2)}%
												</span>
											</td>
											<td class="px-4 py-3">
												<div class="flex justify-center gap-2">
													<button
														on:click={() => goto(`/trade/${holding.id}`)}
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
						<div class="py-12 text-center text-gray-400">
							No holdings found in your wallet.
						</div>
					{/if}
				</Section>
			{:else}
				<Section>
					<h2 class="mb-4 text-lg font-semibold">Strategy Holdings</h2>
					<div class="py-8 text-center text-gray-400">
						Strategy holdings view coming soon. This will show positions held as part of portfolio strategies and market making activities.
					</div>
				</Section>
			{/if}
		{/if}
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
