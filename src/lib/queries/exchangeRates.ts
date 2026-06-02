/**
 * Wrap-ratio (exchange-rate) data source.
 *
 * Reads from a hardcoded JSON fixture (`$lib/config/wrapRatioFixture.json`)
 * instead of an upstream API. The /v1/tokens/exchange-rates(/history)
 * endpoint isn't live yet; when it ships, swap the loader implementations
 * and the rest of the UI (chip, denom toggle, Ratio History tab) keeps
 * working unchanged because the shapes match the planned API contract.
 *
 * Only wtSGOV has a non-1:1 rate today (1.002700626096609112 — verified
 * on Base via `cast call wtSGOV.convertToAssets(1e18)` at block 46604184).
 * Every other wrapper implicitly resolves to 1.0 via the safe default in
 * `resolveRatio`.
 */
import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import fixture from '$lib/config/wrapRatioFixture.json';

// ============================================================================
// Types — kept identical in shape to what the API contract will return.
// ============================================================================

export interface TokenRef {
	address: string;
	symbol: string;
	decimals: number;
}

export interface ExchangeRate {
	share: TokenRef;
	asset: TokenRef;
	assetsPerShare: string; // decimal string — e.g. "1.0", "1.002700626096609112"
	blockNumber: number;
	blockTimestamp: number;
	capturedAt: string; // "YYYY-MM-DD HH:MM:SS"
}

export type ExchangeRateEventType = 'snapshot' | 'donation';

export interface ExchangeRateEventBase {
	type: ExchangeRateEventType;
	blockNumber: number;
	blockTimestamp: number;
}

export interface ExchangeRateSnapshot extends ExchangeRateEventBase {
	type: 'snapshot';
	assetsPerShare: string;
	capturedAt: string;
}

export interface ExchangeRateDonation extends ExchangeRateEventBase {
	type: 'donation';
	txHash: string;
	donor: string;
	assetAmount: string;
	newAssetsPerShare: string | null;
}

export type ExchangeRateEvent = ExchangeRateSnapshot | ExchangeRateDonation;

export interface ExchangeRateHistoryResponse {
	share: TokenRef;
	asset: TokenRef;
	events: ExchangeRateEvent[];
	pagination: {
		page: number;
		pageSize: number;
		totalEvents: number;
		totalPages: number;
		hasMore: boolean;
	};
}

export interface ExchangeRateLookup {
	/** All rates, indexed by lowercased share (wt*) address. */
	byShareAddress: Record<string, ExchangeRate>;
	/** All rates, indexed by lowercased asset (t*) address. */
	byAssetAddress: Record<string, ExchangeRate>;
	/** Raw list. */
	all: ExchangeRate[];
}

// ============================================================================
// Fixture loader
// ============================================================================

interface WrapRatioFixture {
	rates: ExchangeRate[];
	history: Record<string, Omit<ExchangeRateHistoryResponse, 'pagination'>>;
}

const FIXTURE = fixture as unknown as WrapRatioFixture;

function buildLookup(rates: ExchangeRate[]): ExchangeRateLookup {
	const byShareAddress: Record<string, ExchangeRate> = {};
	const byAssetAddress: Record<string, ExchangeRate> = {};
	for (const rate of rates) {
		const share = rate.share.address?.toLowerCase();
		const asset = rate.asset.address?.toLowerCase();
		if (share) byShareAddress[share] = rate;
		if (asset) byAssetAddress[asset] = rate;
	}
	return { byShareAddress, byAssetAddress, all: rates };
}

const LOOKUP: ExchangeRateLookup = buildLookup(FIXTURE.rates);

/**
 * Returns the wrap ratio (number of underlying t* per 1 wt*) for a given
 * token address — accepts either the share (wt*) or asset (t*) address.
 * Returns 1 when the lookup is missing the entry (safe default — parity
 * wrappers stay 1:1).
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

/**
 * TanStack-shaped query so existing consumers (`$exchangeRatesQuery.data`)
 * keep working when the live API replaces the fixture. The queryFn is
 * synchronous-with-Promise-wrap — there's no network call.
 */
export function createExchangeRatesQuery() {
	return createQuery<ExchangeRateLookup>({
		queryKey: ['exchangeRates'],
		enabled: browser,
		staleTime: Infinity,
		queryFn: async () => LOOKUP
	});
}

export function createExchangeRateHistoryQuery(
	wrappedTokenAddress: string | null | undefined,
	options?: { page?: number; pageSize?: number }
) {
	return createQuery<ExchangeRateHistoryResponse>({
		queryKey: [
			'exchangeRateHistory',
			wrappedTokenAddress?.toLowerCase() ?? null,
			options?.page ?? 1,
			options?.pageSize ?? 50
		],
		enabled: browser && Boolean(wrappedTokenAddress),
		staleTime: Infinity,
		queryFn: async () => {
			if (!wrappedTokenAddress) {
				throw new Error('wrappedTokenAddress is required');
			}
			const entry = FIXTURE.history[wrappedTokenAddress.toLowerCase()];
			if (!entry) {
				return {
					share: { address: wrappedTokenAddress, symbol: '', decimals: 18 },
					asset: { address: '', symbol: '', decimals: 18 },
					events: [],
					pagination: {
						page: 1,
						pageSize: options?.pageSize ?? 50,
						totalEvents: 0,
						totalPages: 0,
						hasMore: false
					}
				};
			}
			return {
				...entry,
				pagination: {
					page: 1,
					pageSize: options?.pageSize ?? 50,
					totalEvents: entry.events.length,
					totalPages: 1,
					hasMore: false
				}
			};
		}
	});
}
