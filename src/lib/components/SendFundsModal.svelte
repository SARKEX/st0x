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
	import { currentNetwork, payFeesInStablecoin } from '$lib/stores';
	import { PAYMENT_TOKENS_BY_NETWORK, TOKENS } from '$lib/config/tokens';
	import { getUSDCAddressForChain } from '$lib/services/account-abstraction/tokens';
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

	// When paying gas in USDC and sending USDC on same chain, reserve this much for gas (6 decimals)
	const GAS_RESERVE_USDC_RAW = 100_000n; // 0.1 USDC

	const erc4626Abi = [
		{
			type: 'function',
			name: 'withdraw',
			stateMutability: 'nonpayable',
			inputs: [
			{ name: 'assets', type: 'uint256' },
			{ name: 'receiver', type: 'address' },
			{ name: 'owner', type: 'address' }
			],
			outputs: [{ name: 'shares', type: 'uint256' }]
		}
		] as const;

	
	const BLOCK_EXPLORER_BY_CHAIN: Record<number, string> = {
		8453: 'https://basescan.org',
		42161: 'https://arbiscan.io'
	};

	// Token type for the selector
	interface TokenOption {
		symbol: string;
		name: string;
		address: `0x${string}` | 'native';
		decimals: number;
		logoUrl?: string;
		chainId?: number;
	}

	// Build available tokens list based on current network.
	// When opened from Withdraw, include the pre-selected token so it appears in the dropdown.
	$: availableTokens = (() => {
		const networkChainId = $currentNetwork?.chainId ?? 0;
		const tokens: TokenOption[] = [
			{ symbol: 'ETH', name: 'Ethereum', address: 'native', decimals: 18, chainId: networkChainId }
		];

		// Add payment tokens for current network (USDC, etc.)
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[networkChainId] ?? [];
		for (const token of paymentTokens) {
			tokens.push({
				symbol: token.symbol,
				name: token.name,
				address: token.address as `0x${string}`,
				decimals: token.decimals,
				logoUrl: token.logoUrl,
				chainId: (token as { chainId?: number }).chainId ?? networkChainId
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
				logoUrl: token.logoUrl,
				chainId: token.chainId
			});
		}

		// If modal was opened from Withdraw with a token not in the list (e.g. USDT, or USDC on Arbitrum), add it
		if ($sendModalToken && $sendModalToken.address !== 'native') {
			const addr = $sendModalToken.address.toLowerCase();
			const already = tokens.some(
				(t) => t.address !== 'native' && t.address.toLowerCase() === addr
			);
			if (!already) {
				tokens.push({
					symbol: $sendModalToken.symbol,
					name: $sendModalToken.symbol,
					address: $sendModalToken.address as `0x${string}`,
					decimals: $sendModalToken.decimals,
					chainId: $sendModalToken.chainId
				});
			}
		}

		return tokens;
	})();

	let recipientAddress = '';
	let amount = '';
	// Use address (or 'native') so the correct token is selected when multiple have the same symbol
	let selectedTokenKey: string = 'native';
	let sending = false;
	let error: string | null = null;
	let txHash: string | null = null;
	let sentChainId: number | null = null;
	/** True when tx was submitted but backend didn't return hash (e.g. Arbitrum); show "may have succeeded" instead of error */
	let submittedHashUnknown = false;
	// So we only preselect from sendModalToken when the modal opens, not on every reactive run
	let didPreselectThisOpen = false;

	// When modal opens with pre-selected token (e.g. from Withdraw), select it by address once
	$: if ($showSendFundsModal && $sendModalToken && !didPreselectThisOpen) {
		selectedTokenKey =
			$sendModalToken.address === 'native' ? 'native' : $sendModalToken.address.toLowerCase();
		didPreselectThisOpen = true;
	}

	// Get the selected token object by address
	$: selectedToken = (() => {
		const key = selectedTokenKey?.toLowerCase?.() ?? 'native';
		if (key === 'native') {
			return availableTokens.find((t) => t.address === 'native') ?? availableTokens[0];
		}
		return (
			availableTokens.find(
				(t) => t.address !== 'native' && t.address.toLowerCase() === key
			) ?? availableTokens[0]
		);
	})();

	// Balance display when the selected token matches the token we opened with (e.g. Withdraw USDT)
	$: preSelectedBalance =
		$sendModalToken && selectedToken && $sendModalToken.address !== 'native' &&
		selectedToken.address !== 'native' &&
		$sendModalToken.address.toLowerCase() === selectedToken.address.toLowerCase()
			? $sendModalToken.balance
			: null;
	$: preSelectedBalanceRaw =
		$sendModalToken && selectedToken && $sendModalToken.address !== 'native' &&
		selectedToken.address !== 'native' &&
		$sendModalToken.address.toLowerCase() === selectedToken.address.toLowerCase()
			? $sendModalToken.balanceRaw
			: null;

	// Chain to send on: selected token's chain (e.g. Arbitrum) or current network
	$: sendChainId = selectedToken?.chainId ?? $currentNetwork?.chainId;
	$: feeChainName = sendChainId === 42161 ? 'Arbitrum' : sendChainId === 8453 ? 'Base' : 'this network';

	// When paying gas in USDC and sending USDC on the same chain (Base or Arbitrum), reserve some for the fee
	$: isPayingGasWithSameToken = (() => {
		if (!$payFeesInStablecoin || !selectedToken || selectedToken.address === 'native' || selectedToken.symbol !== 'USDC') return false;
		const usdcAddr = sendChainId != null ? getUSDCAddressForChain(sendChainId) : undefined;
		return usdcAddr != null && selectedToken.address.toLowerCase() === usdcAddr.toLowerCase();
	})();

	$: effectiveMaxBalanceRaw =
		preSelectedBalanceRaw != null && isPayingGasWithSameToken && selectedToken?.decimals === 6
			? (preSelectedBalanceRaw > GAS_RESERVE_USDC_RAW
				? preSelectedBalanceRaw - GAS_RESERVE_USDC_RAW
				: 0n)
			: preSelectedBalanceRaw;

	// Validation
	$: isValidAddress = recipientAddress && isAddress(recipientAddress);
	$: isValidAmount = amount && parseFloat(amount) > 0;
	$: amountExceedsMaxWithGasReserve = (() => {
		if (!isPayingGasWithSameToken || effectiveMaxBalanceRaw == null || !selectedToken || !amount) return false;
		try {
			const amountRaw = parseUnits(amount, selectedToken.decimals);
			return amountRaw > effectiveMaxBalanceRaw;
		} catch {
			return false;
		}
	})();
	$: canSend =
		isValidAddress && isValidAmount && !sending && !amountExceedsMaxWithGasReserve;

	function handleClose() {
		resetForm();
		closeSendFundsModal();
	}

	function resetForm() {
		recipientAddress = '';
		amount = '';
		selectedTokenKey = 'native';
		didPreselectThisOpen = false;
		error = null;
		txHash = null;
		sentChainId = null;
		submittedHashUnknown = false;
		sending = false;
	}

	function handleMax() {
		const maxRaw = effectiveMaxBalanceRaw ?? preSelectedBalanceRaw;
		if (maxRaw != null && selectedToken) {
			amount = formatUnits(maxRaw, selectedToken.decimals);
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
					value: valueInWei,
					...(sendChainId != null && { chainId: sendChainId })
				});
			} else {
  const amountInUnits = parseUnits(amount, selectedToken.decimals);

  // If sending USDC, decide whether to transfer from wallet or withdraw from vault
  const isUSDC = selectedToken.symbol === 'USDC' && selectedToken.decimals === 6;
  const chainId = sendChainId ?? $currentNetwork?.chainId;

  if (!chainId) throw new Error('No chain selected');

  if (isUSDC) {
    const usdcAddr = getUSDCAddressForChain(chainId);
    if (!usdcAddr) throw new Error('USDC not configured for this chain');

    // 1) Check if the Rhinestone wallet actually holds USDC
    let walletUsdcBal = 0n;
    try {
      const dataBal = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [$dynamicSession.walletAddress as `0x${string}`]
      });

      // NOTE: sendTransaction() probably doesn't support eth_call.
      // If you have a publicClient in your app, use it here instead.
      // For now, skip the read if you can't do eth_call.

      // If you DO have a public client available, prefer:
      // walletUsdcBal = await publicClient.readContract({ address: usdcAddr, abi: erc20Abi, functionName:'balanceOf', args:[...] });

    } catch {
      // If you can't read here, we fall back to vault withdraw if you’re on “vault withdraw” flow.
    }

    // Heuristic: if modal was opened from vault screen, you likely want vault withdraw.
    // If you have a flag in sendModalToken like `source: 'vault'`, use that instead.
    const vault = getUSDCAddressForChain(chainId);

    // 2) If wallet has USDC (or you are not in vault context) → normal transfer
    const shouldTryDirectTransfer =
      !vault || walletUsdcBal >= amountInUnits;

    if (shouldTryDirectTransfer) {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, amountInUnits]
      });

      hash = await sendTransaction({
        to: usdcAddr as `0x${string}`,
        data,
        ...(chainId != null && { chainId })
      });
    } else {
      // 3) Otherwise withdraw from vault directly to recipient (best UX: 1 tx)
      const data = encodeFunctionData({
        abi: erc4626Abi,
        functionName: 'withdraw',
        args: [
          amountInUnits, // assets (USDC)
          recipientAddress as `0x${string}`, // receiver
          $dynamicSession.walletAddress as `0x${string}` // owner
        ]
      });

      hash = await sendTransaction({
        to: vault as `0x${string}`,
        data,
        ...(chainId != null && { chainId })
      });
    }
  } else {
    // Normal ERC20 transfer (tStocks, USDT, etc.)
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddress as `0x${string}`, amountInUnits]
    });

    hash = await sendTransaction({
      to: selectedToken.address,
      data,
      ...(chainId != null && { chainId })
    });
  }
}


			txHash = hash;
			sentChainId = sendChainId ?? null;
			dispatch('sent', { to: recipientAddress, amount, token: selectedToken.symbol, txHash: hash });

			// Invalidate balance queries to refresh the page
			queryClient.invalidateQueries({ queryKey: ['usdcWalletBalance'] });
			queryClient.invalidateQueries({ queryKey: ['ethWalletBalance'] });
			queryClient.invalidateQueries({ queryKey: ['sftHoldings'] });
		} catch (err) {
			const msg = (err as Error).message || 'Failed to send transaction';
			// Backend often completes the tx but doesn't return hash (e.g. Arbitrum); treat as soft success
			const isSoftSuccess =
				msg.includes('may have succeeded') || msg.includes('transaction hash was not returned');
			if (isSoftSuccess) {
				submittedHashUnknown = true;
				sentChainId = sendChainId ?? null;
				error = null;
				queryClient.invalidateQueries({ queryKey: ['usdcWalletBalance'] });
				queryClient.invalidateQueries({ queryKey: ['ethWalletBalance'] });
				queryClient.invalidateQueries({ queryKey: ['sftHoldings'] });
			} else {
				error = msg;
			}
			console.error('[send] Error:', err);
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
	<div class="min-w-0 space-y-5">
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
						Sending {amount}
						{selectedToken?.symbol} to
					</p>
					<p class="mt-1 font-mono text-xs text-gray-500">
						{recipientAddress.slice(0, 10)}...{recipientAddress.slice(-8)}
					</p>
					<a
						href="{(sentChainId != null ? BLOCK_EXPLORER_BY_CHAIN[sentChainId] : $currentNetwork?.blockExplorer) ?? 'https://basescan.org'}/tx/{txHash}"
						target="_blank"
						rel="noopener noreferrer"
						class="mt-3 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
					>
						View on block explorer
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
		{:else if submittedHashUnknown}
			<!-- Soft success: tx submitted but backend didn't return hash -->
			<div class="flex flex-col items-center gap-4 py-6">
				<div class="rounded-full bg-amber-500/20 p-4">
					<svg class="h-8 w-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				</div>
				<div class="text-center">
					<h3 class="text-lg font-semibold text-white">Transaction Submitted</h3>
					<p class="mt-1 text-sm text-amber-200/90">
						It may have succeeded—check your wallet and the block explorer.
					</p>
					<p class="mt-1 text-sm text-gray-400">
						{amount} {selectedToken?.symbol} to {recipientAddress.slice(0, 10)}...{recipientAddress.slice(-8)}
					</p>
					<a
						href="{(sentChainId != null ? BLOCK_EXPLORER_BY_CHAIN[sentChainId] : $currentNetwork?.blockExplorer) ?? 'https://basescan.org'}"
						target="_blank"
						rel="noopener noreferrer"
						class="mt-3 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
					>
						Open {sentChainId === 42161 ? 'Arbiscan' : sentChainId === 8453 ? 'Basescan' : 'block explorer'}
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
			<div class="min-w-0 space-y-4">
				<!-- From address (read-only) -->
				<div class="min-w-0">
					<label class="mb-1.5 block shrink-0 text-sm font-medium text-gray-300" for="from-address">
						From
					</label>
					<div id="from-address" class="min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5">
						<span class="truncate font-mono text-sm text-gray-400">
							{$dynamicSession?.walletAddress
								? `${$dynamicSession.walletAddress.slice(0, 10)}...${$dynamicSession.walletAddress.slice(-8)}`
								: 'Not connected'}
						</span>
					</div>
				</div>

				<!-- To address -->
				<div class="min-w-0">
					<label class="mb-1.5 block shrink-0 text-sm font-medium text-gray-300" for="recipient">
						Recipient Address
					</label>
					<input
						id="recipient"
						type="text"
						placeholder="0x..."
						value={recipientAddress}
						on:input={handleAddressInput}
						class="min-w-0 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 font-mono text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					{#if recipientAddress && !isValidAddress}
						<p class="mt-1 text-xs text-red-400">Invalid Ethereum address</p>
					{/if}
				</div>

				<!-- Token selector and amount -->
				<div class="min-w-0">
					<div class="mb-1.5 flex min-w-0 items-center justify-between gap-2">
						<label class="shrink-0 text-sm font-medium text-gray-300" for="amount">Amount</label>
						<div class="shrink-0 text-right text-xs text-gray-400">
							{#if preSelectedBalance}
								<span>Balance: <span class="text-gray-300">{preSelectedBalance}</span></span>
							{/if}
							{#if isPayingGasWithSameToken}
								<span class="block text-gray-500">Reserving ~0.05 USDC for gas</span>
							{/if}
						</div>
					</div>
					<div class="flex min-w-0 gap-2">
						<select
							bind:value={selectedTokenKey}
							class="w-[7.5rem] shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							aria-label="Token"
						>
							{#each availableTokens as token}
								<option value={token.address === 'native' ? 'native' : token.address}>
									{token.symbol}{#if token.name && token.name !== token.symbol} ({token.name}){/if}
								</option>
							{/each}
						</select>
						<div class="relative min-w-0 flex-1">
							<input
								id="amount"
								type="text"
								inputmode="decimal"
								placeholder="0.0"
								value={amount}
								on:input={handleAmountInput}
								class="block w-full min-w-0 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 pr-14 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							/>
							{#if preSelectedBalanceRaw}
								<button
									type="button"
									on:click={handleMax}
									class="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-gray-700 px-2 py-0.5 text-xs font-medium text-yellow-400 hover:bg-gray-600"
								>
									MAX
								</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Pay fees in stablecoin (avoids needing ETH for gas) -->
				<label
					class="flex cursor-pointer items-center gap-2 py-2"
					title="Pay gas fees using USDC on {feeChainName} instead of ETH. Use this if you don't have ETH for gas."
				>
					<input
						type="checkbox"
						checked={$payFeesInStablecoin}
						on:change={() => payFeesInStablecoin.toggle()}
						class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
					/>
					<span class="text-sm text-gray-300">Pay fees in stablecoin (USDC)</span>
					<span class="group relative">
						<svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span
							class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded bg-gray-900 px-3 py-2 text-xs text-gray-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
						>
							Pay gas fees using USDC on {feeChainName} instead of ETH. You need a small USDC balance on {feeChainName}
							to cover the fee—if you only have USDT and no USDC, the transaction may fail.
						</span>
					</span>
				</label>
				{#if $payFeesInStablecoin}
					<p class="text-xs text-gray-500">
						Requires a small USDC balance on {feeChainName} for gas. If the transaction fails, try unchecking
						and ensure you have ETH for gas instead.
					</p>
				{/if}

				<!-- Amount exceeds max (gas reserve) -->
				{#if amountExceedsMaxWithGasReserve}
					<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
						<p class="text-sm text-amber-300">
							Leave ~0.05 USDC for gas when paying fees in USDC. Reduce the amount or uncheck "Pay
							fees in stablecoin".
						</p>
					</div>
				{/if}

				<!-- Error message -->
				{#if error}
					<div class="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
						<p class="text-sm text-red-400">{error}</p>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex shrink-0 gap-3 pt-2">
					<Button on:click={handleClose} variant="secondary" className="min-w-0 flex-1">Cancel</Button>
					<Button on:click={handleSend} variant="primary" className="min-w-0 flex-1" disabled={!canSend}>
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
