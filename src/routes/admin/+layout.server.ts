import { redirect } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
	// Skip auth check for the login page
	if (url.pathname === '/admin/login') {
		return {};
	}

	const token = cookies.get('auth-session');
	const ts = cookies.get('auth-timestamp');

	if (!token || !ts || !verifySessionToken(token, Number(ts))) {
		throw redirect(303, '/admin/login');
	}

	return {
		authenticated: true
	};
};
