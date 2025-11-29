<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { signerAddress, connected } from 'svelte-wagmi';
	import {
		rewardsData,
		rewardsLoading,
		fetchUserRewards,
		resetRewardsState,
		formatPoints,
		formatApy,
		formatUsd,
		showDetailsModal,
		showRulesModal,
		globalPoolApy,
		fetchGlobalPoolApy
	} from '$lib/stores/rewardsStore';

	let showDropdown = false;
	let dropdownRef: HTMLDivElement;
	let lastFetchedAddress: string | null = null;
	let showTooltip = false;

	// Fetch global pool APY on mount (doesn't require wallet)
	onMount(() => {
		fetchGlobalPoolApy();
		document.addEventListener('click', handleClickOutside);
	});

	// Fetch rewards when wallet connects/changes
	$: if ($connected && $signerAddress && $signerAddress !== lastFetchedAddress) {
		lastFetchedAddress = $signerAddress;
		fetchUserRewards($signerAddress);
	}

	// Reset when wallet disconnects
	$: if (!$connected && lastFetchedAddress) {
		lastFetchedAddress = null;
		resetRewardsState();
	}

	function handleClickOutside(event: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
			showDropdown = false;
		}
	}

	function openDetailsModal() {
		showDropdown = false;
		showDetailsModal.set(true);
	}

	function openRulesModal() {
		showDropdown = false;
		showRulesModal.set(true);
	}

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
	});
</script>

{#if $connected && $signerAddress}
	<div class="relative" bind:this={dropdownRef}>
		<!-- Boost Rewards Button with Rainbow Wave Animation -->
		<button
			on:click={() => (showDropdown = !showDropdown)}
			on:mouseenter={() => (showTooltip = true)}
			on:mouseleave={() => (showTooltip = false)}
			class="rainbow-button group relative flex h-10 items-center gap-2 overflow-hidden rounded-lg px-3 py-2 text-sm transition-all"
		>
			<!-- Animated rainbow border -->
			<span class="rainbow-border"></span>
			<!-- Inner background with gradient -->
			<span
				class="absolute inset-[1px] z-0 rounded-[7px] bg-gradient-to-r from-gray-900 via-purple-950/50 to-gray-900 transition-all group-hover:from-gray-800 group-hover:via-purple-900/50 group-hover:to-gray-800"
			></span>

			<!-- Rocket Icon -->
			<svg
				class="relative z-10 h-4 w-4 text-yellow-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
				/>
			</svg>

			{#if $rewardsLoading}
				<div
					class="relative z-10 h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-yellow-400"
				/>
				<span class="relative z-10 text-gray-400">Loading...</span>
			{:else if $rewardsData}
				<div class="relative z-10 flex items-center gap-2">
					<span class="font-semibold text-white">Boost Rewards</span>
					<span class="text-xs text-gray-400">|</span>
					<span class="text-xs font-medium text-yellow-300">
						{formatPoints($rewardsData.userPoints)} pts
					</span>
					<span class="text-xs font-bold text-green-400">
						{formatApy($globalPoolApy)}
					</span>
				</div>
			{:else}
				<span class="relative z-10 font-semibold text-white">Boost Rewards</span>
				<span class="relative z-10 text-xs text-gray-400">0 pts</span>
				<span class="relative z-10 text-xs text-green-400">{formatApy($globalPoolApy)}</span>
			{/if}

			<svg
				class="relative z-10 h-4 w-4 text-gray-400 transition-transform"
				class:rotate-180={showDropdown}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		<!-- Hover Tooltip -->
		{#if showTooltip && $rewardsData && !showDropdown}
			{@const kickerProgress = $rewardsData.kickerTargetPoints > 0
				? Math.min(100, ($rewardsData.totalPoints / $rewardsData.kickerTargetPoints) * 100)
				: 0}
			<div
				class="absolute right-0 top-full z-[160] mt-2 w-52 rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-xl"
			>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-400">Points</span>
						<span class="font-medium text-white">{formatPoints($rewardsData.userPoints)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Est. Reward</span>
						<span class="font-medium text-green-400">{formatUsd($rewardsData.estimatedReward)}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Rewards APY</span>
						<span class="font-medium text-green-400">{formatApy($globalPoolApy)}</span>
					</div>
					<!-- Kicker Progress Bar -->
					<div class="pt-1">
						<div class="flex items-center justify-between text-xs text-gray-400">
							<span>Kicker</span>
							<span>{kickerProgress.toFixed(0)}%</span>
						</div>
						<div class="relative mt-1 h-1.5 overflow-hidden rounded-full bg-gray-700">
							<div
								class="h-full transition-all {kickerProgress >= 100 ? 'bg-green-500' : 'bg-yellow-500'}"
								style="width: {kickerProgress}%"
							/>
							<!-- Milestone markers -->
							{#each [25, 50, 75] as milestone}
								<div
									class="absolute top-0 h-full w-px bg-gray-600"
									style="left: {milestone}%"
								/>
							{/each}
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Dropdown Menu -->
		{#if showDropdown}
			<div
				class="absolute right-0 top-full z-[150] mt-2 w-56 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
				role="menu"
				tabindex="-1"
			>
				<button
					on:click={openDetailsModal}
					class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-200 transition-colors hover:bg-gray-700"
				>
					<svg
						class="h-4 w-4 text-yellow-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						/>
					</svg>
					Rewards Details
				</button>
				<button
					on:click={openRulesModal}
					class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-200 transition-colors hover:bg-gray-700"
				>
					<svg class="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					About
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Rainbow wave animation for the Boost Rewards button */
	.rainbow-button {
		position: relative;
		background: transparent;
	}

	.rainbow-border {
		position: absolute;
		inset: 0;
		border-radius: 8px;
		padding: 1px;
		background: linear-gradient(
			90deg,
			#ff6b6b,
			#feca57,
			#48dbfb,
			#ff9ff3,
			#54a0ff,
			#5f27cd,
			#ff6b6b
		);
		background-size: 300% 100%;
		animation: rainbow-wave 3s linear infinite;
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	/* Subtle glow effect */
	.rainbow-button::before {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: 10px;
		background: linear-gradient(
			90deg,
			#ff6b6b40,
			#feca5740,
			#48dbfb40,
			#ff9ff340,
			#54a0ff40,
			#5f27cd40,
			#ff6b6b40
		);
		background-size: 300% 100%;
		animation: rainbow-wave 3s linear infinite;
		filter: blur(8px);
		opacity: 0.6;
		z-index: -1;
	}

	.rainbow-button:hover::before {
		opacity: 0.9;
		filter: blur(12px);
	}

	@keyframes rainbow-wave {
		0% {
			background-position: 0% 50%;
		}
		100% {
			background-position: 300% 50%;
		}
	}
</style>
