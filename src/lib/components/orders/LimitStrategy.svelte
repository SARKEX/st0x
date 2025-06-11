<script lang="ts">
	import { STOXs, USDC_TOKEN } from '$lib/network';
	import Select from '$lib/components/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import { validateBaseline, validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import { formatUnits } from 'viem';
	import type { Hex } from 'viem';
	import transactionStore from '$lib/transactionStore';

	const TOKENS: Token[] = STOXs.concat(USDC_TOKEN);

	let selectedInputToken: Token = TOKENS[0];
	let selectedOutputToken: Token = TOKENS[TOKENS.length - 1];
	let selectedInitialRatio: string = '';
	let selectedAmount: bigint = 0n;
	let inputVaultId: Hex | undefined;
	let outputVaultId: Hex | undefined;

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken.address.toLowerCase() === selectedInputToken.address.toLowerCase();

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
		transactionStore.handleLimitDeploy({
			outputToken: selectedOutputToken,
			inputToken: selectedInputToken,
			ioRatio: selectedInitialRatio,
			depositAmount: selectedAmount,
			inputVaultId: inputVaultId,
			outputVaultId: outputVaultId
		});
	};
</script>

<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Base Token</span>
				<Select
					options={TOKENS}
					bind:selected={selectedInputToken}
					getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
				/>
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Quote Token</span>
				<Select
					options={TOKENS}
					bind:selected={selectedOutputToken}
					getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
				/>
			</div>
			{#if isInputTokenSameAsOutputToken}
				<div class="mt-0 text-sm text-red-500">
					Same tokens are not allowed for both budget and buy tokens
				</div>
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">
					Initial Ratio {selectedInputToken && selectedOutputToken
						? `${selectedInputToken.symbol}/${selectedOutputToken.symbol}`
						: ''}
				</span>
				<div class="relative">
					<Input
						type="number"
						unit={selectedInputToken.symbol}
						bind:amount={selectedInitialRatio}
						validate={validateBaseline}
						bind:isError={selectedInitialRatioError}
					/>
				</div>
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Amount</span>
				<div class="relative">
					<TradeAmountInput
						amountToken={selectedOutputToken}
						bind:amount={selectedAmount}
						validate={validateSelectedAmount}
						bind:isError={selectedAmountError}
					/>
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
				<div class="grid grid-cols-2 gap-4">
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedInputToken.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId} bind:isError={inputVaultIdError} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedOutputToken.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId} bind:isError={outputVaultIdError} />
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="space-y-4">
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
					<span class="text-gray-400">Initial Ratio</span>
					<span class="font-medium text-white"
						>{selectedInitialRatio} {selectedInputToken.symbol}/{selectedOutputToken.symbol}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(selectedAmount ?? 0n, selectedOutputToken.decimals)}
						{selectedOutputToken.symbol}</span
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
