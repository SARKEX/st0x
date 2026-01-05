<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import FolioStrategy from '$lib/components/orders/FolioStrategy.svelte';
	import ActiveLiquidity from '$lib/components/orders/ActiveLiquidity.svelte';
	import { currentNetwork } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { isAuthenticated } from '$lib/stores/authStore';
	import { walletRegistered, promptLogin } from '$lib/stores/accessStore';
	import { openAuthModal } from '$lib/stores/dynamicStore';

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
	<PageContainer>
		{#if !$isAuthenticated || !$walletRegistered}
			<!-- Login gate for strategies -->
			<div class="flex min-h-[60vh] items-center justify-center">
				<div class="max-w-md text-center">
					<div
						class="mb-6 inline-flex rounded-full bg-gradient-to-br from-blue-600/20 to-purple-700/20 p-6"
					>
						<svg
							class="h-12 w-12 text-blue-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
							/>
						</svg>
					</div>
					<h2 class="mb-2 text-2xl font-bold">Connect to Access Strategies</h2>
					<p class="mb-6 text-gray-400">
						Connect and register your wallet to access advanced trading strategies including
						portfolio management and market making.
					</p>
					<Button
						on:click={() => (!$isAuthenticated ? openAuthModal() : promptLogin())}
						variant="primary"
						size="lg"
					>
						Connect or Log In
					</Button>
				</div>
			</div>
		{:else}
			<!-- Alpha banner -->
			<div class="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 sm:mb-6">
				<p class="text-sm text-yellow-400">This section is currently a work in progress.</p>
			</div>
			<!-- Strategy Type Selector -->
			<div class="mb-4 flex flex-col gap-2 rounded-lg bg-white/5 p-1 sm:mb-6 sm:flex-row sm:gap-0">
				{#each STRATEGY_TYPES as type}
					<Button
						fullWidth={true}
						variant="ghost"
						size="md"
						className={`gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all sm:py-3 sm:text-sm ${
							activeStrategyType === type.id
								? 'bg-yellow-500/20 text-yellow-500'
								: 'text-gray-400 hover:text-white'
						}`}
						on:click={() => handleStrategyTypeChange(type.id)}
					>
						{type.name}
					</Button>
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
				{:else if activeStrategyType === 'portfolio'}
					{#key [$currentNetwork?.id]}
						<FolioStrategy />
					{/key}
				{:else if activeStrategyType === 'market-making'}
					{#key [$currentNetwork?.id]}
						<ActiveLiquidity />
					{/key}
				{/if}
			</div>
		{/if}
	</PageContainer>

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
