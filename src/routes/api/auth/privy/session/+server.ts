import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	verifyPrivyToken,
	createPrivySessionData,
	getUserEmail,
	getSocialLoginInfo,
	isPrivyConfigured
} from '$lib/server/privy';

export const GET: RequestHandler = async ({ request }) => {
	// Check if Privy is configured
	if (!isPrivyConfigured()) {
		return json({ error: 'Privy not configured' }, { status: 503 });
	}

	// Get auth token from Authorization header
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ session: null }, { status: 200 });
	}

	const authToken = authHeader.slice(7); // Remove 'Bearer ' prefix

	if (!authToken) {
		return json({ session: null }, { status: 200 });
	}

	// Verify the token with Privy
	const user = await verifyPrivyToken(authToken);

	if (!user) {
		return json({ session: null }, { status: 200 });
	}

	// Create session data
	const sessionData = createPrivySessionData(user);

	if (!sessionData) {
		return json({ session: null, error: 'No embedded wallet' }, { status: 200 });
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

	return json({ session });
};
