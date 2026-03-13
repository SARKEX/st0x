<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/config/network';
	import Select from '$lib/components/ui/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/config/network';
	import type { PythToken } from '$lib/types';
	import { validateBaseline, validatePeriod, validateSelectedAmount } from '$lib/utils/validation';
	import Input from '$lib/components/ui/Input.svelte';
	import { formatUnits } from 'viem';
	import { isAuthenticated } from '$lib/stores/authStore';
	import transactionStore from '$lib/stores/transaction';
	import { hasValidPriceFeedId, priceToIoratioString } from '$lib/utils/derivations';
	import { currentNetwork, oracleQuotes, reviewStrategyOnDeploy } from '$lib/stores';
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { walletRegistered, promptWalletConnection, promptLogin } from '$lib/stores/accessStore';
	import { DEFAULT_INPUT_VAULT_ID } from '$lib/services/orderDeployment';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';

	$: actionButtonClass =
		orderSide === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	export let assetToken: PythToken | undefined; // The token we're accumulating

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Initialize tokens - accumulating token from prop, settlement token for settlement
	let selectedInputToken: CategorizedToken;
	let selectedOutputToken: CategorizedToken;
	$: settlementSymbol = selectedOutputToken?.symbol ?? '';
	$: settlementLabel = settlementSymbol || 'Quote';

	// Resolve tokens whenever network, token list, or prop changes
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const settlementTokenConfig = $currentNetwork.defaultPaymentToken;
		if (settlementTokenConfig) {
			const match = ALL_TOKENS.find(
				(token) => token.address.toLowerCase() === settlementTokenConfig.address.toLowerCase()
			);
			selectedOutputToken =
				match ||
				(settlementTokenConfig as unknown as CategorizedToken) ||
				selectedOutputToken ||
				ALL_TOKENS[0];
		} else {
			selectedOutputToken = selectedOutputToken || ALL_TOKENS[0];
		}
		selectedInputToken =
			(assetToken as unknown as CategorizedToken) || selectedInputToken || ALL_TOKENS[0];
	}

	let selectedAmount: bigint = 0n;
	let selectedPeriodUnit: 'Days' | 'Hours' | 'Minutes' = 'Days';
	let selectedPeriod: string = '';
	let selectedBaseline: string = '';
	let selectedInitialRatio: string = '';

	// Balance from TradeAmountInput (bound)
	let spendingTokenBalance: bigint = 0n;
	let spendingTokenBalanceDecimals: number | null = null;

	// Reference to TradeAmountInput for programmatic updates
	let tradeAmountInputRef: { setAmountValue: (amount: bigint) => void } | undefined;

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken?.address.toLowerCase() === selectedInputToken?.address.toLowerCase();

	// errors
	let selectedAmountError: boolean = false;
	let selectedPeriodError: boolean = false;
	let selectedBaselineError: boolean = false;
	let selectedInitialRatioError: boolean = false;
	let priceGuardrailError: boolean = false;

	$: depositAmount = selectedAmount;
	$: maxTradeAmount = selectedAmount ? selectedAmount / 10n : 0n;
	// Min trade size is $1 USDC for Buy, or $1 worth of the asset token for Sell
	$: minTradeAmount = (() => {
		if (orderSide === 'Buy') {
			// For Buy orders, min is 1 USDC (6 decimals)
			const usdcDecimals = selectedOutputToken?.decimals ?? 6;
			return BigInt(10 ** usdcDecimals);
		} else {
			// For Sell orders, min is $1 worth of the asset token
			const price = parseFloat(selectedInitialRatio || '0');
			if (price <= 0) return 0n;
			const tokenDecimals = selectedInputToken?.decimals ?? 18;
			const oneDollarWorth = 1 / price;
			return BigInt(Math.floor(oneDollarWorth * 10 ** tokenDecimals));
		}
	})();

	// Check if total budget is below minimum ($1)
	$: belowMinTradeError = (() => {
		if (!selectedAmount || selectedAmount === 0n) return false;
		if (!selectedInitialRatio || parseFloat(selectedInitialRatio) <= 0) return false;
		if (orderSide === 'Buy') {
			// For buy: check if total budget is below $1
			const budgetDecimals = selectedOutputToken?.decimals ?? 6;
			const budgetValue = parseFloat(formatUnits(selectedAmount, budgetDecimals));
			return budgetValue < 1;
		} else {
			// For sell: check if total asset amount is worth less than $1
			const price = parseFloat(selectedInitialRatio);
			const assetDecimals = selectedInputToken?.decimals ?? 18;
			const totalValue = parseFloat(formatUnits(selectedAmount, assetDecimals)) * price;
			return totalValue < 1;
		}
	})();

	// Advanced options state
	let showAdvancedOptions = false;
	let selectedVaultOption = 'default' as 'default' | 'order-specific';

	// Computed input vault ID based on selection
	// 'default' = DEFAULT_INPUT_VAULT_ID (shared vault 0x01)
	// 'order-specific' = undefined (system generates random vault ID)
	$: selectedInputVaultId = selectedVaultOption === 'default' ? DEFAULT_INPUT_VAULT_ID : undefined;

	// Price guardrail validation
	$: {
		const startPrice = parseFloat(selectedInitialRatio || '0');
		const limitPrice = parseFloat(selectedBaseline || '0');

		if (selectedInitialRatio && selectedBaseline && startPrice > 0 && limitPrice > 0) {
			if (orderSide === 'Buy') {
				// For buy: ceiling price (limit) can't be lower than start price
				priceGuardrailError = limitPrice < startPrice;
			} else {
				// For sell: floor price (limit) can't be higher than start price
				priceGuardrailError = limitPrice > startPrice;
			}
		} else {
			priceGuardrailError = false;
		}
	}

	$: disableDeploy =
		!selectedAmount ||
		!selectedPeriod ||
		!selectedBaseline ||
		!selectedInitialRatio ||
		selectedAmountError ||
		selectedPeriodError ||
		selectedBaselineError ||
		isInputTokenSameAsOutputToken ||
		selectedInitialRatioError ||
		priceGuardrailError ||
		belowMinTradeError;

	// Handle percentage button clicks for setting amount based on wallet balance
	// For DCA, amount token and balance token are always the same (both are the spending token)
	const handlePercentageClick = (percent: number) => {
		if (!spendingTokenBalance || spendingTokenBalance === 0n) return;
		if (!tradeAmountInputRef) return;
		const percentAmount = (spendingTokenBalance * BigInt(percent)) / 100n;
		tradeAmountInputRef.setAmountValue(percentAmount);
	};

	const handleDcaDeploy = () => {
		// Check if user is connected
		if (!$isAuthenticated) {
			promptWalletConnection();
			return;
		}
		// Check if user is registered
		if (!$walletRegistered) {
			promptLogin();
			return;
		}
		if ($isAuthenticated && $walletRegistered) {
			// Convert user-facing 'Buy'/'Sell' to order terminology 'Bid'/'Ask'
			const orderType = orderSide === 'Buy' ? 'Bid' : 'Ask';

			// Bid (buying): Accumulate asset over time using the settlement token
			// Ask (selling): Accumulate the settlement token over time by selling the asset
			const inputTok = orderType === 'Bid' ? selectedInputToken : selectedOutputToken;
			const outputTok = orderType === 'Bid' ? selectedOutputToken : selectedInputToken;
			transactionStore.handleDcaDeploy({
				outputToken: outputTok,
				inputToken: inputTok,
				budgetAmount: selectedAmount,
				selectedPeriod: selectedPeriod,
				selectedPeriodUnit: selectedPeriodUnit,
				// DCA price inversion logic:
				// Bid (buying): User specifies price as "quote per asset", orderbook needs "asset/quote" → invert
				// Ask (selling): User specifies price as "quote per asset", orderbook needs "quote/asset" → no invert
				baseline: priceToIoratioString(orderType, selectedBaseline, true),
				kickoff: priceToIoratioString(orderType, selectedInitialRatio, true),
				minTradeAmount: minTradeAmount,
				maxTradeAmount: maxTradeAmount,
				depositAmount: depositAmount,
				inputVaultId: selectedInputVaultId
			});
		}
	};

	// Calculate average amount per period (use correct decimals for order type)
	$: avgPricePerPeriod = (() => {
		if (!selectedAmount || !selectedPeriod) return '0.00';
		const decimals =
			orderSide === 'Buy'
				? selectedOutputToken?.decimals || 18
				: selectedInputToken?.decimals || 18;
		const amount = parseFloat(formatUnits(selectedAmount, decimals));
		const periods = parseFloat(selectedPeriod || '1');
		if (!Number.isFinite(amount) || !Number.isFinite(periods) || periods === 0) return '0.00';
		return (amount / periods).toFixed(2);
	})();

	// Dynamic label for accumulation/divestment depending on order type
	$: periodLabel = orderSide === 'Buy' ? 'Accumulation Period' : 'Divestment Period';

	// Fetch oracle price on mount and when token changes
	let lastFetchedTokenAddress = '';

	$: if (!selectedInitialRatio) {
		lastFetchedTokenAddress = '';
	}

	$: {
		if (selectedInputToken && !selectedInitialRatio && hasValidPriceFeedId(selectedInputToken)) {
			const address = selectedInputToken.address?.toLowerCase?.();
			if (address && address !== lastFetchedTokenAddress) {
				const oracleEntry = $oracleQuotes[address];
				const price = oracleEntry?.price;
				if (typeof price === 'number' && !Number.isNaN(price)) {
					selectedInitialRatio = price.toFixed(2);
					lastFetchedTokenAddress = address;
				}
			}
		}
	}
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0}
	<div class="space-y-4">
		<!-- Target Amount and Period -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					{orderSide === 'Buy' ? 'Purchase Budget' : 'Amount to Sell'}
					<span class="ml-1 text-xs text-gray-400"
						>({orderSide === 'Buy' ? settlementLabel : selectedInputToken.symbol})</span
					>
				</div>
				<TradeAmountInput
					bind:this={tradeAmountInputRef}
					aria-label="Target Amount"
					amountToken={orderSide === 'Buy' ? selectedOutputToken : selectedInputToken}
					balanceToken={orderSide === 'Buy' ? selectedOutputToken : selectedInputToken}
					bind:amount={selectedAmount}
					bind:balance={spendingTokenBalance}
					bind:balanceDecimals={spendingTokenBalanceDecimals}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
					showMaxButton={false}
				/>
				<!-- Percentage buttons -->
				<div class="mt-2 flex gap-2">
					{#each [25, 50, 75, 100] as percent}
						<button
							type="button"
							on:click={() => handlePercentageClick(percent)}
							class="flex-1 rounded border border-white/10 bg-gray-700/50 px-2 py-1 text-xs text-gray-300 transition-colors hover:border-white/20 hover:bg-gray-600/50"
						>
							{percent === 100 ? 'Max' : `${percent}%`}
						</button>
					{/each}
				</div>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">{periodLabel}</div>
				<div class="flex gap-2">
					<div class="flex-grow">
						<Input
							aria-label={periodLabel}
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
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Start Price</div>
				<Input
					aria-label="Start Price"
					type="number"
					unit={settlementLabel}
					bind:amount={selectedInitialRatio}
					validate={validateBaseline}
					bind:isError={selectedInitialRatioError}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					{orderSide === 'Buy' ? 'Ceiling Price' : 'Floor Price'}
				</div>
				<Input
					aria-label={orderSide === 'Buy' ? 'Ceiling Price' : 'Floor Price'}
					type="number"
					unit={settlementLabel}
					bind:amount={selectedBaseline}
					validate={validateBaseline}
					bind:isError={selectedBaselineError}
				/>
			</div>
		</div>

		<!-- Order Summary -->
		<div class={containerStyles.cardBordered}>
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-gray-400">Target Amount</span>
					<span class="font-medium">
						{#if orderSide === 'Buy'}
							{selectedAmount
								? parseFloat(formatUnits(selectedAmount, selectedOutputToken.decimals)).toFixed(3)
								: '0'}
							{settlementLabel}
						{:else}
							{selectedAmount
								? parseFloat(formatUnits(selectedAmount, selectedInputToken.decimals)).toFixed(3)
								: '0'}
							{selectedInputToken.symbol}
						{/if}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">{periodLabel}</span>
					<span class="font-medium">
						{selectedPeriod || '0'}
						{selectedPeriodUnit.toLowerCase()}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Average per period</span>
					<span class="font-medium">
						{#if orderSide === 'Buy'}
							~{avgPricePerPeriod} {settlementLabel}
						{:else}
							~{avgPricePerPeriod} {selectedInputToken.symbol}
						{/if}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Min trade size</span>
					<span class="text-xs font-medium">
						{#if orderSide === 'Buy'}
							{minTradeAmount ? formatUnits(minTradeAmount, selectedOutputToken.decimals) : '0'}
							{settlementLabel}
						{:else}
							{minTradeAmount ? formatUnits(minTradeAmount, selectedInputToken.decimals) : '0'}
							{selectedInputToken.symbol}
						{/if}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Max trade size</span>
					<span class="text-xs font-medium">
						{#if orderSide === 'Buy'}
							{maxTradeAmount ? formatUnits(maxTradeAmount, selectedOutputToken.decimals) : '0'}
							{settlementLabel}
						{:else}
							{maxTradeAmount ? formatUnits(maxTradeAmount, selectedInputToken.decimals) : '0'}
							{selectedInputToken.symbol}
						{/if}
					</span>
				</div>
				{#if belowMinTradeError}
					<div
						class="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300"
					>
						Minimum trade size is $1. Please increase your budget amount.
					</div>
				{/if}
			</div>
		</div>

		<!-- Advanced Options -->
		<div class="border-t border-white/10 pt-4">
			<button
				type="button"
				on:click={() => (showAdvancedOptions = !showAdvancedOptions)}
				class="flex w-full items-center justify-between text-sm text-gray-400 hover:text-gray-300"
			>
				<span>Advanced options</span>
				<svg
					class={`h-4 w-4 transform transition-transform ${
						showAdvancedOptions ? 'rotate-180' : ''
					}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{#if showAdvancedOptions}
				<div class="mt-4 space-y-3">
					<div>
						<label for="receiving-vault-dca" class="mb-2 block text-sm font-medium text-gray-300">
							Receiving vault
						</label>
						<select
							id="receiving-vault-dca"
							bind:value={selectedVaultOption}
							class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-brand-gold-500/50 focus:outline-none"
						>
							<option value="default">Default</option>
							<option value="order-specific">Order-specific</option>
						</select>
						<p class="mt-1 text-xs text-gray-400">
							{#if selectedVaultOption === 'default'}
								Uses the shared default vault for receiving tokens
							{:else}
								Creates a unique vault for this order only
							{/if}
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Deploy Button -->
		<button
			on:click={handleDcaDeploy}
			disabled={disableDeploy}
			class={`w-full rounded-md px-4 py-3 text-sm font-semibold transition-all ${
				disableDeploy
					? 'cursor-not-allowed bg-gray-600 text-gray-300 opacity-50'
					: actionButtonClass
			}`}
		>
			{#if disableDeploy}
				{#if !selectedAmount}
					Enter a budget amount
				{:else if !selectedPeriod}
					Enter a period
				{:else if !selectedBaseline}
					{orderSide === 'Buy' ? 'Enter a ceiling price' : 'Enter a floor price'}
				{:else if !selectedInitialRatio}
					Enter a start price
				{:else if belowMinTradeError}
					Minimum trade is $1
				{:else}
					Complete all fields
				{/if}
			{:else}
				Create Order
			{/if}
		</button>

		<!-- Review Strategy Checkbox -->
		<label class="mt-3 flex cursor-pointer items-center gap-2">
			<input
				type="checkbox"
				checked={$reviewStrategyOnDeploy}
				on:change={(e) => reviewStrategyOnDeploy.set(e.currentTarget.checked)}
				class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-brand-gold-500 focus:ring-brand-gold-500 focus:ring-offset-gray-800"
			/>
			<span class="text-xs text-gray-400">Review strategy source code on deploy</span>
		</label>
	</div>
{:else}
	<div class="flex h-32 items-center justify-center">
		<LoadingSpinner size="md" text="Loading..." />
	</div>
{/if}
