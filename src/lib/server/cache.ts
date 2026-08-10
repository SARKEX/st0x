import { randomUUID } from 'node:crypto';
import { getKv } from './kv';

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour
const CACHE_OPERATION_TIMEOUT_MS = 5_000;

async function cacheOperation<T>(operation: string, promise: Promise<T>): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timeout = setTimeout(
			() => reject(new Error(`Cache ${operation} exceeded ${CACHE_OPERATION_TIMEOUT_MS}ms`)),
			CACHE_OPERATION_TIMEOUT_MS
		);
	});
	try {
		return await Promise.race([promise, deadline]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

/**
 * Simple Redis-based cache for API responses
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
	try {
		const client = await cacheOperation('connection', getKv());
		if (!client) return null;
		const cached = await cacheOperation('get', client.get(key));
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
	try {
		const client = await cacheOperation('connection', getKv());
		if (!client) return;
		await cacheOperation('set', client.set(key, JSON.stringify(value), { EX: ttlSeconds }));
	} catch (error) {
		console.error('[Cache] Set error:', error);
	}
}

export async function cacheDelete(key: string): Promise<void> {
	try {
		const client = await cacheOperation('connection', getKv());
		if (!client) return;
		await cacheOperation('delete', client.del(key));
	} catch (error) {
		console.error('[Cache] Delete error:', error);
	}
}

export async function cacheCooldownRemainingMs(
	key: string,
	now = Date.now()
): Promise<number | null> {
	const cooldown = await cacheGet<{ retryUntil: number }>(key);
	if (!cooldown || !Number.isFinite(cooldown.retryUntil) || cooldown.retryUntil <= now) return null;
	return Math.max(1_000, cooldown.retryUntil - now);
}

export async function cacheSetCooldown(key: string, delayMs: number): Promise<void> {
	await cacheSet(
		key,
		{ retryUntil: Date.now() + delayMs },
		Math.max(1, Math.ceil(delayMs / 1_000))
	);
}

// invalidatePublicApiCaches() and invalidateRewardsCaches() were deleted in
// Phase 1 (DEPR-02). Their callers (admin/rewards-pool POST, admin/snapshots/
// {trigger,recalculate}, cron/snapshots) were all unwired or deleted as part
// of the rewards-layer prune. The CACHE_KEYS constants below are kept because
// the surviving rewards APIs in /api/rewards/* and /api/public/* still read
// them; those readers will be deleted in Plan 01-02 (DEPR-01).

// In-memory locks to prevent cache stampede
const computeLocks = new Map<string, Promise<unknown>>();

export interface DistributedCacheOptions {
	lockTtlMs: number;
	waitTimeoutMs: number;
	pollMs?: number;
}

function wait(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function getValidCachedValue<T>(
	key: string,
	isCachedValueValid: (value: T) => boolean
): Promise<T | null> {
	const cached = await cacheGet<T>(key);
	if (cached !== null && isCachedValueValid(cached)) return cached;
	if (cached !== null) await cacheDelete(key);
	return null;
}

async function computeAndCache<T>(
	key: string,
	fn: () => Promise<T>,
	ttlSeconds: number | ((value: T) => number)
): Promise<T> {
	const result = await fn();
	const resolvedTtlSeconds = typeof ttlSeconds === 'function' ? ttlSeconds(result) : ttlSeconds;
	if (resolvedTtlSeconds > 0) {
		try {
			await cacheSet(key, result, resolvedTtlSeconds);
		} catch (cacheError) {
			console.warn('[Cache] Set failed:', cacheError);
		}
	}
	return result;
}

async function computeWithDistributedLock<T>(
	key: string,
	fn: () => Promise<T>,
	ttlSeconds: number | ((value: T) => number),
	isCachedValueValid: (value: T) => boolean,
	options: DistributedCacheOptions
): Promise<T> {
	let client: Awaited<ReturnType<typeof getKv>>;
	try {
		client = await cacheOperation('connection', getKv());
	} catch (error) {
		console.warn('[Cache] Shared lock unavailable, computing locally:', error);
		return computeAndCache(key, fn, ttlSeconds);
	}
	if (!client) return computeAndCache(key, fn, ttlSeconds);

	const lockKey = `${key}:compute-lock`;
	const token = randomUUID();
	const pollMs = Math.max(10, options.pollMs ?? 250);
	const waitTimeoutMs = Math.max(pollMs, options.waitTimeoutMs);
	const lockTtlMs = Math.max(waitTimeoutMs, options.lockTtlMs);
	const deadline = Date.now() + waitTimeoutMs;
	let ownsLock = false;

	try {
		while (!ownsLock) {
			try {
				ownsLock =
					(await cacheOperation(
						'shared lock acquisition',
						client.set(lockKey, token, {
							NX: true,
							PX: lockTtlMs
						})
					)) === 'OK';
			} catch (error) {
				console.warn('[Cache] Shared lock unavailable, computing locally:', error);
				return computeAndCache(key, fn, ttlSeconds);
			}

			if (ownsLock) break;

			const cached = await getValidCachedValue(key, isCachedValueValid);
			if (cached !== null) return cached;
			if (Date.now() >= deadline) {
				throw new Error(`Timed out waiting for shared cache refresh: ${key}`);
			}
			await wait(Math.min(pollMs, Math.max(1, deadline - Date.now())));
		}

		const cached = await getValidCachedValue(key, isCachedValueValid);
		if (cached !== null) return cached;
		return await computeAndCache(key, fn, ttlSeconds);
	} finally {
		if (ownsLock) {
			try {
				await cacheOperation(
					'shared lock release',
					client.eval(
						'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
						{ keys: [lockKey], arguments: [token] }
					)
				);
			} catch (error) {
				console.warn('[Cache] Shared lock release failed:', error);
			}
		}
	}
}

/**
 * Cache wrapper - returns cached value if available, otherwise calls fn and caches result
 * Includes process-local stampede protection and optional Redis-backed
 * single-flight coordination across website instances.
 * Cache failures are non-fatal - function result is still returned
 */
export async function withCache<T>(
	key: string,
	fn: () => Promise<T>,
	ttlSeconds: number | ((value: T) => number) = DEFAULT_TTL_SECONDS,
	isCachedValueValid: (value: T) => boolean = () => true,
	distributed?: DistributedCacheOptions
): Promise<T> {
	// Try to get from cache first (cache failures are non-fatal)
	try {
		const cached = await getValidCachedValue(key, isCachedValueValid);
		if (cached !== null) return cached;
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
			return distributed
				? await computeWithDistributedLock(key, fn, ttlSeconds, isCachedValueValid, distributed)
				: await computeAndCache(key, fn, ttlSeconds);
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
	publicTradeActivity: () => 'cache:public:trade-activity',
	// Public midpoint prices cache (bid/ask midpoints for all networks, short TTL)
	publicPrices: () => 'cache:public:prices:v2'
} as const;

// TTL constants (in seconds)
export const CACHE_TTL = {
	SHORT: 5 * 60, // 5 minutes
	MEDIUM: 30 * 60, // 30 minutes
	LONG: 60 * 60, // 1 hour
	VERY_LONG: 6 * 60 * 60 // 6 hours
} as const;
