import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createReferralProfile,
	verifyWalletSignature,
	getReferralProfile,
	isValidTelegramHandle,
	isValidNickname
} from '$lib/server/referrals';
import { isWalletRegistered } from '$lib/server/accessCodes';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { createAuditLogger } from '$lib/server/auditLog';
import { verifyReferralJoinChallenge } from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
	// Rate limiting - use strict mode for registration-like endpoints
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'referral-join');
	if (rateLimitResponse) return rateLimitResponse;

	const audit = createAuditLogger(request);

	try {
		const { address, telegramHandle, nickname, signature, challengeNonce } = await request.json();

		// Validate required fields
		if (!address || typeof address !== 'string') {
			return json({ success: false, error: 'Wallet address required' }, { status: 400 });
		}

		if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ success: false, error: 'Invalid address format' }, { status: 400 });
		}

		if (!telegramHandle || typeof telegramHandle !== 'string') {
			return json({ success: false, error: 'Telegram handle required' }, { status: 400 });
		}

		if (!isValidTelegramHandle(telegramHandle.trim())) {
			return json(
				{ success: false, error: 'Invalid Telegram handle format (e.g., @username)' },
				{ status: 400 }
			);
		}

		if (!nickname || typeof nickname !== 'string') {
			return json({ success: false, error: 'Nickname required' }, { status: 400 });
		}

		if (!isValidNickname(nickname.trim())) {
			return json(
				{
					success: false,
					error: 'Nickname must be 3-20 characters (letters, numbers, underscores only)'
				},
				{ status: 400 }
			);
		}

		if (!signature || typeof signature !== 'string') {
			return json({ success: false, error: 'Signature required' }, { status: 400 });
		}

		if (!challengeNonce || typeof challengeNonce !== 'string') {
			return json({ success: false, error: 'Challenge nonce required' }, { status: 400 });
		}

		// Check if wallet is registered on the platform
		const walletIsRegistered = await isWalletRegistered(address);
		if (!walletIsRegistered) {
			return json(
				{
					success: false,
					error: 'You must register on st0x before joining the referral programme'
				},
				{ status: 400 }
			);
		}

		// Check if user already has a referral profile
		const existingProfile = await getReferralProfile(address);
		if (existingProfile) {
			return json(
				{ success: false, error: 'You already have a referral profile' },
				{ status: 400 }
			);
		}

		const challenge = await verifyReferralJoinChallenge(address, challengeNonce);
		if (!challenge.valid || !challenge.message) {
			await audit.logFailure(
				'REFERRAL_JOIN',
				{ telegramHandle, nickname },
				challenge.error || 'Invalid referral challenge',
				{ walletAddress: address }
			);
			return json(
				{ success: false, error: challenge.error || 'Invalid referral challenge' },
				{ status: 400 }
			);
		}

		// Verify signature
		const signatureValid = await verifyWalletSignature(
			address,
			challenge.message,
			signature as `0x${string}`
		);
		if (!signatureValid) {
			await audit.logFailure(
				'REFERRAL_JOIN',
				{ telegramHandle, nickname },
				'Signature verification failed',
				{ walletAddress: address }
			);
			return json({ success: false, error: 'Signature verification failed' }, { status: 400 });
		}

		// Create referral profile
		const result = await createReferralProfile(address, nickname.trim(), telegramHandle.trim());

		if (!result.success) {
			await audit.logFailure(
				'REFERRAL_JOIN',
				{ telegramHandle, nickname },
				result.error || 'Unknown error',
				{ walletAddress: address }
			);
			return json({ success: false, error: result.error }, { status: 400 });
		}

		// Audit log successful join
		await audit.logSuccess(
			'REFERRAL_JOIN',
			{
				referralCode: result.profile!.referralCode,
				nickname: result.profile!.nickname,
				telegramHandle: result.profile!.telegramHandle
			},
			{ walletAddress: address }
		);

		return json({
			success: true,
			referralCode: result.profile!.referralCode,
			nickname: result.profile!.nickname
		});
	} catch (error) {
		console.error('[Referral Join] Error:', error);
		return json({ success: false, error: 'Invalid request body' }, { status: 400 });
	}
};
