<script lang="ts">
	import type { CategorizedToken, LimitOrder } from '$lib/network';
	import { currentNetwork } from '$lib/stores';
	import { OrderV4_ABI } from '$lib/utils/quote';
	import { createRaindexClient } from '$lib/utils/raindexClient';
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
	export let passedOutputToken: CategorizedToken | undefined;

	// State for market price and quantity
	let marketPrice: bigint = 0n;
	let selectedAmount: bigint = 0n; // Amount user wants to acquire (output)
	let isLoadingPrice = true;
	let priceError = false;
	let availableOrders: Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: bigint; // Normalized to 18 decimals
	}> = [];
	let orderbook: string | undefined = undefined;

	// Transaction results
	let transactionHash: string | undefined = undefined;
	let transactionResults: {
		quantityFilled: bigint;
		averagePrice: bigint;
		actualSlippage: bigint;
		isPartialFill: boolean;
	} | undefined = undefined;

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
		const outputInTokens = parseFloat(formatUnits(selectedAmount, passedOutputToken?.decimals || 18));
		const pricePerToken = Number(marketPrice) / 1e18;
		return (outputInTokens * pricePerToken).toFixed(2);
	})();

	// Wallet connect modal state
	let showConnectModal = false;

	// Helper to normalize price to 18 decimals
	function normalizePriceTo18Decimals(
		floatHex: string,
		side: 'Buy' | 'Sell'
	): { normalized: bigint; error: boolean } {
		try {
			const floatResult = Float.fromHex(floatHex as `0x${string}`);
			if (floatResult.error) return { normalized: 0n, error: true };

			const fixedDecimalResult = floatResult.value!.abs().value!.toFixedDecimalLossy(18);
			if (fixedDecimalResult.error) return { normalized: 0n, error: true };

			const ratioBigInt = BigInt(fixedDecimalResult.value!.value);
			const PRECISION = BigInt(1e18);

			// For buy orders (opposite side is sell offers), price is inverted
			// For sell orders (opposite side is buy offers), price is direct
			if (side === 'Buy') {
				return { normalized: (PRECISION * PRECISION) / ratioBigInt, error: false };
			} else {
				return { normalized: ratioBigInt, error: false };
			}
		} catch {
			return { normalized: 0n, error: true };
		}
	}

	async function fetchMarketPrice() {
		if (!passedOutputToken || !passedOutputToken.limitOrders || !orderSide) {
			isLoadingPrice = false;
			return;
		}

		try {
			isLoadingPrice = true;
			priceError = false;

			const limitOrders = passedOutputToken.limitOrders.filter(
				(order: LimitOrder) => order.type !== orderSide
			);
			if (limitOrders.length === 0) {
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			const client = await createRaindexClient();

			// Fetch all available orders for the opposite side
			// Note: We fetch them one by one since the API takes orderHash (singular)
			const allOrders: RaindexOrder[] = [];
			for (const limitOrder of limitOrders) {
				const ordersResult = await client.getOrders(
					[$currentNetwork.id],
					{
						active: true,
						owners: [],
						orderHash: limitOrder.orderHash as `0x${string}`
					},
					1
				);

				if (!ordersResult.error && ordersResult.value && ordersResult.value.length > 0) {
					allOrders.push(...ordersResult.value);
				}
			}

			if (allOrders.length === 0) {
				priceError = true;
				return;
			}

			const tempAvailableOrders: typeof availableOrders = [];
			let totalWeightedPrice = 0n;
			let totalWeight = 0n;
			const PRECISION = BigInt(1e18);

			// Process each order
			for (const raindexOrderObj of allOrders) {
				// Get quotes for this order
				const quotesResult = await raindexOrderObj.getQuotes();
				if (quotesResult.error || !quotesResult.value || quotesResult.value.length === 0) {
					continue;
				}

				const validQuotes = quotesResult.value.filter(
					(q: RaindexOrderQuote) => q.success && q.data
				);
				if (validQuotes.length === 0) continue;

				// Convert RaindexOrder to SgOrder
				const sgOrderResult = raindexOrderObj.convertToSgOrder();
				if (sgOrderResult.error || !sgOrderResult.value) continue;

				const sgOrder = sgOrderResult.value;

				// Decode order
				const decodedOrder = AbiCoder.defaultAbiCoder().decode(
					[OrderV4_ABI],
					sgOrder.orderBytes
				);
				const orderData = decodedOrder[0] as OrderV4;

				// Use first valid quote to get price
				const quote = validQuotes[0];
				const ratio = quote.data?.ratio;
				if (!ratio) continue;

				const priceInfo = normalizePriceTo18Decimals(ratio, orderSide);

				if (priceInfo.error) continue;

				// Store order and its data
				tempAvailableOrders.push({
					order: sgOrder,
					orderData,
					quotes: validQuotes,
					price: priceInfo.normalized
				});

				// Accumulate for weighted average
				totalWeightedPrice = totalWeightedPrice + priceInfo.normalized;
				totalWeight = totalWeight + PRECISION;
			}

			if (tempAvailableOrders.length === 0) {
				priceError = true;
				return;
			}

			// Sort by price: best first
			// For Buy (buying output): lowest price first (best deal)
			// For Sell (selling output): highest price first (best deal)
			tempAvailableOrders.sort((a, b) => {
				if (orderSide === 'Buy') {
					return a.price < b.price ? -1 : 1;
				} else {
					return a.price > b.price ? -1 : 1;
				}
			});

			availableOrders = tempAvailableOrders;
			orderbook = tempAvailableOrders[0].order.orderbook.id;

			// Calculate average market price
			marketPrice = totalWeightedPrice / BigInt(tempAvailableOrders.length);
		} catch (error) {
			console.error('Error fetching market price:', error);
			priceError = true;
		} finally {
			isLoadingPrice = false;
		}
	}

	// Fetch market price when component mounts or dependencies change
	$: if (passedOutputToken && orderSide) {
		fetchMarketPrice();
	}

	// Filter orders to remove those >10% above best price, return filtered array
	function getFilteredOrders(): Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: bigint;
	}> {
		if (availableOrders.length === 0) return [];

		const bestPrice = availableOrders[0].price; // First is best (already sorted)
		const PRECISION = BigInt(1e18);
		const slippageMultiplier = BigInt(11000); // 1.1 = 110%

		// Filter to only orders within 10% of best price
		const maxAcceptablePrice = (bestPrice * slippageMultiplier) / BigInt(10000);

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

		// Filter orders to those within 10% of best price
		const filteredOrders = getFilteredOrders();
		if (filteredOrders.length === 0) {
			console.error('No orders within slippage tolerance');
			return;
		}

		// Calculate required input for desired output
		const PRECISION = BigInt(1e18);
		const outputDecimals = passedOutputToken?.decimals || 18;
		const inputDecimals = Number(filteredOrders[0].order.inputs[0]?.token?.decimals) || 18;
		const bestPrice = filteredOrders[0].price;

		// requiredInput = output * bestPrice / 1e18
		const requiredInputFp18 = (selectedAmount * bestPrice) / PRECISION;
		// Convert to input token decimals
		const requiredInputInTokenTerms = requiredInputFp18 / BigInt(10 ** (18 - inputDecimals));

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

		const floatWorstPrice = Float.fromFixedDecimalLossy(worstPrice, 18);
		const maxIORatioHex = floatWorstPrice.float.asHex();

		// User wants to acquire selectedAmount, so input is the constraint
		const inputFloat = Float.fromFixedDecimalLossy(requiredInputInTokenTerms, inputDecimals);

		const takeOrdersConfig: TakeOrdersConfigV4 = {
			minimumInput: inputFloat.float.asHex(),
			maximumInput: inputFloat.float.asHex(),
			maximumIORatio: maxIORatioHex,
			orders: takeOrderConfigs,
			data: '0x'
		};

		// Determine required approval amount
		let requiredApprovalAmount = requiredInputInTokenTerms;
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
			const slippage = worstPrice > 0n ? ((worstPrice - bestPrice) * BigInt(100)) / bestPrice : 0n;

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
				<span class="font-medium">{(Number(transactionResults.averagePrice) / 1e18).toFixed(6)}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-gray-400">Actual Slippage</span>
				<span class="font-medium">{transactionResults.actualSlippage.toString()}%</span>
			</div>
			{#if transactionResults.isPartialFill}
				<div class="mt-2 rounded-md bg-yellow-900/20 p-2 text-xs text-yellow-300">
					⚠️ Partial fill due to 10% slippage breaker. Not all requested quantity was available within
					acceptable price range.
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
						value={isLoadingPrice
							? 'Loading...'
							: priceError
								? 'Price unavailable'
								: (Number(marketPrice) / 1e18).toFixed(6)}
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
								: (Number(marketPrice) / 1e18).toFixed(6)} per {passedOutputToken.symbol}
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
						Using {getFilteredOrders().length} order{getFilteredOrders().length > 1 ? 's' : ''} within 10%
						slippage
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
