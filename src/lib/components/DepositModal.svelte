<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { showDepositModal, closeDepositModal } from '$lib/stores/dynamicStore';
	import { walletAddress } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';

	let copied = false;

	// QR code generation (client-side, dynamic import for code-splitting)
	let qrCodeDataUrl: string = '';
	let qrCodeError: string | null = null;

	async function generateQrCode(data: string) {
		if (!browser) return;
		try {
			const QRCode = (await import('qrcode')).default;
			qrCodeDataUrl = await QRCode.toDataURL(data, {
				width: 160,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#FFFFFF'
				}
			});
			qrCodeError = null;
		} catch (err) {
			console.error('Failed to generate QR code:', err);
			qrCodeError = 'Failed to generate QR code';
			qrCodeDataUrl = '';
		}
	}

	// Generate QR code when wallet address is available and modal is open
	$: if ($walletAddress && $showDepositModal) {
		generateQrCode($walletAddress);
	}

	function handleClose() {
		closeDepositModal();
		copied = false;
	}

	async function copyAddress() {
		if (!$walletAddress) return;
		try {
			await navigator.clipboard.writeText($walletAddress);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Per UI-SPEC §DepositModal: payment token displayed in body copy.
	// Network's default payment token on Base is USDC.
	$: paymentToken = 'USDC';
	$: networkName = $currentNetwork?.displayName ?? 'Base';
	$: basescanUrl = $walletAddress ? `https://basescan.org/address/${$walletAddress}` : '';
</script>

<Modal show={$showDepositModal} title="Deposit" maxWidthClass="max-w-md" onClose={handleClose}>
	<div class="space-y-5">
		<p class="text-sm text-gray-400">
			Send {paymentToken} on {networkName} to this address. Funds will appear in your st0x balance once
			confirmed.
		</p>

		<!-- QR Code (generated client-side for privacy) -->
		{#if $walletAddress}
			<div class="flex justify-center">
				<div class="rounded-lg bg-white p-3">
					{#if qrCodeDataUrl}
						<img src={qrCodeDataUrl} alt="Wallet QR Code" class="h-40 w-40" />
					{:else if qrCodeError}
						<div
							class="flex h-40 w-40 items-center justify-center text-center text-sm text-gray-500"
						>
							{qrCodeError}
						</div>
					{:else}
						<div class="flex h-40 w-40 items-center justify-center">
							<svg class="h-6 w-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
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
						</div>
					{/if}
				</div>
			</div>
			<p class="text-center text-xs text-gray-500">Scan with your wallet</p>
		{/if}

		<!-- Wallet Address Display -->
		<div class="rounded-lg border border-gray-700 bg-gray-800 p-4">
			<span class="mb-2 block text-xs font-medium text-gray-400">Your wallet address</span>
			<div class="break-all font-mono text-sm text-white">
				{$walletAddress || 'Not connected'}
			</div>
		</div>

		<!-- Copy and Basescan buttons -->
		<div class="flex gap-3">
			<Button on:click={copyAddress} variant="secondary" fullWidth>
				{#if copied}
					<span class="flex items-center justify-center gap-2">
						<svg
							class="h-4 w-4 text-green-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						Copied!
					</span>
				{:else}
					<span class="flex items-center justify-center gap-2">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
							/>
						</svg>
						Copy address
					</span>
				{/if}
			</Button>
			<a href={basescanUrl} target="_blank" rel="noopener noreferrer" class="flex-1">
				<Button variant="ghost" fullWidth>
					<span class="flex items-center justify-center gap-2">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
						View on Basescan
					</span>
				</Button>
			</a>
		</div>

		<!-- Warning -->
		<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
			<p class="text-xs text-yellow-400">
				Only send tokens on the {networkName} network. Tokens sent on other networks may be lost.
			</p>
		</div>

		<Button on:click={handleClose} variant="primary" fullWidth>Close</Button>
	</div>
</Modal>
