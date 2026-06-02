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

// invalidatePublicApiCaches() and invalidateRewardsCaches() were deleted in
// Phase 1 (DEPR-02). Their callers (admin/rewards-pool POST, admin/snapshots/
// {trigger,recalculate}, cron/snapshots) were all unwired or deleted as part
// of the rewards-layer prune. The CACHE_KEYS constants below are kept because
// the surviving rewards APIs in /api/rewards/* and /api/public/* still read
// them; those readers will be deleted in Plan 01-02 (DEPR-01).

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

	// Check if computation is already in progress (stampede protection).
	// Shares the same lock map as withCache: one key → one in-flight compute,
	// so concurrent cold callers await a single fan-out instead of each running
	// their own.
	const existingLock = computeLocks.get(key);
	if (existingLock) {
		return existingLock as Promise<T>;
	}

	const computePromise = (async () => {
		try {
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
		} finally {
			computeLocks.delete(key);
		}
	})();

	computeLocks.set(key, computePromise);
	return computePromise;
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
	rewardsGlobalData: () => 'cache:rewards:global-data',
	// Referral programme cache keys
	referralAdminLeaderboard: (month: string) => `cache:referral:admin-leaderboard:${month}`,
	referralPublicLeaderboard: () => 'cache:referral:public-leaderboard',
	// Admin TVL cache (keyed by limit param)
	tvl: (limit: number) => `tvl:cache:${limit}`,
	// Public TVL cache (aggregate only, no wallet data)
	publicTvl: () => 'cache:public:tvl',
	// Public trade activity cache (aggregate 30-day metrics)
	publicTradeActivity: () => 'cache:public:trade-activity'
} as const;

// TTL constants (in seconds)
export const CACHE_TTL = {
	SHORT: 5 * 60, // 5 minutes
	MEDIUM: 30 * 60, // 30 minutes
	LONG: 60 * 60, // 1 hour
	VERY_LONG: 6 * 60 * 60 // 6 hours
} as const;
