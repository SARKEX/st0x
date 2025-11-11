<script lang="ts">
	import type { CategorizedToken } from '$lib/network';
	import { currentNetwork, orderbookQuotesResource, oracleQuotesResource } from '$lib/stores';
	import { ensureResource } from '$lib/stores/network-data-cache';
	import { OrderV4_ABI, normalizeOrderData, type ProcessedQuote } from '$lib/utils/quote';
	import { FIXED_POINT_SCALE, scaleAmount, walkOrderbook } from '$lib/utils/marketPrice';
	import { createRaindexClient } from '$lib/utils/raindexClient';
	import { normalizeAddress } from '$lib/utils/tokenMath';
	import {
		type OrderV4,
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
import transactionStore, { type MarketOrderSummary } from '$lib/transactionStore';
	import { Float } from '@rainlanguage/float';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	// assetToken: The non-settlement token being traded (tSTOX, tNVDA, etc.)
	// Note: Naming clarification - this is the asset token, not output token in the traditional sense
	// Buy order: assetToken is INPUT (what we want), paymentToken is OUTPUT (what we give)
	// Sell order: assetToken is OUTPUT (what we give), paymentToken is INPUT (what we want)
	export let passedOutputToken: CategorizedToken | undefined;

	const ORDERBOOK_MAX_STALENESS_MS = 30_000; // 30 seconds

	// State for market price and quantity
	let marketPrice: number = 0; // Human-readable price (quote per asset)
	let estimatedQuoteCostScaled: bigint = 0n; // Quote token cost for selected amount (1e18 scale)
	let selectedAmount: bigint = 0n; // Quantity to acquire from order outputs (in output token decimals)
	let isLoadingPrice = true;
	let priceError = false;
	let availableOrders: Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number; // Human-readable price (quote per asset)
		inputIOIndex: number;
		outputIOIndex: number;
	}> = [];
	let orderbook: string | undefined = undefined;

	$: paymentToken = $currentNetwork?.defaultPaymentToken || $currentNetwork?.paymentTokens?.[0];
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
		priceError ||
		isSubmittingMarketOrder;

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
	let isSubmittingMarketOrder = false;

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
				const quoteInputAddressNormalized = normalizeAddress(quote.inputTokenAddress);
				const targetOutputAddress =
					orderSide === 'Buy' ? assetAddressNormalized : paymentTokenAddressNormalized;
				const targetInputAddress =
					orderSide === 'Buy' ? paymentTokenAddressNormalized : assetAddressNormalized;
				const targetSide = orderSide === 'Buy' ? 'ask' : 'bid';
				const quotePerAsset = quote.quotePerAsset;

				return (
					quoteOutputAddressNormalized === targetOutputAddress &&
					quoteInputAddressNormalized === targetInputAddress &&
					quote.side === targetSide &&
					quotePerAsset !== undefined &&
					Number.isFinite(quotePerAsset) &&
					quotePerAsset > 0
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
				estimatedQuoteCostScaled = 0n;
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

			const { quantityFilled, weightedAveragePrice, fills, totalCostScaled } = walkResult;

			if (quantityFilled > 0n) {
				marketPrice = weightedAveragePrice;
				estimatedQuoteCostScaled = totalCostScaled;

				availableOrders = fills.map((fill) => ({
					order: (fill.quote.sgOrder as SgOrder) ??
						({
							orderHash: fill.quote.orderHash,
							orderbook: { id: fill.quote.orderbookId ?? 'cached' }
						} as unknown as SgOrder),
					orderData: (fill.quote.orderData as OrderV4) ?? ({} as OrderV4),
					quotes: [] as RaindexOrderQuote[],
					price: fill.price,
					inputIOIndex: fill.quote.inputIOIndex ?? 0,
					outputIOIndex: fill.quote.outputIOIndex ?? 0
				}));
				orderbook = fills[0]?.quote.orderbookId ?? 'cached';

			} else {
				estimatedQuoteCostScaled = 0n;
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
			estimatedQuoteCostScaled = 0n;
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
		estimatedQuoteCostScaled = 0n;
		availableOrders = [];
		orderbook = undefined;
	}

	// Filter orders to remove those >5% from oracle price, return filtered array
	function getFilteredOrders(): Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number;
	}> {
		if (availableOrders.length === 0) return [];

		const slippageMultiplier = 1.05; // 1.05 = 105% (5% tolerance)

		// Try to get oracle price as reference
		const oracleAddress = passedOutputToken?.address?.toLowerCase();
		const oracleEntry = oracleAddress ? $oracleQuotesResource?.data?.[oracleAddress] : null;
		const oraclePrice = oracleEntry?.price;

		let referencePrice = availableOrders[0].price; // Fallback to best BBO price
		let priceSource = 'BBO';

		if (oraclePrice && Number.isFinite(oraclePrice) && oraclePrice > 0) {
			referencePrice = oraclePrice;
			priceSource = 'Oracle';
		}

		// Filter to only orders within 5% of reference price
		// For BUY: want prices up to 5% worse (higher) - price <= maxAcceptablePrice
		// For SELL: want prices down to 5% worse (lower) - price >= minAcceptablePrice
		const maxAcceptablePrice = referencePrice * slippageMultiplier; // For BUY
		const minAcceptablePrice = referencePrice / slippageMultiplier; // For SELL


		const filtered = availableOrders.filter((order) => {
			const passes = orderSide === 'Buy'
				? order.price <= maxAcceptablePrice
				: order.price >= minAcceptablePrice;
			return passes;
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

		if (isSubmittingMarketOrder) {
			return;
		}
		isSubmittingMarketOrder = true;

		try {
			try {
				// Refresh orderbook quotes only if data is stale (>20s) to avoid extra latency
				isLoadingPrice = true;
				priceError = false;
				const lastUpdated = $orderbookQuotesResource?.updatedAt ?? 0;
				const isStaleQuotes = !lastUpdated || Date.now() - lastUpdated > ORDERBOOK_MAX_STALENESS_MS;
				await ensureResource($currentNetwork.id, 'orderbookQuotes', {
					force: isStaleQuotes
				});

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

			let executableOrders = filteredOrders;

			// Fetch the actual order details needed for transaction execution
			// These weren't fetched during price estimation (which used cached data)
			try {
				const client = await createRaindexClient();

				await Promise.all(
					filteredOrders.map(async (orderInfo) => {
						if (orderInfo.orderData.owner) return;

						try {
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
								return;
							}

							const raindexOrderObj = ordersResult.value[0];
							const quotesResult = await raindexOrderObj.getQuotes();
							if (quotesResult.error || !quotesResult.value || quotesResult.value.length === 0) {
								return;
							}

							const validQuotes = quotesResult.value.filter(
								(q: RaindexOrderQuote) => q.success && q.data
							);
							if (validQuotes.length === 0) return;

							const sgOrderResult = raindexOrderObj.convertToSgOrder();
							if (sgOrderResult.error || !sgOrderResult.value) return;

							const sgOrder = sgOrderResult.value;
							const decodedOrder = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], sgOrder.orderBytes);
							const orderData = normalizeOrderData(decodedOrder[0] as OrderV4);

							orderInfo.order = sgOrder;
							orderInfo.orderData = orderData;
							orderInfo.quotes = validQuotes;
						} catch (orderError) {
							console.error('Error hydrating order', orderInfo.order.orderHash, orderError);
						}
					})
				);

				const hydrated = filteredOrders.filter((info) => info.orderData?.owner);
				if (!hydrated.length) {
					console.error('No executable orders available after hydration');
					priceError = true;
					isLoadingPrice = false;
					return;
				}

				orderbook = hydrated[0].order.orderbook.id;
				executableOrders = hydrated;
			} catch (error) {
				console.error('Error fetching order details:', error);
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			// Calculate required input for desired output using actual fills
			const bestPrice = executableOrders[0].price; // Human-readable price (quote per asset)
			const worstPrice = executableOrders[executableOrders.length - 1].price;
			const primaryInputIndex = executableOrders[0].inputIOIndex ?? 0;
			const primaryOutputIndex = executableOrders[0].outputIOIndex ?? 0;
		const priceBasis = marketPrice || bestPrice;
		const selectedAmountScaled = scaleAmount(selectedAmount, passedOutputToken?.decimals ?? 18, 18);
		const priceScaledSixDecimals = BigInt(Math.floor(priceBasis * 1_000_000));
		const fallbackCostScaled = (selectedAmountScaled * priceScaledSixDecimals) / 1_000_000n;
		const costFromWalk = orderSide === 'Sell' ? estimatedQuoteCostScaled : 0n;
		const effectiveCostScaled = costFromWalk > 0n ? costFromWalk : fallbackCostScaled;

			// Build TakeOrderConfigs for ALL filtered orders in price priority
			const takeOrderConfigs: TakeOrderConfigV4[] = [];

			for (const orderInfo of executableOrders) {
				if (!orderInfo.orderData?.validInputs?.length || !orderInfo.orderData?.validOutputs?.length) {
					console.warn('Skipping order without IO definitions', orderInfo.order.orderHash);
					continue;
				}

				const inputIndex = orderInfo.inputIOIndex ?? 0;
				const outputIndex = orderInfo.outputIOIndex ?? 0;
				const hasInput = orderInfo.orderData.validInputs[inputIndex];
				const hasOutput = orderInfo.orderData.validOutputs[outputIndex];
				if (!hasInput || !hasOutput) {
					console.warn('Skipping order with mismatched IO indexes', {
						orderHash: orderInfo.order.orderHash,
						inputIndex,
						outputIndex
					});
					continue;
				}

				const takeOrderConfig: TakeOrderConfigV4 = {
					order: orderInfo.orderData,
					inputIOIndex: inputIndex.toString(),
					outputIOIndex: outputIndex.toString(),
					signedContext: []
				};

				takeOrderConfigs.push(takeOrderConfig);
			}

			if (takeOrderConfigs.length === 0) {
				console.error('Unable to build take order configs for selected liquidity');
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			// Use worst price in filtered set for maximumIORatio (already within 10%)
			const floatWorstPriceResult = Float.parse(worstPrice.toString());
			if (floatWorstPriceResult.error || !floatWorstPriceResult.value) {
				console.error('Failed to encode worst price as Float:', floatWorstPriceResult.error);
				priceError = true;
				isLoadingPrice = false;
				return;
			}
			const maxIORatioHex = floatWorstPriceResult.value.asHex();

			// The takeOrders input token is what we spend (quote for buys, asset for sells)
		const derivedInputDecimals = executableOrders[0].order.inputs[primaryInputIndex]?.token?.decimals;
		const inputTokenDecimals = Number(
			Number.isFinite(derivedInputDecimals) && derivedInputDecimals !== undefined
				? derivedInputDecimals
				: paymentToken?.decimals ?? 18
		);
		const requiredInputBigInt =
			orderSide === 'Buy'
				? scaleAmount(effectiveCostScaled, 18, inputTokenDecimals)
				: scaleAmount(
					selectedAmount,
					passedOutputToken?.decimals ?? 18,
					inputTokenDecimals
				  );
			const inputFloat = Float.fromFixedDecimalLossy(requiredInputBigInt, inputTokenDecimals);


		// maximumInput is order-side dependent:
		// - For Buy: max quantity of asset tokens to acquire (in asset decimals)
		// - For Sell: max amount of USDC to receive (in payment token decimals), calculated conservatively
		const maximumInputAmount = orderSide === 'Sell'
			? scaleAmount(effectiveCostScaled, 18, paymentToken?.decimals ?? 6)
			: selectedAmount;

		const maximumInputDecimals = orderSide === 'Sell'
			? (paymentToken?.decimals ?? 6)
			: (passedOutputToken?.decimals ?? 18);

		const maximumInputFloat = Float.fromFixedDecimalLossy(maximumInputAmount, maximumInputDecimals);

			const zeroFloatHex = Float.fromBigint(0n).asHex();
			const takeOrdersConfig: TakeOrdersConfigV4 = {
				minimumInput: zeroFloatHex,
				maximumInput: maximumInputFloat.float.asHex(),
				maximumIORatio: maxIORatioHex,
				orders: takeOrderConfigs,
				data: '0x'
			};

			// Determine required approval amount
			let requiredApprovalAmount = requiredInputBigInt;
			if (inputFloat.lossless) {
				requiredApprovalAmount = requiredApprovalAmount + 1n;
			}

			// The actual quantity filled is based on the walk result after refresh and filtering
		// walkOrderbook returns quantityFilled which may be less than selectedAmount due to slippage filter
		// Use the cost divided by average price to get quantity (reverse calculation)
		const actualQuantityFilled = estimatedQuoteCostScaled > 0n && marketPrice > 0
			? scaleAmount(
					BigInt(Math.round(Number(estimatedQuoteCostScaled) / marketPrice)),
					18,
					passedOutputToken?.decimals ?? 18
				)
			: selectedAmount;
			const averagePrice = marketPrice || bestPrice;
			const slippagePercent = worstPrice > 0 ? ((worstPrice - bestPrice) / bestPrice) * 100 : 0;
			const slippage = BigInt(Math.round(slippagePercent));
			const summary: MarketOrderSummary = {
				orderSide,
				quantityFilled: actualQuantityFilled,
				quantityRequested: selectedAmount,
				outputTokenDecimals: passedOutputToken.decimals,
				outputTokenSymbol: passedOutputToken.symbol,
				averagePrice,
				paymentTokenSymbol,
				actualSlippage: slippage,
				isPartialFill: false
			};

			try {
				await transactionStore.handleTakeOrders(
					takeOrdersConfig,
					executableOrders[0].order,
					requiredApprovalAmount,
					{
						ioIndexes: { input: primaryInputIndex, output: primaryOutputIndex },
						summary
					}
				);
			} catch (error) {
				console.error('Transaction failed:', error);
			}
		} finally {
			isSubmittingMarketOrder = false;
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
					balanceToken={orderSide === 'Buy' ? paymentToken : passedOutputToken}
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
			{#if isSubmittingMarketOrder}
				<span class="flex items-center justify-center gap-2">
					<LoadingSpinner size="sm" />
					Preparing order...
				</span>
			{:else if disableDeploy}
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
			onConnect={() => (showConnectModal = false)}
		/>
	</div>
</Modal>
