<script lang="ts">
	import { signerAddress } from 'svelte-wagmi';
	import {
		rewardsData,
		showLeaderboardModal,
		formatPoints,
		formatAddress
	} from '$lib/stores/rewardsStore';

	function closeModal() {
		showLeaderboardModal.set(false);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}

	// Check if user is in top 3
	$: userInTop3 = $rewardsData?.rank && $rewardsData.rank <= 3;

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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showLeaderboardModal && $rewardsData}
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
			<div class="p-6">
				<!-- Top 3 -->
				<div class="mb-6">
					<h3 class="mb-3 text-sm font-medium text-gray-400">Top 3</h3>
					<div class="space-y-2">
						{#each $rewardsData.leaderboard.top3 as wallet}
							<div
								class="flex items-center justify-between rounded-lg px-4 py-3 {wallet.address ===
								$signerAddress?.toLowerCase()
									? 'border border-yellow-500/50 bg-yellow-500/10'
									: 'bg-gray-700/50'}"
							>
								<div class="flex items-center gap-3">
									<span class="text-xl">{getMedal(wallet.rank)}</span>
									<div>
										<p class="font-mono text-sm text-white">
											{wallet.address === $signerAddress?.toLowerCase()
												? 'You'
												: formatAddress(wallet.address)}
										</p>
										{#if wallet.address === $signerAddress?.toLowerCase()}
											<p class="text-xs text-yellow-400">Your position</p>
										{/if}
									</div>
								</div>
								<span class="font-medium text-yellow-400">{formatPoints(wallet.points)}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- User's Position (if not in top 3) -->
				{#if !userInTop3 && $rewardsData.leaderboard.aroundUser.length > 0}
					<div>
						<h3 class="mb-3 text-sm font-medium text-gray-400">Your Position</h3>
						<div class="space-y-2">
							<!-- Separator indicating gap from top 3 -->
							{#if $rewardsData.leaderboard.aroundUser[0]?.rank > 4}
								<div class="flex items-center justify-center py-2 text-gray-500">
									<span class="text-xs">• • •</span>
								</div>
							{/if}

							{#each $rewardsData.leaderboard.aroundUser as wallet}
								<div
									class="flex items-center justify-between rounded-lg px-4 py-3 {wallet.address ===
									$signerAddress?.toLowerCase()
										? 'border border-yellow-500/50 bg-yellow-500/10'
										: 'bg-gray-700/50'}"
								>
									<div class="flex items-center gap-3">
										<span class="w-8 text-center text-sm font-medium text-gray-400">
											#{wallet.rank}
										</span>
										<div>
											<p class="font-mono text-sm text-white">
												{wallet.address === $signerAddress?.toLowerCase()
													? 'You'
													: formatAddress(wallet.address)}
											</p>
											{#if wallet.address === $signerAddress?.toLowerCase()}
												<p class="text-xs text-yellow-400">Your position</p>
											{/if}
										</div>
									</div>
									<span
										class="font-medium {wallet.address === $signerAddress?.toLowerCase()
											? 'text-yellow-400'
											: 'text-white'}"
									>
										{formatPoints(wallet.points)}
									</span>
								</div>
							{/each}

							<!-- Separator indicating more below -->
							{#if $rewardsData.leaderboard.aroundUser[$rewardsData.leaderboard.aroundUser.length - 1]?.rank < $rewardsData.totalWallets}
								<div class="flex items-center justify-center py-2 text-gray-500">
									<span class="text-xs">• • •</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Stats Summary -->
				<div
					class="mt-6 flex items-center justify-between rounded-lg bg-gray-700/30 px-4 py-3 text-sm"
				>
					<span class="text-gray-400">Total participants</span>
					<span class="font-medium text-white">{$rewardsData.totalWallets}</span>
				</div>
			</div>
		</div>
	</div>
{/if}
