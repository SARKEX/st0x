// Public API endpoint to get leaderboard data (no wallet required)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	kvGet,
	KV_KEYS,
	getRewardsExcludedWalletsSet,
	type MonthlyPointsData
} from '$lib/server/kv';
import { applyTieredRateLimit } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import { getCurrentMonth } from '$lib/server/rewards/rewardsCommon';

interface WalletRanking {
	address: string;
	points: number;
	rank: number;
}

export const GET: RequestHandler = async ({ request, cookies }) => {
	// Get wallet address from cookie for tiered rate limiting
	const walletAddress = cookies.get('wallet-address');

	// Tiered rate limiting
	const rateLimitResponse = await applyTieredRateLimit(
		request,
		'rewards',
		'leaderboard',
		walletAddress
	);
	if (rateLimitResponse) return rateLimitResponse;

	try {
		// Cache the entire leaderboard computation (1 hour, invalidated on snapshot generation)
		const result = await withCache(
			CACHE_KEYS.rewardsLeaderboard(),
			computeLeaderboard,
			CACHE_TTL.LONG
		);

		return json(result);
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

async function computeLeaderboard() {
	// Get current month
	const currentMonth = getCurrentMonth();

	// Fetch data with error handling for Redis unavailability
	let monthlyData: MonthlyPointsData | null = null;
	let excludedSet: Set<string> = new Set();

	try {
		excludedSet = await getRewardsExcludedWalletsSet();
		monthlyData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth));
	} catch (error) {
		console.warn('[Leaderboard] Redis unavailable, returning empty data:', error);
		// Continue with null/empty defaults
	}

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

		// Sort by points descending, then by address for deterministic ordering on ties
		rankings.sort((a, b) => b.points - a.points || a.address.localeCompare(b.address));

		// Assign ranks
		rankings.forEach((r, i) => {
			r.rank = i + 1;
		});
	}

	return {
		success: true,
		leaderboard: rankings,
		totalWallets
	};
}
