import type { PublicTradeActivitySnapshot } from '$lib/server/publicTradeActivity';
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL, withCache } from '$lib/server/cache';

const STALE_TTL_SECONDS = CACHE_TTL.VERY_LONG;
const STALE_RETRY_SECONDS = 60;
const staleCacheKey = () => `${CACHE_KEYS.publicTradeActivity()}:stale`;

interface MemoryEntry {
	value: PublicTradeActivitySnapshot;
	reuseUntil: number;
	staleUntil: number;
}

let memoryEntry: MemoryEntry | null = null;

function snapshotExpiresAt(snapshot: PublicTradeActivitySnapshot, ttlSeconds: number): number {
	return snapshot.range.to * 1_000 + ttlSeconds * 1_000;
}

function snapshotTtlSeconds(snapshot: PublicTradeActivitySnapshot, ttlSeconds: number): number {
	return Math.floor((snapshotExpiresAt(snapshot, ttlSeconds) - Date.now()) / 1_000);
}

function retainForRetry(
	value: PublicTradeActivitySnapshot,
	now: number,
	staleUntil: number
): PublicTradeActivitySnapshot {
	memoryEntry = {
		value,
		reuseUntil: Math.min(now + STALE_RETRY_SECONDS * 1_000, staleUntil),
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
	if (memoryEntry && memoryEntry.reuseUntil > now) {
		return memoryEntry.value;
	}

	try {
		const value = await withCache(CACHE_KEYS.publicTradeActivity(), compute, (snapshot) =>
			snapshotTtlSeconds(snapshot, CACHE_TTL.LONG)
		);
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
		return value;
	} catch (error) {
		const failedAt = Date.now();
		if (memoryEntry && memoryEntry.staleUntil > failedAt) {
			return retainForRetry(memoryEntry.value, failedAt, memoryEntry.staleUntil);
		}
		memoryEntry = null;
		const retained = await cacheGet<PublicTradeActivitySnapshot>(staleCacheKey());
		if (retained !== null) {
			const staleUntil = snapshotExpiresAt(retained, STALE_TTL_SECONDS);
			if (staleUntil > failedAt) {
				return retainForRetry(retained, failedAt, staleUntil);
			}
		}
		throw error;
	}
}

export function clearPublicTradeActivityMemoryCache(): void {
	memoryEntry = null;
}
