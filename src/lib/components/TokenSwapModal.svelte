<script lang="ts">
	import { wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import {
		showTokenSwapModal,
		swapModalToken,
		closeTokenSwapModal,
		type SwapModalToken
	} from '$lib/stores/dynamicStore';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { readContracts } from '@wagmi/core';
	import { erc20Abi, formatUnits, parseUnits } from 'viem';
	import {
		TOKEN_MIGRATION_MAPPINGS,
		getMigrationMappingByAddress
	} from '$lib/config/tokenMigration';
	import { TOKENS } from '$lib/config/tokens';
	import Button from './ui/Button.svelte';

	const queryClient = useQueryClient();

	// Selected old token address
	let selectedOldTokenAddress: string | null = null;
	let swapAmount = '';
	let isExecuting = false;
	let swapError: string | null = null;
	let liquidityWarning = false;

	// Hardcoded liquidity amounts (these would normally come from checking the swap order)
	// For now we simulate inventory availability
	const SIMULATED_LIQUIDITY: Record<string, number> = {
		tNVDA: 100,
		tAMZN: 150,
		tTSLA: 200,
		tMSTR: 50,
		tIAU: 500,
		tCOIN: 300,
		tSPLG: 400,
		tSIVR: 250,
		tCRCL: 100,
		tBMNR: 75,
		tPPLT: 150
	};

	// When modal opens with a pre-selected token, set it
	$: if ($showTokenSwapModal && $swapModalToken && !selectedOldTokenAddress) {
		selectedOldTokenAddress = $swapModalToken.address;
	}

	// Get current mapping based on selection
	$: currentMapping = selectedOldTokenAddress
		? getMigrationMappingByAddress(selectedOldTokenAddress)
		: null;

	// Query to fetch all old token balances for the user
	$: oldTokenBalancesQuery = createQuery({
		queryKey: ['oldTokenBalances', $walletAddress, $currentNetwork?.chainId],
		enabled: !!($isAuthenticated && $walletAddress && $wagmiConfig && $showTokenSwapModal),
		staleTime: 30_000,
		queryFn: async () => {
			if (!$walletAddress || !$wagmiConfig) return [];

			const contracts = TOKEN_MIGRATION_MAPPINGS.map((mapping) => ({
				abi: erc20Abi,
				address: mapping.oldToken.address as `0x${string}`,
				functionName: 'balanceOf' as const,
				args: [$walletAddress as `0x${string}`]
			}));

			try {
				const results = await readContracts($wagmiConfig, { contracts });

				return TOKEN_MIGRATION_MAPPINGS.map((mapping, index) => {
					const result = results[index];
					const balance = result.status === 'success' ? (result.result as bigint) : 0n;
					return {
						...mapping,
						balance,
						balanceFormatted: parseFloat(formatUnits(balance, mapping.oldToken.decimals))
					};
				}).filter((item) => item.balance > 0n);
			} catch (e) {
				console.error('Failed to fetch old token balances:', e);
				return [];
			}
		}
	});

	// Tokens with balance that user can swap
	$: oldTokensWithBalance = $oldTokenBalancesQuery.data ?? [];

	// Selected token data
	$: selectedTokenData = oldTokensWithBalance.find(
		(t) => t.oldToken.address.toLowerCase() === selectedOldTokenAddress?.toLowerCase()
	);

	// Available liquidity for selected token
	$: availableLiquidity = currentMapping
		? SIMULATED_LIQUIDITY[currentMapping.oldToken.symbol] ?? 0
		: 0;

	// Parse swap amount
	$: parsedSwapAmount = parseFloat(swapAmount) || 0;

	// Check if amount exceeds balance
	$: exceedsBalance = selectedTokenData
		? parsedSwapAmount > selectedTokenData.balanceFormatted
		: false;

	// Check if amount exceeds liquidity
	$: exceedsLiquidity = parsedSwapAmount > availableLiquidity;

	// Capped amount (limited by both balance and liquidity)
	$: maxSwappable = selectedTokenData
		? Math.min(selectedTokenData.balanceFormatted, availableLiquidity)
		: 0;

	// Handle token selection change
	function handleTokenSelect(address: string) {
		selectedOldTokenAddress = address;
		swapAmount = '';
		swapError = null;
		liquidityWarning = false;
	}

	// Handle amount input
	function handleAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		swapAmount = target.value;
		swapError = null;

		// Check if we need to show liquidity warning
		const amount = parseFloat(swapAmount) || 0;
		liquidityWarning = amount > availableLiquidity && availableLiquidity > 0;
	}

	// Set max amount (capped by liquidity)
	function handleMaxClick() {
		if (!selectedTokenData) return;

		const maxAmount = Math.min(selectedTokenData.balanceFormatted, availableLiquidity);
		swapAmount = maxAmount.toFixed(6);
		liquidityWarning = selectedTokenData.balanceFormatted > availableLiquidity;
	}

	// Cap to available liquidity
	function capToLiquidity() {
		if (parsedSwapAmount > availableLiquidity && availableLiquidity > 0) {
			swapAmount = availableLiquidity.toFixed(6);
			liquidityWarning = true;
		}
	}

	// Execute the swap
	async function handleSwap() {
		if (!selectedTokenData || !currentMapping || !$wagmiConfig || !$walletAddress) return;
		if (parsedSwapAmount <= 0) return;

		isExecuting = true;
		swapError = null;

		try {
			// This would normally call the actual swap contract
			// For now, we simulate a successful swap
			const swapAmountWei = parseUnits(swapAmount, currentMapping.oldToken.decimals);

			// TODO: Implement actual swap logic using the hardcoded swap order
			// This would involve:
			// 1. Approving the old token for the swap contract
			// 2. Calling the swap function with the order hash
			// 3. Waiting for the transaction to complete

			// Simulate success for now
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Log success (the actual implementation would use the transaction modal)
			console.log(
				`Successfully swapped ${swapAmount} ${currentMapping.oldToken.symbol} to ${currentMapping.newToken.symbol}`
			);

			// Invalidate balance queries
			queryClient.invalidateQueries({ queryKey: ['oldTokenBalances'] });
			queryClient.invalidateQueries({ queryKey: ['walletHoldings'] });

			// Close modal
			closeTokenSwapModal();
		} catch (error) {
			console.error('Swap failed:', error);
			swapError = error instanceof Error ? error.message : 'Swap failed';
		} finally {
			isExecuting = false;
		}
	}

	// Close and reset
	function handleClose() {
		selectedOldTokenAddress = null;
		swapAmount = '';
		swapError = null;
		liquidityWarning = false;
		closeTokenSwapModal();
	}

	// Get logo URL for token
	function getTokenLogo(address: string): string | undefined {
		return TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase())?.logoUrl;
	}
</script>

{#if $showTokenSwapModal}
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
		aria-labelledby="swap-modal-title"
	>
		<div
			class="relative overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
				<h3 id="swap-modal-title" class="text-lg font-semibold text-white">Swap Legacy Tokens</h3>
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
					<!-- What I Have (Old Token) -->
					<div class="space-y-2">
						<label class="text-sm font-medium text-gray-400">What I have</label>
						<div
							class="rounded-xl border border-white/5 bg-gray-800/60 px-4 py-3"
						>
							<!-- Token Dropdown -->
							<div class="mb-3">
								<select
									class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-3 py-2 text-white focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
									bind:value={selectedOldTokenAddress}
									on:change={(e) => handleTokenSelect(e.currentTarget.value)}
								>
									<option value="" disabled>Select token to swap</option>
									{#if $oldTokenBalancesQuery.isLoading}
										<option value="" disabled>Loading...</option>
									{:else if oldTokensWithBalance.length === 0}
										<option value="" disabled>No legacy tokens to swap</option>
									{:else}
										{#each oldTokensWithBalance as tokenData}
											<option value={tokenData.oldToken.address}>
												{tokenData.oldToken.symbol} - Balance: {tokenData.balanceFormatted.toFixed(
													4
												)}
											</option>
										{/each}
									{/if}
								</select>
							</div>

							<!-- Amount Input -->
							<div class="flex items-center gap-3">
								{#if selectedTokenData}
									<div class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-1.5">
										{#if getTokenLogo(selectedTokenData.oldToken.address)}
											<img
												src={getTokenLogo(selectedTokenData.oldToken.address)}
												alt={selectedTokenData.oldToken.symbol}
												class="h-6 w-6 rounded-full"
											/>
										{/if}
										<span class="font-medium text-white">{selectedTokenData.oldToken.symbol}</span>
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
										value={swapAmount}
										on:input={handleAmountInput}
										on:blur={capToLiquidity}
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
										{selectedTokenData.oldToken.symbol}
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
							<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 14l-7 7m0 0l-7-7m7 7V3"
								/>
							</svg>
						</div>
					</div>

					<!-- What I Get (New Wrapped Token) -->
					<div class="space-y-2">
						<label class="text-sm font-medium text-gray-400">What I get</label>
						<div
							class="rounded-xl border border-white/5 bg-gray-800/60 px-4 py-3"
						>
							<div class="flex items-center gap-3">
								{#if currentMapping}
									<div class="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-1.5">
										{#if getTokenLogo(currentMapping.oldToken.address)}
											<img
												src={getTokenLogo(currentMapping.oldToken.address)}
												alt={currentMapping.newToken.symbol}
												class="h-6 w-6 rounded-full"
											/>
										{/if}
										<span class="font-medium text-white">{currentMapping.newToken.symbol}</span>
									</div>
								{:else}
									<div class="rounded-lg bg-gray-700/50 px-3 py-1.5">
										<span class="text-gray-400">—</span>
									</div>
								{/if}
								<div class="flex-1 text-right">
									<span class="text-xl font-medium text-white">
										{parsedSwapAmount > 0 ? parsedSwapAmount.toFixed(6) : '0'}
									</span>
								</div>
							</div>

							{#if currentMapping}
								<div class="mt-2 text-xs text-gray-500">
									{currentMapping.newToken.name}
								</div>
							{/if}
						</div>
					</div>

					<!-- Liquidity Warning -->
					{#if liquidityWarning}
						<div
							class="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-xs text-blue-300"
						>
							<div class="flex items-start gap-2">
								<svg
									class="mt-0.5 h-4 w-4 flex-shrink-0"
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
								<div>
									<p class="font-medium">Not enough inventory to fully swap right now.</p>
									<p class="mt-0.5 text-blue-300/80">
										Inventory will be periodically topped up. Please swap now and come back again
										later.
									</p>
								</div>
							</div>
						</div>
					{/if}

					<!-- Error -->
					{#if swapError}
						<div class="rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">
							{swapError}
						</div>
					{/if}

					<!-- Swap Info -->
					<div class="rounded-lg bg-gray-800/40 px-4 py-3 text-xs text-gray-400">
						<div class="flex justify-between">
							<span>Rate</span>
							<span class="text-white">1:1</span>
						</div>
						{#if currentMapping}
							<div class="mt-1 flex justify-between">
								<span>Available liquidity</span>
								<span class="text-white">{availableLiquidity.toFixed(2)} {currentMapping.oldToken.symbol}</span>
							</div>
						{/if}
					</div>

					<!-- Action Button -->
					<Button
						variant="primary"
						size="lg"
						className="w-full rounded-xl py-4 text-base font-semibold"
						disabled={!selectedTokenData ||
							parsedSwapAmount <= 0 ||
							exceedsBalance ||
							isExecuting ||
							oldTokensWithBalance.length === 0}
						on:click={handleSwap}
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
						{:else if oldTokensWithBalance.length === 0}
							No legacy tokens to swap
						{:else if !selectedTokenData}
							Select a token
						{:else if parsedSwapAmount <= 0}
							Enter amount
						{:else if exceedsBalance}
							Insufficient balance
						{:else}
							Swap to {currentMapping?.newToken.symbol ?? 'Wrapped'}
						{/if}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
