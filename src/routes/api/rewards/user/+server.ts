// API endpoint to get user rewards data (points, ranking, pool info)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	kvGet,
	KV_KEYS,
	type MonthlyPointsData,
	type RewardsPoolConfig,
	type RocketBoostTiers
} from '$lib/server/kv';

// Get excluded wallets set for filtering
async function getExcludedWalletsSet(): Promise<Set<string>> {
	const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
	return new Set(excludedWallets.map((w) => w.toLowerCase()));
}

interface WalletRanking {
	address: string;
	points: number;
	rank: number;
}

// Which RocketBoost tiers have been achieved
interface RocketBoostTiersAchieved {
	tier25: boolean;
	tier50: boolean;
	tier75: boolean;
	tier100: boolean;
}

interface UserRewardsResponse {
	success: boolean;
	currentMonth: string;
	userPoints: number;
	totalPoints: number;
	estimatedReward: number;
	rank: number | null;
	totalWallets: number;
	// APY calculation fields
	snapshotCount: number;
	averageValue: number; // userPoints / snapshotCount / 100 (in USD)
	approxApy: number | null; // (estimatedReward / averageValue) * 12 * 100, null if no holdings
	// Pool config
	poolAmount: number;
	rocketBoostAmounts: RocketBoostTiers; // Bonus amounts for each tier
	rocketBoostTvlTarget: number;
	rocketBoostTargetPoints: number; // rocketBoostTvlTarget * 2 * daysInMonth * 100
	rocketBoostTiersAchieved: RocketBoostTiersAchieved; // Which tiers have been hit
	rocketBoostAchievedAmount: number; // Sum of achieved tier bonuses
	effectivePool: number; // poolAmount + rocketBoostAchievedAmount
	// Last month data
	lastMonth: {
		month: string;
		userPoints: number;
		totalPoints: number;
		reward: number;
		poolAmount: number;
		rocketBoostAchievedAmount: number;
	} | null;
	// Leaderboard data
	leaderboard: {
		top3: WalletRanking[];
		aroundUser: WalletRanking[];
		allRankings: WalletRanking[];
	};
}

export const GET: RequestHandler = async ({ url }) => {
	const walletAddress = url.searchParams.get('wallet')?.toLowerCase();

	if (!walletAddress) {
		return json({ error: 'Wallet address required' }, { status: 400 });
	}

	// Validate address format
	if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) {
		return json({ error: 'Invalid wallet address' }, { status: 400 });
	}

	try {
		// Get current month
		const now = new Date();
		const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
			2,
			'0'
		)}`;

		// Get current month's points data
		const monthlyData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth));

		// Get current month's pool config
		const poolConfig = await kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth));

		// Get excluded wallets to filter from leaderboard
		const excludedSet = await getExcludedWalletsSet();

		// Calculate user points and ranking
		let userPoints = 0;
		let totalPoints = 0;
		let rank: number | null = null;
		let totalWallets = 0;
		let snapshotCount = 0;
		const rankings: WalletRanking[] = [];

		if (monthlyData) {
			snapshotCount = monthlyData.snapshotCount ?? 0;
			// Build rankings from wallet data, excluding excluded wallets
			const walletEntries = Object.entries(monthlyData.wallets);

			for (const [address, data] of walletEntries) {
				// Skip excluded wallets
				if (excludedSet.has(address.toLowerCase())) {
					continue;
				}

				totalWallets++;
				totalPoints += data.totalPoints;
				rankings.push({
					address,
					points: data.totalPoints,
					rank: 0 // Will be set after sorting
				});
			}

			// Sort by points descending
			rankings.sort((a, b) => b.points - a.points);

			// Assign ranks
			rankings.forEach((r, i) => {
				r.rank = i + 1;
				if (r.address === walletAddress) {
					userPoints = r.points;
					rank = r.rank;
				}
			});
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

		// RocketBoost target in points: TVL * 2 snapshots/day * days in month * 100 points/$
		const daysInMonth = getDaysInMonth(currentMonth);
		const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;

		// Calculate progress percentage and which tiers are achieved
		const progressPercent =
			rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

		const rocketBoostTiersAchieved: RocketBoostTiersAchieved = {
			tier25: progressPercent >= 25,
			tier50: progressPercent >= 50,
			tier75: progressPercent >= 75,
			tier100: progressPercent >= 100
		};

		// Sum up achieved tier bonuses
		const rocketBoostAchievedAmount =
			(rocketBoostTiersAchieved.tier25 ? rocketBoostAmounts.tier25 : 0) +
			(rocketBoostTiersAchieved.tier50 ? rocketBoostAmounts.tier50 : 0) +
			(rocketBoostTiersAchieved.tier75 ? rocketBoostAmounts.tier75 : 0) +
			(rocketBoostTiersAchieved.tier100 ? rocketBoostAmounts.tier100 : 0);

		const effectivePool = poolAmount + rocketBoostAchievedAmount;

		// Calculate estimated reward
		const estimatedReward = totalPoints > 0 ? (userPoints / totalPoints) * effectivePool : 0;

		// Calculate APY (compound)
		// Average value = points / snapshots / 100 (converting points back to USD)
		// APY = ((1 + monthlyReturn) ^ 12 - 1) * 100 (compound annualized percentage)
		const averageValue = snapshotCount > 0 ? userPoints / snapshotCount / 100 : 0;
		let approxApy: number | null = null;
		if (averageValue > 0 && estimatedReward > 0) {
			const monthlyReturn = estimatedReward / averageValue;
			approxApy = (Math.pow(1 + monthlyReturn, 12) - 1) * 100;
		}

		// Get last month's data
		let lastMonthData: UserRewardsResponse['lastMonth'] = null;
		const lastMonth = getLastMonth(currentMonth);

		if (lastMonth) {
			const lastMonthPoints = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(lastMonth));
			const lastPoolConfig = await kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(lastMonth));

			if (lastMonthPoints && lastPoolConfig) {
				// Only count user points if they're not excluded
				const lastUserPoints = excludedSet.has(walletAddress)
					? 0
					: lastMonthPoints.wallets[walletAddress]?.totalPoints ?? 0;

				// Calculate total points excluding excluded wallets
				let lastTotalPoints = 0;
				for (const [addr, data] of Object.entries(lastMonthPoints.wallets)) {
					if (!excludedSet.has(addr.toLowerCase())) {
						lastTotalPoints += data.totalPoints;
					}
				}

				// Calculate last month's achieved RocketBoost amount
				const lastDaysInMonth = getDaysInMonth(lastMonth);
				const lastRocketBoostTargetPoints =
					(lastPoolConfig.rocketBoostTvlTarget ?? 0) * 2 * lastDaysInMonth * 100;
				const lastProgressPercent =
					lastRocketBoostTargetPoints > 0
						? (lastTotalPoints / lastRocketBoostTargetPoints) * 100
						: 0;

				const lastRocketBoostAmounts = lastPoolConfig.rocketBoostAmounts ?? {
					tier25: 0,
					tier50: 0,
					tier75: 0,
					tier100: 0
				};
				const lastRocketBoostAchievedAmount =
					(lastProgressPercent >= 25 ? lastRocketBoostAmounts.tier25 : 0) +
					(lastProgressPercent >= 50 ? lastRocketBoostAmounts.tier50 : 0) +
					(lastProgressPercent >= 75 ? lastRocketBoostAmounts.tier75 : 0) +
					(lastProgressPercent >= 100 ? lastRocketBoostAmounts.tier100 : 0);

				const lastEffectivePool = lastPoolConfig.poolAmount + lastRocketBoostAchievedAmount;
				const lastReward =
					lastTotalPoints > 0 ? (lastUserPoints / lastTotalPoints) * lastEffectivePool : 0;

				lastMonthData = {
					month: lastMonth,
					userPoints: lastUserPoints,
					totalPoints: lastTotalPoints,
					reward: lastReward,
					poolAmount: lastEffectivePool,
					rocketBoostAchievedAmount: lastRocketBoostAchievedAmount
				};
			}
		}

		// Build leaderboard data
		const top3 = rankings.slice(0, 3);
		const aroundUser: WalletRanking[] = [];

		if (rank !== null) {
			// Get 3 above and 3 below user
			const userIndex = rank - 1;
			const startIndex = Math.max(0, userIndex - 3);
			const endIndex = Math.min(rankings.length, userIndex + 4);

			for (let i = startIndex; i < endIndex; i++) {
				// Don't include if already in top 3
				if (rankings[i].rank > 3) {
					aroundUser.push(rankings[i]);
				}
			}

			// Make sure user is included
			if (!aroundUser.find((r) => r.address === walletAddress) && rank > 3) {
				aroundUser.push(rankings[userIndex]);
				aroundUser.sort((a, b) => a.rank - b.rank);
			}
		}

		const response: UserRewardsResponse = {
			success: true,
			currentMonth,
			userPoints,
			totalPoints,
			estimatedReward,
			rank,
			totalWallets,
			snapshotCount,
			averageValue,
			approxApy,
			poolAmount,
			rocketBoostAmounts,
			rocketBoostTvlTarget,
			rocketBoostTargetPoints,
			rocketBoostTiersAchieved,
			rocketBoostAchievedAmount,
			effectivePool,
			lastMonth: lastMonthData,
			leaderboard: {
				top3,
				aroundUser,
				allRankings: rankings
			}
		};

		return json(response);
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

function getLastMonth(currentMonth: string): string | null {
	const [year, month] = currentMonth.split('-').map(Number);
	if (month === 1) {
		return `${year - 1}-12`;
	}
	return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function getDaysInMonth(monthStr: string): number {
	const [year, month] = monthStr.split('-').map(Number);
	// Day 0 of next month gives last day of current month
	return new Date(year, month, 0).getDate();
}
