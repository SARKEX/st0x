import {
	PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS,
	type PublicTradeActivitySnapshot
} from '$lib/server/publicTradeActivity';
import { networks } from '$lib/config/network';
import { getAllTokensByNetwork } from '$lib/config/tokens';
import {
	cacheCooldownRemainingMs,
	cacheGet,
	cacheSet,
	cacheSetCooldown,
	CACHE_KEYS,
	CACHE_TTL,
	withCache
} from '$lib/server/cache';
import { St0xTradesRateLimitError } from '$lib/server/st0xTradesFetcher';

const STALE_TTL_SECONDS = CACHE_TTL.VERY_LONG;
const STALE_RETRY_SECONDS = 60;
const DISTRIBUTED_LOCK_TTL_MS = PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS + 30_000;
const DISTRIBUTED_WAIT_TIMEOUT_MS = PUBLIC_TRADE_ACTIVITY_REFRESH_TIMEOUT_MS + 5_000;
const staleCacheKey = () => `${CACHE_KEYS.publicTradeActivity()}:stale`;
const rateLimitCacheKey = () => `${CACHE_KEYS.publicTradeActivity()}:rate-limit`;
const failureCacheKey = () => `${CACHE_KEYS.publicTradeActivity()}:failure`;

interface MemoryEntry {
	value: PublicTradeActivitySnapshot;
	reuseUntil: number;
	staleUntil: number;
}

let memoryEntry: MemoryEntry | null = null;
let failureCooldown: { error: unknown; retryUntil: number } | null = null;

function numbersMatch(left: number, right: number): boolean {
	const tolerance = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 16;
	return Math.abs(left - right) <= tolerance;
}

function isCompleteSnapshot(value: unknown): value is PublicTradeActivitySnapshot {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const snapshot = value as Partial<PublicTradeActivitySnapshot>;
	if (
		snapshot.success !== true ||
		typeof snapshot.range?.from !== 'number' ||
		!Number.isFinite(snapshot.range.from) ||
		typeof snapshot.range.to !== 'number' ||
		!Number.isFinite(snapshot.range.to) ||
		snapshot.range.from > snapshot.range.to ||
		typeof snapshot.totals?.tradingVolume !== 'number' ||
		!Number.isFinite(snapshot.totals.tradingVolume) ||
		snapshot.totals.tradingVolume < 0 ||
		typeof snapshot.totals.totalTrades !== 'number' ||
		!Number.isSafeInteger(snapshot.totals.totalTrades) ||
		snapshot.totals.totalTrades < 0 ||
		!Array.isArray(snapshot.networks) ||
		snapshot.networks.length !== networks.length
	) {
		return false;
	}

	const expectedNetworks = new Map(networks.map((network) => [network.id, network.chainId]));
	const seenNetworks = new Set<number>();
	let summedTradingVolume = 0;
	let summedTotalTrades = 0;
	for (const entry of snapshot.networks) {
		const expectedChainId = expectedNetworks.get(entry.networkId);
		if (
			!Number.isSafeInteger(entry.networkId) ||
			expectedChainId !== entry.chainId ||
			seenNetworks.has(entry.networkId) ||
			!Number.isFinite(entry.tradingVolume) ||
			entry.tradingVolume < 0 ||
			!Number.isSafeInteger(entry.totalTrades) ||
			entry.totalTrades < 0 ||
			!Array.isArray(entry.tokens)
		) {
			return false;
		}
		seenNetworks.add(entry.networkId);
		summedTradingVolume += entry.tradingVolume;
		summedTotalTrades += entry.totalTrades;
		const expectedTokenAddresses = new Set(
			getAllTokensByNetwork(expectedChainId).map((token) => token.address.toLowerCase())
		);
		const seenTokenAddresses = new Set<string>();
		for (const token of entry.tokens) {
			if (
				!/^0x[0-9a-f]{40}$/.test(token.address) ||
				!expectedTokenAddresses.has(token.address) ||
				seenTokenAddresses.has(token.address) ||
				!Number.isFinite(token.inVolume) ||
				token.inVolume < 0 ||
				!Number.isFinite(token.outVolume) ||
				token.outVolume < 0 ||
				!Number.isFinite(token.totalVolume) ||
				token.totalVolume < 0 ||
				!Number.isFinite(token.quoteVolume) ||
				token.quoteVolume < 0 ||
				!Number.isSafeInteger(token.trades) ||
				token.trades < 0
			) {
				return false;
			}
			if (!numbersMatch(token.totalVolume, token.inVolume + token.outVolume)) return false;
			seenTokenAddresses.add(token.address);
		}
		if (seenTokenAddresses.size !== expectedTokenAddresses.size) return false;
	}
	return (
		seenNetworks.size === expectedNetworks.size &&
		numbersMatch(snapshot.totals.tradingVolume, summedTradingVolume) &&
		snapshot.totals.totalTrades === summedTotalTrades
	);
}

function retryDelayMs(error: unknown): number {
	if (error instanceof St0xTradesRateLimitError && error.retryAfterMs !== null) {
		return Math.max(1_000, error.retryAfterMs);
	}
	return STALE_RETRY_SECONDS * 1_000;
}

async function distributedRateLimitError(
	now = Date.now()
): Promise<St0xTradesRateLimitError | null> {
	const remainingMs = await cacheCooldownRemainingMs(rateLimitCacheKey(), now);
	return remainingMs === null ? null : new St0xTradesRateLimitError(remainingMs);
}

async function persistRateLimitCooldown(error: St0xTradesRateLimitError): Promise<void> {
	await cacheSetCooldown(rateLimitCacheKey(), retryDelayMs(error));
}

async function distributedFailureError(now = Date.now()): Promise<Error | null> {
	const remainingMs = await cacheCooldownRemainingMs(failureCacheKey(), now);
	return remainingMs === null
		? null
		: new Error('Public trade activity refresh is cooling down after a failed attempt');
}

async function retainedSnapshot(
	error: unknown,
	failedAt: number
): Promise<PublicTradeActivitySnapshot | null> {
	if (memoryEntry && memoryEntry.staleUntil > failedAt) {
		return retainForRetry(memoryEntry.value, failedAt, memoryEntry.staleUntil, error);
	}
	memoryEntry = null;
	const retained = await cacheGet<PublicTradeActivitySnapshot>(staleCacheKey());
	if (!isCompleteSnapshot(retained)) return null;
	const staleUntil = snapshotExpiresAt(retained, STALE_TTL_SECONDS);
	return staleUntil > failedAt ? retainForRetry(retained, failedAt, staleUntil, error) : null;
}

function snapshotExpiresAt(snapshot: PublicTradeActivitySnapshot, ttlSeconds: number): number {
	return snapshot.range.to * 1_000 + ttlSeconds * 1_000;
}

function snapshotTtlSeconds(snapshot: PublicTradeActivitySnapshot, ttlSeconds: number): number {
	return Math.floor((snapshotExpiresAt(snapshot, ttlSeconds) - Date.now()) / 1_000);
}

function retainForRetry(
	value: PublicTradeActivitySnapshot,
	now: number,
	staleUntil: number,
	error: unknown
): PublicTradeActivitySnapshot {
	memoryEntry = {
		value,
		reuseUntil: Math.min(now + retryDelayMs(error), staleUntil),
		staleUntil
	};
	return value;
}

export function publicTradeActivityCacheControl(
	snapshot: PublicTradeActivitySnapshot,
	epochSeconds = Math.floor(Date.now() / 1_000)
): string {
	const age = Math.max(0, epochSeconds - snapshot.range.to);
	const staleRemaining = STALE_TTL_SECONDS - age;
	if (staleRemaining <= 0) return 'no-store';

	const freshRemaining = CACHE_TTL.LONG - age;
	if (freshRemaining > 0) {
		const sharedTtl = Math.max(1, Math.floor(freshRemaining));
		const staleWhileRevalidate = Math.max(0, Math.floor(staleRemaining) - sharedTtl);
		return `public, s-maxage=${sharedTtl}, stale-while-revalidate=${staleWhileRevalidate}`;
	}

	const retryTtl = Math.max(1, Math.min(STALE_RETRY_SECONDS, Math.floor(staleRemaining)));
	return `public, s-maxage=${retryTtl}, must-revalidate`;
}

/**
 * Return a fresh cached activity snapshot, or the last complete retained
 * snapshot when a refresh fails. Failed and partial computations are never
 * written as fresh or stale cache entries.
 */
export async function getCachedPublicTradeActivity(
	compute: () => Promise<PublicTradeActivitySnapshot>
): Promise<PublicTradeActivitySnapshot> {
	const now = Date.now();
	if (failureCooldown && failureCooldown.retryUntil > now) {
		throw failureCooldown.error;
	}
	failureCooldown = null;
	if (memoryEntry && memoryEntry.reuseUntil > now) {
		return memoryEntry.value;
	}
	const distributedCooldown =
		(await distributedRateLimitError(now)) ?? (await distributedFailureError(now));
	if (distributedCooldown) {
		const retained = await retainedSnapshot(distributedCooldown, now);
		if (retained) return retained;
		failureCooldown = {
			error: distributedCooldown,
			retryUntil: now + retryDelayMs(distributedCooldown)
		};
		throw distributedCooldown;
	}

	try {
		const value = await withCache(
			CACHE_KEYS.publicTradeActivity(),
			async () => {
				const activeCooldown =
					(await distributedRateLimitError()) ?? (await distributedFailureError());
				if (activeCooldown) throw activeCooldown;
				try {
					return await compute();
				} catch (error) {
					if (error instanceof St0xTradesRateLimitError) {
						await persistRateLimitCooldown(error);
					} else {
						await cacheSetCooldown(failureCacheKey(), STALE_RETRY_SECONDS * 1_000);
					}
					throw error;
				}
			},
			(snapshot) => snapshotTtlSeconds(snapshot, CACHE_TTL.LONG),
			isCompleteSnapshot,
			{
				lockTtlMs: DISTRIBUTED_LOCK_TTL_MS,
				waitTimeoutMs: DISTRIBUTED_WAIT_TIMEOUT_MS,
				pollMs: 250
			}
		);
		if (!isCompleteSnapshot(value)) {
			throw new Error('Public trade activity computation did not return a complete snapshot');
		}
		const staleUntil = snapshotExpiresAt(value, STALE_TTL_SECONDS);
		const retainedTtl = snapshotTtlSeconds(value, STALE_TTL_SECONDS);
		memoryEntry = {
			value,
			reuseUntil: snapshotExpiresAt(value, CACHE_TTL.LONG),
			staleUntil
		};
		if (retainedTtl > 0) {
			await cacheSet(staleCacheKey(), value, retainedTtl);
		}
		failureCooldown = null;
		return value;
	} catch (error) {
		const failedAt = Date.now();
		const retained = await retainedSnapshot(error, failedAt);
		if (retained) return retained;
		failureCooldown = {
			error,
			retryUntil: failedAt + retryDelayMs(error)
		};
		throw error;
	}
}

export function clearPublicTradeActivityMemoryCache(): void {
	memoryEntry = null;
	failureCooldown = null;
}
