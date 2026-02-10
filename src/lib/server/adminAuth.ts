import { verifySessionToken } from './auth';

interface CookieStoreLike {
	get: (name: string) => string | undefined;
}

/**
 * Validate admin session cookies using signed token + timestamp.
 */
export function isAdminAuthenticated(cookies: CookieStoreLike): boolean {
	const sessionToken = cookies.get('auth-session');
	const timestampRaw = cookies.get('auth-timestamp');

	if (!sessionToken || !timestampRaw) {
		return false;
	}

	const timestamp = Number(timestampRaw);
	if (!Number.isFinite(timestamp)) {
		return false;
	}

	return verifySessionToken(sessionToken, timestamp);
}
