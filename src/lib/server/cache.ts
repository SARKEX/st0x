import { getKv } from './kv';

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Simple Redis-based cache for API responses
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
	const client = await getKv();
	if (!client) return null;

	try {
		const cached = await client.get(key);
		if (!cached) return null;
		return JSON.parse(cached) as T;
	} catch (error) {
		console.error('[Cache] Get error:', error);
		return null;
	}
}

export async function cacheSet<T>(
	key: string,
	value: T,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
	const client = await getKv();
	if (!client) return;

	try {
		await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
	} catch (error) {
		console.error('[Cache] Set error:', error);
	}
}

export async function cacheDelete(key: string): Promise<void> {
	const client = await getKv();
	if (!client) return;

	try {
		await client.del(key);
	} catch (error) {
		console.error('[Cache] Delete error:', error);
	}
}

/**
 * Invalidate all public API caches (rewards APY, rocketboost, wallet data)
 */
export async function invalidatePublicApiCaches(): Promise<void> {
	await Promise.all([
		cacheDelete(CACHE_KEYS.rewardsApy()),
		cacheDelete(CACHE_KEYS.rocketboost()),
		cacheDelete(CACHE_KEYS.allWalletData())
	]);
	console.log('[Cache] Public API caches invalidated');
}

/**
 * Invalidate all rewards-related caches (called after snapshot generation)
 */
export async function invalidateRewardsCaches(): Promise<void> {
	await Promise.all([
		cacheDelete(CACHE_KEYS.rewardsApy()),
		cacheDelete(CACHE_KEYS.rocketboost()),
		cacheDelete(CACHE_KEYS.allWalletData()),
		cacheDelete(CACHE_KEYS.rewardsLeaderboard()),
		cacheDelete(CACHE_KEYS.rewardsPoolApy()),
		cacheDelete(CACHE_KEYS.rewardsUserSharedData()),
		cacheDelete(CACHE_KEYS.rewardsGlobalData())
	]);
	console.log('[Cache] All rewards caches invalidated');
}

// In-memory locks to prevent cache stampede
const computeLocks = new Map<string, Promise<unknown>>();

/**
 * Cache wrapper - returns cached value if available, otherwise calls fn and caches result
 * Includes stampede protection: only one computation runs at a time per key
 * Cache failures are non-fatal - function result is still returned
 */
export async function withCache<T>(
	key: string,
	fn: () => Promise<T>,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<T> {
	// Try to get from cache first (cache failures are non-fatal)
	try {
		const cached = await cacheGet<T>(key);
		if (cached !== null) {
			return cached;
		}
	} catch (error) {
		console.warn('[Cache] Get failed, computing fresh:', error);
	}

	// Check if computation is already in progress (stampede protection)
	const existingLock = computeLocks.get(key);
	if (existingLock) {
		return existingLock as Promise<T>;
	}

	// Start computation and store the promise
	const computePromise = (async () => {
		try {
			const result = await fn();
			// Cache set failure is non-fatal - just log and continue
			try {
				await cacheSet(key, result, ttlSeconds);
			} catch (cacheError) {
				console.warn('[Cache] Set failed:', cacheError);
			}
			return result;
		} finally {
			computeLocks.delete(key);
		}
	})();

	computeLocks.set(key, computePromise);
	return computePromise;
}

/**
 * Conditional cache wrapper - only caches if shouldCache returns true
 * Useful for preventing cache pollution (e.g., don't cache empty/zero results)
 */
export async function withConditionalCache<T>(
	key: string,
	fn: () => Promise<T>,
	shouldCache: (result: T) => boolean,
	ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<T> {
	// Try to get from cache first (cache failures are non-fatal)
	try {
		const cached = await cacheGet<T>(key);
		if (cached !== null) {
			return cached;
		}
	} catch (error) {
		console.warn('[Cache] Get failed, computing fresh:', error);
	}

	// Call the function
	const result = await fn();

	// Only cache if condition is met
	if (shouldCache(result)) {
		try {
			await cacheSet(key, result, ttlSeconds);
		} catch (cacheError) {
			console.warn('[Cache] Set failed:', cacheError);
		}
	}

	return result;
}

// Cache keys for public API
export const CACHE_KEYS = {
	rewardsApy: () => 'cache:public:rewards-apy',
	rocketboost: () => 'cache:public:rocketboost',
	// Single cache for all wallet data (pre-computed rankings)
	allWalletData: () => 'cache:public:wallet-data',
	// Nansen tier data (wallet -> tier mapping)
	nansenTiers: () => 'cache:public:nansen-tiers',
	// Rewards endpoints
	rewardsLeaderboard: () => 'cache:rewards:leaderboard',
	rewardsPoolApy: () => 'cache:rewards:pool-apy',
	// Pre-computed shared data for user rewards (rankings with wallets lookup)
	rewardsUserSharedData: () => 'cache:rewards:user-shared-data',
	// Pre-computed global rewards data (no wallet lookup needed)
	rewardsGlobalData: () => 'cache:rewards:global-data'
} as const;

// TTL constants (in seconds)
export const CACHE_TTL = {
	SHORT: 5 * 60, // 5 minutes
	MEDIUM: 30 * 60, // 30 minutes
	LONG: 60 * 60, // 1 hour
	VERY_LONG: 6 * 60 * 60 // 6 hours
} as const;
