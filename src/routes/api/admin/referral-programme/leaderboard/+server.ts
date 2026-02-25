import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/adminAuth';
import { buildAdminReferralLeaderboard } from '$lib/server/referrals';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-referral-leaderboard');
	if (guardResponse) return guardResponse;

	// Optional month parameter (defaults to current month)
	const month = url.searchParams.get('month') || getCurrentMonth();

	// Validate month format
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
	}

	try {
		// Get cached admin leaderboard (30 minute cache)
		const leaderboard = await withCache(
			CACHE_KEYS.referralAdminLeaderboard(month),
			() => buildAdminReferralLeaderboard(month),
			CACHE_TTL.MEDIUM
		);

		return json({
			success: true,
			month,
			leaderboard,
			totalParticipants: leaderboard.length,
			generatedAt: new Date().toISOString()
		});
	} catch (error) {
		console.error('[Admin Referral Leaderboard] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

function getCurrentMonth(): string {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
