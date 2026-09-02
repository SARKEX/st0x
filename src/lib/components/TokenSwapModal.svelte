<script lang="ts">
	import { get } from 'svelte/store';
	import { wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import { currentNetwork } from '$lib/stores';
	import {
		showTokenSwapModal,
		swapModalToken,
		closeTokenSwapModal
	} from '$lib/stores/dynamicStore';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { readContracts } from '@wagmi/core';
	import { erc20Abi, formatUnits, parseUnits } from 'viem';
	import {
		TOKEN_MIGRATION_MAPPINGS,
		getMigrationMappingByAddress
	} from '$lib/config/tokenMigration';
	import { getTokenByAnyAddress } from '$lib/config/tokens';
	import Button from './ui/Button.svelte';
	import { getLoadBalancedClient } from '$lib/clients/raindex';
	import type { Network } from '$lib/config/network';
	import transactionStore from '$lib/stores/transaction';
	import { TransactionErrorMessage } from '$lib/types/errors';
	import { OrderV4_ABI, normalizeOrderData } from '$lib/utils/orderbook';
	import type { TakeOrdersParams, TokenInfo } from '$lib/types/transactions';
	import { AbiCoder } from 'ethers';
	import { Float } from '@rainlanguage/float';
	import type { TakeOrdersConfigV5, TakeOrderConfigV4, OrderV4 } from '@rainlanguage/raindex';
	import { track } from '$lib/services/analytics';
	import {
		isLegacyTokenCertificationExpired,
		legacyTokenCertificationExpiredMessage
	} from '$lib/utils/legacyTokenCertification';
	import { migrationPayCapWei, migrationReceiveWei } from '$lib/utils/migrationSwapQuote';

	const queryClient = useQueryClient();

	// Selected old token address
	let selectedOldTokenAddress: string | null = null;
	let swapAmount = '';
	let liquidityWarning = false;

	type MigrationOrderQuote = {
		/** Maker output inventory in wrapped-token base units. */
		maxOutputWei: bigint;
		ioRatio: string;
	};

	const EMPTY_MIGRATION_QUOTE: MigrationOrderQuote = { maxOutputWei: 0n, ioRatio: '1' };

	function parseMigrationOrderQuote(
		mapping: (typeof TOKEN_MIGRATION_MAPPINGS)[0],
		quote:
			| {
					success?: boolean;
					data?: { maxOutput?: string; formattedRatio?: string };
			  }
			| undefined
	): MigrationOrderQuote {
		if (!quote?.success || !quote.data?.maxOutput || !quote.data.formattedRatio) {
			return EMPTY_MIGRATION_QUOTE;
		}

		const maxOutputFloat = Float.fromHex(quote.data.maxOutput as `0x${string}`);
		if (maxOutputFloat.error || !maxOutputFloat.value) return EMPTY_MIGRATION_QUOTE;

		const fixedResult = maxOutputFloat.value.toFixedDecimalLossy(mapping.newToken.decimals);
		if (fixedResult.error || !fixedResult.value) return EMPTY_MIGRATION_QUOTE;

		const fdValue = fixedResult.value as unknown as Record<string, unknown>;
		if (typeof fdValue?.value !== 'string') return EMPTY_MIGRATION_QUOTE;

		return {
			maxOutputWei: BigInt(fdValue.value),
			ioRatio: quote.data.formattedRatio
		};
	}

	/** Fetch liquidity and the maker IO ratio for a migration swap order. */
	async function fetchMigrationOrderQuote(
		mapping: (typeof TOKEN_MIGRATION_MAPPINGS)[0],
		network: Network
	): Promise<MigrationOrderQuote> {
		if (!mapping.swapOrderHash) return EMPTY_MIGRATION_QUOTE;

		const client = await getLoadBalancedClient(network);
		const ordersResult = await client.getOrders(
			[network.id],
			{ active: true, owners: [], orderHash: mapping.swapOrderHash as `0x${string}` },
			1
		);

		if (ordersResult.error) {
			throw new Error(`Failed to fetch order: ${ordersResult.error.readableMsg}`);
		}
		if (!ordersResult.value?.orders.length) return EMPTY_MIGRATION_QUOTE;

		const quotesResult = await ordersResult.value.orders[0].getQuotes();
		if (quotesResult.error) {
			throw new Error(`Failed to fetch quotes: ${quotesResult.error.readableMsg}`);
		}
		if (!quotesResult.value?.length) return EMPTY_MIGRATION_QUOTE;

		return parseMigrationOrderQuote(mapping, quotesResult.value[0]);
	}

	// Legacy OARV tokens require an active on-chain certification window to transfer.
	$: legacyCertificationQuery = createQuery({
		queryKey: ['legacyTokenCertification', $currentNetwork?.chainId, selectedOldTokenAddress],
		enabled: !!($currentNetwork && $showTokenSwapModal && selectedOldTokenAddress),
		staleTime: 30_000,
		queryFn: async () => {
			if (!selectedOldTokenAddress) return false;
			return isLegacyTokenCertificationExpired(selectedOldTokenAddress as `0x${string}`);
		}
	});

	$: legacyCertificationExpired = $legacyCertificationQuery.data === true;

	// Query to fetch liquidity for the currently selected token only
	$: swapLiquidityQuery = createQuery({
		queryKey: ['swapOrderLiquidity', $currentNetwork?.chainId, currentMapping?.swapOrderHash],
		enabled: !!($currentNetwork && $showTokenSwapModal && currentMapping?.swapOrderHash),
		staleTime: 10_000,
		retry: 3,
		retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
		refetchInterval: 15_000,
		refetchOnMount: 'always' as const,
		refetchOnWindowFocus: true,
		refetchIntervalInBackground: false,
		queryFn: async () => {
			const network = $currentNetwork;
			if (!network || !currentMapping) return EMPTY_MIGRATION_QUOTE;
			return fetchMigrationOrderQuote(currentMapping, network);
		}
	});

	// When modal opens with a pre-selected token, set it
	$: if ($showTokenSwapModal && $swapModalToken && !selectedOldTokenAddress) {
		selectedOldTokenAddress = $swapModalToken.address;
	}

	// Track modal open (guard to fire only once per open)
	let hasTrackedModalOpen = false;
	$: if ($showTokenSwapModal && !hasTrackedModalOpen) {
		hasTrackedModalOpen = true;
		track('legacy_swap_modal_opened', {
			pre_selected_token: $swapModalToken?.symbol
		});
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

	// Pre-selected token data (from swapModalToken when modal is opened for a specific token)
	$: preSelectedTokenData =
		$swapModalToken && currentMapping
			? {
					...currentMapping,
					balance: $swapModalToken.balanceRaw ?? 0n,
					balanceFormatted: parseFloat($swapModalToken.balance ?? '0')
				}
			: null;

	// Combined list: include pre-selected token if not already in balance list
	$: tokensToShow = (() => {
		const balanceTokens = oldTokensWithBalance;
		if (!preSelectedTokenData) return balanceTokens;

		// Check if pre-selected token is already in balance list
		const alreadyInList = balanceTokens.some(
			(t) =>
				t.oldToken.address.toLowerCase() === preSelectedTokenData.oldToken.address.toLowerCase()
		);
		if (alreadyInList) return balanceTokens;

		// Add pre-selected token to the list
		return [preSelectedTokenData, ...balanceTokens];
	})();

	// Selected token data - check tokensToShow first, then fall back to preSelectedTokenData
	$: selectedTokenData =
		tokensToShow.find(
			(t) => t.oldToken.address.toLowerCase() === selectedOldTokenAddress?.toLowerCase()
		) ??
		(selectedOldTokenAddress &&
		preSelectedTokenData?.oldToken.address.toLowerCase() === selectedOldTokenAddress.toLowerCase()
			? preSelectedTokenData
			: undefined);

	// Available maker output (wrapped) and derived legacy pay cap for input controls.
	$: maxOutputWei = $swapLiquidityQuery.data?.maxOutputWei ?? 0n;
	$: swapIoRatio = $swapLiquidityQuery.data?.ioRatio ?? '1';
	$: availablePayCapWei = migrationPayCapWei(maxOutputWei, swapIoRatio);
	$: availablePayLiquidity = (() => {
		if (!currentMapping || availablePayCapWei <= 0n) return 0;
		return parseFloat(formatUnits(availablePayCapWei, currentMapping.oldToken.decimals));
	})();
	$: swapRateLabel = (() => {
		const ratio = Number(swapIoRatio);
		if (!Number.isFinite(ratio) || ratio <= 0) return '1:1';
		if (Math.abs(ratio - 1) < 0.0001) return '1:1';
		return `1 new ≈ ${ratio.toFixed(6).replace(/\.?0+$/, '')} old`;
	})();

	// Parse swap amount
	$: parsedSwapAmount = parseFloat(swapAmount) || 0;
	$: estimatedReceiveAmount = (() => {
		if (parsedSwapAmount <= 0 || !currentMapping) return 0;
		try {
			const payWei = parseUnits(swapAmount || '0', currentMapping.oldToken.decimals);
			const recvWei = migrationReceiveWei(payWei, swapIoRatio);
			return parseFloat(formatUnits(recvWei, currentMapping.newToken.decimals));
		} catch {
			return 0;
		}
	})();

	// Check if amount exceeds balance
	$: exceedsBalance = selectedTokenData
		? parsedSwapAmount > selectedTokenData.balanceFormatted
		: false;

	// Handle token selection change
	function handleTokenSelect(address: string) {
		selectedOldTokenAddress = address;
		swapAmount = '';
		liquidityWarning = false;
		const mapping = getMigrationMappingByAddress(address);
		track('legacy_swap_token_selected', {
			old_token_symbol: mapping?.oldToken.symbol,
			new_token_symbol: mapping?.newToken.symbol
		});
	}

	// Handle amount input (respect token decimals)
	function handleAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const decimals = currentMapping?.oldToken.decimals ?? 18;
		// Strip to digits and at most one decimal point
		const raw = target.value.replace(/[^\d.]/g, '');
		const firstDot = raw.indexOf('.');
		const value =
			firstDot === -1
				? raw
				: raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');

		if (value === '' || value === '.') {
			swapAmount = value;
		} else {
			const parts = value.split('.');
			swapAmount =
				parts.length === 1 || parts[1].length <= decimals
					? value
					: `${parts[0]}.${parts[1].slice(0, decimals)}`;
		}

		// Check if we need to show liquidity warning (legacy pay vs pay cap)
		const amount = parseFloat(swapAmount) || 0;
		liquidityWarning = amount > availablePayLiquidity && availablePayLiquidity > 0;
	}

	/** Format balance/amount for display using viem (bigint → string with token decimals) */
	function formatBalance(value: bigint, decimals: number): string {
		return formatUnits(value, decimals);
	}

	/** Format a number for display (e.g. estimated receive) using viem to avoid float noise */
	function formatNumberWithDecimals(value: number, decimals: number): string {
		try {
			const wei = parseUnits(value.toFixed(decimals), decimals);
			return formatUnits(wei, decimals);
		} catch {
			return '0';
		}
	}

	// Set max amount (capped by legacy pay liquidity derived from wrapped maxOutput)
	function handleMaxClick() {
		if (!selectedTokenData || !currentMapping) return;

		const decimals = selectedTokenData.oldToken.decimals;
		const maxWei =
			selectedTokenData.balance < availablePayCapWei
				? selectedTokenData.balance
				: availablePayCapWei;
		swapAmount = formatUnits(maxWei, decimals);
		liquidityWarning = selectedTokenData.balance > availablePayCapWei && availablePayCapWei > 0n;
	}

	// Cap to available legacy pay liquidity
	function capToLiquidity() {
		if (!currentMapping || availablePayCapWei <= 0n) return;
		try {
			const payWei = parseUnits(swapAmount || '0', currentMapping.oldToken.decimals);
			if (payWei <= availablePayCapWei) return;
			swapAmount = formatUnits(availablePayCapWei, currentMapping.oldToken.decimals);
			liquidityWarning = true;
		} catch {
			return;
		}
	}

	// Execute the swap by taking the migration order (same flow as market order)
	async function handleSwap() {
		if (!selectedTokenData || !currentMapping || !$wagmiConfig || !$walletAddress) return;
		if (parsedSwapAmount <= 0) return;
		if (!currentMapping.swapOrderHash) {
			transactionStore.transactionError(
				'This token is not yet available for migration.' as TransactionErrorMessage
			);
			return;
		}

		const network = get(currentNetwork);
		if (!network?.id) {
			transactionStore.transactionError('Network not available' as TransactionErrorMessage);
			return;
		}

		// Capture values before closing modal (handleClose resets state)
		const mapping = currentMapping;
		const swapAmountStr = swapAmount;

		track('legacy_swap_initiated', {
			old_token_symbol: mapping.oldToken.symbol,
			new_token_symbol: mapping.newToken.symbol,
			amount: parsedSwapAmount,
			had_liquidity_warning: liquidityWarning
		});

		// Close the form modal - TransactionModal will show progress
		handleClose();

		try {
			transactionStore.awaitWalletConfirmation('Preparing swap...');

			if (await isLegacyTokenCertificationExpired(mapping.oldToken.address as `0x${string}`)) {
				transactionStore.transactionError(
					legacyTokenCertificationExpiredMessage(mapping.oldToken.symbol) as TransactionErrorMessage
				);
				return;
			}

			// 1. Fetch the migration swap order by order hash
			const client = await getLoadBalancedClient(network);
			const ordersResult = await client.getOrders(
				[network.id],
				{
					active: true,
					owners: [],
					orderHash: mapping.swapOrderHash as `0x${string}`
				},
				1
			);

			if (ordersResult.error || !ordersResult.value?.orders.length) {
				transactionStore.transactionError(
					'Migration order not available. Please try again later.' as TransactionErrorMessage
				);
				return;
			}

			const raindexOrderObj = ordersResult.value.orders[0];
			const quotesResult = await raindexOrderObj.getQuotes();
			if (quotesResult.error || !quotesResult.value?.length) {
				transactionStore.transactionError(
					'Failed to fetch migration order price.' as TransactionErrorMessage
				);
				return;
			}

			const migrationQuote = parseMigrationOrderQuote(mapping, quotesResult.value[0]);
			if (migrationQuote.maxOutputWei <= 0n || !migrationQuote.ioRatio) {
				transactionStore.transactionError(
					'Migration order not available. Please try again later.' as TransactionErrorMessage
				);
				return;
			}

			const swapAmountWei = parseUnits(swapAmountStr, mapping.oldToken.decimals);
			const requestedTakerWantsAmount = migrationReceiveWei(swapAmountWei, migrationQuote.ioRatio);
			if (requestedTakerWantsAmount <= 0n) {
				transactionStore.transactionError(
					'Swap amount is too small for this migration order.' as TransactionErrorMessage
				);
				return;
			}
			if (requestedTakerWantsAmount > migrationQuote.maxOutputWei) {
				transactionStore.transactionError(
					'Not enough migration inventory for this amount. Try a smaller size.' as TransactionErrorMessage
				);
				return;
			}

			const sgOrderResult = raindexOrderObj.convertToSgOrder();
			if (sgOrderResult.error || !sgOrderResult.value) {
				transactionStore.transactionError(
					'Failed to prepare migration order.' as TransactionErrorMessage
				);
				return;
			}

			const sgOrder = sgOrderResult.value;
			const decodedOrder = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], sgOrder.orderBytes);
			const orderData = normalizeOrderData(decodedOrder[0] as OrderV4);

			// 2. Resolve IO indexes: order input = old token (taker pays), order output = new token (taker wants)
			const oldAddr = mapping.oldToken.address.toLowerCase();
			const newAddr = mapping.newToken.address.toLowerCase();
			const inputIndex = orderData.validInputs.findIndex(
				(i) => (i.token as string)?.toLowerCase() === oldAddr
			);
			const outputIndex = orderData.validOutputs.findIndex(
				(o) => (o.token as string)?.toLowerCase() === newAddr
			);

			if (inputIndex === -1 || outputIndex === -1) {
				transactionStore.transactionError(
					'Order token mismatch for this migration.' as TransactionErrorMessage
				);
				return;
			}

			// 3. Build take-order config — user enters old-token pay; buyUpTo for wrapped receive.
			const takeOrderConfig: TakeOrderConfigV4 = {
				order: orderData,
				inputIOIndex: String(inputIndex),
				outputIOIndex: String(outputIndex),
				signedContext: []
			};

			const maximumReceiveFloat = Float.fromFixedDecimalLossy(
				requestedTakerWantsAmount,
				mapping.newToken.decimals
			);
			const ratioParsed = Float.parse(migrationQuote.ioRatio);
			if (!maximumReceiveFloat.float || ratioParsed.error || !ratioParsed.value) {
				transactionStore.transactionError(
					'Failed to build order parameters.' as TransactionErrorMessage
				);
				return;
			}

			const takeOrdersConfig: TakeOrdersConfigV5 = {
				minimumIO: Float.fromBigint(0n).asHex(),
				maximumIO: maximumReceiveFloat.float.asHex(),
				maximumIORatio: ratioParsed.value.asHex(),
				IOIsInput: true as unknown as string,
				orders: [takeOrderConfig],
				data: '0x'
			};

			const takerWantsToken: TokenInfo = {
				address: mapping.newToken.address,
				decimals: mapping.newToken.decimals,
				symbol: mapping.newToken.symbol
			};
			const takerPaysToken: TokenInfo = {
				address: mapping.oldToken.address,
				decimals: mapping.oldToken.decimals,
				symbol: mapping.oldToken.symbol
			};

			const params: TakeOrdersParams = {
				orderData,
				ioIndexes: { input: inputIndex, output: outputIndex },
				takerWantsToken,
				takerPaysToken,
				requestedTakerWantsAmount,
				requestedTakerPaysAmount: swapAmountWei,
				orderFillAmounts: [requestedTakerWantsAmount],
				skipAggregatedTake: true
			};

			// handleTakeOrders manages the transaction flow and calls transactionSuccess/Error
			await transactionStore.handleTakeOrders(
				takeOrdersConfig,
				sgOrder,
				swapAmountWei,
				params,
				undefined,
				[raindexOrderObj]
			);

			// Invalidate modal-specific + dashboard queries (balance queries handled by handleTakeOrders)
			queryClient.invalidateQueries({ queryKey: ['oldTokenBalances'] });
			queryClient.invalidateQueries({ queryKey: ['dashboardOldTokenBalances'] });
			queryClient.invalidateQueries({ queryKey: ['dashboardUnwrappedTokenBalances'] });
			queryClient.invalidateQueries({ queryKey: ['hasOldTokens'] });
		} catch (error) {
			console.error('Swap failed:', error);
			transactionStore.transactionError(
				(error instanceof Error ? error.message : 'Swap failed') as TransactionErrorMessage
			);
		}
	}

	// Close and reset
	function handleClose() {
		selectedOldTokenAddress = null;
		swapAmount = '';
		liquidityWarning = false;
		hasTrackedModalOpen = false;
		closeTokenSwapModal();
	}

	// Get logo URL for token (supports wrapped, unwrapped, and legacy addresses)
	function getTokenLogo(address: string): string | undefined {
		return getTokenByAnyAddress(address)?.logoUrl;
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
		<div class="relative overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-line px-6 py-4">
				<h3 id="swap-modal-title" class="text-lg font-semibold text-text">Swap Legacy Tokens</h3>
				<button
					type="button"
					on:click={handleClose}
					class="rounded-full p-1 text-text-2 transition hover:bg-surface-3 hover:text-text"
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
						<label for="swap-from-token" class="text-sm font-medium text-text-2">What I have</label>
						<div class="rounded-xl border border-line bg-surface-2 px-4 py-3">
							<!-- Token Dropdown -->
							<div class="mb-3">
								<select
									id="swap-from-token"
									class="w-full rounded-lg border border-line bg-surface-3 px-3 py-2 text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
									bind:value={selectedOldTokenAddress}
									on:change={(e) => handleTokenSelect(e.currentTarget.value)}
								>
									<option value="" disabled>Select token to swap</option>
									{#if $oldTokenBalancesQuery.isLoading && tokensToShow.length === 0}
										<option value="" disabled>Loading...</option>
									{:else if tokensToShow.length === 0}
										<option value="" disabled>No legacy tokens to swap</option>
									{:else}
										{#each tokensToShow as tokenData}
											<option value={tokenData.oldToken.address}>
												{tokenData.oldToken.symbol} - Balance: {formatBalance(
													tokenData.balance,
													tokenData.oldToken.decimals
												)}
											</option>
										{/each}
									{/if}
								</select>
							</div>

							<!-- Amount Input -->
							<div class="flex items-center gap-3">
								{#if selectedTokenData}
									<div class="flex items-center gap-2 rounded-lg bg-surface-3 px-3 py-1.5">
										{#if getTokenLogo(selectedTokenData.oldToken.address)}
											<img
												src={getTokenLogo(selectedTokenData.oldToken.address)}
												alt={selectedTokenData.oldToken.symbol}
												class="h-6 w-6 rounded-full"
											/>
										{/if}
										<span class="font-medium text-text">{selectedTokenData.oldToken.symbol}</span>
									</div>
								{:else}
									<div class="rounded-lg bg-surface-3 px-3 py-1.5">
										<span class="text-text-2">Select token</span>
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
										class="w-full bg-transparent text-right text-xl font-medium text-text placeholder-gray-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
									/>
								</div>
							</div>

							<!-- Balance & Max -->
							{#if selectedTokenData}
								<div class="mt-2 flex items-center justify-between text-xs">
									<span class="text-text-3">
										Balance: {formatBalance(
											selectedTokenData.balance,
											selectedTokenData.oldToken.decimals
										)}
										{selectedTokenData.oldToken.symbol}
									</span>
									<button
										type="button"
										on:click={handleMaxClick}
										class="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-2 transition hover:bg-gray-600 hover:text-text"
									>
										MAX
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Arrow -->
					<div class="flex justify-center">
						<div class="rounded-full border border-line bg-surface-2 p-2">
							<svg
								class="h-4 w-4 text-text-2"
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

					<!-- What I Get (New Wrapped Token) -->
					<div class="space-y-2">
						<span class="text-sm font-medium text-text-2">What I get</span>
						<div class="rounded-xl border border-line bg-surface-2 px-4 py-3">
							<div class="flex items-center gap-3">
								{#if currentMapping}
									<div class="flex items-center gap-2 rounded-lg bg-surface-3 px-3 py-1.5">
										{#if getTokenLogo(currentMapping.newToken.address)}
											<img
												src={getTokenLogo(currentMapping.newToken.address)}
												alt={currentMapping.newToken.symbol}
												class="h-6 w-6 rounded-full"
											/>
										{/if}
										<span class="font-medium text-text">{currentMapping.newToken.symbol}</span>
									</div>
								{:else}
									<div class="rounded-lg bg-surface-3 px-3 py-1.5">
										<span class="text-text-2">—</span>
									</div>
								{/if}
								<div class="flex-1 text-right">
									<span class="text-xl font-medium text-text">
										{estimatedReceiveAmount > 0
											? formatNumberWithDecimals(
													estimatedReceiveAmount,
													currentMapping?.newToken.decimals ?? 6
												)
											: '0'}
									</span>
								</div>
							</div>

							{#if currentMapping}
								<div class="mt-2 text-xs text-text-3">
									{currentMapping.newToken.name}
								</div>
							{/if}
						</div>
					</div>

					<!-- Certification expired (legacy OARV transfer window) -->
					{#if legacyCertificationExpired}
						<div
							class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200"
						>
							<p class="font-medium">Migration temporarily unavailable</p>
							<p class="mt-0.5 text-amber-200/80">
								{legacyTokenCertificationExpiredMessage(currentMapping?.oldToken.symbol)}
							</p>
						</div>
					{/if}

					<!-- Liquidity Warning -->
					{#if liquidityWarning}
						<div
							class="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-xs text-blue-600 dark:text-blue-300"
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
									<p class="mt-0.5 text-blue-600/80 dark:text-blue-300/80">
										Inventory will be periodically topped up. Please swap now and come back again
										later.
									</p>
								</div>
							</div>
						</div>
					{/if}

					<!-- Swap Info -->
					<div class="rounded-lg bg-surface-2 px-4 py-3 text-xs text-text-2">
						<div class="flex justify-between">
							<span>Rate</span>
							<span class="text-text">{swapRateLabel}</span>
						</div>
						{#if currentMapping}
							<div class="mt-1 flex justify-between">
								<span>Available liquidity</span>
								{#if $swapLiquidityQuery.isLoading || $swapLiquidityQuery.isFetching}
									<span class="animate-pulse text-text-3">Checking...</span>
								{:else if $swapLiquidityQuery.isError}
									<span class="text-orange-400">Failed to check — retrying...</span>
								{:else if availablePayLiquidity > 0}
									<span class="text-text"
										>{formatBalance(availablePayCapWei, currentMapping.oldToken.decimals)}
										{currentMapping.oldToken.symbol}</span
									>
								{:else}
									<span class="text-amber-300">No liquidity available</span>
								{/if}
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
							tokensToShow.length === 0 ||
							$legacyCertificationQuery.isLoading ||
							legacyCertificationExpired ||
							$swapLiquidityQuery.isLoading ||
							$swapLiquidityQuery.isError ||
							availablePayCapWei <= 0n}
						on:click={handleSwap}
					>
						{#if tokensToShow.length === 0}
							No legacy tokens to swap
						{:else if !selectedTokenData}
							Select a token
						{:else if $legacyCertificationQuery.isLoading}
							Checking transfer status...
						{:else if legacyCertificationExpired}
							Migration temporarily unavailable
						{:else if $swapLiquidityQuery.isLoading}
							Checking liquidity...
						{:else if $swapLiquidityQuery.isError}
							Checking liquidity — please wait...
						{:else if availablePayCapWei <= 0n}
							No liquidity available
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
