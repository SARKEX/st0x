import { dev } from '$app/environment';
import {
	createSessionToken,
	SESSION_DURATION_MS,
	validateCredentials,
	verifySessionToken
} from '$lib/server/auth';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ url, cookies }) => {
	const redirectTo = url.searchParams.get('redirectTo') || '/';
	const token = cookies.get('auth-session');
	const ts = cookies.get('auth-timestamp');
	if (token && ts && verifySessionToken(token, Number(ts))) {
		throw redirect(303, redirectTo);
	}
	// If stale/invalid cookies exist, clear them to prevent redirect loops
	if (token || ts) {
		cookies.delete('auth-session', { path: '/' });
		cookies.delete('auth-timestamp', { path: '/' });
	}
	return { redirectTo };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		// Cast to any to work around TypeScript issue with FormData.get()
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const form = formData as any;
		const username = String(form.get('username') || '');
		const password = String(form.get('password') || '');
		const redirectTo = String(form.get('redirectTo') || '/');

		if (!validateCredentials(username, password)) {
			return fail(401, { error: 'Invalid credentials' });
		}

		const timestamp = Date.now();
		const token = createSessionToken(timestamp);
		cookies.set('auth-session', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev,
			maxAge: SESSION_DURATION_MS / 1000
		});
		cookies.set('auth-timestamp', String(timestamp), {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev,
			maxAge: SESSION_DURATION_MS / 1000
		});

		throw redirect(303, redirectTo);
	}
};
