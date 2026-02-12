<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CoinbaseOnrampModal from '$lib/components/CoinbaseOnrampModal.svelte';
	import CoinbaseOfframpModal from '$lib/components/CoinbaseOfframpModal.svelte';
	import {
		showDepositModal,
		closeDepositModal,
		depositModalInitialView
	} from '$lib/stores/dynamicStore';
	import { walletAddress, authMethod } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';

	type ModalView = 'options' | 'buy' | 'withdraw' | 'deposit';
	let currentView: ModalView = 'options';
	let copied = false;
	let showCoinbaseOnramp = false;
	let showCoinbaseOfframp = false;

	// QR code generation
	let qrCodeDataUrl: string = '';
	let qrCodeError: string | null = null;

	// Dynamically import qrcode library (client-side only)
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

	// Generate QR code when wallet address changes and we're in deposit view
	$: if ($walletAddress && currentView === 'deposit') {
		generateQrCode($walletAddress);
	}

	// For external EOA users, go directly to buy view
	// For Dynamic users, show options (buy, withdraw, or deposit)
	$: if ($showDepositModal) {
		if ($authMethod === 'dynamic') {
			// Dynamic users see options menu
			currentView =
				$depositModalInitialView === 'deposit'
					? 'deposit'
					: $depositModalInitialView === 'buy'
						? 'buy'
						: $depositModalInitialView === 'withdraw'
							? 'withdraw'
							: 'options';
		} else {
			// External EOA users go directly to buy
			currentView = 'buy';
		}
	}

	function handleClose() {
		closeDepositModal();
		copied = false;
		showCoinbaseOnramp = false;
		showCoinbaseOfframp = false;
		currentView = 'options';
	}

	function showBuyView() {
		currentView = 'buy';
	}

	function showWithdrawView() {
		currentView = 'withdraw';
	}

	function handleBuyCrypto() {
		showCoinbaseOnramp = true;
	}

	function handleWithdrawFunds() {
		showCoinbaseOfframp = true;
	}

	function handleCoinbaseOnrampClose() {
		showCoinbaseOnramp = false;
		handleClose();
	}

	function handleCoinbaseOfframpClose() {
		showCoinbaseOfframp = false;
		handleClose();
	}

	function showDepositView() {
		currentView = 'deposit';
	}

	function goBack() {
		// For external EOA users, going back should close the modal
		if ($authMethod !== 'dynamic') {
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

	$: modalTitle =
		currentView === 'options'
			? 'Manage Funds'
			: currentView === 'buy'
				? 'Buy USDC'
				: currentView === 'withdraw'
					? 'Withdraw Funds'
					: 'Deposit from Wallet';
</script>

<!-- Coinbase On-ramp Modal (separate from main modal) -->
<CoinbaseOnrampModal
	show={showCoinbaseOnramp}
	walletAddress={$walletAddress}
	onClose={handleCoinbaseOnrampClose}
/>

<!-- Coinbase Off-ramp Modal (separate from main modal) -->
<CoinbaseOfframpModal
	show={showCoinbaseOfframp}
	walletAddress={$walletAddress}
	onClose={handleCoinbaseOfframpClose}
/>

<Modal
	show={$showDepositModal && !showCoinbaseOnramp && !showCoinbaseOfframp}
	title={modalTitle}
	maxWidthClass="max-w-md"
	onClose={handleClose}
>
	{#if currentView === 'options'}
		<!-- Options View (Dynamic users only) -->
		<div class="space-y-4">
			<p class="text-sm text-gray-400">Choose how you want to manage your funds.</p>

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
						<h3 class="font-medium text-white">Buy USDC</h3>
						<p class="mt-1 text-sm text-gray-400">
							Purchase USDC on Base using a card, bank transfer, or Coinbase account
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

			<!-- Withdraw Funds Option -->
			<button
				type="button"
				on:click={showWithdrawView}
				class="w-full rounded-lg border border-gray-700 bg-gray-800 p-4 text-left transition hover:border-blue-500/50 hover:bg-gray-800/80"
			>
				<div class="flex items-start gap-4">
					<div
						class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20"
					>
						<svg
							class="h-5 w-5 text-orange-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
							/>
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="font-medium text-white">Withdraw Funds</h3>
						<p class="mt-1 text-sm text-gray-400">
							Cash out USDC to your bank account via Coinbase
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
			<!-- Back button (only for Dynamic users who have options) -->
			{#if $authMethod === 'dynamic'}
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
				Purchase USDC on Base network using your preferred payment method.
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
							Powered by Coinbase. Use a debit card, bank transfer, Apple Pay, or your Coinbase
							account.
						</p>
						<p>USDC will be sent directly to your wallet on Base.</p>
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
	{:else if currentView === 'withdraw'}
		<!-- Withdraw View -->
		<div class="space-y-5">
			<!-- Back button (only for Dynamic users who have options) -->
			{#if $authMethod === 'dynamic'}
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
				Cash out your USDC to your bank account via Coinbase.
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
							Powered by Coinbase. A Coinbase account with linked bank details is required.
						</p>
						<p>You will need to approve an onchain transaction to send funds to Coinbase for withdrawal.</p>
					</div>
				</div>
			</div>

			<!-- Warning -->
			<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
				<p class="text-xs text-yellow-400">
					Off-ramp transactions must be completed within 30 minutes after starting the withdrawal process.
				</p>
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

			<!-- Actions -->
			<div class="flex gap-3">
				<Button on:click={handleClose} variant="secondary" fullWidth>Cancel</Button>
				<Button on:click={handleWithdrawFunds} variant="primary" fullWidth>Continue to Withdraw</Button>
			</div>
		</div>
	{:else}
		<!-- Deposit View (Dynamic users only) -->
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
