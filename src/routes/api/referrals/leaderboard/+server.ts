import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildReferralLeaderboard, getReferralProfile } from '$lib/server/referrals';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ url, request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.rewards,
		'referral-leaderboard'
	);
	if (rateLimitResponse) return rateLimitResponse;

	const walletAddress = url.searchParams.get('wallet')?.toLowerCase();

	try {
		// Get cached leaderboard (5 minute cache)
		const leaderboard = await withCache(
			CACHE_KEYS.referralPublicLeaderboard(),
			buildReferralLeaderboard,
			CACHE_TTL.SHORT
		);

		// Public leaderboard shows nicknames and points only
		const publicLeaderboard = leaderboard.map((entry) => ({
			rank: entry.rank,
			nickname: entry.nickname,
			totalPoints: entry.totalPoints,
			walletsReferred: entry.walletsReferred,
			projectedRewards: entry.projectedRewards
		}));

		// If wallet provided, find user's position
		let userPosition: {
			rank: number;
			nickname: string;
			totalPoints: number;
			walletsReferred: number;
			projectedRewards: number;
		} | null = null;

		if (walletAddress) {
			const userProfile = await getReferralProfile(walletAddress);
			if (userProfile) {
				const userEntry = leaderboard.find((e) => e.referralCode === userProfile.referralCode);
				if (userEntry) {
					userPosition = {
						rank: userEntry.rank,
						nickname: userEntry.nickname,
						totalPoints: userEntry.totalPoints,
						walletsReferred: userEntry.walletsReferred,
						projectedRewards: userEntry.projectedRewards
					};
				}
			}
		}

		return json({
			success: true,
			leaderboard: publicLeaderboard,
			totalParticipants: leaderboard.length,
			userPosition
		});
	} catch (error) {
		console.error('[Referral Leaderboard] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
