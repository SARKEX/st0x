// Shared reward calculation functions used across multiple API routes
import {
	kvGet,
	KV_KEYS,
	getRewardsExcludedWalletsSet,
	type MonthlyPointsData,
	type RewardsPoolConfig
} from '$lib/server/kv';

export interface RewardsData {
	monthlyData: MonthlyPointsData | null;
	poolConfig: RewardsPoolConfig | null;
	excludedSet: Set<string>;
}

export function getDaysInMonth(monthStr: string): number {
	const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthStr);
	if (!match) {
		throw new Error(`Invalid month format: ${monthStr}. Expected YYYY-MM`);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getCurrentMonth(now: Date = new Date()): string {
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function fetchRewardsData(month: string): Promise<RewardsData> {
	const [monthlyData, poolConfig, excludedSet] = await Promise.all([
		kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(month)),
		kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(month)),
		getRewardsExcludedWalletsSet()
	]);
	return { monthlyData, poolConfig, excludedSet };
}

export function calculateTotalPoints(
	monthlyData: MonthlyPointsData | null,
	excludedSet: Set<string>
): number {
	if (!monthlyData) return 0;
	let total = 0;
	for (const [address, data] of Object.entries(monthlyData.wallets)) {
		if (excludedSet.has(address.toLowerCase())) continue;
		total += data.totalPoints;
	}
	return total;
}

export function calculateRocketBoostAmount(
	poolConfig: RewardsPoolConfig | null,
	progressPercent: number
): number {
	if (!poolConfig) return 0;
	const amounts = poolConfig.rocketBoostAmounts ?? { tier25: 0, tier50: 0, tier75: 0, tier100: 0 };
	return (
		(progressPercent >= 25 ? amounts.tier25 : 0) +
		(progressPercent >= 50 ? amounts.tier50 : 0) +
		(progressPercent >= 75 ? amounts.tier75 : 0) +
		(progressPercent >= 100 ? amounts.tier100 : 0)
	);
}
