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

		// Calculate effective pool
		const poolAmount = poolConfig?.poolAmount ?? 0;
		const kickerAmount = poolConfig?.kickerAmount ?? 0;
		const kickerHit = poolConfig?.kickerHit ?? false;
		const effectivePool = poolAmount + (kickerHit ? kickerAmount : 0);

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
