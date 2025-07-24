<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import { validateOverrideDepositAmount } from '$lib/validateDeploymentArgs';
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

	// Selected Tokens
	let selectedToken1: Token | undefined;
	let selectedToken2: Token | undefined;
	let selectedToken3: Token | undefined;
	let selectedToken4: Token | undefined;
	let selectedToken5: Token | undefined;
	let selectedToken6: Token | undefined;
	let selectedToken7: Token | undefined;

	// Advanced Options
	let showAdvancedOptions = false;

	// Overrides Options
	let overrideThreshold: string | undefined;
	let overrideFee: string | undefined;
	let overrideDepositAmount1: bigint = 0n;
	let overrideDepositAmount2: bigint = 0n;
	let overrideDepositAmount3: bigint = 0n;
	let overrideDepositAmount4: bigint = 0n;
	let overrideDepositAmount5: bigint = 0n;
	let overrideDepositAmount6: bigint = 0n;
	let overrideDepositAmount7: bigint = 0n;
	let inputVaultId1: Hex | undefined;
	let inputVaultId2: Hex | undefined;
	let inputVaultId3: Hex | undefined;
	let inputVaultId4: Hex | undefined;
	let inputVaultId5: Hex | undefined;
	let inputVaultId6: Hex | undefined;
	let inputVaultId7: Hex | undefined;
	let outputVaultId1: Hex | undefined;
	let outputVaultId2: Hex | undefined;
	let outputVaultId3: Hex | undefined;
	let outputVaultId4: Hex | undefined;
	let outputVaultId5: Hex | undefined;
	let outputVaultId6: Hex | undefined;
	let outputVaultId7: Hex | undefined;

	// Reset selections when network changes
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		// Set default selections for new network (up to 7 tokens)
		selectedToken1 = ALL_TOKENS[0];
		selectedToken2 = ALL_TOKENS[1] || ALL_TOKENS[0];
		selectedToken3 = ALL_TOKENS[2] || ALL_TOKENS[0];
		selectedToken4 = ALL_TOKENS[3] || ALL_TOKENS[0];
		selectedToken5 = ALL_TOKENS[4] || ALL_TOKENS[0];
		selectedToken6 = ALL_TOKENS[5] || ALL_TOKENS[0];
		selectedToken7 = ALL_TOKENS[6] || ALL_TOKENS[0];
		// Reset form state
		overrideThreshold = undefined;
		overrideFee = undefined;
		overrideDepositAmount1 = 0n;
		overrideDepositAmount2 = 0n;
		overrideDepositAmount3 = 0n;
		overrideDepositAmount4 = 0n;
		overrideDepositAmount5 = 0n;
		overrideDepositAmount6 = 0n;
		overrideDepositAmount7 = 0n;
		inputVaultId1 = undefined;
		inputVaultId2 = undefined;
		inputVaultId3 = undefined;
		inputVaultId4 = undefined;
		inputVaultId5 = undefined;
		inputVaultId6 = undefined;
		inputVaultId7 = undefined;
		outputVaultId1 = undefined;
		outputVaultId2 = undefined;
		outputVaultId3 = undefined;
		outputVaultId4 = undefined;
		outputVaultId5 = undefined;
		outputVaultId6 = undefined;
		outputVaultId7 = undefined;
		// Reset errors
		overrideDepositAmount1Error = false;
		overrideDepositAmount2Error = false;
		overrideDepositAmount3Error = false;
		overrideDepositAmount4Error = false;
		overrideDepositAmount5Error = false;
		overrideDepositAmount6Error = false;
		overrideDepositAmount7Error = false;
		inputVaultId1Error = false;
		inputVaultId2Error = false;
		inputVaultId3Error = false;
		inputVaultId4Error = false;
		inputVaultId5Error = false;
		inputVaultId6Error = false;
		inputVaultId7Error = false;
		outputVaultId1Error = false;
		outputVaultId2Error = false;
		outputVaultId3Error = false;
		outputVaultId4Error = false;
		outputVaultId5Error = false;
		outputVaultId6Error = false;
		outputVaultId7Error = false;
		overrideThresholdError = false;
		overrideFeeError = false;
	}

	// errors
	let overrideDepositAmount1Error: boolean = false;
	let overrideDepositAmount2Error: boolean = false;
	let overrideDepositAmount3Error: boolean = false;
	let overrideDepositAmount4Error: boolean = false;
	let overrideDepositAmount5Error: boolean = false;
	let overrideDepositAmount6Error: boolean = false;
	let overrideDepositAmount7Error: boolean = false;
	let inputVaultId1Error: boolean = false;
	let inputVaultId2Error: boolean = false;
	let inputVaultId3Error: boolean = false;
	let inputVaultId4Error: boolean = false;
	let inputVaultId5Error: boolean = false;
	let inputVaultId6Error: boolean = false;
	let inputVaultId7Error: boolean = false;
	let outputVaultId1Error: boolean = false;
	let outputVaultId2Error: boolean = false;
	let outputVaultId3Error: boolean = false;
	let outputVaultId4Error: boolean = false;
	let outputVaultId5Error: boolean = false;
	let outputVaultId6Error: boolean = false;
	let outputVaultId7Error: boolean = false;
	let overrideThresholdError: boolean = false;
	let overrideFeeError: boolean = false;

	$: depositAmount1 = overrideDepositAmount1 ? overrideDepositAmount1 : 0n;
	$: depositAmount2 = overrideDepositAmount2 ? overrideDepositAmount2 : 0n;
	$: depositAmount3 = overrideDepositAmount3 ? overrideDepositAmount3 : 0n;
	$: depositAmount4 = overrideDepositAmount4 ? overrideDepositAmount4 : 0n;
	$: depositAmount5 = overrideDepositAmount5 ? overrideDepositAmount5 : 0n;
	$: depositAmount6 = overrideDepositAmount6 ? overrideDepositAmount6 : 0n;
	$: depositAmount7 = overrideDepositAmount7 ? overrideDepositAmount7 : 0n;

	$: disableDeploy =
		overrideThresholdError ||
		overrideFeeError ||
		overrideDepositAmount1Error ||
		overrideDepositAmount2Error ||
		overrideDepositAmount3Error ||
		overrideDepositAmount4Error ||
		overrideDepositAmount5Error ||
		overrideDepositAmount6Error ||
		overrideDepositAmount7Error ||
		inputVaultId1Error ||
		inputVaultId2Error ||
		inputVaultId3Error ||
		inputVaultId4Error ||
		inputVaultId5Error ||
		inputVaultId6Error ||
		inputVaultId7Error ||
		outputVaultId1Error ||
		outputVaultId2Error ||
		outputVaultId3Error ||
		outputVaultId4Error ||
		outputVaultId5Error ||
		outputVaultId6Error ||
		outputVaultId7Error;

	const handleFolioDeploy = () => {
		if ($connected && selectedToken1 && selectedToken2 && selectedToken3 && selectedToken4 && selectedToken5 && selectedToken6 && selectedToken7) {
			transactionStore.handleFolioDeploy({
				selectedToken1: selectedToken1,
				selectedToken2: selectedToken2,
				selectedToken3: selectedToken3,
				selectedToken4: selectedToken4,
				selectedToken5: selectedToken5,
				selectedToken6: selectedToken6,
				selectedToken7: selectedToken7,
				overrideThreshold: overrideThreshold,
				overrideFee: overrideFee,
				depositAmount1: depositAmount1,
				depositAmount2: depositAmount2,
				depositAmount3: depositAmount3,
				depositAmount4: depositAmount4,
				depositAmount5: depositAmount5,
				depositAmount6: depositAmount6,
				depositAmount7: depositAmount7,
				inputVaultId1: inputVaultId1,
				inputVaultId2: inputVaultId2,
				inputVaultId3: inputVaultId3,
				inputVaultId4: inputVaultId4,
				inputVaultId5: inputVaultId5,
				inputVaultId6: inputVaultId6,
				inputVaultId7: inputVaultId7,
				outputVaultId1: outputVaultId1,
				outputVaultId2: outputVaultId2,
				outputVaultId3: outputVaultId3,
				outputVaultId4: outputVaultId4,
				outputVaultId5: outputVaultId5,
				outputVaultId6: outputVaultId6,
				outputVaultId7: outputVaultId7
			});
		}
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div>
			<h3 class="mb-4 text-lg font-semibold">Select Tokens</h3>
			<p class="mb-6 text-sm text-gray-400">
				Select the tokens that you want to use in your portfolio.
			</p>
			<div class="grid grid-cols-1 gap-3 sm:gap-4">
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 1</span>
					{#if selectedToken1}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken1} on:change={(e) => selectedToken1 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[0]} on:change={(e) => selectedToken1 = e.detail.token} />
					{/if}
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 2</span>
					{#if selectedToken2}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken2} on:change={(e) => selectedToken2 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[1] || ALL_TOKENS[0]} on:change={(e) => selectedToken2 = e.detail.token} />
					{/if}
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 3</span>
					{#if selectedToken3}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken3} on:change={(e) => selectedToken3 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[2] || ALL_TOKENS[0]} on:change={(e) => selectedToken3 = e.detail.token} />
					{/if}
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 4</span>
					{#if selectedToken4}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken4} on:change={(e) => selectedToken4 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[3] || ALL_TOKENS[0]} on:change={(e) => selectedToken4 = e.detail.token} />
					{/if}
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 5</span>
					{#if selectedToken5}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken5} on:change={(e) => selectedToken5 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[4] || ALL_TOKENS[0]} on:change={(e) => selectedToken5 = e.detail.token} />
					{/if}
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 6</span>
					{#if selectedToken6}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken6} on:change={(e) => selectedToken6 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[5] || ALL_TOKENS[0]} on:change={(e) => selectedToken6 = e.detail.token} />
					{/if}
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 7</span>
					{#if selectedToken7}
						<TokenSelect options={ALL_TOKENS} selected={selectedToken7} on:change={(e) => selectedToken7 = e.detail.token} />
					{:else}
						<TokenSelect options={ALL_TOKENS} selected={ALL_TOKENS[6] || ALL_TOKENS[0]} on:change={(e) => selectedToken7 = e.detail.token} />
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
					<span class="block text-sm font-medium text-gray-300">Threshold</span>
					<Input
						type="text"
						placeholder="0.05"
						bind:value={overrideThreshold}
						bind:isError={overrideThresholdError}
					/>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Fee</span>
					<Input
						type="text"
						placeholder="0.003"
						bind:value={overrideFee}
						bind:isError={overrideFeeError}
					/>
				</div>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 1 Deposit Amount</span>
					{#if selectedToken1}
						<TradeAmountInput
							amountToken={selectedToken1}
							bind:amount={overrideDepositAmount1}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount1Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 1 first
						</div>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 2 Deposit Amount</span>
					{#if selectedToken2}
						<TradeAmountInput
							amountToken={selectedToken2}
							bind:amount={overrideDepositAmount2}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount2Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 2 first
						</div>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 3 Deposit Amount</span>
					{#if selectedToken3}
						<TradeAmountInput
							amountToken={selectedToken3}
							bind:amount={overrideDepositAmount3}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount3Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 3 first
						</div>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 4 Deposit Amount</span>
					{#if selectedToken4}
						<TradeAmountInput
							amountToken={selectedToken4}
							bind:amount={overrideDepositAmount4}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount4Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 4 first
						</div>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 5 Deposit Amount</span>
					{#if selectedToken5}
						<TradeAmountInput
							amountToken={selectedToken5}
							bind:amount={overrideDepositAmount5}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount5Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 5 first
						</div>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 6 Deposit Amount</span>
					{#if selectedToken6}
						<TradeAmountInput
							amountToken={selectedToken6}
							bind:amount={overrideDepositAmount6}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount6Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 6 first
						</div>
					{/if}
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 7 Deposit Amount</span>
					{#if selectedToken7}
						<TradeAmountInput
							amountToken={selectedToken7}
							bind:amount={overrideDepositAmount7}
							validate={validateOverrideDepositAmount}
							bind:isError={overrideDepositAmount7Error}
						/>
					{:else}
						<div class="rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-gray-400">
							Select Token 7 first
						</div>
					{/if}
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 1 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken1?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId1} bind:isError={inputVaultId1Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken1?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId1} bind:isError={outputVaultId1Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 2 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken2?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId2} bind:isError={inputVaultId2Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken2?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId2} bind:isError={outputVaultId2Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 3 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken3?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId3} bind:isError={inputVaultId3Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken3?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId3} bind:isError={outputVaultId3Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 4 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken4?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId4} bind:isError={inputVaultId4Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken4?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId4} bind:isError={outputVaultId4Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 5 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken5?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId5} bind:isError={inputVaultId5Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken5?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId5} bind:isError={outputVaultId5Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 6 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken6?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId6} bind:isError={inputVaultId6Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken6?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId6} bind:isError={outputVaultId6Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 7 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken7?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId7} bind:isError={inputVaultId7Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken7?.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId7} bind:isError={outputVaultId7Error} />
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
						{#if selectedToken1 && hasValidPriceFeedId(selectedToken1)}
							<PythOracleRow token={selectedToken1} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken1?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedToken2 && hasValidPriceFeedId(selectedToken2)}
							<PythOracleRow token={selectedToken2} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken2?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedToken3 && hasValidPriceFeedId(selectedToken3)}
							<PythOracleRow token={selectedToken3} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken3?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedToken4 && hasValidPriceFeedId(selectedToken4)}
							<PythOracleRow token={selectedToken4} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken4?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedToken5 && hasValidPriceFeedId(selectedToken5)}
							<PythOracleRow token={selectedToken5} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken5?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedToken6 && hasValidPriceFeedId(selectedToken6)}
							<PythOracleRow token={selectedToken6} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken6?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
						{#if selectedToken7 && hasValidPriceFeedId(selectedToken7)}
							<PythOracleRow token={selectedToken7} tokenQuotes={$tokenGlobalQuote} />
						{:else}
							<tr>
								<td class="px-2 py-1">{selectedToken7?.symbol ?? '-'}</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
								<td class="px-2 py-1 text-right">-</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
			<div class="mt-2 flex flex-col gap-2 sm:hidden">
				{#each [selectedToken1, selectedToken2, selectedToken3, selectedToken4, selectedToken5, selectedToken6, selectedToken7] as token}
					{#if token && hasValidPriceFeedId(token)}
						<PythOracleRow {token} tokenQuotes={$tokenGlobalQuote} />
					{:else}
						<div class="rounded bg-gray-800/80 p-3 text-xs">
							<div><span class="font-semibold">Token: </span>{token?.symbol ?? '-'}</div>
							<div><span class="font-semibold">Oracle Price: </span>-</div>
							<div><span class="font-semibold">Price Certainty: </span>-</div>
							<div><span class="font-semibold">Real-Time: </span>-</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>

		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Portfolio Order Summary</h4>
			<div class="space-y-2">
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Threshold</span>
					<span class="font-medium text-white">{overrideThreshold || '0.05'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Fee</span>
					<span class="font-medium text-white">{overrideFee || '0.003'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 1</span>
					<span class="font-medium text-white">{selectedToken1?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 2</span>
					<span class="font-medium text-white">{selectedToken2?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 3</span>
					<span class="font-medium text-white">{selectedToken3?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 4</span>
					<span class="font-medium text-white">{selectedToken4?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 5</span>
					<span class="font-medium text-white">{selectedToken5?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 6</span>
					<span class="font-medium text-white">{selectedToken6?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 7</span>
					<span class="font-medium text-white">{selectedToken7?.symbol || 'Not selected'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 1 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken1 ? formatUnits(overrideDepositAmount1 ?? 0n, selectedToken1.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 2 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken2 ? formatUnits(overrideDepositAmount2 ?? 0n, selectedToken2.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 3 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken3 ? formatUnits(overrideDepositAmount3 ?? 0n, selectedToken3.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 4 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken4 ? formatUnits(overrideDepositAmount4 ?? 0n, selectedToken4.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 5 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken5 ? formatUnits(overrideDepositAmount5 ?? 0n, selectedToken5.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 6 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken6 ? formatUnits(overrideDepositAmount6 ?? 0n, selectedToken6.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 7 Deposit Amount</span>
					<span class="font-medium text-white"
						>{selectedToken7 ? formatUnits(overrideDepositAmount7 ?? 0n, selectedToken7.decimals) : '0'}</span
					>
				</div>
			</div>
		</div>

		<button
			class="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 font-semibold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disableDeploy}
			on:click={handleFolioDeploy}
		>
			Deploy Order
		</button>
	</div>
</div>
