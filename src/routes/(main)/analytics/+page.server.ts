import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { dev } from '$app/environment';
import crypto from 'crypto';

// Disable prerendering for this page since it has server-side actions
export const prerender = false;

const ANALYTICS_PASSWORD = 'equitiesrwa';
const SESSION_SECRET = process.env.SESSION_SECRET || 'st0x-analytics-secret-2024';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function createSessionToken(timestamp: number): string {
	const data = `${timestamp}-${SESSION_SECRET}`;
	return crypto.createHash('sha256').update(data).digest('hex');
}

function verifySessionToken(token: string, timestamp: number): boolean {
	const expectedToken = createSessionToken(timestamp);
	const now = Date.now();
	const isValid = token === expectedToken && now - timestamp < SESSION_DURATION;
	return isValid;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	// Check if user has valid session
	const sessionToken = cookies.get('analytics-session');
	const sessionTimestamp = cookies.get('analytics-timestamp');

	if (sessionToken && sessionTimestamp) {
		const timestamp = parseInt(sessionTimestamp);
		if (verifySessionToken(sessionToken, timestamp)) {
			return { authenticated: true };
		}
	}

	// Check if password is provided in URL (for initial login)
	const password = url.searchParams.get('password');
	if (password === ANALYTICS_PASSWORD) {
		// Set session cookie
		const timestamp = Date.now();
		const token = createSessionToken(timestamp);

		cookies.set('analytics-session', token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: SESSION_DURATION / 1000 // maxAge is in seconds
		});

		cookies.set('analytics-timestamp', timestamp.toString(), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: SESSION_DURATION / 1000
		});

		// Redirect to remove password from URL
		throw redirect(303, '/analytics');
	}

	return { authenticated: false };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const formData = await request.formData();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data = formData as any;
		const password = String(data.get('password') || '');

		if (password !== ANALYTICS_PASSWORD) {
			return fail(401, { error: 'Invalid password' });
		}

		// Set session cookie
		const timestamp = Date.now();
		const token = createSessionToken(timestamp);

		cookies.set('analytics-session', token, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: SESSION_DURATION / 1000
		});

		cookies.set('analytics-timestamp', timestamp.toString(), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'strict',
			maxAge: SESSION_DURATION / 1000
		});

		return { success: true };
	},

	logout: async ({ cookies }) => {
		cookies.delete('analytics-session', { path: '/' });
		cookies.delete('analytics-timestamp', { path: '/' });
		throw redirect(303, '/analytics');
	}
};
