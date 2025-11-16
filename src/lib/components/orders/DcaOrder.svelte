<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import Select from '$lib/components/ui/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { CategorizedToken } from '$lib/network';
	import type { PythToken } from '$lib/types';
	import {
		validateBaseline,
		validatePeriod,
		validateSelectedAmount
	} from '$lib/validateDeploymentArgs';
	import Input from '$lib/components/ui/Input.svelte';
	import type { Hex } from 'viem';
	import { formatUnits } from 'viem';
	import { connected } from 'svelte-wagmi';
	import transactionStore from '$lib/transactionStore';
	import { hasValidPriceFeedId } from '$lib/derivations';
	import { currentNetwork, oracleQuotes } from '$lib/stores';
	import { containerStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';

	$: actionButtonClass =
		orderSide === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	export let passedInputToken: PythToken | undefined; // The token we're accumulating

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
			(passedInputToken as unknown as CategorizedToken) || selectedInputToken || ALL_TOKENS[0];
	}

	let selectedAmount: bigint = 0n;
	let selectedPeriodUnit: 'Days' | 'Hours' | 'Minutes' = 'Days';
	let selectedPeriod: string = '';
	let selectedBaseline: string = '';
	let selectedInitialRatio: string = '';

	let inputVaultId: Hex | undefined;
	let outputVaultId: Hex | undefined;

	$: isInputTokenSameAsOutputToken =
		selectedOutputToken?.address.toLowerCase() === selectedInputToken?.address.toLowerCase();

	// errors
	let selectedAmountError: boolean = false;
	let selectedPeriodError: boolean = false;
	let inputVaultIdError: boolean = false;
	let outputVaultIdError: boolean = false;
	let selectedBaselineError: boolean = false;
	let selectedInitialRatioError: boolean = false;
	let priceGuardrailError: boolean = false;

	$: depositAmount = selectedAmount;
	$: maxTradeAmount = selectedAmount ? selectedAmount / 10n : 0n;
	$: minTradeAmount = selectedAmount ? selectedAmount / 50n : 0n;

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
		inputVaultIdError ||
		outputVaultIdError ||
		selectedAmountError ||
		selectedPeriodError ||
		selectedBaselineError ||
		isInputTokenSameAsOutputToken ||
		selectedInitialRatioError ||
		priceGuardrailError;

	const handleDcaDeploy = () => {
		const normalizeDecimal = (v: string): string => {
			if (!v) return v;
			const n = Number(v);
			if (!Number.isFinite(n)) return v;
			// format to 18 fractional digits, then trim trailing zeros and dot
			return n
				.toFixed(18)
				.replace(/\.0+$/, '')
				.replace(/\.(.*?)(0+)$/, (m, p1) => (p1 ? `.${p1}`.replace(/\.$/, '') : ''))
				.replace(/\.$/, '');
		};

		const invertAndNormalize = (v: string): string => {
			const n = Number(v || '0');
			if (!Number.isFinite(n) || n === 0) return '0';
			return normalizeDecimal(String(1 / n));
		};

		if (!$connected) {
			showConnectModal = true;
			return;
		}
		if ($connected) {
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
				baseline:
					orderType === 'Bid'
						? invertAndNormalize(selectedBaseline)
						: normalizeDecimal(selectedBaseline),
				kickoff:
					orderType === 'Bid'
						? invertAndNormalize(selectedInitialRatio)
						: normalizeDecimal(selectedInitialRatio),
				minTradeAmount: minTradeAmount,
				maxTradeAmount: maxTradeAmount,
				inputVaultId: inputVaultId,
				outputVaultId: outputVaultId,
				depositAmount: depositAmount
			});
		}
	};

	// Wallet connect modal state
	let showConnectModal = false;

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
					<span class="ml-1 text-xs text-gray-500"
						>({orderSide === 'Buy' ? settlementLabel : selectedInputToken.symbol})</span
					>
				</div>
				<TradeAmountInput
					aria-label="Target Amount"
					amountToken={orderSide === 'Buy' ? selectedOutputToken : selectedInputToken}
					balanceToken={orderSide === 'Buy' ? selectedOutputToken : selectedInputToken}
					bind:amount={selectedAmount}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
					showMaxButton={false}
				/>
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
							{selectedAmount ? formatUnits(selectedAmount, selectedOutputToken.decimals) : '0'}
							{settlementLabel}
						{:else}
							{selectedAmount ? formatUnits(selectedAmount, selectedInputToken.decimals) : '0'}
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
			</div>
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
