import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/server/auth';
import { buildAdminReferralLeaderboard } from '$lib/server/referrals';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

// Helper to check admin auth from cookies
function isAuthenticated(cookies: { get: (name: string) => string | undefined }): boolean {
	const sessionToken = cookies.get('auth-session');
	const timestamp = cookies.get('auth-timestamp');

	if (!sessionToken || !timestamp) {
		return false;
	}

	return verifySessionToken(sessionToken, parseInt(timestamp, 10));
}

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.admin,
		'admin-referral-leaderboard'
	);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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
