// Public API endpoint to get the current rewards APY
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { computeProjectedDailyPoints } from '$lib/utils/points';
import {
	getCurrentMonth,
	fetchRewardsData,
	calculateTotalPoints,
	calculateRocketBoostAmount,
	getDaysInMonth,
	type RewardsData
} from '$lib/server/rewards/rewardsCommon';

interface RewardsApyData {
	success: boolean;
	date: string;
	apy: number | null;
	effectivePool: number;
	basePool: number;
	rocketBoostBonus: number;
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
		const data = await withCache<RewardsApyData>(
			CACHE_KEYS.rewardsApy(),
			async () => {
				const now = new Date();
				const currentMonth = getCurrentMonth(now);

				let monthlyData: RewardsData['monthlyData'] = null;
				let poolConfig: RewardsData['poolConfig'] = null;
				let excludedSet: RewardsData['excludedSet'] = new Set();
				try {
					({ monthlyData, poolConfig, excludedSet } = await fetchRewardsData(currentMonth));
				} catch (error) {
					console.warn(
						'[Public API - Rewards APY] Redis unavailable, returning empty data:',
						error
					);
				}

				const totalPoints = calculateTotalPoints(monthlyData, excludedSet);
				const snapshotCount = monthlyData?.snapshotCount ?? 0;

				// Calculate RocketBoost projected progress
				const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;
				const daysInMonth = getDaysInMonth(currentMonth);
				const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;

				// Project to end of month based on last 3 days' rate
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

				// Use projected progress to estimate RocketBoost bonus
				const projectedRocketBoostAmount = calculateRocketBoostAmount(
					poolConfig,
					projectedProgressPercent
				);

				const poolAmount = poolConfig?.poolAmount ?? 0;
				const effectivePool = poolAmount + projectedRocketBoostAmount;

				// Calculate Pool APY (compound): ((1 + monthlyReturn) ^ 12 - 1) * 100
				let poolApy: number | null = null;

				if (totalPoints > 0 && snapshotCount > 0 && effectivePool > 0) {
					const avgTvl = totalPoints / snapshotCount / 100;
					if (avgTvl > 0) {
						const monthlyReturn = effectivePool / avgTvl;
						poolApy = (Math.pow(1 + monthlyReturn, 12) - 1) * 100;
					}
				}

				return {
					success: true,
					date: now.toISOString().split('T')[0],
					apy: poolApy,
					effectivePool,
					basePool: poolAmount,
					rocketBoostBonus: projectedRocketBoostAmount
				};
			},
			CACHE_TTL.LONG // 1 hour cache
		);

		return json(data, {
			headers: {
				// Cache at Vercel's edge for 1 hour, stale-while-revalidate for 24 hours
				// This means most requests never hit the serverless function
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	} catch (error) {
		console.error('[Public API - Rewards APY] Error:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch rewards APY'
			},
			{ status: 500 }
		);
	}
};
