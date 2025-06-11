<script>
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import DcaStrategy from '$lib/components/orders/DcaStrategy.svelte';
	import LimitStrategy from '$lib/components/orders/LimitStrategy.svelte';
	import ActiveLiquidity from '$lib/components/orders/ActiveLiquidity.svelte';
	import FolioStrategy from '$lib/components/orders/FolioStrategy.svelte';

	const ORDER_TYPES = [
		{ id: 'limit', name: 'Limit Orders' },
		{ id: 'dca', name: 'DCA' },
		{ id: 'activeliquidity', name: 'Active Liquidity' },
		{ id: 'portfolio', name: 'Portfolio' }
	];

	let activeOrderType = 'limit';
	

</script>

<!-- Main Content -->
<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Orders</h1>
					<p class="text-sm text-gray-400">Manage your trading strategies</p>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Orders Content -->
	<div class="space-y-8 p-6">
		<!-- Order Type Selector -->
		<div class="mb-6 flex rounded-lg bg-white/5 p-1">
			{#each ORDER_TYPES as type}
				<button
					on:click={() => (activeOrderType = type.id)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all {activeOrderType ===
					type.id
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}"
				>
					{type.name}
				</button>
			{/each}
		</div>

		<div class="rounded-2xl border border-white/10 bg-gray-800/50 p-6 backdrop-blur-sm">
			{#if activeOrderType === 'limit'}
				<LimitStrategy />
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
