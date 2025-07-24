<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import Select from '$lib/components/Select.svelte';
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import {
		validateBaseline,
		validateOverrideDepositAmount,
		validatePeriod,
		validateSelectedAmount
	} from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';
	import { hasValidPriceFeedId } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';

	// Make ALL_TOKENS reactive to network changes
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let selectedInputToken: Token | undefined;
	let selectedOutputToken: Token | undefined;
	let selectedAmount: bigint = 0n;
	let selectedPeriodUnit: 'Days' | 'Hours' | 'Minutes' = 'Days';
	let selectedPeriod: string = '';
	let selectedBaseline: string = '';
	let selectedInitialRatio: string = '';

	let overrideDepositAmount: bigint = 0n;
	let overrideMinTradeAmount: bigint = 0n;
	let overrideMaxTradeAmount: bigint = 0n;
	let inputVaultId: Hex | undefined;
	let outputVaultId: Hex | undefined;

	// Reset selections when network changes
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		// Set default selections for new network
		selectedInputToken = ALL_TOKENS[0];
		selectedOutputToken = ALL_TOKENS[ALL_TOKENS.length - 1];
		// Reset form state
		selectedAmount = 0n;
		selectedPeriod = '';
		selectedBaseline = '';
		selectedInitialRatio = '';
		overrideDepositAmount = 0n;
		overrideMinTradeAmount = 0n;
		overrideMaxTradeAmount = 0n;
		inputVaultId = undefined;
		outputVaultId = undefined;
		// Reset errors
		selectedAmountError = false;
		selectedPeriodError = false;
		overrideDepositAmountError = false;
		overrideMinTradeAmountError = false;
		overrideMaxTradeAmountError = false;
		inputVaultIdError = false;
		outputVaultIdError = false;
		selectedBaselineError = false;
		selectedInitialRatioError = false;
	}

	$: isInputTokenSameAsOutputToken =
		selectedInputToken?.address.toLowerCase() === selectedOutputToken?.address.toLowerCase();

	let showAdvancedOptions = false;

	// errors
	let selectedAmountError: boolean = false;
	let selectedPeriodError: boolean = false;
	let overrideDepositAmountError: boolean = false;
	let overrideMinTradeAmountError: boolean = false;
	let overrideMaxTradeAmountError: boolean = false;
	let inputVaultIdError: boolean = false;
	let outputVaultIdError: boolean = false;
	let selectedBaselineError: boolean = false;
	let selectedInitialRatioError: boolean = false;

	$: depositAmount = showAdvancedOptions ? overrideDepositAmount : selectedAmount;

	$: maxTradeAmount = showAdvancedOptions
		? overrideMaxTradeAmount
		: selectedAmount
			? selectedAmount / 10n
			: 0n;
	$: minTradeAmount = showAdvancedOptions
		? overrideMinTradeAmount
		: selectedAmount
			? selectedAmount / 50n
			: 0n;

	$: disableDeploy =
		!selectedAmount ||
		!selectedPeriod ||
		!selectedBaseline ||
		!selectedInitialRatio ||
		(showAdvancedOptions && overrideDepositAmount == undefined) ||
		(showAdvancedOptions && overrideMinTradeAmount == undefined) ||
		(showAdvancedOptions && overrideMaxTradeAmount == undefined) ||
		inputVaultIdError ||
		outputVaultIdError ||
		selectedAmountError ||
		selectedPeriodError ||
		selectedBaselineError ||
		(showAdvancedOptions && overrideDepositAmountError) ||
		(showAdvancedOptions && overrideMinTradeAmountError) ||
		(showAdvancedOptions && overrideMaxTradeAmountError) ||
		isInputTokenSameAsOutputToken ||
		selectedInitialRatioError;

	const handleDcaDeploy = () => {
		if ($connected && selectedInputToken && selectedOutputToken) {
			transactionStore.handleDcaDeploy({
				outputToken: selectedOutputToken,
				inputToken: selectedInputToken,
				budgetAmount: selectedAmount,
				selectedPeriod: selectedPeriod,
				selectedPeriodUnit: selectedPeriodUnit,
				baseline: selectedBaseline,
				kickoff: selectedInitialRatio,
				minTradeAmount: minTradeAmount,
				maxTradeAmount: maxTradeAmount,
				inputVaultId: inputVaultId,
				outputVaultId: outputVaultId,
				depositAmount: depositAmount
			});
		}
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Token to Accumulate</span>
				{#if selectedInputToken}
					<TokenSelect options={ALL_TOKENS} selected={selectedInputToken} on:change={(e) => selectedInputToken = e.detail.token} />
				{:else}
					<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[0]} on:change={(e) => selectedInputToken = e.detail.token} />
				{/if}
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Pay With</span>
				{#if selectedOutputToken}
					<TokenSelect options={ALL_TOKENS} selected={selectedOutputToken} on:change={(e) => selectedOutputToken = e.detail.token} />
				{:else}
					<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[ALL_TOKENS.length - 1] || ALL_TOKENS[0]} on:change={(e) => selectedOutputToken = e.detail.token} />
				{/if}
			</div>
			{#if isInputTokenSameAsOutputToken}
				<div class="col-span-full mt-0 text-sm text-red-500">
					Same tokens are not allowed for both budget and buy tokens
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Budget Amount</span>
				{#if selectedOutputToken}
					<TradeAmountInput
						amountToken={selectedOutputToken}
						bind:amount={selectedAmount}
						validate={validateSelectedAmount}
						bind:isError={selectedAmountError}
					/>
				{:else}
					<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
						Select output token first
					</div>
				{/if}
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Budget Period Every</span>
				<div class="flex gap-2">
					<div class="flex-grow text-gray-600">
						<Input
							type="number"
							bind:amount={selectedPeriod}
							validate={validatePeriod}
							bind:isError={selectedPeriodError}
						/>
					</div>
					<div class="text-gray-600">
						<Select
							options={['Days', 'Hours', 'Minutes']}
							bind:selected={selectedPeriodUnit}
							getOptionLabel={(option) => option}
						/>
					</div>
				</div>
			</div>
		</div>

		<div>
			<span class="mb-2 block text-sm font-medium text-gray-300">
				Floor Price {selectedInputToken && selectedOutputToken
					? `${selectedInputToken.symbol}/${selectedOutputToken.symbol}`
					: ''}
			</span>
			<div class="relative">
				<Input
					type="number"
					unit={selectedInputToken?.symbol}
					bind:amount={selectedBaseline}
					validate={validateBaseline}
					bind:isError={selectedBaselineError}
				/>
			</div>
		</div>
		<div>
			<span class="mb-2 block text-sm font-medium text-gray-300">
				Initial Ratio {selectedInputToken && selectedOutputToken
					? `${selectedInputToken.symbol}/${selectedOutputToken.symbol}`
					: ''}
			</span>
			<div class="relative">
				<Input
					type="number"
					unit={selectedInputToken?.symbol}
					bind:amount={selectedInitialRatio}
					validate={validateBaseline}
					bind:isError={selectedInitialRatioError}
				/>
			</div>
		</div>

		<!-- Advanced Toggle -->
		<div class="mb-6 flex items-center gap-3">
			<button
				on:click={() => (showAdvancedOptions = !showAdvancedOptions)}
				class="relative h-6 w-12 rounded-full transition-colors {showAdvancedOptions
					? 'bg-blue-500'
					: 'bg-gray-600'}"
			>
				<div
					class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform {showAdvancedOptions
						? 'translate-x-6'
						: 'translate-x-0.5'}"
				/>
			</button>
			<span class="text-sm font-medium">Show advanced options</span>
		</div>

		{#if showAdvancedOptions}
			<div class="space-y-4 rounded-lg border border-white/5 bg-gray-800/30 p-4">
				<h4 class="text-sm font-medium text-gray-300">Advanced Options</h4>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<div>
						<span class="mb-2 block text-sm font-medium text-gray-300">Custom deposit amount</span>
						<div class="relative">
							{#if selectedOutputToken}
								<TradeAmountInput
									amountToken={selectedOutputToken}
									bind:amount={overrideDepositAmount}
									validate={validateOverrideDepositAmount}
									bind:isError={overrideDepositAmountError}
								/>
							{:else}
								<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
									Select output token first
								</div>
							{/if}
						</div>
					</div>
					<div>
						<span class="mb-2 block text-sm font-medium text-gray-300">Min Trade Amount</span>
						<div class="relative">
							{#if selectedOutputToken}
								<TradeAmountInput
									amountToken={selectedOutputToken}
									bind:amount={overrideMinTradeAmount}
									validate={validateSelectedAmount}
									bind:isError={overrideMinTradeAmountError}
								/>
							{:else}
								<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
									Select output token first
								</div>
							{/if}
						</div>
					</div>
					<div>
						<span class="mb-2 block text-sm font-medium text-gray-300">Max Trade Amount</span>
						<div class="relative">
							{#if selectedOutputToken}
								<TradeAmountInput
									amountToken={selectedOutputToken}
									bind:amount={overrideMaxTradeAmount}
									validate={validateSelectedAmount}
									bind:isError={overrideMaxTradeAmountError}
								/>
							{:else}
								<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
									Select output token first
								</div>
							{/if}
						</div>
					</div>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedInputToken?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId} bind:isError={inputVaultIdError} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedOutputToken?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId} bind:isError={outputVaultIdError} />
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Order Summary and Button: always below form on mobile, side on desktop -->
	<div class="mt-4 space-y-4 lg:mt-0">
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Prices</h4>
			<div class="hidden overflow-x-auto sm:block">
				<table class="min-w-full text-sm text-gray-200">
					<thead>
						<tr>
							<th class="px-2 py-1 text-left">Token</th>
							<th class="px-2 py-1 text-right">Oracle Price</th>
							<th class="px-2 py-1 text-right">Price Certainty</th>
							<th class="px-2 py-1 text-right">Real-Time</th>
						</tr>
					</thead>
					<tbody>
						{#if selectedInputToken && hasValidPriceFeedId(selectedInputToken)}
							<PythOracleRow token={selectedInputToken} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedInputToken?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedOutputToken && hasValidPriceFeedId(selectedOutputToken)}
							<PythOracleRow token={selectedOutputToken} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedOutputToken?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
			<div class="mt-2 flex flex-col gap-2 sm:hidden">
				{#if selectedInputToken && hasValidPriceFeedId(selectedInputToken)}
					<PythOracleRow token={selectedInputToken} tokenQuotes={$tokenGlobalQuote} />
				{:else}
					<div class="rounded bg-gray-800/80 p-3 text-xs">
						<div><span class="font-semibold">Token: </span>{selectedInputToken?.symbol ?? '-'}</div>
						<div><span class="font-semibold">Oracle Price: </span>-</div>
						<div><span class="font-semibold">Price Certainty: </span>-</div>
						<div><span class="font-semibold">Real-Time: </span>-</div>
					</div>
				{/if}
				{#if selectedOutputToken && hasValidPriceFeedId(selectedOutputToken)}
					<PythOracleRow token={selectedOutputToken} tokenQuotes={$tokenGlobalQuote} />
				{:else}
					<div class="rounded bg-gray-800/80 p-3 text-xs">
						<div>
							<span class="font-semibold">Token: </span>{selectedOutputToken?.symbol ?? '-'}
						</div>
						<div><span class="font-semibold">Oracle Price: </span>-</div>
						<div><span class="font-semibold">Price Certainty: </span>-</div>
						<div><span class="font-semibold">Real-Time: </span>-</div>
					</div>
				{/if}
			</div>
		</div>
		<!-- Order Summary -->
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">DCA Order Summary</h4>
			<div class="space-y-2">
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Trading Pair</span>
					<span class="font-medium text-white"
						>{selectedInputToken && selectedOutputToken
							? `${selectedInputToken.symbol}/${selectedOutputToken.symbol}`
							: 'Select tokens'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Budget Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(selectedAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Budget Period</span>
					<span class="font-medium text-white">{selectedPeriod} {selectedPeriodUnit}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Minimum Trade Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(overrideMinTradeAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Maximum Trade Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(overrideMaxTradeAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Kickoff</span>
					<span class="font-medium text-white"
						>{selectedInputToken && selectedOutputToken
							? `${selectedInitialRatio} ${selectedInputToken.symbol}/${selectedOutputToken.symbol}`
							: 'N/A'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Floor Price</span>
					<span class="font-medium text-white"
						>{selectedInputToken && selectedOutputToken
							? `${selectedBaseline} ${selectedInputToken.symbol}/${selectedOutputToken.symbol}`
							: 'N/A'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(depositAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Min Trade Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(minTradeAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Max Trade Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(maxTradeAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Next Trade Multiplier</span>
					<span class="font-medium text-white">1.01</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Next Trade Baseline Multiplier</span>
					<span class="font-medium text-white">0</span>
				</div>
			</div>
		</div>

		<button
			class="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 font-semibold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disableDeploy}
			on:click={handleDcaDeploy}
		>
			Deploy Order
		</button>
	</div>
</div>
