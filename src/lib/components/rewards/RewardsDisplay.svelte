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
		showDetailsModal,
		showRulesModal
	} from '$lib/stores/rewardsStore';

	let showDropdown = false;
	let dropdownRef: HTMLDivElement;
	let lastFetchedAddress: string | null = null;

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

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
	});
</script>

{#if $connected && $signerAddress}
	<div class="relative" bind:this={dropdownRef}>
		<!-- Boost Rewards Button -->
		<button
			on:click={() => (showDropdown = !showDropdown)}
			class="flex h-10 items-center gap-2 rounded-lg border border-yellow-500/30 bg-gradient-to-r from-yellow-600/20 to-orange-600/20 px-3 py-2 text-sm transition-all hover:border-yellow-500/50 hover:from-yellow-600/30 hover:to-orange-600/30"
		>
			<!-- Rocket Icon -->
			<svg class="h-4 w-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
				/>
			</svg>

			{#if $rewardsLoading}
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-yellow-400"
				/>
				<span class="text-gray-400">Loading...</span>
			{:else if $rewardsData}
				<div class="flex items-center gap-3">
					<span class="font-semibold text-yellow-400">Boost Rewards</span>
					<div class="flex flex-col items-end text-xs">
						<span class="font-medium text-white">
							{formatPoints($rewardsData.userPoints)} pts
						</span>
						{#if $rewardsData.approxApy !== null}
							<span class="text-green-400">
								~{formatApy($rewardsData.approxApy)} APY
							</span>
						{:else}
							<span class="text-gray-400">-</span>
						{/if}
					</div>
				</div>
			{:else}
				<span class="font-semibold text-yellow-400">Boost Rewards</span>
				<span class="text-xs text-gray-400">0 pts</span>
			{/if}

			<svg
				class="h-4 w-4 text-gray-400 transition-transform"
				class:rotate-180={showDropdown}
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

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
