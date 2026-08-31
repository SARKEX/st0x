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

export interface ApiTradesTokensQueryRequest {
	tokenAddresses: string[];
	chainId: number;
	startTime: number;
	endTime: number;
	page?: number;
	pageSize?: number;
	denomination?: 'wrapped' | 'unwrapped';
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
