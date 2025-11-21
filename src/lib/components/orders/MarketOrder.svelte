<script lang="ts">
	import type { CategorizedToken } from '$lib/config/network';
	import { currentNetwork } from '$lib/stores';
	import {
		OrderV4_ABI,
		normalizeOrderData,
		type ProcessedQuote,
		scaleAmount,
		walkOrderbook
	} from '$lib/api/orders';
	import { createRaindexClient } from '$lib/api/raindex';
	import { normalizeAddress } from '$lib/utils/tokenMath';
	import { getUserTakerInfo } from '$lib/types/orderPerspective';
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
	import { containerStyles } from '$lib/styles/utils';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { connected } from 'svelte-wagmi';
	import Modal from '$lib/components/ui/Modal.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import { validateSelectedAmount } from '$lib/utils/validation';
	import transactionStore from '$lib/stores/transaction';
	import { Float } from '@rainlanguage/float';
	import { createOrderbookQuotesQuery } from '$lib/queries/orderbook';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';

	export let orderSide: 'Buy' | 'Sell' = 'Buy';
	/**
	 * assetToken: The non-settlement token being traded (tSTOX, tNVDA, etc.)
	 *
	 * From taker perspective:
	 * - Buy action: takerWants=assetToken, takerPays=paymentToken
	 * - Sell action: takerWants=paymentToken, takerPays=assetToken
	 */
	export let assetToken: CategorizedToken | undefined;

	const ORDERBOOK_MAX_STALENESS_MS = 20_000; // 20 seconds

	let orderbookQuotesQuery = createOrderbookQuotesQuery($currentNetwork);
	let oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	$: orderbookQuotesQuery = createOrderbookQuotesQuery($currentNetwork);
	$: oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);

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
		inputIOIndex: number;
		outputIOIndex: number;
	}> = [];
	let orderbook: string | undefined = undefined;

	$: paymentToken = $currentNetwork?.defaultPaymentToken || $currentNetwork?.paymentTokens?.[0];
	$: paymentTokenSymbol = paymentToken?.symbol ?? 'Quote';

	// Taker perspective: What the user wants to receive and what they'll pay
	$: takerInfo =
		assetToken && paymentToken ? getUserTakerInfo(orderSide, assetToken, paymentToken) : null;

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
		!assetToken ||
		selectedAmountError ||
		isLoadingPrice ||
		priceError ||
		isSubmittingMarketOrder;

	// Calculate required input based on desired output
	$: requiredInputAmount = (() => {
		if (!selectedAmount || !marketPrice) return '0.00';
		// Output amount * market price = input amount
		const outputInTokens = parseFloat(formatUnits(selectedAmount, assetToken?.decimals || 18));
		const total = outputInTokens * marketPrice;
		return `~${total.toFixed(2)} ${paymentTokenSymbol}`;
	})();

	// Wallet connect modal state
	let showConnectModal = false;
	let isSubmittingMarketOrder = false;

	async function fetchMarketPrice() {
		if (!assetToken || !orderSide) {
			isLoadingPrice = false;
			return;
		}

		try {
			isLoadingPrice = true;
			priceError = false;

			// If no selected amount, don't calculate a price estimate
			if (!selectedAmount || selectedAmount === 0n) {
				marketPrice = 0;
				availableOrders = [];
				orderbook = undefined;
				return;
			}

			const walkResult = calculateOrderbookWalk();

			if (!walkResult) {
				console.warn('No relevant quotes found');
				priceError = true;
				isLoadingPrice = false;
				return;
			}

			const { inputAmountFilled, outputAmountGiven, ioRatio, fills } = walkResult;

			// Check if anything was filled (asset amount)
			const assetFilled = orderSide === 'Buy' ? inputAmountFilled : outputAmountGiven;
			if (assetFilled > 0n) {
				// Calculate price (quote per asset)
				marketPrice = orderSide === 'Buy' ? (ioRatio > 0 ? 1 / ioRatio : 0) : ioRatio;

				availableOrders = fills.map((fill) => ({
					order:
						(fill.quote.sgOrder as SgOrder) ??
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
				console.warn('No quantity filled from orderbook', {
					selectedAmount: selectedAmount.toString(),
					ordersWalked: fills.length
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
	$: if (assetToken && orderSide && selectedAmount > 0n && $orderbookQuotesQuery?.data?.quotes) {
		fetchMarketPrice();
	} else if (!selectedAmount || selectedAmount === 0n) {
		// Clear price when quantity is cleared
		marketPrice = 0;
		availableOrders = [];
		orderbook = undefined;
	}

	// Walk the orderbook with current quotes and selected amount
	function calculateOrderbookWalk() {
		if (!assetToken || !orderSide || !selectedAmount || selectedAmount === 0n) {
			return null;
		}

		const allQuotes = $orderbookQuotesQuery?.data?.quotes ?? [];
		const assetAddressNormalized = normalizeAddress(assetToken.address);
		const paymentTokenAddressNormalized = normalizeAddress(
			paymentToken?.address?.toLowerCase() || ''
		);

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
			return null;
		}

		// Validate token decimals are defined
		if (typeof assetToken.decimals !== 'number') {
			console.error('Asset token decimals are not defined');
			return null;
		}
		if (!paymentToken || typeof paymentToken.decimals !== 'number') {
			console.error('Payment token or its decimals are not defined');
			return null;
		}

		const sortedQuotes = [...relevantQuotes].sort((a, b) => {
			if (orderSide === 'Buy') {
				return (a.quotePerAsset ?? 0) - (b.quotePerAsset ?? 0);
			} else {
				return (b.quotePerAsset ?? 0) - (a.quotePerAsset ?? 0);
			}
		});

		return walkOrderbook({
			quotes: sortedQuotes,
			orderSide,
			selectedAmount,
			assetDecimals: assetToken.decimals,
			paymentDecimals: paymentToken.decimals
		});
	}

	// Filter orders to remove those >5% from oracle price, return filtered array
	function getFilteredOrders(): Array<{
		order: SgOrder;
		orderData: OrderV4;
		quotes: RaindexOrderQuote[];
		price: number;
		inputIOIndex: number;
		outputIOIndex: number;
	}> {
		if (availableOrders.length === 0) return [];

		const slippageMultiplier = 1.05; // 1.05 = 105% (5% tolerance)

		// Try to get oracle price as reference
		const oracleAddress = assetToken?.address?.toLowerCase();
		const oracleEntry = oracleAddress ? $oracleQuotesQuery?.data?.[oracleAddress] : null;
		const oraclePrice = oracleEntry?.price;

		let referencePrice = availableOrders[0].price; // Fallback to best BBO price

		if (oraclePrice && Number.isFinite(oraclePrice) && oraclePrice > 0) {
			referencePrice = oraclePrice;
		}

		// Filter to only orders within 5% of reference price
		// For BUY: want prices up to 5% worse (higher) - price <= maxAcceptablePrice
		// For SELL: want prices down to 5% worse (lower) - price >= minAcceptablePrice
		const maxAcceptablePrice = referencePrice * slippageMultiplier; // For BUY
		const minAcceptablePrice = referencePrice / slippageMultiplier; // For SELL

		const filtered = availableOrders.filter((order) => {
			const passes =
				orderSide === 'Buy' ? order.price <= maxAcceptablePrice : order.price >= minAcceptablePrice;
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
			// Refresh orderbook quotes if stale
			const lastUpdated = $orderbookQuotesQuery?.dataUpdatedAt ?? 0;
			const isStaleQuotes = !lastUpdated || Date.now() - lastUpdated > ORDERBOOK_MAX_STALENESS_MS;
			if (isStaleQuotes) {
				await $orderbookQuotesQuery?.refetch?.();
				await fetchMarketPrice();
				if (priceError) {
					console.error('Price unavailable after refresh');
					return;
				}
			}

			// Get filtered orders
			const filteredOrders = getFilteredOrders();
			if (filteredOrders.length === 0) {
				console.error('No orders within slippage tolerance');
				return;
			}

			// Hydrate order details from Raindex
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

						if (ordersResult.error || !ordersResult.value?.length) {
							console.error('Failed to fetch order:', orderInfo.order.orderHash);
							return;
						}

						const raindexOrderObj = ordersResult.value[0];
						const quotesResult = await raindexOrderObj.getQuotes();
						if (quotesResult.error || !quotesResult.value?.length) return;

						const validQuotes = quotesResult.value.filter(
							(q: RaindexOrderQuote) => q.success && q.data
						);
						if (validQuotes.length === 0) return;

						const sgOrderResult = raindexOrderObj.convertToSgOrder();
						if (sgOrderResult.error || !sgOrderResult.value) return;

						const sgOrder = sgOrderResult.value;
						const decodedOrder = AbiCoder.defaultAbiCoder().decode(
							[OrderV4_ABI],
							sgOrder.orderBytes
						);
						const orderData = normalizeOrderData(decodedOrder[0] as OrderV4);

						orderInfo.order = sgOrder;
						orderInfo.orderData = orderData;
						orderInfo.quotes = validQuotes;
					} catch (orderError) {
						console.error('Error hydrating order', orderInfo.order.orderHash, orderError);
					}
				})
			);

			const executableOrders = filteredOrders.filter((info) => info.orderData?.owner);
			if (!executableOrders.length) {
				console.error('No executable orders available after hydration');
				return;
			}

			// Build TakeOrderConfigs from executable orders
			const takeOrderConfigs: TakeOrderConfigV4[] = [];
			for (const orderInfo of executableOrders) {
				if (
					!orderInfo.orderData?.validInputs?.length ||
					!orderInfo.orderData?.validOutputs?.length
				) {
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

				takeOrderConfigs.push({
					order: orderInfo.orderData,
					inputIOIndex: inputIndex.toString(),
					outputIOIndex: outputIndex.toString(),
					signedContext: []
				});
			}

			if (takeOrderConfigs.length === 0) {
				console.error('Unable to build take order configs');
				return;
			}

			// Build TakeOrdersConfigV4 with worst price as maximum IO ratio
			const worstPrice = executableOrders[executableOrders.length - 1].price;
			const floatWorstPriceResult = Float.parse(worstPrice.toString());
			if (floatWorstPriceResult.error || !floatWorstPriceResult.value) {
				console.error('Failed to encode worst price as Float:', floatWorstPriceResult.error);
				return;
			}

			const primaryInputIndex = executableOrders[0].inputIOIndex ?? 0;
			const primaryOutputIndex = executableOrders[0].outputIOIndex ?? 0;
			const primaryOrder = executableOrders[0].order;
			const primaryOrderData = executableOrders[0].orderData;

			// Calculate required approval amount for the output token (what we're spending)
			const walkResult = calculateOrderbookWalk();
			if (!walkResult) {
				console.error('Unable to calculate walk result for order execution');
				return;
			}
			const { inputAmountFilled, ioRatio, inputDecimals } = walkResult;

			// Validate that we have all required token data before proceeding
			if (!paymentToken || typeof paymentToken.decimals !== 'number') {
				console.error('Payment token or its decimals are not defined');
				return;
			}
			if (!assetToken || typeof assetToken.decimals !== 'number') {
				console.error('Asset token or its decimals are not defined');
				return;
			}

			// We approve what we're giving away (what flows out from us)
			// For BUY: we give USDC (payment token)
			// For SELL: we give tSTOX (asset token)
			let requiredApprovalBigInt: bigint;
			if (orderSide === 'Buy') {
				// BUY: Approve payment token (what we give away)
				const paymentTokenDecimals = paymentToken.decimals;
				const assetTokenDecimals = assetToken.decimals;

				// Calculate price from ioRatio (for BUY: ioRatio = asset/payment, so price = 1/ioRatio)
				const price = ioRatio > 0 ? 1 / ioRatio : 0;

				// PRECISION REQUIREMENT: Use BigInt arithmetic to avoid precision loss
				// JavaScript Numbers are 64-bit floats with ~15-17 digits precision.
				// Token amounts can be 1e18 or larger, causing precision loss if converted to Number.
				//
				// Pattern: Scale the small value (price) to an integer, keep large values as BigInt
				// This converts directly from asset decimals to payment decimals without intermediary
				//
				// Formula: cost = (amount_in_asset_decimals * price_scaled) / 10^asset_decimals
				// where price_scaled = price * 10^payment_decimals
				const priceScaled = BigInt(Math.round(price * 10 ** paymentTokenDecimals));
				requiredApprovalBigInt = (selectedAmount * priceScaled) / 10n ** BigInt(assetTokenDecimals);
			} else {
				// SELL: Approve asset token (what we give away)
				// selectedAmount is already in asset token decimals
				requiredApprovalBigInt = scaleAmount(
					selectedAmount,
					assetToken.decimals,
					assetToken.decimals
				);
			}
			// TODO: Remove this once we have a better way to handle precision loss
			// Round up scaled amount to avoid precision loss
			requiredApprovalBigInt += 1n;

			const assetTokenDecimals = assetToken.decimals;
			const approvalFloat = Float.fromFixedDecimalLossy(requiredApprovalBigInt, assetTokenDecimals);
			const requiredApprovalAmount = requiredApprovalBigInt + (approvalFloat.lossless ? 0n : 1n);

			// Calculate maximumInput based on walk result
			// inputAmountFilled is already in native decimals (specified by inputDecimals from walkResult)
			const maximumInputAmount = inputAmountFilled;
			const maximumInputDecimals = inputDecimals;
			const maximumInputFloat = Float.fromFixedDecimalLossy(
				maximumInputAmount,
				maximumInputDecimals
			);

			const takeOrdersConfig: TakeOrdersConfigV4 = {
				minimumInput: Float.fromBigint(0n).asHex(),
				maximumInput: maximumInputFloat.float.asHex(),
				maximumIORatio: floatWorstPriceResult.value.asHex(),
				orders: takeOrderConfigs,
				data: '0x'
			};

			// Taker perspective: What user wants to receive vs what they'll pay
			// takerWants = what user receives (INPUT from order perspective)
			// takerPays = what user gives away (OUTPUT from order perspective)
			const takerWantsInfo = takerInfo
				? {
						address: takerInfo.takerWants.address,
						decimals: takerInfo.takerWants.decimals,
						symbol: takerInfo.takerWants.symbol
					}
				: orderSide === 'Buy'
					? {
							address: assetToken?.address,
							decimals: assetToken?.decimals,
							symbol: assetToken?.symbol
						}
					: {
							address: paymentToken?.address,
							decimals: paymentToken?.decimals,
							symbol: paymentToken?.symbol
						};

			const takerPaysInfo = takerInfo
				? {
						address: takerInfo.takerPays.address,
						decimals: takerInfo.takerPays.decimals,
						symbol: takerInfo.takerPays.symbol
					}
				: orderSide === 'Buy'
					? {
							address: paymentToken?.address,
							decimals: paymentToken?.decimals,
							symbol: paymentToken?.symbol
						}
					: {
							address: assetToken?.address,
							decimals: assetToken?.decimals,
							symbol: assetToken?.symbol
						};

			// Requested amount: what user wants to receive
			// For BUY: user requests asset amount (selectedAmount)
			// For SELL: user requests payment amount (estimated from walkResult)
			const requestedTakerWantsAmount =
				orderSide === 'Buy' ? selectedAmount : walkResult.inputAmountFilled;

			// Execute transaction with walk result for accurate summary
			await transactionStore.handleTakeOrders(
				takeOrdersConfig,
				primaryOrder,
				requiredApprovalAmount,
				{
					orderData: primaryOrderData,
					ioIndexes: { input: primaryInputIndex, output: primaryOutputIndex },
					takerWantsToken: takerWantsInfo,
					takerPaysToken: takerPaysInfo,
					requestedTakerWantsAmount: requestedTakerWantsAmount,
					simulation: walkResult
				}
			);
		} catch (error) {
			console.error('Market order error:', error);
		} finally {
			isSubmittingMarketOrder = false;
		}
	};
</script>

{#if $currentNetwork && assetToken}
	<div class="space-y-4">
		<!-- Main inputs stacked -->
		<div class="space-y-4">
			<div>
				<div class="mb-2 block text-sm font-medium text-gray-300">
					Amount to {orderSide === 'Buy' ? 'Buy' : 'Sell'}
				</div>
				<TradeAmountInput
					aria-label="Quantity"
					amountToken={assetToken}
					balanceToken={orderSide === 'Buy' ? paymentToken : assetToken}
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
					<span class="ml-1 text-xs text-gray-500">(per {assetToken.symbol})</span>
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
						{selectedAmount ? formatUnits(selectedAmount, assetToken.decimals) : '0'}
						{assetToken.symbol}
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
