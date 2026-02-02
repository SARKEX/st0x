import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import { isWalletRegistered } from '$lib/server/accessCodes';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

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

// Security headers for fintech compliance
// Note on CSP: 'unsafe-inline' is required for TradingView widgets which inject scripts via innerHTML
// 'unsafe-eval' may be required by viem/ethers for ABI encoding - test before removing
const CSP_DIRECTIVES = [
	"default-src 'self'",
	// Script sources - TradingView widgets require unsafe-inline (they use script.innerHTML for config)
	// unsafe-eval may be needed by web3 libraries - monitor via report-uri before removing
	"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://s3.tradingview.com https://tv-static-2.tradingview.com https://va.vercel-scripts.com https://cdn.jsdelivr.net",
	// Style sources - unsafe-inline needed for dynamic styles from libraries
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com https://dynamic-static-assets.com https://*.dynamic-static-assets.com https://cdn.jsdelivr.net data:",
	"img-src 'self' data: blob: https:",
	// Tightened connect-src - explicitly list allowed API endpoints
	"connect-src 'self' https://*.st0x.io https://*.vercel-kv.com https://*.vercel.app https://api.goldsky.com https://*.base.org https://*.publicnode.com https://*.llamarpc.com https://*.meowrpc.com https://*.blastapi.io https://gateway.tenderly.co https://*.alchemy.com https://*.arbitrum.io https://mainnet.optimism.io https://*.rhinestone.dev https://*.tradingview.com https://*.walletconnect.com https://*.walletconnect.org https://api.web3modal.org https://*.web3modal.org wss://*.walletconnect.com wss://*.walletconnect.org https://js.hcaptcha.com https://hcaptcha.com https://*.hcaptcha.com https://api.dynamic.xyz https://*.dynamic.xyz https://app.dynamicauth.com https://*.dynamicauth.com https://dynamic-static-assets.com https://*.dynamic-static-assets.com https://rpc.ankr.com https://hermes.pyth.network https://*.pyth.network https://raw.githubusercontent.com wss://*.dynamic.xyz wss://*.dynamicauth.com https://api.openchain.xyz https://va.vercel-scripts.com https://assets.mailerlite.com https://tokens.coingecko.com https://*.coingecko.com https://cdn.jsdelivr.net",
	"frame-src 'self' https://newassets.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://buy.onramper.com https://buy.onramper.dev https://*.tradingview.com https://*.tradingview-widget.com https://app.dynamicauth.com https://*.dynamicauth.com",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	// Additional hardening directives
	"object-src 'none'",
	"worker-src 'self' blob:",
	"manifest-src 'self'",
	// Only upgrade insecure requests in production (breaks localhost dev)
	...(dev ? [] : ['upgrade-insecure-requests'])
];

const SECURITY_HEADERS: Record<string, string> = {
	'Content-Security-Policy': CSP_DIRECTIVES.join('; '),
	// Report-Only CSP for testing stricter policies without breaking functionality
	// Enable this to test removing unsafe-eval: uncomment and monitor console for violations
	// 'Content-Security-Policy-Report-Only': [
	// 	"default-src 'self'",
	// 	"script-src 'self' 'unsafe-inline' https://js.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://cdn.privy.io https://s3.tradingview.com",
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
	if (path === '/api/newsletter') return true;

	// TradingView endpoints (public data)
	if (path.startsWith('/api/tradingview/')) return true;

	// Nansen tiers (public)
	if (path === '/api/nansen/tiers') return true;

	return PUBLIC_PATHS.has(path);
}

// Paths that require wallet registration (server-side enforcement)
function requiresWalletRegistration(path: string): boolean {
	// Protected API endpoints that need wallet registration
	// Exception: /api/rewards/global is public (displays RocketBoost progress to all users)
	if (path.startsWith('/api/rewards/') && path !== '/api/rewards/global') return true;
	if (path.startsWith('/api/snapshots/')) return true;
	if (path === '/api/onramper/sign-url') return true;

	// Protected pages
	if (path === '/' || path === '/rewards' || path === '/trade' || path === '/portfolio') {
		return true;
	}

	return false;
}

// Extract wallet address from cookies or request
function getWalletFromRequest(cookies: {
	get: (name: string) => string | undefined;
}): string | null {
	const walletAddress = cookies.get('wallet-address');

	if (walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
		return walletAddress.toLowerCase();
	}

	// If no direct wallet cookie, return null (will check via API or client)
	return null;
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

export const handle: Handle = async ({ event, resolve }) => {
	const { url, cookies, request } = event;
	const path = url.pathname;
	const origin = request.headers.get('Origin');
	const method = request.method;

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
		const walletAddress = getWalletFromRequest(cookies);

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
