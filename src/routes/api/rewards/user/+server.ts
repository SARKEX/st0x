// API endpoint to get user rewards data (points, ranking, pool info)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvGet, KV_KEYS, type MonthlyPointsData, type RewardsPoolConfig } from '$lib/server/kv';

interface WalletRanking {
	address: string;
	points: number;
	rank: number;
}

interface UserRewardsResponse {
	success: boolean;
	currentMonth: string;
	userPoints: number;
	totalPoints: number;
	estimatedReward: number;
	rank: number | null;
	totalWallets: number;
	// Pool config
	poolAmount: number;
	kickerAmount: number;
	kickerTvlTarget: number;
	kickerHit: boolean;
	effectivePool: number; // poolAmount + (kickerHit ? kickerAmount : 0)
	// Last month data
	lastMonth: {
		month: string;
		userPoints: number;
		totalPoints: number;
		reward: number;
		poolAmount: number;
		kickerHit: boolean;
	} | null;
	// Leaderboard data
	leaderboard: {
		top3: WalletRanking[];
		aroundUser: WalletRanking[];
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

		// Calculate user points and ranking
		let userPoints = 0;
		let totalPoints = 0;
		let rank: number | null = null;
		let totalWallets = 0;
		const rankings: WalletRanking[] = [];

		if (monthlyData) {
			// Build rankings from wallet data
			const walletEntries = Object.entries(monthlyData.wallets);
			totalWallets = walletEntries.length;

			for (const [address, data] of walletEntries) {
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
		const kickerAmount = poolConfig?.kickerAmount ?? 0;
		const kickerTvlTarget = poolConfig?.kickerTvlTarget ?? 0;
		const kickerHit = poolConfig?.kickerHit ?? false;
		const effectivePool = poolAmount + (kickerHit ? kickerAmount : 0);

		// Calculate estimated reward
		const estimatedReward = totalPoints > 0 ? (userPoints / totalPoints) * effectivePool : 0;

		// Get last month's data
		let lastMonthData: UserRewardsResponse['lastMonth'] = null;
		const lastMonth = getLastMonth(currentMonth);

		if (lastMonth) {
			const lastMonthPoints = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(lastMonth));
			const lastPoolConfig = await kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(lastMonth));

			if (lastMonthPoints && lastPoolConfig) {
				const lastUserPoints = lastMonthPoints.wallets[walletAddress]?.totalPoints ?? 0;
				const lastTotalPoints = Object.values(lastMonthPoints.wallets).reduce(
					(sum, w) => sum + w.totalPoints,
					0
				);
				const lastEffectivePool =
					lastPoolConfig.poolAmount + (lastPoolConfig.kickerHit ? lastPoolConfig.kickerAmount : 0);
				const lastReward =
					lastTotalPoints > 0 ? (lastUserPoints / lastTotalPoints) * lastEffectivePool : 0;

				lastMonthData = {
					month: lastMonth,
					userPoints: lastUserPoints,
					totalPoints: lastTotalPoints,
					reward: lastReward,
					poolAmount: lastEffectivePool,
					kickerHit: lastPoolConfig.kickerHit
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
			poolAmount,
			kickerAmount,
			kickerTvlTarget,
			kickerHit,
			effectivePool,
			lastMonth: lastMonthData,
			leaderboard: {
				top3,
				aroundUser
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
