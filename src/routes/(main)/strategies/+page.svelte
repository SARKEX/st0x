<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import FolioStrategy from '$lib/components/orders/FolioStrategy.svelte';
	import ActiveLiquidity from '$lib/components/orders/ActiveLiquidity.svelte';
	import { connected } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { currentNetwork } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	const STRATEGY_TYPES = [
		{ id: 'portfolio', name: 'Portfolio Strategy' },
		{ id: 'market-making', name: 'Market Making' }
	];

	let activeStrategyType = 'portfolio';
	let isNetworkLoading = false;

	function handleStrategyTypeChange(newType: string) {
		activeStrategyType = newType;
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
	<!-- Strategies Content -->
	<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
		<!-- Strategy Type Selector -->
		<div class="mb-4 flex flex-col gap-2 rounded-lg bg-white/5 p-1 sm:mb-6 sm:flex-row sm:gap-0">
			{#each STRATEGY_TYPES as type}
				<button
					on:click={() => handleStrategyTypeChange(type.id)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all sm:py-3 sm:text-sm {activeStrategyType ===
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
					<LoadingSpinner
						variant="inline"
						size="md"
						text="Switching to {$currentNetwork?.displayName || 'network'}..."
					/>
					<p class="text-center text-gray-400">
						Loading strategy interface for {$currentNetwork?.displayName || 'this network'}.
					</p>
				</div>
			{:else if $connected}
				{#if activeStrategyType === 'portfolio'}
					{#key [$currentNetwork?.id]}
						<FolioStrategy />
					{/key}
				{:else if activeStrategyType === 'market-making'}
					{#key [$currentNetwork?.id]}
						<ActiveLiquidity />
					{/key}
				{/if}
			{:else}
				<div class="flex flex-col items-center justify-center gap-4 py-8">
					<WalletConnect />
					<p class="text-center text-gray-400">
						Connect your wallet to use trading strategies on {$currentNetwork?.displayName ||
							'this network'}.
					</p>
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