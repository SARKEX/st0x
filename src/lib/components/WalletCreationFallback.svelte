<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		privyNeedsWalletCreation,
		privyLoading,
		privyError,
		createPrivyWallet
	} from '$lib/stores/privyStore';

	function handleCreateWallet() {
		createPrivyWallet();
	}

	function handleDismiss() {
		// User chose to dismiss - they can try again later
		privyNeedsWalletCreation.set(false);
	}
</script>

<Modal
	show={$privyNeedsWalletCreation}
	title="Complete Wallet Setup"
	maxWidthClass="max-w-md"
	onClose={handleDismiss}
>
	<div class="space-y-5">
		<div class="flex justify-center">
			<div class="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20">
				<svg class="h-8 w-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>
		</div>

		<div class="text-center">
			<p class="mb-2 text-gray-300">
				Your account was created, but we couldn't finish setting up your wallet.
			</p>
			<p class="text-sm text-gray-400">
				This can happen if the setup was interrupted. Click below to complete the process.
			</p>
		</div>

		{#if $privyError}
			<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
				<p class="text-sm text-red-400">{$privyError}</p>
			</div>
		{/if}

		<div class="flex gap-3">
			<Button on:click={handleDismiss} variant="secondary" fullWidth disabled={$privyLoading}>
				Later
			</Button>
			<Button on:click={handleCreateWallet} variant="primary" fullWidth disabled={$privyLoading}>
				{#if $privyLoading}
					<span class="flex items-center gap-2">
						<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						Creating...
					</span>
				{:else}
					Create Wallet
				{/if}
			</Button>
		</div>
	</div>
</Modal>
