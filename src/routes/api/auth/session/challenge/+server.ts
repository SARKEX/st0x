import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import {
	issueSessionLoginChallenge,
	ChallengeStorageUnavailableError
} from '$lib/server/signatureChallenge';

// SEC-03 / Plan 03-08a: issue a 'session_login' nonce via the new purpose
// extension on signatureChallenge.ts. Mirrors /api/access/challenge:1-43
// shape verbatim (rate-limit → validate → issue → propagate KV-unavailable
// as 503).
export const POST: RequestHandler = async ({ request }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.authStrict,
		'session-challenge'
	);
	if (rateLimitResponse) return rateLimitResponse;

	try {
		const { address } = await request.json();

		if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ error: 'Invalid wallet address' }, { status: 400 });
		}

		const challenge = await issueSessionLoginChallenge(address);

		return json({
			success: true,
			nonce: challenge.nonce,
			message: challenge.message,
			expiresAt: challenge.expiresAt
		});
	} catch (error) {
		if (error instanceof ChallengeStorageUnavailableError) {
			return json({ error: error.message }, { status: 503 });
		}

		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
