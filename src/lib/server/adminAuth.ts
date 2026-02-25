import { json } from '@sveltejs/kit';
import { verifySessionToken } from './auth';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

export interface CookieStoreLike {
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

/**
 * Combined admin guard: rate limiting + session authentication.
 * Returns a Response if the request should be rejected, or null if it passes.
 */
export async function requireAdmin(
	request: Request,
	cookies: CookieStoreLike,
	rateLimitPrefix: string
): Promise<Response | null> {
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.admin, rateLimitPrefix);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	return null;
}
