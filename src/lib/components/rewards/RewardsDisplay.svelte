<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { signerAddress, connected } from 'svelte-wagmi';
	import {
		rewardsData,
		rewardsLoading,
		fetchUserRewards,
		resetRewardsState,
		formatPoints,
		formatUsd,
		showDetailsModal,
		showRulesModal
	} from '$lib/stores/rewardsStore';
	import RewardsDetailsModal from './RewardsDetailsModal.svelte';
	import RewardsLeaderboardModal from './RewardsLeaderboardModal.svelte';
	import RewardsRulesModal from './RewardsRulesModal.svelte';

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
		<!-- Points Display Button -->
		<button
			on:click={() => (showDropdown = !showDropdown)}
			on:mouseenter={() => (showDropdown = true)}
			class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-2 text-sm transition-colors hover:bg-gray-700"
		>
			{#if $rewardsLoading}
				<div
					class="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-yellow-400"
				/>
				<span class="text-gray-400">Loading...</span>
			{:else if $rewardsData}
				<div class="flex flex-col items-end">
					<span class="font-medium text-yellow-400">
						{formatPoints($rewardsData.userPoints)} pts
					</span>
					<span class="text-xs text-gray-400">
						~{formatUsd($rewardsData.estimatedReward)}
					</span>
				</div>
				<svg
					class="h-4 w-4 text-gray-400 transition-transform"
					class:rotate-180={showDropdown}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			{:else}
				<span class="text-gray-400">0 pts</span>
			{/if}
		</button>

		<!-- Dropdown Menu -->
		{#if showDropdown}
			<div
				class="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
				on:mouseleave={() => (showDropdown = false)}
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

<!-- Modals -->
<RewardsDetailsModal />
<RewardsLeaderboardModal />
<RewardsRulesModal />
