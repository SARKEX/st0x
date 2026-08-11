/**
 * Wrap-ratio (exchange-rate) data source.
 *
 * The REST API returns wrap-ratio rows with share/asset addresses. The website
 * composes display metadata from /v2/tokens so existing UI surfaces can keep
 * working with token refs instead of doing local chain/indexer reads.
 */
import { browser } from '$app/environment';
import {
	apiGetTokens,
	apiGetWrapRatioHistory,
	apiGetWrapRatios,
	type ApiWrapRatio,
	type ApiWrapRatioHistoryResponse,
	type ApiWrapRatiosResponse
} from '$lib/api/st0xApi';
import type { CategorizedToken } from '$lib/config/tokens';
import { findApiTokenByAnyAddress, normalizeApiTokensForNetwork } from '$lib/queries/tokens';
import { createQuery } from '@tanstack/svelte-query';

export interface TokenRef {
	address: string;
	symbol: string;
	decimals: number;
}

export interface ExchangeRate {
	share: TokenRef;
	asset: TokenRef;
	assetsPerShare: string;
	blockNumber: number;
	blockTimestamp: number;
	capturedAt: string;
}

export interface ExchangeRateSnapshot {
	type: 'snapshot';
	blockNumber: number;
	blockTimestamp: number;
	assetsPerShare: string;
	capturedAt: string;
}

export type ExchangeRateEvent = ExchangeRateSnapshot;

export interface ExchangeRateHistoryResponse {
	share: TokenRef;
	asset: TokenRef;
	events: ExchangeRateEvent[];
	pagination: ApiWrapRatioHistoryResponse['pagination'];
}

export interface ExchangeRateLookup {
	/** All rates, indexed by lowercased share (wt*) address. */
	byShareAddress: Record<string, ExchangeRate>;
	/** All rates, indexed by lowercased asset (t*) address. */
	byAssetAddress: Record<string, ExchangeRate>;
	/** Raw list. */
	all: ExchangeRate[];
}

function toKey(address: string | null | undefined): string {
	return address?.toLowerCase() ?? '';
}

function tokenToRef(token: CategorizedToken | null | undefined, fallbackAddress: string): TokenRef {
	return {
		address: token?.address ?? fallbackAddress,
		symbol: token?.symbol ?? '',
		decimals: token?.decimals ?? 18
	};
}

function unwrapSymbol(symbol: string): string {
	if (!symbol) return '';
	return symbol.startsWith('wt') ? `t${symbol.slice(2)}` : symbol.replace(/^w/, '');
}

function exactTokenByAddress(tokens: CategorizedToken[], address: string): CategorizedToken | null {
	const key = toKey(address);
	return tokens.find((token) => toKey(token.address) === key) ?? null;
}

function buildTokenRefs(
	tokens: CategorizedToken[],
	shareAddress: string,
	assetAddress: string
): { share: TokenRef; asset: TokenRef } {
	const shareToken =
		exactTokenByAddress(tokens, shareAddress) ?? findApiTokenByAnyAddress(tokens, shareAddress);
	const exactAssetToken = exactTokenByAddress(tokens, assetAddress);
	const share = tokenToRef(shareToken, shareAddress);
	const asset = exactAssetToken
		? tokenToRef(exactAssetToken, assetAddress)
		: {
				address: assetAddress,
				symbol: unwrapSymbol(share.symbol),
				decimals: share.decimals
			};
	return { share, asset };
}

export function buildLookup(rates: ExchangeRate[]): ExchangeRateLookup {
	const byShareAddress: Record<string, ExchangeRate> = {};
	const byAssetAddress: Record<string, ExchangeRate> = {};
	for (const rate of rates) {
		const share = toKey(rate.share.address);
		const asset = toKey(rate.asset.address);
		if (share) byShareAddress[share] = rate;
		if (asset) byAssetAddress[asset] = rate;
	}
	return { byShareAddress, byAssetAddress, all: rates };
}

export function mapApiWrapRatio(row: ApiWrapRatio, tokens: CategorizedToken[]): ExchangeRate {
	const { share, asset } = buildTokenRefs(tokens, row.shareAddress, row.assetAddress);
	return {
		share,
		asset,
		assetsPerShare: row.assetsPerShare,
		blockNumber: row.blockNumber,
		blockTimestamp: row.blockTimestamp,
		capturedAt: row.capturedAt
	};
}

export function mapApiWrapRatioHistory(
	response: ApiWrapRatioHistoryResponse,
	tokens: CategorizedToken[]
): ExchangeRateHistoryResponse {
	const { share, asset } = buildTokenRefs(tokens, response.shareAddress, response.assetAddress);
	return {
		share,
		asset,
		events: response.events.map((event) => ({
			type: 'snapshot',
			blockNumber: event.blockNumber,
			blockTimestamp: event.blockTimestamp,
			assetsPerShare: event.assetsPerShare,
			capturedAt: event.capturedAt
		})),
		pagination: response.pagination
	};
}

/**
 * Returns the wrap ratio (number of underlying t* per 1 wt*) for a given
 * token address — accepts either the share (wt*) or asset (t*) address.
 * Returns 1 when the lookup is missing the entry.
 */
export function resolveRatio(
	lookup: ExchangeRateLookup | null | undefined,
	address: string | null | undefined
): number {
	if (!lookup || !address) return 1;
	const key = address.toLowerCase();
	const entry = lookup.byShareAddress[key] ?? lookup.byAssetAddress[key];
	if (!entry) return 1;
	const parsed = Number(entry.assetsPerShare);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function warnWrapRatioErrors(response: ApiWrapRatiosResponse): void {
	if (response.errors?.length) {
		console.warn('[wrap-ratio] REST API returned partial errors', response.errors);
	}
}

export function createExchangeRatesQuery(chainId: number | null | undefined) {
	return createQuery<ExchangeRateLookup>({
		queryKey: ['exchangeRates', chainId],
		enabled: browser && Boolean(chainId),
		staleTime: 60_000,
		refetchOnWindowFocus: true,
		queryFn: async () => {
			if (!chainId) throw new Error('chainId is required');
			const [apiTokens, wrapRatios] = await Promise.all([
				apiGetTokens(chainId),
				apiGetWrapRatios(chainId)
			]);
			warnWrapRatioErrors(wrapRatios);
			const tokens = normalizeApiTokensForNetwork(apiTokens, chainId);
			return buildLookup(wrapRatios.data.map((row) => mapApiWrapRatio(row, tokens)));
		}
	});
}

export function createExchangeRateHistoryQuery(
	wrappedTokenAddress: string | null | undefined,
	chainId: number | null | undefined,
	options?: { page?: number; pageSize?: number }
) {
	return createQuery<ExchangeRateHistoryResponse>({
		queryKey: [
			'exchangeRateHistory',
			chainId,
			wrappedTokenAddress?.toLowerCase() ?? null,
			options?.page ?? 1,
			options?.pageSize ?? 50
		],
		enabled: browser && Boolean(wrappedTokenAddress && chainId),
		staleTime: 60_000,
		retry: false,
		queryFn: async () => {
			if (!wrappedTokenAddress || !chainId) {
				throw new Error('wrappedTokenAddress and chainId are required');
			}
			const [apiTokens, history] = await Promise.all([
				apiGetTokens(chainId),
				apiGetWrapRatioHistory(wrappedTokenAddress, chainId, options)
			]);
			const tokens = normalizeApiTokensForNetwork(apiTokens, chainId);
			return mapApiWrapRatioHistory(history, tokens);
		}
	});
}
