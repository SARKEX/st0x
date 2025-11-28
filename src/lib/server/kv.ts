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
export const KV_KEYS = {
	accessCode: (code: string) => `access_codes:${code.toUpperCase()}`,
	wallet: (address: string) => `wallets:${address.toLowerCase()}`,
	codeWallets: (code: string) => `code_wallets:${code.toUpperCase()}`,
	allCodes: () => 'access_codes:__all__',
	// Snapshot keys
	snapshotBlocks: () => 'snapshots:blocks', // List of all snapshot block records
	snapshotBlocksByDate: (date: string) => `snapshots:date:${date}`, // Blocks for a specific date (YYYY-MM-DD)
	// Monthly points keys
	monthlyPoints: (month: string) => `snapshots:points:${month}`, // Monthly points (YYYY-MM)
	monthlyPointsList: () => 'snapshots:points:__all__', // List of all months with data
	// Excluded wallets for rewards
	excludedWallets: () => 'rewards:excluded_wallets', // List of wallet addresses excluded from TVL
	// Rewards pool configuration
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

// Types for monthly points tracking
// Points = 100 per $1 USD of holdings at each snapshot
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
	wallets: {
		[address: string]: WalletMonthlyPoints;
	};
	updatedAt: string;
}

// Rewards pool configuration for each month
export interface RewardsPoolConfig {
	month: string; // YYYY-MM format
	poolAmount: number; // Total reward pool in USD
	kickerAmount: number; // Additional kicker reward if TVL target is met
	kickerTvlTarget: number; // TVL target in USD to trigger kicker
	kickerHit: boolean; // Whether the kicker was achieved
	notes: string; // Optional admin notes
	updatedAt: string;
}
