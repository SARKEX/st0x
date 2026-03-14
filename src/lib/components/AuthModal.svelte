<script lang="ts">
	import { web3Modal } from 'svelte-wagmi';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		showAuthModal,
		closeAuthModal,
		loginWithDynamic,
		dynamicLoading
	} from '$lib/stores/dynamicStore';

	function handleClose() {
		// Reset loading state when modal is closed (in case Dynamic modal was cancelled)
		dynamicLoading.set(false);
		closeAuthModal();
	}

	function handleConnectWallet() {
		$web3Modal.open();
		handleClose();
	}

	function handleDynamicLogin() {
		loginWithDynamic();
		// Modal stays open briefly while Dynamic loads, then Dynamic shows its own modal
	}
</script>

<Modal show={$showAuthModal} title="Sign In" maxWidthClass="max-w-md" onClose={handleClose}>
	<div class="space-y-6">
		<p class="text-center text-gray-300">Choose how you'd like to access the platform</p>

		<!-- Dynamic Login (Email or Social) -->
		<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
			<div class="mb-3 flex items-center gap-3">
				<div class="rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 p-2">
					<svg
						class="h-5 w-5 text-indigo-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-white">Email or Social</h3>
					<p class="text-xs text-gray-400">We'll create a wallet for you</p>
				</div>
			</div>

			<Button
				on:click={handleDynamicLogin}
				variant="primary"
				fullWidth
				size="md"
				disabled={$dynamicLoading}
			>
				{#if $dynamicLoading}
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
						Loading...
					</span>
				{:else}
					Continue
				{/if}
			</Button>

			<div class="mt-3 flex items-center justify-center gap-3 text-xs text-gray-400">
				<!-- Email icon -->
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
					/>
				</svg>
				<!-- Google -->
				<svg class="h-4 w-4" viewBox="0 0 24 24">
					<path
						fill="#EA4335"
						d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"
					/>
					<path
						fill="#34A853"
						d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"
					/>
					<path
						fill="#4A90E2"
						d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"
					/>
					<path
						fill="#FBBC05"
						d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"
					/>
				</svg>
			</div>
		</div>

		<!-- Divider -->
		<div class="flex items-center gap-4">
			<div class="h-px flex-1 bg-gray-700"></div>
			<span class="text-xs text-gray-500">OR</span>
			<div class="h-px flex-1 bg-gray-700"></div>
		</div>

		<!-- Direct Wallet Connect -->
		<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
			<div class="mb-3 flex items-center gap-3">
				<div class="rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-600/20 p-2">
					<svg class="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
						/>
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-white">Connect Wallet</h3>
					<p class="text-xs text-gray-400">Use your existing wallet</p>
				</div>
			</div>

			<Button on:click={handleConnectWallet} variant="secondary" fullWidth size="md">
				Connect Wallet
			</Button>
		</div>

		<!-- Footer note -->
		<p class="text-center text-xs text-gray-400">
			By continuing, you agree to our Terms of Service
		</p>
	</div>
</Modal>
