// Public API endpoint to get RocketBoost progress (current and projected)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RocketBoostTiers } from '$lib/server/kv';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { computeProjectedDailyPoints } from '$lib/utils/points';
import {
	getCurrentMonth,
	fetchRewardsData,
	calculateTotalPoints,
	getDaysInMonth
} from '$lib/server/rewards/rewardsCommon';

interface TierStatus {
	target: number;
	bonus: number;
	achieved: boolean;
}

interface RocketBoostData {
	success: boolean;
	date: string;
	current: {
		progressPercent: number;
		totalPoints: number;
		achievedBonus: number;
	};
	projected: {
		progressPercent: number;
		daysElapsed: number;
		daysRemaining: number;
	};
	tiers: Record<string, TierStatus>;
	totalPossibleBonus: number;
}

export const GET: RequestHandler = async ({ request }) => {
	// Rate limiting
	const clientIp = getClientIp(request);
	const rateLimit = await rateLimiters.publicApi(`public-api:${clientIp}`);

	if (!rateLimit.allowed) {
		return json(
			{ success: false, error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
					'X-RateLimit-Remaining': String(rateLimit.remaining),
					'X-RateLimit-Reset': String(rateLimit.resetAt)
				}
			}
		);
	}

	try {
		const data = await withCache<RocketBoostData>(
			CACHE_KEYS.rocketboost(),
			async () => {
				const now = new Date();
				const currentMonth = getCurrentMonth();

				const { monthlyData, poolConfig, excludedSet } = await fetchRewardsData(currentMonth);

				const totalPoints = calculateTotalPoints(monthlyData, excludedSet);
				const snapshotCount = monthlyData?.snapshotCount ?? 0;

				const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;
				const daysInMonth = getDaysInMonth(currentMonth);
				const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;

				// Current progress
				const currentProgressPercent =
					rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

				// Projection calculation — use last 3 days' rate if available
				const daysElapsed = Math.max(1, Math.floor(snapshotCount / 2));
				const currentDayOfMonth = now.getUTCDate();
				const daysRemaining = daysInMonth - currentDayOfMonth + 1;
				const avgDailyPoints = computeProjectedDailyPoints(
					totalPoints,
					daysElapsed,
					monthlyData?.snapshotTotals ?? []
				);
				const projectedTotalPoints = totalPoints + avgDailyPoints * daysRemaining;
				const projectedProgressPercent =
					rocketBoostTargetPoints > 0 ? (projectedTotalPoints / rocketBoostTargetPoints) * 100 : 0;

				// Tier status
				const rocketBoostAmounts: RocketBoostTiers = poolConfig?.rocketBoostAmounts ?? {
					tier25: 0,
					tier50: 0,
					tier75: 0,
					tier100: 0
				};

				const tiers: Record<string, TierStatus> = {
					tier25: {
						target: 25,
						bonus: rocketBoostAmounts.tier25,
						achieved: currentProgressPercent >= 25
					},
					tier50: {
						target: 50,
						bonus: rocketBoostAmounts.tier50,
						achieved: currentProgressPercent >= 50
					},
					tier75: {
						target: 75,
						bonus: rocketBoostAmounts.tier75,
						achieved: currentProgressPercent >= 75
					},
					tier100: {
						target: 100,
						bonus: rocketBoostAmounts.tier100,
						achieved: currentProgressPercent >= 100
					}
				};

				// Calculate achieved and remaining bonus amounts
				const achievedBonus = Object.values(tiers)
					.filter((t) => t.achieved)
					.reduce((sum, t) => sum + t.bonus, 0);

				const totalPossibleBonus = Object.values(tiers).reduce((sum, t) => sum + t.bonus, 0);

				return {
					success: true,
					date: now.toISOString().split('T')[0],
					current: {
						progressPercent: Math.min(currentProgressPercent, 100),
						totalPoints,
						achievedBonus
					},
					projected: {
						progressPercent: Math.min(projectedProgressPercent, 100),
						daysElapsed,
						daysRemaining
					},
					tiers,
					totalPossibleBonus
				};
			},
			CACHE_TTL.LONG // 1 hour cache
		);

		return json(data, {
			headers: {
				// Cache at Vercel's edge for 1 hour, stale-while-revalidate for 24 hours
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	} catch (error) {
		console.error('[Public API - RocketBoost] Error:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch RocketBoost data'
			},
			{ status: 500 }
		);
	}
};
