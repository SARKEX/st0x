<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import {
		showWithdrawModal,
		closeWithdrawModal
	} from '$lib/stores/dynamicStore';
	import { walletAddress } from '$lib/stores/authStore';

	let isLoading: boolean = false;
	let error: string | null = null;
	let offrampUrl: string | null = null;

	// When modal opens, try to get a sell quote with pre-filled offramp URL
	$: if ($showWithdrawModal && $walletAddress) {
		// Reset state
		error = null;
		offrampUrl = null;
	}

	// Reset on close
	$: if (!$showWithdrawModal) {
		error = null;
		offrampUrl = null;
		isLoading = false;
	}

	function handleClose() {
		closeWithdrawModal();
	}

	async function handleWithdraw() {
		if (!$walletAddress) return;

		isLoading = true;
		error = null;

		try {
			// Fetch CSRF token
			const csrfResponse = await fetch('/api/auth/csrf');
			if (!csrfResponse.ok) throw new Error('Failed to get security token');
			const { token: csrfToken } = await csrfResponse.json();
			if (!csrfToken) throw new Error('Failed to get security token');

			// Get session token for offramp
			const sessionResponse = await fetch('/api/coinbase/session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfToken
				},
				body: JSON.stringify({ walletAddress: $walletAddress })
			});

			const sessionData = await sessionResponse.json();

			if (!sessionResponse.ok || !sessionData.success) {
				throw new Error(sessionData.error || 'Failed to initialize Coinbase');
			}

			// Build offramp URL with session token
			const params = new URLSearchParams({
				sessionToken: sessionData.token,
				defaultAsset: 'USDC',
				defaultNetwork: 'base',
				partnerUserId: $walletAddress.substring(0, 49),
				redirectUrl: window.location.origin + '/'
			});

			offrampUrl = `https://pay.coinbase.com/v3/sell/input?${params.toString()}`;

			// Open in new tab (Coinbase offramp works better as a full page)
			window.open(offrampUrl, '_blank', 'noopener,noreferrer');
			handleClose();
		} catch (err) {
			console.error('[Coinbase] Failed to initialize offramp:', err);
			error = err instanceof Error ? err.message : 'Failed to initialize withdrawal';
		} finally {
			isLoading = false;
		}
	}
</script>

<Modal show={$showWithdrawModal} title="Withdraw Funds" maxWidthClass="max-w-md" onClose={handleClose}>
	<div class="space-y-5">
		<p class="text-sm text-gray-400">
			Convert your USDC on Base to fiat currency and withdraw to your bank account via Coinbase.
		</p>

		<!-- Info box -->
		<div class="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-3">
			<div class="flex items-start gap-3">
				<svg
					class="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="text-xs text-gray-400">
					<p class="mb-1">
						Powered by Coinbase. You will be redirected to Coinbase to complete the withdrawal.
					</p>
					<p>A Coinbase account with linked bank details is required for fiat withdrawals.</p>
				</div>
			</div>
		</div>

		<!-- Wallet Address Display -->
		{#if $walletAddress}
			<div class="rounded-lg border border-gray-700 bg-gray-800 p-3">
				<span class="mb-1 block text-xs font-medium text-gray-400">Source Wallet</span>
				<div class="break-all font-mono text-sm text-white">
					{$walletAddress}
				</div>
			</div>
		{/if}

		{#if error}
			<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
				<p class="text-xs text-red-400">{error}</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex gap-3">
			<Button on:click={handleClose} variant="secondary" fullWidth>Cancel</Button>
			<Button on:click={handleWithdraw} variant="primary" fullWidth disabled={isLoading || !$walletAddress}>
				{#if isLoading}
					<span class="flex items-center justify-center gap-2">
						<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
						</svg>
						Initializing...
					</span>
				{:else}
					<span class="flex items-center justify-center gap-2">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
						</svg>
						Withdraw to Bank
					</span>
				{/if}
			</Button>
		</div>

		<!-- Warning -->
		<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
			<p class="text-xs text-yellow-400">
				Guest checkout is not supported for withdrawals. You must have a Coinbase account with identity verification and linked bank details.
			</p>
		</div>
	</div>
</Modal>
