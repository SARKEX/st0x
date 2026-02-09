import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processRegistration } from '$lib/server/accessCodes';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { createAuditLogger } from '$lib/server/auditLog';
import { cacheDelete } from '$lib/server/cache';
import { linkReferredWallet, isValidReferralCode } from '$lib/server/referrals';
import { verifyAccessRegistrationChallenge } from '$lib/server/signatureChallenge';

export const POST: RequestHandler = async ({ request }) => {
	// Rate limiting - uses STRICT mode (fail-closed with in-memory fallback)
	// This prevents registration abuse even if Redis is unavailable
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.authStrict, 'register');
	if (rateLimitResponse) return rateLimitResponse;

	const audit = createAuditLogger(request);

	try {
		const { address, code, signature, challengeNonce, referralCode } = await request.json();

		// Validate required fields
		if (!address || typeof address !== 'string') {
			return json({ error: 'Wallet address required' }, { status: 400 });
		}

		if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
			return json({ error: 'Invalid address format' }, { status: 400 });
		}

		if (!code || typeof code !== 'string') {
			return json({ error: 'Access code required' }, { status: 400 });
		}

		if (!signature || typeof signature !== 'string') {
			return json({ error: 'Signature required' }, { status: 400 });
		}

		if (!challengeNonce || typeof challengeNonce !== 'string') {
			return json({ error: 'Challenge nonce required' }, { status: 400 });
		}

		const challenge = await verifyAccessRegistrationChallenge(address, challengeNonce, code);
		if (!challenge.valid || !challenge.message) {
			await audit.logFailure(
				'WALLET_REGISTRATION',
				{ code: code.toUpperCase() },
				challenge.error || 'Invalid registration challenge',
				{ walletAddress: address }
			);
			return json(
				{ success: false, error: challenge.error || 'Invalid registration challenge' },
				{ status: 400 }
			);
		}

		const result = await processRegistration(
			address,
			code,
			signature as `0x${string}`,
			challenge.message
		);

		if (result.success) {
			// Invalidate the access check cache for this wallet
			await cacheDelete(`cache:access:check:${address.toLowerCase()}`);

			// Link referral code if provided (isolated try/catch to not break registration)
			let referralLinked = false;
			if (referralCode && typeof referralCode === 'string' && isValidReferralCode(referralCode)) {
				try {
					const linkResult = await linkReferredWallet(address, referralCode);
					if (linkResult.success) {
						referralLinked = true;
						await audit.logSuccess(
							'REFERRAL_LINK',
							{ referralCode: referralCode.toLowerCase() },
							{ walletAddress: address }
						);
					} else {
						console.warn('[Register] Failed to link referral:', linkResult.error);
					}
				} catch (err) {
					console.warn('[Register] Referral linking error:', err, { referralCode, address });
				}
			}

			// Audit log successful registration
			await audit.logSuccess(
				'WALLET_REGISTRATION',
				{ code: code.toUpperCase(), referralCode: referralCode || null },
				{ walletAddress: address }
			);

			return json({
				success: true,
				registeredAt: result.wallet?.registeredAt,
				referralLinked
			});
		}

		// Audit log failed registration
		await audit.logFailure(
			'WALLET_REGISTRATION',
			{ code: code.toUpperCase() },
			result.error || 'Unknown error',
			{ walletAddress: address }
		);

		return json({ success: false, error: result.error }, { status: 400 });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
