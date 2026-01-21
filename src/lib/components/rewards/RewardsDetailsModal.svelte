<script lang="ts">
	import {
		rewardsData,
		globalRewardsData,
		showDetailsModal,
		showLeaderboardModal,
		formatPoints,
		formatUsd,
		formatApy,
		rewardsModalTab,
		type RewardsModalTab
	} from '$lib/stores/rewardsStore';

	function closeModal() {
		showDetailsModal.set(false);
		rewardsModalTab.set('details');
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

	let activeTab: RewardsModalTab = 'details';
	$: activeTab = $rewardsModalTab;

	function setTab(tab: RewardsModalTab) {
		rewardsModalTab.set(tab);
	}

	// Calculate RocketBoost progress percentage (capped at 100%) - from global data
	$: rocketBoostProgress = $globalRewardsData?.rocketBoostProgress ?? 0;

	// Projected progress (capped at 100%) - from global data
	$: projectedProgress = $globalRewardsData?.projection
		? Math.min(100, $globalRewardsData.projection.projectedProgress)
		: 0;

	// Format month display
	function formatMonth(monthStr: string): string {
		const [year, month] = monthStr.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1);
		return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showDetailsModal}
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

			<!-- Tabs -->
			<div class="px-6 pt-4">
				<div class="flex gap-2">
					<button
						class="rounded-lg px-3 py-2 text-sm font-semibold transition {activeTab === 'details'
							? 'bg-yellow-500/20 text-yellow-300'
							: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
						on:click={() => setTab('details')}
					>
						Details
					</button>
					<button
						class="rounded-lg px-3 py-2 text-sm font-semibold transition {activeTab === 'rules'
							? 'bg-yellow-500/20 text-yellow-300'
							: 'text-gray-300 hover:bg-white/5 hover:text-white'}"
						on:click={() => setTab('rules')}
					>
						Rules
					</button>
				</div>
			</div>

			<!-- Content -->
			<div class="max-h-[calc(90vh-140px)] overflow-y-auto px-6 pb-6">
				{#if activeTab === 'details'}
					{#if $rewardsData && $globalRewardsData}
						<div class="space-y-6 pt-2">
							<!-- Current Month Stats -->
							<div class="rounded-lg bg-gray-700/50 p-4">
								<h3 class="mb-3 text-sm font-medium text-gray-300">
									{formatMonth($globalRewardsData.currentMonth)}
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
											<span class="text-sm text-gray-400">/ {$globalRewardsData.totalWallets}</span>
										</p>
									</div>
									<div>
										<p class="text-xs text-gray-400">Pool Size</p>
										<p class="text-lg font-semibold text-white">
											{formatUsd($globalRewardsData.effectivePool)}
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
										{formatPoints($globalRewardsData.totalPoints)} / {formatPoints(
											$globalRewardsData.rocketBoostTargetPoints
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
											class="relative h-full transition-all duration-500 {$globalRewardsData
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
									{#if $globalRewardsData.projection}
										<div class="flex items-center gap-2">
											<span
												class="inline-block h-2 w-2 rounded-full bg-yellow-500/30 ring-1 ring-yellow-300/50"
											></span>
											<span class="text-gray-400">
												Projected: <span class="font-medium text-yellow-300"
													>{projectedProgress.toFixed(0)}%</span
												>
											</span>
										</div>
									{/if}
								</div>

								<!-- Tier bonuses -->
								<div class="grid grid-cols-4 gap-1 text-center text-xs">
									{#each [{ pct: 25, achieved: $globalRewardsData.rocketBoostTiersAchieved.tier25, projected: projectedProgress >= 25, amount: $globalRewardsData.rocketBoostAmounts.tier25 }, { pct: 50, achieved: $globalRewardsData.rocketBoostTiersAchieved.tier50, projected: projectedProgress >= 50, amount: $globalRewardsData.rocketBoostAmounts.tier50 }, { pct: 75, achieved: $globalRewardsData.rocketBoostTiersAchieved.tier75, projected: projectedProgress >= 75, amount: $globalRewardsData.rocketBoostAmounts.tier75 }, { pct: 100, achieved: $globalRewardsData.rocketBoostTiersAchieved.tier100, projected: projectedProgress >= 100, amount: $globalRewardsData.rocketBoostAmounts.tier100 }] as { pct, achieved, projected, amount } (pct)}
										<div
											class="rounded p-1 {achieved
												? 'bg-green-900/30'
												: projected
													? 'bg-yellow-900/20'
													: 'bg-gray-700/50'}"
										>
											<div
												class="font-medium {achieved
													? 'text-green-400'
													: projected
														? 'text-yellow-300/70'
														: 'text-gray-500'}"
											>
												{pct}%
											</div>
											<div
												class={achieved
													? 'text-green-300'
													: projected
														? 'text-yellow-300/50'
														: 'text-gray-500'}
											>
												+${Math.round(amount)}
											</div>
										</div>
									{/each}
								</div>

								<!-- Total bonus -->
								<div class="mt-3 flex items-center justify-between text-xs">
									<span class="text-gray-400">
										Total Bonus: <span class="font-medium text-green-400"
											>+${Math.round($globalRewardsData.rocketBoostAchievedAmount)}</span
										>
									</span>
									{#if $globalRewardsData.projection}
										<span class="text-gray-500">
											{$globalRewardsData.projection.daysRemaining} days remaining
										</span>
									{/if}
								</div>
							</div>

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
					{:else}
						<div class="pt-4 text-sm text-gray-300">
							Connect your wallet to view rewards details.
						</div>
					{/if}
				{:else}
					<div class="space-y-6 pt-2 text-sm leading-relaxed text-gray-300">
						<div>
							<h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-yellow-400">
								About
							</h3>
							<p>
								Boost Rewards is St0x's on-chain incentive programme that gives you extra yield
								simply for keeping capital invested in tStocks across the St0x ecosystem. Each
								month, your portfolio earns a share of a reward pool on top of any price performance
								or dividends from the underlying equities.
							</p>
						</div>

						<div>
							<h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-yellow-400">
								Rules and Eligibility
							</h3>
							<ol class="space-y-3">
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">1.</span>
									<span>
										All tStocks listed on St0x.io are eligible. You can find tStocks at St0x.io and
										partner venues.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">2.</span>
									<span>
										tStocks must be held in your wallet or in the orderbook contract underpinning
										the venues listed above. As St0x integrates DeFi partners this list may change.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">3.</span>
									<span>
										Balances in Aerodrome pools are based on the number of tokens deposited, not the
										current balance.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">4.</span>
									<span>
										St0x-operated accounts used for market making, protocol-owned liquidity, or
										treasury are ineligible for rewards and do not count towards TVL targets.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">5.</span>
									<span>
										Points accrual begins at 00:00:00 UTC on 1st December 2025 and resets monthly
										until the programme end date, which will be announced in advance.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">6.</span>
									<span>
										Points are awarded every UTC calendar day in proportion to the US$ value of
										holdings at two randomly selected blocks, using the most recent regular market
										hours price as of that block.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">7.</span>
									<span>
										For RocketBoost purposes, we calculate average TVL as the sum of each eligible
										wallet's holdings in US$ for that block, averaged over the calendar month.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">8.</span>
									<span>
										The reward pool will be used to buy tSPLG for distribution. Due to market and
										other factors the nominal value of rewards may vary at time of receipt.
									</span>
								</li>
								<li class="flex gap-3">
									<span class="flex-shrink-0 font-medium text-yellow-400">9.</span>
									<span>
										Rewards below US$0.10 may be rounded down to $0 and not distributed.
									</span>
								</li>
							</ol>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
