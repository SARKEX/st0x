// API endpoint to get user rewards data (points, ranking, pool info)
// Uses pre-computed shared data for O(1) lookups
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
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';

// Which RocketBoost tiers have been achieved
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

// Pre-computed shared data (cached, same for all users)
interface RewardsSharedData {
	currentMonth: string;
	totalPoints: number;
	totalWallets: number;
	snapshotCount: number;
	// Pool config
	poolAmount: number;
	rocketBoostAmounts: RocketBoostTiers;
	rocketBoostTvlTarget: number;
	rocketBoostTargetPoints: number;
	rocketBoostTiersAchieved: RocketBoostTiersAchieved;
	rocketBoostAchievedAmount: number;
	effectivePool: number;
	// Projection
	projection: ProjectionData;
	// Rankings: address -> { points, rank }
	wallets: Record<string, { points: number; rank: number }>;
}

// Compute all shared data once (cached for 1 hour, invalidated on snapshot generation)
async function computeSharedRewardsData(): Promise<RewardsSharedData> {
	const now = new Date();
	const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

	// Fetch data with error handling for Redis unavailability
	let monthlyData: MonthlyPointsData | null = null;
	let poolConfig: RewardsPoolConfig | null = null;
	let excludedSet: Set<string> = new Set();

	try {
		[monthlyData, poolConfig, excludedSet] = await Promise.all([
			kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth)),
			kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth)),
			getExcludedWalletsSet()
		]);
	} catch (error) {
		console.warn('[User Rewards] Redis unavailable, returning empty data:', error);
		// Continue with null/empty defaults - will return valid but empty response
	}

	// Build rankings from wallet data
	let totalPoints = 0;
	let snapshotCount = 0;
	const rankings: { address: string; points: number }[] = [];

	if (monthlyData) {
		snapshotCount = monthlyData.snapshotCount ?? 0;
		for (const [address, data] of Object.entries(monthlyData.wallets)) {
			if (excludedSet.has(address.toLowerCase())) continue;
			totalPoints += data.totalPoints;
			rankings.push({ address: address.toLowerCase(), points: data.totalPoints });
		}
	}

	// Sort by points descending, then by address for deterministic ordering on ties
	rankings.sort((a, b) => b.points - a.points || a.address.localeCompare(b.address));

	// Build wallet lookup map with ranks
	const wallets: Record<string, { points: number; rank: number }> = {};
	rankings.forEach((r, i) => {
		wallets[r.address] = { points: r.points, rank: i + 1 };
	});

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
	const progressPercent =
		rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

	const rocketBoostTiersAchieved: RocketBoostTiersAchieved = {
		tier25: progressPercent >= 25,
		tier50: progressPercent >= 50,
		tier75: progressPercent >= 75,
		tier100: progressPercent >= 100
	};

	const rocketBoostAchievedAmount =
		(rocketBoostTiersAchieved.tier25 ? rocketBoostAmounts.tier25 : 0) +
		(rocketBoostTiersAchieved.tier50 ? rocketBoostAmounts.tier50 : 0) +
		(rocketBoostTiersAchieved.tier75 ? rocketBoostAmounts.tier75 : 0) +
		(rocketBoostTiersAchieved.tier100 ? rocketBoostAmounts.tier100 : 0);

	const effectivePool = poolAmount + rocketBoostAchievedAmount;

	// Projection calculations
	const daysElapsed = Math.max(1, Math.floor(snapshotCount / 2));
	const currentDayOfMonth = now.getUTCDate();
	const daysRemaining = daysInMonth - currentDayOfMonth + 1;
	const avgDailyPoints = totalPoints / daysElapsed;
	const projectedTotalPoints = totalPoints + avgDailyPoints * daysRemaining;
	const projectedProgress =
		rocketBoostTargetPoints > 0 ? (projectedTotalPoints / rocketBoostTargetPoints) * 100 : 0;

	return {
		currentMonth,
		totalPoints,
		totalWallets: rankings.length,
		snapshotCount,
		poolAmount,
		rocketBoostAmounts,
		rocketBoostTvlTarget,
		rocketBoostTargetPoints,
		rocketBoostTiersAchieved,
		rocketBoostAchievedAmount,
		effectivePool,
		projection: {
			daysElapsed,
			daysRemaining,
			avgDailyPoints,
			projectedTotalPoints,
			projectedProgress
		},
		wallets
	};
}

// Get cached shared data
async function getSharedRewardsData(): Promise<RewardsSharedData> {
	return withCache(CACHE_KEYS.rewardsUserSharedData(), computeSharedRewardsData, CACHE_TTL.LONG);
}

export const GET: RequestHandler = async ({ url, request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.rewards, 'rewards-user');
	if (rateLimitResponse) return rateLimitResponse;

	const walletAddress = url.searchParams.get('wallet')?.toLowerCase();

	if (!walletAddress) {
		return json({ error: 'Wallet address required' }, { status: 400 });
	}

	if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) {
		return json({ error: 'Invalid wallet address' }, { status: 400 });
	}

	try {
		// Get pre-computed shared data (cached)
		const shared = await getSharedRewardsData();

		// O(1) lookup for this user
		const walletData = shared.wallets[walletAddress];
		const userPoints = walletData?.points ?? 0;
		const rank = walletData?.rank ?? null;

		// Calculate user-specific fields
		const estimatedReward =
			shared.totalPoints > 0 ? (userPoints / shared.totalPoints) * shared.effectivePool : 0;

		const averageValue = shared.snapshotCount > 0 ? userPoints / shared.snapshotCount / 100 : 0;

		let approxApy: number | null = null;
		if (averageValue > 0 && estimatedReward > 0) {
			const monthlyReturn = estimatedReward / averageValue;
			approxApy = (Math.pow(1 + monthlyReturn, 12) - 1) * 100;
		}

		// Return only user-specific data
		// Global data (pool, rocketboost, projections) available at /api/rewards/global
		return json({
			success: true,
			userPoints,
			estimatedReward,
			rank,
			averageValue,
			approxApy
		});
	} catch (error) {
		console.error('[User Rewards] Error:', error);
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
