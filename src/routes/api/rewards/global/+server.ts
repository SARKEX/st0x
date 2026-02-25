// Public API endpoint for global rewards data (no wallet required)
// Returns RocketBoost progress, projections, pool info - same for all users
// CDN edge cached for fast global delivery
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RocketBoostTiers } from '$lib/server/kv';
import { applyTieredRateLimit } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { computeProjectedDailyPoints } from '$lib/server/snapshots/points';
import {
	getCurrentMonth,
	fetchRewardsData,
	calculateTotalPoints,
	calculateRocketBoostAmount,
	getDaysInMonth,
	type RewardsData
} from '$lib/server/rewards/rewardsCommon';

interface RocketBoostTiersAchieved {
	tier25: boolean;
	tier50: boolean;
	tier75: boolean;
	tier100: boolean;
}

interface ProjectionData {
	daysElapsed: number;
	daysRemaining: number;
	avgDailyPoints: number;
	projectedTotalPoints: number;
	projectedProgress: number;
}

interface GlobalRewardsData {
	success: boolean;
	currentMonth: string;
	totalPoints: number;
	totalWallets: number;
	snapshotCount: number;
	// Pool config
	poolAmount: number;
	effectivePool: number;
	poolApy: number | null;
	// RocketBoost
	rocketBoostAmounts: RocketBoostTiers;
	rocketBoostTvlTarget: number;
	rocketBoostTargetPoints: number;
	rocketBoostProgress: number;
	rocketBoostTiersAchieved: RocketBoostTiersAchieved;
	rocketBoostAchievedAmount: number;
	// Projection
	projection: ProjectionData;
}

// Compute global rewards data (cached for 1 hour, invalidated on snapshot generation)
async function computeGlobalRewardsData(): Promise<GlobalRewardsData> {
	const now = new Date();
	const currentMonth = getCurrentMonth();

	// Fetch data with error handling for Redis unavailability
	let monthlyData: RewardsData['monthlyData'] = null;
	let poolConfig: RewardsData['poolConfig'] = null;
	let excludedSet: RewardsData['excludedSet'] = new Set();

	try {
		({ monthlyData, poolConfig, excludedSet } = await fetchRewardsData(currentMonth));
	} catch (error) {
		console.warn('[Global Rewards] Redis unavailable, returning empty data:', error);
		// Continue with null/empty defaults - will return valid but empty response
	}

	// Calculate totals excluding excluded wallets
	const totalPoints = calculateTotalPoints(monthlyData, excludedSet);
	let totalWallets = 0;
	let snapshotCount = 0;

	if (monthlyData) {
		snapshotCount = monthlyData.snapshotCount ?? 0;
		for (const [address] of Object.entries(monthlyData.wallets)) {
			if (excludedSet.has(address.toLowerCase())) continue;
			totalWallets++;
		}
	}

	// Pool calculations
	const poolAmount = poolConfig?.poolAmount ?? 0;
	const rocketBoostAmounts: RocketBoostTiers = poolConfig?.rocketBoostAmounts ?? {
		tier25: 0,
		tier50: 0,
		tier75: 0,
		tier100: 0
	};
	const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;

	// RocketBoost target in points
	const daysInMonth = getDaysInMonth(currentMonth);
	const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;

	// Calculate progress and tiers achieved
	const rocketBoostProgress =
		rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

	const rocketBoostTiersAchieved: RocketBoostTiersAchieved = {
		tier25: rocketBoostProgress >= 25,
		tier50: rocketBoostProgress >= 50,
		tier75: rocketBoostProgress >= 75,
		tier100: rocketBoostProgress >= 100
	};

	const rocketBoostAchievedAmount = calculateRocketBoostAmount(poolConfig, rocketBoostProgress);

	const effectivePool = poolAmount + rocketBoostAchievedAmount;

	// Calculate Pool APY
	let poolApy: number | null = null;
	if (totalPoints > 0 && snapshotCount > 0 && effectivePool > 0) {
		const avgTvl = totalPoints / snapshotCount / 100;
		if (avgTvl > 0) {
			const monthlyReturn = effectivePool / avgTvl;
			poolApy = (Math.pow(1 + monthlyReturn, 12) - 1) * 100;
		}
	}

	// Projection calculations — use last 3 days' rate if available
	const daysElapsed = Math.max(1, Math.floor(snapshotCount / 2));
	const currentDayOfMonth = now.getUTCDate();
	const daysRemaining = daysInMonth - currentDayOfMonth + 1;
	const avgDailyPoints = computeProjectedDailyPoints(
		totalPoints,
		daysElapsed,
		monthlyData?.snapshotTotals ?? []
	);
	const projectedTotalPoints = totalPoints + avgDailyPoints * daysRemaining;
	const projectedProgress =
		rocketBoostTargetPoints > 0 ? (projectedTotalPoints / rocketBoostTargetPoints) * 100 : 0;

	return {
		success: true,
		currentMonth,
		totalPoints,
		totalWallets,
		snapshotCount,
		poolAmount,
		effectivePool,
		poolApy,
		rocketBoostAmounts,
		rocketBoostTvlTarget,
		rocketBoostTargetPoints,
		rocketBoostProgress,
		rocketBoostTiersAchieved,
		rocketBoostAchievedAmount,
		projection: {
			daysElapsed,
			daysRemaining,
			avgDailyPoints,
			projectedTotalPoints,
			projectedProgress
		}
	};
}

export const GET: RequestHandler = async ({ request, cookies }) => {
	// Get wallet address from cookie for tiered rate limiting (optional)
	const walletAddress = cookies.get('wallet-address');

	// Tiered rate limiting
	const rateLimitResponse = await applyTieredRateLimit(
		request,
		'rewards',
		'rewards-global',
		walletAddress
	);
	if (rateLimitResponse) return rateLimitResponse;

	try {
		// Redis cache (1 hour, invalidated on snapshot generation)
		const result = await withCache(
			CACHE_KEYS.rewardsGlobalData(),
			computeGlobalRewardsData,
			CACHE_TTL.LONG
		);

		// Return with CDN edge cache headers
		// s-maxage: cache at Vercel edge for 5 minutes
		// stale-while-revalidate: serve stale for up to 1 hour while revalidating
		return json(result, {
			headers: {
				'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600'
			}
		});
	} catch (error) {
		console.error('[Global Rewards] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
