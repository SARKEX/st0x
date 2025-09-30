<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import { validateBaseline, validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/ui/Input.svelte';
	import { formatUnits, parseUnits } from 'viem';
	import type { Hex } from 'viem';
	import transactionStore from '$lib/transactionStore';
	import { hasValidPriceFeedId } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import type { PythToken } from '$lib/types';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';

	export let passedOutputToken: PythToken | undefined; // The token we're trading
	export let currentPrice: string | undefined = undefined; // Current market price

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Initialize tokens - trading token from prop, USDC for payment
	let selectedOutputToken: Token;
	let selectedInputToken: Token;

	// Always use USDC for payment
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const usdcToken = ALL_TOKENS.find((t) => t.symbol === 'USDC');
		selectedInputToken = usdcToken || ALL_TOKENS[0];

		// Update selectedOutputToken if network changes
		if (passedOutputToken && !selectedOutputToken) {
			selectedOutputToken = passedOutputToken;
		}
	}

	let selectedOrderType: 'Buy' | 'Sell' = 'Buy';

	const ORDER_TOGGLE_ACTIVE_CLASSES = {
		Buy: 'bg-green-500/20 text-green-400',
		Sell: 'bg-red-500/20 text-red-400'
	} as const;
	const ORDER_TOGGLE_INACTIVE_CLASSES = 'text-gray-400 hover:text-white';
	$: summaryAccentClass = selectedOrderType === 'Buy' ? 'text-green-400' : 'text-red-400';
	$: actionButtonClass =
		selectedOrderType === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	// Autofill with current price if available
	let selectedInitialRatio: string = currentPrice || '';
	$: if (currentPrice && !selectedInitialRatio) {
		selectedInitialRatio = currentPrice;
	}

	let selectedAmount: bigint = 0n;
	let inputVaultId: Hex | undefined;
	let outputVaultId: Hex | undefined;

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken?.address.toLowerCase() === selectedInputToken?.address.toLowerCase();

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
		if (!$connected) {
			showConnectModal = true;
			return;
		}

		if (selectedOrderType === 'Buy') {
			// Buy: input is asset, output is USDC
			// We're buying the asset, so we deposit USDC and receive asset
			// Calculate USDC amount needed
			const assetQuantity = formatUnits(selectedAmount || 0n, selectedOutputToken?.decimals || 18);
			const price = parseFloat(selectedInitialRatio || '0');
			const usdcNeeded = parseFloat(assetQuantity) * price;
			const usdcAmount = parseUnits(usdcNeeded.toString(), selectedInputToken?.decimals || 6);

			transactionStore.handleLimitDeploy({
				inputToken: selectedOutputToken, // Asset is input (token1)
				outputToken: selectedInputToken, // USDC is output (token2)
				// For Buy: ratio should be asset/USDC = 1/price
				ioRatio: (1 / parseFloat(selectedInitialRatio || '1')).toString(),
				depositAmount: usdcAmount, // Deposit USDC amount in USDC wei
				inputVaultId: inputVaultId,
				outputVaultId: outputVaultId
			});
		} else {
			// Sell: input is USDC, output is asset
			// We're selling the asset, so we deposit asset and receive USDC
			transactionStore.handleLimitDeploy({
				inputToken: selectedInputToken, // USDC is input (token1)
				outputToken: selectedOutputToken, // Asset is output (token2)
				// For Sell: ratio should be USDC/asset = price
				ioRatio: selectedInitialRatio,
				depositAmount: selectedAmount, // Deposit asset amount in asset wei
				inputVaultId: inputVaultId,
				outputVaultId: outputVaultId
			});
		}
	};

	// Wallet connect modal state
	let showConnectModal = false;

	// Calculate total cost
	$: totalCost =
		selectedAmount && selectedInitialRatio
			? (
					parseFloat(formatUnits(selectedAmount, selectedOutputToken?.decimals || 18)) *
					parseFloat(selectedInitialRatio)
				).toFixed(2)
			: '0.00';
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0 && selectedOutputToken && selectedInputToken}
	<div class="space-y-4">
		<!-- Action toggle and header -->
		<div class="rounded-lg bg-gray-800/50 p-4">
			<div class="mb-3 flex gap-2">
				<button
					on:click={() => (selectedOrderType = 'Buy')}
					class={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
						selectedOrderType === 'Buy'
							? ORDER_TOGGLE_ACTIVE_CLASSES.Buy
							: ORDER_TOGGLE_INACTIVE_CLASSES
					}`}
				>
					Buy
				</button>
				<button
					on:click={() => (selectedOrderType = 'Sell')}
					class={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
						selectedOrderType === 'Sell'
							? ORDER_TOGGLE_ACTIVE_CLASSES.Sell
							: ORDER_TOGGLE_INACTIVE_CLASSES
					}`}
				>
					Sell
				</button>
			</div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-400"
						>{selectedOrderType === 'Buy' ? 'Buying' : 'Selling'}</span
					>
					<div class="flex items-center gap-2">
						{#if selectedOutputToken.logoUrl}
							<img
								src={selectedOutputToken.logoUrl}
								alt={selectedOutputToken.symbol}
								class="h-6 w-6 rounded-full"
							/>
						{/if}
						<span class="text-lg font-semibold">{selectedOutputToken.symbol}</span>
					</div>
				</div>
				<div class="flex items-center gap-2 text-sm text-gray-400">
					<span>{selectedOrderType === 'Buy' ? 'with' : 'for'}</span>
					<img src="/images/USDC.png" alt="USDC" class="h-5 w-5" />
					<span>USDC</span>
				</div>
			</div>
		</div>

		<!-- Main inputs in a clean grid -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Limit Price
					<span class="ml-1 text-xs text-gray-500">(USDC per {selectedOutputToken.symbol})</span>
				</div>
				<Input
					aria-label="Limit Price"
					type="number"
					unit="USDC"
					bind:amount={selectedInitialRatio}
					validate={validateBaseline}
					bind:isError={selectedInitialRatioError}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Quantity</div>
				<TradeAmountInput
					aria-label="Quantity"
					amountToken={selectedOutputToken}
					bind:amount={selectedAmount}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
				/>
			</div>
		</div>

		<!-- Summary boxes side by side -->
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<!-- Order summary with total cost -->
			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-400">{selectedOrderType === 'Buy' ? 'Buying' : 'Selling'}</span>
						<span class="font-medium">
							{selectedAmount ? formatUnits(selectedAmount, selectedOutputToken.decimals) : '0'}
							{selectedOutputToken.symbol}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">At price</span>
						<span class="font-medium">
							{selectedInitialRatio || '0'} USDC
						</span>
					</div>
					<div class="mt-2 border-t border-white/10 pt-2">
						<div class="flex justify-between">
							<span class="text-gray-400">Total</span>
							<span class={`text-lg font-semibold ${summaryAccentClass}`}>
								{totalCost} USDC
							</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Price Oracle Info (simplified) -->
			{#if hasValidPriceFeedId(selectedOutputToken)}
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
								<PythOracleRow token={selectedOutputToken} tokenQuotes={$tokenGlobalQuote} />
							</tbody>
						</table>
					</div>
				</div>
			{:else}
				<div class={containerStyles.cardBordered}>
					<h4 class="mb-3 text-sm font-medium text-gray-300">Market Price</h4>
					<p class="text-sm text-gray-400">Price feed unavailable</p>
				</div>
			{/if}
		</div>

		<!-- Deploy Button -->
		<button
			on:click={handleDeploy}
			disabled={disableDeploy}
			class={`w-full rounded-md px-4 py-3 text-sm font-semibold transition-all ${
				disableDeploy
					? 'cursor-not-allowed bg-gray-600 text-gray-300 opacity-50'
					: actionButtonClass
			}`}
		>
			{#if disableDeploy}
				{#if !selectedInitialRatio}
					Enter a limit price
				{:else if !selectedAmount}
					Enter an amount
				{:else}
					Complete all fields
				{/if}
			{:else}
				Place Limit Order
			{/if}
		</button>
	</div>
{:else}
	<div class="flex h-32 items-center justify-center">
		<LoadingSpinner size="md" text="Loading..." />
	</div>
{/if}

<!-- Connect Wallet Modal -->
<Modal
	show={showConnectModal}
	title="Connect Your Wallet"
	maxWidthClass="max-w-lg"
	onClose={() => (showConnectModal = false)}
>
	<div class="space-y-4">
		<WalletConnectionPrompt
			title="Wallet Required to Place Order"
			description="Connect your wallet to continue. After connecting, click Place again to submit your order."
			showSection={false}
			minHeight={false}
		/>
	</div>
</Modal>
