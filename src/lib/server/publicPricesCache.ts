import {
	PUBLIC_PRICES_REFRESH_INTERVAL_MS,
	PUBLIC_PRICES_TTL_SECONDS
} from '$lib/config/publicPrices';
import { CACHE_KEYS, withConditionalCache } from '$lib/server/cache';

interface MemoryEntry<T> {
	value: T;
	expiresAt: number;
}

let memoryEntry: MemoryEntry<unknown> | null = null;

/**
 * Cache public prices in Redis and in-process.
 *
 * Redis remains the cross-instance source of truth. The one-entry memory layer
 * prevents a missing or temporarily unavailable Redis connection from turning
 * every client poll into a full REST order-book fanout.
 */
export async function getCachedPublicPrices<T>(
	compute: () => Promise<T>,
	shouldCache: (result: T) => boolean
): Promise<T> {
	const now = Date.now();
	if (memoryEntry && memoryEntry.expiresAt > now) {
		return memoryEntry.value as T;
	}

	const value = await withConditionalCache(
		CACHE_KEYS.publicPrices(),
		compute,
		shouldCache,
		PUBLIC_PRICES_TTL_SECONDS
	);
	if (shouldCache(value)) {
		memoryEntry = {
			value,
			expiresAt: Date.now() + PUBLIC_PRICES_REFRESH_INTERVAL_MS
		};
	}
	return value;
}

export function clearPublicPricesMemoryCache(): void {
	memoryEntry = null;
}
