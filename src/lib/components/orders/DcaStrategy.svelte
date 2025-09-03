<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import Select from '$lib/components/ui/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import type { PythToken } from '$lib/types';
	import {
		validateBaseline,
		validatePeriod,
		validateSelectedAmount
	} from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/ui/Input.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';
	import { hasValidPriceFeedId, getBaseline } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';
	import { containerStyles } from '$lib/utils/styles';

	let selectedOrderType: 'Buy' | 'Sell' = 'Buy';

	export let passedInputToken: PythToken | undefined; // The token we're accumulating

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Initialize tokens - accumulating token from prop, USDC for payment
	let selectedInputToken: Token;
	let selectedOutputToken: Token;

	// Resolve tokens whenever network, token list, or prop changes
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const usdcToken = ALL_TOKENS.find((t) => t.symbol?.toUpperCase() === 'USDC');
		selectedOutputToken = usdcToken || ALL_TOKENS[0];
		selectedInputToken =
			(passedInputToken as unknown as Token) || selectedInputToken || ALL_TOKENS[0];
	}

	let selectedAmount: bigint = 0n;
	let selectedPeriodUnit: 'Days' | 'Hours' | 'Minutes' = 'Days';
	let selectedPeriod: string = '';
	let selectedBaseline: string = '';
	let selectedInitialRatio: string = '';

	let inputVaultId: Hex | undefined;
	let outputVaultId: Hex | undefined;

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken?.address.toLowerCase() === selectedInputToken?.address.toLowerCase();

	// errors
	let selectedAmountError: boolean = false;
	let selectedPeriodError: boolean = false;
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
			// For Buy: spend USDC (output), receive asset (input)
			// For Sell: spend asset (output), receive USDC (input)
			const outputTok = selectedOrderType === 'Buy' ? selectedOutputToken : selectedInputToken;
			const inputTok = selectedOrderType === 'Buy' ? selectedInputToken : selectedOutputToken;
			transactionStore.handleDcaDeploy({
				outputToken: outputTok,
				inputToken: inputTok,
				budgetAmount: selectedAmount,
				selectedPeriod: selectedPeriod,
				selectedPeriodUnit: selectedPeriodUnit,
				baseline: getBaseline(selectedOrderType, selectedBaseline),
				kickoff: getBaseline(selectedOrderType, selectedInitialRatio),
				minTradeAmount: minTradeAmount,
				maxTradeAmount: maxTradeAmount,
				inputVaultId: inputVaultId,
				outputVaultId: outputVaultId,
				depositAmount: depositAmount
			});
		}
	};

	// Calculate average price per period
	$: avgPricePerPeriod =
		selectedAmount && selectedPeriod
			? (
					parseFloat(formatUnits(selectedAmount, selectedOutputToken?.decimals || 18)) /
					parseFloat(selectedPeriod || '1')
				).toFixed(2)
			: '0.00';

	// Default Start Price to oracle price when available and if user hasn't entered a value yet
	$: if (hasValidPriceFeedId(selectedInputToken) && !selectedInitialRatio) {
		const feedId = (selectedInputToken as unknown as { priceFeedId?: string })?.priceFeedId;
		if (feedId) {
			fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`)
				.then((r) => r.json())
				.then((data) => {
					const parsed = data?.parsed?.[0]?.price;
					if (parsed) {
						const px = Number(parsed.price) * Math.pow(10, parsed.expo);
						if (!Number.isNaN(px) && !selectedInitialRatio) {
							selectedInitialRatio = String(px);
						}
					}
				})
				.catch(() => {
					// silently ignore; user can input manually
				});
		}
	}
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0}
	<div class="space-y-4">
		<!-- Action toggle and header -->
		<div class="rounded-lg bg-gray-800/50 p-4">
			<div class="mb-3 flex gap-2">
				<button
					on:click={() => (selectedOrderType = 'Buy')}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedOrderType ===
					'Buy'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}">Buy</button
				>
				<button
					on:click={() => (selectedOrderType = 'Sell')}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedOrderType ===
					'Sell'
						? 'bg-yellow-500/20 text-yellow-500'
						: 'text-gray-400 hover:text-white'}">Sell</button
				>
			</div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-400"
						>{selectedOrderType === 'Buy' ? 'Buying' : 'Selling'}</span
					>
					<div class="flex items-center gap-2">
						{#if selectedInputToken.logoUrl}
							<img
								src={selectedInputToken.logoUrl}
								alt={selectedInputToken.symbol}
								class="h-6 w-6 rounded-full"
							/>
						{/if}
						<span class="text-lg font-semibold">{selectedInputToken.symbol}</span>
					</div>
				</div>
				<div class="flex items-center gap-2 text-sm text-gray-400">
					<span>{selectedOrderType === 'Buy' ? 'with' : 'for'}</span>
					<img src="/images/USDC.png" alt="USDC" class="h-5 w-5" />
					<span>USDC</span>
				</div>
			</div>
		</div>

		<!-- Budget and Period -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Budget Amount
					<span class="ml-1 text-xs text-gray-500"
						>({selectedOrderType === 'Buy' ? 'USDC' : selectedInputToken.symbol})</span
					>
				</div>
				<TradeAmountInput
					aria-label="Budget Amount"
					amountToken={selectedOrderType === 'Buy' ? selectedOutputToken : selectedInputToken}
					bind:amount={selectedAmount}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Budget Period Every</div>
				<div class="flex gap-2">
					<div class="flex-grow">
						<Input
							aria-label="Budget period"
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
				<div class="mb-2 block text-sm font-medium text-gray-300">
					{selectedOrderType === 'Buy' ? 'Ceiling Price' : 'Floor Price'}
					<span class="ml-1 text-xs text-gray-500">({selectedInputToken.symbol}/USDC)</span>
				</div>
				<Input
					aria-label="Floor Price"
					type="number"
					unit={selectedInputToken.symbol}
					bind:amount={selectedBaseline}
					validate={validateBaseline}
					bind:isError={selectedBaselineError}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Start Price
					<span class="ml-1 text-xs text-gray-500">({selectedInputToken.symbol}/USDC)</span>
				</div>
				<Input
					aria-label="Initial Ratio"
					type="number"
					unit={selectedInputToken.symbol}
					bind:amount={selectedInitialRatio}
					validate={validateBaseline}
					bind:isError={selectedInitialRatioError}
				/>
			</div>
		</div>

		<!-- Summary and Market Price side by side -->
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<!-- Order Summary -->
			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-400">Total Budget</span>
						<span class="font-medium">
							{#if selectedOrderType === 'Buy'}
								{selectedAmount ? formatUnits(selectedAmount, selectedOutputToken.decimals) : '0'} USDC
							{:else}
								{selectedAmount ? formatUnits(selectedAmount, selectedInputToken.decimals) : '0'}
								{selectedInputToken.symbol}
							{/if}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Period</span>
						<span class="font-medium">
							Every {selectedPeriod || '0'}
							{selectedPeriodUnit.toLowerCase()}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Average per period</span>
						<span class="font-medium">
							{#if selectedOrderType === 'Buy'}
								~{avgPricePerPeriod} USDC
							{:else}
								~{avgPricePerPeriod} {selectedInputToken.symbol}
							{/if}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Min trade size</span>
						<span class="text-xs font-medium">
							{#if selectedOrderType === 'Buy'}
								{minTradeAmount ? formatUnits(minTradeAmount, selectedOutputToken.decimals) : '0'} USDC
							{:else}
								{minTradeAmount ? formatUnits(minTradeAmount, selectedInputToken.decimals) : '0'}
								{selectedInputToken.symbol}
							{/if}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Max trade size</span>
						<span class="text-xs font-medium">
							{#if selectedOrderType === 'Buy'}
								{maxTradeAmount ? formatUnits(maxTradeAmount, selectedOutputToken.decimals) : '0'} USDC
							{:else}
								{maxTradeAmount ? formatUnits(maxTradeAmount, selectedInputToken.decimals) : '0'}
								{selectedInputToken.symbol}
							{/if}
						</span>
					</div>
				</div>
			</div>

			<!-- Current Market Price -->
			{#if hasValidPriceFeedId(selectedInputToken)}
				<div class={containerStyles.cardBordered}>
					<h4 class="mb-3 text-sm font-medium text-gray-300">Current Market Price</h4>
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm text-gray-200">
							<thead>
								<tr class="border-b border-white/10">
									<th class="px-2 py-1 text-left">Token</th>
									<th class="px-2 py-1 text-right">Oracle Price</th>
									<th class="px-2 py-1 text-right">Confidence</th>
									<th class="px-2 py-1 text-right">Off-chain</th>
								</tr>
							</thead>
							<tbody>
								<PythOracleRow token={selectedInputToken} tokenQuotes={$tokenGlobalQuote} />
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>

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
					{selectedOrderType === 'Buy' ? 'Enter a ceiling price' : 'Enter a floor price'}
				{:else if !selectedInitialRatio}
					Enter a start price
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
