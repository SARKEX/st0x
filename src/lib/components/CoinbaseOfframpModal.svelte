<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	export let show: boolean = false;
	export let walletAddress: string | null = null;
	export let onClose: () => void;

	let coinbaseUrl: string = '';
	let isLoading: boolean = false;
	let error: string | null = null;

	// Fetch session token when modal opens with a wallet address
	$: if (show && walletAddress) {
		fetchSessionToken(walletAddress);
	}

	// Reset state when modal closes
	$: if (!show) {
		coinbaseUrl = '';
		error = null;
	}

	async function fetchSessionToken(address: string) {
		isLoading = true;
		error = null;

		try {
			// Fetch CSRF token first
			const csrfResponse = await fetch('/api/auth/csrf');
			if (!csrfResponse.ok) {
				throw new Error('Failed to get security token');
			}
			const { token: csrfToken } = await csrfResponse.json();
			if (!csrfToken) {
				throw new Error('Failed to get security token');
			}

			const response = await fetch('/api/coinbase/session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfToken
				},
				body: JSON.stringify({ walletAddress: address, mode: 'offramp' })
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.error || 'Failed to initialize Coinbase');
			}

			// Build the Coinbase off-ramp URL with session token
			const params = new URLSearchParams({
				sessionToken: data.token,
				defaultAsset: 'USDC',
				defaultNetwork: 'base'
			});

			if (data.redirectUrl) {
				params.set('redirectUrl', data.redirectUrl);
			}

			coinbaseUrl = `https://pay.coinbase.com/v3/sell/input?${params.toString()}`;
		} catch (err) {
			console.error('[Coinbase Offramp] Failed to get session token:', err);
			error = err instanceof Error ? err.message : 'Failed to initialize Coinbase';
		} finally {
			isLoading = false;
		}
	}
</script>

<Modal {show} title="Withdraw Funds" maxWidthClass="max-w-lg" maxHeightVh={90} {onClose}>
	{#if isLoading}
		<div class="flex items-center justify-center py-16">
			<LoadingSpinner variant="inline" size="md" text="Connecting to Coinbase..." />
		</div>
	{:else if error}
		<div class="py-8 text-center">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20"
			>
				<svg class="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>
			<p class="text-gray-400">{error}</p>
			<button
				type="button"
				on:click={() => walletAddress && fetchSessionToken(walletAddress)}
				class="mt-4 text-sm text-blue-400 hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if walletAddress && coinbaseUrl}
		<div class="flex flex-col items-center">
			<p class="mb-4 text-sm text-gray-400">
				Cash out your USDC to your bank account via Coinbase. A Coinbase account with linked bank
				details is required.
			</p>
			<div
				class="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-left"
			>
				<p class="text-xs text-yellow-400">
					Off-ramp transactions must be completed within 30 minutes. You will need to approve an
					onchain transaction to send funds to Coinbase.
				</p>
			</div>
			<div class="w-full overflow-hidden rounded-lg">
				<iframe
					src={coinbaseUrl}
					title="Coinbase Offramp"
					height="630"
					width="100%"
					allow="payment"
					class="border-0"
				/>
			</div>
		</div>
	{:else}
		<div class="py-8 text-center">
			<p class="text-gray-400">Please connect your wallet to withdraw funds.</p>
		</div>
	{/if}
</Modal>
