<script lang="ts">
	import { showRulesModal } from '$lib/stores/rewardsStore';

	function closeModal() {
		showRulesModal.set(false);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeModal();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $showRulesModal}
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
			class="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="about-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 px-6 py-4">
				<h2 id="about-title" class="text-lg font-semibold text-white">About Boost Rewards</h2>
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
			<div class="max-h-[calc(90vh-80px)] overflow-y-auto p-6">
				<!-- About Section -->
				<div class="mb-6">
					<h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-yellow-400">About</h3>
					<p class="text-sm leading-relaxed text-gray-300">
						Boost Rewards is St0x's on-chain incentive programme that gives you extra yield simply
						for keeping capital invested in tStocks across the St0x ecosystem. Each month, your
						portfolio earns a share of a reward pool on top of any price performance or dividends
						from the underlying equities.
					</p>
				</div>

				<!-- Rules and Eligibility Section -->
				<div>
					<h3 class="mb-3 text-sm font-semibold uppercase tracking-wide text-yellow-400">
						Rules and Eligibility
					</h3>
					<ol class="space-y-3 text-sm leading-relaxed text-gray-300">
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
								tStocks must be held in your wallet or in the orderbook contract underpinning the
								venues listed above. As St0x integrates DeFi partners this list may change.
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
								St0x-operated accounts used for market making, protocol-owned liquidity, or treasury
								are ineligible for rewards and do not count towards TVL targets.
							</span>
						</li>
						<li class="flex gap-3">
							<span class="flex-shrink-0 font-medium text-yellow-400">5.</span>
							<span>
								Points accrual begins at 00:00:00 UTC on 1st December 2025 and resets monthly until
								the programme end date, which will be announced in advance.
							</span>
						</li>
						<li class="flex gap-3">
							<span class="flex-shrink-0 font-medium text-yellow-400">6.</span>
							<span>
								Points are awarded every UTC calendar day in proportion to the US$ value of holdings
								at two randomly selected blocks, using the most recent regular market hours price as
								of that block.
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
								The reward pool will be used to buy tSPLG for distribution. Due to market and other
								factors the nominal value of rewards may vary at time of receipt.
							</span>
						</li>
						<li class="flex gap-3">
							<span class="flex-shrink-0 font-medium text-yellow-400">9.</span>
							<span> Rewards below US$0.50 will be rounded down to $0 and not distributed. </span>
						</li>
					</ol>
				</div>
			</div>
		</div>
	</div>
{/if}
