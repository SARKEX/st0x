/**
 * Orders API
 *
 * Fetches orders from the st0x REST API and converts them to ProcessedQuotes.
 * Server-side quoting and caching eliminates client-side Raindex SDK usage for orders.
 */

import {
	networks,
	TOKENS,
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork
} from '$lib/config/network';
import type { CategorizedToken } from '$lib/config/network';
import { describeQuote, normalizeAddress } from '$lib/utils/tokenMath';
import type { Token } from '$lib/types';
import { Float } from '@rainlanguage/float';
import type { OrderV4, SgOrder } from '@rainlanguage/raindex';
import { AbiCoder } from 'ethers';
import {
	type ProcessedQuote,
	OrderV4_ABI,
	normalizeOrderData,
	buildTokenPriceMap as buildTokenPriceMapBase,
	type TokenPriceSummary,
	walkOrderbook
} from '$lib/utils/orderbook';
import {
	apiGetOrdersByToken,
	apiGetOrdersByOwner,
	apiQueryOrders,
	type ApiOrderSummary,
	type ApiOrdersListResponse
} from '$lib/api/st0xApi';

export type { ProcessedQuote, TokenPriceSummary };
export { OrderV4_ABI, normalizeOrderData, walkOrderbook };

export type OrdersQueryFetcher = typeof apiQueryOrders;

export const buildTokenPriceMap = (quotes: ProcessedQuote[], quoteAddressRaw: string) =>
	buildTokenPriceMapBase(quotes, quoteAddressRaw, describeQuote);

/** Safety cap to prevent infinite pagination loops from a buggy API response */
const MAX_ORDER_PAGES = 100;

function getTokenMetadata(address: string, tokens: Token[]) {
	const token = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
	return {
		symbol: token?.symbol ?? 'UNKNOWN',
		decimals: token?.decimals
	};
}

/**
 * Convert an API OrderSummary into a ProcessedQuote.
 *
 * Uses Float.parse() to convert the server's decimal ioRatio and maxOutput
 * back into hex-encoded Float strings, preserving compatibility with walkOrderbook
 * and computeEmergencyRatioHex which expect hex Float format.
 *
 * Orders with no live quote (`ioRatio === '-'`, i.e. the API's on-chain `quote()`
 * call reverted — typically Pyth-oracle orders quoted without a signed context) are
 * dropped entirely. They cannot be honoured at any displayable price, so showing them
 * in the depth chart would advertise liquidity that doesn't actually execute.
 *
 * The sgOrder is created as a minimal stub with just orderHash — marketOrderExecution.ts
 * hydrates the full order from Raindex before executing.
 */
function convertApiOrderToProcessedQuote(
	order: ApiOrderSummary,
	quoteTokenAddress: string,
	allTokens: Token[],
	_networkId: number
): ProcessedQuote | null {
	// Skip orders with zero balance
	const balance = parseFloat(order.outputVaultBalance);
	if (!Number.isFinite(balance) || balance <= 0) return null;

	// Filter: at least one side must be the quote (payment) token
	const normalizedInput = normalizeAddress(order.inputToken.address);
	const normalizedOutput = normalizeAddress(order.outputToken.address);
	const normalizedQuote = normalizeAddress(quoteTokenAddress);
	if (!normalizedInput || !normalizedOutput || !normalizedQuote) return null;
	if (normalizedInput !== normalizedQuote && normalizedOutput !== normalizedQuote) {
		return null;
	}

	if (!order.ioRatio || order.ioRatio === '-') {
		// On-chain quote() failed (e.g. Pyth-oracle order quoted without signed context).
		// Drop the order — it cannot be honoured at the price the chart would show.
		return null;
	}
	// Convert ioRatio decimal to hex Float for consumers expecting hex (e.g. computeEmergencyRatioHex)
	const ratioFloat = Float.parse(order.ioRatio);
	if (ratioFloat.error || !ratioFloat.value) return null;
	const ratio = ratioFloat.value.asHex();

	if (!order.maxOutput) return null;
	const maxOutputFloat = Float.parse(order.maxOutput);
	if (maxOutputFloat.error || !maxOutputFloat.value) return null;
	const maxOutput = maxOutputFloat.value.asHex();

	// Get token metadata from config (for symbol fallback)
	const inputMeta = getTokenMetadata(order.inputToken.address, allTokens);
	const outputMeta = getTokenMetadata(order.outputToken.address, allTokens);

	// Decode full OrderV4 from orderBytes (ABI-encoded on-chain struct)
	let orderData: OrderV4 | undefined;
	const sgOrderBase = {
		orderHash: order.orderHash,
		owner: order.owner,
		raindex: { id: order.orderbookId }
	};
	let sgOrder: SgOrder;
	if (order.orderBytes) {
		try {
			const decoded = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], order.orderBytes);
			orderData = normalizeOrderData(decoded[0] as OrderV4);
			sgOrder = { ...sgOrderBase, orderBytes: order.orderBytes } as unknown as SgOrder;
		} catch (e) {
			console.warn(`[orders] Failed to decode orderBytes for ${order.orderHash}:`, e);
			sgOrder = sgOrderBase as unknown as SgOrder;
		}
	} else {
		sgOrder = sgOrderBase as unknown as SgOrder;
	}

	// Derive correct IO indexes from decoded orderData by matching token addresses
	let inputIOIndex = 0;
	let outputIOIndex = 0;
	if (orderData) {
		const inputIdx = (orderData.validInputs as { token: string }[])?.findIndex(
			(i) => i.token.toLowerCase() === order.inputToken.address.toLowerCase()
		);
		const outputIdx = (orderData.validOutputs as { token: string }[])?.findIndex(
			(o) => o.token.toLowerCase() === order.outputToken.address.toLowerCase()
		);
		if (inputIdx >= 0) inputIOIndex = inputIdx;
		if (outputIdx >= 0) outputIOIndex = outputIdx;
	}

	const processedQuote: ProcessedQuote = {
		orderHash: order.orderHash,
		maxOutput,
		ratio,
		inputTokenSymbol: order.inputToken.symbol || inputMeta.symbol,
		outputTokenSymbol: order.outputToken.symbol || outputMeta.symbol,
		inputTokenAddress: order.inputToken.address,
		outputTokenAddress: order.outputToken.address,
		inputIOIndex,
		outputIOIndex,
		sgOrder,
		orderData,
		orderbookId: order.orderbookId,
		inputTokenDecimals: order.inputToken.decimals ?? inputMeta.decimals ?? 18,
		outputTokenDecimals: order.outputToken.decimals ?? outputMeta.decimals ?? 18,
		orderType: order.orderType
	};

	// Pre-compute side and price using describeQuote (DRY with tokenMath)
	const metrics = describeQuote(processedQuote, quoteTokenAddress);
	if (metrics) {
		processedQuote.side = metrics.side;
		processedQuote.assetAddress = metrics.assetAddress;
		processedQuote.quotePerAsset = metrics.quotePerAsset;
	}

	return processedQuote;
}

function resolveNetworkTokens(
	networkId: number,
	overridePaymentToken?: Token
): {
	paymentToken: Token;
	stockTokens: CategorizedToken[];
	allTokens: Token[];
} {
	if (!networks.some((n) => n.id === networkId)) {
		throw new Error(`Network with id ${networkId} not found`);
	}

	const paymentToken =
		overridePaymentToken ??
		getDefaultPaymentTokenForNetwork(networkId) ??
		DEFAULT_PAYMENT_TOKENS[networkId];
	if (!paymentToken) {
		throw new Error(`Payment token not found for network ${networkId}`);
	}

	const stockTokens = TOKENS.filter(
		(token) => token.chainId === networkId && token.category === 'ST0x'
	);

	return { paymentToken, stockTokens, allTokens: [paymentToken, ...stockTokens] };
}

interface CollectOrderPagesOptions {
	fetchPage: (page: number) => Promise<ApiOrdersListResponse>;
	paymentToken: Token;
	allTokens: Token[];
	networkId: number;
	partialFailureMessage: (page: number) => string;
	paginationCapMessage: string;
	allowPartialResults: boolean;
	signal?: AbortSignal;
}

async function collectProcessedOrderPages({
	fetchPage,
	paymentToken,
	allTokens,
	networkId,
	partialFailureMessage,
	paginationCapMessage,
	allowPartialResults,
	signal
}: CollectOrderPagesOptions): Promise<ProcessedQuote[]> {
	const processedQuotes: ProcessedQuote[] = [];
	const seen = new Set<string>();
	let page = 1;
	let hasMore = true;
	let expectedTotalOrders: number | null = null;
	let expectedTotalPages: number | null = null;

	while (hasMore && page <= MAX_ORDER_PAGES) {
		try {
			const response = await fetchPage(page);
			if (!allowPartialResults) {
				const { pagination } = response;
				const validIntegers =
					Number.isInteger(pagination.page) &&
					Number.isInteger(pagination.pageSize) &&
					Number.isInteger(pagination.totalOrders) &&
					Number.isInteger(pagination.totalPages);
				const calculatedTotalPages =
					pagination.totalOrders === 0
						? 0
						: Math.ceil(pagination.totalOrders / pagination.pageSize);
				const expectedPageOrders =
					pagination.totalPages === 0
						? 0
						: pagination.page < pagination.totalPages
							? pagination.pageSize
							: pagination.totalOrders - (pagination.totalPages - 1) * pagination.pageSize;
				const validShape =
					validIntegers &&
					pagination.page === page &&
					pagination.pageSize > 0 &&
					pagination.pageSize <= 50 &&
					pagination.totalOrders >= 0 &&
					pagination.totalPages >= 0 &&
					pagination.totalPages === calculatedTotalPages &&
					response.orders.length === expectedPageOrders &&
					(pagination.totalPages === 0
						? page === 1 && pagination.totalOrders === 0
						: page <= pagination.totalPages) &&
					pagination.hasMore === page < pagination.totalPages;
				if (
					!validShape ||
					(expectedTotalOrders !== null && pagination.totalOrders !== expectedTotalOrders) ||
					(expectedTotalPages !== null && pagination.totalPages !== expectedTotalPages)
				) {
					throw new Error(`[orders] Invalid or unstable batch pagination on page ${page}`);
				}
				expectedTotalOrders ??= pagination.totalOrders;
				expectedTotalPages ??= pagination.totalPages;
			}
			for (const order of response.orders) {
				const quote = convertApiOrderToProcessedQuote(
					order,
					paymentToken.address,
					allTokens,
					networkId
				);
				if (!quote) continue;
				const orderKey = `${order.orderbookId.toLowerCase()}:${order.orderHash.toLowerCase()}`;
				if (seen.has(orderKey)) continue;
				seen.add(orderKey);
				processedQuotes.push(quote);
			}
			hasMore = response.pagination.hasMore;
			page++;
		} catch (error) {
			if (signal?.aborted || !allowPartialResults || processedQuotes.length === 0) throw error;
			console.warn(partialFailureMessage(page), error);
			hasMore = false;
		}
	}

	if (hasMore) {
		if (!allowPartialResults) {
			throw new Error(paginationCapMessage);
		}
		console.warn(paginationCapMessage);
	}

	return processedQuotes;
}

/**
 * Fetches all orders for the stock-token catalog through one paginated batch
 * request stream and converts them to ProcessedQuotes.
 */
export async function fetchAndQuotePaymentTokenOrders(
	networkId: number,
	overridePaymentToken?: Token,
	signal?: AbortSignal,
	fetchOrders: OrdersQueryFetcher = apiQueryOrders
): Promise<ProcessedQuote[]> {
	const { paymentToken, stockTokens, allTokens } = resolveNetworkTokens(
		networkId,
		overridePaymentToken
	);
	const tokenAddresses = Array.from(
		new Set(
			stockTokens
				.flatMap((token) => [token.address, token.legacyAddress])
				.filter((address): address is string => Boolean(address))
				.map((address) => address.toLowerCase())
		)
	).sort();
	if (tokenAddresses.length === 0) return [];

	// Underlying unwrapped assets are not orderbook execution tokens. Query the
	// current wrapped and legacy tradable addresses only.
	return collectProcessedOrderPages({
		fetchPage: (page) =>
			fetchOrders(
				{
					chainId: networkId,
					tokenAddresses,
					state: 'active',
					page,
					pageSize: 50,
					denomination: 'wrapped'
				},
				signal
			),
		paymentToken,
		allTokens,
		networkId,
		partialFailureMessage: (page) => `[orders] Batch page ${page} failed; using partial orderbook:`,
		paginationCapMessage: `[orders] Hit pagination cap (${MAX_ORDER_PAGES} batch pages)`,
		allowPartialResults: false,
		signal
	});
}

/**
 * Fetches all of an owner's orders via the REST API and converts them to ProcessedQuotes.
 * One paginated request stream instead of the per-token fan-out — surfaces that only need
 * the connected wallet's orders (dashboard) must not pay for the whole book, since every
 * upstream call draws from a single shared rate-limit budget.
 */
export async function fetchAndQuoteOwnerOrders(
	networkId: number,
	ownerAddress: string,
	overridePaymentToken?: Token
): Promise<ProcessedQuote[]> {
	const { paymentToken, allTokens } = resolveNetworkTokens(networkId, overridePaymentToken);
	const chainId = networks.find((n) => n.id === networkId)?.chainId;
	if (chainId === undefined) throw new Error(`Unknown network ${networkId}`);

	const processedQuotes: ProcessedQuote[] = [];
	const seen = new Set<string>();
	let page = 1;
	let hasMore = true;
	while (hasMore && page <= MAX_ORDER_PAGES) {
		const response = await apiGetOrdersByOwner(ownerAddress, chainId, { page, pageSize: 50 });
		for (const order of response.orders) {
			if (chainId !== undefined && order.chainId !== chainId) continue;
			if (seen.has(order.orderHash)) continue;
			seen.add(order.orderHash);
			const quote = convertApiOrderToProcessedQuote(
				order,
				paymentToken.address,
				allTokens,
				networkId
			);
			if (quote) processedQuotes.push(quote);
		}
		hasMore = response.pagination.hasMore;
		page++;
	}
	if (hasMore) {
		console.warn(
			`[orders] Hit pagination cap (${MAX_ORDER_PAGES} pages) for owner ${ownerAddress}`
		);
	}

	return processedQuotes;
}

/**
 * Fetches orders for a specific token via the REST API.
 * The API handles server-side quoting and caching.
 */
export async function fetchAndQuoteTokenOrders(
	networkId: number,
	tokenAddress: string,
	overridePaymentToken?: Token
) {
	const { paymentToken, allTokens } = resolveNetworkTokens(networkId, overridePaymentToken);
	const chainId = networks.find((network) => network.id === networkId)?.chainId;
	if (chainId === undefined) throw new Error(`Unknown network ${networkId}`);

	return collectProcessedOrderPages({
		fetchPage: (page) => apiGetOrdersByToken(tokenAddress, chainId, { page, pageSize: 50 }),
		paymentToken,
		allTokens,
		networkId,
		partialFailureMessage: (page) =>
			`[orders] Page ${page} fetch failed for token ${tokenAddress}; using partial orderbook:`,
		paginationCapMessage: `[orders] Hit pagination cap (${MAX_ORDER_PAGES} pages) for token ${tokenAddress}`,
		allowPartialResults: true
	});
}
