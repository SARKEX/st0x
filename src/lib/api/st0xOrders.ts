/**
 * st0x orders-by-token API (v1).
 * Fetches orders for a token via the proxy; used to reduce subgraph/RPC load for the orders list.
 */

import { parseUnits } from 'viem';
import type { DisplayOrder } from '$lib/types/orders';
import type { ProcessedQuote, TokenPriceSummary } from '$lib/utils/orderbook';

export interface ApiOrderbookCache {
	quotes: ProcessedQuote[];
	summary: Record<string, TokenPriceSummary>;
}

// Response shape from GET https://api.st0x.io/v1/orders/token/:token
export interface St0xOrderItem {
	orderHash: string;
	owner: string;
	inputToken: { address: string; symbol: string; decimals: number };
	outputToken: { address: string; symbol: string; decimals: number };
	outputVaultBalance: string;
	ioRatio: string; // numeric string or "-"
	createdAt: number; // unix seconds
	orderbookId: string;
}

export interface St0xOrdersByTokenResponse {
	orders: St0xOrderItem[];
	pagination: {
		page: number;
		pageSize: number;
		totalOrders: number;
		totalPages: number;
		hasMore: boolean;
	};
}

const PROXY_BASE = '/api/proxy-orders-by-token';
const PROXY_OWNER_BASE = '/api/proxy-orders-by-owner';

/**
 * Fetch orders for a token from the st0x API (via proxy).
 * @param tokenAddress - Token contract address (0x...)
 * @param side - 'input' = token is input vault (sell orders), 'output' = token is output vault (buy orders)
 * @param page - 1-based page
 * @param pageSize - Page size (default 20)
 */
export async function fetchOrdersByToken(
	tokenAddress: string,
	side: 'input' | 'output',
	page = 1,
	pageSize = 20
): Promise<St0xOrdersByTokenResponse> {
	const token = tokenAddress.startsWith('0x') ? tokenAddress : `0x${tokenAddress}`;
	const url = `${PROXY_BASE}/${encodeURIComponent(token)}?side=${side}&page=${page}&pageSize=${pageSize}`;
	const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error((err as { error?: string })?.error ?? `Orders API error: ${res.status}`);
	}
	return res.json() as Promise<St0xOrdersByTokenResponse>;
}

/**
 * Map a single st0x API order to DisplayOrder.
 * @param order - Order from st0x API
 * @param tokenAddress - The token address we're listing orders for (for side/display)
 * @param side - The side this order was fetched with (input = token is input, output = token is output)
 */
export function st0xOrderToDisplayOrder(
	order: St0xOrderItem,
	tokenAddress: string,
	side: 'input' | 'output'
): DisplayOrder {
	const tokenAddr = tokenAddress.toLowerCase();

	// side=input => token is input => user sells token => Sell
	// side=output => token is output => user buys token => Buy
	const orderSide: 'Buy' | 'Sell' = side === 'input' ? 'Sell' : 'Buy';
	const tokenSymbol =
		side === 'input' ? order.inputToken.symbol : order.outputToken.symbol;

	// ioRatio is output/input. We want price = quote per token (USD per token).
	// Sell (token=input, quote=output): ioRatio = quote/token = price.
	// Buy (quote=input, token=output): ioRatio = token/quote, so price = 1/ioRatio.
	let price: number | undefined;
	if (order.ioRatio && order.ioRatio !== '-') {
		const r = parseFloat(order.ioRatio);
		if (Number.isFinite(r) && r > 0) {
			price = side === 'input' ? r : 1 / r;
		}
	}

	// outputVaultBalance: for sell (token=input), output is quote so balance is quote remaining; for buy, output is token
	// We show "remaining" in token terms: for sell = remaining token to sell (we don't have it directly), for buy = remaining token to receive (outputVaultBalance in token decimals)
	const isFilled = order.outputVaultBalance === '0' || parseFloat(order.outputVaultBalance) <= 0;
	let remainingAmount: string | undefined;
	if (order.outputVaultBalance && order.outputVaultBalance !== '0') {
		const v = parseFloat(order.outputVaultBalance);
		if (Number.isFinite(v) && v > 0) {
			remainingAmount = v >= 1 ? v.toFixed(3) : v.toFixed(6);
		}
	}

	// Minimal quote for OrdersTable: owner for "My Orders" filter, orderbookId for Raindex link. No vault IDs so Cancel/Withdraw may not work.
	const minimalSgOrder = {
		owner: order.owner,
		active: !isFilled,
		timestampAdded: String(order.createdAt)
	};
	const quote: ProcessedQuote = {
		orderHash: order.orderHash,
		maxOutput: '0x0',
		ratio: '0x0',
		inputTokenSymbol: order.inputToken.symbol,
		outputTokenSymbol: order.outputToken.symbol,
		inputTokenAddress: order.inputToken.address,
		outputTokenAddress: order.outputToken.address,
		inputIOIndex: 0,
		outputIOIndex: 0,
		orderbookId: order.orderbookId,
		inputTokenDecimals: order.inputToken.decimals,
		outputTokenDecimals: order.outputToken.decimals,
		quotePerAsset: price,
		sgOrder: minimalSgOrder as ProcessedQuote['sgOrder']
	};

	return {
		type: 'limit',
		orderHash: order.orderHash,
		timestamp: order.createdAt,
		side: orderSide,
		quote,
		tokenSymbol,
		tokenAddress: tokenAddr,
		inputTokenSymbol: order.inputToken.symbol,
		outputTokenSymbol: order.outputToken.symbol,
		price,
		isActive: !isFilled,
		isFilled,
		remainingAmount
	};
}

/**
 * Fetch all orders for an owner address from the st0x API (via proxy).
 */
export async function fetchOrdersByOwner(
	ownerAddress: string,
	page = 1,
	pageSize = 50
): Promise<St0xOrdersByTokenResponse> {
	const owner = ownerAddress.startsWith('0x') ? ownerAddress : `0x${ownerAddress}`;
	const url = `${PROXY_OWNER_BASE}/${encodeURIComponent(owner)}?page=${page}&pageSize=${pageSize}`;
	const res = await fetch(url, { method: 'GET', headers: { accept: 'application/json' } });
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error((err as { error?: string })?.error ?? `Owner orders API error: ${res.status}`);
	}
	return res.json() as Promise<St0xOrdersByTokenResponse>;
}

/**
 * Fetch all orders for an owner, optionally filtered to a set of token addresses, and map to DisplayOrder[].
 * @param ownerAddress - The owner wallet address
 * @param tokenAddresses - Optional set of token addresses to filter by (e.g. wrapped + legacy addresses for a token)
 */
export async function fetchOwnerOrdersForDisplay(
	ownerAddress: string,
	tokenAddresses?: Set<string>,
	page = 1,
	pageSize = 50
): Promise<DisplayOrder[]> {
	const res = await fetchOrdersByOwner(ownerAddress, page, pageSize);
	const byHash = new Map<string, DisplayOrder>();

	for (const order of res.orders ?? []) {
		// Filter to relevant token addresses if provided
		if (tokenAddresses) {
			const inputAddr = order.inputToken.address.toLowerCase();
			const outputAddr = order.outputToken.address.toLowerCase();
			if (!tokenAddresses.has(inputAddr) && !tokenAddresses.has(outputAddr)) {
				continue;
			}
		}

		// Determine side based on which token matches; prefer input side
		const inputAddr = order.inputToken.address.toLowerCase();
		const isInputMatch = tokenAddresses ? tokenAddresses.has(inputAddr) : true;
		const side: 'input' | 'output' = isInputMatch ? 'input' : 'output';
		const tokenAddress = isInputMatch ? order.inputToken.address : order.outputToken.address;

		const display = st0xOrderToDisplayOrder(order, tokenAddress, side);
		byHash.set(order.orderHash.toLowerCase(), display);
	}

	const orders = Array.from(byHash.values());
	orders.sort((a, b) => b.timestamp - a.timestamp);
	return orders;
}

/**
 * Fetch orders for a token for both sides (input + output) and merge into DisplayOrder[].
 * Used by the trade page to populate the Orders tab without subgraph/RPC for the list.
 */
export async function fetchTokenOrdersForDisplay(
	tokenAddress: string,
	page = 1,
	pageSize = 50
): Promise<DisplayOrder[]> {
	const [inputRes, outputRes] = await Promise.all([
		fetchOrdersByToken(tokenAddress, 'input', page, pageSize),
		fetchOrdersByToken(tokenAddress, 'output', page, pageSize)
	]);

	const byHash = new Map<string, DisplayOrder>();

	for (const order of inputRes.orders ?? []) {
		const display = st0xOrderToDisplayOrder(order, tokenAddress, 'input');
		byHash.set(order.orderHash.toLowerCase(), display);
	}
	for (const order of outputRes.orders ?? []) {
		const display = st0xOrderToDisplayOrder(order, tokenAddress, 'output');
		byHash.set(order.orderHash.toLowerCase(), display);
	}

	const merged = Array.from(byHash.values());
	merged.sort((a, b) => b.timestamp - a.timestamp);
	return merged;
}

/**
 * Convert a St0xOrderItem to a ProcessedQuote for depth chart and walkOrderbook.
 * maxOutput is set as a bigint (from outputVaultBalance); quotePerAsset is derived from ioRatio.
 *
 * ioRatio semantics (API spec: input/output):
 *   side=output (input=payment, output=asset): ioRatio = payment/asset = USDC per asset → ASK
 *   side=input  (input=asset, output=payment): ioRatio = asset/payment → price = 1/ioRatio → BID
 */
export function st0xOrderToProcessedQuote(
	order: St0xOrderItem,
	side: 'input' | 'output'
): ProcessedQuote | null {
	const ioRatioStr = order.ioRatio;
	if (!ioRatioStr || ioRatioStr === '-') return null;
	const ioRatioNum = parseFloat(ioRatioStr);
	if (!Number.isFinite(ioRatioNum) || ioRatioNum <= 0) return null;

	const balanceNum = parseFloat(order.outputVaultBalance);
	if (!Number.isFinite(balanceNum) || balanceNum <= 0) return null;

	const quoteSide: 'ask' | 'bid' = side === 'output' ? 'ask' : 'bid';
	const quotePerAsset = side === 'output' ? ioRatioNum : 1 / ioRatioNum;
	const assetAddress =
		side === 'output' ? order.outputToken.address : order.inputToken.address;

	// Convert outputVaultBalance string to bigint, truncating to outputToken decimals
	const outputDecimals = order.outputToken.decimals;
	let maxOutput: bigint;
	try {
		const dotIdx = order.outputVaultBalance.indexOf('.');
		const truncated =
			dotIdx >= 0
				? order.outputVaultBalance.slice(0, dotIdx + outputDecimals + 1)
				: order.outputVaultBalance;
		maxOutput = parseUnits(truncated as `${number}`, outputDecimals);
	} catch {
		maxOutput = BigInt(Math.floor(balanceNum * 10 ** outputDecimals));
	}

	return {
		orderHash: order.orderHash,
		maxOutput,
		ratio: '0x0',
		inputTokenSymbol: order.inputToken.symbol,
		outputTokenSymbol: order.outputToken.symbol,
		inputTokenAddress: order.inputToken.address,
		outputTokenAddress: order.outputToken.address,
		inputIOIndex: 0,
		outputIOIndex: 0,
		orderbookId: order.orderbookId,
		inputTokenDecimals: order.inputToken.decimals,
		outputTokenDecimals: order.outputToken.decimals,
		quotePerAsset,
		side: quoteSide,
		assetAddress,
		sgOrder: {
			owner: order.owner,
			active: balanceNum > 0,
			timestampAdded: String(order.createdAt)
		} as ProcessedQuote['sgOrder']
	};
}

/**
 * Fetch orders for a token from both sides of the API and build an ApiOrderbookCache
 * (ProcessedQuote[] + price summary) for use in depth chart and market order execution.
 * Replaces the SG + RPC orderbook quotes pipeline.
 */
export async function fetchTokenProcessedQuotes(
	tokenAddress: string,
	page = 1,
	pageSize = 50
): Promise<ApiOrderbookCache> {
	const token = tokenAddress.startsWith('0x') ? tokenAddress : `0x${tokenAddress}`;

	const [inputRes, outputRes] = await Promise.all([
		fetchOrdersByToken(token, 'input', page, pageSize),
		fetchOrdersByToken(token, 'output', page, pageSize)
	]);

	const byHash = new Map<string, ProcessedQuote>();

	for (const order of inputRes.orders ?? []) {
		const pq = st0xOrderToProcessedQuote(order, 'input');
		if (pq) byHash.set(order.orderHash.toLowerCase(), pq);
	}
	for (const order of outputRes.orders ?? []) {
		const pq = st0xOrderToProcessedQuote(order, 'output');
		if (pq) byHash.set(order.orderHash.toLowerCase(), pq);
	}

	const quotes = Array.from(byHash.values());

	// Build best-bid/ask summary per asset address
	const summary: Record<string, TokenPriceSummary> = {};
	for (const q of quotes) {
		if (!q.assetAddress || !q.quotePerAsset || !Number.isFinite(q.quotePerAsset)) continue;
		const addr = q.assetAddress.toLowerCase();
		const existing = summary[addr] ?? {};
		if (q.side === 'ask') {
			if (existing.ask === undefined || q.quotePerAsset < existing.ask) existing.ask = q.quotePerAsset;
		} else {
			if (existing.bid === undefined || q.quotePerAsset > (existing.bid ?? 0)) existing.bid = q.quotePerAsset;
		}
		summary[addr] = existing;
	}

	return { quotes, summary };
}
