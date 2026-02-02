<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/config/network';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/config/network';
	import { validateBaseline, validateSelectedAmount } from '$lib/utils/validation';
	import Input from '$lib/components/ui/Input.svelte';
	import { formatUnits, parseUnits } from 'viem';
	import type { Hex } from 'viem';
	import transactionStore from '$lib/stores/transaction';
	import { currentNetwork, reviewStrategyOnDeploy, payFeesInStablecoin } from '$lib/stores';
	import { priceToIoratioString } from '$lib/utils/derivations';
	import type { PythToken } from '$lib/types';
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { isAuthenticated } from '$lib/stores/authStore';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { walletRegistered, promptWalletConnection, promptLogin } from '$lib/stores/accessStore';
	import { DEFAULT_INPUT_VAULT_ID } from '$lib/services/orderDeployment';
	import { addressesEqual } from '$lib/utils/tokenMath';

	// Account Abstraction imports
	import TokenNetworkSelector from '$lib/components/aa/TokenNetworkSelector.svelte';
	import {
		type PaymentToken,
		SUPPORTED_NETWORKS,
		USDC_BASE,
		isRhinestoneConfigured,
		getPriceOracle
	} from '$lib/services/account-abstraction';
	import { aaPaymentStore, isSwapping, swapError } from '$lib/stores/aaPaymentStore';

	/**
	 * assetToken: The non-settlement token being traded (from prop)
	 */
	export let assetToken: PythToken | undefined;
	export let currentPrice: string | undefined = undefined; // Current market price
	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	export let buyPrice: number | null = null; // Best bid price (what you get when selling)
	export let sellPrice: number | null = null; // Best ask price (what you pay when buying)

	// AA state
	let selectedSourceToken: PaymentToken | null = USDC_BASE;
	let isDeploying = false;
	let deployError: string | null = null;
	$: isAAEnabled = isRhinestoneConfigured();
	$: needsSwap =
		selectedSourceToken &&
		(selectedSourceToken.chainId !== SUPPORTED_NETWORKS.BASE ||
			selectedSourceToken.symbol !== 'USDC');

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Initialize tokens - trading token from prop, settlement token for settlement
	let settlementToken: CategorizedToken | undefined;
	let orderInputToken: CategorizedToken | undefined;
	let orderOutputToken: CategorizedToken | undefined;
	$: settlementSymbol = settlementToken?.symbol ?? '';
	$: settlementLabel = settlementSymbol || 'Quote';

	// Always use the network's default settlement token for settlement
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const settlementTokenConfig = $currentNetwork.defaultPaymentToken;
		if (settlementTokenConfig) {
			const match = ALL_TOKENS.find(
				(token) => addressesEqual(token.address, settlementTokenConfig.address)
			);
			settlementToken = match || (settlementTokenConfig as unknown as CategorizedToken);
		} else {
			settlementToken = ALL_TOKENS[0];
		}
	}

	// Maker order perspective: What the ORDER receives and gives
	// Buy order (maker buying): orderInput=asset (receives), orderOutput=settlement (gives) → BID
	// Sell order (maker selling): orderInput=settlement (receives), orderOutput=asset (gives) → ASK
	$: orderInputToken =
		orderSide === 'Buy' ? (assetToken as unknown as CategorizedToken) : settlementToken;
	$: orderOutputToken =
		orderSide === 'Buy' ? settlementToken : (assetToken as unknown as CategorizedToken);

	$: summaryAccentClass = orderSide === 'Buy' ? 'text-green-400' : 'text-red-400';
	$: actionButtonClass =
		orderSide === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	// Autofill with current price if available
	let selectedInitialRatio: string = currentPrice || '';
	let userHasEditedPrice = false;
	let lastAutofilledPrice: string | undefined = undefined;

	// Auto-fill price when currentPrice becomes available or changes (and user hasn't manually edited)
	$: if (currentPrice && !userHasEditedPrice) {
		// Only update if price actually changed to avoid unnecessary reactivity
		if (lastAutofilledPrice !== currentPrice) {
			selectedInitialRatio = currentPrice;
			lastAutofilledPrice = currentPrice;
		}
	}

	// Track when user manually edits the price
	function handlePriceInput() {
		userHasEditedPrice = true;
	}

	let selectedAmount: bigint = 0n;

	// Balance from TradeAmountInput (bound)
	let spendingTokenBalance: bigint = 0n;
	let spendingTokenBalanceDecimals: number | null = null;

	// Reference to TradeAmountInput for programmatic updates
	let tradeAmountInputRef: { setAmountValue: (amount: bigint) => void } | undefined;

	$: isInputTokenSameAsOutputToken =
		addressesEqual(orderInputToken?.address, orderOutputToken?.address);

	// Check if selected amount is below minimum trade size ($1)
	// Uses same logic as DCA for consistency
	$: belowMinTradeError = (() => {
		if (!selectedAmount || selectedAmount === 0n) return false;
		if (!selectedInitialRatio || parseFloat(selectedInitialRatio) <= 0) return false;
		const price = parseFloat(selectedInitialRatio);
		const assetDecimals = assetToken?.decimals ?? 18;
		// For both buy and sell: check if total value (amount * price) is below $1
		const totalValue = parseFloat(formatUnits(selectedAmount, assetDecimals)) * price;
		return totalValue < 1;
	})();

	// errors
	let selectedInitialRatioError: boolean = false;
	let selectedAmountError: boolean = false;

	// Advanced options state
	let showAdvancedOptions = false;
	let selectedVaultOption = 'default' as 'default' | 'order-specific';

	// Computed input vault ID based on selection
	// 'default' = DEFAULT_INPUT_VAULT_ID (shared vault 0x01)
	// 'order-specific' = undefined (system generates random vault ID)
	$: selectedInputVaultId = selectedVaultOption === 'default' ? DEFAULT_INPUT_VAULT_ID : undefined;

	$: disableDeploy =
		!selectedAmount ||
		!selectedInitialRatio ||
		!orderInputToken ||
		!orderOutputToken ||
		!assetToken ||
		isInputTokenSameAsOutputToken ||
		selectedInitialRatioError ||
		selectedAmountError ||
		belowMinTradeError ||
		isDeploying ||
		$isSwapping;

	// Handle percentage button clicks for setting amount based on wallet balance
	const handlePercentageClick = (percent: number) => {
		if (!spendingTokenBalance || spendingTokenBalance === 0n) return;
		if (spendingTokenBalanceDecimals === null) return;
		if (!tradeAmountInputRef) return;

		if (orderSide === 'Sell') {
			// For SELL: balance is in asset token, amount is in asset token - direct calculation
			const percentAmount = (spendingTokenBalance * BigInt(percent)) / 100n;
			tradeAmountInputRef.setAmountValue(percentAmount);
		} else {
			// For BUY: balance is in settlement token, need to convert to asset amount using limit price
			const price = parseFloat(selectedInitialRatio || '0');
			if (!price || price <= 0) {
				// Can't convert without a valid price
				return;
			}

			const settlementDecimals = spendingTokenBalanceDecimals;
			const assetDecimals = assetToken?.decimals ?? 18;

			// Calculate settlement amount to spend (percent of balance)
			const settlementToSpend = (spendingTokenBalance * BigInt(percent)) / 100n;

			// Convert settlement amount to asset amount using limit price
			// settlementAmount / price = assetAmount
			// Use floor to prevent rounding up beyond actual balance (fixes "not enough funds" on MAX)
			const settlementInFloat = parseFloat(formatUnits(settlementToSpend, settlementDecimals));
			const assetAmount = settlementInFloat / price;
			const assetAmountScaled = Math.floor(assetAmount * 10 ** assetDecimals);
			tradeAmountInputRef.setAmountValue(BigInt(assetAmountScaled));
		}
	};

	const handleDeploy = async () => {
		if (!orderInputToken || !orderOutputToken || !assetToken || !settlementToken) return;
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

		// Validate token decimals are defined
		if (typeof assetToken.decimals !== 'number') {
			console.error('Asset token decimals are not defined');
			return;
		}
		if (typeof settlementToken.decimals !== 'number') {
			console.error('Settlement token decimals are not defined');
			return;
		}

		isDeploying = true;
		deployError = null;

		try {
			// Convert user-facing 'Buy'/'Sell' to order terminology 'Bid'/'Ask'
			const orderType = orderSide === 'Buy' ? 'Bid' : 'Ask';

			// Calculate the settlement amount needed for Buy orders
			let settlementAmount: bigint;
			if (orderType === 'Bid') {
				const assetQuantity = formatUnits(selectedAmount || 0n, assetToken.decimals);
				const price = parseFloat(selectedInitialRatio || '0');
				const settlementNeeded = parseFloat(assetQuantity) * price;
				settlementAmount = parseUnits(settlementNeeded.toString(), settlementToken.decimals);

				// For Buy orders: Check if cross-chain swap is needed
				// If user selected a non-USDC token or different chain, swap first
				if (needsSwap && selectedSourceToken) {
					// Calculate amount in source token (accounting for different decimals and pricing)
					const sourceDecimals = selectedSourceToken.decimals;
					const settlementInUSD = parseFloat(formatUnits(settlementAmount, settlementToken.decimals));
					const isStablecoin =
						selectedSourceToken.symbol === 'USDC' || selectedSourceToken.symbol === 'USDT';

					let swapAmount: bigint;
					if (isStablecoin) {
						// Stablecoins: 1:1 with USD, add 1% buffer
						swapAmount = BigInt(Math.ceil(settlementInUSD * 1.01 * 10 ** sourceDecimals));
					} else {
						// Non-stablecoins (WETH): convert via price oracle
						const priceOracle = getPriceOracle();
						const tokenSymbol =
							selectedSourceToken.symbol === 'WETH' ? 'ETH' : selectedSourceToken.symbol;
						const tokenPrices = await priceOracle.getTokenPrices([tokenSymbol]);
						const sourceTokenPriceUSD = tokenPrices.get(tokenSymbol)?.priceUsd ?? 2500;
						const sourceTokenAmount = settlementInUSD / sourceTokenPriceUSD;
						// Add 2% buffer for non-stablecoins
						swapAmount = BigInt(Math.ceil(sourceTokenAmount * 1.02 * 10 ** sourceDecimals));
					}

					// Execute the cross-chain swap
					const swapResult = await aaPaymentStore.executeSwapIfNeeded(swapAmount, $payFeesInStablecoin);
					if (swapResult === null) {
						// Swap failed
						deployError = $swapError || 'Cross-chain swap failed';
						return;
					}

					// Update settlement amount to use the USDC received
					settlementAmount = swapResult;
				}
			}

			// Prepare deploy data
			let deployData: {
				inputToken: CategorizedToken;
				outputToken: CategorizedToken;
				ioRatio: string;
				depositAmount: bigint;
				inputVaultId: Hex | undefined;
			};

			if (orderType === 'Bid') {
				// Bid order (user buying): Places order to buy asset with the settlement token
				deployData = {
					inputToken: orderInputToken, // Asset (token to be acquired, used for IO ratio)
					outputToken: orderOutputToken, // payment token (token to be deposited as payment)
					ioRatio: priceToIoratioString('Bid', selectedInitialRatio, true),
					depositAmount: settlementAmount!, // Payment amount in settlement token
					inputVaultId: selectedInputVaultId
				};
			} else {
				// Ask order (user selling): Places order to sell asset for the settlement token
				deployData = {
					inputToken: orderInputToken, // payment token (token expected in return)
					outputToken: orderOutputToken, // Asset (token being offered for sale)
					ioRatio: priceToIoratioString('Ask', selectedInitialRatio, true),
					depositAmount: selectedAmount, // Asset amount being offered
					inputVaultId: selectedInputVaultId
				};
			}

			// Check if price warning is needed
			if (checkPriceWarning()) {
				pendingDeployData = deployData;
				showPriceWarning = true;
			} else {
				transactionStore.handleLimitDeploy(deployData);
			}
		} catch (error) {
			console.error('Limit order deployment error:', error);
			deployError = error instanceof Error ? error.message : 'Unknown error occurred';
		} finally {
			isDeploying = false;
			aaPaymentStore.clearError();
		}
	};

	// Price warning modal state
	let showPriceWarning = false;
	let userAcknowledgesWarning = false;
	let pendingDeployData: {
		inputToken: CategorizedToken;
		outputToken: CategorizedToken;
		ioRatio: string;
		depositAmount: bigint;
		inputVaultId: Hex | undefined;
	} | null = null;

	// Check if limit price is significantly off market price
	const checkPriceWarning = (): boolean => {
		const price = parseFloat(selectedInitialRatio || '0');
		if (!price || price <= 0) return false;

		// Convert to order terminology for clarity
		const orderType = orderSide === 'Buy' ? 'Bid' : 'Ask';

		if (orderType === 'Bid') {
			// Bid order (buying): Check against best Ask (sellPrice)
			// User's price should be near or below current best ask
			if (sellPrice !== null && sellPrice > 0) {
				const threshold = sellPrice * 1.01; // 1% above best ask is risky
				return price > threshold;
			}
		} else {
			// Ask order (selling): Check against best Bid (buyPrice)
			// User's price should be near or above current best bid
			if (buyPrice !== null && buyPrice > 0) {
				const threshold = buyPrice * 0.99; // 1% below best bid is risky
				return price < threshold;
			}
		}
		return false;
	};

	const proceedWithDeploy = () => {
		if (!pendingDeployData) return;
		transactionStore.handleLimitDeploy(pendingDeployData);
		showPriceWarning = false;
		userAcknowledgesWarning = false;
		pendingDeployData = null;
	};

	const cancelDeploy = () => {
		showPriceWarning = false;
		userAcknowledgesWarning = false;
		pendingDeployData = null;
	};

	// Calculate total cost
	$: totalCost =
		selectedAmount && selectedInitialRatio && assetToken
			? (
					parseFloat(formatUnits(selectedAmount, assetToken.decimals)) *
					parseFloat(selectedInitialRatio)
				).toFixed(2)
			: '0.00';
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0 && orderInputToken && orderOutputToken && assetToken}
	<div class="space-y-4">
		<!-- Cross-chain payment selector (Buy orders only) -->
		{#if orderSide === 'Buy' && isAAEnabled}
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Pay with</div>
				<TokenNetworkSelector
					bind:selectedToken={selectedSourceToken}
					disabled={isDeploying || $isSwapping}
				/>
				{#if $isSwapping}
					<div class="mt-2 flex items-center gap-2 text-sm text-yellow-400">
						<LoadingSpinner size="sm" />
						Swapping to USDC on Base...
					</div>
				{/if}
				{#if deployError}
					<div class="mt-2 text-sm text-red-400">{deployError}</div>
				{/if}
			</div>
		{/if}

		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Quantity</div>
				<TradeAmountInput
					bind:this={tradeAmountInputRef}
					aria-label="Quantity"
					amountToken={assetToken}
					balanceToken={orderSide === 'Buy' ? settlementToken : assetToken}
					bind:amount={selectedAmount}
					bind:balance={spendingTokenBalance}
					bind:balanceDecimals={spendingTokenBalanceDecimals}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
					showUnit={false}
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
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Limit Price
					<span class="ml-1 text-xs text-gray-500">({settlementLabel} per {assetToken.symbol})</span
					>
				</div>
				<Input
					aria-label="Limit Price"
					type="number"
					unit={settlementLabel}
					bind:amount={selectedInitialRatio}
					validate={validateBaseline}
					bind:isError={selectedInitialRatioError}
					on:input={handlePriceInput}
				/>
			</div>
		</div>

		<!-- Order summary -->
		<div class={containerStyles.cardBordered}>
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-gray-400">{orderSide === 'Buy' ? 'Buying' : 'Selling'}</span>
					<span class="font-medium">
						{selectedAmount
							? parseFloat(formatUnits(selectedAmount, assetToken.decimals)).toFixed(3)
							: '0'}
						{assetToken.symbol}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">At price</span>
					<span class="font-medium">
						{selectedInitialRatio || '0'}
						{settlementLabel}
					</span>
				</div>
				<div class="mt-2 border-t border-white/10 pt-2">
					<div class="flex justify-between">
						<span class="text-gray-400">Total</span>
						<span class={`text-lg font-semibold ${summaryAccentClass}`}>
							{totalCost}
							{settlementLabel}
						</span>
					</div>
					{#if belowMinTradeError}
						<div
							class="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300"
						>
							Minimum trade size is $1. Please increase your order amount.
						</div>
					{/if}
				</div>
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
						<label for="receiving-vault" class="mb-2 block text-sm font-medium text-gray-300">
							Receiving vault
						</label>
						<select
							id="receiving-vault"
							bind:value={selectedVaultOption}
							class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none"
						>
							<option value="default">Default</option>
							<option value="order-specific">Order-specific</option>
						</select>
						<p class="mt-1 text-xs text-gray-500">
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

		<!-- Pay fees in stablecoin option -->
		<label
			class="flex cursor-pointer items-center gap-2 py-2"
			title={orderSide === 'Buy'
				? 'Pay gas fees using the stablecoin you selected above instead of ETH'
				: 'Pay gas fees using USDC on Base instead of ETH'}
		>
			<input
				type="checkbox"
				checked={$payFeesInStablecoin}
				on:change={() => payFeesInStablecoin.toggle()}
				class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
			/>
			<span class="text-sm text-gray-300">Pay fees in stablecoin</span>
			<span class="group relative">
				<svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span
					class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded bg-gray-900 px-3 py-2 text-xs text-gray-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
				>
					{#if orderSide === 'Buy'}
						Pay gas fees using the stablecoin/network you selected to buy with (e.g., USDC or USDT
						on various networks). No ETH required.
					{:else}
						Pay gas fees using USDC on Base (your settlement token). No ETH required.
					{/if}
				</span>
			</span>
		</label>

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
				class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-gray-800"
			/>
			<span class="text-xs text-gray-400">Review strategy source code on deploy</span>
		</label>
	</div>
{:else}
	<div class="flex h-32 items-center justify-center">
		<LoadingSpinner size="md" text="Loading..." />
	</div>
{/if}

<!-- Price Warning Modal -->
<Modal
	show={showPriceWarning}
	title="Unfavorable Limit Price"
	maxWidthClass="max-w-lg"
	onClose={cancelDeploy}
>
	<div class="space-y-6">
		<div class="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
			<div class="flex gap-3">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div>
					<h3 class="font-semibold text-yellow-200">
						Price significantly {orderSide === 'Buy' ? 'above best offer' : 'below best bid'}
					</h3>
					<p class="mt-2 text-sm text-yellow-100">
						Your limit price is set significantly {orderSide === 'Buy' ? 'above' : 'below'} the current
						best {orderSide === 'Buy' ? 'offer' : 'bid'}. You won't get the best possible price. We
						recommend using a market order instead.
					</p>
				</div>
			</div>
		</div>

		<label class="flex items-center gap-3">
			<input
				type="checkbox"
				bind:checked={userAcknowledgesWarning}
				class="h-4 w-4 rounded border-gray-300 bg-gray-800 text-yellow-500 focus:ring-yellow-500"
			/>
			<span class="text-sm text-gray-300">I understand and wish to continue</span>
		</label>

		<div class="flex gap-3">
			<button
				type="button"
				on:click={cancelDeploy}
				class="flex-1 rounded-md border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
			>
				Cancel
			</button>
			<button
				type="button"
				on:click={proceedWithDeploy}
				disabled={!userAcknowledgesWarning}
				class={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 ${
					userAcknowledgesWarning
						? 'bg-yellow-500 text-gray-900 hover:bg-yellow-600 focus:ring-yellow-400'
						: 'cursor-not-allowed bg-gray-600 text-gray-400 opacity-50'
				}`}
			>
				Continue
			</button>
		</div>
	</div>
</Modal>
