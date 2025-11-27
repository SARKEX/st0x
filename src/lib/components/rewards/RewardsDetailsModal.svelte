<script lang="ts">
	import {
		rewardsData,
		showDetailsModal,
		showLeaderboardModal,
		formatPoints,
		formatUsd
	} from '$lib/stores/rewardsStore';

	function closeModal() {
		showDetailsModal.set(false);
	}

	function openLeaderboard() {
		showDetailsModal.set(false);
		showLeaderboardModal.set(true);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	// Calculate kicker progress percentage (capped at 100%)
	$: kickerProgress = $rewardsData
		? Math.min(
				100,
				($rewardsData.totalPoints / 100 / Math.max(1, $rewardsData.kickerTvlTarget)) * 100
			)
		: 0;

	// Format month display
	function formatMonth(monthStr: string): string {
		const [year, month] = monthStr.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1);
		return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showDetailsModal && $rewardsData}
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
			aria-labelledby="modal-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 px-6 py-4">
				<h2 id="modal-title" class="text-lg font-semibold text-white">Rewards Details</h2>
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
			<div class="space-y-6 p-6">
				<!-- Current Month Stats -->
				<div class="rounded-lg bg-gray-700/50 p-4">
					<h3 class="mb-3 text-sm font-medium text-gray-300">
						{formatMonth($rewardsData.currentMonth)}
					</h3>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<p class="text-xs text-gray-400">Your Points</p>
							<p class="text-xl font-bold text-yellow-400">
								{formatPoints($rewardsData.userPoints)}
							</p>
						</div>
						<div>
							<p class="text-xs text-gray-400">Est. Reward</p>
							<p class="text-xl font-bold text-green-400">
								{formatUsd($rewardsData.estimatedReward)}
							</p>
						</div>
						<div>
							<p class="text-xs text-gray-400">Your Rank</p>
							<p class="text-lg font-semibold text-white">
								{$rewardsData.rank ? `#${$rewardsData.rank}` : '-'}
								<span class="text-sm text-gray-400">/ {$rewardsData.totalWallets}</span>
							</p>
						</div>
						<div>
							<p class="text-xs text-gray-400">Pool Size</p>
							<p class="text-lg font-semibold text-white">
								{formatUsd($rewardsData.effectivePool)}
							</p>
						</div>
					</div>
				</div>

				<!-- Kicker Progress -->
				<div class="rounded-lg bg-gray-700/50 p-4">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-medium text-gray-300">Kicker Progress</h3>
						<span class="text-xs text-gray-400">
							{$rewardsData.kickerHit
								? 'Achieved!'
								: `${formatUsd($rewardsData.kickerTvlTarget)} target`}
						</span>
					</div>
					<div class="mb-2 h-3 overflow-hidden rounded-full bg-gray-600">
						<div
							class="h-full transition-all duration-500 {$rewardsData.kickerHit
								? 'bg-green-500'
								: 'bg-yellow-500'}"
							style="width: {kickerProgress}%"
						/>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="text-gray-400">
							Bonus: +{formatUsd($rewardsData.kickerAmount)}
						</span>
						{#if $rewardsData.kickerHit}
							<span class="flex items-center gap-1 text-green-400">
								<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
										clip-rule="evenodd"
									/>
								</svg>
								Kicker unlocked!
							</span>
						{:else}
							<span class="text-gray-400">{kickerProgress.toFixed(0)}%</span>
						{/if}
					</div>
				</div>

				<!-- Last Month Stats -->
				{#if $rewardsData.lastMonth}
					<div class="rounded-lg bg-gray-700/50 p-4">
						<h3 class="mb-3 text-sm font-medium text-gray-300">
							Last Month ({formatMonth($rewardsData.lastMonth.month)})
						</h3>
						<div class="grid grid-cols-2 gap-4">
							<div>
								<p class="text-xs text-gray-400">Your Points</p>
								<p class="text-lg font-semibold text-white">
									{formatPoints($rewardsData.lastMonth.userPoints)}
								</p>
							</div>
							<div>
								<p class="text-xs text-gray-400">Your Reward</p>
								<p class="text-lg font-semibold text-green-400">
									{formatUsd($rewardsData.lastMonth.reward)}
								</p>
							</div>
						</div>
						{#if $rewardsData.lastMonth.kickerHit}
							<p class="mt-2 text-xs text-green-400">Kicker bonus was included</p>
						{/if}
					</div>
				{/if}

				<!-- View Leaderboard Button -->
				<button
					on:click={openLeaderboard}
					class="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500/20 px-4 py-3 font-medium text-yellow-400 transition-colors hover:bg-yellow-500/30"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
						/>
					</svg>
					View Leaderboard
				</button>
			</div>
		</div>
	</div>
{/if}
