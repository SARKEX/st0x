<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		dynamicNeedsWalletCreation,
		dynamicLoading,
		logoutDynamic
	} from '$lib/stores/dynamicStore';

	// Note: Dynamic.xyz handles wallet creation automatically, so this fallback
	// is mainly for edge cases where the wallet wasn't created during login

	function handleRetry() {
		// Log out and let user try again
		logoutDynamic();
		dynamicNeedsWalletCreation.set(false);
	}

	function handleDismiss() {
		dynamicNeedsWalletCreation.set(false);
	}
</script>

<Modal
	show={$dynamicNeedsWalletCreation}
	title="Wallet Setup Incomplete"
	maxWidthClass="max-w-md"
	onClose={handleDismiss}
>
	<div class="space-y-4">
		<div class="rounded-lg bg-yellow-500/10 p-4">
			<div class="flex gap-3">
				<svg class="h-6 w-6 shrink-0 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<div>
					<h3 class="font-semibold text-yellow-400">Wallet Not Created</h3>
					<p class="mt-1 text-sm text-gray-300">
						Your wallet couldn't be created during sign-in. This can happen if the process was interrupted.
					</p>
				</div>
			</div>
		</div>

		<p class="text-sm text-gray-400">
			Please try signing in again. If the issue persists, contact support.
		</p>

		<div class="flex gap-3">
			<Button on:click={handleDismiss} variant="ghost" fullWidth>
				Dismiss
			</Button>
			<Button on:click={handleRetry} variant="primary" fullWidth disabled={$dynamicLoading}>
				{#if $dynamicLoading}
					<span class="flex items-center gap-2">
						<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
						</svg>
						Please wait...
					</span>
				{:else}
					Try Again
				{/if}
			</Button>
		</div>
	</div>
</Modal>
