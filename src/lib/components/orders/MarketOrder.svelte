<script lang="ts">
	import type { CategorizedToken, LimitOrder } from '$lib/network';
	import { currentNetwork } from '$lib/stores';
	import { OrderV4_ABI } from '$lib/utils/quote';
	import { createRaindexClient } from '$lib/utils/raindexClient';
	import {
		type OrderV4,
		type SgOrder,
		type TakeOrderConfigV4,
		type TakeOrdersConfigV4
	} from '@rainlanguage/orderbook';
	import TradeAmountInput from '$lib/components/TradeAmountInput.svelte';
	import { AbiCoder, ethers } from 'ethers';
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
	let selectedAmount: bigint = 0n;
	let isLoadingPrice = true;
	let priceError = false;
	let raindexOrder: SgOrder | undefined = undefined;
	let orderData: OrderV4 | undefined = undefined;
	let orderbook: string | undefined = undefined;
	let ratioOrder: bigint = 0n;
	let quoteData: { maxOutput: string; ratio: string } | undefined = undefined;

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
					(parseFloat(formatUnits(selectedAmount, passedOutputToken?.decimals || 18)) *
						Number(marketPrice)) /
					1e18
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

			const limitOrders = passedOutputToken.limitOrders.filter(
				(order: LimitOrder) => order.type !== orderSide
			);
			if (limitOrders.length === 0) {
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			// Use the standard RaindexClient
			const client = await createRaindexClient();

			// Fetch the order by hash
			const ordersResult = await client.getOrders(
				[$currentNetwork.id],
				{
					active: true,
					owners: [],
					orderHash: limitOrders[0].orderHash as `0x${string}`
				},
				1
			);

			if (ordersResult.error || !ordersResult.value || ordersResult.value.length === 0) {
				priceError = true;
				return;
			}

			const raindexOrderObj = ordersResult.value[0];
			
			// Get quotes for this order
			const quotesResult = await raindexOrderObj.getQuotes();
			if (quotesResult.error || !quotesResult.value || quotesResult.value.length === 0) {
				priceError = true;
				return;
			}

			// Convert RaindexOrder to SgOrder to get orderBytes
			const sgOrderResult = raindexOrderObj.convertToSgOrder();
			if (sgOrderResult.error || !sgOrderResult.value) {
				priceError = true;
				return;
			}
			raindexOrder = sgOrderResult.value;

			if (!raindexOrder) {
				priceError = true;
				return;
			}

			const decodedOrder = AbiCoder.defaultAbiCoder().decode(
				[OrderV4_ABI],
				raindexOrder.orderBytes
			);
			orderData = decodedOrder[0] as OrderV4;
			orderbook = raindexOrder.orderbook.id;

			// Get the first valid quote
			const quote = quotesResult.value.find((q: any) => q.success && q.data);
			if (!quote || !quote.data) {
				priceError = true;
				return;
			}

			const { maxOutput, ratio } = quote.data;
			// Store quote data for use in handleMarketOrder
			quoteData = { maxOutput, ratio };

			const floatResult = Float.fromHex(ratio as `0x${string}`);
			if (floatResult.error) {
				console.error('Float.fromHex error:', floatResult.error);
				return ratio;
			}
			const fixedDecimalResult = floatResult.value!.abs().value!.toFixedDecimalLossy(18);
			if (fixedDecimalResult.error) {
				console.error('toFixedDecimal error:', fixedDecimalResult.error);
				return ratio;
			}
			// Convert bigint to string with decimal formatting
			const bigIntValue = fixedDecimalResult.value!;
		
			const ratioBigInt = BigInt(bigIntValue.value);

			// Convert ratio to price based on order type using BigInt with 18 decimal precision
			const PRECISION = BigInt(1e18);
			ratioOrder = ratioBigInt;

			if (limitOrders[0].type === 'Buy') {
				// For buy orders, price is PRECISION/ratioBigInt
				marketPrice = (PRECISION * PRECISION) / ratioBigInt;
			} else {
				// For sell orders, ratio is the price directly
				marketPrice = ratioBigInt;
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

		if (!orderData || !orderbook || !raindexOrder || !quoteData) {
			return;
		}

		// Get fresh quotes with the selected amount
		const client = await createRaindexClient();
		const ordersResult = await client.getOrders([$currentNetwork.id], {
			active: true,
			owners: [],
			orderHash: raindexOrder.orderHash as `0x${string}`
		}, 1);
		
		if (ordersResult.error || !ordersResult.value || ordersResult.value.length === 0) {
			console.error('Failed to fetch order for quotes');
			return;
		}

		const orderObj = ordersResult.value[0];
		
		// Get quotes with the desired input amount
		const quotesResult = await orderObj.getQuotes();
		if (quotesResult.error || !quotesResult.value || quotesResult.value.length === 0) {
			console.error('Failed to get quotes');
			return;
		}

		const quote = quotesResult.value.find((q: any) => q.success && q.data);
		if (!quote || !quote.data) {
			console.error('No valid quote found');
			return;
		}

		const { maxInput, ratio } = quote.data;
		const floatRatio = Float.fromHex(ratio as `0x${string}`).value!.asHex();
		// const floatMaxInput = Float.fromHex(maxInput as `0x${string}`).value!.toFixedDecimalLossy(
		// 	Number(raindexOrder.inputs[0]?.token?.decimals)
		// ).value!;

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

		if(orderSide === 'Buy') {
			
			const selectedFloatAmount = Float.fromFixedDecimalLossy(selectedAmount, Number(raindexOrder.outputs[0]?.token?.decimals));
			
			const takeOrdersConfig: TakeOrdersConfigV4 = {
				minimumInput: selectedFloatAmount.float.asHex(),
				maximumInput: selectedFloatAmount.float.asHex(),
				maximumIORatio: floatRatio,
				orders: [takeOrderConfig],
				data: '0x'
			};
			const maxInputFloat = BigInt(selectedFloatAmount.float.toFixedDecimalLossy(Number(raindexOrder.outputs[0]?.token?.decimals ?? 18)).value!.value);

			const requiredAmount = BigInt(
				BigInt(maxInputFloat) * BigInt(10 ** (18 - Number(raindexOrder.outputs[0]?.token?.decimals ?? 18)))
			);
			const requiredAmountFp18 = (requiredAmount * marketPrice) / 1000000000000000000n;

			// rounding up
			let requiredAmountFormattedDecimals =
				requiredAmountFp18 / BigInt(10 ** (18 - Number(raindexOrder.inputs[0]?.token?.decimals)));

			if (selectedFloatAmount.lossless) {
				
				requiredAmountFormattedDecimals = requiredAmountFormattedDecimals + 1n;
				
			}
			await transactionStore.handleTakeOrders(takeOrdersConfig, raindexOrder, requiredAmountFormattedDecimals);

		} else if(orderSide === 'Sell') {
			const expectedInputAmount = (selectedAmount * marketPrice) / 1000000000000000000n;
			const expectedInputInTokenTerms =
				expectedInputAmount / BigInt(10 ** (18 - Number(raindexOrder.outputs[0]?.token?.decimals ?? 18)));
			
			const selectedFloatAmount = Float.fromFixedDecimalLossy(expectedInputInTokenTerms, Number(raindexOrder.outputs[0]?.token?.decimals));
		

			const takeOrdersConfig: TakeOrdersConfigV4 = {
				minimumInput: selectedFloatAmount.float.asHex(),
				maximumInput: selectedFloatAmount.float.asHex(),
				maximumIORatio: floatRatio,
				orders: [takeOrderConfig],
				data: '0x'
			};

			await transactionStore.handleTakeOrders(takeOrdersConfig, raindexOrder, selectedFloatAmount.lossless ? selectedAmount + 1n : selectedAmount);
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
								: (Number(marketPrice) / 1e18).toFixed(6)} USDC
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
