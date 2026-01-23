<script lang="ts">
	import { tick } from 'svelte';
	import { walletAddress } from '$lib/stores/authStore';
	import {
		rewardsData,
		globalRewardsData,
		publicLeaderboardData,
		publicLeaderboardLoading,
		publicLeaderboardError,
		showLeaderboardModal,
		fetchPublicLeaderboard,
		formatPoints,
		formatAddress
	} from '$lib/stores/rewardsStore';

	let scrollContainer: HTMLDivElement;

	function closeModal() {
		showLeaderboardModal.set(false);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	// Get medal for rank
	function getMedal(rank: number): string {
		switch (rank) {
			case 1:
				return '🥇';
			case 2:
				return '🥈';
			case 3:
				return '🥉';
			default:
				return '';
		}
	}

	// Use publicLeaderboardData (fetched from cached /api/rewards/leaderboard)
	$: leaderboardRankings = $publicLeaderboardData?.allRankings ?? [];
	$: totalWallets = $globalRewardsData?.totalWallets ?? $publicLeaderboardData?.totalWallets ?? 0;
	$: hasData = leaderboardRankings.length > 0;

	// Fetch leaderboard when modal opens if not already loaded
	// Check for error state to prevent infinite retry loop on API failure
	$: if (
		$showLeaderboardModal &&
		!$publicLeaderboardData &&
		!$publicLeaderboardLoading &&
		!$publicLeaderboardError
	) {
		fetchPublicLeaderboard();
	}

	// Scroll to user's position when modal opens
	async function scrollToUser() {
		await tick();
		if (!scrollContainer || !$rewardsData?.rank) return;

		const userRank = $rewardsData.rank;
		const rowHeight = 52; // Approximate height of each row

		// Calculate scroll position to center user with 3 above visible
		const userRowTop = (userRank - 1) * rowHeight;
		const scrollTarget = userRowTop - 3 * rowHeight;

		scrollContainer.scrollTop = Math.max(0, scrollTarget);
	}

	// Scroll to user when modal becomes visible
	$: if ($showLeaderboardModal && $rewardsData) {
		scrollToUser();
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showLeaderboardModal && hasData}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
		on:click={closeModal}
		on:keydown={(e) => e.key === 'Enter' && closeModal()}
		role="button"
		tabindex="0"
	/>

	<!-- Modal -->
	<div class="fixed inset-0 z-[201] flex items-center justify-center p-4">
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="leaderboard-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 px-6 py-4">
				<h2 id="leaderboard-title" class="text-lg font-semibold text-white">Leaderboard</h2>
				<button
					on:click={closeModal}
					class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="flex flex-col p-6">
				<!-- Full Leaderboard with scroll -->
				<div bind:this={scrollContainer} class="max-h-[400px] space-y-2 overflow-y-auto pr-2">
					{#each leaderboardRankings as wallet}
						<div
							class="flex items-center justify-between rounded-lg px-4 py-3 {wallet.address ===
							$walletAddress?.toLowerCase()
								? 'border border-yellow-500/50 bg-yellow-500/10'
								: 'bg-gray-700/50'}"
						>
							<div class="flex items-center gap-3">
								{#if wallet.rank <= 3}
									<span class="w-8 text-center text-xl">{getMedal(wallet.rank)}</span>
								{:else}
									<span class="w-8 text-center text-sm font-medium text-gray-400">
										#{wallet.rank}
									</span>
								{/if}
								<div>
									<p class="font-mono text-sm text-white">
										{wallet.address === $walletAddress?.toLowerCase()
											? 'You'
											: formatAddress(wallet.address)}
									</p>
									{#if wallet.address === $walletAddress?.toLowerCase()}
										<p class="text-xs text-yellow-400">Your position</p>
									{/if}
								</div>
							</div>
							<span
								class="font-medium {wallet.address === $walletAddress?.toLowerCase()
									? 'text-yellow-400'
									: wallet.rank <= 3
										? 'text-yellow-400'
										: 'text-white'}"
							>
								{formatPoints(wallet.points)}
							</span>
						</div>
					{/each}
				</div>

				<!-- Stats Summary -->
				<div
					class="mt-4 flex items-center justify-between rounded-lg bg-gray-700/30 px-4 py-3 text-sm"
				>
					<span class="text-gray-400">Total participants</span>
					<span class="font-medium text-white">{totalWallets}</span>
				</div>
			</div>
		</div>
	</div>
{/if}
