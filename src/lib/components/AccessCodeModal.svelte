<script lang="ts">
	import { onMount } from 'svelte';
	import { disconnect } from '@wagmi/core';
	import { wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, authMethod } from '$lib/stores/authStore';
	import { logoutDynamic } from '$lib/stores/dynamicStore';
	import { signMessage } from '$lib/services/walletService';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		requestAccessRegistrationChallenge,
		registerWallet,
		showAccessCodeModal,
		walletRegistered
	} from '$lib/stores/accessStore';
	import {
		getStoredAccessCode,
		clearStoredAccessCode,
		getStoredReferralCode,
		clearStoredReferralCode,
		isValidReferralCodeFormat
	} from '$lib/utils/accessCodeStorage';
	import { isStaleWalletSessionError, handleStaleWalletSession } from '$lib/utils/walletUtils';

	// Form state
	let accessCode = '';
	let referralCode = '';
	let error = '';
	let submitting = false;
	let showReferralField = false;

	// Pre-fill from localStorage on mount
	onMount(() => {
		const storedCode = getStoredAccessCode();
		if (storedCode) {
			accessCode = storedCode;
		}
		const storedRefCode = getStoredReferralCode();
		if (storedRefCode) {
			referralCode = storedRefCode;
			showReferralField = true;
		}
	});

	// Also check when modal opens
	$: if ($showAccessCodeModal && !accessCode) {
		const storedCode = getStoredAccessCode();
		if (storedCode) {
			accessCode = storedCode;
		}
		const storedRefCode = getStoredReferralCode();
		if (storedRefCode && !referralCode) {
			referralCode = storedRefCode;
			showReferralField = true;
		}
	}

	// Validate referral code format
	$: referralCodeValid = !referralCode || isValidReferralCodeFormat(referralCode);

	async function handleClose() {
		showAccessCodeModal.set(false);
		error = '';
		// Auto-disconnect if user closes modal without registering
		if (!$walletRegistered) {
			if ($authMethod === 'dynamic') {
				logoutDynamic();
			} else if ($wagmiConfig) {
				await disconnect($wagmiConfig);
			}
		}
	}

	async function handleDisconnect() {
		if ($authMethod === 'dynamic') {
			logoutDynamic();
		} else if ($wagmiConfig) {
			await disconnect($wagmiConfig);
		}
		handleClose();
	}

	async function handleSubmit() {
		if (!$walletAddress) {
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
			const normalizedCode = accessCode.trim().toUpperCase();
			const challenge = await requestAccessRegistrationChallenge($walletAddress, normalizedCode);
			if (!challenge.success || !challenge.message || !challenge.nonce) {
				error = challenge.error || 'Failed to issue registration challenge';
				return;
			}

			// Request signature from wallet (works with both Dynamic and wagmi)
			const signature = await signMessage(challenge.message);

			// Register with backend (pass referral code if valid)
			const refCode =
				referralCode.trim() && isValidReferralCodeFormat(referralCode.trim())
					? referralCode.trim().toLowerCase()
					: undefined;
			const result = await registerWallet(
				$walletAddress,
				normalizedCode,
				signature,
				challenge.nonce,
				refCode
			);

			if (result.success) {
				// Clear stored codes after successful registration
				clearStoredAccessCode();
				clearStoredReferralCode();
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
					{$walletAddress?.slice(0, 6)}...{$walletAddress?.slice(-4)}
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
				Don't have an access code? Contact us at <a
					href="mailto:toby@st0x.io"
					class="text-yellow-500 hover:underline">toby@st0x.io</a
				>
			</p>
		</div>

		<!-- Referral code input (collapsible) -->
		<div class="space-y-2">
			{#if showReferralField}
				<label for="referral-code-modal" class="text-sm font-medium text-gray-300">
					Referral Code <span class="text-gray-500">(optional)</span>
				</label>
				<input
					id="referral-code-modal"
					type="text"
					bind:value={referralCode}
					disabled={submitting}
					placeholder="st0x-ref-xxxxxx"
					class="w-full rounded-lg border px-3 py-2 lowercase text-white placeholder-gray-500 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50 {referralCodeValid
						? 'border-gray-700 bg-gray-800 focus:border-yellow-500 focus:ring-yellow-500'
						: 'border-red-500 bg-gray-800 focus:border-red-500 focus:ring-red-500'}"
				/>
				{#if !referralCodeValid}
					<p class="text-xs text-red-400">Invalid referral code format</p>
				{/if}
			{:else}
				<button
					type="button"
					on:click={() => (showReferralField = true)}
					class="text-sm text-gray-400 hover:text-yellow-500"
				>
					+ Add referral code
				</button>
			{/if}
		</div>

		<Button
			on:click={handleSubmit}
			variant="primary"
			fullWidth
			disabled={!accessCode.trim() || submitting}
		>
			{#if submitting}
				<span class="flex items-center gap-2">
					<span class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
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
