<script lang="ts">
	import { web3Modal } from 'svelte-wagmi';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { showWalletConnectionModal } from '$lib/stores/accessStore';

	function handleClose() {
		showWalletConnectionModal.set(false);
	}

	function handleConnect() {
		$web3Modal.open();
		handleClose();
	}
</script>

<Modal
	show={$showWalletConnectionModal}
	title="Connect Your Wallet"
	maxWidthClass="max-w-md"
	onClose={handleClose}
>
	<div class="space-y-6">
		<div class="flex flex-col items-center gap-4 py-4">
			<div class="rounded-full bg-gradient-to-br from-blue-600/20 to-purple-700/20 p-6">
				<svg
					class="h-12 w-12 text-blue-600 dark:text-blue-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
					/>
				</svg>
			</div>

			<div class="text-center">
				<p class="text-text-2">
					Connect your wallet to view balances and manage token wrapping or unwrapping.
				</p>
			</div>
		</div>

		<Button on:click={handleConnect} variant="primary" fullWidth size="lg">Connect Wallet</Button>
	</div>
</Modal>
