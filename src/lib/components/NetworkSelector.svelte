<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import { networks } from '$lib/config/network';
	import { switchChain } from '@wagmi/core';
	import { wagmiConfig, chainId, connected } from 'svelte-wagmi';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import { createQuery } from '@tanstack/svelte-query';
	import {
		fetchAllTokenBalances,
		getBalanceQueryKey,
		BALANCE_QUERY_OPTIONS,
		getNetworkTotalUSD
	} from '$lib/stores/balanceStore';

	let isOpen = false;

	// Dust threshold - hide balances below $1
	const DUST_THRESHOLD = 1.0;

	function getChainLogo(n: (typeof networks)[0]): string {
		if (!n) return '/images/ETH.svg';
		switch (n.chainId) {
			case 8453:
				return '/images/BASE.svg';
			case 42161:
				return '/images/ARB.svg';
			case 10:
				return '/images/OP.svg';
			case 1:
				return '/images/ETH.svg';
			default:
				return '/images/ETH.svg';
		}
	}

	// Use centralized balance store (shared with Dashboard and TokenNetworkSelector)
	$: networkBalancesQuery = createQuery({
		queryKey: getBalanceQueryKey($walletAddress),
		enabled: browser && !!($isAuthenticated && $walletAddress && $wagmiConfig),
		...BALANCE_QUERY_OPTIONS,
		queryFn: async () => {
			if (!$walletAddress || !$wagmiConfig) return [];

			// Fetch all balances once using centralized store
			const tokenBalances = await fetchAllTokenBalances(
				$walletAddress as `0x${string}`,
				$wagmiConfig
			);

			// Calculate totals per network
			return networks.map((network) => ({
				network,
				totalValue: getNetworkTotalUSD(tokenBalances, network.chainId)
			}));
		}
	});

	// Networks with balances > dust threshold, excluding current network
	$: otherNetworksWithBalances = ($networkBalancesQuery?.data ?? [])
		.filter(
			(item) =>
				item?.network?.chainId !== $currentNetwork?.chainId &&
				(item?.totalValue ?? 0) >= DUST_THRESHOLD
		)
		.sort((a, b) => (b?.totalValue ?? 0) - (a?.totalValue ?? 0));

	async function selectNetwork(network: (typeof networks)[0]) {
		$currentNetwork = network;
		isOpen = false;

		// If wallet is connected and on a different network, prompt to switch
		if ($connected && $chainId && $chainId !== network.id) {
			await switchChain(get(wagmiConfig), { chainId: network.id });
		}
	}

	// Auto-trigger network switch when currentNetwork changes from other parts of the app
	$: if ($currentNetwork && $connected && $chainId && $chainId !== $currentNetwork.id) {
		// Small delay to avoid immediate switching during initial load
		setTimeout(async () => {
			await switchChain(get(wagmiConfig), { chainId: $currentNetwork.id });
		}, 100);
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.network-selector')) {
			isOpen = false;
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="network-selector relative z-[10000] inline-block shrink-0">
	<button
		on:click={toggleDropdown}
		class="flex min-h-10 items-center gap-2 rounded-lg bg-transparent px-2 py-1 text-xs font-medium text-white transition-all duration-200 hover:bg-white/5 active:scale-95 sm:px-3 sm:py-2 sm:text-sm"
	>
		<div class="flex items-center gap-2">
			<img
				src={getChainLogo($currentNetwork)}
				alt={$currentNetwork.displayName}
				class="h-4 w-4"
				class:rounded-full={$currentNetwork.chainId !== 8453}
			/>
			<span class="hidden sm:inline">{$currentNetwork.displayName}</span>
		</div>
		<span class="text-xs transition-transform duration-200" class:rotate-180={isOpen}>▼</span>
	</button>

	{#if isOpen}
		<!-- Mobile overlay for better touch interaction -->
		<div
			class="fixed inset-0 z-[9998] bg-black/20 sm:hidden"
			on:click={() => (isOpen = false)}
			on:keydown={(e) => e.key === 'Escape' && (isOpen = false)}
			role="button"
			tabindex="0"
		></div>

		<!-- Dropdown content - responsive positioning -->
		<div
			class="absolute left-0 right-0 top-full z-[9999] mx-2 mt-1 min-w-[240px] rounded-lg border border-white/10 bg-gray-800/95 shadow-lg backdrop-blur-lg sm:left-auto sm:right-0 sm:top-full sm:mx-0 sm:w-auto"
		>
			<div class="p-1">
				<!-- All Networks Section -->
				<div class="mb-1 px-2 py-1 text-xs font-medium text-gray-400">All Networks</div>
				{#each networks as network}
					{@const isCurrentNetwork = $currentNetwork?.chainId === network.chainId}
					{@const balanceInfo = ($networkBalancesQuery?.data ?? []).find(
						(item) => item?.network?.chainId === network.chainId
					)}
					{@const hasBalance = balanceInfo?.totalValue && balanceInfo.totalValue >= DUST_THRESHOLD}
					{#if hasBalance}
						<button
							on:click={() => selectNetwork(network)}
							class="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm text-white transition-colors hover:bg-gray-700/80 active:bg-gray-600/80 {isCurrentNetwork
								? 'bg-yellow-500/20'
								: ''}"
						>
							<div class="flex items-center gap-3">
								<img
									src={getChainLogo(network)}
									alt={network.displayName}
									class="h-5 w-5"
									class:rounded-full={network.chainId !== 8453}
								/>
								<span class="font-medium">{network.displayName}</span>
							</div>
							<span class="text-xs text-green-400">${balanceInfo.totalValue.toFixed(2)}</span>
						</button>
					{/if}
				{/each}

				<!-- Other Networks with Balances Section -->
				{#if otherNetworksWithBalances.length > 0}
					<div class="my-2 border-t border-white/10"></div>
					<div class="mb-1 px-2 py-1 text-xs font-medium text-gray-400">Networks with Balances</div>
					{#each otherNetworksWithBalances as item}
						{#if item?.network && item?.totalValue}
							<button
								on:click={() => selectNetwork(item.network)}
								class="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm text-white transition-colors hover:bg-gray-700/80 active:bg-gray-600/80"
							>
								<div class="flex items-center gap-3">
									<img
										src={getChainLogo(item.network)}
										alt={item.network.displayName}
										class="h-5 w-5"
										class:rounded-full={item.network.chainId !== 8453}
									/>
									<span class="font-medium">{item.network.displayName}</span>
								</div>
								<span class="text-xs font-semibold text-green-400"
									>${item.totalValue.toFixed(2)}</span
								>
							</button>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
