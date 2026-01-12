// Public API endpoint to get leaderboard data (no wallet required)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvGet, KV_KEYS, getExcludedWalletsSet, type MonthlyPointsData } from '$lib/server/kv';

interface WalletRanking {
	address: string;
	points: number;
	rank: number;
}

export const GET: RequestHandler = async () => {
	try {
		// Get current month
		const now = new Date();
		const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
			2,
			'0'
		)}`;

		// Get current month's points data
		const monthlyData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth));

		// Get excluded wallets to filter from leaderboard
		const excludedSet = await getExcludedWalletsSet();

		const rankings: WalletRanking[] = [];
		let totalWallets = 0;

		if (monthlyData) {
			// Build rankings from wallet data, excluding excluded wallets
			const walletEntries = Object.entries(monthlyData.wallets);

			for (const [address, data] of walletEntries) {
				// Skip excluded wallets
				if (excludedSet.has(address.toLowerCase())) {
					continue;
				}

				totalWallets++;
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
			});
		}

		return json({
			success: true,
			leaderboard: rankings,
			totalWallets
		});
	} catch (error) {
		console.error('[Leaderboard] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
