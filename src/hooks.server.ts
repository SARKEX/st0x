import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import { isWalletRegistered } from '$lib/server/accessCodes';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

// Security headers for fintech compliance
const SECURITY_HEADERS: Record<string, string> = {
	'Content-Security-Policy': [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://www.gstatic.com https://cdn.privy.io",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' https://fonts.gstatic.com data:",
		"img-src 'self' data: blob: https: http:",
		"connect-src 'self' https: wss:",
		"frame-src 'self' https://newassets.hcaptcha.com https://challenges.cloudflare.com https://www.google.com https://auth.privy.io",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"upgrade-insecure-requests"
	].join('; '),
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
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
	if (path.startsWith('/api/rewards/')) return true;
	if (path.startsWith('/api/snapshots/')) return true;
	if (path === '/api/onramper/sign-url') return true;

	// Protected pages
	if (path === '/' || path === '/rewards' || path === '/trade' || path === '/portfolio') {
		return true;
	}

	return false;
}

// Extract wallet address from cookies or request
function getWalletFromRequest(cookies: { get: (name: string) => string | undefined }): string | null {
	// Check for wallet address in various cookie formats
	// Privy stores wallet info - we look for the connected wallet
	const privyToken = cookies.get('privy-token');
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

export const handle: Handle = async ({ event, resolve }) => {
	const { url, cookies } = event;
	const path = url.pathname;

	const debug = env.DEBUG_LOGIN === 'true';

	// Public paths - no auth needed
	if (isPublicPath(path)) {
		if (debug) console.log('[auth] public path', path);
		const response = await resolve(event);
		return addSecurityHeaders(response);
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
		return addSecurityHeaders(response);
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

				// For API requests, return 401
				if (path.startsWith('/api/')) {
					return addSecurityHeaders(
						new Response(JSON.stringify({ error: 'Wallet not registered' }), {
							status: 401,
							headers: { 'Content-Type': 'application/json' }
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
				return addSecurityHeaders(
					new Response(JSON.stringify({ error: 'Authentication required' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					})
				);
			}
			// For pages, allow through - client-side will redirect if needed
			// This prevents breaking the UX when wallet isn't in cookie yet
		}
	}

	if (debug) console.log('[auth] allowing path', path);
	const response = await resolve(event);
	return addSecurityHeaders(response);
};
