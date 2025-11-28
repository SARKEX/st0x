// API endpoint to get the global pool APY (same for all users)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvGet, KV_KEYS, type MonthlyPointsData, type RewardsPoolConfig } from '$lib/server/kv';

export const GET: RequestHandler = async () => {
	try {
		// Get current month
		const now = new Date();
		const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
			2,
			'0'
		)}`;

		// Get current month's points data and pool config
		const [monthlyData, poolConfig] = await Promise.all([
			kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth)),
			kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth))
		]);

		// Calculate total points
		let totalPoints = 0;
		let snapshotCount = 0;

		if (monthlyData) {
			snapshotCount = monthlyData.snapshotCount ?? 0;
			for (const data of Object.values(monthlyData.wallets)) {
				totalPoints += data.totalPoints;
			}
		}

		// Calculate kicker target in points and progress
		const kickerTvlTarget = poolConfig?.kickerTvlTarget ?? 0;
		const daysInMonth = getDaysInMonth(currentMonth);
		const kickerTargetPoints = kickerTvlTarget * 2 * daysInMonth * 100;
		const progressPercent =
			kickerTargetPoints > 0 ? (totalPoints / kickerTargetPoints) * 100 : 0;

		// Calculate achieved kicker amount based on progress
		const kickerAmounts = poolConfig?.kickerAmounts ?? {
			tier25: 0,
			tier50: 0,
			tier75: 0,
			tier100: 0
		};
		const kickerAchievedAmount =
			(progressPercent >= 25 ? kickerAmounts.tier25 : 0) +
			(progressPercent >= 50 ? kickerAmounts.tier50 : 0) +
			(progressPercent >= 75 ? kickerAmounts.tier75 : 0) +
			(progressPercent >= 100 ? kickerAmounts.tier100 : 0);

		// Calculate effective pool
		const poolAmount = poolConfig?.poolAmount ?? 0;
		const effectivePool = poolAmount + kickerAchievedAmount;

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

		return json({
			success: true,
			currentMonth,
			poolApy,
			effectivePool,
			snapshotCount
		});
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
