/**
 * Orders API
 *
 * Fetches orders from the Raindex API and processes them with quotes
 */

import type {
	RaindexOrder,
	RaindexOrderQuote,
	GetOrdersFilters,
	OrderV4
} from '@rainlanguage/orderbook';
import {
	networks,
	TOKENS,
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork
} from '$lib/config/network';
import { AbiCoder } from 'ethers';
import { describeQuote, normalizeAddress } from '$lib/utils/tokenMath';
import type { PythToken } from '$lib/types';
import { createRaindexClient, getLoadBalancedClient } from '$lib/clients/raindex';
import { Float } from '@rainlanguage/float';
import {
	type ProcessedQuote,
	OrderV4_ABI,
	normalizeOrderData,
	buildTokenPriceMap as buildTokenPriceMapBase,
	type TokenPriceSummary,
	scaleAmount,
	classifyOrderType,
	walkOrderbook,
	hexToBigInt
} from '$lib/utils/orderbook';
import { fetchQuotesWithBatching } from '$lib/utils/quoteBatcher';

// Re-export types and utilities
export type { ProcessedQuote, TokenPriceSummary };
export { OrderV4_ABI, normalizeOrderData, scaleAmount, walkOrderbook, hexToBigInt };

// Re-export buildTokenPriceMap with describeQuote injected
export const buildTokenPriceMap = (quotes: ProcessedQuote[], quoteAddressRaw: string) =>
	buildTokenPriceMapBase(quotes, quoteAddressRaw, describeQuote);

// Helper function to get token metadata by address
function getTokenMetadata(address: string, tokens: PythToken[]) {
	const token = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
	return {
		symbol: token?.symbol ?? 'UNKNOWN',
		decimals: token?.decimals
	};
}

// Process orders with their quotes
function processOrdersWithQuotes(
	orders: RaindexOrder[],
	quotesMap: Map<RaindexOrder, RaindexOrderQuote[]>,
	quoteToken: PythToken,
	stockTokens: PythToken[]
): ProcessedQuote[] {
	const processedQuotes: ProcessedQuote[] = [];

	// Process each order with its quotes
	orders.forEach((order) => {
		const quotes = quotesMap.get(order);
		if (!quotes || quotes.length === 0) {
			return;
		}

		try {
			// Convert RaindexOrder to SgOrder to get orderBytes
			const sgOrderResult = order.convertToSgOrder();
			if (sgOrderResult.error || !sgOrderResult.value) {
				return;
			}
			const sgOrder = sgOrderResult.value;

			// Decode order to get token addresses
			const abiCoder = AbiCoder.defaultAbiCoder();
			const decodedOrder = abiCoder.decode([OrderV4_ABI], sgOrder.orderBytes);
			const orderData = normalizeOrderData(decodedOrder[0] as OrderV4);

			// Process each quote for this order
			quotes.forEach((quote) => {
				try {
					// Skip if the quote failed
					if (!quote.success || !quote.data) {
						return;
					}

					const { maxOutput, ratio } = quote.data;

					// Validate that we have valid hex-encoded Float values (0x + 64 hex chars = 66 chars total)
					if (
						typeof ratio !== 'string' ||
						!ratio.startsWith('0x') ||
						ratio.length !== 66 ||
						typeof maxOutput !== 'string' ||
						!maxOutput.startsWith('0x') ||
						maxOutput.length !== 66
					) {
						console.warn('Invalid Float hex format for ratio or maxOutput:', { ratio, maxOutput });
						return;
					}

					// Verify maxOutput is not zero by converting to Float and checking
					const maxOutputFloat = Float.fromHex(maxOutput as `0x${string}`);
					if (maxOutputFloat.error || !maxOutputFloat.value) {
						console.warn('Failed to parse maxOutput Float:', maxOutputFloat.error);
						return;
					}

					// Check if maxOutput is zero
					const zeroFloat = Float.fromHex(
						'0x0000000000000000000000000000000000000000000000000000000000000000'
					);
					if (!zeroFloat.error && zeroFloat.value) {
						const isZero = maxOutputFloat.value.eq(zeroFloat.value);
						if (!isZero.error && isZero.value) {
							return;
						}
					}

					const inputDefinition = orderData.validInputs[quote.pair.inputIndex];
					const outputDefinition = orderData.validOutputs[quote.pair.outputIndex];
					if (!inputDefinition || !outputDefinition) {
						return;
					}

					// Use the input/output indexes from the quote pair
					const inputTokenAddress = inputDefinition.token;
					const outputTokenAddress = outputDefinition.token;

					// Filter out quotes where neither input nor output is the quote token
					const normalizedInput = normalizeAddress(inputTokenAddress);
					const normalizedOutput = normalizeAddress(outputTokenAddress);
					const normalizedQuote = normalizeAddress(quoteToken.address);

					if (normalizedInput !== normalizedQuote && normalizedOutput !== normalizedQuote) {
						return;
					}

					const allTokens = [quoteToken, ...stockTokens];
					const inputTokenMeta = getTokenMetadata(inputTokenAddress, allTokens);
					const outputTokenMeta = getTokenMetadata(outputTokenAddress, allTokens);

					const inputDecimals = Number.isFinite(inputTokenMeta.decimals)
						? Number(inputTokenMeta.decimals)
						: undefined;
					const outputDecimals = Number.isFinite(outputTokenMeta.decimals)
						? Number(outputTokenMeta.decimals)
						: undefined;

					// Get rainlang source from the RaindexOrder and classify order type
					const rainlang = order.rainlang;
					const orderType = classifyOrderType(rainlang);

					// Skip dynamic spread orders (return null from classifyOrderType)
					if (orderType === null) {
						return;
					}

					const processedQuote: ProcessedQuote = {
						orderHash: sgOrder.orderHash,
						maxOutput,
						ratio,
						inputTokenSymbol: inputTokenMeta.symbol,
						outputTokenSymbol: outputTokenMeta.symbol,
						inputTokenAddress,
						outputTokenAddress,
						inputIOIndex: quote.pair.inputIndex ?? 0,
						outputIOIndex: quote.pair.outputIndex ?? 0,
						inputVaultId: inputDefinition.vaultId?.toString?.() ?? inputDefinition.vaultId,
						outputVaultId: outputDefinition.vaultId?.toString?.() ?? outputDefinition.vaultId,
						orderData,
						sgOrder,
						orderbookId: sgOrder.orderbook.id,
						inputTokenDecimals:
							inputDecimals ??
							(normalizeAddress(inputTokenAddress) === normalizeAddress(quoteToken.address)
								? quoteToken.decimals ?? 18
								: 18),
						outputTokenDecimals:
							outputDecimals ??
							(normalizeAddress(outputTokenAddress) === normalizeAddress(quoteToken.address)
								? quoteToken.decimals ?? 18
								: 18),
						rainlang,
						orderType
					};

					const metrics = describeQuote(processedQuote, quoteToken.address);

					if (metrics) {
						processedQuote.side = metrics.side;
						const normalizedAsset = normalizeAddress(metrics.assetAddress);
						processedQuote.assetAddress = normalizedAsset ?? metrics.assetAddress;
						processedQuote.quotePerAsset = metrics.quotePerAsset;
					}

					processedQuotes.push(processedQuote);
				} catch (error) {
					// Skip quotes that fail to process (malformed data, decoding errors)
					console.error('Error processing quote:', error);
				}
			});
		} catch (error) {
			// Skip orders that fail to process
			console.error('Error processing order:', error);
		}
	});

	return processedQuotes;
}

/**
 * Fetches all orders from subgraph, filters orders that involve the configured payment token and stock tokens,
 * and quotes all filtered orders using the RaindexClient API.
 */
export async function fetchAndQuotePaymentTokenOrders(
	networkId: number = 8453,
	options: { maxPages?: number; pageSize?: number } = {},
	overridePaymentToken?: PythToken
) {
	const { maxPages = 100, pageSize = 1000 } = options;

	// Get network configuration
	const network = networks.find((n) => n.id === networkId);
	if (!network) {
		throw new Error(`Network with id ${networkId} not found`);
	}

	// Determine the payment token for the network
	const defaultPaymentToken =
		overridePaymentToken ??
		getDefaultPaymentTokenForNetwork(networkId) ??
		DEFAULT_PAYMENT_TOKENS[networkId];
	if (!defaultPaymentToken) {
		throw new Error(`Payment token not found for network ${networkId}`);
	}

	// Get stock tokens for the network
	const stockTokens = TOKENS.filter(
		(token) => token.chainId === networkId && token.category === 'ST0x'
	);

	// Create RaindexClient using standard configuration
	const client = await createRaindexClient();

	// Fetch all orders with pagination
	const allOrders: RaindexOrder[] = [];
	let page = 1;
	let hasMore = true;

	while (hasMore) {
		try {
			// Use GetOrdersFilters to specify what orders to fetch
			const filters: GetOrdersFilters = {
				active: true,
				owners: []
			};

			// Filter only by stock tokens - payment token filtering is too restrictive
			// Orders should be visible regardless of which payment token is configured
			const tokenAddresses: string[] = stockTokens.map((t) => t.address) as `0x${string}`[];

			filters.tokens = tokenAddresses as `0x${string}`[];

			const ordersResult = await client.getOrders([networkId], filters, page);

			if (ordersResult.error) {
				throw new Error(ordersResult.error.readableMsg);
			}

			const pageOrders = ordersResult.value;
			allOrders.push(...pageOrders);

			// If we got fewer orders than the page size, we've reached the end
			hasMore = pageOrders.length === pageSize;
			page++;

			// Check if we've reached the maximum number of pages
			if (page > maxPages) {
				hasMore = false;
			}

			// Add a small delay to avoid overwhelming the API
			if (hasMore) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		} catch (error) {
			// If it's a network error, we might want to retry
			if (page > 1) {
				break;
			} else {
				throw error;
			}
		}
	}

	// Get quotes using batching with jitter and retries (same as fetchAndQuoteTokenOrders)
	let quotesMap: Map<RaindexOrder, RaindexOrderQuote[]>;
	try {
		quotesMap = await fetchQuotesWithBatching(allOrders);
	} catch (error) {
		console.error('[fetchAndQuotePaymentTokenOrders] Failed to fetch quotes:', error);
		// Return empty array on complete failure to avoid showing stale/partial data
		return [];
	}

	// Process and filter the quotes
	const processedQuotes = processOrdersWithQuotes(
		allOrders,
		quotesMap,
		defaultPaymentToken,
		stockTokens
	);

	return processedQuotes;
}

/**
 * Fetches orders for a specific token only.
 * Much more efficient than fetching all orders.
 *
 * @param networkId - The network ID
 * @param tokenAddress - The specific token address to fetch orders for
 * @param overridePaymentToken - Optional override for payment token
 */
export async function fetchAndQuoteTokenOrders(
	networkId: number,
	tokenAddress: string,
	overridePaymentToken?: PythToken
) {
	// Get network configuration
	const network = networks.find((n) => n.id === networkId);
	if (!network) {
		throw new Error(`Network with id ${networkId} not found`);
	}

	// Determine the payment token for the network
	const defaultPaymentToken =
		overridePaymentToken ??
		getDefaultPaymentTokenForNetwork(networkId) ??
		DEFAULT_PAYMENT_TOKENS[networkId];
	if (!defaultPaymentToken) {
		throw new Error(`Payment token not found for network ${networkId}`);
	}

	// Get stock tokens for the network (for metadata)
	const stockTokens = TOKENS.filter(
		(token) => token.chainId === networkId && token.category === 'ST0x'
	);

	// Get load-balanced client (round-robin between 2 clients, SDK handles RPC failover)
	const client = await getLoadBalancedClient(network);

	// Fetch orders for this specific token only
	const filters: GetOrdersFilters = {
		active: true,
		owners: [],
		tokens: [tokenAddress as `0x${string}`]
	};

	const ordersResult = await client.getOrders([networkId], filters, 1);

	if (ordersResult.error) {
		throw new Error(ordersResult.error.readableMsg);
	}

	const allOrders = ordersResult.value;

	// Get quotes using batching with jitter and retries
	let quotesMap: Map<RaindexOrder, RaindexOrderQuote[]>;
	try {
		quotesMap = await fetchQuotesWithBatching(allOrders);
	} catch (error) {
		console.error('[fetchAndQuoteTokenOrders] Failed to fetch quotes:', error);
		// Return empty array on complete failure to avoid showing stale/partial data
		return [];
	}

	// Process and filter the quotes
	const processedQuotes = processOrdersWithQuotes(
		allOrders,
		quotesMap,
		defaultPaymentToken,
		stockTokens
	);

	return processedQuotes;
}
