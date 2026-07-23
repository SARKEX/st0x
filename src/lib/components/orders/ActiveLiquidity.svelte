<script lang="ts">
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/config/network';
	import { createApiTokensQuery } from '$lib/queries/tokens';
	import {
		validateBaseline,
		validateOverrideDepositAmount,
		validateSelectedAmount
	} from '$lib/utils/validation';
	import Input from '$lib/components/ui/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { isAuthenticated } from '$lib/stores/authStore';
	import transactionStore from '$lib/stores/transaction';
	import { hasMarketPrice } from '$lib/utils/derivations';
	import { currentNetwork } from '$lib/stores';
	import MarketPriceRow from '$lib/components/MarketPriceRow.svelte';
	import { containerStyles } from '$lib/styles/utils';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';

	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId ?? $currentNetwork?.id);
	$: ALL_TOKENS = $apiTokensQuery.data ?? [];

	// Initialize selected tokens when network changes, but preserve user selections if valid
	$: if (ALL_TOKENS.length > 0) {
		// Check if current selections are still valid for the new network
		const currentToken1 = selectedToken1;
		const currentToken2 = selectedToken2;
		const token1StillValid =
			currentToken1 && ALL_TOKENS.some((token) => token.address === currentToken1.address);
		const token2StillValid =
			currentToken2 && ALL_TOKENS.some((token) => token.address === currentToken2.address);

		// Only reset if current selections are not valid for the new network
		if (!token1StillValid) {
			selectedToken1 = ALL_TOKENS[ALL_TOKENS.length - 1];
		}
		if (!token2StillValid) {
			selectedToken2 = ALL_TOKENS[0];
		}
	}

	let showAdvancedOptions = false;
	let selectedToken1: CategorizedToken | undefined;
	let selectedToken2: CategorizedToken | undefined;
	let isToken1FastExit = false;
	let isToken2FastExit = false;
	let inputVaultId1: Hex | undefined;
	let inputVaultId2: Hex | undefined;
	let outputVaultId1: Hex | undefined;
	let outputVaultId2: Hex | undefined;
	let depositAmount1: bigint = 0n;
	let depositAmount2: bigint = 0n;
	let minTradeAmount: bigint = 0n;
	let maxTradeAmount: bigint = 0n;
	let initialIo: string = '0';
	let priceFeedsQuery = createPriceFeedsQuery($currentNetwork);
	$: priceFeedsQuery = createPriceFeedsQuery($currentNetwork);

	// errors
	let minTradeAmountError: boolean = false;
	let maxTradeAmountError: boolean = false;
	let token1DepositAmountError: boolean = false;
	let token2DepositAmountError: boolean = false;
	let inputVaultId1Error: boolean = false;
	let inputVaultId2Error: boolean = false;
	let outputVaultId1Error: boolean = false;
	let outputVaultId2Error: boolean = false;
	let initialIoError: boolean = false;
	let nextTradeMultiplier = '1.01';
	let costBasisMultiplier = '1';
	let timePerEpoch = '3600';
	let nextTradeMultiplierError: boolean = false;
	let costBasisMultiplierError: boolean = false;
	let timePerEpochError: boolean = false;

	const validatePositiveNumber = (value: string | undefined) => {
		if (!value || value.trim() === '') return 'Value is required';
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed <= 0) return 'Value must be greater than 0';
		return undefined;
	};

	const validatePositiveInteger = (value: string | undefined) => {
		const err = validatePositiveNumber(value);
		if (err) return err;
		const parsed = Number(value);
		if (!Number.isInteger(parsed)) return 'Value must be an integer number of seconds';
		return undefined;
	};

	$: isToken1SameAsToken2 =
		selectedToken1?.address.toLowerCase() === selectedToken2?.address.toLowerCase();

	$: disableDeploy =
		!selectedToken1 ||
		!selectedToken2 ||
		!initialIo ||
		!minTradeAmount ||
		!maxTradeAmount ||
		inputVaultId1Error ||
		inputVaultId2Error ||
		outputVaultId1Error ||
		outputVaultId2Error ||
		minTradeAmountError ||
		maxTradeAmountError ||
		token1DepositAmountError ||
		token2DepositAmountError ||
		initialIoError ||
		nextTradeMultiplierError ||
		costBasisMultiplierError ||
		timePerEpochError ||
		isToken1SameAsToken2;

	const handleDsfDeploy = () => {
		const token1 = selectedToken1;
		const token2 = selectedToken2;
		if ($isAuthenticated && token1 && token2) {
			transactionStore.handleDsfDeploy({
				token1,
				token2,
				amountIsFastExit: isToken1FastExit,
				notAmountIsFastExit: isToken2FastExit,
				initialIo: initialIo,
				maxAmount: maxTradeAmount,
				minAmount: minTradeAmount,
				depositAmountToken1: depositAmount1,
				depositAmountToken2: depositAmount2,
				inputVaultIdToken1: inputVaultId1,
				inputVaultIdToken2: inputVaultId2,
				outputVaultIdToken1: outputVaultId1,
				outputVaultIdToken2: outputVaultId2,
				nextTradeMultiplier,
				costBasisMultiplier,
				timePerEpoch
			});
		}
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-text-2">Token 1</span>
				<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken1} />
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-text-2">Token 2</span>
				<TokenSelect options={ALL_TOKENS} bind:selected={selectedToken2} />
			</div>
		</div>

		{#if selectedToken1 && selectedToken2}
			<div class="flex flex-col gap-3 sm:flex-row sm:gap-6">
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						class="h-4 w-4 rounded border-line bg-surface-3 text-accent"
						bind:checked={isToken1FastExit}
					/>
					<span class="text-sm">{selectedToken1.symbol || 'Token 1'} Fast Exit</span>
				</label>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						class="h-4 w-4 rounded border-line bg-surface-3 text-accent"
						bind:checked={isToken2FastExit}
					/>
					<span class="text-sm">{selectedToken2.symbol || 'Token 2'} Fast Exit</span>
				</label>
			</div>

			<div>
				<span class="mb-2 block text-sm font-medium text-text-2">
					Initial Ratio {selectedToken1 && selectedToken2
						? `${selectedToken1.symbol}/${selectedToken2.symbol}`
						: ''}
				</span>
				<div class="relative">
					<Input
						type="number"
						unit={selectedToken1.symbol}
						bind:amount={initialIo}
						validate={validateBaseline}
						bind:isError={initialIoError}
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
				<div>
					<div class="space-y-2">
						<div class="relative">
							<span class="text-sm font-medium text-text-2"
								>{selectedToken1.symbol} Deposit Amount</span
							>
							<TradeAmountInput
								amountToken={selectedToken1}
								bind:amount={depositAmount1}
								validate={validateOverrideDepositAmount}
								bind:isError={token1DepositAmountError}
							/>
						</div>
						<div class="relative">
							<span class="text-sm font-medium text-text-2"
								>{selectedToken2.symbol} Deposit Amount</span
							>
							<TradeAmountInput
								amountToken={selectedToken2}
								bind:amount={depositAmount2}
								validate={validateOverrideDepositAmount}
								bind:isError={token2DepositAmountError}
							/>
						</div>
					</div>
				</div>
				<div>
					<div class="space-y-2">
						<div class="relative">
							<span class="text-sm font-medium text-text-2">Minimum Trade Amount</span>
							<TradeAmountInput
								amountToken={selectedToken1}
								bind:amount={minTradeAmount}
								validate={validateSelectedAmount}
								bind:isError={minTradeAmountError}
							/>
						</div>
						<div class="relative">
							<span class="text-sm font-medium text-text-2">Maximum Trade Amount</span>
							<TradeAmountInput
								amountToken={selectedToken1}
								bind:amount={maxTradeAmount}
								validate={validateSelectedAmount}
								bind:isError={maxTradeAmountError}
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="mb-6 flex items-center gap-3">
				<button
					on:click={() => (showAdvancedOptions = !showAdvancedOptions)}
					class="relative h-6 w-12 rounded-full transition-colors {showAdvancedOptions
						? 'bg-accent'
						: 'bg-text-muted'}"
				>
					<div
						class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {showAdvancedOptions
							? 'translate-x-6'
							: 'translate-x-0.5'}"
					/>
				</button>
				<span class="text-sm font-medium">Show advanced options</span>
			</div>

			{#if showAdvancedOptions}
				<div class="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
					<h4 class="text-sm font-medium text-text-2">Advanced Options</h4>
					<div>
						<span class="mb-2 block text-sm font-medium text-text-2">Strategy Parameters</span>
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
							<div class="relative">
								<span class="mb-1 block text-sm font-medium text-text-2">Next Trade Multiplier</span
								>
								<Input
									type="number"
									step="0.0001"
									bind:amount={nextTradeMultiplier}
									validate={validatePositiveNumber}
									bind:isError={nextTradeMultiplierError}
								/>
							</div>
							<div class="relative">
								<span class="mb-1 block text-sm font-medium text-text-2">Cost Basis Multiplier</span
								>
								<Input
									type="number"
									step="0.0001"
									bind:amount={costBasisMultiplier}
									validate={validatePositiveNumber}
									bind:isError={costBasisMultiplierError}
								/>
							</div>
							<div class="relative">
								<span class="mb-1 block text-sm font-medium text-text-2"
									>Time Per Epoch (seconds)</span
								>
								<Input
									type="number"
									step="1"
									bind:amount={timePerEpoch}
									validate={validatePositiveInteger}
									bind:isError={timePerEpochError}
								/>
							</div>
						</div>
					</div>
					<div>
						<span class="mb-2 block text-sm font-medium text-text-2">Enter Vault IDs</span>
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
							<div class="space-y-2">
								<div class="relative">
									<span class="text-sm font-medium text-text-2"
										>Input {selectedToken1.symbol} Vault ID</span
									>
									<VaultIdInput bind:vaultId={inputVaultId1} bind:isError={inputVaultId1Error} />
								</div>
								<div class="relative">
									<span class="text-sm font-medium text-text-2"
										>Input {selectedToken2.symbol} Vault ID</span
									>
									<VaultIdInput bind:vaultId={inputVaultId2} bind:isError={inputVaultId2Error} />
								</div>
							</div>
							<div class="space-y-2">
								<div class="relative">
									<span class="text-sm font-medium text-text-2"
										>Output {selectedToken1.symbol} Vault ID</span
									>
									<VaultIdInput bind:vaultId={outputVaultId1} bind:isError={outputVaultId1Error} />
								</div>
								<div class="relative">
									<span class="text-sm font-medium text-text-2"
										>Output {selectedToken2.symbol} Vault ID</span
									>
									<VaultIdInput bind:vaultId={outputVaultId2} bind:isError={outputVaultId2Error} />
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Order Summary and Button: always below form on mobile, side on desktop -->
	{#if selectedToken1 && selectedToken2}
		<div class="mt-4 space-y-4 lg:mt-0">
			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-text-2">Prices</h4>
				{#if !hasMarketPrice(selectedToken1) && !hasMarketPrice(selectedToken2)}
					<div class="py-6 text-center text-sm text-text-2">No price feed data available</div>
				{:else if $priceFeedsQuery?.status === 'pending'}
					<div class="flex justify-center py-6">
						<LoadingSpinner size="sm" text="Loading price data..." />
					</div>
				{:else if $priceFeedsQuery?.status === 'error' && !$priceFeedsQuery?.data?.length}
					<div class="py-6 text-center text-sm text-red-400">Failed to load price data</div>
				{:else}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm text-text-2">
							<thead>
								<tr>
									<th
										class="px-2 py-1 text-left text-[11px] font-medium uppercase tracking-wide text-text-3"
										>Token</th
									>
									<th
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>Mid Price</th
									>
									<th
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>Bid / Ask</th
									>
									<th
										class="px-2 py-1 text-right text-[11px] font-medium uppercase tracking-wide text-text-3"
										>24h Change</th
									>
								</tr>
							</thead>
							<tbody>
								{#if hasMarketPrice(selectedToken1)}
									<MarketPriceRow
										token={selectedToken1}
										tokenQuotes={$priceFeedsQuery?.data ?? []}
									/>
								{/if}
								{#if hasMarketPrice(selectedToken2)}
									<MarketPriceRow
										token={selectedToken2}
										tokenQuotes={$priceFeedsQuery?.data ?? []}
									/>
								{/if}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-text-2">
					Active Liquidity Order Summary
				</h4>
				<div class="space-y-2">
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Trading Pair</span>
						<span class="font-medium text-text"
							>{selectedToken1 && selectedToken2
								? `${selectedToken1.symbol}/${selectedToken2.symbol}`
								: 'Select tokens'}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Initial Ratio</span>
						<span class="font-medium text-text">{initialIo}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Cost Basis</span>
						<span class="font-medium text-text">{costBasisMultiplier}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Spread</span>
						<span class="font-medium text-text">{nextTradeMultiplier}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Time Per Epoch</span>
						<span class="font-medium text-text">{timePerEpoch}s</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">{selectedToken1.symbol} Fast Exit</span>
						<span class="font-medium text-text">{isToken1FastExit ? 'Yes' : 'No'}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">{selectedToken2.symbol} Fast Exit</span>
						<span class="font-medium text-text">{isToken2FastExit ? 'Yes' : 'No'}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">{selectedToken1.symbol} Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(depositAmount1 ?? 0n, selectedToken1.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">{selectedToken2.symbol} Deposit Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(depositAmount2 ?? 0n, selectedToken2.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Minimum Trade Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(minTradeAmount ?? 0n, selectedToken1.decimals)}</span
						>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-text-2">Maximum Trade Amount</span>
						<span class="font-medium text-text"
							>{formatUnits(maxTradeAmount ?? 0n, selectedToken1.decimals)}</span
						>
					</div>
				</div>
			</div>

			<Button
				variant="primary"
				size="lg"
				fullWidth={true}
				disabled={disableDeploy}
				on:click={handleDsfDeploy}
			>
				Deploy Order
			</Button>
		</div>
	{/if}
</div>
