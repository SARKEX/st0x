<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import Select from '$lib/components/ui/Select.svelte';
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import type { PythToken } from '$lib/types';
	import {
		validateBaseline,
		validateOverrideDepositAmount,
		validatePeriod,
		validateSelectedAmount
	} from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/ui/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';
	import { hasValidPriceFeedId } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';

	export let passedInputToken: PythToken | undefined; // The token we're accumulating

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.id) : [];

	// Initialize tokens - accumulating token from prop, USDC for payment
	let selectedInputToken: Token = passedInputToken;
	let selectedOutputToken: Token;
	
	// Always use USDC for payment
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const usdcToken = ALL_TOKENS.find(t => t.symbol === 'USDC');
		selectedOutputToken = usdcToken || ALL_TOKENS[0];
		
		// Update selectedInputToken if network changes
		if (passedInputToken && !selectedInputToken) {
			selectedInputToken = passedInputToken;
		}
	}

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

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken?.address.toLowerCase() === selectedInputToken?.address.toLowerCase();

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

	$: depositAmount = selectedAmount;
	$: maxTradeAmount = selectedAmount ? selectedAmount / 10n : 0n;
	$: minTradeAmount = selectedAmount ? selectedAmount / 50n : 0n;

	$: disableDeploy =
		!selectedAmount ||
		!selectedPeriod ||
		!selectedBaseline ||
		!selectedInitialRatio ||
		inputVaultIdError ||
		outputVaultIdError ||
		selectedAmountError ||
		selectedPeriodError ||
		selectedBaselineError ||
		isInputTokenSameAsOutputToken ||
		selectedInitialRatioError;

	const handleDcaDeploy = () => {
		if ($connected) {
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

	// Calculate average price per period
	$: avgPricePerPeriod = selectedAmount && selectedPeriod 
		? (parseFloat(formatUnits(selectedAmount, selectedOutputToken?.decimals || 18)) / parseFloat(selectedPeriod || '1')).toFixed(2)
		: '0.00';
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0 && selectedInputToken && selectedOutputToken}
<div class="space-y-4">
	<!-- Simplified header showing what we're accumulating -->
	<div class="rounded-lg bg-gray-800/50 p-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<span class="text-sm text-gray-400">Accumulating</span>
				<div class="flex items-center gap-2">
					{#if selectedInputToken.logoUrl}
						<img src={selectedInputToken.logoUrl} alt={selectedInputToken.symbol} class="h-6 w-6 rounded-full" />
					{/if}
					<span class="font-semibold text-lg">{selectedInputToken.symbol}</span>
				</div>
			</div>
			<div class="flex items-center gap-2 text-sm text-gray-400">
				<span>with</span>
				<img src="/images/USDC.png" alt="USDC" class="h-5 w-5" />
				<span>USDC</span>
			</div>
		</div>
	</div>

	<!-- Budget and Period -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div>
			<label class="mb-2 block text-sm font-medium text-gray-300">
				Budget Amount
				<span class="text-xs text-gray-500 ml-1">(USDC)</span>
			</label>
			<TradeAmountInput
				amountToken={selectedOutputToken}
				bind:amount={selectedAmount}
				validate={validateSelectedAmount}
				bind:isError={selectedAmountError}
			/>
		</div>
		<div>
			<label class="mb-2 block text-sm font-medium text-gray-300">
				Budget Period Every
			</label>
			<div class="flex gap-2">
				<div class="flex-grow">
					<Input
						type="number"
						bind:amount={selectedPeriod}
						validate={validatePeriod}
						bind:isError={selectedPeriodError}
					/>
				</div>
				<div class="w-28">
					<Select
						options={['Days', 'Hours', 'Minutes']}
						bind:selected={selectedPeriodUnit}
						getOptionLabel={(option) => option}
					/>
				</div>
			</div>
		</div>
	</div>

	<!-- Price Settings -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div>
			<label class="mb-2 block text-sm font-medium text-gray-300">
				Floor Price
				<span class="text-xs text-gray-500 ml-1">({selectedInputToken.symbol}/USDC)</span>
			</label>
			<Input
				type="number"
				unit={selectedInputToken.symbol}
				bind:amount={selectedBaseline}
				validate={validateBaseline}
				bind:isError={selectedBaselineError}
			/>
		</div>
		<div>
			<label class="mb-2 block text-sm font-medium text-gray-300">
				Initial Ratio
				<span class="text-xs text-gray-500 ml-1">({selectedInputToken.symbol}/USDC)</span>
			</label>
			<Input
				type="number"
				unit={selectedInputToken.symbol}
				bind:amount={selectedInitialRatio}
				validate={validateBaseline}
				bind:isError={selectedInitialRatioError}
			/>
		</div>
	</div>

	<!-- Strategy Summary -->
	<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
		<h4 class="mb-3 text-sm font-medium text-gray-300">DCA Strategy Summary</h4>
		<div class="space-y-2 text-sm">
			<div class="flex justify-between">
				<span class="text-gray-400">Total Budget</span>
				<span class="font-medium">
					{selectedAmount ? formatUnits(selectedAmount, selectedOutputToken.decimals) : '0'} USDC
				</span>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Period</span>
				<span class="font-medium">
					Every {selectedPeriod || '0'} {selectedPeriodUnit.toLowerCase()}
				</span>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Average per period</span>
				<span class="font-medium">
					~{avgPricePerPeriod} USDC
				</span>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Min trade size</span>
				<span class="font-medium text-xs">
					{minTradeAmount ? formatUnits(minTradeAmount, selectedOutputToken.decimals) : '0'} USDC
				</span>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Max trade size</span>
				<span class="font-medium text-xs">
					{maxTradeAmount ? formatUnits(maxTradeAmount, selectedOutputToken.decimals) : '0'} USDC
				</span>
			</div>
		</div>
	</div>

	<!-- Price Oracle Info (simplified) -->
	{#if hasValidPriceFeedId(selectedInputToken)}
	<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
		<h4 class="mb-3 text-sm font-medium text-gray-300">Current Market Price</h4>
		<div class="overflow-x-auto">
			<table class="min-w-full text-sm text-gray-200">
				<thead>
					<tr class="border-b border-white/10">
						<th class="px-2 py-1 text-left">Token</th>
						<th class="px-2 py-1 text-right">Oracle Price</th>
						<th class="px-2 py-1 text-right">Confidence</th>
					</tr>
				</thead>
				<tbody>
					<PythOracleRow token={selectedInputToken} tokenQuotes={$tokenGlobalQuote} />
				</tbody>
			</table>
		</div>
	</div>
	{/if}

	<!-- Deploy Button -->
	<button
		on:click={handleDcaDeploy}
		disabled={disableDeploy}
		class="w-full rounded-md px-4 py-3 text-sm font-semibold text-black transition-all {disableDeploy
			? 'cursor-not-allowed bg-gray-600 opacity-50'
			: 'bg-yellow-500 hover:bg-yellow-600'}"
	>
		{#if disableDeploy}
			{#if !selectedAmount}
				Enter a budget amount
			{:else if !selectedPeriod}
				Enter a period
			{:else if !selectedBaseline}
				Enter a floor price
			{:else if !selectedInitialRatio}
				Enter an initial ratio
			{:else}
				Complete all fields
			{/if}
		{:else}
			Start DCA Strategy
		{/if}
	</button>
</div>
{:else}
	<div class="flex h-32 items-center justify-center">
		<p class="text-gray-400">Loading...</p>
	</div>
{/if}
