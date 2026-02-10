<script lang="ts">
	import {
		showTokenSwapAnnouncementModal,
		markTokenSwapAnnouncementSeen
	} from '$lib/stores/rewardsStore';
	import { goto } from '$app/navigation';

	function handleClose() {
		markTokenSwapAnnouncementSeen();
	}

	function handleSwap() {
		markTokenSwapAnnouncementSeen();
		goto('/dashboard#holdings');
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
			class="relative w-full max-w-md overflow-hidden rounded-xl border border-green-500/30 bg-gray-900 shadow-2xl"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<!-- Header bar -->
			<div class="h-1 w-full bg-gradient-to-r from-green-500 via-green-400 to-green-500"></div>

			<!-- Close button -->
			<button
				on:click={handleClose}
				class="absolute right-3 top-4 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
				aria-label="Close modal"
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

			<!-- Content -->
			<div class="px-6 pb-6 pt-6 text-center">
				<div
					class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20"
				>
					<svg class="h-7 w-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>

				<h2 id="modal-title" class="mb-2 text-xl font-semibold text-white">
					Token Migration Complete
				</h2>

				<p class="mb-6 text-sm text-gray-400">
					The token migration has been completed. If you haven't already, remember to swap your old
					tokens to the new wrapped versions on the site.
				</p>

				<div class="flex gap-3">
					<button
						type="button"
						class="flex-1 rounded-lg border border-gray-600 px-4 py-2.5 font-medium text-gray-300 transition-colors hover:bg-gray-800"
						on:click={handleClose}
					>
						Dismiss
					</button>
					<button
						type="button"
						class="flex-1 rounded-lg bg-green-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-600"
						on:click={handleSwap}
					>
						Swap Tokens
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
