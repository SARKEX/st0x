/**
 * st0x REST API Client
 *
 * Typed client for the st0x REST API, replacing direct Raindex SDK and subgraph queries.
 * All requests go through the /api/st0x proxy route which handles authentication.
 */

import { browser } from '$app/environment';
import { fetchJson } from '$lib/clients/http';

// ============================================================================
// Shared Types (match Rust API camelCase serialization)
// ============================================================================

export interface ApiTokenRef {
	address: string;
	symbol: string;
	decimals: number;
}

export interface ApiToken extends ApiTokenRef {
	name?: string | null;
	isin?: string | null;
	label?: string;
	network?: unknown;
	[key: string]: unknown;
}

// ============================================================================
// Swap Types
// ============================================================================

export interface ApiSwapQuoteRequest {
	inputToken: string;
	outputToken: string;
	outputAmount: string;
}

export interface ApiSwapQuoteResponse {
	inputToken: string;
	outputToken: string;
	outputAmount: string;
	estimatedOutput: string;
	estimatedInput: string;
	estimatedIoRatio: string;
}

export interface ApiSwapCalldataRequest extends ApiSwapQuoteRequest {
	taker: string;
	maximumIoRatio: string;
}

export interface ApiApproval {
	token: string;
	spender: string;
	amount: string;
	symbol: string;
	approvalData: string;
}

export interface ApiSwapCalldataResponse {
	to: string;
	data: string;
	value: string;
	estimatedInput: string;
	approvals: ApiApproval[];
}

// ============================================================================
// Order Types
// ============================================================================

export interface ApiOrderSummary {
	orderHash: string;
	owner: string;
	orderBytes: string;
	inputToken: ApiTokenRef;
	outputToken: ApiTokenRef;
	outputVaultBalance: string;
	maxOutput?: string | null;
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

// ============================================================================
// Batch Trade Types
// ============================================================================

export interface ApiTradesBatchEntry {
	orderHash: string;
	trades: ApiTradeByAddress[];
}

export interface ApiTradesBatchResponse {
	tradesByOrderHash: ApiTradesBatchEntry[];
	totalCount: number;
}

// ============================================================================
// API Client
// ============================================================================

const API_PROXY_BASE = '/api/st0x';

function assertBrowser(caller: string): void {
	if (!browser) {
		throw new Error(`${caller} can only be called in the browser (not during SSR)`);
	}
}

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
	assertBrowser('apiGetOrdersByToken');
	const url = apiUrl(`/v1/orders/token/${tokenAddress}`, {
		page: options?.page,
		pageSize: options?.pageSize,
		side: options?.side
	});
	return fetchJson<ApiOrdersListResponse>(url);
}

/**
 * Fetch the canonical supported token list from the REST API.
 */
export async function apiGetTokens(): Promise<ApiToken[]> {
	assertBrowser('apiGetTokens');
	return fetchJson<ApiToken[]>(apiUrl('/v1/tokens'));
}

/**
 * Fetch a fresh API-built swap quote.
 */
export async function apiGetSwapQuote(request: ApiSwapQuoteRequest): Promise<ApiSwapQuoteResponse> {
	assertBrowser('apiGetSwapQuote');
	return fetchJson<ApiSwapQuoteResponse>(apiUrl('/v1/swap/quote'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request)
	});
}

/**
 * Fetch ready-to-send swap calldata from the API.
 */
export async function apiGetSwapCalldata(
	request: ApiSwapCalldataRequest
): Promise<ApiSwapCalldataResponse> {
	assertBrowser('apiGetSwapCalldata');
	return fetchJson<ApiSwapCalldataResponse>(apiUrl('/v1/swap/calldata'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request)
	});
}

/**
 * Fetch trades by owner address from the REST API
 */
export async function apiGetTradesByAddress(
	address: string,
	options?: { page?: number; pageSize?: number; startTime?: number; endTime?: number }
): Promise<ApiTradesByAddressResponse> {
	assertBrowser('apiGetTradesByAddress');
	const url = apiUrl(`/v1/trades/${address}`, {
		page: options?.page,
		pageSize: options?.pageSize,
		startTime: options?.startTime,
		endTime: options?.endTime
	});
	return fetchJson<ApiTradesByAddressResponse>(url);
}

/**
 * Fetch trades where the user was the taker.
 */
export async function apiGetTakerTrades(
	address: string,
	options?: { page?: number; pageSize?: number }
): Promise<ApiTradesByAddressResponse> {
	assertBrowser('apiGetTakerTrades');
	const url = apiUrl(`/v1/trades/taker/${address}`, {
		page: options?.page,
		pageSize: options?.pageSize
	});
	return fetchJson<ApiTradesByAddressResponse>(url);
}

/**
 * Fetch orders by owner address from the REST API
 */
export async function apiGetOrdersByOwner(
	ownerAddress: string,
	options?: { page?: number; pageSize?: number }
): Promise<ApiOrdersListResponse> {
	assertBrowser('apiGetOrdersByOwner');
	const url = apiUrl(`/v1/orders/owner/${ownerAddress}`, {
		page: options?.page,
		pageSize: options?.pageSize
	});
	return fetchJson<ApiOrdersListResponse>(url);
}

/**
 * Fetch trades for multiple orders in a single query request.
 * Used to compute filled amounts for a user's deployed orders.
 */
export async function apiGetTradesBatch(orderHashes: string[]): Promise<ApiTradesBatchResponse> {
	assertBrowser('apiGetTradesBatch');
	return fetchJson<ApiTradesBatchResponse>(apiUrl('/v1/trades/query'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ orderHashes })
	});
}

/**
 * Fetch trades by token address from the REST API
 */
export async function apiGetTradesByToken(
	tokenAddress: string,
	page: number = 1,
	pageSize: number = 200,
	startTime?: number,
	endTime?: number
): Promise<ApiTradesByAddressResponse> {
	assertBrowser('apiGetTradesByToken');
	const params = new URLSearchParams({
		page: String(page),
		pageSize: String(pageSize)
	});
	if (startTime !== undefined) params.set('startTime', String(startTime));
	if (endTime !== undefined) params.set('endTime', String(endTime));
	return fetchJson<ApiTradesByAddressResponse>(
		`/api/st0x/v1/trades/token/${tokenAddress}?${params}`
	);
}
