// Public API endpoint to get the current rewards APY
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvGet, KV_KEYS, type MonthlyPointsData, type RewardsPoolConfig } from '$lib/server/kv';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';

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
				const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
					2,
					'0'
				)}`;

				const [monthlyData, poolConfig] = await Promise.all([
					kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth)),
					kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth))
				]);

				let totalPoints = 0;
				let snapshotCount = 0;

				if (monthlyData) {
					snapshotCount = monthlyData.snapshotCount ?? 0;
					for (const data of Object.values(monthlyData.wallets)) {
						totalPoints += data.totalPoints;
					}
				}

				// Calculate RocketBoost projected progress
				const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;
				const daysInMonth = getDaysInMonth(currentMonth);
				const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;

				// Project to end of month based on current pace
				const daysElapsed = Math.max(1, Math.floor(snapshotCount / 2));
				const currentDayOfMonth = now.getUTCDate();
				const daysRemaining = daysInMonth - currentDayOfMonth + 1;
				const avgDailyPoints = totalPoints / daysElapsed;
				const projectedTotalPoints = totalPoints + avgDailyPoints * daysRemaining;
				const projectedProgressPercent =
					rocketBoostTargetPoints > 0 ? (projectedTotalPoints / rocketBoostTargetPoints) * 100 : 0;

				const rocketBoostAmounts = poolConfig?.rocketBoostAmounts ?? {
					tier25: 0,
					tier50: 0,
					tier75: 0,
					tier100: 0
				};

				// Use projected progress to estimate RocketBoost bonus
				const projectedRocketBoostAmount =
					(projectedProgressPercent >= 25 ? rocketBoostAmounts.tier25 : 0) +
					(projectedProgressPercent >= 50 ? rocketBoostAmounts.tier50 : 0) +
					(projectedProgressPercent >= 75 ? rocketBoostAmounts.tier75 : 0) +
					(projectedProgressPercent >= 100 ? rocketBoostAmounts.tier100 : 0);

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

function getDaysInMonth(monthStr: string): number {
	const [year, month] = monthStr.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}
