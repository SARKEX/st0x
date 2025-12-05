// Public API endpoint to get wallet rewards data (points and estimated share)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kvGet, KV_KEYS, type MonthlyPointsData, type RewardsPoolConfig } from '$lib/server/kv';
import { rateLimiters, getClientIp } from '$lib/server/rateLimit';
import { withCache, CACHE_KEYS, CACHE_TTL } from '$lib/server/cache';

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

// Get excluded wallets set for filtering
async function getExcludedWalletsSet(): Promise<Set<string>> {
	const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
	return new Set(excludedWallets.map((w) => w.toLowerCase()));
}

// Compute and cache all wallet data once
async function getAllWalletData(): Promise<AllWalletData> {
	return withCache<AllWalletData>(
		CACHE_KEYS.allWalletData(),
		async () => {
			const now = new Date();
			const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

			const [monthlyData, poolConfig, excludedSet] = await Promise.all([
				kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(currentMonth)),
				kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(currentMonth)),
				getExcludedWalletsSet()
			]);

			let totalPoints = 0;
			const rankings: { address: string; points: number }[] = [];

			if (monthlyData) {
				for (const [address, data] of Object.entries(monthlyData.wallets)) {
					if (excludedSet.has(address.toLowerCase())) continue;
					totalPoints += data.totalPoints;
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

			// Calculate effective pool
			const rocketBoostTvlTarget = poolConfig?.rocketBoostTvlTarget ?? 0;
			const daysInMonth = getDaysInMonth(currentMonth);
			const rocketBoostTargetPoints = rocketBoostTvlTarget * 2 * daysInMonth * 100;
			const progressPercent =
				rocketBoostTargetPoints > 0 ? (totalPoints / rocketBoostTargetPoints) * 100 : 0;

			const rocketBoostAmounts = poolConfig?.rocketBoostAmounts ?? {
				tier25: 0,
				tier50: 0,
				tier75: 0,
				tier100: 0
			};
			const rocketBoostAchievedAmount =
				(progressPercent >= 25 ? rocketBoostAmounts.tier25 : 0) +
				(progressPercent >= 50 ? rocketBoostAmounts.tier50 : 0) +
				(progressPercent >= 75 ? rocketBoostAmounts.tier75 : 0) +
				(progressPercent >= 100 ? rocketBoostAmounts.tier100 : 0);

			const poolAmount = poolConfig?.poolAmount ?? 0;
			const effectivePool = poolAmount + rocketBoostAchievedAmount;

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
	// Rate limiting (higher limit since lookups are now O(1))
	const clientIp = getClientIp(request);
	const rateLimit = await rateLimiters.walletApi(`wallet-api:${clientIp}`);

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
		return json({ success: false, error: 'Wallet address required (use ?address=0x...)' }, { status: 400 });
	}

	// Validate address format
	if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) {
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
		const estimatedReward = allData.totalPoints > 0 ? (userPoints / allData.totalPoints) * allData.effectivePool : 0;

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

function getDaysInMonth(monthStr: string): number {
	const [year, month] = monthStr.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}
