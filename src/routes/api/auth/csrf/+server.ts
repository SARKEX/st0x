import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCsrfTokenForSession } from '$lib/server/csrf';

// SEC-04 / Plan 03-08a: session-bound CSRF token issuance.
// Pre-Plan-03-08a this endpoint issued stateless tokens that anyone with read
// access to the server bundle could forge. Now: 401 unless 'session' cookie
// is present; the issued token is HMAC(sessionId, CSRF_SECRET).
//
// Endpoint stays in isPublicPath() classification (no admin auth needed) but
// self-checks the session cookie inside the handler — RESEARCH §"Pattern 2".
//
// Pitfall 3: clients should re-fetch the token after login (new session-id
// ⇒ new HMAC ⇒ stale tokens fail validation cleanly).
export const GET: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');
	if (!sessionId) {
		return json({ error: 'Session required' }, { status: 401 });
	}
	return json({ token: generateCsrfTokenForSession(sessionId) });
};
