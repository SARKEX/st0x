import type {
	SgOrderWithSubgraphName,
	QuoteSpec,
	OrderV3,
	QuoteResultEnum,
	SgOrder
} from '@rainlanguage/orderbook';
import { doQuoteSpecs, getOrders } from '@rainlanguage/orderbook';
import { networks, TOKENS, USDC_TOKENS } from '$lib/network';
import { AbiCoder } from 'ethers';

// ABI types for decoding order bytes
export const IO = '(address token, uint8 decimals, uint256 vaultId)';
export const EvaluableV3 = '(address interpreter, address store, bytes bytecode)';
export const OrderV3_ABI = `(address owner, ${EvaluableV3} evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce)`;

// Types for processed quotes
export interface ProcessedQuote {
	orderHash: string;
	maxOutput: bigint;
	ratio: bigint;
	inputTokenSymbol: string;
	outputTokenSymbol: string;
	inputTokenAddress: string;
	outputTokenAddress: string;
}

// Helper function to convert hex string to BigInt
export function hexToBigInt(hex: string): bigint {
	if (hex.startsWith('0x')) {
		return BigInt(hex);
	}
	return BigInt(`0x${hex}`);
}

// Import the actual Token type
import type { PythToken } from '$lib/types';

// Helper function to get token symbol by address
function getTokenSymbol(address: string, tokens: PythToken[]): string {
	const token = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
	return token?.symbol || 'UNKNOWN';
}

// Process and filter quotes
type QuoteResultWithSpec = {
	result: QuoteResultEnum;
	spec: QuoteSpec;
};

const RATIO_SCALE = 1e18;

function processQuotes(
	quoteResults: QuoteResultWithSpec[],
	filteredOrders: SgOrderWithSubgraphName[],
	usdcToken: PythToken,
	stockTokens: PythToken[]
): ProcessedQuote[] {
	const processedQuotes: ProcessedQuote[] = [];

	// Create a map of orderHash to order for quick lookup
	const orderMap = new Map<string, SgOrder>();
	filteredOrders.forEach(({ order }) => {
		orderMap.set(order.orderHash, order);
	});

	quoteResults.forEach(({ result, spec }) => {
		try {
			if (result.error || !result.value) {
				return;
			}

			const { maxOutput, ratio } = result.value;

			// Convert hex to BigInt
			const maxOutputBigInt = hexToBigInt(maxOutput);
			const ratioBigInt = hexToBigInt(ratio);

			// Skip if maxOutput is 0
			if (maxOutputBigInt === 0n) {
				return;
			}

			const order = orderMap.get(spec.orderHash);
			if (!order) {
				return;
			}

			// Decode order to get token addresses
			const abiCoder = AbiCoder.defaultAbiCoder();
			const decodedOrder = abiCoder.decode([OrderV3_ABI], order.orderBytes);
			const orderData = decodedOrder[0] as OrderV3;

			const inputDefinition = orderData.validInputs[spec.inputIOIndex];
			const outputDefinition = orderData.validOutputs[spec.outputIOIndex];
			if (!inputDefinition || !outputDefinition) {
				return;
			}

			// Use the input/output indexes from the quote spec
			const inputTokenAddress = inputDefinition.token;
			const outputTokenAddress = outputDefinition.token;

			// Get token symbols - need to check both USDC and stock tokens for both input and output
			const inputTokenSymbol = getTokenSymbol(inputTokenAddress, [usdcToken, ...stockTokens]);
			const outputTokenSymbol = getTokenSymbol(outputTokenAddress, [usdcToken, ...stockTokens]);

			const processedQuote: ProcessedQuote = {
				orderHash: order.orderHash,
				maxOutput: maxOutputBigInt,
				ratio: ratioBigInt,
				inputTokenSymbol,
				outputTokenSymbol,
				inputTokenAddress,
				outputTokenAddress
			};

			processedQuotes.push(processedQuote);
		} catch {
			// Silently skip errors
		}
	});

	return processedQuotes;
}

/**
 * Fetches all orders from subgraph, filters orders with USDC as input and stock tokens as output,
 * and quotes all filtered orders
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

	const orderBookSg = network.orderbook_subgraph_url;
	const rpcUrls = network.fallbackRpcUrls;

	// Get USDC token address for the network
	const usdcToken = USDC_TOKENS[networkId];
	if (!usdcToken) {
		throw new Error(`USDC token not found for network ${networkId}`);
	}

	// Get stock tokens for the network
	const stockTokens = TOKENS.filter(
		(token) => token.chainId === networkId && token.category === 'ST0x'
	);

	// Fetch all orders from subgraph with pagination
	const allOrders: SgOrderWithSubgraphName[] = [];
	let page = 1;
	let hasMore = true;

	while (hasMore) {
		try {
			const ordersResult = await getOrders(
				[
					{
						url: orderBookSg,
						name: network.raindexNetworkSlug
					}
				],
				{
					active: true, // Only active orders
					owners: []
				},
				{ page, pageSize }
			);

			if (ordersResult.error) {
				throw new Error(ordersResult.error.readableMsg);
			}

			const pageOrders: SgOrderWithSubgraphName[] = ordersResult.value;
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

	// Filter orders that have USDC and stock tokens in either direction
	const filteredOrders = allOrders.filter(({ order }) => {
		try {
			// Decode the order bytes to get the actual order structure
			const abiCoder = AbiCoder.defaultAbiCoder();
			const decodedOrder = abiCoder.decode([OrderV3_ABI], order.orderBytes);
			const orderData = decodedOrder[0] as OrderV3;

			// Get input and output addresses from decoded order
			const inputAddresses = orderData.validInputs.map((input: { token: string }) =>
				input.token.toLowerCase()
			);
			const outputAddresses = orderData.validOutputs.map((output: { token: string }) =>
				output.token.toLowerCase()
			);

			const usdcAddress = usdcToken.address.toLowerCase();
			const stockAddresses = stockTokens.map((token) => token.address.toLowerCase());

			// Check if order has USDC as input and stock as output
			const hasUSDCAsInputAndStockAsOutput =
				inputAddresses.includes(usdcAddress) &&
				outputAddresses.some((addr: string) => stockAddresses.includes(addr));

			// Check if order has stock as input and USDC as output
			const hasStockAsInputAndUSDCAsOutput =
				inputAddresses.some((addr: string) => stockAddresses.includes(addr)) &&
				outputAddresses.includes(usdcAddress);

			// Check if order has both USDC and stock in inputs (bidirectional)
			const hasBothInInputs =
				inputAddresses.includes(usdcAddress) &&
				inputAddresses.some((addr: string) => stockAddresses.includes(addr));

			// Check if order has both USDC and stock in outputs (bidirectional)
			const hasBothInOutputs =
				outputAddresses.includes(usdcAddress) &&
				outputAddresses.some((addr: string) => stockAddresses.includes(addr));

			const shouldInclude =
				hasUSDCAsInputAndStockAsOutput ||
				hasStockAsInputAndUSDCAsOutput ||
				(hasBothInInputs && hasBothInOutputs);

			return shouldInclude;
		} catch {
			return false;
		}
	});

	if (filteredOrders.length === 0) {
		return [];
	}

	// Create quote specs for all filtered orders
	const quoteSpecs: QuoteSpec[] = [];

	filteredOrders.forEach(({ order }) => {
		try {
			// Decode the order bytes to get the actual order structure
			const abiCoder = AbiCoder.defaultAbiCoder();
			const decodedOrder = abiCoder.decode([OrderV3_ABI], order.orderBytes);
			const orderData = decodedOrder[0] as OrderV3;

			// Get input and output addresses from decoded order
			const inputAddresses = orderData.validInputs.map((input: { token: string }) =>
				input.token.toLowerCase()
			);
			const outputAddresses = orderData.validOutputs.map((output: { token: string }) =>
				output.token.toLowerCase()
			);

			const usdcAddress = usdcToken.address.toLowerCase();

			// Create quote specs for each supported direction
			// For each stock token, check if we can create a quote spec
			stockTokens.forEach((stockToken) => {
				const stockAddress = stockToken.address.toLowerCase();

				// Check USDC -> Stock direction for this specific stock
				const usdcInputIndex = inputAddresses.findIndex((addr: string) => addr === usdcAddress);
				const stockOutputIndex = outputAddresses.findIndex((addr: string) => addr === stockAddress);

				if (usdcInputIndex !== -1 && stockOutputIndex !== -1) {
					// USDC -> Stock direction
					quoteSpecs.push({
						orderHash: order.orderHash,
						inputIOIndex: usdcInputIndex,
						outputIOIndex: stockOutputIndex,
						signedContext: [],
						orderbook: order.orderbook.id
					});
				}

				// Check Stock -> USDC direction for this specific stock
				const stockInputIndex = inputAddresses.findIndex((addr: string) => addr === stockAddress);
				const usdcOutputIndex = outputAddresses.findIndex((addr: string) => addr === usdcAddress);

				if (stockInputIndex !== -1 && usdcOutputIndex !== -1) {
					// Stock -> USDC direction
					quoteSpecs.push({
						orderHash: order.orderHash,
						inputIOIndex: stockInputIndex,
						outputIOIndex: usdcOutputIndex,
						signedContext: [],
						orderbook: order.orderbook.id
					});
				}
			});
		} catch {
			// Skip invalid orders
		}
	});

	// Quote all orders in batches to avoid overwhelming the API
	const batchSize = 10;
	const quotesWithSpec: QuoteResultWithSpec[] = [];

	for (let i = 0; i < quoteSpecs.length; i += batchSize) {
		const batch = quoteSpecs.slice(i, i + batchSize);

		try {
			const batchQuotes = await doQuoteSpecs(batch, orderBookSg, rpcUrls);
			if (batchQuotes.error || !batchQuotes.value) {
				continue;
			}
			batchQuotes.value.forEach((result, index) => {
				const spec = batch[index];
				if (!spec) return;
				quotesWithSpec.push({ result, spec });
			});
		} catch {
			// Continue with next batch
		}
	}

	// Process and filter the quotes
	const processedQuotes = processQuotes(quotesWithSpec, filteredOrders, usdcToken, stockTokens);

	return processedQuotes;
}

const normaliseRatio = (value: bigint): number => {
	const ratio = Number(value);
	if (!Number.isFinite(ratio)) {
		return NaN;
	}
	return ratio / RATIO_SCALE;
};

export type TokenPriceSummary = {
	buy?: number;
	sell?: number;
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
	const usdcAddress = usdcAddressRaw.toLowerCase();

	quotes.forEach((quote) => {
		const ratio = normaliseRatio(quote.ratio);
		if (!Number.isFinite(ratio) || ratio <= 0) return;

		const inputAddress = quote.inputTokenAddress.toLowerCase();
		const outputAddress = quote.outputTokenAddress.toLowerCase();
		const inputIsUsdc =
			inputAddress === usdcAddress || quote.inputTokenSymbol?.toUpperCase() === 'USDC';
		const outputIsUsdc =
			outputAddress === usdcAddress || quote.outputTokenSymbol?.toUpperCase() === 'USDC';

		if (outputIsUsdc) {
			const assetAddress = inputAddress;
			if (assetAddress !== usdcAddress) {
				const price = ratio === 0 ? NaN : 1 / ratio;
				if (Number.isFinite(price) && price > 0) {
					const existing = priceMap.get(assetAddress) ?? {};
					existing.buy = chooseBestPrice(existing.buy, price, 'max');
					priceMap.set(assetAddress, existing);
				}
			}
		}

		if (inputIsUsdc) {
			const assetAddress = outputAddress;
			if (assetAddress !== usdcAddress) {
				const price = ratio;
				if (Number.isFinite(price) && price > 0) {
					const existing = priceMap.get(assetAddress) ?? {};
					existing.sell = chooseBestPrice(existing.sell, price, 'min');
					priceMap.set(assetAddress, existing);
				}
			}
		}
	});

	return priceMap;
};
