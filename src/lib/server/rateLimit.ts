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

	// Wallet API: Higher limit since users may query multiple wallets
	// Data is pre-computed and cached, so lookups are cheap
	walletApi: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 200 }),

	// Stricter limit for expensive operations: 10 requests/minute
	expensive: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 10 }),

	// Very permissive: 200 requests/minute
	permissive: (identifier: string) =>
		checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 200 })
};
