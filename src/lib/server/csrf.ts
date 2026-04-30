/**
 * CSRF Protection — session-bound double-submit-cookie pattern (SEC-04).
 *
 * Replaces the prior stateless timestamp-encoded token (Phase 3 Plan 03-08a):
 * tokens are now bound to the server-issued session-id via HMAC(sessionId,
 * CSRF_SECRET). Tokens can only be issued AFTER a session cookie exists
 * (GET /api/auth/csrf returns 401 without it). Validation is HTTP-level —
 * never re-prompts wallet signature (CONTEXT D-04b hard guarantee).
 *
 * SvelteKit also includes built-in Origin header CSRF protection; this module
 * is defense-in-depth on top of that.
 */
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import crypto from 'crypto';

// SEC-02 (Plan 03-02): fail-closed at module load in production when neither
// CSRF_SECRET nor SESSION_SECRET is set. Mirrors the CRON_SECRET precedent at
// src/routes/api/cron/snapshots/+server.ts:42-49 — module-top throw so missing
// secrets crash the lambda at cold start, surfacing in Vercel Logs immediately
// rather than silently using a known/committed dev fallback.
//
// A4 aliasing: CSRF_SECRET is preferred when set; otherwise SESSION_SECRET is
// used (preserves current production behaviour where Vercel project has only
// SESSION_SECRET set).
if (!dev && !env.CSRF_SECRET && !env.SESSION_SECRET) {
	throw new Error('[csrf] CSRF_SECRET or SESSION_SECRET required in production');
}
const CSRF_SECRET =
	env.CSRF_SECRET || env.SESSION_SECRET || (dev ? 'dev-only-do-not-use-in-prod' : '');

/**
 * Generate a CSRF token bound to a session-id via HMAC. Caller must provide
 * a verified session-id (from the 'session' cookie minted at /api/auth/session).
 *
 * Returns the first 32 hex chars of HMAC-SHA256(sessionId, CSRF_SECRET) — same
 * truncation length the Phase 2 token signature used. Tokens regenerate on
 * session change (new session-id ⇒ different HMAC), so stale tokens fail
 * cleanly after re-login.
 */
export function generateCsrfTokenForSession(sessionId: string): string {
	return crypto.createHmac('sha256', CSRF_SECRET).update(sessionId).digest('hex').slice(0, 32);
}

/**
 * Validate a CSRF token against the session-id it should have been bound to.
 * Returns false on missing inputs, length mismatch, or HMAC mismatch. Uses
 * crypto.timingSafeEqual to prevent timing-leak compare. Per CONTEXT D-04b:
 * never re-prompts wallet signature — purely an HTTP-level check.
 */
export function validateCsrfTokenForSession(token: string, sessionId: string): boolean {
	if (!token || !sessionId) return false;
	const expected = generateCsrfTokenForSession(sessionId);
	if (token.length !== expected.length) return false;
	return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'));
}

/**
 * Validate request origin for CSRF protection
 * Defense-in-depth alongside SvelteKit's built-in Origin check.
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
