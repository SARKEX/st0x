<script lang="ts">
	import { getAllTokensByNetwork } from '$lib/network';
	import Select from '$lib/components/ui/Select.svelte';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import type { Token } from 'sushi/currency';
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
	import { tokenGlobalQuote, currentNetwork } from '$lib/stores';
	import PythOracleRow from '$lib/components/PythOracleRow.svelte';
	import { containerStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';

	let selectedOrderType: 'Buy' | 'Sell' = 'Buy';

	const ORDER_TOGGLE_ACTIVE_CLASSES = {
		Buy: 'bg-green-500/20 text-green-400',
		Sell: 'bg-red-500/20 text-red-400'
	} as const;
	const ORDER_TOGGLE_INACTIVE_CLASSES = 'text-gray-400 hover:text-white';
	$: actionButtonClass =
		selectedOrderType === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	export let passedInputToken: PythToken | undefined; // The token we're accumulating

	// Filter tokens based on current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Initialize tokens - accumulating token from prop, USDC for payment
	let selectedInputToken: Token;
	let selectedOutputToken: Token;

	// Resolve tokens whenever network, token list, or prop changes
	$: if ($currentNetwork && ALL_TOKENS.length > 0) {
		const usdcToken = ALL_TOKENS.find((t) => t.symbol?.toUpperCase() === 'USDC');
		selectedOutputToken = usdcToken || ALL_TOKENS[0];
		selectedInputToken =
			(passedInputToken as unknown as Token) || selectedInputToken || ALL_TOKENS[0];
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

	$: depositAmount = selectedAmount;
	$: maxTradeAmount = selectedAmount ? selectedAmount / 10n : 0n;
	$: minTradeAmount = selectedAmount ? selectedAmount / 50n : 0n;

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
		selectedInitialRatioError;

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
			// For Buy: input is asset (what we're accumulating), output is USDC (what we're spending)
			// For Sell: input is USDC (what we're accumulating), output is asset (what we're spending)
			const inputTok = selectedOrderType === 'Buy' ? selectedInputToken : selectedOutputToken;
			const outputTok = selectedOrderType === 'Buy' ? selectedOutputToken : selectedInputToken;
			transactionStore.handleDcaDeploy({
				outputToken: outputTok,
				inputToken: inputTok,
				budgetAmount: selectedAmount,
				selectedPeriod: selectedPeriod,
				selectedPeriodUnit: selectedPeriodUnit,
				// For DCA, prices need to be inverted for Buy orders (not Sell)
				// Buy: User enters USDC price, but Rain expects asset/USDC ratio
				// Sell: User enters USDC price, Rain expects USDC/asset ratio (same as entered)
				baseline:
					selectedOrderType === 'Buy'
						? invertAndNormalize(selectedBaseline)
						: normalizeDecimal(selectedBaseline),
				kickoff:
					selectedOrderType === 'Buy'
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
			selectedOrderType === 'Buy'
				? selectedOutputToken?.decimals || 18
				: selectedInputToken?.decimals || 18;
		const amount = parseFloat(formatUnits(selectedAmount, decimals));
		const periods = parseFloat(selectedPeriod || '1');
		if (!Number.isFinite(amount) || !Number.isFinite(periods) || periods === 0) return '0.00';
		const dp = selectedOrderType === 'Buy' ? 2 : 6; // Preserve 2dp for Buy (USDC), higher precision for Sell
		return (amount / periods).toFixed(dp);
	})();

	// Dynamic label for accumulation/divestment depending on order type
	$: periodLabel = selectedOrderType === 'Buy' ? 'Accumulation Period' : 'Divestment Period';

	// Default Start Price to oracle price when available and if user hasn't entered a value yet
	$: if (hasValidPriceFeedId(selectedInputToken) && !selectedInitialRatio) {
		const feedId = (selectedInputToken as unknown as { priceFeedId?: string })?.priceFeedId;
		if (feedId) {
			fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`)
				.then((r) => r.json())
				.then((data) => {
					const parsed = data?.parsed?.[0]?.price;
					if (parsed) {
						const px = Number(parsed.price) * Math.pow(10, parsed.expo);
						if (!Number.isNaN(px) && !selectedInitialRatio) {
							selectedInitialRatio = String(px);
						}
					}
				})
				.catch(() => {
					// silently ignore; user can input manually
				});
		}
	}
</script>

{#if $currentNetwork && ALL_TOKENS.length > 0}
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
						{#if selectedInputToken.logoUrl}
							<img
								src={selectedInputToken.logoUrl}
								alt={selectedInputToken.symbol}
								class="h-6 w-6 rounded-full"
							/>
						{/if}
						<span class="text-lg font-semibold">{selectedInputToken.symbol}</span>
					</div>
				</div>
				<div class="flex items-center gap-2 text-sm text-gray-400">
					<span>{selectedOrderType === 'Buy' ? 'with' : 'for'}</span>
					<img src="/images/USDC.png" alt="USDC" class="h-5 w-5" />
					<span>USDC</span>
				</div>
			</div>
		</div>

		<!-- Target Amount and Period -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Target Amount
					<span class="ml-1 text-xs text-gray-500"
						>({selectedOrderType === 'Buy' ? 'USDC' : selectedInputToken.symbol})</span
					>
				</div>
				<TradeAmountInput
					aria-label="Target Amount"
					amountToken={selectedOrderType === 'Buy' ? selectedOutputToken : selectedInputToken}
					bind:amount={selectedAmount}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">{periodLabel}</div>
				<div class="flex gap-2">
					<div class="flex-grow">
						<Input
							aria-label="Accumulation period"
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
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					{selectedOrderType === 'Buy' ? 'Ceiling Price' : 'Floor Price'}
				</div>
				<Input
					aria-label="Floor Price"
					type="number"
					unit="USDC"
					bind:amount={selectedBaseline}
					validate={validateBaseline}
					bind:isError={selectedBaselineError}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Start Price</div>
				<Input
					aria-label="Initial Ratio"
					type="number"
					unit="USDC"
					bind:amount={selectedInitialRatio}
					validate={validateBaseline}
					bind:isError={selectedInitialRatioError}
				/>
			</div>
		</div>

		<!-- Summary and Market Price side by side -->
		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<!-- Order Summary -->
			<div class={containerStyles.cardBordered}>
				<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-gray-400">Target Amount</span>
						<span class="font-medium">
							{#if selectedOrderType === 'Buy'}
								{selectedAmount ? formatUnits(selectedAmount, selectedOutputToken.decimals) : '0'} USDC
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
							{#if selectedOrderType === 'Buy'}
								~{avgPricePerPeriod} USDC
							{:else}
								~{avgPricePerPeriod} {selectedInputToken.symbol}
							{/if}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Min trade size</span>
						<span class="text-xs font-medium">
							{#if selectedOrderType === 'Buy'}
								{minTradeAmount ? formatUnits(minTradeAmount, selectedOutputToken.decimals) : '0'} USDC
							{:else}
								{minTradeAmount ? formatUnits(minTradeAmount, selectedInputToken.decimals) : '0'}
								{selectedInputToken.symbol}
							{/if}
						</span>
					</div>
					<div class="flex justify-between">
						<span class="text-gray-400">Max trade size</span>
						<span class="text-xs font-medium">
							{#if selectedOrderType === 'Buy'}
								{maxTradeAmount ? formatUnits(maxTradeAmount, selectedOutputToken.decimals) : '0'} USDC
							{:else}
								{maxTradeAmount ? formatUnits(maxTradeAmount, selectedInputToken.decimals) : '0'}
								{selectedInputToken.symbol}
							{/if}
						</span>
					</div>
				</div>
			</div>

			<!-- Current Market Price -->
			{#if hasValidPriceFeedId(selectedInputToken)}
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
								<PythOracleRow token={selectedInputToken} tokenQuotes={$tokenGlobalQuote} />
							</tbody>
						</table>
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
					{selectedOrderType === 'Buy' ? 'Enter a ceiling price' : 'Enter a floor price'}
				{:else if !selectedInitialRatio}
					Enter a start price
				{:else}
					Complete all fields
				{/if}
			{:else}
				Start DCA Strategy
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
