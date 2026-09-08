import { withCache, type DistributedCacheOptions } from '$lib/server/cache';

export interface CachedSt0xResponse {
	status: number;
	statusText: string;
	contentType: string;
	retryAfter: string | null;
	body: string;
	cacheable: boolean;
}

const localCache = new Map<string, { expiresAt: number; value: CachedSt0xResponse }>();
const MAX_LOCAL_ENTRIES = 1_000;
const DISTRIBUTED_CACHE_OPTIONS: DistributedCacheOptions = {
	lockTtlMs: 30_000,
	waitTimeoutMs: 30_000,
	pollMs: 100
};

export async function getCachedSt0xResponse(
	key: string,
	ttlSeconds: number,
	load: () => Promise<CachedSt0xResponse>,
	now = Date.now()
): Promise<CachedSt0xResponse> {
	const local = localCache.get(key);
	if (local && local.expiresAt > now && local.value.cacheable) return local.value;
	if (local) localCache.delete(key);

	const value = await withCache(
		key,
		load,
		(result) => (result.cacheable ? ttlSeconds : 0),
		(result) => result.cacheable,
		DISTRIBUTED_CACHE_OPTIONS
	);

	if (value.cacheable) {
		for (const [cachedKey, cached] of localCache) {
			if (cached.expiresAt <= now) localCache.delete(cachedKey);
		}
		localCache.set(key, { expiresAt: Date.now() + ttlSeconds * 1_000, value });
		while (localCache.size > MAX_LOCAL_ENTRIES) {
			const oldestKey = localCache.keys().next().value as string | undefined;
			if (!oldestKey) break;
			localCache.delete(oldestKey);
		}
	}
	return value;
}

export function clearLocalSt0xProxyCache(): void {
	localCache.clear();
}
