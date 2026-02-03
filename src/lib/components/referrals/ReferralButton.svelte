<script lang="ts">
	import { isAuthenticated, walletAddress } from '$lib/stores/authStore';
	import {
		referralProfile,
		referralPerformance,
		referralLoading,
		fetchReferralProfile,
		showReferralJoinModal,
		showReferralDashboardModal,
		resetReferralState
	} from '$lib/stores/referralStore';
	import { track } from '$lib/services/analytics';

	let showTooltip = false;

	// Fetch referral profile when wallet connects/changes
	let lastFetchedAddress: string | null = null;

	$: if ($isAuthenticated && $walletAddress && $walletAddress !== lastFetchedAddress) {
		lastFetchedAddress = $walletAddress;
		fetchReferralProfile($walletAddress);
	}

	// Reset when wallet disconnects
	$: if (!$isAuthenticated && lastFetchedAddress) {
		lastFetchedAddress = null;
		resetReferralState();
	}

	function handleClick() {
		if ($referralProfile) {
			track('referral_dashboard_opened', {
				total_points: $referralPerformance?.totalPoints,
				wallets_referred: $referralPerformance?.walletsReferred
			});
			showReferralDashboardModal.set(true);
		} else {
			track('referral_join_modal_opened');
			showReferralJoinModal.set(true);
		}
	}

	function formatPoints(points: number): string {
		if (points >= 1_000_000) {
			return (points / 1_000_000).toFixed(1) + 'M';
		}
		if (points >= 1_000) {
			return (points / 1_000).toFixed(1) + 'K';
		}
		return Math.round(points).toLocaleString();
	}

	function formatUsd(amount: number): string {
		if (amount >= 1000) {
			return '$' + (amount / 1000).toFixed(1) + 'K';
		}
		return '$' + amount.toFixed(2);
	}
</script>

<!-- Only show when authenticated -->
{#if $isAuthenticated && $walletAddress}
	<div class="relative">
		<button
			on:click={handleClick}
			on:mouseenter={() => (showTooltip = true)}
			on:mouseleave={() => (showTooltip = false)}
			on:focus={() => (showTooltip = true)}
			on:blur={() => (showTooltip = false)}
			class="referral-button group relative flex h-10 min-w-[200px] items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-all"
			aria-label={$referralProfile ? 'Open referral dashboard' : 'Join referral programme'}
		>
			<!-- Animated gradient border -->
			<span class="referral-border pointer-events-none"></span>

			<!-- Shimmer effect -->
			<span class="referral-shimmer pointer-events-none"></span>

			<!-- Inner background -->
			<span
				class="pointer-events-none absolute inset-[1px] z-0 rounded-[7px] bg-gradient-to-r from-gray-900 via-purple-950/60 to-gray-900 transition-all group-hover:from-gray-800 group-hover:via-purple-900/70 group-hover:to-gray-800"
			></span>

			<!-- Animated users icon -->
			<div class="relative z-10 flex items-center justify-center">
				<!-- Glow behind icon -->
				<span class="icon-glow absolute"></span>
				<svg
					class="relative h-4 w-4 text-purple-300 transition-all group-hover:scale-110 group-hover:text-purple-200"
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
			</div>

			{#if $referralLoading}
				<div
					class="relative z-10 h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-purple-400"
				></div>
				<span class="relative z-10 text-gray-400">Loading...</span>
			{:else if $referralProfile && $referralPerformance}
				<div class="relative z-10 flex items-center gap-2">
					<span class="font-semibold text-white">Referral</span>
					<span class="text-xs font-medium text-yellow-300">
						{formatPoints($referralPerformance.totalPoints)} pts
					</span>
				</div>
			{:else}
				<!-- Join CTA - more prominent -->
				<div class="relative z-10 flex items-center gap-2">
					<span class="font-semibold text-white">Referral</span>
					<span
						class="join-badge rounded-md bg-purple-500/30 px-2 py-0.5 text-xs font-bold text-purple-200"
					>
						Join Now
					</span>
				</div>
			{/if}
		</button>

		<!-- Hover Tooltip -->
		{#if showTooltip && $referralProfile && $referralPerformance}
			<div
				class="absolute right-0 top-full z-[200] mt-2 w-52 rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-xl"
			>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-400">Wallets Referred</span>
						<span class="font-medium text-white">{$referralPerformance.walletsReferred}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Points</span>
						<span class="font-medium text-yellow-300"
							>{formatPoints($referralPerformance.totalPoints)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Est. Reward</span>
						<span class="font-medium text-green-400"
							>{formatUsd($referralPerformance.projectedRewards)}</span
						>
					</div>
					<div class="border-t border-gray-700 pt-2 text-xs text-gray-500">
						Earn rewards when your friends invest
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.referral-button {
		position: relative;
		background: transparent;
	}

	/* Animated purple/magenta gradient border */
	.referral-border {
		position: absolute;
		inset: 0;
		border-radius: 8px;
		padding: 1px;
		background: linear-gradient(135deg, #a855f7, #ec4899, #8b5cf6, #d946ef, #a855f7);
		background-size: 300% 300%;
		animation: gradient-shift 4s ease infinite;
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
	}

	/* Shimmer effect that sweeps across */
	.referral-shimmer {
		position: absolute;
		inset: 0;
		border-radius: 8px;
		background: linear-gradient(
			110deg,
			transparent 20%,
			rgba(255, 255, 255, 0.1) 40%,
			rgba(255, 255, 255, 0.2) 50%,
			rgba(255, 255, 255, 0.1) 60%,
			transparent 80%
		);
		background-size: 200% 100%;
		animation: shimmer 3s ease-in-out infinite;
		z-index: 1;
	}

	/* Join badge pulse */
	.join-badge {
		animation: badge-pulse 2s ease-in-out infinite;
	}

	/* Glow effect behind icon */
	.icon-glow {
		width: 24px;
		height: 24px;
		background: radial-gradient(circle, rgba(168, 85, 247, 0.6) 0%, transparent 70%);
		animation: pulse-glow 2s ease-in-out infinite;
		border-radius: 50%;
	}

	/* Subtle outer glow */
	.referral-button::before {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: 10px;
		background: linear-gradient(
			135deg,
			rgba(168, 85, 247, 0.3),
			rgba(236, 72, 153, 0.3),
			rgba(139, 92, 246, 0.3)
		);
		background-size: 300% 300%;
		animation: gradient-shift 4s ease infinite;
		filter: blur(8px);
		opacity: 0.5;
		z-index: -1;
	}

	.referral-button:hover::before {
		opacity: 0.8;
		filter: blur(12px);
	}

	.referral-button:hover .icon-glow {
		animation: pulse-glow-intense 1s ease-in-out infinite;
	}

	@keyframes gradient-shift {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@keyframes badge-pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.85;
			transform: scale(1.02);
		}
	}

	@keyframes pulse-glow {
		0%,
		100% {
			opacity: 0.4;
			transform: scale(1);
		}
		50% {
			opacity: 0.7;
			transform: scale(1.2);
		}
	}

	@keyframes pulse-glow-intense {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(1.1);
		}
		50% {
			opacity: 1;
			transform: scale(1.4);
		}
	}

	/* Respect reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		.referral-border,
		.referral-shimmer,
		.join-badge,
		.icon-glow,
		.referral-button::before {
			animation: none;
		}
	}
</style>
