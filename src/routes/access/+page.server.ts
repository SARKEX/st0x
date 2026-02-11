import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, cookies }) => {
	// Clear wallet cookie before redirecting to prevent infinite redirect loop.
	// Without this, hooks.server.ts may redirect / -> /access (unregistered wallet)
	// and this page redirects /access -> /, creating an infinite loop.
	cookies.delete('wallet-address', { path: '/' });

	// Preserve query parameters when redirecting to home
	const queryString = url.search;
	throw redirect(302, `/${queryString}`);
};
