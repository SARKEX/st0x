<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import TokenSelect from '$lib/components/TokenSelect.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
	import { validateBaseline, validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/ui/Input.svelte';
	import VaultIdInput from '$lib/components/VaultIdInput.svelte';
    import { formatUnits, parseUnits } from 'viem';
	import type { Hex } from 'viem';
	import transactionStore from '$lib/transactionStore';
	import { getBaseline, hasValidPriceFeedId } from '$lib/derivations';
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import type { PythToken } from '$lib/types';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';

	export let passedOutputToken: PythToken | undefined; // The token we're trading
	export let currentPrice: string | undefined = undefined; // Current market price

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.id) : [];

	// Initialize tokens - trading token from prop, USDC for payment
	let selectedOutputToken: Token = passedOutputToken;
	let selectedInputToken: Token;
	
	// Always use USDC for payment
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const usdcToken = ALL_TOKENS.find(t => t.symbol === 'USDC');
		selectedInputToken = usdcToken || ALL_TOKENS[0];
		
		// Update selectedOutputToken if network changes
		if (passedOutputToken && !selectedOutputToken) {
			selectedOutputToken = passedOutputToken;
		}
	}
	
    let selectedOrderType: 'Buy' | 'Sell' = 'Buy';

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

        if (selectedOrderType === 'Buy') {
            transactionStore.handleLimitDeploy({
                outputToken: selectedOutputToken,
                inputToken: selectedInputToken,
                ioRatio: getBaseline(selectedOrderType, selectedInitialRatio),
                depositAmount: selectedAmount,
                inputVaultId: inputVaultId,
                outputVaultId: outputVaultId
            });
        } else {
            // Sell: receive USDC, spend asset. Keep displayed price unchanged.
            const assetDecimals = selectedOutputToken?.decimals || 18;
            const usdcDecimals = selectedInputToken?.decimals || 6;
            const priceScaled = parseUnits(selectedInitialRatio || '0', usdcDecimals);
            const scale = 10n ** BigInt(assetDecimals);
            const usdcAmount = selectedAmount ? (selectedAmount * priceScaled) / scale : 0n;

            transactionStore.handleLimitDeploy({
                // Swap tokens so output is USDC
                outputToken: selectedInputToken,
                inputToken: selectedOutputToken,
                ioRatio: getBaseline(selectedOrderType, selectedInitialRatio),
                // Deposit on output side, in USDC units
                depositAmount: usdcAmount,
                inputVaultId: inputVaultId,
                outputVaultId: outputVaultId
            });
        }
    };

	// Calculate total cost
	$: totalCost = selectedAmount && selectedInitialRatio 
		? (parseFloat(formatUnits(selectedAmount, selectedOutputToken?.decimals || 18)) * parseFloat(selectedInitialRatio)).toFixed(2)
		: '0.00';
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0 && selectedOutputToken && selectedInputToken}
<div class="space-y-4">
    <!-- Action toggle and header -->
    <div class="rounded-lg bg-gray-800/50 p-4">
        <div class="mb-3 flex gap-2">
            <button on:click={() => (selectedOrderType = 'Buy')} class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedOrderType === 'Buy' ? 'bg-yellow-500/20 text-yellow-500' : 'text-gray-400 hover:text-white'}">Buy</button>
            <button on:click={() => (selectedOrderType = 'Sell')} class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {selectedOrderType === 'Sell' ? 'bg-yellow-500/20 text-yellow-500' : 'text-gray-400 hover:text-white'}">Sell</button>
        </div>
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <span class="text-sm text-gray-400">{selectedOrderType === 'Buy' ? 'Buying' : 'Selling'}</span>
                <div class="flex items-center gap-2">
                    {#if selectedOutputToken.logoUrl}
                        <img src={selectedOutputToken.logoUrl} alt={selectedOutputToken.symbol} class="h-6 w-6 rounded-full" />
                    {/if}
                    <span class="font-semibold text-lg">{selectedOutputToken.symbol}</span>
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
			<label class="mb-2 block text-sm font-medium text-gray-300">
				Limit Price
				<span class="text-xs text-gray-500 ml-1">(USDC per {selectedOutputToken.symbol})</span>
			</label>
			<Input
				type="number"
				unit="USDC"
				bind:amount={selectedInitialRatio}
				validate={validateBaseline}
				bind:isError={selectedInitialRatioError}
			/>
		</div>
		<div>
			<label class="mb-2 block text-sm font-medium text-gray-300">
				Amount to Buy
			</label>
			<TradeAmountInput
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
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-gray-400">Buying</span>
					<span class="font-medium">
						{selectedAmount ? formatUnits(selectedAmount, selectedOutputToken.decimals) : '0'} {selectedOutputToken.symbol}
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
						<span class="text-gray-400">Total cost</span>
						<span class="font-semibold text-yellow-500 text-lg">
							{totalCost} USDC
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Price Oracle Info (simplified) -->
		{#if hasValidPriceFeedId(selectedOutputToken)}
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Current Market Price</h4>
			<div class="text-sm">
				<PythOracleRow token={selectedOutputToken} tokenQuotes={$tokenGlobalQuote} compact={true} />
			</div>
		</div>
		{:else}
		<div class="rounded-lg border border-white/10 bg-gray-700/30 p-4">
			<h4 class="mb-3 text-sm font-medium text-gray-300">Market Price</h4>
			<p class="text-sm text-gray-400">Price feed unavailable</p>
		</div>
		{/if}
	</div>
	
	<!-- Deploy Button -->
	<button
		on:click={handleDeploy}
		disabled={disableDeploy}
		class="w-full rounded-md px-4 py-3 text-sm font-semibold text-black transition-all {disableDeploy
			? 'cursor-not-allowed bg-gray-600 opacity-50'
			: 'bg-yellow-500 hover:bg-yellow-600'}"
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
		<p class="text-gray-400">Loading...</p>
	</div>
{/if}
