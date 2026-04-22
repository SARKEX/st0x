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
import { describeQuote, normalizeAddress } from '$lib/utils/tokenMath';
import type { PythToken } from '$lib/types';
import { Float } from '@rainlanguage/float';
import type { OrderV4, SgOrder } from '@rainlanguage/orderbook';
import { AbiCoder } from 'ethers';
import {
	type ProcessedQuote,
	OrderV4_ABI,
	normalizeOrderData,
	buildTokenPriceMap as buildTokenPriceMapBase,
	type TokenPriceSummary,
	walkOrderbook
} from '$lib/utils/orderbook';
import { apiGetOrdersByToken, type ApiOrderSummary } from '$lib/api/st0xApi';

export type { ProcessedQuote, TokenPriceSummary };
export { OrderV4_ABI, normalizeOrderData, walkOrderbook };

export const buildTokenPriceMap = (quotes: ProcessedQuote[], quoteAddressRaw: string) =>
	buildTokenPriceMapBase(quotes, quoteAddressRaw, describeQuote);

/** Safety cap to prevent infinite pagination loops from a buggy API response */
const MAX_ORDER_PAGES = 100;

function getTokenMetadata(address: string, tokens: PythToken[]) {
	const token = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
	return {
		symbol: token?.symbol ?? 'UNKNOWN',
		decimals: token?.decimals
	};
}

/**
 * For strategy orders with no live quote (ioRatio === '-'), estimate the ioRatio
 * from the asset token's configured fallbackPrice. Returns a hex Float string or null.
 */
function estimateRatioFromFallback(
	normalizedInput: string,
	normalizedOutput: string,
	normalizedQuote: string
): string | null {
	const assetAddress = normalizedInput === normalizedQuote ? normalizedOutput : normalizedInput;
	const configToken = TOKENS.find((t) => normalizeAddress(t.address) === assetAddress);
	if (!configToken?.fallbackPrice) return null;

	// ASK (sell): input=payment, output=asset → ioRatio = price
	// BID (buy):  input=asset, output=payment → ioRatio = 1/price
	const estimatedRatio =
		normalizedInput === normalizedQuote ? configToken.fallbackPrice : 1 / configToken.fallbackPrice;

	const ratioFloat = Float.parse(String(estimatedRatio));
	if (ratioFloat.error || !ratioFloat.value) return null;
	return ratioFloat.value.asHex();
}

/**
 * Convert an API OrderSummary into a ProcessedQuote.
 *
 * Uses Float.parse() to convert the server's decimal ioRatio and outputVaultBalance
 * back into hex-encoded Float strings, preserving compatibility with walkOrderbook
 * and computeEmergencyRatioHex which expect hex Float format.
 *
 * Strategy orders with no live quote (ioRatio === '-') are estimated using the
 * token's configured fallbackPrice so they appear in the orderbook chart.
 *
 * The sgOrder is created as a minimal stub with just orderHash — marketOrderExecution.ts
 * hydrates the full order from Raindex before executing.
 */
function convertApiOrderToProcessedQuote(
	order: ApiOrderSummary,
	quoteTokenAddress: string,
	allTokens: PythToken[]
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

	let ratio: string;
	if (!order.ioRatio || order.ioRatio === '-') {
		// Strategy order with no live quote — estimate from fallback price
		const estimated = estimateRatioFromFallback(normalizedInput, normalizedOutput, normalizedQuote);
		if (!estimated) return null;
		ratio = estimated;
	} else {
		// Convert ioRatio decimal to hex Float for consumers expecting hex (e.g. computeEmergencyRatioHex)
		const ratioFloat = Float.parse(order.ioRatio);
		if (ratioFloat.error || !ratioFloat.value) return null;
		ratio = ratioFloat.value.asHex();
	}

	// Convert outputVaultBalance to hex Float for walkOrderbook's computeAvailableQuantity
	const balanceFloat = Float.parse(order.outputVaultBalance);
	if (balanceFloat.error || !balanceFloat.value) return null;
	const maxOutput = balanceFloat.value.asHex();

	// Get token metadata from config (for symbol fallback)
	const inputMeta = getTokenMetadata(order.inputToken.address, allTokens);
	const outputMeta = getTokenMetadata(order.outputToken.address, allTokens);

	// Decode full OrderV4 from orderBytes (ABI-encoded on-chain struct)
	let orderData: OrderV4 | undefined;
	const sgOrderBase = {
		orderHash: order.orderHash,
		owner: order.owner,
		orderbook: { id: order.orderbookId }
	};
	let sgOrder: SgOrder;
	if (order.orderBytes) {
		try {
			const decoded = AbiCoder.defaultAbiCoder().decode([OrderV4_ABI], order.orderBytes);
			orderData = normalizeOrderData(decoded[0] as OrderV4);
			sgOrder = { ...sgOrderBase, orderBytes: order.orderBytes } as SgOrder;
		} catch {
			sgOrder = sgOrderBase as SgOrder;
		}
	} else {
		sgOrder = sgOrderBase as SgOrder;
	}

	const processedQuote: ProcessedQuote = {
		orderHash: order.orderHash,
		maxOutput,
		ratio,
		inputTokenSymbol: order.inputToken.symbol || inputMeta.symbol,
		outputTokenSymbol: order.outputToken.symbol || outputMeta.symbol,
		inputTokenAddress: order.inputToken.address,
		outputTokenAddress: order.outputToken.address,
		inputIOIndex: 0,
		outputIOIndex: 0,
		sgOrder,
		orderData,
		orderbookId: order.orderbookId,
		inputTokenDecimals: order.inputToken.decimals ?? inputMeta.decimals ?? 18,
		outputTokenDecimals: order.outputToken.decimals ?? outputMeta.decimals ?? 18
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
	overridePaymentToken?: PythToken
): { paymentToken: PythToken; stockTokens: PythToken[]; allTokens: PythToken[] } {
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

/**
 * Fetches all orders for all stock tokens via the REST API and converts them to ProcessedQuotes.
 * The REST API handles server-side quoting and caching.
 */
export async function fetchAndQuotePaymentTokenOrders(
	networkId: number = 8453,
	overridePaymentToken?: PythToken
) {
	const { paymentToken, stockTokens, allTokens } = resolveNetworkTokens(
		networkId,
		overridePaymentToken
	);

	const processedQuotes: ProcessedQuote[] = [];
	const seen = new Set<string>();

	const results = await Promise.allSettled(
		stockTokens.map(async (token) => {
			let page = 1;
			let hasMore = true;
			while (hasMore && page <= MAX_ORDER_PAGES) {
				const response = await apiGetOrdersByToken(token.address, { page, pageSize: 50 });
				for (const order of response.orders) {
					if (seen.has(order.orderHash)) continue;
					seen.add(order.orderHash);
					const quote = convertApiOrderToProcessedQuote(order, paymentToken.address, allTokens);
					if (quote) processedQuotes.push(quote);
				}
				hasMore = response.pagination.hasMore;
				page++;
			}
			if (hasMore) {
				console.warn(
					`[orders] Hit pagination cap (${MAX_ORDER_PAGES} pages) for token ${token.address}`
				);
			}
		})
	);

	// Log any failed token fetches
	for (const result of results) {
		if (result.status === 'rejected') {
			console.warn('[orders] Token fetch failed:', result.reason);
		}
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
	overridePaymentToken?: PythToken
) {
	const { paymentToken, allTokens } = resolveNetworkTokens(networkId, overridePaymentToken);

	const processedQuotes: ProcessedQuote[] = [];
	const seen = new Set<string>();
	let page = 1;
	let hasMore = true;
	while (hasMore && page <= MAX_ORDER_PAGES) {
		try {
			const response = await apiGetOrdersByToken(tokenAddress, { page, pageSize: 50 });
			for (const order of response.orders) {
				if (seen.has(order.orderHash)) continue;
				seen.add(order.orderHash);
				const quote = convertApiOrderToProcessedQuote(order, paymentToken.address, allTokens);
				if (quote) processedQuotes.push(quote);
			}
			hasMore = response.pagination.hasMore;
			page++;
		} catch (error) {
			console.warn(`[orders] Page ${page} fetch failed for token ${tokenAddress}:`, error);
			break;
		}
	}
	if (hasMore) {
		console.warn(
			`[orders] Hit pagination cap (${MAX_ORDER_PAGES} pages) for token ${tokenAddress}`
		);
	}

	return processedQuotes;
}
