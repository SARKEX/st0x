/**
 * st0x REST API Client
 *
 * Typed client for the st0x REST API, replacing direct Raindex SDK and subgraph queries.
 * All requests go through the /api/st0x proxy route which handles authentication.
 */

import { browser } from '$app/environment';
import { fetchJson } from '$lib/clients/http';
import type { MetaV1S } from '$lib/types/OffchainAssetReceiptVault';

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

export type ApiSwapCalldataMode = 'buyUpTo' | 'spendExact' | 'spendUpTo';

export interface ApiSwapV2RequestCommon {
	inputToken: string;
	outputToken: string;
	mode: ApiSwapCalldataMode;
	amount: string;
	denomination?: 'wrapped' | 'unwrapped';
}

type ApiSwapV2PriceLimit =
	| { priceCap: string; slippageBps?: never; referenceIoRatio?: never }
	| { priceCap?: never; slippageBps: number; referenceIoRatio?: string };

export type ApiSwapQuoteV2Request = ApiSwapV2RequestCommon &
	ApiSwapV2PriceLimit & {
		taker?: string;
	};

export interface ApiSwapQuoteV2Response extends ApiSwapV2RequestCommon {
	estimatedInput: string;
	estimatedOutput: string;
	estimatedIoRatio: string;
	fullyFilled: boolean;
	resolvedPriceCap: string;
}

export type ApiSwapCalldataV2Request = ApiSwapV2RequestCommon &
	ApiSwapV2PriceLimit & {
		taker: string;
	};

export interface ApiSwapCalldataV2Response extends ApiSwapCalldataResponse {
	denomination: 'wrapped' | 'unwrapped';
	resolvedPriceCap: string;
}

// ============================================================================
// Order Types
// ============================================================================

export interface ApiOrderSummary {
	orderHash: string;
	owner: string;
	chainId: number;
	orderBytes: string;
	inputToken: ApiTokenRef;
	outputToken: ApiTokenRef;
	outputVaultBalance: string;
	maxOutput?: string | null;
	ioRatio: string;
	orderType: 'limit' | 'dca' | 'dynamic-spread' | 'custom';
	active: boolean;
	removedAt?: number | null;
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

export interface ApiTradeByTxEntry {
	orderHash: string;
	orderOwner: string;
	request: {
		inputToken: string;
		outputToken: string;
		maximumInput: string;
		maximumIoRatio: string;
	};
	result: {
		inputAmount: string;
		outputAmount: string;
		actualIoRatio: string;
	};
}

export interface ApiTradesByTxResponse {
	txHash: string;
	blockNumber: number;
	timestamp: number;
	sender: string;
	trades: ApiTradeByTxEntry[];
	totals: {
		totalInputAmount: string;
		totalOutputAmount: string;
		averageIoRatio: string;
	};
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
// Token Proof Types
// ============================================================================

export interface ApiTokenProofSchema {
	id: string;
	information: string;
	timestamp: number;
}

export interface ApiTokenProofReceipt {
	id: string;
	receiptId: string;
	txHash: string;
	type: 'deposit' | 'withdraw';
	information: string;
	timestamp: number;
}

export interface ApiTokenProofsResponse {
	address: string;
	metadata: MetaV1S[];
	schemas: ApiTokenProofSchema[];
	receipts: ApiTokenProofReceipt[];
}

// ============================================================================
// Token Detail Types
// ============================================================================

export interface ApiTokenDetailsError {
	address: string;
	message: string;
}

export interface ApiTokenDetailsSummary {
	address: string;
	deployTimestamp?: number;
	receiptContractAddress?: string | null;
	name: string;
	symbol: string;
	decimals: number;
	totalSupply: string;
	holderCount: number;
	transferCount: number;
	bridgedSupply: string;
	depositVolume: string;
	withdrawVolume: string;
	activityVolume: string;
}

export interface ApiTokenDetailsActivityRow {
	id: string;
	txHash: string;
	caller: string;
	amount: string;
	timestamp: number;
	receiptId: string;
}

export interface ApiTokenDetails extends ApiTokenDetailsSummary {
	sftVaultAddress: string;
	deployTimestamp: number;
	deployer: string;
	admin: string;
	activity: {
		deposits: ApiTokenDetailsActivityRow[];
		withdraws: ApiTokenDetailsActivityRow[];
	};
}

export interface ApiTokenDetailsListResponse {
	data: ApiTokenDetailsSummary[];
	errors: ApiTokenDetailsError[];
}

// ============================================================================
// Wrap Ratio Types
// ============================================================================

export interface ApiWrapRatio {
	shareAddress: string;
	assetAddress: string;
	assetsPerShare: string;
	blockNumber: number;
	blockTimestamp: number;
	capturedAt: string;
}

export interface ApiWrapRatioError {
	shareAddress: string;
	message: string;
}

export interface ApiWrapRatiosResponse {
	data: ApiWrapRatio[];
	errors: ApiWrapRatioError[];
}

export interface ApiWrapRatioHistoryEvent {
	type: 'snapshot';
	blockNumber: number;
	blockTimestamp: number;
	assetsPerShare: string;
	capturedAt: string;
}

export interface ApiWrapRatioHistoryResponse {
	shareAddress: string;
	assetAddress: string;
	events: ApiWrapRatioHistoryEvent[];
	pagination: {
		page: number;
		pageSize: number;
		totalEvents: number;
		totalPages: number;
		hasMore: boolean;
	};
}

// ============================================================================
// Market Price Types
// ============================================================================

export type ApiMarketPriceSource = 'live' | 'cached' | 'historical' | 'unavailable';

export interface ApiMarketPrice {
	chainId: number;
	assetAddress: string;
	symbol: string;
	quoteAddress: string;
	bestBid: string | null;
	bestAsk: string | null;
	midpoint: string | null;
	source: ApiMarketPriceSource;
	observedAt: number | null;
	change24hPercent: string | null;
}

export interface ApiMarketPricesResponse {
	data: ApiMarketPrice[];
}

export interface ApiMarketPriceHistoryPoint {
	bestBid: string;
	bestAsk: string;
	midpoint: string;
	observedAt: number;
}

export interface ApiMarketPriceHistoryResponse {
	chainId: number;
	assetAddress: string;
	symbol: string;
	quoteAddress: string;
	startTime: number;
	endTime: number;
	interval: number;
	points: ApiMarketPriceHistoryPoint[];
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
	options?: {
		page?: number;
		pageSize?: number;
		side?: 'input' | 'output';
		state?: 'active' | 'inactive' | 'all';
	}
): Promise<ApiOrdersListResponse> {
	assertBrowser('apiGetOrdersByToken');
	const url = apiUrl(`/v1/orders/token/${tokenAddress}`, {
		page: options?.page,
		pageSize: options?.pageSize,
		side: options?.side,
		state: options?.state
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
 * Fetch raw proof/attestation metadata for a tokenized asset.
 */
export async function apiGetTokenProofs(address: string): Promise<ApiTokenProofsResponse> {
	assertBrowser('apiGetTokenProofs');
	return fetchJson<ApiTokenProofsResponse>(apiUrl(`/v1/tokens/${address}/proofs`));
}

/**
 * Fetch ST0x token detail summaries from the REST API.
 */
export async function apiGetTokenDetails(): Promise<ApiTokenDetailsListResponse> {
	assertBrowser('apiGetTokenDetails');
	return fetchJson<ApiTokenDetailsListResponse>(apiUrl('/v1/tokens/details'));
}

/**
 * Fetch ST0x token details and recent activity for a single token.
 */
export async function apiGetTokenDetailsByAddress(
	address: string,
	options?: { activityLimit?: number }
): Promise<ApiTokenDetails> {
	assertBrowser('apiGetTokenDetailsByAddress');
	return fetchJson<ApiTokenDetails>(
		apiUrl(`/v1/tokens/${address}/details`, {
			activityLimit: options?.activityLimit
		})
	);
}

/**
 * Fetch current wrap ratios for supported wrapped tokens.
 */
export async function apiGetWrapRatios(): Promise<ApiWrapRatiosResponse> {
	assertBrowser('apiGetWrapRatios');
	return fetchJson<ApiWrapRatiosResponse>(apiUrl('/v1/tokens/wrap-ratio'));
}

/**
 * Fetch current wrap ratio for a single wrapped token.
 */
export async function apiGetWrapRatio(wrappedTokenAddress: string): Promise<ApiWrapRatio> {
	assertBrowser('apiGetWrapRatio');
	return fetchJson<ApiWrapRatio>(apiUrl(`/v1/tokens/wrap-ratio/${wrappedTokenAddress}`));
}

/**
 * Fetch snapshot history for a wrapped token's wrap ratio.
 */
export async function apiGetWrapRatioHistory(
	wrappedTokenAddress: string,
	options?: { page?: number; pageSize?: number }
): Promise<ApiWrapRatioHistoryResponse> {
	assertBrowser('apiGetWrapRatioHistory');
	return fetchJson<ApiWrapRatioHistoryResponse>(
		apiUrl(`/v1/tokens/wrap-ratio/${wrappedTokenAddress}/history`, {
			page: options?.page,
			pageSize: options?.pageSize
		})
	);
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
 * Fetch a mode-based swap quote from the same API simulation used to resolve
 * v2 calldata. This is the authoritative market-order display quote.
 */
export async function apiGetSwapQuoteV2(
	request: ApiSwapQuoteV2Request
): Promise<ApiSwapQuoteV2Response> {
	assertBrowser('apiGetSwapQuoteV2');
	return fetchJson<ApiSwapQuoteV2Response>(apiUrl('/v2/swap/quote'), {
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
 * Fetch ready-to-send v2 swap calldata. The API resolves optional slippage
 * through SDK quotes and returns the fixed cap to reuse after approvals.
 */
export async function apiGetSwapCalldataV2(
	request: ApiSwapCalldataV2Request
): Promise<ApiSwapCalldataV2Response> {
	assertBrowser('apiGetSwapCalldataV2');
	return fetchJson<ApiSwapCalldataV2Response>(apiUrl('/v2/swap/calldata'), {
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

/** Fetch the indexed trade totals for one confirmed transaction. */
export async function apiGetTradesByTx(txHash: string): Promise<ApiTradesByTxResponse> {
	assertBrowser('apiGetTradesByTx');
	return fetchJson<ApiTradesByTxResponse>(apiUrl(`/v1/trades/tx/${txHash}`), { retries: 0 });
}

/**
 * Fetch orders by owner address from the REST API
 */
export async function apiGetOrdersByOwner(
	ownerAddress: string,
	options?: { page?: number; pageSize?: number; state?: 'active' | 'inactive' | 'all' }
): Promise<ApiOrdersListResponse> {
	assertBrowser('apiGetOrdersByOwner');
	const url = apiUrl(`/v1/orders/owner/${ownerAddress}`, {
		page: options?.page,
		pageSize: options?.pageSize,
		state: options?.state
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
