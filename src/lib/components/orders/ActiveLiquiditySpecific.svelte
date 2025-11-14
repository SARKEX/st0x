<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/network';
	import {
		validateBaseline,
		validateOverrideDepositAmount,
		validateSelectedAmount
	} from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/ui/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';
	import { hasValidPriceFeedId } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork, oracleQuotes } from '$lib/stores';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import Button from '$lib/components/ui/Button.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { bytesToHex } from 'viem';
	import { getDcaDeploymentArgs, getMarketMakingDeploymentArgs } from '$lib/getDeploymentArgs';

	// Filter tokens based on current network
	$: ALL_TOKENS = getAllTokensByNetwork($currentNetwork.id);

	// Find and set fixed tokens: cbBTC for token1, tMSTR for token2
	$: if (ALL_TOKENS.length > 0) {
		const cbBTC = ALL_TOKENS.find((token) => token.symbol === 'cbBTC');
		const tMSTR = ALL_TOKENS.find((token) => token.symbol === 'tMSTR');
		
		if (cbBTC) {
			selectedToken1 = cbBTC;
		}
		if (tMSTR) {
			selectedToken2 = tMSTR;
		}
	}

	// Get USDC token for deposit amounts
	$: usdcToken = ALL_TOKENS.find((token) => token.symbol === 'USDC');

	// Get prices from Pyth oracles
	$: cbBTCPrice = selectedToken1 ? $oracleQuotes[selectedToken1.address.toLowerCase()]?.price ?? null : null;
	$: tMSTRPrice = selectedToken2 ? $oracleQuotes[selectedToken2.address.toLowerCase()]?.price ?? null : null;

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
		selectedToken1 && selectedToken2 && selectedToken1.address.toLowerCase() === selectedToken2.address.toLowerCase();

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

	const getRandHex = () => {
		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		const randomHex = bytesToHex(randomBytes);

		return randomHex;
	}

	const handleDsfDeploy = async () => {
		console.log('in handleDsfDeploy : ');
		
		const tMstrUsdcVaultId = getRandHex();
		const cbBtcUsdcVaultId = getRandHex();

		const tMstrVaultId = getRandHex();
		const cbBtcVaultId = getRandHex();

		if(!cbBTCPrice || !tMSTRPrice) {
			return;
		}

		const cbBTCPrice95Percent = cbBTCPrice * 0.95;
		const tMSTRPrice95Percent = tMSTRPrice * 0.95;

		const minTradeAmount1 = (depositAmount1 * 10n) / 100n;
		const maxTradeAmount1 = (depositAmount1 * 20n) / 100n;

		const minTradeAmount2 = (depositAmount2 * 10n) / 100n;
		const maxTradeAmount2 = (depositAmount2 * 20n) / 100n;
		
		if ($connected && selectedToken1 && selectedToken2 && usdcToken) {

			transactionStore.awaitWalletConfirmation('Preparing strategies...');
			const { deploymentArgs: cbBTCDeploymentArgs } = await getDcaDeploymentArgs({
					outputToken: usdcToken,
					inputToken: selectedToken1,
					budgetAmount: depositAmount1,
					selectedPeriod: '1',
					selectedPeriodUnit: 'Hours',
					baseline: (1 / cbBTCPrice95Percent).toFixed(18).toString(),
					kickoff: (1 / cbBTCPrice).toFixed(18).toString(),
					minTradeAmount: minTradeAmount1,
					maxTradeAmount: maxTradeAmount1,
					inputVaultId: cbBtcVaultId,
					outputVaultId: cbBtcUsdcVaultId,
					depositAmount: depositAmount1
				});
			const { deploymentArgs: tMSTRDeploymentArgs } = await getDcaDeploymentArgs({
					outputToken: usdcToken,
					inputToken: selectedToken2,
					budgetAmount: depositAmount2,
					selectedPeriod: '1',
					selectedPeriodUnit: 'Hours',
					baseline: (1 / tMSTRPrice95Percent).toFixed(18).toString(),
					kickoff: (1 / tMSTRPrice).toFixed(18).toString(),
					minTradeAmount: minTradeAmount2,
					maxTradeAmount: maxTradeAmount2,
					inputVaultId: tMstrVaultId,
					outputVaultId: tMstrUsdcVaultId,
					depositAmount: depositAmount2
				});
			
			transactionStore.awaitWalletConfirmation('Deploying strategies...');
			
			await transactionStore.handleStrategyBulkDeployment([cbBTCDeploymentArgs, tMSTRDeploymentArgs]);

			try {
				await transactionStore.handleDsfDeploy({
					token1: selectedToken1,
					token2: selectedToken2,
					amountIsFastExit: isToken1FastExit,
					notAmountIsFastExit: isToken2FastExit,
					initialIo: initialIo,
					maxAmount: maxTradeAmount,
					minAmount: minTradeAmount,
					depositAmountToken1: 0n,
					depositAmountToken2: 0n,
					inputVaultIdToken1: cbBtcVaultId,
					inputVaultIdToken2: tMstrVaultId,
					outputVaultIdToken1: cbBtcVaultId,
					outputVaultIdToken2: tMstrVaultId
				});
			} catch (error) {
				console.error('Active Liquidity deployment failed', error);
			}
		}
	};
</script>

<div class="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
	<div class="space-y-6 lg:col-span-2">
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Token 1</span>
				<div class="flex h-10 items-center rounded-lg border border-white/10 bg-gray-800/50 px-3 text-sm text-gray-300">
					{selectedToken1 ? selectedToken1.symbol : 'cbBTC'}
				</div>
			</div>
			<div>
				<span class="mb-2 block text-sm font-medium text-gray-300">Token 2</span>
				<div class="flex h-10 items-center rounded-lg border border-white/10 bg-gray-800/50 px-3 text-sm text-gray-300">
					{selectedToken2 ? selectedToken2.symbol : 'tMSTR'}
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-3 sm:flex-row sm:gap-6">
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
					bind:checked={isToken1FastExit}
				/>
				<span class="text-sm">{selectedToken1?.symbol || 'cbBTC'} Fast Exit</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="h-4 w-4 rounded border-white/10 bg-gray-700 text-blue-500"
					bind:checked={isToken2FastExit}
				/>
				<span class="text-sm">{selectedToken2?.symbol || 'tMSTR'} Fast Exit</span>
			</label>
		</div>

		<div>
			<span class="mb-2 block text-sm font-medium text-gray-300">
				Initial Ratio {selectedToken1 && selectedToken2
					? `${selectedToken1.symbol}/${selectedToken2.symbol}`
					: 'cbBTC/tMSTR'}
			</span>
			<div class="relative">
				<Input
					type="number"
					unit={selectedToken1?.symbol || 'cbBTC'}
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
						<span class="text-sm font-medium text-gray-300">${selectedToken1?.symbol} equivalent in USDC Deposit Amount</span>
						{#if usdcToken}
							<TradeAmountInput
								amountToken={usdcToken}
								bind:amount={depositAmount1}
								validate={validateOverrideDepositAmount}
								bind:isError={token1DepositAmountError}
							/>
						{/if}
					</div>
					<div class="relative">
						<span class="text-sm font-medium text-gray-300">${selectedToken2?.symbol} equivalent in USDC Deposit Amount</span>
						{#if usdcToken}
							<TradeAmountInput
								amountToken={usdcToken}
								bind:amount={depositAmount2}
								validate={validateOverrideDepositAmount}
								bind:isError={token2DepositAmountError}
							/>
						{/if}
					</div>
				</div>
			</div>
			<div>
				<div class="space-y-2">
					<div class="relative">
						<span class="text-sm font-medium text-gray-300">Minimum Trade Amount</span>
						{#if selectedToken1}
							<TradeAmountInput
								amountToken={selectedToken1}
								bind:amount={minTradeAmount}
								validate={validateSelectedAmount}
								bind:isError={minTradeAmountError}
							/>
						{/if}
					</div>
					<div class="relative">
						<span class="text-sm font-medium text-gray-300">Maximum Trade Amount</span>
						{#if selectedToken1}
							<TradeAmountInput
								amountToken={selectedToken1}
								bind:amount={maxTradeAmount}
								validate={validateSelectedAmount}
								bind:isError={maxTradeAmountError}
							/>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Order Summary and Button: always below form on mobile, side on desktop -->
	<div class="mt-4 space-y-4 lg:mt-0">
		<div class={containerStyles.cardBordered}>
			<h4 class="mb-3 text-sm font-medium text-gray-300">Prices</h4>
			{#if !hasValidPriceFeedId(selectedToken1) && !hasValidPriceFeedId(selectedToken2)}
				<div class="py-6 text-center text-sm text-gray-400">No price feed data available</div>
			{:else if !$tokenGlobalQuote?.length}
				<div class="flex justify-center py-6">
					<LoadingSpinner size="sm" text="Loading price data..." />
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full text-sm text-gray-200">
						<thead>
							<tr>
								<th class="px-2 py-1 text-left">Token</th>
								<th class="px-2 py-1 text-right">Oracle Price</th>
								<th class="px-2 py-1 text-right">Price Certainty</th>
								<th class="px-2 py-1 text-right">Off-chain</th>
							</tr>
						</thead>
						<tbody>
							{#if selectedToken1 && hasValidPriceFeedId(selectedToken1)}
								<PythOracleRow token={selectedToken1} tokenQuotes={$tokenGlobalQuote} />
							{/if}
							{#if selectedToken2 && hasValidPriceFeedId(selectedToken2)}
								<PythOracleRow token={selectedToken2} tokenQuotes={$tokenGlobalQuote} />
							{/if}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class={containerStyles.cardBordered}>
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
					<span class="text-gray-400">{selectedToken1?.symbol || 'cbBTC'} Fast Exit</span>
					<span class="font-medium text-white">{isToken1FastExit ? 'Yes' : 'No'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">{selectedToken2?.symbol || 'tMSTR'} Fast Exit</span>
					<span class="font-medium text-white">{isToken2FastExit ? 'Yes' : 'No'}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">USDC Deposit Amount</span>
					<span class="font-medium text-white"
						>{usdcToken ? formatUnits(depositAmount1 ?? 0n, usdcToken.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">USDC Deposit Amount</span>
					<span class="font-medium text-white"
						>{usdcToken ? formatUnits(depositAmount2 ?? 0n, usdcToken.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Minimum Trade Amount</span>
					<span class="font-medium text-white"
						>{selectedToken1 ? formatUnits(minTradeAmount ?? 0n, selectedToken1.decimals) : '0'}</span
					>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-gray-400">Maximum Trade Amount</span>
					<span class="font-medium text-white"
						>{selectedToken1 ? formatUnits(maxTradeAmount ?? 0n, selectedToken1.decimals) : '0'}</span
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
</div>
