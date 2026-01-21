import { dev } from '$app/environment';
import {
	createSessionToken,
	SESSION_DURATION_MS,
	validateCredentials,
	verifySessionToken
} from '$lib/server/auth';
import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAuditLogger } from '$lib/server/auditLog';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

export const prerender = false;

export const load: PageServerLoad = async ({ cookies }) => {
	const token = cookies.get('auth-session');
	const ts = cookies.get('auth-timestamp');

	// If already logged in, redirect to admin dashboard
	if (token && ts && verifySessionToken(token, Number(ts))) {
		throw redirect(303, '/admin');
	}

	// Clear stale cookies
	if (token || ts) {
		cookies.delete('auth-session', { path: '/' });
		cookies.delete('auth-timestamp', { path: '/' });
	}

	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		// Rate limiting for login attempts
		const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth, 'admin-login');
		if (rateLimitResponse) {
			return fail(429, { error: 'Too many login attempts. Please try again later.' });
		}

		const audit = createAuditLogger(request);
		const formData = (await request.formData()) as unknown as globalThis.FormData;
		const username = formData.get('username')?.toString() || '';
		const password = formData.get('password')?.toString() || '';

		if (!validateCredentials(username, password)) {
			// Audit log failed login attempt
			await audit.logFailure('ADMIN_LOGIN_FAILED', { username }, 'Invalid credentials');
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

		// Audit log successful login
		await audit.logSuccess('ADMIN_LOGIN', { username }, { adminUser: username });

		throw redirect(303, '/admin');
	}
};
