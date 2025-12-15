<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { showDepositModal, closeDepositModal, privySession, fundPrivyWallet, depositModalInitialView } from '$lib/stores/privyStore';
	import { currentNetwork } from '$lib/stores';

	type ModalView = 'options' | 'buy' | 'deposit';
	let currentView: ModalView = 'options';
	let copied = false;
	let buyAmount = '';
	let selectedToken: 'ETH' | 'USDC' = 'ETH';

	// Set initial view when modal opens
	$: if ($showDepositModal) {
		currentView = $depositModalInitialView;
	}

	function handleClose() {
		closeDepositModal();
		copied = false;
		buyAmount = '';
		selectedToken = 'ETH';
		currentView = 'options'; // Reset to options view
	}

	function showBuyView() {
		currentView = 'buy';
	}

	function handleBuyCrypto() {
		// Pass amount if specified, otherwise let Privy use default
		const amount = buyAmount.trim() || undefined;
		const asset = selectedToken === 'USDC' ? 'USDC' : 'native-currency';
		fundPrivyWallet(amount, asset);
		handleClose();
	}

	function showDepositView() {
		currentView = 'deposit';
	}

	function goBack() {
		currentView = 'options';
		buyAmount = '';
		selectedToken = 'ETH';
	}

	async function copyAddress() {
		if (!$privySession?.walletAddress) return;

		try {
			await navigator.clipboard.writeText($privySession.walletAddress);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	function handleAmountInput(e: Event) {
		const input = e.target as HTMLInputElement;
		// Only allow valid number input
		const value = input.value.replace(/[^0-9.]/g, '');
		// Prevent multiple decimals
		const parts = value.split('.');
		if (parts.length > 2) {
			buyAmount = parts[0] + '.' + parts.slice(1).join('');
		} else {
			buyAmount = value;
		}
	}

	// Quick amount presets - different for ETH vs USDC
	$: presetAmounts = selectedToken === 'USDC' ? ['25', '50', '100'] : ['0.01', '0.05', '0.1'];

	$: basescanUrl = $privySession?.walletAddress
		? `https://basescan.org/address/${$privySession.walletAddress}`
		: '';

	// Generate QR code URL using free QR code API
	$: qrCodeUrl = $privySession?.walletAddress
		? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent($privySession.walletAddress)}`
		: '';

	$: modalTitle = currentView === 'options'
		? 'Add Funds'
		: currentView === 'buy'
			? 'Buy Crypto'
			: 'Deposit from Wallet';
</script>

<Modal
	show={$showDepositModal}
	title={modalTitle}
	maxWidthClass="max-w-md"
	onClose={handleClose}
>
	{#if currentView === 'options'}
		<!-- Options View -->
		<div class="space-y-4">
			<p class="text-sm text-gray-400">
				Choose how you want to add funds to your wallet.
			</p>

			<!-- Buy Crypto Option -->
			<button
				type="button"
				on:click={showBuyView}
				class="w-full rounded-lg border border-gray-700 bg-gray-800 p-4 text-left transition hover:border-blue-500/50 hover:bg-gray-800/80"
			>
				<div class="flex items-start gap-4">
					<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20">
						<svg class="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="font-medium text-white">Buy with Card</h3>
						<p class="mt-1 text-sm text-gray-400">
							Purchase crypto using a debit card or bank account via Coinbase
						</p>
					</div>
					<svg class="h-5 w-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
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
					<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-500/20">
						<svg class="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</div>
					<div class="flex-1">
						<h3 class="font-medium text-white">Deposit from Wallet</h3>
						<p class="mt-1 text-sm text-gray-400">
							Transfer crypto from another wallet or exchange
						</p>
					</div>
					<svg class="h-5 w-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</div>
			</button>
		</div>

	{:else if currentView === 'buy'}
		<!-- Buy View -->
		<div class="space-y-5">
			<!-- Back button -->
			<button
				type="button"
				on:click={goBack}
				class="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
				Back
			</button>

			<p class="text-sm text-gray-400">
				Select a token and enter the amount you want to purchase.
			</p>

			<!-- Token Selection -->
			<div>
				<label class="mb-1.5 block text-sm font-medium text-gray-300">Token</label>
				<div class="flex gap-2">
					<button
						type="button"
						on:click={() => (selectedToken = 'ETH')}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition {selectedToken === 'ETH'
							? 'border-blue-500 bg-blue-500/10 text-blue-400'
							: 'border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-500/50'}"
					>
						<img src="/images/ETH.svg" alt="ETH" class="h-5 w-5" />
						ETH
					</button>
					<button
						type="button"
						on:click={() => (selectedToken = 'USDC')}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition {selectedToken === 'USDC'
							? 'border-blue-500 bg-blue-500/10 text-blue-400'
							: 'border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-500/50'}"
					>
						<img src="/images/usdc.svg" alt="USDC" class="h-5 w-5" />
						USDC
					</button>
				</div>
			</div>

			<!-- Amount Input -->
			<div>
				<label class="mb-1.5 block text-sm font-medium text-gray-300" for="buy-amount">
					Amount ({selectedToken})
				</label>
				<input
					id="buy-amount"
					type="text"
					inputmode="decimal"
					placeholder="0.0"
					value={buyAmount}
					on:input={handleAmountInput}
					class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			<!-- Quick Amount Presets -->
			<div class="flex gap-2">
				{#each presetAmounts as preset}
					<button
						type="button"
						on:click={() => (buyAmount = preset)}
						class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 transition hover:border-blue-500/50 hover:text-white"
						class:border-blue-500={buyAmount === preset}
						class:text-blue-400={buyAmount === preset}
					>
						{preset} {selectedToken}
					</button>
				{/each}
			</div>

			<!-- Info -->
			<div class="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2">
				<p class="text-xs text-gray-400">
					You'll be redirected to Coinbase to complete your purchase. Funds will be sent directly to your wallet.
				</p>
			</div>

			<!-- Actions -->
			<div class="flex gap-3">
				<Button on:click={goBack} variant="secondary" fullWidth>Cancel</Button>
				<Button on:click={handleBuyCrypto} variant="primary" fullWidth>
					Continue to Coinbase
				</Button>
			</div>
		</div>

	{:else}
		<!-- Deposit View -->
		<div class="space-y-5">
			<!-- Back button -->
			<button
				type="button"
				on:click={goBack}
				class="flex items-center gap-1 text-sm text-gray-400 hover:text-white"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
				Back
			</button>

			<p class="text-sm text-gray-400">
				Send tokens to your wallet address on {$currentNetwork?.displayName || 'Base'} network.
			</p>

			<!-- QR Code -->
			{#if $privySession?.walletAddress}
				<div class="flex justify-center">
					<div class="rounded-lg bg-white p-3">
						<img
							src={qrCodeUrl}
							alt="Wallet QR Code"
							class="h-40 w-40"
							loading="lazy"
						/>
					</div>
				</div>
			{/if}

			<!-- Wallet Address Display -->
			<div class="rounded-lg border border-gray-700 bg-gray-800 p-4">
				<span class="mb-2 block text-xs font-medium text-gray-400">Your Wallet Address</span>
				<div class="break-all font-mono text-sm text-white">
					{$privySession?.walletAddress || 'Not connected'}
				</div>
			</div>

			<!-- Copy and Basescan buttons -->
			<div class="flex gap-3">
				<Button on:click={copyAddress} variant="secondary" fullWidth>
					{#if copied}
						<span class="flex items-center justify-center gap-2">
							<svg class="h-4 w-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
							</svg>
							Copied!
						</span>
					{:else}
						<span class="flex items-center justify-center gap-2">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							Copy Address
						</span>
					{/if}
				</Button>
				<a href={basescanUrl} target="_blank" rel="noopener noreferrer" class="flex-1">
					<Button variant="ghost" fullWidth>
						<span class="flex items-center justify-center gap-2">
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
							</svg>
							View on Basescan
						</span>
					</Button>
				</a>
			</div>

			<!-- Warning -->
			<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
				<p class="text-xs text-yellow-400">
					Only send tokens on the {$currentNetwork?.displayName || 'Base'} network. Tokens sent on other networks may be lost.
				</p>
			</div>

			<Button on:click={handleClose} variant="primary" fullWidth>Done</Button>
		</div>
	{/if}
</Modal>
