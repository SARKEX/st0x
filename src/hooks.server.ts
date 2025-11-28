import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

// Public paths that don't require any authentication
const PUBLIC_PATHS = new Set<string>(['/favicon.ico', '/robots.txt', '/site.webmanifest']);

function isPublicPath(path: string): boolean {
	// Static assets
	if (path.startsWith('/_app/')) return true;
	if (path.startsWith('/images/') || path.startsWith('/assets/')) return true;
	if (path.startsWith('/.well-known/')) return true;

	// Access page and API
	if (path === '/access' || path.startsWith('/access/')) return true;
	if (path.startsWith('/api/access/')) return true;

	// Admin login page (admin area itself is protected by layout)
	if (path === '/admin/login') return true;

	// Docs are public
	if (path.startsWith('/docs')) return true;

	return PUBLIC_PATHS.has(path);
}

function isAdminPath(path: string): boolean {
	return path.startsWith('/admin') && path !== '/admin/login';
}

export const handle: Handle = async ({ event, resolve }) => {
	const { url, cookies } = event;
	const path = url.pathname;

	const debug = env.DEBUG_LOGIN === 'true';

	// Public paths - no auth needed
	if (isPublicPath(path)) {
		if (debug) console.log('[auth] public path', path);
		return resolve(event);
	}

	// Admin paths - require session auth (handled by layout, but double-check here)
	if (isAdminPath(path)) {
		const token = cookies.get('auth-session');
		const tsStr = cookies.get('auth-timestamp');
		const timestamp = tsStr ? Number(tsStr) : NaN;

		const valid = token && Number.isFinite(timestamp) && verifySessionToken(token, timestamp);

		if (debug) {
			console.log('[auth] admin path', path, { hasToken: !!token, valid });
		}

		if (!valid) {
			return new Response(null, {
				status: 303,
				headers: { Location: '/admin/login' }
			});
		}
	}

	// All other paths - access is controlled client-side via wallet registration
	// The server doesn't block these routes; the client checks wallet registration
	// and redirects to /access if needed
	if (debug) console.log('[auth] allowing path (client-side gating)', path);
	return resolve(event);
};
