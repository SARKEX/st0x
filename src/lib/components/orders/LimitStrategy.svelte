<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import Select from '$lib/components/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import { validateBaseline, validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import { formatUnits } from 'viem';
	import type { Hex } from 'viem';
	import transactionStore from '$lib/transactionStore';
	import { getBaseline, hasValidPriceFeedId } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import type { PythToken } from '$lib/types';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';

	export let passedInputToken: PythToken | undefined;
	export let passedOutputToken: PythToken | undefined;
	export let passedOrderType: 'Buy' | 'Sell' = 'Buy';

	// Make ALL_TOKENS reactive to network changes
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Initialize with passed props or defaults
	let selectedInputToken: Token | undefined;
	let selectedOutputToken: Token | undefined;
	let selectedOrderType: 'Buy' | 'Sell' = passedOrderType;

	let selectedInitialRatio: string = '';
	let selectedAmount: bigint = 0n;
	let inputVaultId: Hex | undefined;
	let outputVaultId: Hex | undefined;

	// Reset selections when network changes or when passed props change
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		// Check if passed tokens are valid for current network
		const isValidInputToken = passedInputToken && ALL_TOKENS.some(token => 
			token.address.toLowerCase() === passedInputToken.address.toLowerCase()
		);
		const isValidOutputToken = passedOutputToken && ALL_TOKENS.some(token => 
			token.address.toLowerCase() === passedOutputToken.address.toLowerCase()
		);
		
		// Set default selections for new network
		selectedInputToken = isValidInputToken ? passedInputToken : (ALL_TOKENS[3] || ALL_TOKENS[0]);
		selectedOutputToken = isValidOutputToken ? passedOutputToken : (ALL_TOKENS[ALL_TOKENS.length - 1] || ALL_TOKENS[0]);
		
		// Reset form state
		selectedInitialRatio = '';
		selectedAmount = 0n;
		inputVaultId = undefined;
		outputVaultId = undefined;
		// Reset errors
		selectedInitialRatioError = false;
		selectedAmountError = false;
		inputVaultIdError = false;
		outputVaultIdError = false;
	}

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken?.address.toLowerCase() === selectedInputToken?.address.toLowerCase();

	let showAdvancedOptions = false;
	// errors
	let selectedInitialRatioError: boolean = false;
	let selectedAmountError: boolean = false;
	let inputVaultIdError: boolean = false;
	let outputVaultIdError: boolean = false;

	$: disableDeploy =
		!selectedAmount ||
		!selectedInitialRatio ||
		!selectedInputToken ||
		!selectedOutputToken ||
		isInputTokenSameAsOutputToken ||
		selectedInitialRatioError ||
		selectedAmountError ||
		inputVaultIdError ||
		outputVaultIdError;

	const handleDeploy = async () => {
		if (!selectedInputToken || !selectedOutputToken) return;
		transactionStore.handleLimitDeploy({
			outputToken: selectedOrderType === 'Buy' ? selectedOutputToken : selectedInputToken,
			inputToken: selectedOrderType === 'Buy' ? selectedInputToken : selectedOutputToken,
			ioRatio: getBaseline(selectedOrderType, selectedInitialRatio),
			depositAmount: selectedAmount,
			inputVaultId: selectedOrderType === 'Buy' ? inputVaultId : outputVaultId,
			outputVaultId: selectedOrderType === 'Buy' ? outputVaultId : inputVaultId
		});
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div class="grid grid-cols-1 gap-3 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Order Type</span>
				<Select
					options={['Buy', 'Sell']}
					bind:selected={selectedOrderType}
					getOptionLabel={(option) => option}
				/>
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300"
					>{selectedOrderType === 'Buy' ? 'Buy' : 'Sell'}</span
				>
				{#if selectedInputToken}
					<TokenSelect options={ALL_TOKENS} selected={selectedInputToken} on:change={(e) => selectedInputToken = e.detail.token} />
				{:else}
					<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[3] || ALL_TOKENS[0]} on:change={(e) => selectedInputToken = e.detail.token} />
				{/if}
			</div>
		</div>
		<div class="grid grid-cols-1 gap-3 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300"
					>{selectedOrderType === 'Buy' ? 'With' : 'For'}</span
				>
				{#if selectedOutputToken}
					<TokenSelect options={ALL_TOKENS} selected={selectedOutputToken} on:change={(e) => selectedOutputToken = e.detail.token} />
				{:else}
					<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[ALL_TOKENS.length - 1] || ALL_TOKENS[0]} on:change={(e) => selectedOutputToken = e.detail.token} />
				{/if}
			</div>
			{#if isInputTokenSameAsOutputToken}
				<div class="mt-0 text-sm text-red-500">
					Same tokens are not allowed for both budget and buy tokens
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">
					Price {selectedInputToken && selectedOutputToken
						? `${selectedOutputToken.symbol}/${selectedInputToken.symbol}`
						: ''}
				</span>
				<div class="relative">
					<Input
						type="number"
						unit={selectedOutputToken?.symbol}
						bind:amount={selectedInitialRatio}
						validate={validateBaseline}
						bind:isError={selectedInitialRatioError}
					/>
				</div>
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Amount</span>
				<div class="relative">
					{#if selectedOrderType === 'Buy' && selectedOutputToken}
						<TradeAmountInput
							amountToken={selectedOutputToken}
							bind:amount={selectedAmount}
							validate={validateSelectedAmount}
							bind:isError={selectedAmountError}
						/>
					{:else if selectedInputToken}
						<TradeAmountInput
							amountToken={selectedInputToken}
							bind:amount={selectedAmount}
							validate={validateSelectedAmount}
							bind:isError={selectedAmountError}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select tokens first
						</div>
					{/if}
				</div>
			</div>
		</div>

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
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							{selectedInputToken?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId} bind:isError={inputVaultIdError} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							{selectedOutputToken?.symbol} Vault ID
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
						<div><span class="font-semibold">Token: </span>{selectedOutputToken?.symbol ?? '-'}</div>
						<div><span class="font-semibold">Oracle Price: </span>-</div>
						<div><span class="font-semibold">Price Certainty: </span>-</div>
						<div><span class="font-semibold">Real-Time: </span>-</div>
					</div>
				{/if}
			</div>
		</div>
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
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
					<span class="text-gray-400">Price</span>
					<span class="font-medium text-white"
						>{selectedInitialRatio} {selectedOutputToken?.symbol}/{selectedInputToken?.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Amount</span>
					<span class="font-medium text-white"
						>{selectedOutputToken ? formatUnits(selectedAmount ?? 0n, selectedOutputToken.decimals) : '0'}
						{selectedOutputToken?.symbol}</span
					>
				</div>
			</div>
		</div>

		<button
			class="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 font-semibold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disableDeploy}
			on:click={handleDeploy}
		>
			Deploy Order
		</button>
	</div>
</div>
