<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import {
		showSendFundsModal,
		closeSendFundsModal,
		privySession,
		sendTransaction
	} from '$lib/stores/privyStore';
	import { parseEther, formatEther, isAddress } from 'viem';

	const dispatch = createEventDispatcher();

	let recipientAddress = '';
	let amount = '';
	let selectedToken: 'ETH' | 'USDC' = 'ETH';
	let sending = false;
	let error: string | null = null;
	let txHash: string | null = null;

	// Validation
	$: isValidAddress = recipientAddress && isAddress(recipientAddress);
	$: isValidAmount = amount && parseFloat(amount) > 0;
	$: canSend = isValidAddress && isValidAmount && !sending;

	function handleClose() {
		resetForm();
		closeSendFundsModal();
	}

	function resetForm() {
		recipientAddress = '';
		amount = '';
		error = null;
		txHash = null;
		sending = false;
	}

	async function handleSend() {
		if (!canSend || !$privySession?.walletAddress) return;

		error = null;
		sending = true;

		try {
			if (selectedToken === 'ETH') {
				// Send ETH
				const valueInWei = parseEther(amount);
				sendTransaction(recipientAddress, `0x${valueInWei.toString(16)}`);

				// Note: The actual transaction is handled by the Privy SDK
				// We'd need to listen for events from Privy to get the actual txHash
				// For now, show a success message
				txHash = 'pending'; // Placeholder - actual hash comes from Privy events

				dispatch('sent', { to: recipientAddress, amount, token: selectedToken });
			} else {
				// For ERC20 tokens like USDC, we'd need to encode the transfer call
				// This would require the token contract address and ABI
				error = 'Token transfers coming soon. Use ETH for now.';
			}
		} catch (err) {
			console.error('[send] Error:', err);
			error = (err as Error).message || 'Failed to send transaction';
		} finally {
			sending = false;
		}
	}

	function handleAddressInput(e: Event) {
		const input = e.target as HTMLInputElement;
		recipientAddress = input.value.trim();
	}

	function handleAmountInput(e: Event) {
		const input = e.target as HTMLInputElement;
		// Only allow valid number input
		const value = input.value.replace(/[^0-9.]/g, '');
		// Prevent multiple decimals
		const parts = value.split('.');
		if (parts.length > 2) {
			amount = parts[0] + '.' + parts.slice(1).join('');
		} else {
			amount = value;
		}
	}
</script>

<Modal
	show={$showSendFundsModal}
	title="Send Funds"
	maxWidthClass="max-w-md"
	onClose={handleClose}
>
	<div class="space-y-5">
		{#if txHash}
			<!-- Success State -->
			<div class="flex flex-col items-center gap-4 py-6">
				<div class="rounded-full bg-green-500/20 p-4">
					<svg class="h-8 w-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<div class="text-center">
					<h3 class="text-lg font-semibold text-white">Transaction Submitted</h3>
					<p class="mt-1 text-sm text-gray-400">
						Sending {amount} {selectedToken} to
					</p>
					<p class="mt-1 font-mono text-xs text-gray-500">
						{recipientAddress.slice(0, 10)}...{recipientAddress.slice(-8)}
					</p>
				</div>
				<Button on:click={handleClose} variant="primary" fullWidth>Done</Button>
			</div>
		{:else}
			<!-- Form -->
			<div class="space-y-4">
				<!-- From address (read-only) -->
				<div>
					<label class="mb-1.5 block text-sm font-medium text-gray-300">From</label>
					<div class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5">
						<span class="font-mono text-sm text-gray-400">
							{$privySession?.walletAddress
								? `${$privySession.walletAddress.slice(0, 10)}...${$privySession.walletAddress.slice(-8)}`
								: 'Not connected'}
						</span>
					</div>
				</div>

				<!-- To address -->
				<div>
					<label class="mb-1.5 block text-sm font-medium text-gray-300" for="recipient">
						Recipient Address
					</label>
					<input
						id="recipient"
						type="text"
						placeholder="0x..."
						value={recipientAddress}
						on:input={handleAddressInput}
						class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 font-mono text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					{#if recipientAddress && !isValidAddress}
						<p class="mt-1 text-xs text-red-400">Invalid Ethereum address</p>
					{/if}
				</div>

				<!-- Token selector and amount -->
				<div>
					<label class="mb-1.5 block text-sm font-medium text-gray-300" for="amount">Amount</label>
					<div class="flex gap-2">
						<select
							bind:value={selectedToken}
							class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						>
							<option value="ETH">ETH</option>
							<option value="USDC" disabled>USDC (soon)</option>
						</select>
						<input
							id="amount"
							type="text"
							inputmode="decimal"
							placeholder="0.0"
							value={amount}
							on:input={handleAmountInput}
							class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					</div>
				</div>

				<!-- Error message -->
				{#if error}
					<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
						<p class="text-sm text-red-400">{error}</p>
					</div>
				{/if}

				<!-- Warning -->
				<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
					<p class="text-xs text-yellow-400">
						Always double-check the recipient address. Transactions cannot be reversed.
					</p>
				</div>

				<!-- Actions -->
				<div class="flex gap-3 pt-2">
					<Button on:click={handleClose} variant="secondary" fullWidth>Cancel</Button>
					<Button on:click={handleSend} variant="primary" fullWidth disabled={!canSend}>
						{#if sending}
							<span class="flex items-center gap-2">
								<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
								Sending...
							</span>
						{:else}
							Send {selectedToken}
						{/if}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</Modal>
