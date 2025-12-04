<script lang="ts">
	import {
		rewardsData,
		showDetailsModal,
		showLeaderboardModal,
		formatPoints,
		formatUsd,
		formatApy
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

	// Calculate RocketBoost progress percentage (capped at 100%)
	// Progress = accumulated totalPoints / target points (TVL * 2 snapshots/day * days * 100)
	$: rocketBoostProgress = $rewardsData
		? Math.min(
				100,
				($rewardsData.totalPoints / Math.max(1, $rewardsData.rocketBoostTargetPoints)) * 100
			)
		: 0;

	// Projected progress (capped at 100%)
	$: projectedProgress = $rewardsData?.projection
		? Math.min(100, $rewardsData.projection.projectedProgress)
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
							<p class="text-xs text-gray-400">Approx APY</p>
							<p class="text-xl font-bold text-green-400">
								{formatApy($rewardsData.approxApy)}
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
						<div>
							<p class="text-xs text-gray-400">Avg Holdings</p>
							<p class="text-lg font-semibold text-white">
								{formatUsd($rewardsData.averageValue)}
							</p>
						</div>
					</div>
				</div>

				<!-- RocketBoost Progress -->
				<div class="rounded-lg bg-gray-700/50 p-4">
					<div class="mb-2 flex items-center justify-between">
						<h3 class="text-sm font-medium text-gray-300">RocketBoost Progress</h3>
						<span class="text-xs text-gray-400">
							{formatPoints($rewardsData.totalPoints)} / {formatPoints(
								$rewardsData.rocketBoostTargetPoints
							)}
						</span>
					</div>

					<!-- Progress bar with milestone markers -->
					<div class="relative mb-4">
						<div class="h-3 overflow-hidden rounded-full bg-gray-600">
							<!-- Projected progress (background, lighter) -->
							{#if projectedProgress > rocketBoostProgress}
								<div
									class="absolute h-full bg-yellow-500/30 transition-all duration-500"
									style="width: {projectedProgress}%"
								/>
							{/if}
							<!-- Current progress (foreground) -->
							<div
								class="relative h-full transition-all duration-500 {$rewardsData
									.rocketBoostTiersAchieved.tier100
									? 'bg-green-500'
									: 'bg-yellow-500'}"
								style="width: {rocketBoostProgress}%"
							/>
						</div>
						<!-- Projected progress marker (dashed line) -->
						{#if projectedProgress > rocketBoostProgress && projectedProgress < 100}
							<div
								class="absolute top-0 h-3 w-0.5 border-l-2 border-dashed border-yellow-300/70"
								style="left: {projectedProgress}%"
								title="Projected: {projectedProgress.toFixed(0)}%"
							/>
						{/if}
						<!-- Milestone markers -->
						{#each [25, 50, 75, 100] as milestone}
							<div
								class="absolute top-0 h-3 w-0.5 {rocketBoostProgress >= milestone
									? 'bg-green-400'
									: 'bg-gray-500'}"
								style="left: {milestone}%"
							/>
						{/each}
					</div>

					<!-- Current vs Projected stats -->
					<div class="mb-3 flex items-center justify-between text-xs">
						<div class="flex items-center gap-2">
							<span class="inline-block h-2 w-2 rounded-full bg-yellow-500"></span>
							<span class="text-gray-400">Current: {rocketBoostProgress.toFixed(0)}%</span>
						</div>
						{#if $rewardsData.projection}
							<div class="flex items-center gap-2">
								<span class="inline-block h-2 w-2 rounded-full bg-yellow-500/30 ring-1 ring-yellow-300/50"></span>
								<span class="text-gray-400">
									Projected: <span class="font-medium text-yellow-300">{projectedProgress.toFixed(0)}%</span>
								</span>
							</div>
						{/if}
					</div>

					<!-- Tier bonuses -->
					<div class="grid grid-cols-4 gap-1 text-center text-xs">
						{#each [{ pct: 25, achieved: $rewardsData.rocketBoostTiersAchieved.tier25, projected: projectedProgress >= 25, amount: $rewardsData.rocketBoostAmounts.tier25 }, { pct: 50, achieved: $rewardsData.rocketBoostTiersAchieved.tier50, projected: projectedProgress >= 50, amount: $rewardsData.rocketBoostAmounts.tier50 }, { pct: 75, achieved: $rewardsData.rocketBoostTiersAchieved.tier75, projected: projectedProgress >= 75, amount: $rewardsData.rocketBoostAmounts.tier75 }, { pct: 100, achieved: $rewardsData.rocketBoostTiersAchieved.tier100, projected: projectedProgress >= 100, amount: $rewardsData.rocketBoostAmounts.tier100 }] as { pct, achieved, projected, amount } (pct)}
							<div class="rounded p-1 {achieved ? 'bg-green-900/30' : projected ? 'bg-yellow-900/20' : 'bg-gray-700/50'}">
								<div class="font-medium {achieved ? 'text-green-400' : projected ? 'text-yellow-300/70' : 'text-gray-500'}">
									{pct}%
								</div>
								<div class={achieved ? 'text-green-300' : projected ? 'text-yellow-300/50' : 'text-gray-500'}>
									+${Math.round(amount)}
								</div>
							</div>
						{/each}
					</div>

					<!-- Total bonus -->
					<div class="mt-3 flex items-center justify-between text-xs">
						<span class="text-gray-400">
							Total Bonus: <span class="font-medium text-green-400"
								>+${Math.round($rewardsData.rocketBoostAchievedAmount)}</span
							>
						</span>
						{#if $rewardsData.projection}
							<span class="text-gray-500">
								{$rewardsData.projection.daysRemaining} days remaining
							</span>
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
						{#if $rewardsData.lastMonth.rocketBoostAchievedAmount > 0}
							<p class="mt-2 text-xs text-green-400">
								Includes {formatUsd($rewardsData.lastMonth.rocketBoostAchievedAmount)} RocketBoost bonus
							</p>
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
