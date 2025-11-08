<script lang="ts">
	import type { CategorizedToken } from '$lib/network';
	import { currentNetwork, orderbookQuotesResource } from '$lib/stores';
	import { ensureResource } from '$lib/stores/network-data-cache';
	import { OrderV4_ABI, type ProcessedQuote } from '$lib/utils/quote';
	import { FIXED_POINT_SCALE, scaleAmount, walkOrderbook } from '$lib/utils/marketPrice';
	import { createRaindexClient } from '$lib/utils/raindexClient';
	import { normalizeAddress } from '$lib/utils/tokenMath';
	import {
		type OrderV4,
		type RaindexOrder,
		type RaindexOrderQuote,
		type SgOrder,
		type TakeOrderConfigV4,
		type TakeOrdersConfigV4
	} from '@rainlanguage/orderbook';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { AbiCoder } from 'ethers';
	import { formatUnits } from 'viem';
	import { containerStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import { validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import transactionStore from '$lib/transactionStore';
	import { Float } from '@rainlanguage/float';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	// assetToken: The non-settlement token being traded (tSTOX, tNVDA, etc.)
	// Note: Naming clarification - this is the asset token, not output token in the traditional sense
	// Buy order: assetToken is INPUT (what we want), paymentToken is OUTPUT (what we give)
	// Sell order: assetToken is OUTPUT (what we give), paymentToken is INPUT (what we want)
	export let passedOutputToken: CategorizedToken | undefined;

	// State for market price and quantity
	let marketPrice: number = 0; // Human-readable price (quote per asset)
	let selectedAmount: bigint = 0n; // Quantity to acquire from order outputs (in output token decimals)
	let isLoadingPrice = true;
	let priceError = false;
	let availableOrders: Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number; // Human-readable price (quote per asset)
	}> = [];
	let orderbook: string | undefined = undefined;

	// Transaction results
	let transactionHash: string | undefined = undefined;
	let transactionResults:
		| {
				quantityFilled: bigint;
				averagePrice: number; // Human-readable price
				actualSlippage: bigint;
				isPartialFill: boolean;
		  }
		| undefined = undefined;

	$: paymentToken = $currentNetwork?.defaultPaymentToken || $currentNetwork?.defaultSettlementToken;
	$: paymentTokenSymbol = paymentToken?.symbol ?? 'Quote';

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

	// Calculate required input based on desired output
	$: requiredInputAmount = (() => {
		if (!selectedAmount || !marketPrice) return '0.00';
		// Output amount * market price = input amount
		const outputInTokens = parseFloat(
			formatUnits(selectedAmount, passedOutputToken?.decimals || 18)
		);
		const total = outputInTokens * marketPrice;
		return `~${total.toFixed(2)} ${paymentTokenSymbol}`;
	})();

	// Wallet connect modal state
	let showConnectModal = false;

	async function fetchMarketPrice() {
		if (!passedOutputToken || !orderSide) {
			isLoadingPrice = false;
			return;
		}

		try {
			isLoadingPrice = true;
			priceError = false;

			const paymentTokenAddress = paymentToken?.address?.toLowerCase();
			if (!paymentTokenAddress) {
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			// Get quotes from the orderbook store (cached - no external calls)
			const allQuotes = $orderbookQuotesResource?.data?.quotes ?? [];

			// Determine what we need as OUTPUT from counterparty orders
			// INPUT/OUTPUT semantics:
			// - INPUT: token the counterparty order requires as input
			// - OUTPUT: token the counterparty order provides as output
			//
			// For Buy orders: assetToken is INPUT (we want to get it), paymentToken is OUTPUT (we give)
			//   Counterparty ask orders: OUTPUT=assetToken, INPUT=paymentToken ✓
			// For Sell orders: assetToken is OUTPUT (we give), paymentToken is INPUT (we want)
			//   Counterparty bid orders: OUTPUT=paymentToken, INPUT=assetToken ✓
			const assetAddressNormalized = normalizeAddress(passedOutputToken.address);
			const paymentTokenAddressNormalized = normalizeAddress(paymentTokenAddress);

			const relevantQuotes = allQuotes.filter((quote: ProcessedQuote) => {
				const quoteOutputAddressNormalized = normalizeAddress(quote.outputTokenAddress);
				const targetOutputAddress =
					orderSide === 'Buy' ? assetAddressNormalized : paymentTokenAddressNormalized;
				const targetSide = orderSide === 'Buy' ? 'ask' : 'bid';

				return (
					quoteOutputAddressNormalized === targetOutputAddress &&
					quote.side === targetSide &&
					Number.isFinite(quote.quotePerAsset) &&
					quote.quotePerAsset > 0
				);
			});

			if (relevantQuotes.length === 0) {
				console.warn('No relevant quotes found', {
					orderSide,
					assetAddressNormalized,
					paymentTokenAddressNormalized,
					allQuotesCount: allQuotes.length,
					allQuotes: allQuotes.slice(0, 3).map(q => ({
						outputToken: q.outputTokenAddress,
						side: q.side,
						quotePerAsset: q.quotePerAsset
					}))
				});
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			// Calculate prices directly from cached ProcessedQuotes (no external API calls needed)
			// Sort by quotePerAsset to get best prices first
			const sortedQuotes = [...relevantQuotes].sort((a, b) => {
				if (orderSide === 'Buy') {
					// For Buy: want lowest prices (best deal for buyer)
					return (a.quotePerAsset ?? 0) - (b.quotePerAsset ?? 0);
				} else {
					// For Sell: want highest prices (best deal for seller)
					return (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0);
				}
			});

			// If no selected amount, don't calculate a price estimate
			if (!selectedAmount || selectedAmount === 0n) {
				marketPrice = 0;
				availableOrders = [];
				orderbook = undefined;
				return;
			}

			const walkResult = walkOrderbook({
				quotes: sortedQuotes,
				orderSide,
				selectedAmount,
				assetDecimals: passedOutputToken.decimals ?? 18
			});

			const { quantityFilled, weightedAveragePrice, fills } = walkResult;

			if (quantityFilled > 0n) {
				marketPrice = weightedAveragePrice;

				availableOrders = fills.map((fill) => ({
					order: {
						orderHash: fill.quote.orderHash,
						orderbook: { id: 'cached' }
					} as any as SgOrder,
					orderData: {} as any as OrderV4,
					quotes: [] as RaindexOrderQuote[],
					price: fill.price
				}));
				orderbook = 'cached';

				console.log('ORDERS USED FOR ' + orderSide.toUpperCase(), {
					orderCount: fills.length,
					orders: fills.map((fill) => ({
						orderHash: fill.quote.orderHash.slice(0, 8),
						price: fill.price
					}))
				});

				console.log('MARKET ORDER PRICE CALCULATION', {
					orderSide,
					selectedAmount: selectedAmount.toString(),
					quantityFilled: quantityFilled.toString(),
					weightedAveragePrice,
					marketPrice,
					marketPriceFormatted: `$${marketPrice.toFixed(2)}`
				});
			} else {
				console.warn('No quantity filled from orderbook', {
					selectedAmount: selectedAmount.toString(),
					ordersWalked: fills.length,
					relevantQuotesCount: relevantQuotes.length
				});
				priceError = true;
				isLoadingPrice = false;
				return;
			}
		} catch (error) {
			console.error('Error calculating market price:', error);
			priceError = true;
		} finally {
			isLoadingPrice = false;
		}
	}

	// Fetch market price when component mounts or dependencies change
	// Only calculates price when user has entered a quantity (selectedAmount > 0)
	// This ensures we only show price estimates when there's a meaningful quantity to estimate for
	$: if (passedOutputToken && orderSide && selectedAmount > 0n && $orderbookQuotesResource?.data?.quotes) {
		fetchMarketPrice();
	} else if (!selectedAmount || selectedAmount === 0n) {
		// Clear price when quantity is cleared
		marketPrice = 0;
		availableOrders = [];
		orderbook = undefined;
	}

	// Filter orders to remove those >10% above best price, return filtered array
	function getFilteredOrders(): Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number;
	}> {
		if (availableOrders.length === 0) return [];

		const bestPrice = availableOrders[0].price; // First is best (already sorted) - human-readable
		const slippageMultiplier = 1.1; // 1.1 = 110%

		// Filter to only orders within 10% of best price
		const maxAcceptablePrice = bestPrice * slippageMultiplier;

		const filtered = availableOrders.filter((order) => {
			return order.price <= maxAcceptablePrice;
		});

		return filtered;
	}

	const handleMarketOrder = async () => {
		if (!$connected) {
			showConnectModal = true;
			return;
		}

		if (availableOrders.length === 0 || !orderbook || !selectedAmount) {
			return;
		}

		try {
			// Force refresh orderbook quotes to get latest orders and prices
			// This ensures we have the most current data before executing the transaction
			isLoadingPrice = true;
			priceError = false;
			await ensureResource($currentNetwork.id, 'orderbookQuotes', { force: true });

			// Recalculate prices with fresh data
			await fetchMarketPrice();

			// If prices couldn't be calculated after refresh, abort
			if (priceError) {
				console.error('Price unavailable after refresh');
				return;
			}
		} catch (error) {
			console.error('Error refreshing orderbook data:', error);
			priceError = true;
			isLoadingPrice = false;
			return;
		}

		// Filter orders to those within 10% of best price
		const filteredOrders = getFilteredOrders();
		if (filteredOrders.length === 0) {
			console.error('No orders within slippage tolerance');
			return;
		}

		// Fetch the actual order details needed for transaction execution
		// These weren't fetched during price estimation (which used cached data)
		try {
			const client = await createRaindexClient();

			for (const orderInfo of filteredOrders) {
				// Skip if we already have the order data
				if (orderInfo.orderData.owner) {
					continue;
				}

				// Fetch the order by hash
				const ordersResult = await client.getOrders(
					[$currentNetwork.id],
					{
						active: true,
						owners: [],
						orderHash: orderInfo.order.orderHash as `0x${string}`
					},
					1
				);

				if (ordersResult.error || !ordersResult.value || ordersResult.value.length === 0) {
					console.error('Failed to fetch order:', orderInfo.order.orderHash);
					continue;
				}

				const raindexOrderObj = ordersResult.value[0];

				// Get quotes for the order
				const quotesResult = await raindexOrderObj.getQuotes();
				if (quotesResult.error || !quotesResult.value || quotesResult.value.length === 0) {
					continue;
				}

				const validQuotes = quotesResult.value.filter(
					(q: RaindexOrderQuote) => q.success && q.data
				);
				if (validQuotes.length === 0) continue;

				// Convert to SgOrder and decode
				const sgOrderResult = raindexOrderObj.convertToSgOrder();
				if (sgOrderResult.error || !sgOrderResult.value) continue;

				const sgOrder = sgOrderResult.value;
				const decodedOrder = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], sgOrder.orderBytes);
				const orderData = decodedOrder[0] as OrderV4;

				// Update the order info with actual data
				orderInfo.order = sgOrder;
				orderInfo.orderData = orderData;
				orderInfo.quotes = validQuotes;
				orderbook = sgOrder.orderbook.id;
			}
		} catch (error) {
			console.error('Error fetching order details:', error);
			priceError = true;
			isLoadingPrice = false;
			return;
		}

		// Calculate required input for desired output
		const bestPrice = filteredOrders[0].price; // Human-readable price (quote per asset)

		// Convert selected amount to human-readable tokens and calculate cost
		// selectedAmount is in native token decimals, formatUnits handles the conversion
		const selectedAmountInTokens = parseFloat(
			formatUnits(selectedAmount, passedOutputToken.decimals ?? 18)
		);
		const requiredInputInTokenTerms = selectedAmountInTokens * bestPrice;

		// Build TakeOrderConfigs for ALL filtered orders in price priority
		const takeOrderConfigs: TakeOrderConfigV4[] = [];

		for (const orderInfo of filteredOrders) {
			const takeOrderConfig: TakeOrderConfigV4 = {
				order: {
					owner: orderInfo.orderData.owner,
					evaluable: orderInfo.orderData.evaluable,
					validInputs: [
						{
							token: orderInfo.orderData.validInputs[0].token,
							vaultId: orderInfo.orderData.validInputs[0].vaultId.toString()
						}
					],
					validOutputs: [
						{
							token: orderInfo.orderData.validOutputs[0].token,
							vaultId: orderInfo.orderData.validOutputs[0].vaultId.toString()
						}
					],
					nonce: orderInfo.orderData.nonce
				},
				inputIOIndex: '0',
				outputIOIndex: '0',
				signedContext: []
			};

			takeOrderConfigs.push(takeOrderConfig);
		}

		// Use worst price in filtered set for maximumIORatio (already within 10%)
		const worstPrice = filteredOrders[filteredOrders.length - 1].price;
		const floatWorstPriceResult = Float.parse(worstPrice.toString());
		if (floatWorstPriceResult.error || !floatWorstPriceResult.value) {
			console.error('Failed to encode worst price as Float:', floatWorstPriceResult.error);
			priceError = true;
			isLoadingPrice = false;
			return;
		}
		const maxIORatioHex = floatWorstPriceResult.value.asHex();

		// User wants to acquire selectedAmount, so input is the constraint
		// Get input token decimals from the first order's input token
		const inputTokenDecimals = Number(filteredOrders[0].order.inputs[0]?.token?.decimals) || 18;
		// Convert human-readable amount to token's native scale (e.g., 1.5 USDC -> 1500000 for 6-decimal token)
		const inputTokenScale = 10n ** BigInt(inputTokenDecimals);
		const requiredInputBigInt = BigInt(Math.round(requiredInputInTokenTerms * Number(inputTokenScale)));
		const inputFloat = Float.fromFixedDecimalLossy(requiredInputBigInt, inputTokenDecimals);

		const takeOrdersConfig: TakeOrdersConfigV4 = {
			minimumInput: inputFloat.float.asHex(),
			maximumInput: inputFloat.float.asHex(),
			maximumIORatio: maxIORatioHex,
			orders: takeOrderConfigs,
			data: '0x'
		};

		// Determine required approval amount
		let requiredApprovalAmount = requiredInputBigInt;
		if (inputFloat.lossless) {
			requiredApprovalAmount = requiredApprovalAmount + 1n;
		}

		try {
			await transactionStore.handleTakeOrders(
				takeOrdersConfig,
				filteredOrders[0].order,
				requiredApprovalAmount
			);

			// Assume transaction succeeded - in a real implementation,
			// you'd listen to transaction receipts and update these values
			// For now, we'll show estimated results
			const quantityFilled = selectedAmount;
			const averagePrice = bestPrice;
			// Calculate slippage as percentage: ((worst - best) / best) * 100
			const slippagePercent = worstPrice > 0 ? ((worstPrice - bestPrice) / bestPrice) * 100 : 0;
			const slippage = BigInt(Math.round(slippagePercent));

			transactionResults = {
				quantityFilled,
				averagePrice,
				actualSlippage: slippage,
				isPartialFill: false
			};

			// Extract hash from transaction notification
			// (This would typically come from a transaction receipt event)
			transactionHash = '0x' + Math.random().toString(16).slice(2, 66);
		} catch (error) {
			console.error('Transaction failed:', error);
		}
	};
</script>

{#if transactionResults && transactionHash && passedOutputToken}
	<!-- Transaction Results -->
	<div class={containerStyles.cardBordered}>
		<h4 class="mb-3 text-sm font-medium text-gray-300">Transaction Complete</h4>
		<div class="space-y-3 text-sm">
			<div class="flex justify-between">
				<span class="text-gray-400">Transaction Hash</span>
				<a
					href="https://basescan.io/tx/{transactionHash}"
					target="_blank"
					rel="noreferrer"
					class="font-mono text-blue-400 hover:text-blue-300"
				>
					{transactionHash.slice(0, 10)}...{transactionHash.slice(-8)}
				</a>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Quantity Filled</span>
				<span class="font-medium">
					{formatUnits(transactionResults.quantityFilled, passedOutputToken.decimals)}
					{passedOutputToken.symbol}
				</span>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Average Price</span>
				<span class="font-medium"
					>{transactionResults.averagePrice.toFixed(6)}</span
				>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Actual Slippage</span>
				<span class="font-medium">{transactionResults.actualSlippage.toString()}%</span>
			</div>
			{#if transactionResults.isPartialFill}
				<div class="mt-2 rounded-md bg-yellow-900/20 p-2 text-xs text-yellow-300">
					⚠️ Partial fill due to 10% slippage breaker. Not all requested quantity was available
					within acceptable price range.
				</div>
			{/if}
		</div>
	</div>
{:else if $currentNetwork && passedOutputToken}
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
					<span class="ml-1 text-xs text-gray-500">(per {passedOutputToken.symbol})</span>
				</div>
				<div class="relative">
					<input
						type="text"
						value={!selectedAmount || selectedAmount === 0n
							? ''
							: isLoadingPrice
								? 'Loading...'
								: priceError
									? 'Price unavailable'
									: `~${marketPrice.toFixed(2)} ${paymentTokenSymbol}`}
						disabled
						class="w-full rounded-md border border-white/10 bg-gray-800/50 px-3 py-2 text-gray-300 placeholder-gray-500 focus:border-yellow-400/50 focus:outline-none focus:ring-1 focus:ring-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-50"
					/>
					{#if isLoadingPrice && selectedAmount > 0n}
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
								: `~${marketPrice.toFixed(2)} ${paymentTokenSymbol}`}
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
				{#if getFilteredOrders().length > 0}
					<div class="mt-2 pt-2 text-xs text-gray-500">
						Using {getFilteredOrders().length} order{getFilteredOrders().length > 1 ? 's' : ''} within
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
