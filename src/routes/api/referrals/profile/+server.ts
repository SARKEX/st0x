import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getReferralProfile,
	calculateReferralPerformance,
	getWalletsReferredByCode
} from '$lib/server/referrals';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { truncateAddress, isValidEthAddress } from '$lib/utils/format';

export const GET: RequestHandler = async ({ url, request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.rewards, 'referral-profile');
	if (rateLimitResponse) return rateLimitResponse;

	const walletAddress = url.searchParams.get('wallet')?.toLowerCase();

	if (!walletAddress) {
		return json({ success: false, error: 'Wallet address required' }, { status: 400 });
	}

	if (!isValidEthAddress(walletAddress)) {
		return json({ success: false, error: 'Invalid wallet address' }, { status: 400 });
	}

	try {
		// Get referral profile
		const profile = await getReferralProfile(walletAddress);

		if (!profile) {
			return json({
				success: true,
				hasProfile: false
			});
		}

		// Get performance stats
		const performance = await calculateReferralPerformance(profile.referralCode);

		// Get list of referred wallets (for display)
		const referredWallets = await getWalletsReferredByCode(profile.referralCode);

		return json({
			success: true,
			hasProfile: true,
			profile: {
				referralCode: profile.referralCode,
				nickname: profile.nickname,
				telegramHandle: profile.telegramHandle,
				createdAt: profile.createdAt,
				isActive: profile.isActive
			},
			performance: {
				walletsReferred: performance.walletsReferred,
				totalPoints: performance.totalPoints,
				projectedRewards: performance.projectedRewards
			},
			referredWallets: referredWallets.map((w) => ({
				address: truncateAddress(w) // Truncated for privacy
			}))
		});
	} catch (error) {
		console.error('[Referral Profile] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
