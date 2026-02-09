import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getReferralProfile,
	updateReferralNickname,
	verifyWalletSignature
} from '$lib/server/referrals';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { createAuditLogger } from '$lib/server/auditLog';
import { verifyReferralNicknameUpdateChallenge } from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.authStrict,
		'referral-update'
	);
	if (rateLimitResponse) return rateLimitResponse;

	const audit = createAuditLogger(request);

	try {
		const { walletAddress, nickname, signature, challengeNonce } = await request.json();

		if (!walletAddress || !nickname || !signature || !challengeNonce) {
			return json({ success: false, error: 'Missing required fields' }, { status: 400 });
		}

		const challenge = await verifyReferralNicknameUpdateChallenge(
			walletAddress,
			challengeNonce,
			nickname
		);
		if (!challenge.valid || !challenge.message) {
			await audit.logFailure(
				'REFERRAL_UPDATE_FAILED',
				{ walletAddress, nickname },
				challenge.error || 'Invalid nickname update challenge'
			);
			return json(
				{ success: false, error: challenge.error || 'Invalid nickname update challenge' },
				{ status: 400 }
			);
		}

		const signatureValid = await verifyWalletSignature(
			walletAddress,
			challenge.message,
			signature as `0x${string}`
		);

		if (!signatureValid) {
			await audit.logFailure('REFERRAL_UPDATE_FAILED', { walletAddress }, 'Invalid signature');
			return json({ success: false, error: 'Signature verification failed' }, { status: 401 });
		}

		const existingProfile = await getReferralProfile(walletAddress);
		if (!existingProfile) {
			return json({ success: false, error: 'No referral profile found' }, { status: 404 });
		}

		const result = await updateReferralNickname(walletAddress, nickname);

		if (!result.success) {
			await audit.logFailure(
				'REFERRAL_UPDATE_FAILED',
				{ walletAddress, nickname },
				result.error || 'Unknown error'
			);
			return json({ success: false, error: result.error }, { status: 400 });
		}

		await audit.logSuccess('REFERRAL_UPDATE', {
			walletAddress,
			nickname,
			profile: result.profile
		});

		return json({ success: true, profile: result.profile });
	} catch (error) {
		console.error('[Referral Update API] Error:', error);
		return json(
			{ success: false, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
};
