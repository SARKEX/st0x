<script lang="ts">
	import type { CategorizedToken, LimitOrder } from "$lib/network";
	import { currentNetwork } from "$lib/stores";
	import type { PythToken } from "$lib/types";
	import { hexToBigInt, OrderV3_ABI } from "$lib/utils/quote";
	import { doQuoteSpecs, getOrders, type OrderV3, type QuoteSpec, type TakeOrderConfigV3, type TakeOrdersConfigV3 } from "@rainlanguage/orderbook";
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { AbiCoder, ethers } from 'ethers';
	import { formatUnits, parseUnits } from 'viem';
	import type { Hex } from 'viem';
	import { containerStyles } from '$lib/utils/styles';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import { validateSelectedAmount } from '$lib/validateDeploymentArgs';
	import transactionStore from "$lib/transactionStore";

	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	export let passedOutputToken: CategorizedToken | undefined;

	// State for market price and quantity
	let marketPrice: bigint = 0n;
	let selectedAmount: bigint = 0n;
	let isLoadingPrice = true;
	let priceError = false;
	let orderData: OrderV3 | undefined = undefined;
	let orderbook: string | undefined = undefined;
	let ratioOrder: bigint = 0n;

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

	// Calculate total cost
	$: totalCost =
		selectedAmount && marketPrice
			? (
					parseFloat(formatUnits(selectedAmount, passedOutputToken?.decimals || 18)) *
					Number(marketPrice) / 1e18
				).toFixed(2)
			: '0.00';

	// Wallet connect modal state
	let showConnectModal = false;

	async function fetchMarketPrice() {
		if (!passedOutputToken || !passedOutputToken.limitOrders || !orderSide) {
			isLoadingPrice = false;
			return;
		}

		try {
			isLoadingPrice = true;
			priceError = false;

			const limitOrders = passedOutputToken.limitOrders.filter((order: LimitOrder) => order.type !== orderSide);
			if (limitOrders.length === 0) {
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			const ordersResult = await getOrders(
				[
					{
						url: $currentNetwork.orderbook_subgraph_url,
						name: $currentNetwork.raindexNetworkSlug
					}
				],
				{
					active: true,
					owners: [],
					orderHash: limitOrders[0].orderHash
				},
				{
					page: 1,
					pageSize: 100
				}
			);

			if (ordersResult.value && ordersResult.value.length > 0) {
				const order = ordersResult.value[0];

				const decodedOrder = AbiCoder.defaultAbiCoder().decode([OrderV3_ABI], order.order.orderBytes);
				orderData = decodedOrder[0] as OrderV3;
				orderbook = order.order.orderbook.id;
				const quoteSpecs: QuoteSpec[] = [];
				quoteSpecs.push({
					orderHash: order.order.orderHash,
					inputIOIndex: 0,
					outputIOIndex: 0,
					signedContext: [],
					orderbook: orderbook
				});

				const quoteResult = await doQuoteSpecs(quoteSpecs, $currentNetwork.orderbook_subgraph_url, $currentNetwork.fallbackRpcUrls);

				if (quoteResult.error || !quoteResult.value) {
					priceError = true;
					return;
				}

				const result = quoteResult.value[0];
				if (result.error || !result.value) {
					priceError = true;
					return;
				}

				const { maxOutput, ratio } = result.value;
				
				// Convert hex to BigInt
				const maxOutputBigInt = hexToBigInt(maxOutput);
				const ratioBigInt = hexToBigInt(ratio);
				
				
				// Convert ratio to price based on order type using BigInt with 18 decimal precision
				const PRECISION = BigInt(1e18);
				ratioOrder = ratioBigInt;
				
				if (limitOrders[0].type === 'Buy') {
					console.log("buy order");
					// For buy orders, price is PRECISION/ratioBigInt
					marketPrice = (PRECISION * PRECISION) / ratioBigInt;
					console.log("marketPrice : ", marketPrice);//79530539460539465818n
				} else {
					// For sell orders, ratio is the price directly
					marketPrice = ratioBigInt;
					console.log('marketPrice : ', marketPrice);
				}
				
				// console.log('maxOutputBigInt', maxOutputBigInt);
				// console.log('ratioBigInt', ratioBigInt); //10000000000000000n
				// console.log('marketPrice', marketPrice);
			} else {
				priceError = true;
			}
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

	const handleMarketOrder = async () => {
		if (!$connected) {
			showConnectModal = true;
			return;
		}

		if (!orderData || !orderbook) {
			return;
		}

		const takeOrdersArg: TakeOrderConfigV3 = {
			order: {
				owner: orderData?.owner,
				evaluable: orderData?.evaluable,
				validInputs: [{
					token: orderData?.validInputs[0].token,
					decimals: Number(orderData?.validInputs[0].decimals),
					vaultId: orderData?.validInputs[0].vaultId.toString()
				}],
				validOutputs: [{
					token: orderData?.validOutputs[0].token,
					decimals: Number(orderData?.validOutputs[0].decimals),
					vaultId: orderData?.validOutputs[0].vaultId.toString()
				}],
				nonce: orderData?.nonce
			},
			inputIOIndex: '0',
			outputIOIndex: '0',
			signedContext: []
		};

		// console.log('marketPrice : ', marketPrice);


		if(orderSide === 'Buy') {

			// console.log('orderData xx : ', orderData?.validOutputs);
			console.log('selectedAmount : ', selectedAmount);
			console.log('marketPrice : ', marketPrice);



			// console.log('selectedAmount : ', selectedAmount);
			const takeOrdersArgs: TakeOrdersConfigV3 = {
				minimumInput: '0',
				maximumInput: selectedAmount.toString(),
				maximumIORatio: ethers.MaxUint256.toString(10),
				orders: [takeOrdersArg],
				data: '0x'
			};

			await transactionStore.handleTakeOrders(takeOrdersArgs, orderbook as `0x${string}`, marketPrice);

			
		}else if(orderSide === 'Sell') {

			console.log("marketPrice : ", marketPrice);
			console.log("selectedAmount : ", selectedAmount);
			const selectedAmountInDecimal = formatUnits(selectedAmount, passedOutputToken?.decimals || 18);
			console.log('selectedAmountInDecimal : ', selectedAmountInDecimal);

			const expectedInputAmount = (selectedAmount * marketPrice) / 1000000000000000000n;
			console.log("expectedInputAmount : ", expectedInputAmount.toString()); //7953053946053946581n

			const expectedInputInTokenTerms = expectedInputAmount / BigInt(10 ** (18 - Number(orderData?.validOutputs[0].decimals)));
			console.log("expectedInputInTokenTerms : ", expectedInputInTokenTerms.toString()); //7953053946053946581n //7953053


			const takeOrdersArgs: TakeOrdersConfigV3 = {
				minimumInput: '0',
				maximumInput: expectedInputInTokenTerms.toString(),
				maximumIORatio: ethers.MaxUint256.toString(10),
				orders: [takeOrdersArg],
				data: '0x'
			};

			await transactionStore.handleTakeOrders(takeOrdersArgs, orderbook as `0x${string}`, ratioOrder || 0n);

		}
	};
</script>

{#if $currentNetwork && passedOutputToken}
	<div class="space-y-4">
		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">Quantity</div>
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
					<span class="ml-1 text-xs text-gray-500">(USDC per {passedOutputToken.symbol})</span>
				</div>
				<div class="relative">
					<input
						type="text"
						value={isLoadingPrice ? 'Loading...' : priceError ? 'Price unavailable' : (Number(marketPrice) / 1e18).toFixed(6)}
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
						{isLoadingPrice ? 'Loading...' : priceError ? 'N/A' : (Number(marketPrice) / 1e18).toFixed(6)} USDC
					</span>
				</div>
				<div class="mt-2 border-t border-white/10 pt-2">
					<div class="flex justify-between">
						<span class="text-gray-400">Total</span>
						<span class={`text-lg font-semibold ${summaryAccentClass}`}>
							{isLoadingPrice || priceError ? 'N/A' : totalCost} USDC
						</span>
					</div>
				</div>
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