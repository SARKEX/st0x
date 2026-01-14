<script lang="ts">
	import {
		showRewardsAnnouncementModal,
		markRewardsAnnouncementSeen
	} from '$lib/stores/rewardsStore';
	import { addTokenToWallet } from '$lib/utils/walletUtils';

	const TSPLG_TOKEN = {
		address: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
		symbol: 'tSPLG',
		decimals: 18
	};

	const APY = '78.5';
	const TRANSACTION_HASH: string = ''; // Leave empty for now, can be filled in later

	let addingToWallet = false;
	let addedToWallet = false;

	function handleClose() {
		markRewardsAnnouncementSeen();
	}

	async function handleAddToWallet() {
		addingToWallet = true;
		try {
			const success = await addTokenToWallet({
				address: TSPLG_TOKEN.address,
				symbol: TSPLG_TOKEN.symbol,
				decimals: TSPLG_TOKEN.decimals
			});
			if (success) {
				addedToWallet = true;
			}
		} finally {
			addingToWallet = false;
		}
	}

	function copyAddress() {
		navigator.clipboard.writeText(TSPLG_TOKEN.address);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showRewardsAnnouncementModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
		on:click={handleClose}
		on:keydown={(e) => e.key === 'Enter' && handleClose()}
		role="button"
		tabindex="0"
		aria-label="Close modal"
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
			<div class="flex items-center justify-between border-b border-gray-700 px-5 py-3">
				<h2 id="modal-title" class="text-base font-semibold text-white">Month 1 Rewards Distributed</h2>
				<button
					on:click={handleClose}
					class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
					aria-label="Close modal"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="celebration-container relative overflow-hidden p-5">
				<!-- Animated particles -->
				<div class="particles">
					<span class="particle" style="--x: 10%; --delay: 0s;"></span>
					<span class="particle" style="--x: 20%; --delay: 0.5s;"></span>
					<span class="particle" style="--x: 30%; --delay: 1s;"></span>
					<span class="particle" style="--x: 40%; --delay: 0.3s;"></span>
					<span class="particle" style="--x: 50%; --delay: 0.8s;"></span>
					<span class="particle" style="--x: 60%; --delay: 0.2s;"></span>
					<span class="particle" style="--x: 70%; --delay: 0.7s;"></span>
					<span class="particle" style="--x: 80%; --delay: 1.2s;"></span>
					<span class="particle" style="--x: 90%; --delay: 0.4s;"></span>
				</div>

				<!-- Sparkle decorations -->
				<div class="sparkle sparkle-1">&#10022;</div>
				<div class="sparkle sparkle-2">&#10022;</div>
				<div class="sparkle sparkle-3">&#10022;</div>
				<div class="sparkle sparkle-4">&#10022;</div>

				<div class="relative z-10 space-y-4">
					<!-- Celebration text -->
					<div class="text-center">
						<div class="mb-2 text-4xl animate-bounce-slow">&#127881;</div>
						<p class="text-lg font-bold text-white drop-shadow-glow">Congratulations!</p>
						<p class="text-sm text-gray-400">Month 1 rewards have been distributed</p>
						<div class="mt-3 inline-flex items-center gap-2">
							<span class="text-sm text-gray-400">Approx APY</span>
							<span class="apy-value text-2xl font-black text-green-400">{APY}%</span>
						</div>
					</div>

					<!-- Token info inline -->
					<div class="flex items-center justify-between text-sm">
						<span class="text-gray-400">Reward Token</span>
						<div class="flex items-center gap-2">
							<span class="font-medium text-white">{TSPLG_TOKEN.symbol}</span>
							<code class="rounded bg-gray-900/50 px-2 py-1 text-[10px] text-gray-400">
								{TSPLG_TOKEN.address.slice(0, 6)}...{TSPLG_TOKEN.address.slice(-4)}
							</code>
							<button
								type="button"
								class="text-gray-500 transition-colors hover:text-white"
								on:click={copyAddress}
								title="Copy address"
								aria-label="Copy contract address"
							>
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
								</svg>
							</button>
						</div>
					</div>

					<!-- Transaction hash inline -->
					{#if TRANSACTION_HASH}
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-400">Transaction</span>
							<a
								href="https://basescan.org/tx/{TRANSACTION_HASH}"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-1 text-blue-400 hover:text-blue-300"
							>
								<code class="text-xs">{TRANSACTION_HASH.slice(0, 10)}...{TRANSACTION_HASH.slice(-6)}</code>
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
								</svg>
							</a>
						</div>
					{:else}
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-400">Transaction</span>
							<span class="text-xs text-gray-500 italic">Coming soon</span>
						</div>
					{/if}

					<!-- Buttons -->
					<div class="flex gap-2 pt-2">
						<button
							type="button"
							class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-2 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
							on:click={handleAddToWallet}
							disabled={addingToWallet || addedToWallet}
						>
							{#if addedToWallet}
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								<span>Added</span>
							{:else if addingToWallet}
								<svg class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
								</svg>
								<span>Adding...</span>
							{:else}
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
								</svg>
								<span>Add to Wallet</span>
							{/if}
						</button>
						<button
							type="button"
							class="flex-1 rounded-lg bg-gray-700/50 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-gray-700"
							on:click={handleClose}
						>
							Got it
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Particles rising animation */
	.particles {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.particle {
		position: absolute;
		bottom: -10px;
		left: var(--x);
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		animation: rise 3s ease-in infinite;
		animation-delay: var(--delay);
		opacity: 0;
	}

	.particle:nth-child(odd) {
		background: linear-gradient(135deg, #34d399, #10b981);
		width: 4px;
		height: 4px;
	}

	.particle:nth-child(3n) {
		background: linear-gradient(135deg, #60a5fa, #3b82f6);
		width: 5px;
		height: 5px;
	}

	@keyframes rise {
		0% {
			transform: translateY(0) scale(0);
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		50% {
			opacity: 1;
		}
		100% {
			transform: translateY(-200px) scale(1);
			opacity: 0;
		}
	}

	/* Sparkle animations */
	.sparkle {
		position: absolute;
		color: #fbbf24;
		font-size: 14px;
		animation: sparkle 2s ease-in-out infinite;
		pointer-events: none;
		z-index: 5;
	}

	.sparkle-1 { top: 10%; left: 10%; animation-delay: 0s; }
	.sparkle-2 { top: 15%; right: 15%; animation-delay: 0.5s; }
	.sparkle-3 { bottom: 20%; left: 15%; animation-delay: 1s; }
	.sparkle-4 { bottom: 25%; right: 10%; animation-delay: 0.3s; }

	@keyframes sparkle {
		0%, 100% {
			opacity: 0.3;
			transform: scale(0.8) rotate(0deg);
		}
		50% {
			opacity: 1;
			transform: scale(1.2) rotate(180deg);
		}
	}

	/* Slow bounce for emoji */
	:global(.animate-bounce-slow) {
		animation: bounce-slow 2s ease-in-out infinite;
	}

	@keyframes bounce-slow {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-8px);
		}
	}

	/* Text glow */
	.drop-shadow-glow {
		text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
	}

	/* Green glow for APY badge */
	.shadow-glow-green {
		box-shadow: 0 0 20px rgba(52, 211, 153, 0.3), 0 0 40px rgba(52, 211, 153, 0.1);
	}

	/* APY value pulse */
	.apy-value {
		animation: pulse-glow 2s ease-in-out infinite;
	}

	@keyframes pulse-glow {
		0%, 100% {
			text-shadow: 0 0 10px rgba(52, 211, 153, 0.5);
		}
		50% {
			text-shadow: 0 0 20px rgba(52, 211, 153, 0.8), 0 0 30px rgba(52, 211, 153, 0.4);
		}
	}

	/* Celebration container shimmer */
	.celebration-container::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			45deg,
			transparent 30%,
			rgba(251, 191, 36, 0.1) 50%,
			transparent 70%
		);
		animation: shimmer 3s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}
</style>
