<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { PUBLIC_ONRAMPER_API_KEY } from '$env/static/public';

	export let show: boolean = false;
	export let walletAddress: string | null = null;
	export let onClose: () => void;

	// Build Onramper widget URL with parameters
	$: onramperUrl = (() => {
		if (!walletAddress) return '';

		const params = new URLSearchParams({
			apiKey: PUBLIC_ONRAMPER_API_KEY || 'pk_prod_01JF8SSS37YHPFHZ24XS3AGMKY', // Fallback to test key
			mode: 'buy',
			// Use networkWallets for Base chain (wallet works for all tokens on that network)
			networkWallets: `base:${walletAddress}`,
			defaultCrypto: 'eth_base', // ETH on Base
			onlyCryptos: 'eth_base,usdc_base', // Allow ETH and USDC on Base
			isAddressEditable: 'false',
			darkMode: 'true',
			primaryColor: '3b82f6' // Blue-500 to match app theme
		});

		return `https://buy.onramper.com?${params.toString()}`;
	})();
</script>

<Modal
	{show}
	title="Buy Crypto"
	maxWidthClass="max-w-lg"
	maxHeightVh={90}
	{onClose}
>
	{#if walletAddress && onramperUrl}
		<div class="flex flex-col items-center">
			<p class="mb-4 text-sm text-gray-400">
				Purchase crypto using your card or bank account. Funds will be sent directly to your wallet on Base.
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
