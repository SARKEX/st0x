import type {
	SgOrderWithSubgraphName,
	RaindexOrder,
	RaindexOrderQuote,
	GetOrdersFilters,
	SgOrder
} from '@rainlanguage/orderbook';
import { networks, TOKENS, USDC_TOKENS } from '$lib/network';
import { AbiCoder } from 'ethers';
import { describeQuote, normalizeAddress, type MarketSide } from '$lib/utils/tokenMath';
import type { PythToken } from '$lib/types';
import { createRaindexClient } from '$lib/utils/raindexClient';

// ABI types for decoding order bytes
const IOV2 = '(address token, bytes32 vaultId)';
const EvaluableV4 = '(address interpreter, address store, bytes bytecode)';
const OrderV4_ABI = `(address owner, ${EvaluableV4} evaluable, ${IOV2}[] validInputs, ${IOV2}[] validOutputs, bytes32 nonce)`;
const OrderV3_ABI = OrderV4_ABI; // Alias for backward compatibility

// Types for processed quotes
export interface ProcessedQuote {
	orderHash: string;
	maxOutput: bigint;
	ratio: bigint;
	inputTokenSymbol: string;
	outputTokenSymbol: string;
	inputTokenAddress: string;
	outputTokenAddress: string;
	inputTokenDecimals?: number;
	outputTokenDecimals?: number;
	assetAddress?: string;
	side?: MarketSide;
	usdcPerToken?: number;
	tokensPerUsdc?: number;
}

// Helper function to convert hex string to BigInt
export function hexToBigInt(hex: string): bigint {
	if (hex.startsWith('0x')) {
		return BigInt(hex);
	}
	return BigInt(`0x${hex}`);
}

// Also export ABI constants for use in other files
export { OrderV4_ABI, OrderV3_ABI };

// Helper function to get token symbol by address
function getTokenSymbol(address: string, tokens: PythToken[]): string {
	const token = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
	return token?.symbol || 'UNKNOWN';
}

// Process orders with their quotes
function processOrdersWithQuotes(
	orders: RaindexOrder[],
	quotesMap: Map<RaindexOrder, RaindexOrderQuote[]>,
	usdcToken: PythToken,
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
			const orderData = decodedOrder[0];

			// Process each quote for this order
			quotes.forEach((quote) => {
				try {
					// Skip if the quote failed
					if (!quote.success || !quote.data) {
						return;
					}

					const { maxOutput, ratio } = quote.data;

					// Convert hex to BigInt
					const maxOutputBigInt = hexToBigInt(maxOutput);
					const ratioBigInt = hexToBigInt(ratio);

					// Skip if maxOutput is 0
					if (maxOutputBigInt === 0n) {
						return;
					}

					const inputDefinition = orderData.validInputs[quote.pair.inputIndex];
					const outputDefinition = orderData.validOutputs[quote.pair.outputIndex];
					if (!inputDefinition || !outputDefinition) {
						return;
					}

					// Use the input/output indexes from the quote pair
					const inputTokenAddress = inputDefinition.token;
					const outputTokenAddress = outputDefinition.token;

					// Get token symbols - need to check both USDC and stock tokens for both input and output
					const inputTokenSymbol = getTokenSymbol(inputTokenAddress, [usdcToken, ...stockTokens]);
					const outputTokenSymbol = getTokenSymbol(outputTokenAddress, [usdcToken, ...stockTokens]);

					const inputDecimals = Number(inputDefinition.decimals ?? 0);
					const outputDecimals = Number(outputDefinition.decimals ?? 0);

					const processedQuote: ProcessedQuote = {
						orderHash: sgOrder.orderHash,
						maxOutput: maxOutputBigInt,
						ratio: ratioBigInt,
						inputTokenSymbol,
						outputTokenSymbol,
						inputTokenAddress,
						outputTokenAddress,
						inputTokenDecimals: Number.isFinite(inputDecimals) ? inputDecimals : undefined,
						outputTokenDecimals: Number.isFinite(outputDecimals) ? outputDecimals : undefined
					};

					const metrics = describeQuote(processedQuote, usdcToken.address);
					if (metrics) {
						processedQuote.side = metrics.side;
						const normalizedAsset = normalizeAddress(metrics.assetAddress);
						processedQuote.assetAddress = normalizedAsset ?? metrics.assetAddress;
						processedQuote.usdcPerToken = metrics.usdcPerToken;
						processedQuote.tokensPerUsdc = metrics.tokensPerUsdc;
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
 * Fetches all orders from subgraph, filters orders with USDC as input and stock tokens as output,
 * and quotes all filtered orders using the new RaindexClient API
 */
export async function fetchAndQuoteUSDCOrders(
	networkId: number = 8453,
	options: { maxPages?: number; pageSize?: number } = {}
) {
	const { maxPages = 100, pageSize = 1000 } = options;

	// Get network configuration
	const network = networks.find((n) => n.id === networkId);
	if (!network) {
		throw new Error(`Network with id ${networkId} not found`);
	}

	// Get USDC token address for the network
	const usdcToken = USDC_TOKENS[networkId];
	if (!usdcToken) {
		throw new Error(`USDC token not found for network ${networkId}`);
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

			// Add token filters for USDC and stock tokens
			const tokenAddresses: string[] = [
				usdcToken.address,
				...stockTokens.map((t) => t.address)
			] as `0x${string}`[];

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

	// Get quotes for all orders and store them in a map
	const quotesMap = new Map<RaindexOrder, RaindexOrderQuote[]>();
	
	for (const order of allOrders) {
		try {
			const quotesResult = await order.getQuotes();
			if (quotesResult.error) {
				continue;
			}
			
			if (quotesResult.value && quotesResult.value.length > 0) {
				quotesMap.set(order, quotesResult.value);
			}
		} catch (error) {
			// Skip orders that fail to quote
			console.error('Error getting quotes for order:', error);
		}
	}

	// Process and filter the quotes
	const processedQuotes = processOrdersWithQuotes(allOrders, quotesMap, usdcToken, stockTokens);

	return processedQuotes;
}

export type TokenPriceSummary = {
	buy?: number;
	sell?: number;
	buyTokensPerUsdc?: number;
	sellTokensPerUsdc?: number;
};

const chooseBestPrice = (
	current: number | undefined,
	candidate: number,
	comparator: 'min' | 'max'
) => {
	if (!Number.isFinite(candidate) || candidate <= 0) {
		return current;
	}
	if (current === undefined) {
		return candidate;
	}
	return comparator === 'min' ? Math.min(current, candidate) : Math.max(current, candidate);
};

export const buildTokenPriceMap = (
	quotes: ProcessedQuote[],
	usdcAddressRaw: string
): Map<string, TokenPriceSummary> => {
	const priceMap = new Map<string, TokenPriceSummary>();
	const usdcAddress = normalizeAddress(usdcAddressRaw);

	quotes.forEach((quote) => {
		const metrics =
			quote.side && quote.assetAddress
				? {
						assetAddress: quote.assetAddress,
						side: quote.side,
						usdcPerToken: quote.usdcPerToken,
						tokensPerUsdc: quote.tokensPerUsdc
					}
				: describeQuote(quote, usdcAddressRaw);
		if (!metrics) return;

		const assetAddress = normalizeAddress(metrics.assetAddress);
		if (!assetAddress || assetAddress === usdcAddress) return;

		const existing = priceMap.get(assetAddress) ?? {};

		if (metrics.side === 'buy') {
			if (
				Number.isFinite(metrics.usdcPerToken) &&
				metrics.usdcPerToken &&
				metrics.usdcPerToken > 0
			) {
				existing.buy = chooseBestPrice(existing.buy, metrics.usdcPerToken, 'min');
			}
			if (
				Number.isFinite(metrics.tokensPerUsdc) &&
				metrics.tokensPerUsdc &&
				metrics.tokensPerUsdc > 0
			) {
				existing.buyTokensPerUsdc = chooseBestPrice(
					existing.buyTokensPerUsdc,
					metrics.tokensPerUsdc,
					'max'
				);
			}
		} else {
			if (
				Number.isFinite(metrics.usdcPerToken) &&
				metrics.usdcPerToken &&
				metrics.usdcPerToken > 0
			) {
				existing.sell = chooseBestPrice(existing.sell, metrics.usdcPerToken, 'max');
			}
			if (
				Number.isFinite(metrics.tokensPerUsdc) &&
				metrics.tokensPerUsdc &&
				metrics.tokensPerUsdc > 0
			) {
				existing.sellTokensPerUsdc = chooseBestPrice(
					existing.sellTokensPerUsdc,
					metrics.tokensPerUsdc,
					'min'
				);
			}
		}

		priceMap.set(assetAddress, existing);
	});

	return priceMap;
};