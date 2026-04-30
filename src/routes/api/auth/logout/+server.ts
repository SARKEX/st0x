import type { RequestHandler } from './$types';
import { deleteSession } from '$lib/server/walletSession';

// SEC-03 / Plan 03-08a: delete the KV session record AND clear the 'session'
// cookie. Per RESEARCH Pitfall 10, cookies.delete REQUIRES path: '/' in
// SvelteKit 2 (otherwise the cookie is set on the current request path only
// and the browser-stored cookie at path '/' remains).
//
// The 'wallet-address' hint cookie is left for Plan 03-08b's logout-cleanup
// migration to clear (consumer-migration plan; this plan only ships the
// new infrastructure).
export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('session');
	if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
		await deleteSession(sessionId);
	}
	cookies.delete('session', { path: '/' }); // RESEARCH Pitfall 10 — path REQUIRED
	return new Response(null, { status: 204 });
};
