import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	verifyPrivyToken,
	createPrivySessionData,
	getUserEmail,
	getSocialLoginInfo,
	isPrivyConfigured
} from '$lib/server/privy';
import { validateCsrfToken, getCsrfTokenFromRequest } from '$lib/server/csrf';

export const POST: RequestHandler = async ({ request }) => {
	// CSRF protection - validate token from header
	const csrfToken = getCsrfTokenFromRequest(request);
	if (!csrfToken || !validateCsrfToken(csrfToken)) {
		return json({ error: 'Invalid or missing CSRF token' }, { status: 403 });
	}

	// Check if Privy is configured
	if (!isPrivyConfigured()) {
		return json({ error: 'Privy not configured' }, { status: 503 });
	}

	let body: { authToken?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { authToken } = body;

	if (!authToken || typeof authToken !== 'string') {
		return json({ error: 'authToken is required' }, { status: 400 });
	}

	// Verify the token with Privy
	const user = await verifyPrivyToken(authToken);

	if (!user) {
		return json({ error: 'Invalid or expired token' }, { status: 401 });
	}

	// Create session data
	const sessionData = createPrivySessionData(user);

	if (!sessionData) {
		return json({ error: 'User has no embedded wallet' }, { status: 400 });
	}

	// Get additional user info
	const email = getUserEmail(user);
	const socialInfo = getSocialLoginInfo(user);

	// Build session response
	const session = {
		userId: sessionData.userId,
		walletAddress: sessionData.walletAddress,
		email: email ?? undefined,
		socialProvider: socialInfo?.provider,
		socialName: socialInfo?.name || socialInfo?.username
	};

	return json({
		success: true,
		session
	});
};
