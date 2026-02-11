import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminAuthenticated } from '$lib/server/adminAuth';
import { cacheDelete, CACHE_KEYS } from '$lib/server/cache';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { createAuditLogger } from '$lib/server/auditLog';

export const POST: RequestHandler = async ({ url, cookies, request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(
		request,
		rateLimiters.admin,
		'admin-referral-refresh'
	);
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const audit = createAuditLogger(request);

	// Optional month parameter
	const month = url.searchParams.get('month');

	try {
		// Invalidate caches
		const cachesToInvalidate: Promise<void>[] = [
			cacheDelete(CACHE_KEYS.referralPublicLeaderboard())
		];

		if (month && /^\d{4}-\d{2}$/.test(month)) {
			cachesToInvalidate.push(cacheDelete(CACHE_KEYS.referralAdminLeaderboard(month)));
		} else {
			// Invalidate current month's admin cache
			const currentMonth = getCurrentMonth();
			cachesToInvalidate.push(cacheDelete(CACHE_KEYS.referralAdminLeaderboard(currentMonth)));
		}

		await Promise.all(cachesToInvalidate);

		await audit.logSuccess(
			'REFERRAL_CACHE_REFRESH',
			{ month: month || 'all' },
			{ adminUser: 'admin' }
		);

		return json({
			success: true,
			message: 'Referral caches invalidated',
			invalidatedAt: new Date().toISOString()
		});
	} catch (error) {
		console.error('[Admin Referral Refresh] Error:', error);
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
