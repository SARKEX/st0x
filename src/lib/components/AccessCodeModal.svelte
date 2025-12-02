<script lang="ts">
	import { onMount } from 'svelte';
	import { signMessage, disconnect } from '@wagmi/core';
	import { signerAddress, wagmiConfig } from 'svelte-wagmi';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		createSignMessage,
		registerWallet,
		showAccessCodeModal,
		walletRegistered
	} from '$lib/stores/accessStore';
	import {
		getStoredAccessCode,
		clearStoredAccessCode
	} from '$lib/utils/accessCodeStorage';
	import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';

	// Form state
	let accessCode = '';
	let error = '';
	let submitting = false;

	// Pre-fill from localStorage on mount
	onMount(() => {
		const storedCode = getStoredAccessCode();
		if (storedCode) {
			accessCode = storedCode;
		}
	});

	// Also check when modal opens
	$: if ($showAccessCodeModal && !accessCode) {
		const storedCode = getStoredAccessCode();
		if (storedCode) {
			accessCode = storedCode;
		}
	}

	async function handleClose() {
		showAccessCodeModal.set(false);
		error = '';
		// Auto-disconnect if user closes modal without registering
		if (!$walletRegistered && $wagmiConfig) {
			await disconnect($wagmiConfig);
		}
	}

	async function handleDisconnect() {
		if ($wagmiConfig) {
			await disconnect($wagmiConfig);
		}
		handleClose();
	}

	async function handleSubmit() {
		if (!$signerAddress || !$wagmiConfig) {
			error = 'Wallet not connected';
			return;
		}

		if (!accessCode.trim()) {
			error = 'Please enter an access code';
			return;
		}

		submitting = true;
		error = '';

		try {
			// Create message to sign
			const message = createSignMessage($signerAddress, accessCode.trim().toUpperCase());

			// Request signature from wallet
			const signature = await signMessage($wagmiConfig, { message });

			// Register with backend
			const result = await registerWallet($signerAddress, accessCode.trim(), signature, message);

			if (result.success) {
				// Clear stored code after successful registration
				clearStoredAccessCode();
				handleClose();
			} else {
				error = result.error || 'Registration failed';
			}
		} catch (err) {
			if (isStaleWalletSessionError(err)) {
				error = await handleStaleWalletSession($wagmiConfig);
			} else if (err instanceof Error) {
				if (err.message.includes('rejected') || err.message.includes('denied')) {
					error = 'Signature request was rejected';
				} else {
					error = err.message;
				}
			} else {
				error = 'An unexpected error occurred';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<Modal
	show={$showAccessCodeModal}
	title="Complete Registration"
	maxWidthClass="max-w-md"
	onClose={handleClose}
>
	<div class="space-y-4">
		<!-- Connected wallet indicator -->
		<div
			class="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2"
		>
			<div class="flex items-center gap-2">
				<svg class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.707a1 1 0 00-1.414-1.414L9 10.172 7.707 8.879a1 1 0 10-1.414 1.414L9 13l4.707-4.707z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="text-sm text-gray-300">
					{$signerAddress?.slice(0, 6)}...{$signerAddress?.slice(-4)}
				</span>
			</div>
			<button
				on:click={handleDisconnect}
				class="text-xs text-gray-400 transition-colors hover:text-red-400"
				disabled={submitting}
			>
				Disconnect
			</button>
		</div>

		{#if error}
			<div class="rounded-md border border-red-900/40 bg-red-900/20 p-3 text-sm text-red-300">
				{error}
			</div>
		{/if}

		<!-- Access code input -->
		<div class="space-y-2">
			<label for="access-code-modal" class="text-sm font-medium text-gray-300">Access Code</label>
			<input
				id="access-code-modal"
				type="text"
				bind:value={accessCode}
				disabled={submitting}
				placeholder="ST0X-XXXX-XXXX"
				class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 uppercase text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
			/>
			<p class="text-xs text-gray-500">
				Don't have an access code? Contact us at <a href="mailto:toby@st0x.io" class="text-yellow-500 hover:underline">toby@st0x.io</a>
			</p>
		</div>

		<Button
			on:click={handleSubmit}
			variant="primary"
			fullWidth
			disabled={!accessCode.trim() || submitting}
		>
			{#if submitting}
				<span class="flex items-center gap-2">
					<span
						class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
					></span>
					Signing...
				</span>
			{:else}
				Sign & Register
			{/if}
		</Button>

		<p class="text-center text-xs text-gray-500">
			You'll sign a message to verify wallet ownership
		</p>
	</div>
</Modal>
