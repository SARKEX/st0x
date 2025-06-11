<script lang="ts">
	import { STOXs, USDC_TOKEN } from '$lib/network';
	import Select from '$lib/components/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import { validateOverrideDepositAmount } from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';

	const TOKENS: Token[] = STOXs.concat(USDC_TOKEN);

	// Selected Tokens
	let selectedToken1: Token = TOKENS[1];
	let selectedToken2: Token = TOKENS[2];
	let selectedToken3: Token = TOKENS[3];
	let selectedToken4: Token = TOKENS[4];
	let selectedToken5: Token = TOKENS[5];
	let selectedToken6: Token = TOKENS[6];
	let selectedToken7: Token = TOKENS[7];

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
		if ($connected) {
			console.log('handleFolioDeploy');
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

<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div>
			<h3 class="mb-4 text-lg font-semibold">Select Tokens</h3>
			<p class="mb-6 text-sm text-gray-400">
				Select the tokens that you want to use in your portfolio.
			</p>
			<div class="grid grid-cols-1 gap-4">
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 1</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken1}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
					/>
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 2</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken2}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
					/>
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 3</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken3}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
					/>
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 4</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken4}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
					/>
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 5</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken5}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
					/>
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 6</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken6}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
					/>
				</div>
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Token 7</span>
					<Select
						options={TOKENS}
						bind:selected={selectedToken7}
						getOptionLabel={(token) => `${token.symbol ?? ''} ${token.name ?? ''}`}
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
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Threshold</span>
					<Input
						type="text"
						placeholder="0.05"
						bind:value={overrideThreshold}
						bind:isError={overrideThresholdError}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Fee</span>
					<Input
						type="text"
						placeholder="0.003"
						bind:value={overrideFee}
						bind:isError={overrideFeeError}
					/>
				</div>

				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 1 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken1}
						bind:amount={overrideDepositAmount1}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount1Error}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 2 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken2}
						bind:amount={overrideDepositAmount2}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount2Error}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 3 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken3}
						bind:amount={overrideDepositAmount3}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount3Error}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 4 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken4}
						bind:amount={overrideDepositAmount4}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount4Error}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 5 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken5}
						bind:amount={overrideDepositAmount5}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount5Error}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 6 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken6}
						bind:amount={overrideDepositAmount6}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount6Error}
					/>
				</div>
				<div class="grid grid-cols-1 gap-4">
					<span class="block text-sm font-medium text-gray-300">Token 7 Deposit Amount</span>
					<TradeAmountInput
						amountToken={selectedToken7}
						bind:amount={overrideDepositAmount7}
						validate={validateOverrideDepositAmount}
						bind:isError={overrideDepositAmount7Error}
					/>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 1 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken1.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId1} bind:isError={inputVaultId1Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken1.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId1} bind:isError={outputVaultId1Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 2 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken2.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId2} bind:isError={inputVaultId2Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken2.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId2} bind:isError={outputVaultId2Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 3 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken3.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId3} bind:isError={inputVaultId3Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken3.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId3} bind:isError={outputVaultId3Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 4 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken4.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId4} bind:isError={inputVaultId4Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken4.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId4} bind:isError={outputVaultId4Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 5 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken5.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId5} bind:isError={inputVaultId5Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken5.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId5} bind:isError={outputVaultId5Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 6 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken6.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId6} bind:isError={inputVaultId6Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken6.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId6} bind:isError={outputVaultId6Error} />
					</div>
				</div>
				<div class="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4">
					<span class="block text-sm font-medium text-gray-300">Token 7 Vault ID</span>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Input {selectedToken7.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={inputVaultId7} bind:isError={inputVaultId7Error} />
					</div>
					<div class="flex flex-col gap-2">
						<span class="text-left text-sm font-medium text-gray-400">
							Output {selectedToken7.symbol} Vault ID
						</span>
						<VaultIdInput bind:vaultId={outputVaultId7} bind:isError={outputVaultId7Error} />
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="space-y-4">
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
					<span class="font-medium text-white">{selectedToken1.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 2</span>
					<span class="font-medium text-white">{selectedToken2.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 3</span>
					<span class="font-medium text-white">{selectedToken3.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 4</span>
					<span class="font-medium text-white">{selectedToken4.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 5</span>
					<span class="font-medium text-white">{selectedToken5.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 6</span>
					<span class="font-medium text-white">{selectedToken6.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Selected Token 7</span>
					<span class="font-medium text-white">{selectedToken7.symbol}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 1 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount1 ?? 0n, selectedToken1.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 2 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount2 ?? 0n, selectedToken2.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 3 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount3 ?? 0n, selectedToken3.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 4 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount4 ?? 0n, selectedToken4.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 5 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount5 ?? 0n, selectedToken5.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 6 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount6 ?? 0n, selectedToken6.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Token 7 Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(overrideDepositAmount7 ?? 0n, selectedToken7.decimals)}</span
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
