<script lang="ts">
	import {
		showTokenSwapAnnouncementModal,
		markTokenSwapAnnouncementSeen
	} from '$lib/stores/rewardsStore';

	function handleClose() {
		markTokenSwapAnnouncementSeen();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showTokenSwapAnnouncementModal}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
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
			class="announcement-container relative w-full max-w-2xl overflow-hidden rounded-xl border border-blue-500/30 bg-gray-900 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<!-- Subtle progress indicator bar at top -->
			<div class="h-1 w-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500"></div>

			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700/50 px-6 py-4">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
						<svg class="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</div>
					<div>
						<h2 id="modal-title" class="text-lg font-semibold text-white">
							Token Swap & Platform Migration
						</h2>
						<p class="text-sm text-gray-400">Important Platform Update</p>
					</div>
				</div>
				<button
					on:click={handleClose}
					class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
					aria-label="Close modal"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Content -->
			<div class="max-h-[70vh] overflow-y-auto px-6 py-5">
				<div class="space-y-5">
					<!-- Timing highlight -->
					<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
						<div class="flex items-start gap-3">
							<svg class="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							<div>
								<p class="font-medium text-yellow-200">This Friday before East Coast market open</p>
								<p class="mt-1 text-sm text-yellow-200/70">A major step forward in our commitment to providing the most advanced and secure tokenized equity platform.</p>
							</div>
						</div>
					</div>

					<!-- What's Happening -->
					<div>
						<h3 class="mb-3 flex items-center gap-2 font-semibold text-white">
							<svg class="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							What's Happening
						</h3>
						<p class="mb-3 text-sm text-gray-300">We're migrating to:</p>
						<ul class="space-y-2 text-sm">
							<li class="flex items-start gap-2">
								<span class="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400"></span>
								<span class="text-gray-300"><span class="text-white">New upgradeable token contracts</span> (audited for your security)</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400"></span>
								<span class="text-gray-300"><span class="text-white">Enhanced v6 orderbook system</span> (upgrading from v5)</span>
							</li>
							<li class="flex items-start gap-2">
								<span class="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400"></span>
								<span class="text-gray-300"><span class="text-white">Wrapped token functionality</span> for optimized DeFi integration</span>
							</li>
						</ul>
						<p class="mt-3 text-sm text-gray-400">All market-maker liquidity will seamlessly transition, ensuring continued market depth and trading efficiency.</p>
					</div>

					<!-- Why This Upgrade Matters -->
					<div class="rounded-lg bg-gray-800/50 p-4">
						<h3 class="mb-3 flex items-center gap-2 font-semibold text-white">
							<svg class="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							Why This Upgrade Matters
						</h3>
						<div class="space-y-3 text-sm">
							<div>
								<p class="font-medium text-white">Future-Ready Technology</p>
								<p class="text-gray-400">Our new architecture supports future innovations, corporate actions (dividends, splits), and enhanced institutional workflows.</p>
							</div>
							<div>
								<p class="font-medium text-white">Two Token Options</p>
								<ul class="mt-1 space-y-1 text-gray-400">
									<li><span class="text-gray-300">Underlying Token:</span> Direct 1:1 representation of equity</li>
									<li><span class="text-gray-300">Wrapped Token:</span> Recommended for DEX/DeFi, handles corporate actions seamlessly</li>
								</ul>
							</div>
						</div>
					</div>

					<!-- Action Required -->
					<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
						<h3 class="mb-2 flex items-center gap-2 font-semibold text-red-300">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
							</svg>
							Action Required by End of Day Thursday
						</h3>
						<ul class="space-y-1 text-sm text-red-200/90">
							<li class="flex items-center gap-2">
								<svg class="h-4 w-4 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								Close all open orders
							</li>
							<li class="flex items-center gap-2">
								<svg class="h-4 w-4 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								Withdraw any funds remaining in vaults
							</li>
						</ul>
						<p class="mt-2 text-xs text-red-200/70">Complete these actions on the st0x site. While withdrawals remain possible after Friday, the process will be more streamlined if completed beforehand.</p>
					</div>

					<!-- Starting Friday -->
					<div>
						<h3 class="mb-2 flex items-center gap-2 font-semibold text-white">
							<svg class="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							Starting Friday
						</h3>
						<p class="text-sm text-gray-300">Visit the st0x site where you'll be guided through a simple swap process to migrate your tokens to the new contracts.</p>
					</div>

					<!-- Security assurance -->
					<div class="rounded-lg bg-green-500/10 p-4">
						<h3 class="mb-2 flex items-center gap-2 font-semibold text-green-300">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
							</svg>
							Your Assets Remain Secure
						</h3>
						<div class="grid grid-cols-2 gap-2 text-sm">
							<div class="flex items-center gap-2 text-green-200/90">
								<svg class="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								Audited contracts
							</div>
							<div class="flex items-center gap-2 text-green-200/90">
								<svg class="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								1:1 swap ratio
							</div>
							<div class="flex items-center gap-2 text-green-200/90">
								<svg class="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								Full equity backing
							</div>
							<div class="flex items-center gap-2 text-green-200/90">
								<svg class="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								Redemption rights intact
							</div>
						</div>
					</div>

					<!-- Support -->
					<div class="text-center text-sm text-gray-400">
						<p>Questions? Our support team is standing by in Telegram</p>
						<a
							href="https://t.me/ST0xCommunity"
							target="_blank"
							rel="noopener noreferrer"
							class="mt-1 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
						>
							@ST0xCommunity
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
							</svg>
						</a>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-gray-700/50 px-6 py-4">
				<button
					type="button"
					class="w-full rounded-lg bg-blue-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-600"
					on:click={handleClose}
				>
					I Understand
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Subtle glow effect on container */
	.announcement-container {
		box-shadow:
			0 0 0 1px rgba(59, 130, 246, 0.1),
			0 25px 50px -12px rgba(0, 0, 0, 0.5),
			0 0 60px -15px rgba(59, 130, 246, 0.15);
	}
</style>
