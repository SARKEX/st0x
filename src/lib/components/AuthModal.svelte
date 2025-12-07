<script lang="ts">
	import { web3Modal } from 'svelte-wagmi';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { showAuthModal, closeAuthModal, loginWithPrivy, privyLoading } from '$lib/stores/privyStore';

	function handleClose() {
		closeAuthModal();
	}

	function handleConnectWallet() {
		$web3Modal.open();
		handleClose();
	}

	function handlePrivyLogin() {
		loginWithPrivy();
		// Modal stays open briefly while Privy loads, then Privy shows its own modal
	}
</script>

<Modal show={$showAuthModal} title="Connect or Log In" maxWidthClass="max-w-md" onClose={handleClose}>
	<div class="space-y-6">
		<p class="text-center text-gray-300">
			Choose how you'd like to access the platform
		</p>

		<!-- Privy Login (Email/Social) -->
		<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
			<div class="mb-3 flex items-center gap-3">
				<div class="rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 p-2">
					<svg class="h-5 w-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-white">Email or Social Login</h3>
					<p class="text-xs text-gray-400">New to crypto? We'll create a wallet for you</p>
				</div>
			</div>

			<Button
				on:click={handlePrivyLogin}
				variant="primary"
				fullWidth
				size="md"
				disabled={$privyLoading}
			>
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
						Loading...
					</span>
				{:else}
					Continue with Email
				{/if}
			</Button>

			<div class="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500">
				<span>Supports</span>
				<div class="flex items-center gap-1.5">
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
					<!-- Twitter/X -->
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
						/>
					</svg>
					<!-- Discord -->
					<svg class="h-4 w-4" viewBox="0 0 24 24" fill="#5865F2">
						<path
							d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
						/>
					</svg>
				</div>
			</div>
		</div>

		<!-- Divider -->
		<div class="flex items-center gap-4">
			<div class="h-px flex-1 bg-gray-700"></div>
			<span class="text-xs text-gray-500">OR</span>
			<div class="h-px flex-1 bg-gray-700"></div>
		</div>

		<!-- Wallet Connect -->
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
					<p class="text-xs text-gray-400">MetaMask, WalletConnect & more</p>
				</div>
			</div>

			<Button on:click={handleConnectWallet} variant="secondary" fullWidth size="md">
				Connect External Wallet
			</Button>
		</div>

		<!-- Footer note -->
		<p class="text-center text-xs text-gray-500">
			By connecting, you agree to our Terms of Service
		</p>
	</div>
</Modal>
