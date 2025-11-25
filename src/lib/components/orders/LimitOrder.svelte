<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/config/network';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/config/network';
	import { validateBaseline, validateSelectedAmount } from '$lib/utils/validation';
	import Input from '$lib/components/ui/Input.svelte';
	import { formatUnits, parseUnits } from 'viem';
	import type { Hex } from 'viem';
	import transactionStore from '$lib/stores/transaction';
	import { currentNetwork } from '$lib/stores';
	import { priceToIoratioString } from '$lib/utils/derivations';
	import type { PythToken } from '$lib/types';
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import { DEFAULT_INPUT_VAULT_ID } from '$lib/services/orderDeployment';

	/**
	 * assetToken: The non-settlement token being traded (from prop)
	 */
	export let assetToken: PythToken | undefined;
	export let currentPrice: string | undefined = undefined; // Current market price
	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	export let buyPrice: number | null = null; // Best bid price (what you get when selling)
	export let sellPrice: number | null = null; // Best ask price (what you pay when buying)

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
				(token) => token.address.toLowerCase() === settlementTokenConfig.address.toLowerCase()
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
	$: if (currentPrice && !selectedInitialRatio) {
		selectedInitialRatio = currentPrice;
	}

	let selectedAmount: bigint = 0n;

	$: isInputTokenSameAsOutputToken =
		orderInputToken?.address.toLowerCase() === orderOutputToken?.address.toLowerCase();

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
		selectedAmountError;

	const handleDeploy = async () => {
		if (!orderInputToken || !orderOutputToken || !assetToken || !settlementToken) return;
		if (!$connected) {
			showConnectModal = true;
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

		// Prepare deploy data
		let deployData: {
			inputToken: CategorizedToken;
			outputToken: CategorizedToken;
			ioRatio: string;
			depositAmount: bigint;
			inputVaultId: Hex | undefined;
		};

		// Convert user-facing 'Buy'/'Sell' to order terminology 'Bid'/'Ask'
		const orderType = orderSide === 'Buy' ? 'Bid' : 'Ask';

		if (orderType === 'Bid') {
			// Bid order (user buying): Places order to buy asset with the settlement token
			// User specifies quantity to acquire and price willing to pay
			// Price interpretation: "I pay X quote tokens per 1 asset"
			// The deployed order uses inverted ratio: 1/X
			const assetQuantity = formatUnits(selectedAmount || 0n, assetToken.decimals);
			const price = parseFloat(selectedInitialRatio || '0');
			const settlementNeeded = parseFloat(assetQuantity) * price;
			const settlementAmount = parseUnits(settlementNeeded.toString(), settlementToken.decimals);

			deployData = {
				inputToken: orderInputToken, // Asset (token to be acquired, used for IO ratio)
				outputToken: orderOutputToken, // payment token (token to be deposited as payment)
				// Bid price must be inverted: user says "pay X", orderbook stores "1/X"
				ioRatio: priceToIoratioString('Bid', selectedInitialRatio, true),
				depositAmount: settlementAmount, // Payment amount in settlement token
				inputVaultId: selectedInputVaultId
			};
		} else {
			// Ask order (user selling): Places order to sell asset for the settlement token
			// User specifies quantity to offer and price willing to receive
			// Price interpretation: "I receive X quote tokens per 1 asset"
			// The deployed order uses direct ratio: X
			deployData = {
				inputToken: orderInputToken, // payment token (token expected in return)
				outputToken: orderOutputToken, // Asset (token being offered for sale)
				// Ask price remains unchanged: user says "receive X", orderbook stores "X"
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
	};

	// Wallet connect modal state
	let showConnectModal = false;

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
		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Quantity</div>
				<TradeAmountInput
					aria-label="Quantity"
					amountToken={assetToken}
					balanceToken={orderSide === 'Buy' ? settlementToken : assetToken}
					bind:amount={selectedAmount}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
					showUnit={false}
					showMaxButton={false}
				/>
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
						{selectedAmount ? formatUnits(selectedAmount, assetToken.decimals) : '0'}
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
				Create Order
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
			onConnect={() => (showConnectModal = false)}
		/>
	</div>
</Modal>

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
