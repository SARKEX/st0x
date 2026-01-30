<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { env } from '$env/dynamic/public';

	export let show: boolean = false;
	export let walletAddress: string | null = null;
	export let onClose: () => void;

	let coinbaseUrl: string = '';
	let isLoading: boolean = false;
	let error: string | null = null;

	$: if (show && walletAddress) {
		fetchSessionAndBuildUrl(walletAddress);
	}

	$: if (!show) {
		coinbaseUrl = '';
		error = null;
	}

	async function fetchSessionAndBuildUrl(address: string) {
		isLoading = true;
		error = null;

		try {
			// Fetch CSRF token
			const csrfResponse = await fetch('/api/auth/csrf');
			if (!csrfResponse.ok) {
				throw new Error('Failed to get security token');
			}
			const { token: csrfToken } = await csrfResponse.json();
			if (!csrfToken) {
				throw new Error('Failed to get security token');
			}

			// Get session token from our backend
			const response = await fetch('/api/coinbase/session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': csrfToken
				},
				body: JSON.stringify({ walletAddress: address })
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.error || 'Failed to initialize Coinbase');
			}

			// Build Coinbase Onramp URL with session token
			const params = new URLSearchParams({
				sessionToken: data.token,
				defaultAsset: 'USDC',
				defaultNetwork: 'base',
				partnerUserId: address.substring(0, 49),
				redirectUrl: window.location.origin + '/'
			});

			coinbaseUrl = `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
		} catch (err) {
			console.error('[Coinbase] Failed to initialize onramp:', err);
			error = err instanceof Error ? err.message : 'Failed to initialize Coinbase';
		} finally {
			isLoading = false;
		}
	}
</script>

<Modal {show} title="Buy Crypto" maxWidthClass="max-w-lg" maxHeightVh={90} {onClose}>
	{#if isLoading}
		<div class="flex items-center justify-center py-16">
			<LoadingSpinner variant="inline" size="md" text="Initializing Coinbase..." />
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
				on:click={() => walletAddress && fetchSessionAndBuildUrl(walletAddress)}
				class="mt-4 text-sm text-blue-400 hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if walletAddress && coinbaseUrl}
		<div class="flex flex-col items-center">
			<p class="mb-4 text-sm text-gray-400">
				Purchase USDC using your card, bank account, or Coinbase balance. Funds will be sent
				directly to your wallet on Base.
			</p>
			<div class="w-full overflow-hidden rounded-lg">
				<iframe
					src={coinbaseUrl}
					title="Coinbase Onramp"
					height="630"
					width="100%"
					allow="accelerometer; autoplay; camera; gyroscope; payment; microphone"
					class="border-0"
				/>
			</div>
		</div>
	{:else}
		<div class="py-8 text-center">
			<p class="text-gray-400">Please connect your wallet to purchase crypto.</p>
		</div>
	{/if}
</Modal>
