/**
 * TanStack queries for the st0x wrap-ratio (exchange-rate) API.
 *
 * Two endpoints:
 *  - GET /v1/tokens/exchange-rates                          → current rate for every wrapper
 *  - GET /v1/tokens/exchange-rates/history?token={wt_addr}  → event log (snapshots + donations)
 *
 * The current-rates query is used to render the wrap-ratio chip and to drive
 * the on-the-fly shares↔tokens conversion in tables. It's keyed by nothing
 * (all wrappers in one call) so it's a single cache entry the whole app shares.
 */
import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import {
	apiGetExchangeRates,
	apiGetExchangeRateHistory,
	type ApiExchangeRate,
	type ApiExchangeRateHistoryResponse
} from '$lib/api/st0xApi';

export interface ExchangeRateLookup {
	/** All rates from the API, indexed by lowercased share (wt*) address. */
	byShareAddress: Record<string, ApiExchangeRate>;
	/** All rates from the API, indexed by lowercased asset (t*) address. */
	byAssetAddress: Record<string, ApiExchangeRate>;
	/** Raw list, preserving API order. */
	all: ApiExchangeRate[];
}

function buildLookup(rates: ApiExchangeRate[]): ExchangeRateLookup {
	const byShareAddress: Record<string, ApiExchangeRate> = {};
	const byAssetAddress: Record<string, ApiExchangeRate> = {};
	for (const rate of rates) {
		const share = rate.share.address?.toLowerCase();
		const asset = rate.asset.address?.toLowerCase();
		if (share) byShareAddress[share] = rate;
		if (asset) byAssetAddress[asset] = rate;
	}
	return { byShareAddress, byAssetAddress, all: rates };
}

/**
 * Returns the wrap ratio (number of underlying t* per 1 wt*) for a given
 * token address — accepts either the share (wt*) or asset (t*) address.
 * Returns 1 when the lookup is missing the entry (safe default — pre-rebase
 * pages still render correctly as a 1:1 wrap).
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

export function createExchangeRatesQuery() {
	return createQuery<ExchangeRateLookup>({
		queryKey: ['exchangeRates'],
		enabled: browser,
		// API caches behind the proxy for 60s; refetch on focus is enough for
		// trade-page freshness without hammering the upstream.
		staleTime: 60_000,
		refetchOnWindowFocus: true,
		queryFn: async () => {
			const rates = await apiGetExchangeRates();
			return buildLookup(rates);
		}
	});
}

export function createExchangeRateHistoryQuery(
	wrappedTokenAddress: string | null | undefined,
	options?: { page?: number; pageSize?: number }
) {
	return createQuery<ApiExchangeRateHistoryResponse>({
		queryKey: [
			'exchangeRateHistory',
			wrappedTokenAddress?.toLowerCase() ?? null,
			options?.page ?? 1,
			options?.pageSize ?? 50
		],
		enabled: browser && Boolean(wrappedTokenAddress),
		staleTime: 60_000,
		queryFn: async () => {
			if (!wrappedTokenAddress) {
				throw new Error('wrappedTokenAddress is required');
			}
			return apiGetExchangeRateHistory(wrappedTokenAddress, options);
		}
	});
}
