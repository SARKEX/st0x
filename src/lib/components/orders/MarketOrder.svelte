<script lang="ts">
	import type { CategorizedToken } from '$lib/network';
	import { currentNetwork, orderbookQuotesResource } from '$lib/stores';
	import { ensureResource } from '$lib/stores/network-data-cache';
	import { OrderV4_ABI, type ProcessedQuote } from '$lib/utils/quote';
	import { createRaindexClient } from '$lib/utils/raindexClient';
	import {
		type OrderV4,
		type SgOrder,
		type TakeOrderConfigV4,
		type TakeOrdersConfigV4
	} from '@rainlanguage/orderbook';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { AbiCoder } from 'ethers';
	import { formatUnits } from 'viem';
	import { containerStyles } from '$lib/utils/styles';
	import { priceToIoratio } from '$lib/utils/tokenMath';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import { validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import transactionStore from '$lib/transactionStore';
	import { Float } from '@rainlanguage/float';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	export let passedOutputToken: CategorizedToken | undefined;

	// State for market price and quantity
	let marketPrice: bigint = 0n;
	let selectedAmount: bigint = 0n; // Quantity to acquire from order outputs (in output token decimals)
	let isLoadingPrice = true;
	let priceError = false;
	let availableQuotes: ProcessedQuote[] = [];
	let orderbook: string | undefined = undefined;

	$: settlementToken = $currentNetwork?.defaultSettlementToken;
	$: settlementTokenSymbol = settlementToken?.symbol ?? 'Quote';

	// Errors
	let selectedAmountError: boolean = false;

	$: summaryAccentClass = orderSide === 'Buy' ? 'text-green-400' : 'text-red-400';
	$: actionButtonClass =
		orderSide === 'Buy'
			? 'bg-green-500 hover:bg-green-600 text-white'
			: 'bg-red-500 hover:bg-red-600 text-white';

	$: disableDeploy =
		!selectedAmount ||
		!marketPrice ||
		!passedOutputToken ||
		selectedAmountError ||
		isLoadingPrice ||
		priceError;

	// Calculate required input to take from the order's output
	$: requiredInputAmount = (() => {
		if (!selectedAmount || !marketPrice) return '0.00';
		// Output amount * market price = input amount
		const outputInTokens = parseFloat(
			formatUnits(selectedAmount, passedOutputToken?.decimals || 18)
		);
		const settlementDecimals = settlementToken?.decimals ?? 18;
		const pricePerToken = Number(marketPrice) / Math.pow(10, settlementDecimals);
		const total = outputInTokens * pricePerToken;
		return `~${total.toFixed(2)} ${settlementTokenSymbol}`;
	})();

	// Wallet connect modal state
	let showConnectModal = false;

	// Filter and process quotes when orderbookQuotesResource or orderSide changes
	$: {
		isLoadingPrice = $orderbookQuotesResource?.status === 'loading' || $orderbookQuotesResource?.status === 'idle';
		priceError = false;

		const quotes = $orderbookQuotesResource?.data?.quotes ?? [];
		const assetAddress = passedOutputToken?.address?.toLowerCase();
		const settlementTokenAddress = settlementToken?.address?.toLowerCase();

		if (!passedOutputToken || !orderSide || quotes.length === 0 || !assetAddress || !settlementTokenAddress) {
			if (!isLoadingPrice && quotes.length === 0) {
				priceError = true;
			}
			availableQuotes = [];
			marketPrice = 0n;
		} else {
			// Filter quotes for the current token and opposite side
			// For Buy: we want ask-side quotes (orders selling the asset)
			// For Sell: we want bid-side quotes (orders buying the asset)
			const filteredQuotes = quotes.filter((quote) => {
				const isCorrectAsset = quote.assetAddress?.toLowerCase() === assetAddress;
				const isOppositeSide =
					(orderSide === 'Buy' && quote.side === 'ask') ||
					(orderSide === 'Sell' && quote.side === 'bid');
				const hasValidPrice = quote.quotePerAsset !== undefined && quote.quotePerAsset > 0;

				return isCorrectAsset && isOppositeSide && hasValidPrice;
			});

			if (filteredQuotes.length === 0) {
				priceError = !isLoadingPrice;
				availableQuotes = [];
				marketPrice = 0n;
			} else {
				// Sort by price: best first
				// When market order is Buy: want lowest price (best for buyer)
				// When market order is Sell: want highest price (best for seller)
				const sortedQuotes = [...filteredQuotes].sort((a, b) => {
					const priceA = a.quotePerAsset ?? 0;
					const priceB = b.quotePerAsset ?? 0;
					if (orderSide === 'Buy') {
						return priceA - priceB; // Lowest first
					} else {
						return priceB - priceA; // Highest first
					}
				});

				availableQuotes = sortedQuotes;

				// Calculate average market price from sorted quotes
				// Store in settlement token's lowest denomination
				const totalPrice = sortedQuotes.reduce((sum, q) => sum + (q.quotePerAsset ?? 0), 0);
				const averagePrice = totalPrice / sortedQuotes.length;
				const settlementPriceDecimals = settlementToken?.decimals ?? 18;
				marketPrice = BigInt(Math.round(averagePrice * Math.pow(10, settlementPriceDecimals)));

				// Set orderbook from first quote (for reference)
				orderbook = sortedQuotes[0].orderHash;
			}
		}

		isLoadingPrice = false;
	}

	// Filter quotes to remove those >10% above best price, return filtered array
	function getFilteredQuotes(): ProcessedQuote[] {
		if (availableQuotes.length === 0) return [];

		const bestPrice = availableQuotes[0].quotePerAsset ?? 0; // First is best (already sorted)
		const slippageMultiplier = 1.1; // 10% slippage

		// Filter to only quotes within 10% of best price
		const maxAcceptablePrice = bestPrice * slippageMultiplier;

		const filtered = availableQuotes.filter((quote) => {
			return (quote.quotePerAsset ?? 0) <= maxAcceptablePrice;
		});

		return filtered;
	}

	const handleMarketOrder = async () => {
		if (!$connected) {
			showConnectModal = true;
			return;
		}

		if (availableQuotes.length === 0 || !orderbook || !selectedAmount) {
			return;
		}

		try {
			// Force refresh of the orderbook quotes dataStore to get latest orders
			await ensureResource($currentNetwork.id, 'orderbookQuotes', { force: true });

			// Get fresh quotes from the updated dataStore
			const freshQuotes = $orderbookQuotesResource?.data?.quotes ?? [];

			// Re-filter fresh quotes for the current token and opposite side
			const assetAddress = passedOutputToken?.address?.toLowerCase();
			const freshFilteredQuotes = freshQuotes.filter((quote) => {
				const isCorrectAsset = quote.assetAddress?.toLowerCase() === assetAddress;
				const isOppositeSide =
					(orderSide === 'Buy' && quote.side === 'ask') ||
					(orderSide === 'Sell' && quote.side === 'bid');
				const hasValidPrice = quote.quotePerAsset !== undefined && quote.quotePerAsset > 0;

				return isCorrectAsset && isOppositeSide && hasValidPrice;
			});

			// Sort fresh quotes by price
			const sortedFreshQuotes = [...freshFilteredQuotes].sort((a, b) => {
				const priceA = a.quotePerAsset ?? 0;
				const priceB = b.quotePerAsset ?? 0;
				if (orderSide === 'Buy') {
					return priceA - priceB; // Lowest first
				} else {
					return priceB - priceA; // Highest first
				}
			});

			if (sortedFreshQuotes.length === 0) {
				console.error('No orders available at execution time');
				return;
			}

			// Apply slippage filter to fresh quotes
			const bestFreshPrice = sortedFreshQuotes[0].quotePerAsset ?? 0;
			const slippageMultiplier = 1.1;
			const maxAcceptablePrice = bestFreshPrice * slippageMultiplier;
			const quotesToExecute = sortedFreshQuotes.filter(
				(quote) => (quote.quotePerAsset ?? 0) <= maxAcceptablePrice
			);

			if (quotesToExecute.length === 0) {
				console.error('No orders within slippage tolerance at execution time');
				return;
			}

			// Fetch full order data for all filtered quotes
			const client = await createRaindexClient();
			const ordersToExecute: Array<{ quote: ProcessedQuote; order: SgOrder; orderData: OrderV4 }> = [];

			for (const quote of quotesToExecute) {
				try {
					const ordersResult = await client.getOrders(
						[$currentNetwork.id],
						{
							active: true,
							owners: [],
							orderHash: quote.orderHash as `0x${string}`
						},
						1
					);

					if (!ordersResult.error && ordersResult.value && ordersResult.value.length > 0) {
						const raindexOrder = ordersResult.value[0];
						const sgOrderResult = raindexOrder.convertToSgOrder();
						if (!sgOrderResult.error && sgOrderResult.value) {
							const sgOrder = sgOrderResult.value;
							const decodedOrder = AbiCoder.defaultAbiCoder().decode(
								[OrderV4_ABI],
								sgOrder.orderBytes
							);
							const orderData = decodedOrder[0] as OrderV4;
							ordersToExecute.push({ quote, order: sgOrder, orderData });
						}
					}
				} catch (error) {
					console.warn(`Failed to fetch order ${quote.orderHash}:`, error);
					// Continue with next order
					continue;
				}
			}

			if (ordersToExecute.length === 0) {
				console.error('Failed to fetch order data for any filtered quotes');
				return;
			}

			// Calculate required input for desired output using fresh prices
			const bestPrice = sortedFreshQuotes[0].quotePerAsset ?? 0;
			const assetDecimals = passedOutputToken?.decimals ?? 18;
			const settlementTokenDecimals = settlementToken?.decimals ?? 18;

			// For a BUY order:
			// requiredInput (in settlement wei) = selectedAmount (in asset wei) * bestPrice * 10^settlementDecimals / 10^assetDecimals
			// We calculate this as: selectedAmount * bestPrice * 10^(settlementDecimals - assetDecimals)
			const requiredInputAmount =
				orderSide === 'Buy'
					? BigInt(Math.round(Number(selectedAmount) * bestPrice * Math.pow(10, settlementTokenDecimals - assetDecimals)))
					: selectedAmount;

			// Build TakeOrderConfigs for ALL orders we fetched
			const takeOrderConfigs: TakeOrderConfigV4[] = [];

			for (const { orderData } of ordersToExecute) {
				const takeOrderConfig: TakeOrderConfigV4 = {
					order: {
						owner: orderData.owner,
						evaluable: orderData.evaluable,
						validInputs: [
							{
								token: orderData.validInputs[0].token,
								vaultId: orderData.validInputs[0].vaultId.toString()
							}
						],
						validOutputs: [
							{
								token: orderData.validOutputs[0].token,
								vaultId: orderData.validOutputs[0].vaultId.toString()
							}
						],
						nonce: orderData.nonce
					},
					inputIOIndex: '0',
					outputIOIndex: '0',
					signedContext: []
				};

				takeOrderConfigs.push(takeOrderConfig);
			}

			// Use worst price in filtered set for maximumIORatio (already within 10%)
			const worstPrice = sortedFreshQuotes[sortedFreshQuotes.length - 1].quotePerAsset ?? 0;
			const worstIoratio = priceToIoratio(worstPrice, orderSide);

			if (worstIoratio === null) {
				console.error('Failed to calculate worst ioratio from price');
				return;
			}

			// For a BUY order: input (GET) = asset, output (GIVE) = settlement
			// For a SELL order: input (GET) = settlement, output (GIVE) = asset
			const inputTokenDecimals = orderSide === 'Buy' ? assetDecimals : settlementTokenDecimals;
			const outputTokenDecimals = orderSide === 'Buy' ? settlementTokenDecimals : assetDecimals;
			const decimalDiff = inputTokenDecimals - outputTokenDecimals;

			// ioratio in wei scale = ioratio * 10^(inputDecimals - outputDecimals)
			const worstIoratioBigInt = BigInt(Math.round(worstIoratio * Math.pow(10, decimalDiff)));
			const floatWorstPrice = Float.fromFixedDecimalLossy(worstIoratioBigInt, decimalDiff);
			const maxIORatioHex = floatWorstPrice.float.asHex();

			// Use settlement token decimals for input amount (input token is always the settlement token)
			const inputFloat = Float.fromFixedDecimalLossy(requiredInputAmount, settlementTokenDecimals);

			const zeroFloat = Float.fromFixedDecimalLossy(0n, 0);
			const takeOrdersConfig: TakeOrdersConfigV4 = {
				minimumInput: zeroFloat.float.asHex(),
				maximumInput: inputFloat.float.asHex(),
				maximumIORatio: maxIORatioHex,
				orders: takeOrderConfigs,
				data: '0x'
			};

			// Determine required approval amount
			let requiredApprovalAmount = requiredInputAmount;
			if (inputFloat.lossless) {
				requiredApprovalAmount = requiredApprovalAmount + 1n;
			}

			await transactionStore.handleTakeOrders(
				takeOrdersConfig,
				ordersToExecute[0].order,
				requiredApprovalAmount
			);
		} catch (error) {
			console.error('Transaction failed:', error);
		}
	};
</script>

{#if $currentNetwork && passedOutputToken}
	<div class="space-y-4">
		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Amount to {orderSide === 'Buy' ? 'Buy' : 'Sell'}
				</div>
				<TradeAmountInput
					aria-label="Quantity"
					amountToken={passedOutputToken}
					bind:amount={selectedAmount}
					validate={validateSelectedAmount}
					bind:isError={selectedAmountError}
					showUnit={false}
					showMaxButton={false}
				/>
			</div>
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Market Price
				</div>
				<div class="relative">
					<input
						type="text"
						value={isLoadingPrice
							? 'Loading...'
							: priceError
								? 'Price unavailable'
								: `~${(Number(marketPrice) / Math.pow(10, settlementToken?.decimals ?? 18)).toFixed(2)} ${settlementTokenSymbol}`}
						disabled
						class="w-full rounded-md border border-white/10 bg-gray-800/50 px-3 py-2 text-gray-300 placeholder-gray-500 focus:border-yellow-400/50 focus:outline-none focus:ring-1 focus:ring-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-50"
					/>
					{#if isLoadingPrice}
						<div class="absolute right-3 top-1/2 -translate-y-1/2">
							<LoadingSpinner size="sm" />
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Order summary -->
		<div class={containerStyles.cardBordered}>
			<h4 class="mb-3 text-sm font-medium text-gray-300">Order Summary</h4>
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-gray-400">{orderSide === 'Buy' ? 'Buying' : 'Selling'}</span>
					<span class="font-medium">
						{selectedAmount ? formatUnits(selectedAmount, passedOutputToken.decimals) : '0'}
						{passedOutputToken.symbol}
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">At market price</span>
					<span class="font-medium">
						{isLoadingPrice
							? 'Loading...'
							: priceError
								? 'N/A'
								: `~${(Number(marketPrice) / Math.pow(10, settlementToken?.decimals ?? 18)).toFixed(2)} ${settlementTokenSymbol}`}
					</span>
				</div>
				<div class="mt-2 border-t border-white/10 pt-2">
					<div class="flex justify-between">
						<span class="text-gray-400">Estimated Cost</span>
						<span class={`text-lg font-semibold ${summaryAccentClass}`}>
							{isLoadingPrice || priceError ? 'N/A' : requiredInputAmount}
						</span>
					</div>
				</div>
				{#if getFilteredQuotes().length > 0}
					<div class="mt-2 pt-2 text-xs text-gray-500">
						Using {getFilteredQuotes().length} order{getFilteredQuotes().length > 1 ? 's' : ''} within
						10% slippage
					</div>
				{/if}
			</div>
		</div>

		<!-- Market Order Button -->
		<button
			on:click={handleMarketOrder}
			disabled={disableDeploy}
			class={`w-full rounded-md px-4 py-3 text-sm font-semibold transition-all ${
				disableDeploy
					? 'cursor-not-allowed bg-gray-600 text-gray-300 opacity-50'
					: actionButtonClass
			}`}
		>
			{#if disableDeploy}
				{#if isLoadingPrice}
					Loading market price...
				{:else if priceError}
					Price unavailable
				{:else if !selectedAmount}
					Enter an amount
				{:else}
					Complete all fields
				{/if}
			{:else}
				Place Market Order
			{/if}
		</button>
	</div>
{/if}

{#if !$currentNetwork || !passedOutputToken}
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
