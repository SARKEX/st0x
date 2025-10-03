import type { SgOrderWithSubgraphName, QuoteSpec, OrderV3 } from '@rainlanguage/orderbook';
import { doQuoteSpecs, getOrders } from '@rainlanguage/orderbook';
import { networks, TOKENS, USDC_TOKENS } from '$lib/network';
import { ethers } from 'ethers';

// ABI types for decoding order bytes
const IO = '(address token, uint8 decimals, uint256 vaultId)';
const EvaluableV3 = '(address interpreter, address store, bytes bytecode)';
const OrderV3 = `(address owner, ${EvaluableV3} evaluable, ${IO}[] validInputs, ${IO}[] validOutputs, bytes32 nonce)`;

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
function hexToBigInt(hex: string): bigint {
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
function processQuotes(
	allQuotes: any[],
	filteredOrders: SgOrderWithSubgraphName[],
	quoteSpecs: QuoteSpec[],
	usdcToken: PythToken,
	stockTokens: PythToken[]
): ProcessedQuote[] {
	const processedQuotes: ProcessedQuote[] = [];

	// Flatten all quotes from batches
	const flatQuotes = allQuotes.flatMap((batch) => batch.value || []);

	// Create a map of orderHash to order for quick lookup
	const orderMap = new Map<string, SgOrderWithSubgraphName>();
	filteredOrders.forEach(({ order }) => {
		orderMap.set(order.orderHash, { order, subgraphName: '' });
	});

	flatQuotes.forEach((quoteResult, index) => {
		try {
			// Skip error results
			if (quoteResult.error) {
				return;
			}

			// Skip if no value
			if (!quoteResult.value) {
				return;
			}

			const { maxOutput, ratio } = quoteResult.value;

			// Convert hex to BigInt
			const maxOutputBigInt = hexToBigInt(maxOutput);
			const ratioBigInt = hexToBigInt(ratio);

			// Skip if maxOutput is 0
			if (maxOutputBigInt === 0n) {
				return;
			}

			// Find the corresponding order by matching orderHash from quoteSpecs
			// Since we now have multiple quote specs per order, we need to find the order by hash
			const quoteSpec = quoteSpecs[index];
			if (!quoteSpec) {
				return;
			}

			const orderMapData = orderMap.get(quoteSpec.orderHash);
			if (!orderMapData) {
				return;
			}

			const { order } = orderMapData;

			// Decode order to get token addresses
			const decodedOrder = ethers.utils.defaultAbiCoder.decode([OrderV3], order.orderBytes);
			const orderData = decodedOrder[0];

			// Use the input/output indexes from the quote spec
			const inputTokenAddress = orderData.validInputs[quoteSpec.inputIOIndex].token;
			const outputTokenAddress = orderData.validOutputs[quoteSpec.outputIOIndex].token;

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
	try {
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
				const decodedOrder = ethers.utils.defaultAbiCoder.decode([OrderV3], order.orderBytes);
				const orderData = decodedOrder[0];

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
			} catch (error) {
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
				const decodedOrder = ethers.utils.defaultAbiCoder.decode([OrderV3], order.orderBytes);
				const orderData = decodedOrder[0];

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
					const stockOutputIndex = outputAddresses.findIndex(
						(addr: string) => addr === stockAddress
					);

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
			} catch (error) {
				throw error;
			}
		});

		// Quote all orders in batches to avoid overwhelming the API
		const batchSize = 10;
		const allQuotes = [];

		for (let i = 0; i < quoteSpecs.length; i += batchSize) {
			const batch = quoteSpecs.slice(i, i + batchSize);

			try {
				const batchQuotes = await doQuoteSpecs(batch, orderBookSg, rpcUrls);
				// doQuoteSpecs returns a single result, not an array
				allQuotes.push(batchQuotes);
			} catch {
				// Continue with next batch
			}
		}

		// Process and filter the quotes
		const processedQuotes = processQuotes(
			allQuotes,
			filteredOrders,
			quoteSpecs,
			usdcToken,
			stockTokens
		);

		return processedQuotes;
	} catch (error) {
		throw error;
	}
}
