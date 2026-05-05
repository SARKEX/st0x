import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { deleteSession } from '$lib/server/walletSession';

export const load: PageServerLoad = async ({ url, cookies }) => {
	// SEC-03 (Plan 03-08b atomic flip): logout-equivalent flow — delete the
	// server-side KV session record AND clear both cookies before redirecting
	// to prevent the infinite redirect loop (hooks.server.ts may redirect
	// / -> /access for unregistered wallets; this page redirects /access -> /).
	const sessionId = cookies.get('session');
	if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
		await deleteSession(sessionId);
	}
	cookies.delete('session', { path: '/' }); // RESEARCH Pitfall 10 — path REQUIRED
	// 'wallet-address' is now a non-authoritative personalization hint (D-04),
	// but still cleared here so the client-side store/cookie state stays in
	// sync with logout.
	cookies.delete('wallet-address', { path: '/' });

	// Preserve query parameters when redirecting to home
	const queryString = url.search;
	throw redirect(302, `/${queryString}`);
};
