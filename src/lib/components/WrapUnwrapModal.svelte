<script lang="ts">
	import { get } from 'svelte/store';
	import { wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import {
		showWrapUnwrapModal,
		wrapUnwrapMode,
		wrapUnwrapModalToken,
		closeWrapUnwrapModal
	} from '$lib/stores/dynamicStore';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { readContracts, waitForTransactionReceipt } from '@wagmi/core';
	import { erc20Abi, formatUnits, parseUnits } from 'viem';
	import {
		TOKEN_WRAPPING_MAPPINGS,
		getWrappingMappingByWrappedAddress,
		getWrappingMappingByUnwrappedAddress,
		getAllUnwrappedTokenAddresses
	} from '$lib/config/tokenWrapping';
	import { wrapToken, unwrapToken, previewWrap, previewUnwrap } from '$lib/services/wrapService';
	import { TOKENS } from '$lib/config/tokens';
	import Button from './ui/Button.svelte';

	const queryClient = useQueryClient();

	// State
	let selectedTokenAddress: string | null = null;
	let amount = '';
	let isExecuting = false;
	let error: string | null = null;
	let previewAmount: string | null = null;

	// When modal opens with a pre-selected token, set it
	$: if ($showWrapUnwrapModal && $wrapUnwrapModalToken && !selectedTokenAddress) {
		selectedTokenAddress = $wrapUnwrapModalToken.address;
	}

	// Mode-specific labels
	$: isWrapMode = $wrapUnwrapMode === 'wrap';
	$: modalTitle = isWrapMode ? 'Wrap Tokens' : 'Unwrap Tokens';
	$: actionButtonText = isWrapMode ? 'Wrap' : 'Unwrap';
	$: fromLabel = isWrapMode ? 'Unwrapped tokens' : 'Wrapped tokens';
	$: toLabel = isWrapMode ? 'Wrapped tokens' : 'Unwrapped tokens';

	// Get current mapping based on selection and mode
	$: currentMapping = (() => {
		if (!selectedTokenAddress) return null;
		if (isWrapMode) {
			return getWrappingMappingByUnwrappedAddress(selectedTokenAddress);
		} else {
			return getWrappingMappingByWrappedAddress(selectedTokenAddress);
		}
	})();

	// Query token balances based on mode
	$: tokenBalancesQuery = createQuery({
		queryKey: ['wrapUnwrapBalances', $walletAddress, $currentNetwork?.chainId, $wrapUnwrapMode],
		enabled: !!($isAuthenticated && $walletAddress && $wagmiConfig && $showWrapUnwrapModal),
		staleTime: 30_000,
		queryFn: async () => {
			if (!$walletAddress || !$wagmiConfig) return [];

			// Get addresses based on mode
			const addresses = isWrapMode
				? getAllUnwrappedTokenAddresses()
				: TOKEN_WRAPPING_MAPPINGS.map((m) => m.wrappedToken.address);

			const contracts = addresses.map((address) => ({
				abi: erc20Abi,
				address: address as `0x${string}`,
				functionName: 'balanceOf' as const,
				args: [$walletAddress as `0x${string}`]
			}));

			try {
				const results = await readContracts($wagmiConfig, { contracts });

				return addresses
					.map((address, index) => {
						const result = results[index];
						const balance = result.status === 'success' ? (result.result as bigint) : 0n;
						const mapping = isWrapMode
							? getWrappingMappingByUnwrappedAddress(address)
							: getWrappingMappingByWrappedAddress(address);

						if (!mapping) return null;

						const tokenInfo = isWrapMode ? mapping.unwrappedToken : mapping.wrappedToken;
						const targetInfo = isWrapMode ? mapping.wrappedToken : mapping.unwrappedToken;

						return {
							address,
							balance,
							balanceFormatted: parseFloat(formatUnits(balance, tokenInfo.decimals)),
							symbol: tokenInfo.symbol,
							name: tokenInfo.name,
							decimals: tokenInfo.decimals,
							targetAddress: targetInfo.address,
							targetSymbol: targetInfo.symbol
						};
					})
					.filter((item): item is NonNullable<typeof item> => item !== null && item.balance > 0n);
			} catch (e) {
				console.error('Failed to fetch token balances:', e);
				return [];
			}
		}
	});

	// Tokens with balance
	$: tokensWithBalance = $tokenBalancesQuery.data ?? [];

	// Selected token data
	$: selectedTokenData = tokensWithBalance.find(
		(t) => t.address.toLowerCase() === selectedTokenAddress?.toLowerCase()
	);

	// Parse amount
	$: parsedAmount = parseFloat(amount) || 0;

	// Check if amount exceeds balance
	$: exceedsBalance = selectedTokenData ? parsedAmount > selectedTokenData.balanceFormatted : false;

	// Update preview when amount changes
	$: if (parsedAmount > 0 && selectedTokenData && currentMapping) {
		updatePreview();
	} else {
		previewAmount = null;
	}

	async function updatePreview() {
		if (!selectedTokenData || !currentMapping || parsedAmount <= 0) {
			previewAmount = null;
			return;
		}

		try {
			const amountWei = parseUnits(amount, selectedTokenData.decimals);

			if (isWrapMode) {
				const shares = await previewWrap(
					selectedTokenData.address as `0x${string}`,
					amountWei
				);
				previewAmount = formatUnits(shares, currentMapping.wrappedToken.decimals);
			} else {
				const assets = await previewUnwrap(
					selectedTokenData.address as `0x${string}`,
					amountWei
				);
				previewAmount = formatUnits(assets, currentMapping.unwrappedToken.decimals);
			}
		} catch {
			// Preview failed, assume 1:1 ratio
			previewAmount = amount;
		}
	}

	// Handle token selection
	function handleTokenSelect(address: string) {
		selectedTokenAddress = address;
		amount = '';
		error = null;
		previewAmount = null;
	}

	// Handle amount input
	function handleAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		amount = target.value;
		error = null;
	}

	// Set max amount
	function handleMaxClick() {
		if (!selectedTokenData) return;
		amount = selectedTokenData.balanceFormatted.toFixed(6);
	}

	// Execute wrap or unwrap
	async function handleExecute() {
		if (!selectedTokenData || !currentMapping || !$walletAddress) return;
		if (parsedAmount <= 0) return;

		isExecuting = true;
		error = null;

		try {
			const amountWei = parseUnits(amount, selectedTokenData.decimals);
			const config = get(wagmiConfig);

			let hash: `0x${string}`;

			if (isWrapMode) {
				hash = await wrapToken(
					selectedTokenData.address as `0x${string}`,
					amountWei,
					$walletAddress as `0x${string}`
				);
			} else {
				hash = await unwrapToken(
					selectedTokenData.address as `0x${string}`,
					amountWei,
					$walletAddress as `0x${string}`,
					$walletAddress as `0x${string}`
				);
			}

			// Wait for transaction confirmation
			if (config) {
				await waitForTransactionReceipt(config, { hash });
			}

			// Invalidate queries to refresh balances
			queryClient.invalidateQueries({ queryKey: ['wrapUnwrapBalances'] });
			queryClient.invalidateQueries({ queryKey: ['walletHoldings'] });
			queryClient.invalidateQueries({ queryKey: ['dashboardUnwrappedTokenBalances'] });

			// Close modal on success
			handleClose();
		} catch (e) {
			console.error('Wrap/unwrap failed:', e);
			error = e instanceof Error ? e.message : 'Transaction failed';
		} finally {
			isExecuting = false;
		}
	}

	// Close and reset
	function handleClose() {
		selectedTokenAddress = null;
		amount = '';
		error = null;
		previewAmount = null;
		closeWrapUnwrapModal();
	}

	// Get logo URL for token
	function getTokenLogo(symbol: string): string | undefined {
		return TOKENS.find((t) => t.symbol === symbol)?.logoUrl;
	}
</script>

{#if $showWrapUnwrapModal}
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 z-[10040] h-full w-full bg-black/60 backdrop-blur-sm"
		on:click={handleClose}
		aria-label="Close modal overlay"
	/>

	<!-- Modal -->
	<div
		class="fixed left-1/2 top-1/2 z-[10050] mx-4 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
		role="dialog"
		aria-modal="true"
		aria-labelledby="wrap-unwrap-modal-title"
	>
		<div class="relative overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
				<h3 id="wrap-unwrap-modal-title" class="text-lg font-semibold text-white">{modalTitle}</h3>
				<button
					type="button"
					on:click={handleClose}
					class="rounded-full p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="p-6">
				<div class="space-y-4">
					<!-- From Section -->
					<div class="space-y-2">
						<label for="wrap-from-token" class="text-sm font-medium text-gray-400">{fromLabel}</label
						>
						<div class="rounded-xl border border-white/5 bg-gray-800/60 px-4 py-3">
							<!-- Token Dropdown -->
							<div class="mb-3">
								<select
									id="wrap-from-token"
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
									bind:value={selectedTokenAddress}
									on:change={(e) => handleTokenSelect(e.currentTarget.value)}
								>
									<option value="" disabled>Select token</option>
									{#if $tokenBalancesQuery.isLoading}
										<option value="" disabled>Loading...</option>
									{:else if tokensWithBalance.length === 0}
										<option value="" disabled>No tokens available</option>
									{:else}
										{#each tokensWithBalance as tokenData}
											<option value={tokenData.address}>
												{tokenData.symbol} - Balance: {tokenData.balanceFormatted.toFixed(4)}
											</option>
										{/each}
									{/if}
								</select>
							</div>

							<!-- Amount Input -->
							<div class="flex items-center gap-3">
								{#if selectedTokenData}
									<div class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-1.5">
										{#if getTokenLogo(selectedTokenData.symbol)}
											<img
												src={getTokenLogo(selectedTokenData.symbol)}
												alt={selectedTokenData.symbol}
												class="h-6 w-6 rounded-full"
											/>
										{/if}
										<span class="font-medium text-white">{selectedTokenData.symbol}</span>
									</div>
								{:else}
									<div class="rounded-lg bg-gray-700/50 px-3 py-1.5">
										<span class="text-gray-400">Select token</span>
									</div>
								{/if}
								<div class="flex-1 text-right">
									<input
										type="text"
										inputmode="decimal"
										placeholder="0"
										value={amount}
										on:input={handleAmountInput}
										disabled={!selectedTokenData}
										class="w-full bg-transparent text-right text-xl font-medium text-white placeholder-gray-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
									/>
								</div>
							</div>

							<!-- Balance & Max -->
							{#if selectedTokenData}
								<div class="mt-2 flex items-center justify-between text-xs">
									<span class="text-gray-500">
										Balance: {selectedTokenData.balanceFormatted.toFixed(4)}
										{selectedTokenData.symbol}
									</span>
									<button
										type="button"
										on:click={handleMaxClick}
										class="rounded bg-gray-700/50 px-1.5 py-0.5 text-[10px] text-gray-400 transition hover:bg-gray-600 hover:text-white"
									>
										MAX
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Arrow -->
					<div class="flex justify-center">
						<div class="rounded-full border border-white/10 bg-gray-800 p-2">
							<svg
								class="h-4 w-4 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 14l-7 7m0 0l-7-7m7 7V3"
								/>
							</svg>
						</div>
					</div>

					<!-- To Section -->
					<div class="space-y-2">
						<span class="text-sm font-medium text-gray-400">{toLabel}</span>
						<div class="rounded-xl border border-white/5 bg-gray-800/60 px-4 py-3">
							<div class="flex items-center gap-3">
								{#if currentMapping}
									{@const targetToken = isWrapMode
										? currentMapping.wrappedToken
										: currentMapping.unwrappedToken}
									<div class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-1.5">
										{#if getTokenLogo(targetToken.symbol)}
											<img
												src={getTokenLogo(targetToken.symbol)}
												alt={targetToken.symbol}
												class="h-6 w-6 rounded-full"
											/>
										{/if}
										<span class="font-medium text-white">{targetToken.symbol}</span>
									</div>
								{:else}
									<div class="rounded-lg bg-gray-700/50 px-3 py-1.5">
										<span class="text-gray-400">-</span>
									</div>
								{/if}
								<div class="flex-1 text-right">
									<span class="text-xl font-medium text-white">
										{previewAmount
											? parseFloat(previewAmount).toFixed(6)
											: parsedAmount > 0
												? parsedAmount.toFixed(6)
												: '0'}
									</span>
								</div>
							</div>

							{#if currentMapping}
								{@const targetToken = isWrapMode
									? currentMapping.wrappedToken
									: currentMapping.unwrappedToken}
								<div class="mt-2 text-xs text-gray-500">
									{targetToken.name}
								</div>
							{/if}
						</div>
					</div>

					<!-- Error -->
					{#if error}
						<div class="rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">
							{error}
						</div>
					{/if}

					<!-- Info -->
					<div class="rounded-lg bg-gray-800/40 px-4 py-3 text-xs text-gray-400">
						<div class="flex justify-between">
							<span>Exchange Rate</span>
							<span class="text-white">1:1</span>
						</div>
						<div class="mt-1 text-gray-500">
							{isWrapMode
								? 'Wrap your underlying tokens into the ERC4626 vault for trading.'
								: 'Unwrap your vault shares back to the underlying tokens.'}
						</div>
					</div>

					<!-- Action Button -->
					<Button
						variant="primary"
						size="lg"
						className="w-full rounded-xl py-4 text-base font-semibold"
						disabled={!selectedTokenData ||
							parsedAmount <= 0 ||
							exceedsBalance ||
							isExecuting ||
							tokensWithBalance.length === 0}
						on:click={handleExecute}
					>
						{#if isExecuting}
							<span class="flex items-center justify-center gap-2">
								<svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
								Processing...
							</span>
						{:else if tokensWithBalance.length === 0}
							No tokens available
						{:else if !selectedTokenData}
							Select a token
						{:else if parsedAmount <= 0}
							Enter amount
						{:else if exceedsBalance}
							Insufficient balance
						{:else}
							{actionButtonText} {selectedTokenData?.symbol ?? ''}
						{/if}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
