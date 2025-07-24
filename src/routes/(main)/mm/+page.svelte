<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import ActiveLiquidity from '$lib/components/orders/ActiveLiquidity.svelte';
	import Header from '$lib/components/Header.svelte';
	import { connected } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { currentNetwork } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	const ORDER_TYPES = [{ id: 'activeliquidity', name: 'Active Liquidity' }];

	let activeOrderType = 'activeliquidity';
	let isNetworkLoading = false;

	function handleOrderTypeChange(newType: string) {
		activeOrderType = newType;
		window.location.hash = newType;
	}

	// Watch for network changes and show loading state
	$: if ($currentNetwork) {
		isNetworkLoading = true;
		// Small delay to show loading state
		setTimeout(() => {
			isNetworkLoading = false;
		}, 300);
	}
</script>

<!-- Main Content -->
<div>
	<!-- Orders Content -->
	<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
		<!-- Order Type Selector -->
		<div class="mb-4 flex flex-col gap-2 rounded-lg bg-white/5 p-1 sm:mb-6 sm:flex-row sm:gap-0">
			{#each ORDER_TYPES as type}
				<button
					on:click={() => handleOrderTypeChange(type.id)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all sm:py-3 sm:text-sm {activeOrderType ===
					type.id
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					{type.name}
				</button>
			{/each}
		</div>

		<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-3 backdrop-blur-sm sm:p-6">
			{#if isNetworkLoading}
				<div class="flex flex-col items-center justify-center gap-4 py-8">
					<LoadingSpinner variant="inline" size="md" text="Switching to {$currentNetwork?.displayName || 'network'}..." />
					<p class="text-center text-gray-400">Loading market making interface for {$currentNetwork?.displayName || 'this network'}.</p>
				</div>
			{:else if $connected}
				{#key [$currentNetwork?.id]}
					<ActiveLiquidity />
				{/key}
			{:else}
				<div class="flex flex-col items-center justify-center gap-4 py-8">
					<WalletConnect />
					<p class="text-center text-gray-400">Connect your wallet to use market making strategies on {$currentNetwork?.displayName || 'this network'}.</p>
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
