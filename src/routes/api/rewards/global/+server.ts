// Public API endpoint for global rewards data (no wallet required)
// Returns RocketBoost progress, projections, pool info - same for all users
// CDN edge cached for fast global delivery
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	kvGet,
	KV_KEYS,
	getExcludedWalletsSet,
	type MonthlyPointsData,
	type RewardsPoolConfig,
	type RocketBoostTiers
} from '$lib/server/kv';
import { applyTieredRateLimit } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';

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
	const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

	const [monthlyData, poolConfig, excludedSet] = await Promise.all([
		kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth)),
		kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth)),
		getExcludedWalletsSet()
	]);

	// Calculate totals excluding excluded wallets
	let totalPoints = 0;
	let totalWallets = 0;
	let snapshotCount = 0;

	if (monthlyData) {
		snapshotCount = monthlyData.snapshotCount ?? 0;
		for (const [address, data] of Object.entries(monthlyData.wallets)) {
			if (excludedSet.has(address.toLowerCase())) continue;
			totalPoints += data.totalPoints;
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

	const rocketBoostAchievedAmount =
		(rocketBoostTiersAchieved.tier25 ? rocketBoostAmounts.tier25 : 0) +
		(rocketBoostTiersAchieved.tier50 ? rocketBoostAmounts.tier50 : 0) +
		(rocketBoostTiersAchieved.tier75 ? rocketBoostAmounts.tier75 : 0) +
		(rocketBoostTiersAchieved.tier100 ? rocketBoostAmounts.tier100 : 0);

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

	// Projection calculations
	const daysElapsed = Math.max(1, Math.floor(snapshotCount / 2));
	const currentDayOfMonth = now.getUTCDate();
	const daysRemaining = daysInMonth - currentDayOfMonth + 1;
	const avgDailyPoints = totalPoints / daysElapsed;
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
			CACHE_KEYS.rewardsSharedData(),
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

function getDaysInMonth(monthStr: string): number {
	const [year, month] = monthStr.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}
