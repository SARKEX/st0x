<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		showSendFundsModal,
		closeSendFundsModal,
		dynamicSession,
		sendModalToken
	} from '$lib/stores/dynamicStore';
	import { sendTransaction } from '$lib/services/walletService';
	import { currentNetwork } from '$lib/stores';
	import { createApiTokensQuery } from '$lib/queries/tokens';
	import {
		parseEther,
		parseUnits,
		isAddress,
		encodeFunctionData,
		erc20Abi,
		formatUnits
	} from 'viem';
	import { queryClient } from '$lib/clients/queryClient';

	const dispatch = createEventDispatcher();

	// Token type for the selector
	interface TokenOption {
		symbol: string;
		name: string;
		address: `0x${string}` | 'native';
		decimals: number;
		logoUrl?: string;
	}

	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: apiTokens = $apiTokensQuery.data ?? [];

	// Build available tokens list based on current network
	$: availableTokens = (() => {
		const tokens: TokenOption[] = [
			{
				symbol: $currentNetwork?.currencySymbol ?? 'ETH',
				name: `${$currentNetwork?.displayName ?? 'Network'} native currency`,
				address: 'native',
				decimals: 18
			}
		];

		for (const token of apiTokens) {
			tokens.push({
				symbol: token.symbol,
				name: token.name,
				address: token.address as `0x${string}`,
				decimals: token.decimals,
				logoUrl: token.logoUrl
			});
		}

		return tokens;
	})();

	let recipientAddress = '';
	let amount = '';
	let selectedTokenSymbol = '';
	let sending = false;
	let error: string | null = null;
	let txHash: string | null = null;

	// When modal opens with pre-selected token, set it
	$: if ($showSendFundsModal && $sendModalToken) {
		selectedTokenSymbol = $sendModalToken.symbol;
	}
	$: if (!availableTokens.some((token) => token.symbol === selectedTokenSymbol)) {
		selectedTokenSymbol = availableTokens[0]?.symbol ?? '';
	}

	// Get the selected token object
	$: selectedToken =
		availableTokens.find((t) => t.symbol === selectedTokenSymbol) ?? availableTokens[0];

	// Get balance display for pre-selected token
	$: preSelectedBalance =
		$sendModalToken?.symbol === selectedTokenSymbol ? $sendModalToken.balance : null;
	$: preSelectedBalanceRaw =
		$sendModalToken?.symbol === selectedTokenSymbol ? $sendModalToken.balanceRaw : null;

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
		selectedTokenSymbol = $currentNetwork?.currencySymbol ?? '';
		error = null;
		txHash = null;
		sending = false;
	}

	function handleMax() {
		if (preSelectedBalanceRaw && $sendModalToken) {
			// Use the raw balance to get exact amount
			amount = formatUnits(preSelectedBalanceRaw, $sendModalToken.decimals);
		}
	}

	async function handleSend() {
		if (!canSend || !$dynamicSession?.walletAddress || !selectedToken || !$currentNetwork) return;
		const chainId = $currentNetwork.chainId;

		error = null;
		sending = true;

		try {
			let hash: string;

			if (selectedToken.address === 'native') {
				// Send native ETH
				const valueInWei = parseEther(amount);
				hash = await sendTransaction({
					to: recipientAddress as `0x${string}`,
					value: valueInWei,
					chainId
				});
			} else {
				// Send ERC20 token
				const amountInUnits = parseUnits(amount, selectedToken.decimals);

				// Encode the ERC20 transfer function call
				const data = encodeFunctionData({
					abi: erc20Abi,
					functionName: 'transfer',
					args: [recipientAddress as `0x${string}`, amountInUnits]
				});

				// Send transaction to the token contract
				hash = await sendTransaction({
					to: selectedToken.address,
					data,
					chainId
				});
			}

			txHash = hash;
			dispatch('sent', { to: recipientAddress, amount, token: selectedToken.symbol, txHash: hash });

			// Invalidate balance queries to refresh the page
			queryClient.invalidateQueries({ queryKey: ['paymentTokenWalletBalance'] });
			queryClient.invalidateQueries({ queryKey: ['nativeWalletBalance'] });
			queryClient.invalidateQueries({ queryKey: ['sftHoldings'] });
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

<Modal show={$showSendFundsModal} title="Send Funds" maxWidthClass="max-w-md" onClose={handleClose}>
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
					<h3 class="text-lg font-semibold text-text">Transaction Submitted</h3>
					<p class="mt-1 text-sm text-text-2">
						Sending {amount}
						{selectedToken?.symbol} to
					</p>
					<p class="mt-1 font-mono text-xs text-text-3">
						{recipientAddress.slice(0, 10)}...{recipientAddress.slice(-8)}
					</p>
					<a
						href="{$currentNetwork?.blockExplorer}/tx/{txHash}"
						target="_blank"
						rel="noopener noreferrer"
						class="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						View transaction
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</a>
				</div>
				<Button on:click={handleClose} variant="primary" fullWidth>Done</Button>
			</div>
		{:else}
			<!-- Form -->
			<div class="space-y-4">
				<!-- From address (read-only) -->
				<div>
					<label class="mb-1.5 block text-sm font-medium text-text-2" for="from-address">From</label
					>
					<div id="from-address" class="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
						<span class="font-mono text-sm text-text-2">
							{$dynamicSession?.walletAddress
								? `${$dynamicSession.walletAddress.slice(
										0,
										10
									)}...${$dynamicSession.walletAddress.slice(-8)}`
								: 'Not connected'}
						</span>
					</div>
				</div>

				<!-- To address -->
				<div>
					<label class="mb-1.5 block text-sm font-medium text-text-2" for="recipient">
						Recipient Address
					</label>
					<input
						id="recipient"
						type="text"
						placeholder="0x..."
						value={recipientAddress}
						on:input={handleAddressInput}
						class="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm text-text placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					{#if recipientAddress && !isValidAddress}
						<p class="mt-1 text-xs text-red-400">Invalid Ethereum address</p>
					{/if}
				</div>

				<!-- Token selector and amount -->
				<div>
					<div class="mb-1.5 flex items-center justify-between">
						<label class="text-sm font-medium text-text-2" for="amount">Amount</label>
						{#if preSelectedBalance}
							<span class="text-xs text-text-2">
								Balance: <span class="text-text-2">{preSelectedBalance}</span>
							</span>
						{/if}
					</div>
					<div class="flex gap-2">
						<select
							bind:value={selectedTokenSymbol}
							class="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-text focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						>
							{#each availableTokens as token}
								<option value={token.symbol}>{token.symbol}</option>
							{/each}
						</select>
						<div class="relative flex-1">
							<input
								id="amount"
								type="text"
								inputmode="decimal"
								placeholder="0.0"
								value={amount}
								on:input={handleAmountInput}
								class="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 pr-14 text-sm text-text placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
							{#if preSelectedBalanceRaw}
								<button
									type="button"
									on:click={handleMax}
									class="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-surface-3 px-2 py-0.5 text-xs font-medium text-accent hover:bg-gray-600"
								>
									MAX
								</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Error message -->
				{#if error}
					<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
						<p class="text-sm text-red-400">{error}</p>
					</div>
				{/if}

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
							Send {selectedToken?.symbol}
						{/if}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</Modal>
