import {
	PUBLIC_PRICES_EDGE_STALE_SECONDS,
	PUBLIC_PRICES_FAILURE_RETRY_SECONDS,
	PUBLIC_PRICES_REFRESH_TIMEOUT_MS,
	PUBLIC_PRICES_RETAINED_SECONDS,
	PUBLIC_PRICES_TTL_SECONDS
} from '$lib/config/publicPrices';
import { networks } from '$lib/config/network';
import {
	cacheCooldownRemainingMs,
	cacheGet,
	cacheSet,
	cacheSetCooldown,
	CACHE_KEYS,
	withCache
} from '$lib/server/cache';
import { St0xMarketPricesRateLimitError } from '$lib/server/marketPrices';
import type { MidpointPrice } from '$lib/utils/midpointPrice';

export interface PublicPricesSnapshot {
	success: true;
	prices: Record<string, Record<string, MidpointPrice>>;
}

interface StoredPublicPrices {
	value: PublicPricesSnapshot;
	cachedAt: number;
}

export interface CachedPublicPrices {
	value: PublicPricesSnapshot;
	cachedAt: number;
	isStale: boolean;
	revalidateAt: number;
}

interface MemoryEntry extends StoredPublicPrices {
	reuseUntil: number;
	staleUntil: number;
}

let memoryEntry: MemoryEntry | null = null;
let failureCooldown: { error: unknown; retryUntil: number } | null = null;
const staleCacheKey = () => `${CACHE_KEYS.publicPrices()}:stale`;
const rateLimitCacheKey = () => `${CACHE_KEYS.publicPrices()}:rate-limit`;
const failureCacheKey = () => `${CACHE_KEYS.publicPrices()}:failure`;

function isPositiveFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isMidpointPrice(value: unknown): value is MidpointPrice {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const price = value as Partial<MidpointPrice>;
	if (price.source === 'unavailable') {
		return price.price === null && price.bid === null && price.ask === null && price.asOf === null;
	}
	if (price.source !== 'live' && price.source !== 'cached' && price.source !== 'historical') {
		return false;
	}
	if (
		!isPositiveFiniteNumber(price.price) ||
		!isPositiveFiniteNumber(price.bid) ||
		!isPositiveFiniteNumber(price.ask) ||
		!isPositiveFiniteNumber(price.asOf)
	) {
		return false;
	}
	const midpoint = (price.bid + price.ask) / 2;
	const tolerance = Number.EPSILON * Math.max(1, Math.abs(midpoint), Math.abs(price.price)) * 4;
	return Math.abs(price.price - midpoint) <= tolerance;
}

function isCompleteSnapshot(value: unknown): value is PublicPricesSnapshot {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const snapshot = value as Partial<PublicPricesSnapshot>;
	if (
		snapshot.success !== true ||
		!snapshot.prices ||
		typeof snapshot.prices !== 'object' ||
		Array.isArray(snapshot.prices)
	) {
		return false;
	}

	for (const network of networks) {
		const networkPrices = snapshot.prices[String(network.id)];
		if (!networkPrices || typeof networkPrices !== 'object' || Array.isArray(networkPrices)) {
			return false;
		}
		for (const price of Object.values(networkPrices)) {
			if (!isMidpointPrice(price)) return false;
		}
	}
	return true;
}

function isStoredPublicPrices(value: unknown): value is StoredPublicPrices {
	if (!value || typeof value !== 'object') return false;
	const stored = value as Partial<StoredPublicPrices>;
	return (
		typeof stored.cachedAt === 'number' &&
		Number.isFinite(stored.cachedAt) &&
		stored.cachedAt > 0 &&
		isCompleteSnapshot(stored.value)
	);
}

function staleUntil(stored: StoredPublicPrices): number {
	return stored.cachedAt + PUBLIC_PRICES_RETAINED_SECONDS * 1_000;
}

function asResult(entry: MemoryEntry, now: number): CachedPublicPrices {
	return {
		value: entry.value,
		cachedAt: entry.cachedAt,
		isStale: now >= entry.cachedAt + PUBLIC_PRICES_TTL_SECONDS * 1_000,
		revalidateAt: entry.reuseUntil
	};
}

function retryDelayMs(error: unknown): number {
	if (error instanceof St0xMarketPricesRateLimitError && error.retryAfterMs !== null) {
		return Math.max(1_000, error.retryAfterMs);
	}
	return PUBLIC_PRICES_FAILURE_RETRY_SECONDS * 1_000;
}

async function distributedRateLimitError(
	now = Date.now()
): Promise<St0xMarketPricesRateLimitError | null> {
	const remainingMs = await cacheCooldownRemainingMs(rateLimitCacheKey(), now);
	return remainingMs === null ? null : new St0xMarketPricesRateLimitError(remainingMs);
}

async function persistRateLimitCooldown(error: St0xMarketPricesRateLimitError): Promise<void> {
	await cacheSetCooldown(rateLimitCacheKey(), retryDelayMs(error));
}

async function distributedFailureError(now = Date.now()): Promise<Error | null> {
	const remainingMs = await cacheCooldownRemainingMs(failureCacheKey(), now);
	return remainingMs === null
		? null
		: new Error('Public price refresh is cooling down after a failed attempt');
}

function retainForRetry(
	stored: StoredPublicPrices,
	now: number,
	error: unknown
): CachedPublicPrices {
	const expiresAt = staleUntil(stored);
	memoryEntry = {
		...stored,
		reuseUntil: Math.min(now + retryDelayMs(error), expiresAt),
		staleUntil: expiresAt
	};
	return asResult(memoryEntry, now);
}

async function retainedPrices(
	error: unknown,
	failedAt: number
): Promise<CachedPublicPrices | null> {
	if (memoryEntry && memoryEntry.staleUntil > failedAt) {
		return retainForRetry(memoryEntry, failedAt, error);
	}

	memoryEntry = null;
	const retained = await cacheGet<StoredPublicPrices>(staleCacheKey());
	return isStoredPublicPrices(retained) && staleUntil(retained) > failedAt
		? retainForRetry(retained, failedAt, error)
		: null;
}

/**
 * Cache complete price snapshots for 90 seconds and retain the last complete
 * payload for six hours. A failed refresh never replaces either cache entry.
 */
export async function getCachedPublicPrices(
	compute: () => Promise<PublicPricesSnapshot>
): Promise<CachedPublicPrices> {
	const now = Date.now();
	if (failureCooldown && failureCooldown.retryUntil > now) {
		throw failureCooldown.error;
	}
	failureCooldown = null;
	if (memoryEntry && memoryEntry.reuseUntil > now) {
		return asResult(memoryEntry, now);
	}
	const distributedCooldown =
		(await distributedRateLimitError(now)) ?? (await distributedFailureError(now));
	if (distributedCooldown) {
		const retained = await retainedPrices(distributedCooldown, now);
		if (retained) return retained;
		failureCooldown = {
			error: distributedCooldown,
			retryUntil: now + retryDelayMs(distributedCooldown)
		};
		throw distributedCooldown;
	}

	try {
		const stored = await withCache(
			CACHE_KEYS.publicPrices(),
			async (): Promise<StoredPublicPrices> => {
				const activeCooldown =
					(await distributedRateLimitError()) ?? (await distributedFailureError());
				if (activeCooldown) throw activeCooldown;
				try {
					const value = await compute();
					if (!isCompleteSnapshot(value)) {
						throw new Error('Public price computation did not return a complete snapshot');
					}
					return { value, cachedAt: Date.now() };
				} catch (error) {
					if (error instanceof St0xMarketPricesRateLimitError) {
						await persistRateLimitCooldown(error);
					} else {
						await cacheSetCooldown(failureCacheKey(), PUBLIC_PRICES_FAILURE_RETRY_SECONDS * 1_000);
					}
					throw error;
				}
			},
			PUBLIC_PRICES_TTL_SECONDS,
			isStoredPublicPrices,
			{
				lockTtlMs: PUBLIC_PRICES_REFRESH_TIMEOUT_MS + 30_000,
				waitTimeoutMs: PUBLIC_PRICES_REFRESH_TIMEOUT_MS + 5_000,
				pollMs: 250
			}
		);
		if (!isStoredPublicPrices(stored)) {
			throw new Error('Public price cache contained an invalid snapshot');
		}

		const expiresAt = staleUntil(stored);
		const retainedTtl = Math.floor((expiresAt - Date.now()) / 1_000);
		memoryEntry = {
			...stored,
			reuseUntil: stored.cachedAt + PUBLIC_PRICES_TTL_SECONDS * 1_000,
			staleUntil: expiresAt
		};
		if (retainedTtl > 0) {
			await cacheSet(staleCacheKey(), stored, retainedTtl);
		}
		failureCooldown = null;
		return asResult(memoryEntry, Date.now());
	} catch (error) {
		const failedAt = Date.now();
		const retained = await retainedPrices(error, failedAt);
		if (retained) return retained;
		failureCooldown = {
			error,
			retryUntil: failedAt + retryDelayMs(error)
		};
		throw error;
	}
}

export function publicPricesCacheControl(cached: CachedPublicPrices, now = Date.now()): string {
	const ageSeconds = Math.max(0, Math.floor((now - cached.cachedAt) / 1_000));
	const retainedRemaining = PUBLIC_PRICES_RETAINED_SECONDS - ageSeconds;
	if (retainedRemaining <= 0) return 'no-store';

	const freshRemaining = PUBLIC_PRICES_TTL_SECONDS - ageSeconds;
	if (!cached.isStale && freshRemaining > 0) {
		const sharedTtl = Math.max(1, freshRemaining);
		const edgeRemaining = PUBLIC_PRICES_TTL_SECONDS + PUBLIC_PRICES_EDGE_STALE_SECONDS - ageSeconds;
		const staleWhileRevalidate = Math.max(
			0,
			Math.min(retainedRemaining, edgeRemaining) - sharedTtl
		);
		return `public, s-maxage=${sharedTtl}, stale-while-revalidate=${staleWhileRevalidate}`;
	}

	const retryRemaining = Math.max(1, Math.ceil((cached.revalidateAt - now) / 1_000));
	return `public, s-maxage=${Math.min(retryRemaining, retainedRemaining)}, must-revalidate`;
}

export function clearPublicPricesMemoryCache(): void {
	memoryEntry = null;
	failureCooldown = null;
}
