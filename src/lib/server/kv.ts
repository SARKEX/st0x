import { createClient, type RedisClientType } from 'redis';
import { env } from '$env/dynamic/private';

let kvClient: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType | null> | null = null;

// Get or create the Redis client (lazy initialization)
export async function getKv(): Promise<RedisClientType | null> {
	// Return existing client if connected
	if (kvClient?.isReady) return kvClient;

	// Return existing connection attempt if in progress
	if (connectionPromise) return connectionPromise;

	const url = env.REDIS_URL;

	if (!url) {
		console.warn('Redis not configured. Using mock storage for development.');
		return null;
	}

	// Start connection
	connectionPromise = (async () => {
		try {
			kvClient = createClient({ url });
			kvClient.on('error', (err) => console.error('Redis Client Error', err));
			await kvClient.connect();
			return kvClient;
		} catch (err) {
			console.error('Failed to connect to Redis:', err);
			kvClient = null;
			connectionPromise = null;
			return null;
		}
	})();

	return connectionPromise;
}

// Helper functions that match @vercel/kv API for easier migration
export async function kvGet<T>(key: string): Promise<T | null> {
	const client = await getKv();
	if (!client) return null;

	const value = await client.get(key);
	if (!value) return null;

	try {
		return JSON.parse(value) as T;
	} catch {
		return value as unknown as T;
	}
}

export async function kvSet(key: string, value: unknown): Promise<void> {
	const client = await getKv();
	if (!client) return;

	await client.set(key, JSON.stringify(value));
}

export async function kvDel(key: string): Promise<void> {
	const client = await getKv();
	if (!client) return;

	await client.del(key);
}

// Key prefixes for organization
//
// Phase 1 (DEPR-02 D-04): The per-wallet points pipeline that wrote
// `monthlyPoints` / `monthlyPointsList` / `rewardsPool` / `rewardsPoolList`
// was deleted in DEPR-02. The keys + types are retained for legacy-data
// tolerance — existing KV entries are LEFT AS-IS (no backfill, no wipe).
//
// `excludedWallets` / `poolWallets` / `teamWallets` are NOT rewards-only —
// the orderbook excluded-wallet logic in src/lib/server/snapshots/generator.ts
// consumes them via `getRewardsExcludedWalletsSet()`. They MUST be retained.
export const KV_KEYS = {
	accessCode: (code: string) => `access_codes:${code.toUpperCase()}`,
	wallet: (address: string) => `wallets:${address.toLowerCase()}`,
	codeWallets: (code: string) => `code_wallets:${code.toUpperCase()}`,
	allCodes: () => 'access_codes:__all__',
	// Snapshot keys
	snapshotBlocks: () => 'snapshots:blocks', // List of all snapshot block records
	snapshotBlocksByDate: (date: string) => `snapshots:date:${date}`, // Blocks for a specific date (YYYY-MM-DD)
	// Monthly points keys (legacy data tolerance per D-04 — see comment above)
	monthlyPoints: (month: string) => `snapshots:points:${month}`, // Monthly points (YYYY-MM)
	monthlyPointsList: () => 'snapshots:points:__all__', // List of all months with data
	// Excluded wallets for rewards/orderbook filtering (KEPT — used by snapshot generator)
	excludedWallets: () => 'rewards:excluded_wallets', // List of wallet addresses excluded from TVL
	// Team wallets - excluded from TVL stats but still eligible for rewards
	teamWallets: () => 'rewards:team_wallets', // List of team wallet addresses
	// Pool wallets - excluded from rewards but counted as non-team TVL
	poolWallets: () => 'rewards:pool_wallets', // List of pool/AMM contract addresses
	// Rewards pool configuration (legacy data tolerance per D-04 — see comment above)
	rewardsPool: (month: string) => `rewards:pool:${month}`, // Rewards pool config (YYYY-MM)
	rewardsPoolList: () => 'rewards:pool:__all__' // List of all months with pool config
} as const;

// Types for snapshot block records
export interface SnapshotBlockRecord {
	blockNumber: number;
	timestamp: number;
	date: string; // YYYY-MM-DD
	generatedAt: string;
}

export interface DailySnapshotRecord {
	date: string;
	blocks: SnapshotBlockRecord[];
	generatedAt: string;
}

// Types for monthly points tracking.
// Phase 1 (DEPR-02 D-04): The writer (src/lib/server/snapshots/points.ts)
// was deleted; these types are retained for legacy-data tolerance.
// Points = 100 per $1 USD of holdings at each snapshot (legacy semantics).
export interface WalletTokenPoints {
	points: number; // Cumulative points from this token
	lastBalance: string; // Last recorded balance (for reference)
}

export interface WalletMonthlyPoints {
	// Per-token tracking
	tokens: {
		[tokenAddress: string]: WalletTokenPoints;
	};
	// Total points across all tokens
	totalPoints: number;
}

export interface MonthlyPointsData {
	month: string; // YYYY-MM format
	snapshotCount: number; // Total snapshots in this month
	blockNumbers: number[]; // List of block numbers included
	snapshotTotals?: { blockNumber: number; totalPoints: number; totalPointsFiltered: number }[]; // Per-snapshot total points (for projection); totalPoints includes all wallets, totalPointsFiltered excludes excluded wallets
	wallets: {
		[address: string]: WalletMonthlyPoints;
	};
	updatedAt: string;
}

// RocketBoost tier amounts for milestone bonuses
export interface RocketBoostTiers {
	tier25: number; // Bonus at 25% of target
	tier50: number; // Bonus at 50% of target
	tier75: number; // Bonus at 75% of target
	tier100: number; // Bonus at 100% of target
}

// Rewards pool configuration for each month
export interface RewardsPoolConfig {
	month: string; // YYYY-MM format
	poolAmount: number; // Total reward pool in USD
	rocketBoostAmounts: RocketBoostTiers; // Bonus amounts for each tier
	rocketBoostTvlTarget: number; // TVL target in USD (converts to points target)
	notes: string; // Optional admin notes
	updatedAt: string;
}

/**
 * Get excluded wallets as a lowercase Set for efficient lookup.
 * Used for filtering wallets from TVL/APY calculations.
 */
export async function getExcludedWalletsSet(): Promise<Set<string>> {
	const wallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
	return new Set(wallets.map((w) => w.toLowerCase()));
}

/**
 * Get team wallets as a lowercase Set for efficient lookup.
 * Team wallets are excluded from TVL stats but still eligible for rewards.
 */
export async function getTeamWalletsSet(): Promise<Set<string>> {
	const wallets = (await kvGet<string[]>(KV_KEYS.teamWallets())) || [];
	return new Set(wallets.map((w) => w.toLowerCase()));
}

/**
 * Get pool wallets as a lowercase Set for efficient lookup.
 * Pool wallets are excluded from rewards but counted as non-team TVL.
 */
export async function getPoolWalletsSet(): Promise<Set<string>> {
	const wallets = (await kvGet<string[]>(KV_KEYS.poolWallets())) || [];
	return new Set(wallets.map((w) => w.toLowerCase()));
}

/**
 * Get the union of excluded + pool wallets as a lowercase Set.
 * Both categories are excluded from rewards calculations (points, leaderboard, referrals).
 * Pool wallets differ from excluded wallets only in that they still count toward TVL.
 */
export async function getRewardsExcludedWalletsSet(): Promise<Set<string>> {
	const [excluded, pools] = await Promise.all([getExcludedWalletsSet(), getPoolWalletsSet()]);
	return new Set([...excluded, ...pools]);
}
