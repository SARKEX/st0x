import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import {
	issueReferralJoinChallenge,
	issueReferralNicknameUpdateChallenge,
	ChallengeStorageUnavailableError
} from '$lib/server/signatureChallenge';
import { isValidNickname } from '$lib/server/referrals';

export const POST: RequestHandler = async ({ request }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.authStrict,
		'referral-challenge'
	);
	if (rateLimitResponse) return rateLimitResponse;

	try {
		const { address, action, nickname } = await request.json();

		if (!address || typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ success: false, error: 'Invalid wallet address' }, { status: 400 });
		}

		if (action === 'join') {
			const challenge = await issueReferralJoinChallenge(address);
			return json({
				success: true,
				nonce: challenge.nonce,
				message: challenge.message,
				expiresAt: challenge.expiresAt
			});
		}

		if (action === 'update_nickname') {
			if (!nickname || typeof nickname !== 'string' || !isValidNickname(nickname.trim())) {
				return json({ success: false, error: 'Invalid nickname format' }, { status: 400 });
			}

			const challenge = await issueReferralNicknameUpdateChallenge(address, nickname);
			return json({
				success: true,
				nonce: challenge.nonce,
				message: challenge.message,
				expiresAt: challenge.expiresAt
			});
		}

		return json({ success: false, error: 'Invalid challenge action' }, { status: 400 });
	} catch (error) {
		if (error instanceof ChallengeStorageUnavailableError) {
			return json({ success: false, error: error.message }, { status: 503 });
		}

		return json({ success: false, error: 'Invalid request body' }, { status: 400 });
	}
};
