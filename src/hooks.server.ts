import type { Handle } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { requestContextHandle } from '$lib/server/logger';
import { scrubSentryEvent } from '$lib/observability/scrub';
import { CSP_DIRECTIVES } from '$lib/server/csp';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { injectTradeSeoHead } from '$lib/seo/trade';

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

	// Dynamic auth API
	if (path.startsWith('/api/auth/dynamic/')) return true;
	if (path.startsWith('/auth/dynamic/')) return true;

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

// Helper to add security headers to response
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
	const { url, request } = event;
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

	if (debug) console.log('[auth] allowing path', path);
	// Trade pages intentionally remain client-rendered because the trading UI
	// depends on browser-only wallet and chart libraries. Inject route-specific
	// metadata into that HTML shell so link unfurlers and crawlers still receive
	// a title, description, canonical URL, and social card without executing JS.
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => injectTradeSeoHead(html, path)
	});
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
