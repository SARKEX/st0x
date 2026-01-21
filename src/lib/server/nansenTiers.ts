// Nansen Points Leaderboard tier service
// Fetches and caches EVM wallet tier data from the public Nansen API

import { withCache, CACHE_TTL, CACHE_KEYS } from './cache';

// Tier definitions ordered from lowest (1) to highest (4)
export const NANSEN_TIERS = {
	green: { name: 'Green', level: 1 },
	ice: { name: 'Ice', level: 2 },
	north: { name: 'North', level: 3 },
	star: { name: 'Star', level: 4 }
} as const;

export type NansenTier = keyof typeof NANSEN_TIERS;

export interface NansenLeaderboardEntry {
	rank: number;
	evm_address: string | null;
	solana_address: string | null;
	points: number;
	tier: NansenTier;
	is_eligible: boolean;
}

export interface NansenTierData {
	// Map of lowercase EVM address to tier info
	walletTiers: Record<string, { tier: NansenTier; points: number; rank: number }>;
	// Timestamp of when the data was fetched
	fetchedAt: number;
	// Total count by tier
	tierCounts: Record<NansenTier, number>;
}

const NANSEN_API_URL = 'https://app.nansen.ai/api/points-leaderboard';

/**
 * Fetch all EVM wallet tiers from Nansen API
 * Fetches all tiers in parallel for efficiency
 */
async function fetchNansenTiers(): Promise<NansenTierData> {
	const tiers: NansenTier[] = ['green', 'ice', 'north', 'star'];

	// Fetch all tiers in parallel
	const tierResults = await Promise.all(
		tiers.map(async (tier) => {
			const url = `${NANSEN_API_URL}?tier=${tier}&isEligible=true`;
			const response = await fetch(url);

			if (!response.ok) {
				console.error(`[Nansen Tiers] Failed to fetch tier ${tier}: ${response.status}`);
				return { tier, entries: [] as NansenLeaderboardEntry[] };
			}

			const entries: NansenLeaderboardEntry[] = await response.json();
			return { tier, entries };
		})
	);

	// Build the wallet tiers map (only EVM addresses)
	const walletTiers: NansenTierData['walletTiers'] = {};
	const tierCounts: Record<NansenTier, number> = {
		green: 0,
		ice: 0,
		north: 0,
		star: 0
	};

	for (const { tier, entries } of tierResults) {
		let evmCount = 0;
		for (const entry of entries) {
			// Only include entries with EVM addresses
			if (entry.evm_address) {
				const normalizedAddress = entry.evm_address.toLowerCase();
				// Higher tier overwrites lower tier if wallet appears in multiple
				const existing = walletTiers[normalizedAddress];
				if (!existing || NANSEN_TIERS[tier].level > NANSEN_TIERS[existing.tier].level) {
					walletTiers[normalizedAddress] = {
						tier,
						points: entry.points,
						rank: entry.rank
					};
				}
				evmCount++;
			}
		}
		tierCounts[tier] = evmCount;
	}

	console.log(
		`[Nansen Tiers] Fetched ${Object.keys(walletTiers).length} EVM wallets. ` +
			`Tiers: Green=${tierCounts.green}, Ice=${tierCounts.ice}, North=${tierCounts.north}, Star=${tierCounts.star}`
	);

	return {
		walletTiers,
		fetchedAt: Date.now(),
		tierCounts
	};
}

/**
 * Get Nansen tier data with 1-hour caching
 * This is the main function to use from other parts of the application
 */
export async function getNansenTierData(): Promise<NansenTierData> {
	return withCache(CACHE_KEYS.nansenTiers(), fetchNansenTiers, CACHE_TTL.LONG);
}

/**
 * Get tier for a specific wallet address
 * Returns null if wallet is not found in any tier
 */
export async function getWalletTier(
	address: string
): Promise<{ tier: NansenTier; points: number; rank: number } | null> {
	const data = await getNansenTierData();
	return data.walletTiers[address.toLowerCase()] || null;
}

/**
 * Get tiers for multiple wallet addresses
 * Returns a map of address -> tier info (only includes wallets that have a tier)
 */
export async function getWalletTiers(
	addresses: string[]
): Promise<Record<string, { tier: NansenTier; points: number; rank: number }>> {
	const data = await getNansenTierData();
	const result: Record<string, { tier: NansenTier; points: number; rank: number }> = {};

	for (const address of addresses) {
		const tierInfo = data.walletTiers[address.toLowerCase()];
		if (tierInfo) {
			result[address.toLowerCase()] = tierInfo;
		}
	}

	return result;
}
