<script lang="ts">
	import { tick } from 'svelte';
	import { walletAddress } from '$lib/stores/authStore';
	import {
		referralLeaderboard,
		referralLeaderboardLoading,
		referralUserPosition,
		referralTotalParticipants,
		showReferralLeaderboardModal,
		fetchReferralLeaderboard,
		referralProfile
	} from '$lib/stores/referralStore';
	import { formatPoints, formatUsd } from '$lib/utils/format';

	let scrollContainer: HTMLDivElement;

	function closeModal() {
		showReferralLeaderboardModal.set(false);
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
				return '1';
			case 2:
				return '2';
			case 3:
				return '3';
			default:
				return '';
		}
	}

	// Scroll to user's position when modal opens
	async function scrollToUser() {
		await tick();
		if (!scrollContainer || !$referralUserPosition) return;

		const userRank = $referralUserPosition.rank;
		const rowHeight = 60; // Approximate height of each row

		// Calculate scroll position to center user with 3 above visible
		const userRowTop = (userRank - 1) * rowHeight;
		const scrollTarget = userRowTop - 3 * rowHeight;

		scrollContainer.scrollTop = Math.max(0, scrollTarget);
	}

	// Fetch leaderboard when modal opens
	$: if ($showReferralLeaderboardModal) {
		fetchReferralLeaderboard($walletAddress || undefined).then(scrollToUser);
	}

	$: hasData = $referralLeaderboard.length > 0;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showReferralLeaderboardModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
		on:click={closeModal}
		on:keydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				closeModal();
			}
		}}
		role="button"
		tabindex="0"
		aria-label="Close modal"
	/>

	<!-- Modal -->
	<div class="fixed inset-0 z-[201] flex items-center justify-center p-4">
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-surface-1 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="leaderboard-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-line-strong px-6 py-4">
				<h2 id="leaderboard-title" class="text-lg font-semibold text-text">Referral Leaderboard</h2>
				<button
					on:click={closeModal}
					class="rounded-lg p-1 text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
					aria-label="Close"
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
				{#if $referralLeaderboardLoading}
					<div class="flex items-center justify-center py-12">
						<div
							class="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent"
						></div>
					</div>
				{:else if hasData}
					<!-- Table Header -->
					<div class="mb-2 grid grid-cols-12 gap-2 px-4 text-xs font-medium text-text-2">
						<div class="col-span-1">#</div>
						<div class="col-span-4">Nickname</div>
						<div class="col-span-2 text-right">Refs</div>
						<div class="col-span-3 text-right">Points</div>
						<div class="col-span-2 text-right">Rewards</div>
					</div>

					<!-- Leaderboard with scroll -->
					<div bind:this={scrollContainer} class="max-h-[400px] space-y-2 overflow-y-auto pr-2">
						{#each $referralLeaderboard as entry}
							{@const isUser = $referralUserPosition
								? $referralUserPosition.rank === entry.rank
								: $referralProfile && entry.nickname === $referralProfile.nickname}
							<div
								class="grid grid-cols-12 items-center gap-2 rounded-lg px-4 py-3 {isUser
									? 'border border-accent-line bg-accent-soft'
									: 'bg-surface-2/50'}"
							>
								<!-- Rank -->
								<div class="col-span-1">
									{#if entry.rank <= 3}
										<span
											class="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold
											{entry.rank === 1
												? 'bg-accent text-text'
												: entry.rank === 2
													? 'bg-surface-3 text-text'
													: 'bg-accent text-text'}"
										>
											{getMedal(entry.rank)}
										</span>
									{:else}
										<span class="text-sm text-text-2">#{entry.rank}</span>
									{/if}
								</div>

								<!-- Nickname -->
								<div class="col-span-4">
									<p class="truncate text-sm font-medium {isUser ? 'text-accent' : 'text-text'}">
										{entry.nickname}
									</p>
									{#if isUser}
										<p class="text-xs text-accent">You</p>
									{/if}
								</div>

								<!-- Wallets Referred -->
								<div class="col-span-2 text-right">
									<span class="text-sm text-text-2">{entry.walletsReferred}</span>
								</div>

								<!-- Points -->
								<div class="col-span-3 text-right">
									<span
										class="text-sm font-medium {isUser
											? 'text-accent'
											: entry.rank <= 3
												? 'text-accent'
												: 'text-text'}"
									>
										{formatPoints(entry.totalPoints)}
									</span>
								</div>

								<!-- Projected Rewards -->
								<div class="col-span-2 text-right">
									<span class="text-sm text-up">
										{formatUsd(entry.projectedRewards)}
									</span>
								</div>
							</div>
						{/each}
					</div>

					<!-- Stats Summary -->
					<div
						class="mt-4 flex items-center justify-between rounded-lg bg-surface-2/30 px-4 py-3 text-sm"
					>
						<span class="text-text-2">Total participants</span>
						<span class="font-medium text-text">{$referralTotalParticipants}</span>
					</div>
				{:else}
					<div class="py-12 text-center">
						<svg
							class="mx-auto h-12 w-12 text-text-muted"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
							/>
						</svg>
						<p class="mt-4 text-text-2">No referrers yet.</p>
						<p class="text-sm text-text-3">Be the first to join the referral programme!</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
