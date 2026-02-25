// API endpoint to get the global pool APY (same for all users)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import {
	getCurrentMonth,
	fetchRewardsData,
	calculateTotalPoints,
	calculateRocketBoostAmount,
	getDaysInMonth,
	type RewardsData
} from '$lib/server/rewards/rewardsCommon';

interface PoolApyData {
	success: boolean;
	currentMonth: string;
	poolApy: number | null;
	effectivePool: number;
	snapshotCount: number;
}

// Compute pool APY data (cached for 1 hour, invalidated on snapshot generation)
async function computePoolApyData(): Promise<PoolApyData> {
	// Get current month
	const currentMonth = getCurrentMonth();

	// Fetch data with error handling for Redis unavailability
	let monthlyData: RewardsData['monthlyData'] = null;
	let poolConfig: RewardsData['poolConfig'] = null;
	let excludedSet: RewardsData['excludedSet'] = new Set();

	try {
		({ monthlyData, poolConfig, excludedSet } = await fetchRewardsData(currentMonth));
	} catch (error) {
		console.warn('[Pool APY] Redis unavailable, returning empty data:', error);
		// Continue with null/empty defaults
	}

	// Calculate total points (excluding excluded wallets)
	const totalPoints = calculateTotalPoints(monthlyData, excludedSet);
	const snapshotCount = monthlyData?.snapshotCount ?? 0;

	// Calculate RocketBoost target in points and progress
	const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;
	const daysInMonth = getDaysInMonth(currentMonth);
	const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;
	const progressPercent =
		rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

	// Calculate achieved RocketBoost amount based on progress
	const rocketBoostAchievedAmount = calculateRocketBoostAmount(poolConfig, progressPercent);

	// Calculate effective pool
	const poolAmount = poolConfig?.poolAmount ?? 0;
	const effectivePool = poolAmount + rocketBoostAchievedAmount;

	// Calculate Pool APY (compound): ((1 + monthlyReturn) ^ 12 - 1) * 100
	// avgTvl = totalPoints / snapshotCount / 100
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
		currentMonth,
		poolApy,
		effectivePool,
		snapshotCount
	};
}

export const GET: RequestHandler = async ({ request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.rewards, 'pool-apy');
	if (rateLimitResponse) return rateLimitResponse;

	try {
		// Cache for 1 hour (invalidated on snapshot generation)
		const result = await withCache(CACHE_KEYS.rewardsPoolApy(), computePoolApyData, CACHE_TTL.LONG);

		return json(result);
	} catch (error) {
		console.error('[Pool APY] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
