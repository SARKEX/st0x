/**
 * CSRF Protection utilities for server-side request validation
 *
 * SvelteKit automatically includes some CSRF protection via the Origin header check,
 * but this module adds additional protection for sensitive endpoints.
 */
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import crypto from 'crypto';

// SEC-02: fail-closed at module load in production when neither CSRF_SECRET nor
// SESSION_SECRET is set. Mirrors the CRON_SECRET precedent at
// src/routes/api/cron/snapshots/+server.ts:42-49 (module-top throw so missing
// secrets crash the lambda at cold start, surfacing in Vercel Logs immediately
// rather than silently using a known/committed dev fallback).
//
// A4 aliasing: CSRF_SECRET is preferred when set; otherwise SESSION_SECRET is
// used (preserves current production behaviour where Vercel project has only
// SESSION_SECRET set). Plan 03-08a (SEC-04) will rewrite generateCsrfToken /
// validateCsrfToken into session-bound variants; this plan only swaps the
// secret-fallback string.
if (!dev && !env.CSRF_SECRET && !env.SESSION_SECRET) {
	throw new Error('[csrf] CSRF_SECRET or SESSION_SECRET required in production');
}
const CSRF_SECRET =
	env.CSRF_SECRET || env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');
const TOKEN_VALIDITY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a CSRF token that can be validated server-side
 * The token includes a timestamp to enforce expiration
 */
export function generateCsrfToken(): string {
	const timestamp = Date.now().toString(36);
	const randomBytes = crypto.randomBytes(16).toString('hex');
	const data = `${timestamp}.${randomBytes}`;
	const signature = crypto
		.createHmac('sha256', CSRF_SECRET)
		.update(data)
		.digest('hex')
		.slice(0, 16);

	return `${data}.${signature}`;
}

/**
 * Validate a CSRF token
 * Checks both the signature and the timestamp
 */
export function validateCsrfToken(token: string): boolean {
	if (!token || typeof token !== 'string') {
		return false;
	}

	const parts = token.split('.');
	if (parts.length !== 3) {
		return false;
	}

	const [timestamp, randomBytes, providedSignature] = parts;

	// Verify timestamp is not expired
	const tokenTime = parseInt(timestamp, 36);
	if (isNaN(tokenTime) || Date.now() - tokenTime > TOKEN_VALIDITY_MS) {
		return false;
	}

	// Verify signature
	const data = `${timestamp}.${randomBytes}`;
	const expectedSignature = crypto
		.createHmac('sha256', CSRF_SECRET)
		.update(data)
		.digest('hex')
		.slice(0, 16);

	// Constant-time comparison to prevent timing attacks
	if (providedSignature.length !== expectedSignature.length) {
		return false;
	}

	return crypto.timingSafeEqual(
		Buffer.from(providedSignature, 'utf8'),
		Buffer.from(expectedSignature, 'utf8')
	);
}

/**
 * Validate request origin for CSRF protection
 * This is a defense-in-depth measure alongside SvelteKit's built-in Origin check
 */
export function validateRequestOrigin(request: Request, allowedOrigins?: string[]): boolean {
	const origin = request.headers.get('Origin');
	const referer = request.headers.get('Referer');

	// If no origin header, check referer
	const requestOrigin = origin || (referer ? new URL(referer).origin : null);

	if (!requestOrigin) {
		// No origin info - this could be a same-origin request or a non-browser request
		// SvelteKit handles this case, but we can be stricter for sensitive endpoints
		return false;
	}

	// If allowed origins are specified, check against them
	if (allowedOrigins && allowedOrigins.length > 0) {
		return allowedOrigins.includes(requestOrigin);
	}

	// Default: check that it's from the same origin (handled by SvelteKit)
	return true;
}

/**
 * Extract CSRF token from request headers
 */
export function getCsrfTokenFromRequest(request: Request): string | null {
	return request.headers.get('X-CSRF-Token') || request.headers.get('x-csrf-token');
}
