import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import { BASIC_AUTH_USER, BASIC_AUTH_PASS } from '$env/static/private';
import { env } from '$env/dynamic/private';

const ALLOWLIST = new Set<string>(['/login', '/favicon.ico', '/robots.txt', '/site.webmanifest']);

function isAllowlisted(path: string) {
	if (path === '/login') return true;
	if (path.startsWith('/_app/')) return true; // SvelteKit assets
	if (path.startsWith('/images/') || path.startsWith('/assets/')) return true;
	if (path.startsWith('/.well-known/')) return true; // Chrome DevTools and other well-known endpoints
	return ALLOWLIST.has(path);
}

export const handle: Handle = async ({ event, resolve }) => {
	const { url, cookies } = event;
	const path = url.pathname;

	const debug = env.DEBUG_LOGIN === 'true';
	if (isAllowlisted(path)) {
		if (debug) console.log('[auth] allowlisted path', path);
		return resolve(event);
	}

	const token = cookies.get('auth-session');
	const tsStr = cookies.get('auth-timestamp');
	const timestamp = tsStr ? Number(tsStr) : NaN;

	const valid = token && Number.isFinite(timestamp) && verifySessionToken(token, timestamp);
	if (debug) {
		console.log('[auth] path', path, {
			haveUser: !!(BASIC_AUTH_USER || ''),
			havePass: !!(BASIC_AUTH_PASS || ''),
			hasToken: !!token,
			ts: tsStr,
			valid
		});
	}

	if (valid) {
		return resolve(event);
	}

	const params = new URLSearchParams({ redirectTo: url.pathname + url.search });
	return new Response(null, { status: 303, headers: { Location: `/login?${params.toString()}` } });
};
