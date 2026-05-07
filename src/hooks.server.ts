import type { Handle } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { verifySessionToken } from '$lib/server/auth';
import { isWalletRegistered } from '$lib/server/accessCodes';
import { readSession, maybeRefreshSession } from '$lib/server/walletSession';
import { requestContextHandle } from '$lib/server/logger';
import { scrubSentryEvent } from '$lib/observability/scrub';
import { CSP_DIRECTIVES } from '$lib/server/csp';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

// =============================================================================
// Sentry Server Init (OBS-01)
// =============================================================================
// Errors-only configuration — no Replay, no Performance, no Feedback (D-06 / free-tier).
// Init gated by !dev && Boolean(env.SENTRY_DSN) so dev runs no-op and missing DSN in prod
// degrades gracefully. PII scrubbing runs in BOTH beforeSend AND beforeBreadcrumb (Pitfall 9).
Sentry.init({
	dsn: env.SENTRY_DSN,
	enabled: !dev && Boolean(env.SENTRY_DSN),
	tracesSampleRate: 0,
	integrations: [],
	beforeSend(event) {
		return scrubSentryEvent(event);
	},
	beforeBreadcrumb(breadcrumb) {
		return scrubSentryEvent(breadcrumb);
	}
});

// =============================================================================
// CORS Configuration
// =============================================================================

// Production allowed origins
const PRODUCTION_ORIGINS = ['https://www.st0x.io', 'https://st0x.io'];

// Allowed methods for CORS
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

// Allowed headers for CORS
const ALLOWED_HEADERS = [
	'Content-Type',
	'Authorization',
	'X-Requested-With',
	'Accept',
	'Origin',
	'Cache-Control'
];

// Headers to expose to the client
const EXPOSED_HEADERS = [
	'X-RateLimit-Remaining',
	'X-RateLimit-Reset',
	'X-RateLimit-Tier',
	'Retry-After'
];

// Preflight cache duration (24 hours)
const PREFLIGHT_MAX_AGE = 86400;

/**
 * Check if a localhost origin is allowed (dev mode only)
 * Allows ports 5173-5180 and 3000-3005
 */
function isAllowedLocalhostOrigin(origin: string): boolean {
	if (!dev) return false;

	const localhostPatterns = [
		/^http:\/\/localhost:(517[3-9]|5180)$/, // 5173-5180
		/^http:\/\/localhost:(300[0-5])$/, // 3000-3005
		/^http:\/\/127\.0\.0\.1:(517[3-9]|5180)$/, // 5173-5180 on 127.0.0.1
		/^http:\/\/127\.0\.0\.1:(300[0-5])$/ // 3000-3005 on 127.0.0.1
	];

	return localhostPatterns.some((pattern) => pattern.test(origin));
}

/**
 * Get the list of allowed origins for internal API
 */
function getAllowedOrigins(): string[] {
	const origins = [...PRODUCTION_ORIGINS];

	// Add Vercel preview URL if available
	if (env.VERCEL_URL) {
		origins.push(`https://${env.VERCEL_URL}`);
	}

	return origins;
}

/**
 * Check if an origin is allowed for internal API requests
 */
function isAllowedOriginForInternalApi(origin: string | null): boolean {
	if (!origin) return false;

	// Check production and Vercel preview origins
	if (getAllowedOrigins().includes(origin)) return true;

	// Check localhost in dev mode
	if (isAllowedLocalhostOrigin(origin)) return true;

	return false;
}

/**
 * Get CORS headers for a request
 * @param origin - The request origin
 * @param isPublicApi - Whether this is a public API endpoint
 * @param includeCredentials - Whether to include credentials header
 */
function getCorsHeaders(
	origin: string | null,
	isPublicApi: boolean,
	includeCredentials: boolean = false
): Record<string, string> {
	const headers: Record<string, string> = {};

	if (isPublicApi) {
		// Public API: Allow any origin (rate-limited, no sensitive data)
		headers['Access-Control-Allow-Origin'] = '*';
		// Note: Cannot use credentials with wildcard origin
	} else if (origin && isAllowedOriginForInternalApi(origin)) {
		// Internal API: Only allow specific origins
		headers['Access-Control-Allow-Origin'] = origin;
		headers['Vary'] = 'Origin';

		if (includeCredentials) {
			headers['Access-Control-Allow-Credentials'] = 'true';
		}
	}

	return headers;
}

/**
 * Get CORS headers for preflight (OPTIONS) requests
 */
function getPreflightHeaders(origin: string | null, isPublicApi: boolean): Record<string, string> {
	const headers = getCorsHeaders(origin, isPublicApi, !isPublicApi);

	// Only add preflight headers if origin is allowed
	if (headers['Access-Control-Allow-Origin']) {
		headers['Access-Control-Allow-Methods'] = ALLOWED_METHODS.join(', ');
		headers['Access-Control-Allow-Headers'] = ALLOWED_HEADERS.join(', ');
		headers['Access-Control-Expose-Headers'] = EXPOSED_HEADERS.join(', ');
		headers['Access-Control-Max-Age'] = String(PREFLIGHT_MAX_AGE);
	}

	return headers;
}

/**
 * Check if a path is a public API endpoint (open CORS)
 */
function isPublicApiPath(path: string): boolean {
	return path.startsWith('/api/public/');
}

/**
 * Check if a path is an API endpoint
 */
function isApiPath(path: string): boolean {
	return path.startsWith('/api/');
}

// =============================================================================
// Security Headers
// =============================================================================

// Security headers for fintech compliance.
// CSP_DIRECTIVES is imported from `$lib/server/csp` (extracted in Plan 02-02 Task 1
// so the directive list — including the Sentry-Replay-required `worker-src 'self' blob:`
// per Pitfall 3 — can be unit-tested without triggering hooks.server.ts top-level
// side effects). See `tests/lib/server/csp.test.ts` for the regression guard.
const SECURITY_HEADERS: Record<string, string> = {
	'Content-Security-Policy': CSP_DIRECTIVES.join('; '),
	// Report-Only CSP for testing stricter policies without breaking functionality
	// Enable this to test removing unsafe-eval: uncomment and monitor console for violations
	// 'Content-Security-Policy-Report-Only': [
	// 	"default-src 'self'",
	// 	"script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://cdn.privy.io https://s3.tradingview.com",
	// 	"report-uri /api/csp-report"
	// ].join('; '),
	// Only set HSTS in production (breaks localhost dev)
	...(dev ? {} : { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' }),
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)'
};

// Public paths that don't require any authentication
const PUBLIC_PATHS = new Set<string>(['/favicon.ico', '/robots.txt', '/site.webmanifest']);

// Paths that are completely public (no auth needed)
function isPublicPath(path: string): boolean {
	// Static assets
	if (path.startsWith('/_app/')) return true;
	if (path.startsWith('/images/') || path.startsWith('/assets/')) return true;
	if (path.startsWith('/.well-known/')) return true;

	// Access page and API
	if (path === '/access' || path.startsWith('/access/')) return true;
	if (path.startsWith('/api/access/')) return true;

	// Dynamic auth API
	if (path.startsWith('/api/auth/dynamic/')) return true;
	if (path.startsWith('/auth/dynamic/')) return true;

	// Admin login page (admin area itself is protected by layout)
	if (path === '/admin/login') return true;

	// Docs are public
	if (path.startsWith('/docs')) return true;

	// Public API endpoints (rate-limited but no auth)
	if (path.startsWith('/api/public/')) return true;
	if (path === '/api/auth/csrf') return true;

	// SEC-03 / Plan 03-08a: session-login + logout endpoints. They self-check
	// (challenge POST issues a nonce; session POST verifies signature; logout
	// POST clears cookie). Hooks-level wallet-registration check would be
	// circular — the cookie is what /api/auth/session is trying to mint.
	if (path === '/api/auth/session' || path === '/api/auth/session/challenge') return true;
	if (path === '/api/auth/logout') return true;

	// TradingView endpoints (public data)
	if (path.startsWith('/api/tradingview/')) return true;

	// Nansen tiers (public)
	if (path === '/api/nansen/tiers') return true;

	return PUBLIC_PATHS.has(path);
}

// Paths that require wallet registration (server-side enforcement)
function requiresWalletRegistration(path: string): boolean {
	// Protected API endpoints that need wallet registration
	if (path.startsWith('/api/snapshots/')) return true;

	// Protected pages
	if (path === '/' || path === '/trade' || path === '/portfolio') {
		return true;
	}

	return false;
}

// Extract wallet address from the server-issued 'session' cookie + KV record.
// SEC-03 (Plan 03-08b atomic flip): the client-set 'wallet-address' cookie is
// no longer trusted as auth proof. Authentication is established by the
// 'session' cookie minted at /api/auth/session POST after wallet signature
// verification (Plan 03-08a). This reader (a) regex-validates the sessionId
// shape, (b) looks up the KV record via readSession, and (c) fire-and-forgets
// maybeRefreshSession to slide the 30-day TTL (throttled to 1 KV write per 24h
// per session — D-04a UX guarantee).
//
// Per D-04b: wallet signature is NEVER re-prompted per request. This function
// only reads KV state bound to a previously-verified wallet.
async function getWalletFromRequest(cookies: {
	get: (name: string) => string | undefined;
}): Promise<string | null> {
	const sessionId = cookies.get('session');
	if (!sessionId || !/^[a-f0-9]{64}$/.test(sessionId)) return null;
	const record = await readSession(sessionId);
	if (!record) return null;
	// Fire-and-forget sliding refresh; throttled internally to 1 KV write per 24h.
	void maybeRefreshSession(sessionId, record);
	return record.walletAddress;
}

function isAdminPath(path: string): boolean {
	return path.startsWith('/admin') && path !== '/admin/login';
}

// Helper to add security headers to response
function addSecurityHeaders(response: Response): Response {
	const newHeaders = new Headers(response.headers);

	// Add security headers (don't override existing ones)
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		if (!newHeaders.has(key)) {
			newHeaders.set(key, value);
		}
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders
	});
}

// Helper to add both security headers and CORS headers to response
function addSecurityAndCorsHeaders(
	response: Response,
	origin: string | null,
	path: string
): Response {
	const newHeaders = new Headers(response.headers);

	// Add security headers (don't override existing ones)
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		if (!newHeaders.has(key)) {
			newHeaders.set(key, value);
		}
	}

	// Add CORS headers for API endpoints
	if (isApiPath(path)) {
		const isPublicApi = isPublicApiPath(path);
		const corsHeaders = getCorsHeaders(origin, isPublicApi, !isPublicApi);

		for (const [key, value] of Object.entries(corsHeaders)) {
			newHeaders.set(key, value);
		}

		// Always expose rate limit headers for API responses
		if (!newHeaders.has('Access-Control-Expose-Headers')) {
			newHeaders.set('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));
		}
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders
	});
}

// Bot/scanner paths to silently reject (WordPress probes, PHP shells, etc.)
const BOT_PATH_PATTERNS = [
	/\.php\d?$/,
	/^\/wp-(content|admin|includes|login)/,
	/^\/_next\//,
	/^\/cgi-bin\//,
	/^\/\.env/
];

/**
 * Check if a request is from a bot scanner or has a malformed path
 * (e.g. encoded absolute URLs treated as relative paths)
 */
function isBotOrMalformedPath(path: string): boolean {
	// Encoded absolute URLs (crawlers mangling https:// into relative paths)
	if (/^\/(https?|mailto|tel)%3A/i.test(path)) return true;

	// Common bot scanner patterns
	return BOT_PATH_PATTERNS.some((p) => p.test(path));
}

const existingHandle: Handle = async ({ event, resolve }) => {
	const { url, cookies, request } = event;
	const path = url.pathname;
	const origin = request.headers.get('Origin');
	const method = request.method;

	// Silently reject bot scanners and malformed paths (avoids noisy SvelteKitError logs)
	if (isBotOrMalformedPath(path)) {
		return new Response(null, { status: 404 });
	}

	const debug = env.DEBUG_LOGIN === 'true';

	// Handle CORS preflight (OPTIONS) requests for API endpoints
	if (method === 'OPTIONS' && isApiPath(path)) {
		const isPublicApi = isPublicApiPath(path);
		const preflightHeaders = getPreflightHeaders(origin, isPublicApi);

		// If origin not allowed for internal API, return 403
		if (!isPublicApi && !preflightHeaders['Access-Control-Allow-Origin']) {
			return new Response(null, { status: 403 });
		}

		return new Response(null, {
			status: 204,
			headers: preflightHeaders
		});
	}

	// Public paths - no auth needed
	if (isPublicPath(path)) {
		if (debug) console.log('[auth] public path', path);
		const response = await resolve(event);
		return addSecurityAndCorsHeaders(response, origin, path);
	}

	// Admin paths - require session auth
	if (isAdminPath(path)) {
		const token = cookies.get('auth-session');
		const tsStr = cookies.get('auth-timestamp');
		const timestamp = tsStr ? Number(tsStr) : NaN;

		const valid = token && Number.isFinite(timestamp) && verifySessionToken(token, timestamp);

		if (debug) {
			console.log('[auth] admin path', path, { hasToken: !!token, valid });
		}

		if (!valid) {
			return addSecurityHeaders(
				new Response(null, {
					status: 303,
					headers: { Location: '/admin/login' }
				})
			);
		}

		const response = await resolve(event);
		return addSecurityAndCorsHeaders(response, origin, path);
	}

	// Protected paths - require wallet registration (server-side enforcement)
	if (requiresWalletRegistration(path)) {
		// Allow admin session to bypass wallet registration for API routes
		// (admin panel pages make fetch calls to these endpoints)
		if (path.startsWith('/api/')) {
			const token = cookies.get('auth-session');
			const tsStr = cookies.get('auth-timestamp');
			const timestamp = tsStr ? Number(tsStr) : NaN;
			if (token && Number.isFinite(timestamp) && verifySessionToken(token, timestamp)) {
				if (debug) console.log('[auth] admin session bypass for API', path);
				const response = await resolve(event);
				return addSecurityAndCorsHeaders(response, origin, path);
			}
		}

		const walletAddress = await getWalletFromRequest(cookies);

		if (debug) {
			console.log('[auth] protected path', path, { wallet: walletAddress });
		}

		// If we have a wallet address, verify it's registered
		if (walletAddress) {
			const isRegistered = await isWalletRegistered(walletAddress);

			if (!isRegistered) {
				if (debug) console.log('[auth] wallet not registered, redirecting', walletAddress);

				// For API requests, return 401 with CORS headers
				if (path.startsWith('/api/')) {
					const corsHeaders = getCorsHeaders(origin, isPublicApiPath(path), true);
					return addSecurityHeaders(
						new Response(JSON.stringify({ error: 'Wallet not registered' }), {
							status: 401,
							headers: { 'Content-Type': 'application/json', ...corsHeaders }
						})
					);
				}

				// For pages, redirect to access
				return addSecurityHeaders(
					new Response(null, {
						status: 303,
						headers: { Location: '/access' }
					})
				);
			}
		} else {
			// No wallet found - for API routes, return 401; for pages, let client handle
			if (path.startsWith('/api/')) {
				if (debug) console.log('[auth] no wallet found for API', path);
				const corsHeaders = getCorsHeaders(origin, isPublicApiPath(path), true);
				return addSecurityHeaders(
					new Response(JSON.stringify({ error: 'Authentication required' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json', ...corsHeaders }
					})
				);
			}
			// For pages, allow through - client-side will redirect if needed
			// This prevents breaking the UX when wallet isn't in cookie yet
		}
	}

	if (debug) console.log('[auth] allowing path', path);
	const response = await resolve(event);
	return addSecurityAndCorsHeaders(response, origin, path);
};

// =============================================================================
// Hook chain export (OBS-01 + OBS-02)
// =============================================================================
// Order: request-id FIRST so Sentry breadcrumbs and the existing CSP/CORS/auth/bot-rejection
// chain all see the same request_id. Sentry then wraps so it can attach request context to
// any error raised inside existingHandle. Existing handle runs last.
export const handle = sequence(requestContextHandle, Sentry.sentryHandle(), existingHandle);

export const handleError = Sentry.handleErrorWithSentry(
	({ error, event }: { error: unknown; event: unknown }) => {
		console.error('[hooks.server] Unhandled server error:', error, event);
	}
);
