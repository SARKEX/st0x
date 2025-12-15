<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import OnramperModal from '$lib/components/OnramperModal.svelte';
	import {
		showDepositModal,
		closeDepositModal,
		depositModalInitialView
	} from '$lib/stores/privyStore';
	import { walletAddress, authMethod } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';

	type ModalView = 'options' | 'buy' | 'deposit';
	let currentView: ModalView = 'options';
	let copied = false;
	let showOnramper = false;

	// For external EOA users, go directly to buy view
	// For Privy users, show options (buy or deposit)
	$: if ($showDepositModal) {
		if ($authMethod === 'privy') {
			// Privy users see options menu
			currentView =
				$depositModalInitialView === 'deposit'
					? 'deposit'
					: $depositModalInitialView === 'buy'
						? 'buy'
						: 'options';
		} else {
			// External EOA users go directly to buy
			currentView = 'buy';
		}
	}

	function handleClose() {
		closeDepositModal();
		copied = false;
		showOnramper = false;
		currentView = 'options';
	}

	function showBuyView() {
		currentView = 'buy';
	}

	function handleBuyCrypto() {
		// Open Onramper modal
		showOnramper = true;
	}

	function handleOnramperClose() {
		showOnramper = false;
		handleClose();
	}

	function showDepositView() {
		currentView = 'deposit';
	}

	function goBack() {
		// For external EOA users, going back should close the modal
		if ($authMethod !== 'privy') {
			handleClose();
		} else {
			currentView = 'options';
		}
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

	$: basescanUrl = $walletAddress ? `https://basescan.org/address/${$walletAddress}` : '';

	// Generate QR code URL using free QR code API
	$: qrCodeUrl = $walletAddress
		? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
				$walletAddress
			)}`
		: '';

	$: modalTitle =
		currentView === 'options'
			? 'Add Funds'
			: currentView === 'buy'
				? 'Buy Crypto'
				: 'Deposit from Wallet';
</script>

<!-- Onramper Modal (separate from main modal) -->
<OnramperModal show={showOnramper} walletAddress={$walletAddress} onClose={handleOnramperClose} />

<Modal
	show={$showDepositModal && !showOnramper}
	title={modalTitle}
	maxWidthClass="max-w-md"
	onClose={handleClose}
>
	{#if currentView === 'options'}
		<!-- Options View (Privy users only) -->
		<div class="space-y-4">
			<p class="text-sm text-gray-400">Choose how you want to add funds to your wallet.</p>

			<!-- Buy Crypto Option -->
			<button
				type="button"
				on:click={showBuyView}
				class="w-full rounded-lg border border-gray-700 bg-gray-800 p-4 text-left transition hover:border-blue-500/50 hover:bg-gray-800/80"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20"
					>
						<svg
							class="h-5 w-5 text-blue-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
							/>
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="font-medium text-white">Buy with Card or Bank Transfer</h3>
						<p class="mt-1 text-sm text-gray-400">
							Purchase crypto using a debit card, credit card, or bank transfer
						</p>
					</div>
					<svg
						class="h-5 w-5 flex-shrink-0 text-gray-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</div>
			</button>

			<!-- Deposit from Wallet Option -->
			<button
				type="button"
				on:click={showDepositView}
				class="w-full rounded-lg border border-gray-700 bg-gray-800 p-4 text-left transition hover:border-blue-500/50 hover:bg-gray-800/80"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20"
					>
						<svg
							class="h-5 w-5 text-green-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="font-medium text-white">Deposit Crypto</h3>
						<p class="mt-1 text-sm text-gray-400">
							Transfer crypto from another wallet or exchange
						</p>
					</div>
					<svg
						class="h-5 w-5 flex-shrink-0 text-gray-500"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</div>
			</button>
		</div>
	{:else if currentView === 'buy'}
		<!-- Buy View -->
		<div class="space-y-5">
			<!-- Back button (only for Privy users who have options) -->
			{#if $authMethod === 'privy'}
				<button
					type="button"
					on:click={goBack}
					class="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 19l-7-7 7-7"
						/>
					</svg>
					Back
				</button>
			{/if}

			<p class="text-sm text-gray-400">
				Purchase ETH or USDC on Base network using your preferred payment method.
			</p>

			<!-- Info -->
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
							Powered by Onramper, supporting multiple payment providers for the best rates.
						</p>
						<p>Funds will be sent directly to your wallet on Base.</p>
					</div>
				</div>
			</div>

			<!-- Wallet Address Display -->
			{#if $walletAddress}
				<div class="rounded-lg border border-gray-700 bg-gray-800 p-3">
					<span class="mb-1 block text-xs font-medium text-gray-400">Destination Wallet</span>
					<div class="break-all font-mono text-sm text-white">
						{$walletAddress}
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-3">
				<Button on:click={handleClose} variant="secondary" fullWidth>Cancel</Button>
				<Button on:click={handleBuyCrypto} variant="primary" fullWidth>Continue to Purchase</Button>
			</div>
		</div>
	{:else}
		<!-- Deposit View (Privy users only) -->
		<div class="space-y-5">
			<!-- Back button -->
			<button
				type="button"
				on:click={goBack}
				class="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
				Back
			</button>

			<p class="text-sm text-gray-400">
				Send tokens to your wallet address on {$currentNetwork?.displayName || 'Base'} network.
			</p>

			<!-- QR Code -->
			{#if $walletAddress}
				<div class="flex justify-center">
					<div class="rounded-lg bg-white p-3">
						<img src={qrCodeUrl} alt="Wallet QR Code" class="h-40 w-40" loading="lazy" />
					</div>
				</div>
			{/if}

			<!-- Wallet Address Display -->
			<div class="rounded-lg border border-gray-700 bg-gray-800 p-4">
				<span class="mb-2 block text-xs font-medium text-gray-400">Your Wallet Address</span>
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
							Copy Address
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
					Only send tokens on the {$currentNetwork?.displayName || 'Base'} network. Tokens sent on other
					networks may be lost.
				</p>
			</div>

			<Button on:click={handleClose} variant="primary" fullWidth>Done</Button>
		</div>
	{/if}
</Modal>
