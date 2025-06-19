<script lang="ts">
	import { USDC_TOKEN } from '$lib/network';
	import { signerAddress, wagmiConfig } from 'svelte-wagmi';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { formatUnits } from 'viem';
	import { readContract } from '@wagmi/core';
	import { erc20Abi } from 'viem';
	import type { Hex } from 'viem';
	import { createQuery } from '@tanstack/svelte-query';
	import { getPrice } from '$lib/getPrice';
	import { Token } from 'sushi/currency';
	import { arbitrum } from '@wagmi/core/chains';

	export let vaults: OffchainAssetReceiptVault[];

	type PortfolioToken = Token & {
		balance: string;
		formattedBalance: string;
		price: string;
		estimatedValue: string;
	};

	$: uniqueTokens = (() => {
		if (!vaults) return [];

		const tokenMap = new Map<string, Token>();

		for (const vault of vaults) {
			const tokenKey = vault.address.toLowerCase();
			if (!tokenMap.has(tokenKey)) {
				tokenMap.set(
					tokenKey,
					new Token({
						chainId: arbitrum.id,
						address: vault.address,
						symbol: vault.symbol,
						decimals: 18,
						name: vault.name
					})
				);
			}
		}

		return Array.from(tokenMap.values());
	})();

	// Query to get balances for all tokens
	$: balancesQuery = createQuery({
		queryKey: ['tokenBalances', uniqueTokens.map((t) => t.address), $signerAddress],
		queryFn: async (): Promise<PortfolioToken[]> => {
			if (!$signerAddress || uniqueTokens.length === 0) return [];

			const balancePromises = uniqueTokens.map(async (token): Promise<PortfolioToken> => {
				try {
					const balance = await readContract($wagmiConfig, {
						abi: erc20Abi,
						address: token.address as `0x${string}`,
						functionName: 'balanceOf',
						args: [$signerAddress as Hex]
					});
					const sftPrice = await getPrice(token, USDC_TOKEN);
					const estimatedValue = formatUnits(balance * BigInt(sftPrice), 18);

					return {
						...token,
						balance: balance.toString(),
						formattedBalance: formatUnits(balance, 18), // Assuming 18 decimals
						price: sftPrice,
						estimatedValue: estimatedValue
					} as PortfolioToken;
				} catch {
					return {
						...token,
						balance: '0',
						formattedBalance: '0',
						price: '0',
						estimatedValue: '0'
					} as PortfolioToken;
				}
			});

			const balances = await Promise.all(balancePromises);
			return balances.filter((token) => BigInt(token.balance) > 0n);
		},
		enabled: !!$signerAddress && uniqueTokens.length > 0
	});
</script>

<div class="space-y-6">
	<h2
		class="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-2xl font-bold text-transparent"
	>
		My Portfolio
	</h2>

	{#if $balancesQuery.isLoading}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-gray-700/30 p-8 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center">
				<div
					class="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-yellow-500"
				></div>
			</div>
			<h3 class="mb-2 text-lg font-semibold text-white">Loading Balances</h3>
			<p class="text-gray-400">Fetching your token balances...</p>
		</div>
	{:else if $balancesQuery.isError}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-gray-700/30 p-8 text-center"
		>
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/20">
				<svg class="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
			</div>
			<h3 class="mb-2 text-lg font-semibold text-white">Error Loading Balances</h3>
			<p class="text-gray-400">Failed to load your token balances. Please try again.</p>
		</div>
	{:else if $balancesQuery.data && $balancesQuery.data.length > 0}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each $balancesQuery.data as token}
				<div
					class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-blue-500/30 hover:bg-gray-700/40"
				>
					<div
						class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
					/>

					<!-- Token Info -->
					<div class="flex items-start gap-4">
						<div
							class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-700/20 text-xl font-bold text-white ring-1 ring-white/10 backdrop-blur-sm"
						>
							{token.symbol?.slice(0, 2) ?? '??'}
						</div>
						<div class="flex-1">
							<h3 class="text-lg font-semibold text-white">
								{token.name ?? 'Unknown Token'}
							</h3>
							<p class="text-sm text-gray-400">{token.symbol ?? '???'}</p>
						</div>
					</div>

					<!-- Balance Info -->
					<div class="mt-4 space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-400">Balance</span>
							<span class="text-lg font-semibold text-white">{token.formattedBalance}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-400">Price</span>
							<span class="text-sm text-gray-300">${token.price}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-400">Estimated Value</span>
							<span class="text-sm font-medium text-green-400">${token.estimatedValue}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-gray-700/30 p-8 text-center"
		>
			<h3 class="mb-2 text-lg font-semibold text-white">No STOXs balances found in your wallet</h3>
		</div>
	{/if}
</div>
