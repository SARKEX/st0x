<script lang="ts">
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
	import { PAYMENT_TOKENS_BY_NETWORK, TOKENS } from '$lib/config/tokens';
	import {
		parseEther,
		parseUnits,
		isAddress,
		encodeFunctionData,
		erc20Abi,
		formatUnits
	} from 'viem';
	import { queryClient } from '$lib/clients/queryClient';

	// Token type for the selector
	interface TokenOption {
		symbol: string;
		name: string;
		address: `0x${string}` | 'native';
		decimals: number;
		logoUrl?: string;
	}

	// Build available tokens list based on current network
	$: availableTokens = (() => {
		const tokens: TokenOption[] = [
			{ symbol: 'ETH', name: 'Ethereum', address: 'native', decimals: 18 }
		];

		// Add payment tokens for current network (USDC, etc.)
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork?.chainId ?? 0] ?? [];
		for (const token of paymentTokens) {
			tokens.push({
				symbol: token.symbol,
				name: token.name,
				address: token.address as `0x${string}`,
				decimals: token.decimals,
				logoUrl: token.logoUrl
			});
		}

		// Add asset tokens (tStocks) for current network
		const assetTokens = TOKENS.filter((t) => t.chainId === $currentNetwork?.chainId);
		for (const token of assetTokens) {
			tokens.push({
				symbol: token.symbol,
				name: token.name,
				address: token.address as `0x${string}`,
				decimals: 18, // tStocks use 18 decimals
				logoUrl: token.logoUrl
			});
		}

		return tokens;
	})();

	let recipientAddress = '';
	let amount = '';
	let selectedTokenSymbol = 'ETH';
	let sending = false;
	let error: string | null = null;
	let txHash: string | null = null;

	// When modal opens with pre-selected token, set it
	$: if ($showSendFundsModal && $sendModalToken) {
		selectedTokenSymbol = $sendModalToken.symbol;
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
		selectedTokenSymbol = 'ETH';
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
		if (!canSend || !$dynamicSession?.walletAddress || !selectedToken) return;

		error = null;
		sending = true;

		try {
			let hash: string;

			if (selectedToken.address === 'native') {
				// Send native ETH
				const valueInWei = parseEther(amount);
				hash = await sendTransaction({
					to: recipientAddress as `0x${string}`,
					value: valueInWei
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
					data
				});
			}

			txHash = hash;

			// Invalidate balance queries after successful send
			await queryClient.invalidateQueries({ queryKey: ['tokenBalances'] });
		} catch (err) {
			console.error('[send] Transaction failed:', err);
			error = (err as Error).message || 'Transaction failed';
		} finally {
			sending = false;
		}
	}
</script>

<Modal show={$showSendFundsModal} title="Send Funds" maxWidthClass="max-w-md" onClose={handleClose}>
	<div class="space-y-4">
		{#if txHash}
			<!-- Success state -->
			<div class="rounded-lg bg-green-500/10 p-4 text-center">
				<svg class="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				<h3 class="mt-2 font-semibold text-green-400">Transaction Sent!</h3>
				<p class="mt-1 text-sm text-gray-400">
					Your transaction has been submitted to the network.
				</p>
				<a
					href={`https://basescan.org/tx/${txHash}`}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-2 inline-block text-sm text-blue-400 hover:text-blue-300"
				>
					View on BaseScan
				</a>
			</div>
			<Button on:click={handleClose} variant="primary" fullWidth>
				Done
			</Button>
		{:else}
			<!-- Token selector -->
			<div>
				<label class="mb-1 block text-sm text-gray-400">Token</label>
				<select
					bind:value={selectedTokenSymbol}
					class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white"
				>
					{#each availableTokens as token}
						<option value={token.symbol}>{token.symbol} - {token.name}</option>
					{/each}
				</select>
				{#if preSelectedBalance}
					<p class="mt-1 text-xs text-gray-400">Balance: {preSelectedBalance}</p>
				{/if}
			</div>

			<!-- Recipient address -->
			<div>
				<label class="mb-1 block text-sm text-gray-400">Recipient Address</label>
				<input
					type="text"
					bind:value={recipientAddress}
					placeholder="0x..."
					class="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
					class:border-red-500={recipientAddress && !isValidAddress}
				/>
				{#if recipientAddress && !isValidAddress}
					<p class="mt-1 text-xs text-red-400">Invalid address</p>
				{/if}
			</div>

			<!-- Amount -->
			<div>
				<label class="mb-1 block text-sm text-gray-400">Amount</label>
				<div class="flex gap-2">
					<input
						type="number"
						bind:value={amount}
						placeholder="0.0"
						step="any"
						min="0"
						class="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500"
					/>
					{#if preSelectedBalanceRaw}
						<Button on:click={handleMax} variant="ghost" size="sm">
							Max
						</Button>
					{/if}
				</div>
			</div>

			{#if error}
				<div class="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
					{error}
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-3">
				<Button on:click={handleClose} variant="ghost" fullWidth>
					Cancel
				</Button>
				<Button on:click={handleSend} variant="primary" fullWidth disabled={!canSend}>
					{#if sending}
						<span class="flex items-center gap-2">
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
							</svg>
							Sending...
						</span>
					{:else}
						Send
					{/if}
				</Button>
			</div>
		{/if}
	</div>
</Modal>
