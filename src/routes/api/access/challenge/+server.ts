import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { issueAccessRegistrationChallenge } from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.authStrict,
		'access-challenge'
	);
	if (rateLimitResponse) return rateLimitResponse;

	try {
		const { address, code } = await request.json();

		if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ error: 'Invalid wallet address' }, { status: 400 });
		}

		if (!code || typeof code !== 'string') {
			return json({ error: 'Access code required' }, { status: 400 });
		}

		const challenge = await issueAccessRegistrationChallenge(address, code);

		return json({
			success: true,
			nonce: challenge.nonce,
			message: challenge.message,
			expiresAt: challenge.expiresAt
		});
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
