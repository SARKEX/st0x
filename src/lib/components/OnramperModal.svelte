<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { env } from '$env/dynamic/public';

	export let show: boolean = false;
	export let walletAddress: string | null = null;
	export let onClose: () => void;

	let onramperUrl: string = '';
	let isLoading: boolean = false;
	let error: string | null = null;

	// Fetch signed URL when modal opens with a wallet address
	$: if (show && walletAddress) {
		fetchSignedUrl(walletAddress);
	}

	// Reset state when modal closes
	$: if (!show) {
		onramperUrl = '';
		error = null;
	}

	async function fetchSignedUrl(address: string) {
		isLoading = true;
		error = null;

		// Validate API key is configured
		const apiKey = env.PUBLIC_ONRAMPER_API_KEY;
		if (!apiKey) {
			error = 'Onramper is not configured. Please contact support.';
			isLoading = false;
			return;
		}

		try {
			const response = await fetch('/api/onramper/sign-url', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ walletAddress: address })
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.error || 'Failed to initialize payment');
			}

			// Build the full URL with signature
			const params = new URLSearchParams({
				apiKey,
				mode: 'buy',
				networkWallets: data.networkWallets,
				defaultCrypto: 'eth_base',
				onlyCryptos: 'eth_base,usdc_base',
				isAddressEditable: 'false',
				darkMode: 'true',
				color: '4c77ba',
				fontFamily: "'DM Sans', sans-serif",
				gFontPath: 'css2?family=DM+Sans:wght@400;500;600;700&display=swap',
				signature: data.signature
			});

			// Use environment variable to determine Onramper domain
			// PUBLIC_ONRAMPER_ENV should be 'production' for live, anything else for sandbox
			const isProduction = env.PUBLIC_ONRAMPER_ENV === 'production';
			const baseUrl = isProduction
				? 'https://buy.onramper.com'
				: 'https://buy.onramper.dev';
			onramperUrl = `${baseUrl}?${params.toString()}`;
		} catch (err) {
			console.error('[Onramper] Failed to get signed URL:', err);
			error = err instanceof Error ? err.message : 'Failed to initialize payment';
		} finally {
			isLoading = false;
		}
	}
</script>

<Modal {show} title="Buy Crypto" maxWidthClass="max-w-lg" maxHeightVh={90} {onClose}>
	{#if isLoading}
		<div class="flex items-center justify-center py-16">
			<LoadingSpinner variant="inline" size="md" text="Initializing payment..." />
		</div>
	{:else if error}
		<div class="py-8 text-center">
			<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
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
				on:click={() => walletAddress && fetchSignedUrl(walletAddress)}
				class="mt-4 text-sm text-blue-400 hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if walletAddress && onramperUrl}
		<div class="flex flex-col items-center">
			<p class="mb-4 text-sm text-gray-400">
				Purchase crypto using your card or bank account. Funds will be sent directly to your wallet
				on Base.
			</p>
			<div class="w-full overflow-hidden rounded-lg">
				<iframe
					src={onramperUrl}
					title="Onramper Widget"
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
