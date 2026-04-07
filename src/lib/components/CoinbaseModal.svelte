<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	export let show: boolean = false;
	export let walletAddress: string | null = null;
	export let mode: 'onramp' | 'offramp' = 'onramp';
	export let onClose: () => void;

	const isOnramp = mode === 'onramp';

	let isLoading: boolean = false;
	let error: string | null = null;
	let opened: boolean = false;

	$: if (show && walletAddress) {
		fetchAndOpen(walletAddress);
	}

	$: if (!show) {
		error = null;
		opened = false;
	}

	async function fetchAndOpen(address: string) {
		isLoading = true;
		error = null;

		try {
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
				body: JSON.stringify({ walletAddress: address, mode })
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.error || 'Failed to initialize Coinbase');
			}

			const params = new URLSearchParams({
				sessionToken: data.token,
				defaultAsset: 'USDC',
				defaultNetwork: 'base'
			});

			if (!isOnramp && data.redirectUrl) {
				params.set('redirectUrl', data.redirectUrl);
			}

			const basePath = isOnramp ? '/buy/select-asset' : '/v3/sell/input';
			const coinbaseUrl = `https://pay.coinbase.com${basePath}?${params.toString()}`;

			window.open(coinbaseUrl, '_blank', 'noopener,noreferrer');
			opened = true;
		} catch (err) {
			const label = isOnramp ? 'Onramp' : 'Offramp';
			console.error(`[Coinbase ${label}] Failed to get session token:`, err);
			error = err instanceof Error ? err.message : 'Failed to initialize Coinbase';
		} finally {
			isLoading = false;
		}
	}
</script>

<Modal
	{show}
	title={isOnramp ? 'Buy USDC' : 'Withdraw Funds'}
	maxWidthClass="max-w-md"
	{onClose}
>
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
				on:click={() => walletAddress && fetchAndOpen(walletAddress)}
				class="mt-4 text-sm text-blue-400 hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if opened}
		<div class="py-8 text-center">
			<div
				class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20"
			>
				<svg class="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
					/>
				</svg>
			</div>
			<p class="mb-2 text-white">Coinbase opened in a new tab</p>
			<p class="text-sm text-gray-400">
				{#if isOnramp}
					Complete your purchase in the Coinbase tab. Funds will arrive in your wallet on Base.
				{:else}
					Complete your withdrawal in the Coinbase tab. You will need to approve an onchain
					transaction to send funds.
				{/if}
			</p>
			{#if !isOnramp}
				<div
					class="mx-auto mt-4 max-w-sm rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2"
				>
					<p class="text-xs text-yellow-400">
						Off-ramp transactions must be completed within 30 minutes.
					</p>
				</div>
			{/if}
			<button
				type="button"
				on:click={onClose}
				class="mt-6 rounded-lg bg-gray-700 px-6 py-2 text-sm text-white hover:bg-gray-600"
			>
				Close
			</button>
		</div>
	{:else}
		<div class="py-8 text-center">
			<p class="text-gray-400">
				{isOnramp
					? 'Please connect your wallet to purchase crypto.'
					: 'Please connect your wallet to withdraw funds.'}
			</p>
		</div>
	{/if}
</Modal>
