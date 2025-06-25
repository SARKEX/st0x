<script lang="ts">
	import { STOXs, USDC_TOKEN } from '$lib/network';
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import {
		validateBaseline,
		validateOverrideDepositAmount,
		validateSelectedAmount
	} from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';

	const TOKENS: Token[] = STOXs.concat(USDC_TOKEN);

	let showAdvancedOptions = false;
	let selectedToken1: Token = TOKENS[TOKENS.length - 1];
	let selectedToken2: Token = TOKENS[0];
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

	$: isToken1SameAsToken2 =
		selectedToken1.address.toLowerCase() === selectedToken2.address.toLowerCase();

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
		isToken1SameAsToken2;

	const handleDsfDeploy = () => {
		if ($connected) {
			transactionStore.handleDsfDeploy({
				token1: selectedToken1,
				token2: selectedToken2,
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
				outputVaultIdToken2: outputVaultId2
			});
		}
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Token 1</span>
				<TokenSelect options={TOKENS} bind:selected={selectedToken1} />
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Token 2</span>
				<TokenSelect options={TOKENS} bind:selected={selectedToken2} />
			</div>
		</div>

		<div class="flex flex-col sm:flex-row gap-3 sm:gap-6">
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
					bind:checked={isToken1FastExit}
				/>
				<span class="text-sm">{selectedToken1.symbol || 'Token 1'} Fast Exit</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
					bind:checked={isToken2FastExit}
				/>
				<span class="text-sm">{selectedToken2.symbol || 'Token 2'} Fast Exit</span>
			</label>
		</div>

		<div>
			<span class="mb-2 block text-sm font-medium text-gray-300">
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

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
			<div>
				<div class="space-y-2">
					<div class="relative">
						<span class="text-sm font-medium text-gray-300"
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
						<span class="text-sm font-medium text-gray-300"
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
						<span class="text-sm font-medium text-gray-300">Minimum Trade Amount</span>
						<TradeAmountInput
							amountToken={selectedToken1}
							bind:amount={minTradeAmount}
							validate={validateSelectedAmount}
							bind:isError={minTradeAmountError}
						/>
					</div>
					<div class="relative">
						<span class="text-sm font-medium text-gray-300">Maximum Trade Amount</span>
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
				<div>
					<span class="mb-2 block text-sm font-medium text-gray-300">Enter Vault IDs</span>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
						<div class="space-y-2">
							<div class="relative">
								<span class="text-sm font-medium text-gray-300"
									>Input {selectedToken1.symbol} Vault ID</span
								>
								<VaultIdInput bind:vaultId={inputVaultId1} bind:isError={inputVaultId1Error} />
							</div>
							<div class="relative">
								<span class="text-sm font-medium text-gray-300"
									>Input {selectedToken2.symbol} Vault ID</span
								>
								<VaultIdInput bind:vaultId={inputVaultId2} bind:isError={inputVaultId2Error} />
							</div>
						</div>
						<div class="space-y-2">
							<div class="relative">
								<span class="text-sm font-medium text-gray-300"
									>Output {selectedToken1.symbol} Vault ID</span
								>
								<VaultIdInput bind:vaultId={outputVaultId1} bind:isError={outputVaultId1Error} />
							</div>
							<div class="relative">
								<span class="text-sm font-medium text-gray-300"
									>Output {selectedToken2.symbol} Vault ID</span
								>
								<VaultIdInput bind:vaultId={outputVaultId2} bind:isError={outputVaultId2Error} />
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Order Summary and Button: always below form on mobile, side on desktop -->
	<div class="space-y-4 mt-4 lg:mt-0">
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Active Liquidity Order Summary</h4>
			<div class="space-y-2">
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Trading Pair</span>
					<span class="font-medium text-white"
						>{selectedToken1 && selectedToken2
							? `${selectedToken1.symbol}/${selectedToken2.symbol}`
							: 'Select tokens'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Initial Ratio</span>
					<span class="font-medium text-white">{initialIo}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Cost Basis</span>
					<span class="font-medium text-white">1</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Spread</span>
					<span class="font-medium text-white">1</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Time Per Epoch</span>
					<span class="font-medium text-white">1 hour</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">{selectedToken1.symbol} Fast Exit</span>
					<span class="font-medium text-white">{isToken1FastExit ? 'Yes' : 'No'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">{selectedToken2.symbol} Fast Exit</span>
					<span class="font-medium text-white">{isToken2FastExit ? 'Yes' : 'No'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">{selectedToken1.symbol} Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(depositAmount1 ?? 0n, selectedToken1.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">{selectedToken2.symbol} Deposit Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(depositAmount2 ?? 0n, selectedToken2.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Minimum Trade Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(minTradeAmount ?? 0n, selectedToken1.decimals)}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Maximum Trade Amount</span>
					<span class="font-medium text-white"
						>{formatUnits(maxTradeAmount ?? 0n, selectedToken1.decimals)}</span
					>
				</div>
			</div>
		</div>

		<button
			class="w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 font-semibold transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
			disabled={disableDeploy}
			on:click={handleDsfDeploy}
		>
			Deploy Order
		</button>
	</div>
</div>
