/**
 * st0x REST API Client
 *
 * Typed client for the st0x REST API, replacing direct Raindex SDK and subgraph queries.
 * All requests go through the /api/st0x proxy route which handles authentication.
 */

import { fetchJson } from '$lib/clients/http';

// ============================================================================
// Shared Types (match Rust API camelCase serialization)
// ============================================================================

export interface ApiTokenRef {
	address: string;
	symbol: string;
	decimals: number;
}

// ============================================================================
// Order Types
// ============================================================================

export interface ApiOrderSummary {
	orderHash: string;
	owner: string;
	inputToken: ApiTokenRef;
	outputToken: ApiTokenRef;
	outputVaultBalance: string;
	ioRatio: string;
	createdAt: number;
	orderbookId: string;
}

export interface ApiOrdersPagination {
	page: number;
	pageSize: number;
	totalOrders: number;
	totalPages: number;
	hasMore: boolean;
}

export interface ApiOrdersListResponse {
	orders: ApiOrderSummary[];
	pagination: ApiOrdersPagination;
}

// ============================================================================
// Trade Types
// ============================================================================

export interface ApiTradeByAddress {
	txHash: string;
	inputAmount: string;
	outputAmount: string;
	inputToken: ApiTokenRef;
	outputToken: ApiTokenRef;
	orderHash: string | null;
	timestamp: number;
	blockNumber: number;
}

export interface ApiTradesPagination {
	page: number;
	pageSize: number;
	totalTrades: number;
	totalPages: number;
	hasMore: boolean;
}

export interface ApiTradesByAddressResponse {
	trades: ApiTradeByAddress[];
	pagination: ApiTradesPagination;
}

export interface ApiOrderTradeEntry {
	id: string;
	txHash: string;
	inputAmount: string;
	outputAmount: string;
	timestamp: number;
	sender: string;
}

export interface ApiTradesBatchEntry {
	orderHash: string;
	trades: ApiOrderTradeEntry[];
}

export interface ApiTradesBatchResponse {
	orders: ApiTradesBatchEntry[];
}

export interface ApiTradeRequest {
	inputToken: string;
	outputToken: string;
	maximumInput: string;
	maximumIoRatio: string;
}

export interface ApiTradeResult {
	inputAmount: string;
	outputAmount: string;
	actualIoRatio: string;
}

export interface ApiTradeByTxEntry {
	orderHash: string;
	orderOwner: string;
	request: ApiTradeRequest;
	result: ApiTradeResult;
}

export interface ApiTradesTotals {
	totalInputAmount: string;
	totalOutputAmount: string;
	averageIoRatio: string;
}

export interface ApiMarketOrder {
	txHash: string;
	blockNumber: number;
	timestamp: number;
	sender: string;
	trades: ApiTradeByTxEntry[];
	totals: ApiTradesTotals;
}

export interface ApiTakerTradesResponse {
	marketOrders: ApiMarketOrder[];
	pagination: ApiTradesPagination;
}

// ============================================================================
// API Client
// ============================================================================

const API_PROXY_BASE = '/api/st0x';

function apiUrl(path: string, params?: Record<string, string | number | undefined>): string {
	const url = `${API_PROXY_BASE}${path}`;
	if (!params) return url;

	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) {
			searchParams.set(key, String(value));
		}
	}
	const qs = searchParams.toString();
	return qs ? `${url}?${qs}` : url;
}

/**
 * Fetch orders by token address from the REST API
 */
export async function apiGetOrdersByToken(
	tokenAddress: string,
	options?: { page?: number; pageSize?: number; side?: 'input' | 'output' }
): Promise<ApiOrdersListResponse> {
	const url = apiUrl(`/v1/orders/token/${tokenAddress}`, {
		page: options?.page,
		pageSize: options?.pageSize,
		side: options?.side
	});
	return fetchJson<ApiOrdersListResponse>(url);
}

/**
 * Fetch orders by owner address from the REST API
 */
export async function apiGetOrdersByOwner(
	ownerAddress: string,
	options?: { page?: number; pageSize?: number }
): Promise<ApiOrdersListResponse> {
	const url = apiUrl(`/v1/orders/owner/${ownerAddress}`, {
		page: options?.page,
		pageSize: options?.pageSize
	});
	return fetchJson<ApiOrdersListResponse>(url);
}

/**
 * Fetch trades for multiple orders in a single request
 */
export async function apiGetTradesBatch(orderHashes: string[]): Promise<ApiTradesBatchResponse> {
	return fetchJson<ApiTradesBatchResponse>(apiUrl('/v1/trades/batch'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ orderHashes })
	});
}

/**
 * Fetch trades by owner address from the REST API
 */
export async function apiGetTradesByAddress(
	address: string,
	options?: { page?: number; pageSize?: number; startTime?: number; endTime?: number }
): Promise<ApiTradesByAddressResponse> {
	const url = apiUrl(`/v1/trades/${address}`, {
		page: options?.page,
		pageSize: options?.pageSize,
		startTime: options?.startTime,
		endTime: options?.endTime
	});
	return fetchJson<ApiTradesByAddressResponse>(url);
}

/**
 * Fetch trades where the user was the taker (market orders).
 * Returns trades grouped by transaction hash.
 */
export async function apiGetTakerTrades(
	address: string,
	options?: { page?: number; pageSize?: number }
): Promise<ApiTakerTradesResponse> {
	const url = apiUrl(`/v1/trades/taker/${address}`, {
		page: options?.page,
		pageSize: options?.pageSize
	});
	return fetchJson<ApiTakerTradesResponse>(url);
}
