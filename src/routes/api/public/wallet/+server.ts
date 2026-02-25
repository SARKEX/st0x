// Public API endpoint to get wallet rewards data (points and estimated share)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';
import {
	getCurrentMonth,
	fetchRewardsData,
	calculateTotalPoints,
	calculateRocketBoostAmount,
	getDaysInMonth
} from '$lib/server/rewards/rewardsCommon';
import { isValidEthAddress } from '$lib/utils/format';

// Pre-computed data for all wallets (cached once, used for all lookups)
interface AllWalletData {
	month: string;
	effectivePool: number;
	totalPoints: number;
	totalWallets: number;
	// Map of wallet address -> { points, rank }
	wallets: Record<string, { points: number; rank: number }>;
}

interface WalletResponse {
	success: boolean;
	date: string;
	wallet: string;
	points: number;
	sharePercent: number;
	estimatedReward: number;
	rank: number | null;
}

// Compute and cache all wallet data once
async function getAllWalletData(): Promise<AllWalletData> {
	return withCache<AllWalletData>(
		CACHE_KEYS.allWalletData(),
		async () => {
			const now = new Date();
			const currentMonth = getCurrentMonth(now);

			const { monthlyData, poolConfig, excludedSet } = await fetchRewardsData(currentMonth);

			const totalPoints = calculateTotalPoints(monthlyData, excludedSet);
			const snapshotCount = monthlyData?.snapshotCount ?? 0;
			const rankings: { address: string; points: number }[] = [];

			if (monthlyData) {
				for (const [address, data] of Object.entries(monthlyData.wallets)) {
					if (excludedSet.has(address.toLowerCase())) continue;
					rankings.push({ address: address.toLowerCase(), points: data.totalPoints });
				}
			}

			// Sort by points descending (expensive operation - done once)
			rankings.sort((a, b) => b.points - a.points);

			// Build wallet lookup map with ranks
			const wallets: Record<string, { points: number; rank: number }> = {};
			rankings.forEach((r, i) => {
				wallets[r.address] = { points: r.points, rank: i + 1 };
			});

			// Calculate projected RocketBoost progress
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

			// Use projected progress to estimate RocketBoost bonus
			const projectedRocketBoostAmount = calculateRocketBoostAmount(
				poolConfig,
				projectedProgressPercent
			);

			const poolAmount = poolConfig?.poolAmount ?? 0;
			const effectivePool = poolAmount + projectedRocketBoostAmount;

			return {
				month: currentMonth,
				effectivePool,
				totalPoints,
				totalWallets: rankings.length,
				wallets
			};
		},
		CACHE_TTL.LONG // 1 hour cache
	);
}

export const GET: RequestHandler = async ({ url, request }) => {
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

	const walletAddress = url.searchParams.get('address')?.toLowerCase();

	if (!walletAddress) {
		return json(
			{ success: false, error: 'Wallet address required (use ?address=0x...)' },
			{ status: 400 }
		);
	}

	// Validate address format
	if (!isValidEthAddress(walletAddress)) {
		return json({ success: false, error: 'Invalid wallet address format' }, { status: 400 });
	}

	try {
		// Get pre-computed data (cached, single entry for all wallets)
		const allData = await getAllWalletData();

		// O(1) lookup for this wallet
		const walletData = allData.wallets[walletAddress];
		const userPoints = walletData?.points ?? 0;
		const rank = walletData?.rank ?? null;

		// Calculate share and reward
		const sharePercent = allData.totalPoints > 0 ? (userPoints / allData.totalPoints) * 100 : 0;
		const estimatedReward =
			allData.totalPoints > 0 ? (userPoints / allData.totalPoints) * allData.effectivePool : 0;

		const response: WalletResponse = {
			success: true,
			date: new Date().toISOString().split('T')[0],
			wallet: walletAddress,
			points: userPoints,
			sharePercent,
			estimatedReward,
			rank
		};

		return json(response, {
			headers: {
				// Cache at Vercel's edge for 1 hour, stale-while-revalidate for 24 hours
				// Vary by query string so each wallet address is cached separately
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
			}
		});
	} catch (error) {
		console.error('[Public API - Wallet] Error:', error);
		return json(
			{
				success: false,
				error: 'Failed to fetch wallet data'
			},
			{ status: 500 }
		);
	}
};
