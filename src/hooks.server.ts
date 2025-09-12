import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

const ALLOWLIST = new Set<string>([
  '/login',
  '/robots.txt',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png'
]);

function isAllowlisted(path: string) {
	if (path === '/login') return true;
	if (path.startsWith('/_app/')) return true; // SvelteKit assets
  if (path.startsWith('/images/') || path.startsWith('/assets/')) return true;
	return ALLOWLIST.has(path);
}

export const handle: Handle = async ({ event, resolve }) => {
	// Read credentials from env; still gate even if missing so misconfigurations are obvious.
	const user = env.BASIC_AUTH_USER || '';
	const pass = env.BASIC_AUTH_PASS || '';

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
			haveUser: !!user,
			havePass: !!pass,
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
