// API endpoint to get the global pool APY (same for all users)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	kvGet,
	KV_KEYS,
	getExcludedWalletsSet,
	type MonthlyPointsData,
	type RewardsPoolConfig
} from '$lib/server/kv';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';

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
	const now = new Date();
	const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

	// Fetch data with error handling for Redis unavailability
	let monthlyData: MonthlyPointsData | null = null;
	let poolConfig: RewardsPoolConfig | null = null;
	let excludedWalletsSet: Set<string> = new Set();

	try {
		[monthlyData, poolConfig, excludedWalletsSet] = await Promise.all([
			kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth)),
			kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth)),
			getExcludedWalletsSet()
		]);
	} catch (error) {
		console.warn('[Pool APY] Redis unavailable, returning empty data:', error);
		// Continue with null/empty defaults
	}

	// Calculate total points (excluding excluded wallets)
	let totalPoints = 0;
	let snapshotCount = 0;

	if (monthlyData) {
		snapshotCount = monthlyData.snapshotCount ?? 0;
		for (const [walletAddress, data] of Object.entries(monthlyData.wallets)) {
			if (excludedWalletsSet.has(walletAddress.toLowerCase())) continue;
			totalPoints += data.totalPoints;
		}
	}

	// Calculate RocketBoost target in points and progress
	const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;
	const daysInMonth = getDaysInMonth(currentMonth);
	const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;
	const progressPercent =
		rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

	// Calculate achieved RocketBoost amount based on progress
	const rocketBoostAmounts = poolConfig?.rocketBoostAmounts ?? {
		tier25: 0,
		tier50: 0,
		tier75: 0,
		tier100: 0
	};
	const rocketBoostAchievedAmount =
		(progressPercent >= 25 ? rocketBoostAmounts.tier25 : 0) +
		(progressPercent >= 50 ? rocketBoostAmounts.tier50 : 0) +
		(progressPercent >= 75 ? rocketBoostAmounts.tier75 : 0) +
		(progressPercent >= 100 ? rocketBoostAmounts.tier100 : 0);

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

function getDaysInMonth(monthStr: string): number {
	const [year, month] = monthStr.split('-').map(Number);
	// Day 0 of next month gives last day of current month
	return new Date(year, month, 0).getDate();
}
