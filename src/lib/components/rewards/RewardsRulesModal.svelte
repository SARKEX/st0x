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
			class="w-full max-w-md overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="rules-title"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-700 px-6 py-4">
				<h2 id="rules-title" class="text-lg font-semibold text-white">Rewards Rules</h2>
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

			<!-- Content - Placeholder -->
			<div class="p-6">
				<div class="rounded-lg bg-gray-700/30 p-6 text-center">
					<svg
						class="mx-auto h-12 w-12 text-gray-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					<h3 class="mt-4 text-lg font-medium text-white">Coming Soon</h3>
					<p class="mt-2 text-sm text-gray-400">
						Detailed rewards rules and documentation will be added here.
					</p>
				</div>

				<!-- Temporary placeholder content -->
				<div class="mt-6 space-y-4 text-sm text-gray-300">
					<div class="flex items-start gap-3">
						<span class="text-yellow-400">•</span>
						<p>Points are earned based on your token holdings at each snapshot</p>
					</div>
					<div class="flex items-start gap-3">
						<span class="text-yellow-400">•</span>
						<p>100 points are awarded per $1 USD of holdings</p>
					</div>
					<div class="flex items-start gap-3">
						<span class="text-yellow-400">•</span>
						<p>Rewards are distributed proportionally based on your share of total points</p>
					</div>
					<div class="flex items-start gap-3">
						<span class="text-yellow-400">•</span>
						<p>Kicker bonuses are unlocked when TVL targets are met</p>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
