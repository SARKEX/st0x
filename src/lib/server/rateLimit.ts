import { getKv } from './kv';

interface RateLimitConfig {
	windowMs: number; // Time window in milliseconds
	maxRequests: number; // Max requests per window
}

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: number; // Unix timestamp when the window resets
}

const DEFAULT_CONFIG: RateLimitConfig = {
	windowMs: 60 * 1000, // 1 minute
	maxRequests: 60 // 60 requests per minute
};

/**
 * Simple Redis-based rate limiter using sliding window
 * @param identifier - Unique identifier (IP address, API key, etc.)
 * @param config - Rate limit configuration
 */
export async function checkRateLimit(
	identifier: string,
	config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
	const client = await getKv();

	// If Redis is not available, allow all requests (fail open)
	if (!client) {
		return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
	}

	const key = `ratelimit:${identifier}`;
	const now = Date.now();
	const windowStart = now - config.windowMs;

	try {
		// Use a transaction for atomic operations
		const multi = client.multi();

		// Remove old entries outside the window
		multi.zRemRangeByScore(key, 0, windowStart);

		// Count current requests in window
		multi.zCard(key);

		// Add current request
		multi.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

		// Set expiry on the key
		multi.expire(key, Math.ceil(config.windowMs / 1000) + 1);

		const results = await multi.exec();

		// zCard result is at index 1
		const currentCount = (results[1] as unknown as number) || 0;

		const allowed = currentCount < config.maxRequests;
		const remaining = Math.max(0, config.maxRequests - currentCount - 1);
		const resetAt = now + config.windowMs;

		return { allowed, remaining, resetAt };
	} catch (error) {
		console.error('[Rate Limit] Error:', error);
		// Fail open on errors
		return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
	}
}

/**
 * Get client IP from request headers (works with Vercel)
 *
 * IMPORTANT: We prioritize Vercel's headers which cannot be spoofed by clients.
 * x-vercel-forwarded-for is set by Vercel's edge and is trustworthy.
 * x-forwarded-for can be spoofed if not behind a trusted proxy.
 */
export function getClientIp(request: Request): string {
	// Vercel's trusted header (cannot be spoofed by clients)
	const vercelForwarded = request.headers.get('x-vercel-forwarded-for');
	if (vercelForwarded) {
		return vercelForwarded.split(',')[0].trim();
	}

	// Vercel also sets x-real-ip
	const realIp = request.headers.get('x-real-ip');
	if (realIp) return realIp;

	// Fallback to x-forwarded-for (less trusted, but needed for local dev)
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}

	// Default fallback
	return 'unknown';
}

// Pre-configured rate limiters for different use cases
export const rateLimiters = {
	// Standard public API: 60 requests/minute
	publicApi: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 60 }),

	// Stricter limit for expensive operations: 10 requests/minute
	expensive: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 10 }),

	// Very permissive: 200 requests/minute
	permissive: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 200 }),

	// Authentication/registration: 5 requests/minute (prevent brute force)
	auth: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 5 }),

	// Access check: Higher limit since it's called on every page load (read-only)
	accessCheck: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 60 }),

	// Admin API: 30 requests/minute (authenticated users)
	admin: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 30 }),

	// Leaderboard/rewards: 30 requests/minute
	rewards: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 30 }),

	// Snapshots (read): 20 requests/minute
	snapshots: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 20 }),

	// Snapshot generation (expensive): 2 requests/minute
	snapshotGenerate: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 2 }),

	// Newsletter signup: 3 requests/minute
	newsletter: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 3 })
};

import { json } from '@sveltejs/kit';

/**
 * Helper to apply rate limiting with standard response handling.
 * Returns a 429 Response if rate limit exceeded, or null if allowed.
 */
export async function applyRateLimit(
	request: Request,
	limiter: (identifier: string) => Promise<RateLimitResult>,
	prefix: string
): Promise<Response | null> {
	const clientIp = getClientIp(request);
	const rateLimit = await limiter(`${prefix}:${clientIp}`);

	if (!rateLimit.allowed) {
		return json(
			{ success: false, error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
					'X-RateLimit-Remaining': String(rateLimit.remaining),
					'X-RateLimit-Reset': String(rateLimit.resetAt)
				}
			}
		);
	}

	return null;
}

/**
 * Tiered rate limit configuration for wallet-based rate limiting.
 * Authenticated (wallet) users get higher limits than anonymous users.
 */
export interface TieredRateLimitConfig {
	anonymous: RateLimitConfig;
	authenticated: RateLimitConfig;
}

export const tieredLimits: Record<string, TieredRateLimitConfig> = {
	// Rewards endpoints
	rewards: {
		anonymous: { windowMs: 60 * 1000, maxRequests: 10 },      // 10/min for anon
		authenticated: { windowMs: 60 * 1000, maxRequests: 60 }   // 60/min for wallet
	},
	// Access check (read-only, called on page load)
	accessCheck: {
		anonymous: { windowMs: 60 * 1000, maxRequests: 20 },      // 20/min for anon
		authenticated: { windowMs: 60 * 1000, maxRequests: 120 }  // 120/min for wallet
	},
	// Onramper (requires wallet)
	onramper: {
		anonymous: { windowMs: 60 * 1000, maxRequests: 2 },       // 2/min for anon (shouldn't happen)
		authenticated: { windowMs: 60 * 1000, maxRequests: 10 }   // 10/min for wallet
	}
};

/**
 * Apply wallet-based tiered rate limiting.
 * Uses wallet address as identifier if provided, falls back to IP with lower limits.
 *
 * @param request - The incoming request
 * @param tierKey - Key to look up in tieredLimits
 * @param prefix - Prefix for the rate limit key
 * @param walletAddress - Optional wallet address for higher limits
 */
export async function applyTieredRateLimit(
	request: Request,
	tierKey: keyof typeof tieredLimits,
	prefix: string,
	walletAddress?: string | null
): Promise<Response | null> {
	const config = tieredLimits[tierKey];
	if (!config) {
		console.error(`[Rate Limit] Unknown tier key: ${tierKey}`);
		return null; // Fail open if misconfigured
	}

	// Use wallet address if provided (higher limits), otherwise use IP (lower limits)
	const isAuthenticated = walletAddress && /^0x[a-fA-F0-9]{40}$/i.test(walletAddress);
	const identifier = isAuthenticated
		? `wallet:${walletAddress.toLowerCase()}`
		: `ip:${getClientIp(request)}`;

	const limitConfig = isAuthenticated ? config.authenticated : config.anonymous;
	const rateLimit = await checkRateLimit(`${prefix}:${identifier}`, limitConfig);

	if (!rateLimit.allowed) {
		return json(
			{
				success: false,
				error: 'Rate limit exceeded. Please try again later.',
				// Hint to connect wallet for higher limits if anonymous
				...(isAuthenticated ? {} : { hint: 'Connect your wallet for higher rate limits.' })
			},
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
					'X-RateLimit-Remaining': String(rateLimit.remaining),
					'X-RateLimit-Reset': String(rateLimit.resetAt),
					'X-RateLimit-Tier': isAuthenticated ? 'authenticated' : 'anonymous'
				}
			}
		);
	}

	return null;
}
