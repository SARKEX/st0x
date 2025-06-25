<script lang="ts">
	import { onMount } from 'svelte';
	import Footer from '$lib/components/Footer.svelte';
	import DcaStrategy from '$lib/components/orders/DcaStrategy.svelte';
	import LimitStrategy from '$lib/components/orders/LimitStrategy.svelte';
	import ActiveLiquidity from '$lib/components/orders/ActiveLiquidity.svelte';
	import FolioStrategy from '$lib/components/orders/FolioStrategy.svelte';
	import { orderTokenStore } from '$lib/stores';
	import type { Token } from 'sushi/currency';
	import Header from '$lib/components/Header.svelte';

	const ORDER_TYPES = [
		{ id: 'limit', name: 'Limit Orders' },
		{ id: 'dca', name: 'DCA' },
		{ id: 'activeliquidity', name: 'Active Liquidity' },
		{ id: 'portfolio', name: 'Portfolio' }
	];

	let activeOrderType = 'limit';
	let inputToken: Token | undefined;
	let outputToken: Token | undefined;

	function handleOrderTypeChange(newType: string) {
		activeOrderType = newType;
		window.location.hash = newType;
	}

	onMount(() => {
		// Check if we have data in the store
		const unsubscribe = orderTokenStore.subscribe((storeData) => {
			if (storeData.inputToken || storeData.outputToken || storeData.orderType) {
				if (storeData.inputToken) inputToken = storeData.inputToken;
				if (storeData.outputToken) outputToken = storeData.outputToken;
				if (storeData.orderType) activeOrderType = storeData.orderType;

				// Clear the store after using the data
				orderTokenStore.set({});
			}
		});

		// Cleanup
		return () => {
			unsubscribe();
		};
	});
</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<Header title="Orders" description="Manage your trading strategies" />

	<!-- Orders Content -->
	<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
		<!-- Order Type Selector -->
		<div class="mb-4 flex flex-col gap-2 rounded-lg bg-white/5 p-1 sm:mb-6 sm:flex-row sm:gap-0">
			{#each ORDER_TYPES as type}
				<button
					on:click={() => handleOrderTypeChange(type.id)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium transition-all {activeOrderType ===
					type.id
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					{type.name}
				</button>
			{/each}
		</div>

		<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-3 sm:p-6 backdrop-blur-sm">
			{#if activeOrderType === 'limit'}
				{#key [inputToken?.address, outputToken?.address]}
					<LimitStrategy passedInputToken={inputToken} passedOutputToken={outputToken} />
				{/key}
			{:else if activeOrderType === 'dca'}
				<DcaStrategy />
			{:else if activeOrderType === 'activeliquidity'}
				<ActiveLiquidity />
			{:else if activeOrderType === 'portfolio'}
				<FolioStrategy />
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
